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
  /** Number of executions that have been started. 0 before first dispatch. */
  attempt: number;
  maxAttempts: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
  lastError?: string;
  /** Monotonic per-engine sequence used to restore FIFO after restart. */
  enqueueSeq: number;
}

export interface TaskExecutor {
  execute(task: Task, signal: AbortSignal): Promise<void>;
}

export interface EnqueueOptions {
  channelId: ChannelId;
  maxAttempts?: number;
  id?: string;
}

export interface TaskFilter {
  channelId?: ChannelId;
  status?: TaskStatus;
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

export interface SchedulerConfig {
  dataDir?: string;
  maxAttempts?: number;
  retryDelayMs?: number;
  clock?: () => Date;
  idFactory?: () => string;
  now?: () => number;
}
