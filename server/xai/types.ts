export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  costInUsdTicks: number;
}

export interface ChatResult {
  channelId: string;
  model: string;
  reasoningEffort: string;
  content: string;
  reasoningContent: string | null;
  finishReason: string | null;
  usage: TokenUsage;
  channelUsage: TokenUsage;
  id: string | null;
}

export interface ChatOptions {
  systemPrompt?: string;
  model?: string;
  reasoningEffort?: string;
  maxCompletionTokens?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export interface XAIConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  reasoningEffort: string;
  timeoutMs: number;
  maxRetries: number;
  maxContextMessages: number;
  maxCompletionTokens: number | undefined;
}

export type ChannelKey = string | number;

export const EMPTY_USAGE: TokenUsage = {
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  reasoningTokens: 0,
  cachedTokens: 0,
  costInUsdTicks: 0,
};

export const DEFAULT_MODEL = "grok-4.7";
export const DEFAULT_REASONING_EFFORT = "high";
export const DEFAULT_BASE_URL = "https://api.x.ai/v1";
export const DEFAULT_TIMEOUT_MS = 600_000;
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_MAX_CONTEXT_MESSAGES = 40;
export const VALID_REASONING_EFFORTS = ["low", "medium", "high", "xhigh"] as const;
export type ReasoningEffort = (typeof VALID_REASONING_EFFORTS)[number];
