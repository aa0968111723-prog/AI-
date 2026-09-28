import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { SNAPSHOT_VERSION } from "../constants.js";
import { SchedulerEngine } from "../engine.js";
import { SnapshotStore } from "../store.js";
import type { Task } from "../types.js";
import {
  GatedExecutor,
  createEngine,
  createTempDir,
  rmTempDir,
  waitFor,
} from "./helpers.js";

function task(
  partial: Partial<Task> & Pick<Task, "id" | "status" | "enqueueSeq">,
): Task {
  return {
    channelId: 0,
    payload: partial.id,
    attempt: 0,
    maxAttempts: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

describe("restart recovery", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rmTempDir(dir)));
  });

  async function startFrom(tasks: Task[], nextEnqueueSeq = 100) {
    const dataDir = await createTempDir();
    dirs.push(dataDir);
    await new SnapshotStore(dataDir).save({
      version: SNAPSHOT_VERSION,
      savedAt: "2026-01-01T00:00:00.000Z",
      nextEnqueueSeq,
      tasks,
    });
    const gate = new GatedExecutor();
    const { engine } = await createEngine(gate, { dataDir });
    await engine.start();
    return { engine, gate };
  }

  test("interrupted_running_goes_to_front_then_runs", async () => {
    const { engine, gate } = await startFrom([
      task({
        id: "run",
        status: "running",
        attempt: 1,
        enqueueSeq: 1,
        startedAt: "2026-01-01T00:00:01.000Z",
      }),
      task({ id: "w1", status: "waiting", enqueueSeq: 2 }),
      task({ id: "w2", status: "waiting", enqueueSeq: 3 }),
    ]);
    await waitFor(() => gate.starts[0] === "run");
    assert.equal(engine.getTask("run")?.status, "running");
    assert.equal(engine.getTask("run")?.attempt, 2);
    assert.deepEqual(
      engine.getChannel(0).waiting.map((item) => item.id),
      ["w1", "w2"],
    );
  });

  test("exhausted_running_becomes_failed_and_does_not_rerun", async () => {
    const { engine, gate } = await startFrom([
      task({
        id: "done",
        status: "running",
        attempt: 3,
        maxAttempts: 3,
        enqueueSeq: 1,
      }),
      task({ id: "next", status: "waiting", enqueueSeq: 2 }),
    ]);
    await waitFor(() => engine.getTask("next")?.status === "running");
    assert.equal(engine.getTask("done")?.status, "failed");
    assert.equal(gate.starts.includes("done"), false);
    assert.equal(gate.starts[0], "next");
  });

  test("terminals_are_not_rerun", async () => {
    const { engine, gate } = await startFrom([
      task({
        id: "ok",
        status: "succeeded",
        attempt: 1,
        enqueueSeq: 1,
        finishedAt: "2026-01-01T00:00:02.000Z",
      }),
      task({
        id: "bad",
        status: "failed",
        attempt: 3,
        enqueueSeq: 2,
        finishedAt: "2026-01-01T00:00:03.000Z",
      }),
      task({
        id: "no",
        status: "cancelled",
        attempt: 0,
        enqueueSeq: 3,
        finishedAt: "2026-01-01T00:00:04.000Z",
      }),
    ]);
    assert.deepEqual(gate.starts, []);
    assert.equal(engine.getTask("ok")?.status, "succeeded");
    assert.equal(engine.getTask("bad")?.status, "failed");
    assert.equal(engine.getTask("no")?.status, "cancelled");
    assert.equal(engine.snapshot().runningCount, 0);
  });

  test("full_waiting_plus_interrupted_running_recovers", async () => {
    const waiting = Array.from({ length: 10 }, (_, index) =>
      task({ id: `w${index}`, status: "waiting", enqueueSeq: index + 2 }),
    );
    const { engine, gate } = await startFrom([
      task({ id: "run", status: "running", attempt: 1, enqueueSeq: 1 }),
      ...waiting,
    ]);
    await waitFor(() => gate.starts[0] === "run");
    assert.equal(engine.getChannel(0).running?.id, "run");
    assert.equal(engine.getChannel(0).waitingCount, 10);
    assert.deepEqual(
      engine.getChannel(0).waiting.map((item) => item.id),
      waiting.map((item) => item.id),
    );
  });

  test("stop_then_start_requeues_running", async () => {
    const dataDir = await createTempDir();
    dirs.push(dataDir);
    const first = new GatedExecutor();
    const { engine } = await createEngine(first, { dataDir });
    await engine.start();
    await engine.enqueue("x", { channelId: 4, id: "live" });
    await waitFor(() => first.starts.includes("live"));
    await engine.stop();
    assert.equal(engine.getTask("live")?.status, "running");

    const second = new GatedExecutor();
    const restarted = new SchedulerEngine(second, { dataDir });
    await restarted.start();
    await waitFor(() => second.starts[0] === "live");
    assert.equal(restarted.getTask("live")?.attempt, 2);
  });
});
