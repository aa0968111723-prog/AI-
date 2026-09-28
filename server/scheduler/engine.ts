import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CHANNEL_COUNT,
  DEFAULT_MAX_ATTEMPTS,
  SNAPSHOT_VERSION,
  isChannelId,
} from "./constants.js";
import { ChannelQueue } from "./channel.js";
import {
  CancelRunningError,
  CannotCancelError,
  InvalidChannelError,
  QueueFullError,
  SchedulerError,
  SchedulerNotStartedError,
  TaskNotFoundError,
} from "./errors.js";
import { SnapshotStore } from "./store.js";
import type {
  ChannelId,
  ChannelSnapshot,
  EngineSnapshot,
  EnqueueOptions,
  PersistedSnapshot,
  SchedulerConfig,
  Task,
  TaskExecutor,
  TaskFilter,
} from "./types.js";

const DEFAULT_DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), "data");
const INTERRUPTED = "interrupted by restart";

function cloneTask(task: Task): Task {
  return structuredClone(task);
}

export class SchedulerEngine {
  private readonly executor: TaskExecutor;
  private readonly store: SnapshotStore;
  private readonly defaultMaxAttempts: number;
  private readonly clock: () => Date;
  private readonly idFactory: () => string;
  private readonly channels: ChannelQueue[];
  private readonly tasks = new Map<string, Task>();
  private readonly abortControllers = new Map<string, AbortController>();
  private readonly overflow = new Map<ChannelId, Task[]>();
  private nextEnqueueSeq = 1;
  private started = false;
  private generation = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(executor: TaskExecutor, config: SchedulerConfig = {}) {
    this.executor = executor;
    this.store = new SnapshotStore(config.dataDir ?? DEFAULT_DATA_DIR);
    this.defaultMaxAttempts = config.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
    this.clock = config.clock ?? (() => new Date());
    this.idFactory = config.idFactory ?? (() => randomUUID());
    this.channels = Array.from(
      { length: CHANNEL_COUNT },
      (_, index) => new ChannelQueue(index as ChannelId),
    );
  }

  async start(): Promise<void> {
    return this.serial(async () => {
      this.generation += 1;
      this.tasks.clear();
      this.abortControllers.clear();
      this.overflow.clear();
      const snapshot = await this.store.load();
      this.nextEnqueueSeq = snapshot.nextEnqueueSeq || 1;
      const fronts: Task[][] = Array.from({ length: CHANNEL_COUNT }, () => []);
      const waits: Task[][] = Array.from({ length: CHANNEL_COUNT }, () => []);
      const now = this.now();

      for (const incoming of snapshot.tasks) {
        const task = cloneTask(incoming);
        if (task.status === "running") {
          if (task.attempt >= task.maxAttempts) {
            task.status = "failed";
            task.finishedAt = now;
            task.updatedAt = now;
            task.lastError = task.lastError ?? INTERRUPTED;
          } else {
            task.status = "waiting";
            task.startedAt = undefined;
            task.updatedAt = now;
            task.lastError = task.lastError ?? INTERRUPTED;
            fronts[task.channelId].push(task);
          }
        } else if (task.status === "waiting") {
          waits[task.channelId].push(task);
        }
        this.tasks.set(task.id, task);
      }

      for (let index = 0; index < CHANNEL_COUNT; index++) {
        const channel = this.channels[index];
        while (channel.dequeueWaiting()) {
          /* reset */
        }
        channel.clearRunning();
        fronts[index].sort((a, b) => a.enqueueSeq - b.enqueueSeq);
        waits[index].sort((a, b) => a.enqueueSeq - b.enqueueSeq);
        const ordered = [...fronts[index], ...waits[index]];
        for (const task of ordered) {
          if (channel.canAcceptWaiting()) {
            channel.enqueueWaiting(task);
          } else {
            const parked = this.overflow.get(index as ChannelId) ?? [];
            parked.push(task);
            this.overflow.set(index as ChannelId, parked);
          }
        }
      }

      this.started = true;
      await this.persist();
      this.dispatchAll();
      this.flushOverflow();
    });
  }

  async stop(): Promise<void> {
    return this.serial(async () => {
      this.started = false;
      this.generation += 1;
      for (const controller of this.abortControllers.values()) {
        controller.abort();
      }
      this.abortControllers.clear();
      await this.persist();
    });
  }

