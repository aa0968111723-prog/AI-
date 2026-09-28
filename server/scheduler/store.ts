import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SNAPSHOT_FILENAME, SNAPSHOT_VERSION } from "./constants.js";
import type { PersistedSnapshot, Task } from "./types.js";

const EMPTY: PersistedSnapshot = {
  version: SNAPSHOT_VERSION,
  savedAt: new Date(0).toISOString(),
  nextEnqueueSeq: 1,
  tasks: [],
};

function isTask(value: unknown): value is Task {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const task = value as Partial<Task>;
  return (
    typeof task.id === "string" &&
    task.id.length > 0 &&
    typeof task.channelId === "number" &&
    typeof task.status === "string" &&
    typeof task.attempt === "number" &&
    typeof task.maxAttempts === "number" &&
    typeof task.enqueueSeq === "number"
  );
}

function parseSnapshot(raw: string): PersistedSnapshot | null {
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedSnapshot>;
    if (
      parsed.version !== SNAPSHOT_VERSION ||
      typeof parsed.nextEnqueueSeq !== "number" ||
      !Number.isInteger(parsed.nextEnqueueSeq) ||
      parsed.nextEnqueueSeq < 1 ||
      !Array.isArray(parsed.tasks) ||
      !parsed.tasks.every(isTask)
    ) {
      return null;
    }
    return {
      version: SNAPSHOT_VERSION,
      savedAt:
        typeof parsed.savedAt === "string"
          ? parsed.savedAt
          : new Date(0).toISOString(),
      nextEnqueueSeq: parsed.nextEnqueueSeq,
      tasks: parsed.tasks,
    };
  } catch {
    return null;
  }
}

export class SnapshotStore {
  readonly dataDir: string;
  readonly snapshotPath: string;
  readonly tempPath: string;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.snapshotPath = join(dataDir, SNAPSHOT_FILENAME);
    this.tempPath = join(dataDir, `${SNAPSHOT_FILENAME}.tmp`);
  }

  async load(): Promise<PersistedSnapshot> {
    await mkdir(this.dataDir, { recursive: true });
    const primary = await this.readIfValid(this.snapshotPath);
    if (primary) {
      return primary;
    }
    const fallback = await this.readIfValid(this.tempPath);
    if (fallback) {
      return fallback;
    }
    return structuredClone(EMPTY);
  }

  async save(snapshot: PersistedSnapshot): Promise<void> {
    await mkdir(this.dataDir, { recursive: true });
    const payload = `${JSON.stringify(snapshot, null, 2)}\n`;
    await writeFile(this.tempPath, payload, { encoding: "utf8" });
    try {
      await rename(this.tempPath, this.snapshotPath);
    } catch (error) {
      const code =
        error !== null && typeof error === "object" && "code" in error
          ? String((error as { code: unknown }).code)
          : "";
      if (code === "EEXIST" || code === "EPERM") {
        await unlink(this.snapshotPath).catch(() => undefined);
        await rename(this.tempPath, this.snapshotPath);
        return;
      }
      throw error;
    }
  }

  private async readIfValid(path: string): Promise<PersistedSnapshot | null> {
    try {
      return parseSnapshot(await readFile(path, "utf8"));
    } catch {
      return null;
    }
  }
}
