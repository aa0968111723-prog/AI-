import { XAIConfigError } from "./errors.ts";
import {
  DEFAULT_BASE_URL,
  DEFAULT_MAX_CONTEXT_MESSAGES,
  DEFAULT_MAX_RETRIES,
  DEFAULT_MODEL,
  DEFAULT_REASONING_EFFORT,
  DEFAULT_TIMEOUT_MS,
  VALID_REASONING_EFFORTS,
  type ReasoningEffort,
  type XAIConfig,
} from "./types.ts";

function readEnv(env: NodeJS.ProcessEnv, key: string): string | undefined {
  const raw = env[key];
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
}

export function isConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(readEnv(env, "XAI_API_KEY"));
}

export function requireConfigured(env: NodeJS.ProcessEnv = process.env): void {
  if (!isConfigured(env)) {
    throw new XAIConfigError("XAI_API_KEY is not set");
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): XAIConfig {
  requireConfigured(env);
  const effortRaw = (readEnv(env, "XAI_REASONING_EFFORT") ?? DEFAULT_REASONING_EFFORT).toLowerCase();
  const reasoningEffort = (VALID_REASONING_EFFORTS as readonly string[]).includes(effortRaw)
    ? (effortRaw as ReasoningEffort)
    : DEFAULT_REASONING_EFFORT;

  const maxCompletionRaw = readEnv(env, "XAI_MAX_COMPLETION_TOKENS");
  const maxCompletionTokens = maxCompletionRaw ? parsePositiveInt(maxCompletionRaw, 0) : undefined;

  return {
    apiKey: readEnv(env, "XAI_API_KEY") as string,
    baseUrl: (readEnv(env, "XAI_BASE_URL") ?? DEFAULT_BASE_URL).replace(/\/$/, ""),
    model: readEnv(env, "XAI_MODEL") ?? DEFAULT_MODEL,
    reasoningEffort,
    timeoutMs: parsePositiveInt(readEnv(env, "XAI_TIMEOUT_MS"), DEFAULT_TIMEOUT_MS),
    maxRetries: parsePositiveInt(readEnv(env, "XAI_MAX_RETRIES"), DEFAULT_MAX_RETRIES),
    maxContextMessages: parsePositiveInt(
      readEnv(env, "XAI_MAX_CONTEXT_MESSAGES"),
      DEFAULT_MAX_CONTEXT_MESSAGES,
    ),
    maxCompletionTokens: maxCompletionTokens && maxCompletionTokens > 0 ? maxCompletionTokens : undefined,
  };
}
