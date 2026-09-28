import { XAIClient } from "./client.js";
import { ChannelStore } from "./context.js";
import { XAIError } from "./errors.js";
import type { ChannelKey, ChatOptions, ChatResult, TokenUsage } from "./types.js";

export { XAIClient, parseRetryAfterMs, parseUsage, backoffMs } from "./client.js";
export { isConfigured, requireConfigured, loadConfig } from "./config.js";
export { ChannelStore, normalizeChannelId, addUsage } from "./context.js";
export {
  XAIAbortError,
  XAIAPIError,
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

const store = new ChannelStore();

export interface XaiClientOptions {
  env?: NodeJS.ProcessEnv;
  store?: ChannelStore;
  fetchImpl?: typeof fetch;
}

export function createXaiClient(options: XaiClientOptions = {}): XAIClient {
  return new XAIClient({
    env: options.env ?? process.env,
    store: options.store ?? store,
    fetchImpl: options.fetchImpl,
  });
}

export async function chat(
  channelId: ChannelKey,
  userMessage: string,
  options: ChatOptions = {},
): Promise<ChatResult> {
  return createXaiClient().chat(channelId, userMessage, options);
}

export function resetChannel(channelId: ChannelKey): void {
  store.reset(channelId);
}

export function getChannelMessages(channelId: ChannelKey) {
  return store.getMessages(channelId);
}

export function getChannelUsage(channelId: ChannelKey): TokenUsage {
  return store.getChannelUsage(channelId);
}

export function getUsage(channelId?: ChannelKey): TokenUsage {
  return channelId === undefined ? store.getUsage() : store.getChannelUsage(channelId);
}

export function resetAllChannels(): void {
  store.resetAll();
}

export interface SchedulerTask {
  channelId: ChannelKey;
  payload?: unknown;
}

export interface XaiTaskExecutor {
  execute(task: SchedulerTask, signal: AbortSignal): Promise<void>;
}

function payloadMessage(payload: unknown): { message: string; systemPrompt?: string; reset?: boolean } {
  if (typeof payload === "string") {
    const message = payload.trim();
    if (!message) throw new XAIError("Task payload is missing message");
    return { message };
  }
  if (!payload || typeof payload !== "object") {
    throw new XAIError("Task payload is missing message");
  }
  const record = payload as Record<string, unknown>;
  const raw = [record.message, record.content, record.prompt, record.text].find(
    (value) => typeof value === "string" && value.trim(),
  );
  if (typeof raw !== "string") throw new XAIError("Task payload is missing message");
  return {
    message: raw.trim(),
    systemPrompt: typeof record.systemPrompt === "string" ? record.systemPrompt : undefined,
    reset: record.reset === true,
  };
}

export function createXaiTaskExecutor(options: XaiClientOptions = {}): XaiTaskExecutor {
  const client = createXaiClient(options);
  return {
    async execute(task: SchedulerTask, signal: AbortSignal): Promise<void> {
      const parsed = payloadMessage(task.payload);
      if (parsed.reset) client.resetChannel(task.channelId);
      await client.chat(task.channelId, parsed.message, {
        systemPrompt: parsed.systemPrompt,
        signal,
      });
    },
  };
}
