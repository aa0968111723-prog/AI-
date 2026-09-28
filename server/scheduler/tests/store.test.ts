import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { SnapshotStore } from "../store.js";
import type { PersistedSnapshot, Task } from "../types.js";
import { createTempDir, rmTempDir } from "./helpers.js";

const dirs: string[] = [];

async function tempStore(): Promise<{ store: SnapshotStore; dir: string }> {
  const dir = await createTempDir();
  dirs.push(dir);
  return { store: new SnapshotStore(dir), dir };
}

function sampleSnapshot(tasks: Task[] = []): PersistedSnapshot {
  return {
    version: 1,
    savedAt: "2026-09-28T00:00:00.000Z",
    nextEnqueueSeq: tasks.length + 1,
    tasks,
  };
}

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rmTempDir(dir)));
});

describe("SnapshotStore", () => {
  it("write_then_read_roundtrip", async () => {
    const { store } = await tempStore();
    const snapshot = sampleSnapshot([
      {
        id: "t1",
        channelId: 0,
        payload: { n: 1 },
        status: "waiting",
        attempt: 0,
        maxAttempts: 3,
        createdAt: "2026-09-28T00:00:00.000Z",
        updatedAt: "2026-09-28T00:00:00.000Z",
        enqueueSeq: 1,
      },
    ]);
    await store.save(snapshot);
    const loaded = await store.load();
    assert.equal(loaded.version, 1);
    assert.equal(loaded.nextEnqueueSeq, snapshot.nextEnqueueSeq);
    assert.equal(loaded.tasks.length, 1);
    assert.equal(loaded.tasks[0]?.id, "t1");
  });

  it("missing_file_returns_empty_snapshot", async () => {
    const { store } = await tempStore();
    const loaded = await store.load();
    assert.equal(loaded.tasks.length, 0);
    assert.equal(loaded.nextEnqueueSeq, 1);
  });

  it("creates_data_dir_if_absent", async () => {
    const parent = await createTempDir();
    dirs.push(parent);
    const nested = path.join(parent, "nested", "data");
    const store = new SnapshotStore(nested);
    await store.save(sampleSnapshot());
    const raw = await readFile(path.join(nested, "snapshot.json"), "utf8");
    assert.match(raw, /"version": 1/);
  });

  it("load_falls_back_to_valid_tmp_when_primary_missing", async () => {
    const { store, dir } = await tempStore();
    await mkdir(dir, { recursive: true });
    const snapshot = sampleSnapshot();
    await writeFile(
      path.join(dir, "snapshot.json.tmp"),
      JSON.stringify(snapshot),
      "utf8",
    );
    const loaded = await store.load();
    assert.equal(loaded.nextEnqueueSeq, snapshot.nextEnqueueSeq);
  });

  it("ignores_corrupt_primary_and_corrupt_tmp", async () => {
    const { store, dir } = await tempStore();
    await writeFile(path.join(dir, "snapshot.json"), "{bad", "utf8");
    await writeFile(path.join(dir, "snapshot.json.tmp"), "{also-bad", "utf8");
    const loaded = await store.load();
    assert.equal(loaded.tasks.length, 0);
    assert.equal(loaded.nextEnqueueSeq, 1);
  });
});
