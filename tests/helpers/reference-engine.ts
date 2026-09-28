/**
 * Reference implementation of the @ai/scheduler contract.
 * Used only when server/scheduler/engine.ts is not present.
 * Keep behavior aligned with feat/scheduler-engine constants + types.
 */

import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

export const CHANNEL_COUNT = 10;
export const MIN_CHANNEL_ID = 0;
export const MAX_CHANNEL_ID = CHANNEL_COUNT - 1;
export const MAX_RUNNING_PER_CHANNEL = 1;
export const MAX_WAITING_PER_CHANNEL = 10;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const SNAPSHOT_VERSION = 1 as const;
export const SNAPSHOT_FILENAME = "snapshot.json";

export type ChannelId = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export type TaskStatus =
  | "waiting"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface Task {
  id: string;
  channelId: ChannelId;
  payload: unknown;
  status: TaskStatus;
  attempt: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  lastError?: string;
  enqueueSeq: number;
}

export interface ChannelSnapshot {
  channelId: ChannelId;
  running: Task | null;
  waiting: Task[];
  runningCount: number;
  waitingCount: number;
}

export interface EngineSnapshot {
  version: 1;
  savedAt: string;
  nextEnqueueSeq: number;
  tasks: Task[];
  runningCount: number;
  waitingCount: number;
  channels: ChannelSnapshot[];
}

export interface PersistedSnapshot {
  version: 1;
  savedAt: string;
  nextEnqueueSeq: number;
  tasks: Task[];
}

export class SchedulerError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "SchedulerError";
    this.code = code;
  }
}
export class InvalidChannelError extends SchedulerError {
  constructor(channelId: unknown) {
    super("INVALID_CHANNEL", `channelId ${String(channelId)} is not an integer in 0..9`);
    this.name = "InvalidChannelError";
  }
}
export class QueueFullError extends SchedulerError {
  channelId: number;
  constructor(channelId: number) {
    super("QUEUE_FULL", `channel ${channelId} already has ${MAX_WAITING_PER_CHANNEL} waiting tasks`);
    this.name = "QueueFullError";
    this.channelId = channelId;
  }
}
export class TaskNotFoundError extends SchedulerError {
  constructor(taskId: string) {
    super("TASK_NOT_FOUND", `task ${taskId} not found`);
    this.name = "TaskNotFoundError";
  }
}
export class SchedulerNotStartedError extends SchedulerError {
  constructor() {
    super("NOT_STARTED", "SchedulerEngine.start() has not been called");
    this.name = "SchedulerNotStartedError";
  }
}
export class CorruptSnapshotError extends SchedulerError {
  constructor(message: string) {
    super("CORRUPT_SNAPSHOT", message);
    this.name = "CorruptSnapshotError";
  }
}

export function isChannelId(value: unknown): value is ChannelId {
  return typeof value === "number" && Number.isInteger(value) && value >= MIN_CHANNEL_ID && value <= MAX_CHANNEL_ID;
}

const SECRET_PATTERNS = [
  /sk-[A-Za-z0-9_\-]{8,}/g,
  /AIza[A-Za-z0-9_\-]{8,}/g,
  /gsk_[A-Za-z0-9_\-]{8,}/g,
  /xai-[A-Za-z0-9_\-]{8,}/g,
  /fal_[A-Za-z0-9_\-]{8,}/g,
  /(?i)bearer\s+[A-Za-z0-9_\-\.]+/g,
];

export function redactSecrets<T>(value: T): T {
  if (typeof value === "string") {
    let out = value;
    for (const pat of SECRET_PATTERNS) out = out.replace(pat, "***");
    for (const name of [
      "XAI_API_KEY",
      "OPENAI_API_KEY",
      "JWT_SECRET",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "GEMINI_API_KEY",
    ]) {
      const envVal = process.env[name];
      if (envVal && envVal.length >= 8 && out.includes(envVal)) {
        out = out.split(envVal).join("***");
      }
    }
    return out as T;
  }
  if (Array.isArray(value)) return value.map((v) => redactSecrets(v)) as T;
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) next[k] = redactSecrets(v);
    return next as T;
  }
  return value;
}

function nowIso(clock: () => Date): string {
  return clock().toISOString();
}

export class ReferenceSchedulerEngine {
  private started = false;
  private nextEnqueueSeq = 1;
  private tasks = new Map<string, Task>();
  private waiting: Task[][] = Array.from({ length: CHANNEL_COUNT }, () => []);
  private running: Array<Task | null> = Array.from({ length: CHANNEL_COUNT }, () => null);
  private clock: () => Date;
  private idFactory: () => string;
  private failDispatchAfter: number | null = null;

  constructor(opts: { clock?: () => Date; idFactory?: () => string } = {}) {
    this.clock = opts.clock ?? (() => new Date());
    this.idFactory = opts.idFactory ?? (() => randomUUID());
  }

  start(): void {
    this.started = true;
  }

  stop(): void {
    this.started = false;
  }

  /** Test hook: next dispatchAllAtomic rolls back after N assignments. */
  injectDispatchFailureAfter(n: number): void {
    this.failDispatchAfter = n;
  }

  enqueue(channelId: number, payload: unknown, opts: { id?: string; maxAttempts?: number } = {}): string {
    if (!this.started) throw new SchedulerNotStartedError();
    if (!isChannelId(channelId)) throw new InvalidChannelError(channelId);
    if (this.waiting[channelId].length >= MAX_WAITING_PER_CHANNEL) {
      throw new QueueFullError(channelId);
    }
    const ts = nowIso(this.clock);
    const task: Task = {
      id: opts.id ?? this.idFactory(),
      channelId,
      payload: redactSecrets(payload),
      status: "waiting",
      attempt: 0,
      maxAttempts: opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      createdAt: ts,
      updatedAt: ts,
      enqueueSeq: this.nextEnqueueSeq++,
    };
    this.tasks.set(task.id, task);
    this.waiting[channelId].push(task);
    return task.id;
  }

