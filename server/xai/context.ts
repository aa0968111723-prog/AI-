import { XAIError } from "./errors.js";
import { EMPTY_USAGE, type ChannelKey, type ChatMessage, type TokenUsage } from "./types.js";

export function normalizeChannelId(id: ChannelKey): string {
  if (typeof id === "number") {
    if (!Number.isInteger(id) || id < 0) {
      throw new XAIError(`Invalid channel id: ${id}`, "XAI_CHANNEL");
    }
    return String(id);
  }
  const trimmed = String(id).trim();
  if (!trimmed) {
    throw new XAIError("Invalid channel id", "XAI_CHANNEL");
  }
  return trimmed;
}

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
    cachedTokens: a.cachedTokens + b.cachedTokens,
    costInUsdTicks: a.costInUsdTicks + b.costInUsdTicks,
  };
}

interface ChannelState {
  messages: ChatMessage[];
  usage: TokenUsage;
}

export class ChannelStore {
  private readonly channels = new Map<string, ChannelState>();
  private total: TokenUsage = { ...EMPTY_USAGE };

  getMessages(id: ChannelKey): ChatMessage[] {
    return this.get(id).messages.map((message) => ({ ...message }));
  }

  getChannelUsage(id: ChannelKey): TokenUsage {
    return { ...this.get(id).usage };
  }

  getUsage(): TokenUsage {
    return { ...this.total };
  }

  setMessages(id: ChannelKey, messages: ChatMessage[]): void {
    this.get(id).messages = messages.map((message) => ({ ...message }));
  }

  recordUsage(id: ChannelKey, usage: TokenUsage): TokenUsage {
    const state = this.get(id);
    state.usage = addUsage(state.usage, usage);
    this.total = addUsage(this.total, usage);
    return { ...state.usage };
  }

  reset(id: ChannelKey): void {
    this.channels.set(normalizeChannelId(id), { messages: [], usage: { ...EMPTY_USAGE } });
  }

  resetAll(): void {
    this.channels.clear();
    this.total = { ...EMPTY_USAGE };
  }

  private get(id: ChannelKey): ChannelState {
    const key = normalizeChannelId(id);
    let state = this.channels.get(key);
    if (!state) {
      state = { messages: [], usage: { ...EMPTY_USAGE } };
      this.channels.set(key, state);
    }
    return state;
  }
}
