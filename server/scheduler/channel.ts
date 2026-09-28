import {
  MAX_WAITING_PER_CHANNEL,
  isChannelId,
} from "./constants.js";
import { InvalidChannelError, QueueFullError } from "./errors.js";
import type { ChannelId, ChannelSnapshot, Task } from "./types.js";

function cloneTask(task: Task): Task {
  return structuredClone(task);
}

/**
 * Single-channel FIFO queue: at most 1 running task and 10 waiting tasks.
 * The running slot does not count toward the waiting cap.
 */
export class ChannelQueue {
  readonly channelId: ChannelId;
  private _running: Task | null = null;
  private readonly _waiting: Task[] = [];

  constructor(channelId: ChannelId) {
    if (!isChannelId(channelId)) {
      throw new InvalidChannelError(channelId);
    }
    this.channelId = channelId;
  }

  get running(): Task | null {
    return this._running;
  }

  get waiting(): readonly Task[] {
    return this._waiting;
  }

  get runningCount(): number {
    return this._running ? 1 : 0;
  }

  get waitingCount(): number {
    return this._waiting.length;
  }

  get isIdle(): boolean {
    return this._running === null && this._waiting.length === 0;
  }

  canAcceptWaiting(): boolean {
    return this._waiting.length < MAX_WAITING_PER_CHANNEL;
  }

  enqueueWaiting(task: Task): void {
    if (!this.canAcceptWaiting()) {
      throw new QueueFullError(this.channelId);
    }
    this._waiting.push(task);
  }

  /** Recovery / in-flight priority: insert at the front of the waiting queue. */
  enqueueFront(task: Task): void {
    if (!this.canAcceptWaiting()) {
      throw new QueueFullError(this.channelId);
    }
    this._waiting.unshift(task);
  }

  dequeueWaiting(): Task | undefined {
    return this._waiting.shift();
  }

  cancelWaiting(taskId: string): Task | undefined {
    const index = this._waiting.findIndex((task) => task.id === taskId);
    if (index === -1) {
      return undefined;
    }
    const [removed] = this._waiting.splice(index, 1);
    return removed;
  }

  setRunning(task: Task): void {
    this._running = task;
  }

  clearRunning(): Task | null {
    const current = this._running;
    this._running = null;
    return current;
  }

  snapshot(): ChannelSnapshot {
    return {
      channelId: this.channelId,
      running: this._running ? cloneTask(this._running) : null,
      waiting: this._waiting.map(cloneTask),
      runningCount: this.runningCount,
      waitingCount: this.waitingCount,
    };
  }
}
