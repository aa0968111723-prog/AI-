import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "node:test";
import { SnapshotStore } from "../store.js";
import type { PersistedSnapshot, Task } from "../types.js";

const dirs: string[] = [];

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "scheduler-store-"));
  dirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function task(id: string): Task {
  return {
    id,
    channelId: 0,
    payload: id,
    status: "waiting",
    attempt: 0,
    maxAttempts: 3,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    enqueueSeq: 1,
  };
}

describe("SnapshotStore", () => {
  test("write_then_read_roundtrip", async () => {
    const store = new SnapshotStore(await tempDir());
    await store.save({
      version: 1,
      savedAt: "2026-09-28T00:00:00.000Z",
      nextEnqueueSeq: 4,
      tasks: [task("a")],
    });
    const loaded = await store.load();
    assert.equal(loaded.version, 1);
    assert.equal(loaded.nextEnqueueSeq, 4);
    assert.equal(loaded.tasks[0]?.id, "a");
  });

  test("missing_file_returns_empty_snapshot", async () => {
    const loaded = await new SnapshotStore(await tempDir()).load();
    assert.equal(loaded.version, 1);
    assert.equal(loaded.nextEnqueueSeq, 1);
    assert.deepEqual(loaded.tasks, []);
  });

  test("corrupt_snapshot_falls_back_to_valid_tmp", async () => {
    const dir = await tempDir();
    const store = new SnapshotStore(dir);
    await writeFile(store.snapshotPath, "{not-json", "utf8");
    const tmp: PersistedSnapshot = {
      version: 1,
      savedAt: "2026-09-28T00:00:00.000Z",
      nextEnqueueSeq: 8,
      tasks: [task("from-tmp")],
    };
    await writeFile(store.tempPath, `${JSON.stringify(tmp)}\n`, "utf8");
    const loaded = await store.load();
    assert.equal(loaded.nextEnqueueSeq, 8);
    assert.equal(loaded.tasks[0]?.id, "from-tmp");
  });

  test("atomic_write_replaces_snapshot_file", async () => {
    const dir = await tempDir();
    const store = new SnapshotStore(dir);
    await store.save({
      version: 1,
      savedAt: "2026-09-28T00:00:00.000Z",
      nextEnqueueSeq: 2,
      tasks: [task("first")],
    });
    await store.save({
      version: 1,
      savedAt: "2026-09-28T00:00:01.000Z",
      nextEnqueueSeq: 3,
      tasks: [task("second")],
    });
    const raw = JSON.parse(await readFile(store.snapshotPath, "utf8")) as PersistedSnapshot;
    assert.equal(raw.tasks[0]?.id, "second");
    assert.equal(raw.nextEnqueueSeq, 3);
  });
});
