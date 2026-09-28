export class XAIError extends Error {
  readonly code: string;

  constructor(message: string, code = "XAI_ERROR") {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

export class XAIConfigError extends XAIError {
  constructor(message = "XAI_API_KEY is not set") {
    super(message, "XAI_CONFIG");
  }
}

export class XAITimeoutError extends XAIError {
  constructor(message = "xAI request timed out") {
    super(message, "XAI_TIMEOUT");
  }
}

export class XAIAbortError extends XAIError {
  constructor(message = "xAI request was aborted") {
    super(message, "XAI_ABORTED");
  }
}

export class XAIRateLimitError extends XAIError {
  readonly status = 429;
  readonly retryAfterMs: number | undefined;

  constructor(message = "xAI rate limit exceeded (429)", retryAfterMs?: number) {
    super(message, "XAI_RATE_LIMIT");
    this.retryAfterMs = retryAfterMs;
  }
}

export class XAIAPIError extends XAIError {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message, "XAI_API");
    this.status = status;
  }
}
