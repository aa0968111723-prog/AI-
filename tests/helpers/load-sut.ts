/**
 * Prefer the product SchedulerEngine when server/scheduler is present.
 * Otherwise use the reference engine so this branch stays runnable.
 */

import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  ReferenceSchedulerEngine,
  type EngineSnapshot,
} from "./reference-engine.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

const PRODUCT_CANDIDATES = [
  "server/scheduler/index.ts",
  "server/scheduler/engine.ts",
  "server/src/scheduler/index.ts",
];

export interface TestScheduler {
  enqueue(channelId: number, payload: unknown, opts?: { id?: string; maxAttempts?: number }): string;
  dispatchAllAtomic(): string[];
  succeed(taskId: string): void;
  fail(taskId: string, error?: string): void;
  snapshot(): EngineSnapshot;
  persist(path: string): void;
  injectDispatchFailureAfter?(n: number): void;
  source: "product" | "reference";
}

export function productSchedulerPresent(): boolean {
  return PRODUCT_CANDIDATES.some((rel) => existsSync(resolve(repoRoot, rel)));
}

export async function loadScheduler(): Promise<{
  engine: TestScheduler;
  restore: (path: string) => TestScheduler;
  source: "product" | "reference";
}> {
  if (productSchedulerPresent()) {
    for (const rel of PRODUCT_CANDIDATES) {
      const abs = resolve(repoRoot, rel);
      if (!existsSync(abs)) continue;
      try {
        const mod = await import(pathToFileURL(abs).href);
        const Ctor = mod.SchedulerEngine ?? mod.default;
        if (typeof Ctor !== "function") continue;
        const raw = new Ctor();
        if (typeof raw.start === "function") raw.start();
        return {
          source: "product",
          engine: wrapProduct(raw),
          restore: (path: string) => {
            if (typeof Ctor.restore === "function") {
              const restored = Ctor.restore(path);
              if (typeof restored.start === "function") restored.start();
              return wrapProduct(restored);
            }
            return wrapReference(ReferenceSchedulerEngine.restore(path));
          },
        };
      } catch {
        // keep probing
      }
    }
  }
  const ref = new ReferenceSchedulerEngine();
  ref.start();
  return {
    source: "reference",
    engine: wrapReference(ref),
    restore: (path: string) => wrapReference(ReferenceSchedulerEngine.restore(path)),
  };
}

function wrapReference(ref: ReferenceSchedulerEngine): TestScheduler {
  return {
    source: "reference",
    enqueue: (channelId, payload, opts) => ref.enqueue(channelId, payload, opts),
    dispatchAllAtomic: () => ref.dispatchAllAtomic(),
    succeed: (id) => ref.succeed(id),
    fail: (id, error) => ref.fail(id, error),
    snapshot: () => ref.snapshot(),
    persist: (path) => ref.persist(path),
    injectDispatchFailureAfter: (n) => ref.injectDispatchFailureAfter(n),
  };
}

function wrapProduct(raw: any): TestScheduler {
  return {
    source: "product",
    enqueue(channelId, payload, opts) {
      if (typeof raw.enqueue === "function") {
        const result = raw.enqueue({ channelId, payload, ...opts });
        return typeof result === "string" ? result : result?.id ?? String(result);
      }
      throw new Error("product SchedulerEngine.enqueue missing");
    },
    dispatchAllAtomic() {
      if (typeof raw.dispatchAllAtomic === "function") return raw.dispatchAllAtomic();
      if (typeof raw.dispatchAll === "function") return raw.dispatchAll();
      throw new Error("product SchedulerEngine.dispatchAllAtomic missing");
    },
    succeed(taskId) {
      if (typeof raw.succeed === "function") return raw.succeed(taskId);
      if (typeof raw.complete === "function") return raw.complete(taskId);
      if (typeof raw.onSuccess === "function") return raw.onSuccess(taskId);
      throw new Error("product SchedulerEngine.succeed missing");
    },
    fail(taskId, error) {
      if (typeof raw.fail === "function") return raw.fail(taskId, error);
      if (typeof raw.onFailure === "function") return raw.onFailure(taskId, error);
      throw new Error("product SchedulerEngine.fail missing");
    },
    snapshot() {
      if (typeof raw.snapshot === "function") return raw.snapshot();
      if (typeof raw.getSnapshot === "function") return raw.getSnapshot();
      throw new Error("product SchedulerEngine.snapshot missing");
    },
    persist(path) {
      if (typeof raw.persist === "function") return raw.persist(path);
      if (typeof raw.save === "function") return raw.save(path);
      throw new Error("product SchedulerEngine.persist missing");
    },
    injectDispatchFailureAfter:
      typeof raw.injectDispatchFailureAfter === "function"
        ? (n) => raw.injectDispatchFailureAfter(n)
        : undefined,
  };
}
