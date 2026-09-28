import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  CancelRunningError,
  InvalidChannelError,
  QueueFullError,
  SchedulerNotStartedError,
  TaskNotFoundError,
} from "../errors.js";
import {
  CountingFailExecutor,
  GatedExecutor,
  createEngine,
  rmTempDir,
  waitFor,
} from "./helpers.js";

describe("SchedulerEngine", () => {
  test("start_required_before_enqueue", async () => {
    const { engine, dataDir } = await createEngine(new GatedExecutor());
    try {
      await assert.rejects(
        engine.enqueue({ n: 1 }, { channelId: 0 }),
        SchedulerNotStartedError,
      );
    } finally {
      await rmTempDir(dataDir);
    }
  });

  test("enqueue_invalid_channel", async () => {
    const { engine, dataDir } = await createEngine(new GatedExecutor());
    try {
      await engine.start();
      await assert.rejects(
        engine.enqueue({ n: 1 }, { channelId: 10 as never }),
        InvalidChannelError,
      );
    } finally {
      await engine.stop();
      await rmTempDir(dataDir);
    }
  });

  test("idle_enqueue_becomes_running", async () => {
    const { engine, dataDir } = await createEngine(new GatedExecutor());
    try {
      await engine.start();
      const task = await engine.enqueue({ n: 1 }, { channelId: 0, id: "a" });
      await waitFor(() => engine.getTask("a")?.status === "running");
      assert.equal(task.id, "a");
      assert.equal(engine.getChannel(0).runningCount, 1);
      assert.equal(engine.getChannel(0).waitingCount, 0);
    } finally {
      await engine.stop();
      await rmTempDir(dataDir);
    }
  });

  test("second_on_busy_channel_is_waiting", async () => {
    const { engine, dataDir } = await createEngine(new GatedExecutor());
    try {
      await engine.start();
      await engine.enqueue({ n: 1 }, { channelId: 0, id: "a" });
      const second = await engine.enqueue({ n: 2 }, { channelId: 0, id: "b" });
      assert.equal(second.status, "waiting");
      assert.equal(engine.getChannel(0).waitingCount, 1);
    } finally {
      await engine.stop();
      await rmTempDir(dataDir);
    }
  });

  test("ten_channels_run_in_parallel", async () => {
    const { engine, dataDir } = await createEngine(new GatedExecutor());
    try {
      await engine.start();
      for (let channelId = 0; channelId < 10; channelId += 1) {
        await engine.enqueue({ channelId }, { channelId: channelId as never });
      }
      assert.equal(engine.snapshot().runningCount, 10);
      assert.equal(engine.snapshot().waitingCount, 0);
    } finally {
      await engine.stop();
      await rmTempDir(dataDir);
    }
  });

  test("waiting_cap_is_per_channel", async () => {
    const { engine, dataDir } = await createEngine(new GatedExecutor());
    try {
      await engine.start();
      await engine.enqueue({ n: 0 }, { channelId: 0, id: "run" });
      for (let i = 0; i < 10; i += 1) {
        await engine.enqueue({ i }, { channelId: 0, id: `w${i}` });
      }
      await assert.rejects(
        engine.enqueue({ x: 1 }, { channelId: 0, id: "overflow" }),
        QueueFullError,
      );
      await engine.enqueue({ x: 2 }, { channelId: 1, id: "other" });
      await waitFor(() => engine.getTask("other")?.status === "running");
    } finally {
      await engine.stop();
      await rmTempDir(dataDir);
    }
  });

  test("cancel_waiting_ok_and_cancel_running_throws", async () => {
    const { engine, dataDir } = await createEngine(new GatedExecutor());
    try {
      await engine.start();
      await engine.enqueue({ n: 1 }, { channelId: 0, id: "run" });
      await engine.enqueue({ n: 2 }, { channelId: 0, id: "wait" });
      const cancelled = await engine.cancel("wait");
      assert.equal(cancelled.status, "cancelled");
      await assert.rejects(engine.cancel("run"), CancelRunningError);
      await assert.rejects(engine.cancel("missing"), TaskNotFoundError);
    } finally {
      await engine.stop();
      await rmTempDir(dataDir);
    }
  });

  test("fail_retries_to_tail_then_succeeds", async () => {
    const executor = new GatedExecutor();
    const { engine, dataDir } = await createEngine(executor);
    try {
      await engine.start();
      await engine.enqueue({ n: 1 }, { channelId: 0, id: "a", maxAttempts: 3 });
      await engine.enqueue({ n: 2 }, { channelId: 0, id: "b" });
      await waitFor(() => executor.starts.includes("a"));
      executor.fail("a");
      await waitFor(() => engine.getTask("b")?.status === "running");
      assert.equal(engine.getTask("a")?.status, "waiting");
      assert.deepEqual(
        engine.getChannel(0).waiting.map((task) => task.id),
        ["a"],
      );
      executor.succeed("b");
      await waitFor(() => engine.getTask("a")?.status === "running");
      executor.succeed("a");
      await waitFor(() => engine.getTask("a")?.status === "succeeded");
      assert.equal(engine.getTask("a")?.attempt, 2);
    } finally {
      await engine.stop();
      await rmTempDir(dataDir);
    }
  });

  test("fail_exhausted_becomes_failed", async () => {
    const { engine, dataDir } = await createEngine(new CountingFailExecutor(2));
    try {
      await engine.start();
      await engine.enqueue({ n: 1 }, { channelId: 0, id: "x", maxAttempts: 2 });
      await waitFor(() => engine.getTask("x")?.status === "failed");
      assert.equal(engine.getTask("x")?.attempt, 2);
      assert.ok(engine.getTask("x")?.lastError);
    } finally {
      await engine.stop();
      await rmTempDir(dataDir);
    }
  });

  test("stop_then_enqueue_throws", async () => {
    const { engine, dataDir } = await createEngine(new GatedExecutor());
    try {
      await engine.start();
      await engine.stop();
      await assert.rejects(
        engine.enqueue({ n: 1 }, { channelId: 0 }),
        SchedulerNotStartedError,
      );
    } finally {
      await rmTempDir(dataDir);
    }
  });
});
