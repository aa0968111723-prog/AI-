import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SchedulerEngine } from "../engine.js";
import type { SchedulerConfig, Task, TaskExecutor } from "../types.js";

export interface Deferred<T = void> {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export async function createTempDir(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "ai-scheduler-"));
}

export async function rmTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export function sequentialIdFactory(prefix = "t"): () => string {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}${n}`;
  };
}

export async function waitFor(
  predicate: () => boolean,
  timeoutMs = 2000,
  intervalMs = 5,
): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("waitFor timed out");
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

export class GatedExecutor implements TaskExecutor {
  readonly starts: string[] = [];
  readonly attempts = new Map<string, number>();
  private readonly gates = new Map<string, Deferred>();

  gate(id: string): Deferred {
    const existing = this.gates.get(id);
    if (existing) {
      return existing;
    }
    const created = deferred();
    this.gates.set(id, created);
    return created;
  }

  async execute(task: Task): Promise<void> {
    this.starts.push(task.id);
    this.attempts.set(task.id, (this.attempts.get(task.id) ?? 0) + 1);
    try {
      await this.gate(task.id).promise;
    } finally {
      this.gates.delete(task.id);
    }
  }

  succeed(id: string): void {
    this.gate(id).resolve();
  }

  fail(id: string, message = "boom"): void {
    this.gate(id).reject(new Error(message));
  }
}

export class CountingFailExecutor implements TaskExecutor {
  failures = 0;
  constructor(
    private readonly failTimes: number,
    private readonly errorMessage = "boom",
  ) {}

  async execute(): Promise<void> {
    this.failures += 1;
    if (this.failures <= this.failTimes) {
      throw new Error(`${this.errorMessage}-${this.failures}`);
    }
  }
}

export class ImmediateExecutor implements TaskExecutor {
  async execute(): Promise<void> {}
}

export async function createEngine(
  executor: TaskExecutor,
  overrides: SchedulerConfig = {},
): Promise<{ engine: SchedulerEngine; dataDir: string }> {
  const dataDir = overrides.dataDir ?? (await createTempDir());
  const engine = new SchedulerEngine(executor, {
    idFactory: sequentialIdFactory(),
    ...overrides,
    dataDir,
  });
  return { engine, dataDir };
}
