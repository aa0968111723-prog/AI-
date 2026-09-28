import { isConfigured, loadConfig, requireConfigured } from "./config.js";
import { ChannelStore, addUsage, normalizeChannelId } from "./context.js";
import { XAIClient, backoffMs, parseRetryAfterMs, parseUsage } from "./client.js";
import { XAIAPIError } from "./errors.js";
import type { ChannelKey, ChatOptions, ChatResult } from "./types.js";

export interface SchedulerTask {
  id: string;
  channelId: ChannelKey;
  payload: unknown;
}

export interface TaskExecutor {
  execute(task: SchedulerTask, signal: AbortSignal): Promise<void>;
}

export interface XAIClientOptions {
  env?: NodeJS.ProcessEnv;
  store?: ChannelStore;
  fetchImpl?: typeof fetch;
}

const sharedStore = new ChannelStore();

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function parseTaskPayload(payload: unknown): {
  message: string;
  systemPrompt?: string;
  model?: string;
  reasoningEffort?: string;
  reset?: boolean;
} {
  if (typeof payload === "string") {
    if (!payload.trim()) throw new XAIAPIError("task payload must include a message", 400);
    return { message: payload };
  }
  const record = asRecord(payload) ?? {};
  const message =
    (typeof record.message === "string" && record.message) ||
    (typeof record.content === "string" && record.content) ||
    (typeof record.prompt === "string" && record.prompt) ||
    (typeof record.text === "string" && record.text) ||
    "";
  if (!message.trim()) {
    throw new XAIAPIError("task payload must include message, content, or prompt", 400);
  }
  return {
    message,
    systemPrompt: typeof record.systemPrompt === "string" ? record.systemPrompt : undefined,
    model: typeof record.model === "string" ? record.model : undefined,
    reasoningEffort: typeof record.reasoningEffort === "string" ? record.reasoningEffort : undefined,
    reset: record.reset === true,
  };
}

export function createXaiClient(options: XAIClientOptions = {}): XAIClient {
  return new XAIClient(options);
}

function defaultClient(options: XAIClientOptions = {}): XAIClient {
  return new XAIClient({ store: sharedStore, ...options });
}

export async function chat(
  channelId: ChannelKey,
  userMessage: string,
  options?: ChatOptions,
): Promise<ChatResult> {
  return defaultClient().chat(channelId, userMessage, options);
}

export function resetChannel(channelId: ChannelKey): void {
  sharedStore.reset(channelId);
}

export function resetAllChannels(): void {
  sharedStore.resetAll();
}

export function getChannelMessages(channelId: ChannelKey) {
  return sharedStore.getMessages(channelId);
}

export function getChannelUsage(channelId: ChannelKey) {
  return sharedStore.getChannelUsage(channelId);
}

export function getUsage(channelId?: ChannelKey) {
  return channelId === undefined ? sharedStore.getUsage() : sharedStore.getChannelUsage(channelId);
}

export function createXaiTaskExecutor(client?: XAIClient): TaskExecutor {
  const resolved = client ?? defaultClient();
  return {
    async execute(task: SchedulerTask, signal: AbortSignal): Promise<void> {
      const parsed = parseTaskPayload(task.payload);
      if (parsed.reset) resolved.resetChannel(task.channelId);
      await resolved.chat(task.channelId, parsed.message, {
        signal,
        systemPrompt: parsed.systemPrompt,
        model: parsed.model,
        reasoningEffort: parsed.reasoningEffort,
      });
    },
  };
}

export {
  ChannelStore,
  XAIClient,
  addUsage,
  backoffMs,
  isConfigured,
  loadConfig,
  normalizeChannelId,
  parseRetryAfterMs,
  parseUsage,
  requireConfigured,
};

export {
  XAIAPIError,
  XAIAbortError,
  XAIConfigError,
  XAIError,
  XAIRateLimitError,
  XAITimeoutError,
} from "./errors.js";

export {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_CONTEXT_MESSAGES,
  DEFAULT_MAX_RETRIES,
  DEFAULT_MODEL,
  DEFAULT_REASONING_EFFORT,
  DEFAULT_TIMEOUT_MS,
  EMPTY_USAGE,
  VALID_REASONING_EFFORTS,
} from "./types.js";

export type {
  ChannelKey,
  ChatMessage,
  ChatOptions,
  ChatResult,
  ChatRole,
  ReasoningEffort,
  TokenUsage,
  XAIConfig,
} from "./types.js";