  async enqueue(payload: unknown, options: EnqueueOptions): Promise<Task> {
    return this.serial(async () => {
      this.requireStarted();
      if (!isChannelId(options.channelId)) {
        throw new InvalidChannelError(options.channelId);
      }
      const maxAttempts = options.maxAttempts ?? this.defaultMaxAttempts;
      if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
        throw new SchedulerError(
          "INVALID_MAX_ATTEMPTS",
          "maxAttempts must be an integer >= 1",
        );
      }
      const channel = this.channels[options.channelId];
      if (!channel.canAcceptWaiting()) {
        throw new QueueFullError(options.channelId);
      }
      const id = options.id ?? this.idFactory();
      if (this.tasks.has(id)) {
        throw new SchedulerError("DUPLICATE_ID", `task id already exists: ${id}`);
      }
      const timestamp = this.now();
      const task: Task = {
        id,
        channelId: options.channelId,
        payload,
        status: "waiting",
        attempt: 0,
        maxAttempts,
        createdAt: timestamp,
        updatedAt: timestamp,
        enqueueSeq: this.nextEnqueueSeq++,
      };
      this.tasks.set(id, task);
      channel.enqueueWaiting(task);
      await this.persist();
      this.dispatchChannel(options.channelId);
      return cloneTask(task);
    });
  }

  async cancel(taskId: string): Promise<Task> {
    return this.serial(async () => {
      this.requireStarted();
      const task = this.tasks.get(taskId);
      if (!task) {
        throw new TaskNotFoundError(taskId);
      }
      if (task.status === "running") {
        throw new CancelRunningError(taskId);
      }
      if (task.status !== "waiting") {
        throw new CannotCancelError(taskId, task.status);
      }
      const removed = this.channels[task.channelId].cancelWaiting(taskId);
      if (!removed) {
        throw new TaskNotFoundError(taskId);
      }
      const timestamp = this.now();
      task.status = "cancelled";
      task.finishedAt = timestamp;
      task.updatedAt = timestamp;
      await this.persist();
      return cloneTask(task);
    });
  }

  getTask(taskId: string): Task | undefined {
    const task = this.tasks.get(taskId);
    return task ? cloneTask(task) : undefined;
  }

  listTasks(filter: TaskFilter = {}): Task[] {
    const items: Task[] = [];
    for (const task of this.tasks.values()) {
      if (filter.channelId !== undefined && task.channelId !== filter.channelId) {
        continue;
      }
      if (filter.status !== undefined && task.status !== filter.status) {
        continue;
      }
      items.push(cloneTask(task));
    }
    items.sort((left, right) => left.enqueueSeq - right.enqueueSeq);
    return items;
  }

  getChannel(channelId: ChannelId): ChannelSnapshot {
    if (!isChannelId(channelId)) {
      throw new InvalidChannelError(channelId);
    }
    return this.channels[channelId].snapshot();
  }

  snapshot(): EngineSnapshot {
    const channels = this.channels.map((channel) => channel.snapshot());
    return {
      version: SNAPSHOT_VERSION,
      savedAt: this.now(),
      nextEnqueueSeq: this.nextEnqueueSeq,
      tasks: [...this.tasks.values()].map(cloneTask),
      runningCount: channels.reduce((sum, channel) => sum + channel.runningCount, 0),
      waitingCount: channels.reduce((sum, channel) => sum + channel.waitingCount, 0),
      channels,
    };
  }

  private requireStarted(): void {
    if (!this.started) {
      throw new SchedulerNotStartedError();
    }
  }

  private now(): string {
    return this.clock().toISOString();
  }

  private async persist(): Promise<void> {
    const snapshot: PersistedSnapshot = {
      version: SNAPSHOT_VERSION,
      savedAt: this.now(),
      nextEnqueueSeq: this.nextEnqueueSeq,
      tasks: [...this.tasks.values()].map(cloneTask),
    };
    await this.store.save(snapshot);
  }

  private dispatchAll(): void {
    for (let index = 0; index < CHANNEL_COUNT; index++) {
      this.dispatchChannel(index as ChannelId);
    }
  }

  private dispatchChannel(channelId: ChannelId): void {
    if (!this.started) {
      return;
    }
    const channel = this.channels[channelId];
    if (channel.running) {
      return;
    }
    const next = channel.dequeueWaiting();
    if (!next) {
      return;
    }
    this.launch(channel, next);
  }

  private launch(channel: ChannelQueue, task: Task): void {
    const timestamp = this.now();
    task.status = "running";
    task.attempt += 1;
    task.startedAt = timestamp;
    task.finishedAt = undefined;
    task.updatedAt = timestamp;
    channel.setRunning(task);
    const generation = this.generation;
    const controller = new AbortController();
    this.abortControllers.set(task.id, controller);
    void this.persist().then(() => {
      void this.executor.execute(cloneTask(task), controller.signal).then(
        () => this.finish(generation, task.id, null),
        (error) => this.finish(generation, task.id, error),
      );
    });
  }

  private flushOverflow(): void {
    for (const [channelId, parked] of this.overflow) {
      const channel = this.channels[channelId];
      while (parked.length > 0 && channel.canAcceptWaiting()) {
        const task = parked.shift();
        if (task) {
          channel.enqueueWaiting(task);
        }
      }
      if (parked.length === 0) {
        this.overflow.delete(channelId);
      }
    }
  }

  private async finish(
    generation: number,
    taskId: string,
    error: unknown,
  ): Promise<void> {
    await this.serial(async () => {
      this.abortControllers.delete(taskId);
      if (generation !== this.generation || !this.started) {
        return;
      }
      const task = this.tasks.get(taskId);
      if (!task || task.status !== "running") {
        return;
      }
      const channel = this.channels[task.channelId];
      if (channel.running?.id !== taskId) {
        return;
      }
      channel.clearRunning();
      const timestamp = this.now();
      task.updatedAt = timestamp;
      if (error == null) {
        task.status = "succeeded";
        task.finishedAt = timestamp;
        task.lastError = undefined;
      } else {
        task.lastError = error instanceof Error ? error.message : String(error);
        if (task.attempt < task.maxAttempts) {
          task.status = "waiting";
          task.startedAt = undefined;
          task.finishedAt = undefined;
          const next = channel.dequeueWaiting();
          channel.enqueueWaiting(task);
          if (next) {
            this.launch(channel, next);
            return;
          }
        } else {
          task.status = "failed";
          task.finishedAt = timestamp;
        }
      }
      await this.persist();
      this.dispatchChannel(task.channelId);
    });
  }

  private async serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}
