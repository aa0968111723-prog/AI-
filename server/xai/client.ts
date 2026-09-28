import { loadConfig } from "./config.js";
import { ChannelStore, normalizeChannelId } from "./context.js";
import {
  XAIAPIError,
  XAIAbortError,
  XAIError,
  XAIRateLimitError,
  XAITimeoutError,
} from "./errors.js";
import {
  type ChannelKey,
  type ChatMessage,
  type ChatOptions,
  type ChatResult,
  type TokenUsage,
  type XAIConfig,
} from "./types.js";

export function parseRetryAfterMs(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const trimmed = header.trim();
  if (!trimmed) return undefined;
  if (/^\d+(\.\d+)?$/.test(trimmed)) return Math.max(0, Number(trimmed) * 1000);
  const parsed = Date.parse(trimmed);
  if (Number.isNaN(parsed)) return undefined;
  return Math.max(0, parsed - now);
}

export function backoffMs(attempt: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined) return retryAfterMs;
  return Math.min(60, 2 ** attempt) * 1000;
}

export function parseUsage(raw: unknown): TokenUsage {
  const usage: TokenUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    reasoningTokens: 0,
    cachedTokens: 0,
    costInUsdTicks: 0,
  };
  if (!raw || typeof raw !== "object") return usage;
  const record = raw as Record<string, unknown>;
  usage.promptTokens = Number(record.prompt_tokens ?? 0) || 0;
  usage.completionTokens = Number(record.completion_tokens ?? 0) || 0;
  usage.totalTokens = Number(record.total_tokens ?? usage.promptTokens + usage.completionTokens) || 0;
  usage.costInUsdTicks = Number(record.cost_in_usd_ticks ?? 0) || 0;
  const completionDetails =
    record.completion_tokens_details && typeof record.completion_tokens_details === "object"
      ? (record.completion_tokens_details as Record<string, unknown>)
      : {};
  const promptDetails =
    record.prompt_tokens_details && typeof record.prompt_tokens_details === "object"
      ? (record.prompt_tokens_details as Record<string, unknown>)
      : {};
  usage.reasoningTokens = Number(completionDetails.reasoning_tokens ?? 0) || 0;
  usage.cachedTokens = Number(promptDetails.cached_tokens ?? 0) || 0;
  return usage;
}

function redact(text: string, secret: string): string {
  return secret ? text.split(secret).join("[redacted]") : text;
}

function trimHistory(messages: ChatMessage[], maxMessages: number): ChatMessage[] {
  if (messages.length <= maxMessages) return messages;
  const system = messages.filter((message) => message.role === "system");
  const rest = messages.filter((message) => message.role !== "system");
  const keep = Math.max(0, maxMessages - system.length);
  return [...system, ...rest.slice(-keep)];
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof XAITimeoutError ||
    error instanceof XAIAbortError ||
    (error instanceof Error && error.name === "AbortError")
  );
}

function mapAbort(signal: AbortSignal, error?: unknown): Error {
  if (error instanceof XAITimeoutError || signal.reason instanceof XAITimeoutError) {
    return error instanceof XAITimeoutError ? error : (signal.reason as Error);
  }
  if (error instanceof XAIAbortError || signal.reason instanceof XAIAbortError) {
    return error instanceof XAIAbortError ? error : (signal.reason as Error);
  }
  return new XAIAbortError();
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason instanceof Error ? signal.reason : new XAIAbortError());
    };
    if (!signal) return;
    if (signal.aborted) {
      onAbort();
      return;
    }
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function combineSignals(timeoutMs: number, external?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new XAITimeoutError()), timeoutMs);
  const onExternal = () => controller.abort(external?.reason ?? new XAIAbortError());
  if (external) {
    if (external.aborted) onExternal();
    else external.addEventListener("abort", onExternal, { once: true });
  }
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", onExternal);
    },
  };
}

export class XAIClient {
  readonly config: XAIConfig;
  readonly store: ChannelStore;
  private readonly fetchImpl: typeof fetch;

