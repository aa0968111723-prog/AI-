export class SchedulerError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class InvalidChannelError extends SchedulerError {
  constructor(channelId: unknown) {
    super(
      "INVALID_CHANNEL",
      `channelId must be an integer in 0..9, received ${String(channelId)}`,
    );
  }
}

export class QueueFullError extends SchedulerError {
  readonly channelId: number;
  constructor(channelId: number) {
    super(
      "QUEUE_FULL",
      `channel ${channelId} already has 10 waiting tasks`,
    );
    this.channelId = channelId;
  }
}

export class TaskNotFoundError extends SchedulerError {
  readonly taskId: string;
  constructor(taskId: string) {
    super("TASK_NOT_FOUND", `task not found: ${taskId}`);
    this.taskId = taskId;
  }
}

export class CancelRunningError extends SchedulerError {
  readonly taskId: string;
  constructor(taskId: string) {
    super(
      "CANCEL_RUNNING",
      `cannot cancel running task ${taskId}; only waiting tasks can be cancelled`,
    );
    this.taskId = taskId;
  }
}

export class SchedulerNotStartedError extends SchedulerError {
  constructor() {
    super(
      "NOT_STARTED",
      "SchedulerEngine.start() must be called before this operation",
    );
  }
}

export class CannotCancelError extends SchedulerError {
  readonly taskId: string;
  readonly status: string;
  constructor(taskId: string, status: string) {
    super(
      "CANNOT_CANCEL",
      `cannot cancel task ${taskId} in status ${status}`,
    );
    this.taskId = taskId;
    this.status = status;
  }
}
