/** Number of independent execution channels. */
export const CHANNEL_COUNT = 10;

/** Inclusive channel id range: 0 .. CHANNEL_COUNT-1. */
export const MIN_CHANNEL_ID = 0;
export const MAX_CHANNEL_ID = CHANNEL_COUNT - 1;

/** Each channel runs at most one task at a time. */
export const MAX_RUNNING_PER_CHANNEL = 1;

/** Each channel keeps at most 10 waiting tasks. The running slot is not waiting. */
export const MAX_WAITING_PER_CHANNEL = 10;

/** Default retry budget, counting started executions. */
export const DEFAULT_MAX_ATTEMPTS = 3;

/** Snapshot schema version. */
export const SNAPSHOT_VERSION = 1 as const;

/** Default snapshot file name inside dataDir. */
export const SNAPSHOT_FILENAME = "snapshot.json";

export function isChannelId(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIN_CHANNEL_ID &&
    value <= MAX_CHANNEL_ID
  );
}
