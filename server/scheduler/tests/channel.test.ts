import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ChannelQueue } from "../channel.js";
import { InvalidChannelError, QueueFullError } from "../errors.js";
import type { ChannelId, Task } from "../types.js";

function makeTask(id: string, enqueueSeq: number, channelId: ChannelId = 0): Task {
  return {
    id,
    channelId,
    payload: id,
    status: "waiting",
    attempt: 0,
    maxAttempts: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    enqueueSeq,
  };
}

describe("ChannelQueue", () => {
  test("rejects invalid channel id", () => {
    assert.throws(() => new ChannelQueue(10 as ChannelId), InvalidChannelError);
  });

  test("enqueue_is_fifo_within_channel", () => {
    const channel = new ChannelQueue(0);
    channel.enqueueWaiting(makeTask("t1", 1));
    channel.enqueueWaiting(makeTask("t2", 2));
    channel.enqueueWaiting(makeTask("t3", 3));
    assert.equal(channel.dequeueWaiting()?.id, "t1");
    assert.equal(channel.dequeueWaiting()?.id, "t2");
    assert.equal(channel.dequeueWaiting()?.id, "t3");
  });

  test("running_does_not_count_as_waiting", () => {
    const channel = new ChannelQueue(0);
    channel.setRunning(makeTask("r", 1));
    for (let i = 0; i < 10; i += 1) {
      channel.enqueueWaiting(makeTask(`w${i}`, i + 2));
    }
    assert.equal(channel.runningCount, 1);
    assert.equal(channel.waitingCount, 10);
    assert.equal(channel.canAcceptWaiting(), false);
    assert.throws(() => channel.enqueueWaiting(makeTask("overflow", 99)), QueueFullError);
  });

  test("cancel_waiting_removes_and_preserves_order", () => {
    const channel = new ChannelQueue(0);
    channel.enqueueWaiting(makeTask("t1", 1));
    channel.enqueueWaiting(makeTask("t2", 2));
    channel.enqueueWaiting(makeTask("t3", 3));
    assert.equal(channel.cancelWaiting("t2")?.id, "t2");
    assert.deepEqual(channel.waiting.map((task) => task.id), ["t1", "t3"]);
  });

  test("cancel_missing_returns_undefined", () => {
    const channel = new ChannelQueue(0);
    assert.equal(channel.cancelWaiting("missing"), undefined);
  });

  test("snapshot_returns_copies", () => {
    const channel = new ChannelQueue(1);
    const task = makeTask("t1", 1, 1);
    channel.enqueueWaiting(task);
    const snap = channel.snapshot();
    snap.waiting[0]!.id = "mutated";
    assert.equal(channel.waiting[0]?.id, "t1");
  });
});