  dispatchAllAtomic(): string[] {
    if (!this.started) throw new SchedulerNotStartedError();
    const planned: Task[] = [];
    for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
      if (!this.running[ch] && this.waiting[ch].length > 0) {
        planned.push(this.waiting[ch][0]);
      }
    }
    const assigned: Task[] = [];
    const ts = nowIso(this.clock);
    try {
      for (const task of planned) {
        if (this.failDispatchAfter !== null && assigned.length >= this.failDispatchAfter) {
          throw new Error("injected atomic dispatch failure");
        }
        const q = this.waiting[task.channelId];
        if (q[0]?.id !== task.id) throw new Error("FIFO head changed during dispatch");
        q.shift();
        task.status = "running";
        task.attempt += 1;
        task.startedAt = ts;
        task.updatedAt = ts;
        this.running[task.channelId] = task;
        assigned.push(task);
      }
      this.failDispatchAfter = null;
      return assigned.map((t) => t.id);
    } catch (err) {
      for (const task of assigned) {
        task.status = "waiting";
        task.attempt = Math.max(0, task.attempt - 1);
        task.startedAt = undefined;
        task.updatedAt = nowIso(this.clock);
        this.running[task.channelId] = null;
        this.waiting[task.channelId].unshift(task);
      }
      this.failDispatchAfter = null;
      throw err;
    }
  }

  succeed(taskId: string): void {
    const task = this.requireRunning(taskId);
    const ts = nowIso(this.clock);
    task.status = "succeeded";
    task.finishedAt = ts;
    task.updatedAt = ts;
    this.running[task.channelId] = null;
  }

  fail(taskId: string, error = "failed"): void {
    const task = this.requireRunning(taskId);
    const ts = nowIso(this.clock);
    task.lastError = redactSecrets(error);
    task.updatedAt = ts;
    this.running[task.channelId] = null;
    if (task.attempt >= task.maxAttempts) {
      task.status = "failed";
      task.finishedAt = ts;
    } else {
      task.status = "waiting";
      this.waiting[task.channelId].unshift(task);
    }
  }

  snapshot(): EngineSnapshot {
    const channels: ChannelSnapshot[] = [];
    let runningCount = 0;
    let waitingCount = 0;
    for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
      const running = this.running[ch];
      const waiting = [...this.waiting[ch]];
      if (running) runningCount += 1;
      waitingCount += waiting.length;
      channels.push({
        channelId: ch as ChannelId,
        running,
        waiting,
        runningCount: running ? 1 : 0,
        waitingCount: waiting.length,
      });
    }
    return redactSecrets({
      version: SNAPSHOT_VERSION,
      savedAt: nowIso(this.clock),
      nextEnqueueSeq: this.nextEnqueueSeq,
      tasks: [...this.tasks.values()],
      runningCount,
      waitingCount,
      channels,
    });
  }

  persist(path: string): void {
    const snap = this.snapshot();
    const persisted: PersistedSnapshot = {
      version: SNAPSHOT_VERSION,
      savedAt: snap.savedAt,
      nextEnqueueSeq: snap.nextEnqueueSeq,
      tasks: snap.tasks,
    };
    writeFileSync(path, JSON.stringify(persisted, null, 2), "utf8");
  }

  static restore(path: string, opts: { clock?: () => Date; idFactory?: () => string } = {}): ReferenceSchedulerEngine {
    let raw: string;
    try {
      raw = readFileSync(path, "utf8");
    } catch (err) {
      throw new CorruptSnapshotError(`cannot read snapshot: ${(err as Error).message}`);
    }
    let data: PersistedSnapshot;
    try {
      data = JSON.parse(raw) as PersistedSnapshot;
    } catch {
      throw new CorruptSnapshotError("snapshot is not valid JSON");
    }
    if (!data || data.version !== 1 || !Array.isArray(data.tasks)) {
      throw new CorruptSnapshotError("snapshot missing version=1 tasks[]");
    }
    const engine = new ReferenceSchedulerEngine(opts);
    engine.started = true;
    engine.nextEnqueueSeq = Number(data.nextEnqueueSeq) || 1;
    const waitingBuckets: Task[][] = Array.from({ length: CHANNEL_COUNT }, () => []);
    for (const incoming of data.tasks) {
      if (!isChannelId(incoming.channelId)) continue;
      const task: Task = {
        ...incoming,
        payload: redactSecrets(incoming.payload),
        lastError: incoming.lastError ? redactSecrets(incoming.lastError) : undefined,
      };
      engine.tasks.set(task.id, task);
      if (task.status === "running") {
        // crash recovery: at-least-once — running returns to channel head
        task.status = "waiting";
        task.updatedAt = nowIso(engine.clock);
        waitingBuckets[task.channelId].push(task);
      } else if (task.status === "waiting") {
        waitingBuckets[task.channelId].push(task);
      }
    }
    for (let ch = 0; ch < CHANNEL_COUNT; ch++) {
      waitingBuckets[ch].sort((a, b) => a.enqueueSeq - b.enqueueSeq);
      engine.waiting[ch] = waitingBuckets[ch];
    }
    return engine;
  }

  private requireRunning(taskId: string): Task {
    const task = this.tasks.get(taskId);
    if (!task) throw new TaskNotFoundError(taskId);
    if (task.status !== "running") {
      throw new SchedulerError("NOT_RUNNING", `task ${taskId} is ${task.status}`);
    }
    return task;
  }
}