  constructor(options: { env?: NodeJS.ProcessEnv; store?: ChannelStore; fetchImpl?: typeof fetch } = {}) {
    this.config = loadConfig(options.env ?? process.env);
    this.store = options.store ?? new ChannelStore();
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async chat(channelId: ChannelKey, userMessage: string, options: ChatOptions = {}): Promise<ChatResult> {
    const content = userMessage.trim();
    if (!content) throw new XAIError("user message is empty");
    const key = normalizeChannelId(channelId);
    const history = this.store.getMessages(key);
    const outgoing: ChatMessage[] = [];
    const systemPrompt = options.systemPrompt?.trim();
    if (systemPrompt && !history.some((message) => message.role === "system")) {
      outgoing.push({ role: "system", content: systemPrompt });
    }
    outgoing.push(...history);
    outgoing.push({ role: "user", content });
    const messages = trimHistory(outgoing, this.config.maxContextMessages);
    const timeoutMs = options.timeoutMs ?? this.config.timeoutMs;
    const { signal, cleanup } = combineSignals(timeoutMs, options.signal);
    try {
      const response = await this.request(key, messages, options, signal);
      const persisted = trimHistory(
        [
          ...this.store.getMessages(key),
          ...(systemPrompt && !this.store.getMessages(key).some((message) => message.role === "system")
            ? [{ role: "system" as const, content: systemPrompt }]
            : []),
          { role: "user", content },
          { role: "assistant", content: response.content },
        ],
        this.config.maxContextMessages,
      );
      this.store.setMessages(key, persisted);
      const channelUsage = this.store.recordUsage(key, response.usage);
      return { ...response, channelId: key, channelUsage };
    } finally {
      cleanup();
    }
  }

  resetChannel(channelId: ChannelKey): void {
    this.store.reset(channelId);
  }

  getChannelMessages(channelId: ChannelKey): ChatMessage[] {
    return this.store.getMessages(channelId);
  }

  getChannelUsage(channelId: ChannelKey): TokenUsage {
    return this.store.getChannelUsage(channelId);
  }

  getUsage(): TokenUsage {
    return this.store.getUsage();
  }

  private async request(
    channelId: string,
    messages: ChatMessage[],
    options: ChatOptions,
    signal: AbortSignal,
  ): Promise<Omit<ChatResult, "channelId" | "channelUsage">> {
    const model = options.model ?? this.config.model;
    const reasoningEffort = options.reasoningEffort ?? this.config.reasoningEffort;
    const url = `${this.config.baseUrl}/chat/completions`;
    const body: Record<string, unknown> = {
      model,
      messages,
      reasoning_effort: reasoningEffort,
      prompt_cache_key: channelId,
      stream: false,
    };
    const maxTokens = options.maxCompletionTokens ?? this.config.maxCompletionTokens;
    if (maxTokens) body.max_completion_tokens = maxTokens;

    let lastRateLimitMs: number | undefined;
    for (let attempt = 0; attempt <= this.config.maxRetries; attempt += 1) {
      if (signal.aborted) throw mapAbort(signal);
      let response: Response;
      try {
        response = await this.fetchImpl(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.config.apiKey}`,
            "Content-Type": "application/json",
            "x-grok-conv-id": channelId,
          },
          body: JSON.stringify(body),
          signal,
        });
      } catch (error) {
        if (signal.aborted || isAbortError(error)) throw mapAbort(signal, error);
        if (attempt >= this.config.maxRetries) throw error;
        await sleep(backoffMs(attempt), signal);
        continue;
      }

      if (response.status === 429 || response.status >= 500) {
        lastRateLimitMs =
          response.status === 429 ? parseRetryAfterMs(response.headers.get("retry-after")) : undefined;
        if (attempt >= this.config.maxRetries) {
          if (response.status === 429) {
            throw new XAIRateLimitError("xAI rate limit exceeded (429)", lastRateLimitMs);
          }
          const text = redact(await response.text(), this.config.apiKey);
          throw new XAIAPIError(`xAI API error (${response.status}): ${text || response.statusText}`, response.status);
        }
        await sleep(backoffMs(attempt, lastRateLimitMs), signal);
        continue;
      }

      const rawText = await response.text();
      const safeText = redact(rawText, this.config.apiKey);
      if (!response.ok) {
        throw new XAIAPIError(
          `xAI API error (${response.status}): ${safeText || response.statusText}`,
          response.status,
        );
      }

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(rawText) as Record<string, unknown>;
      } catch {
        throw new XAIAPIError("xAI API returned invalid JSON", response.status);
      }

      const choices = Array.isArray(payload.choices) ? payload.choices : [];
      const first = choices[0] && typeof choices[0] === "object" ? (choices[0] as Record<string, unknown>) : {};
      const message =
        first.message && typeof first.message === "object" ? (first.message as Record<string, unknown>) : {};
      const assistant = typeof message.content === "string" ? message.content : "";
      if (!assistant) {
        throw new XAIAPIError("xAI API returned an empty assistant message", response.status);
      }

      return {
        model: typeof payload.model === "string" ? payload.model : model,
        reasoningEffort,
        content: assistant,
        reasoningContent: typeof message.reasoning_content === "string" ? message.reasoning_content : null,
        finishReason: typeof first.finish_reason === "string" ? first.finish_reason : null,
        usage: parseUsage(payload.usage),
        id: typeof payload.id === "string" ? payload.id : null,
      };
    }

    throw new XAIRateLimitError("xAI rate limit exceeded (429)", lastRateLimitMs);
  }
}
