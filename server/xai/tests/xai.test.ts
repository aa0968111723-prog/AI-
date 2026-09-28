import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  ChannelStore,
  XAIAbortError,
  XAIConfigError,
  XAIRateLimitError,
  createXaiClient,
  createXaiTaskExecutor,
  parseRetryAfterMs,
  parseUsage,
  resetAllChannels,
} from "../index.ts";

const env = { XAI_API_KEY: "test-key", XAI_MAX_RETRIES: "1" };

afterEach(() => {
  resetAllChannels();
});

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function completion(content: string) {
  return {
    id: "cmpl-1",
    model: "grok-4.7",
    choices: [
      {
        finish_reason: "stop",
        message: { role: "assistant", content, reasoning_content: "think" },
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 5,
      total_tokens: 15,
      cost_in_usd_ticks: 2,
      completion_tokens_details: { reasoning_tokens: 3 },
      prompt_tokens_details: { cached_tokens: 1 },
    },
  };
}

test("missing key throws before fetch", () => {
  let called = 0;
  const fetchImpl = (async () => {
    called += 1;
    return jsonResponse(completion("no"));
  }) as typeof fetch;
  assert.throws(() => createXaiClient({ env: {}, fetchImpl }), XAIConfigError);
  assert.equal(called, 0);
  assert.throws(() => createXaiClient({ env: { XAI_API_KEY: "   " }, fetchImpl }), XAIConfigError);
});

test("default model and effort go to official chat completions", async () => {
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  const client = createXaiClient({
    env,
    store: new ChannelStore(),
    fetchImpl: (async (url, init) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return jsonResponse(completion("ok"));
    }) as typeof fetch,
  });
  const result = await client.chat(3, "hello");
  assert.equal(requests[0]?.url, "https://api.x.ai/v1/chat/completions");
  assert.equal(requests[0]?.body.model, "grok-4.7");
  assert.equal(requests[0]?.body.reasoning_effort, "high");
  assert.equal(requests[0]?.body.prompt_cache_key, "3");
  assert.equal("presence_penalty" in requests[0].body, false);
  assert.equal("frequency_penalty" in requests[0].body, false);
  assert.equal("stop" in requests[0].body, false);
  assert.equal(result.content, "ok");
  assert.equal(JSON.stringify(result).includes("test-key"), false);
});

test("channels stay isolated and 3 equals string 3", async () => {
  const store = new ChannelStore();
  const client = createXaiClient({
    env,
    store,
    fetchImpl: (async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      const last = body.messages.at(-1).content;
      return jsonResponse(completion(`echo:${last}`));
    }) as typeof fetch,
  });
  await client.chat(0, "zero");
  await client.chat(1, "one");
  await client.chat(3, "three");
  await client.chat("3", "again");
  assert.deepEqual(
    client.getChannelMessages(0).map((message) => message.content),
    ["zero", "echo:zero"],
  );
  assert.deepEqual(
    client.getChannelMessages(1).map((message) => message.content),
    ["one", "echo:one"],
  );
  assert.equal(client.getChannelMessages(3).length, 4);
  assert.equal(client.getChannelMessages("3").length, 4);
});

test("429 with Retry-After 0 then success persists history", async () => {
  let calls = 0;
  const store = new ChannelStore();
  const client = createXaiClient({
    env,
    store,
    fetchImpl: (async () => {
      calls += 1;
      if (calls === 1) return new Response("rate", { status: 429, headers: { "Retry-After": "0" } });
      return jsonResponse(completion("later"));
    }) as typeof fetch,
  });
  const result = await client.chat(2, "retry me");
  assert.equal(result.content, "later");
  assert.equal(calls, 2);
  assert.equal(client.getChannelMessages(2).length, 2);
});

test("exhausted 429 does not persist the user turn", async () => {
  const store = new ChannelStore();
  const client = createXaiClient({
    env,
    store,
    fetchImpl: (async () => new Response("nope", { status: 429, headers: { "Retry-After": "0" } })) as typeof fetch,
  });
  await assert.rejects(() => client.chat(4, "lost"), XAIRateLimitError);
  assert.equal(client.getChannelMessages(4).length, 0);
});

test("abort signal does not persist history", async () => {
  const controller = new AbortController();
  controller.abort();
  const store = new ChannelStore();
  const client = createXaiClient({
    env,
    store,
    fetchImpl: (async () => jsonResponse(completion("should-not-run"))) as typeof fetch,
  });
  await assert.rejects(() => client.chat(0, "aborted", { signal: controller.signal }), XAIAbortError);
  assert.equal(client.getChannelMessages(0).length, 0);
});

test("parseUsage reads reasoning and cached tokens", () => {
  const usage = parseUsage({
    prompt_tokens: 8,
    completion_tokens: 4,
    total_tokens: 12,
    cost_in_usd_ticks: 9,
    completion_tokens_details: { reasoning_tokens: 7 },
    prompt_tokens_details: { cached_tokens: 2 },
  });
  assert.equal(usage.reasoningTokens, 7);
  assert.equal(usage.cachedTokens, 2);
  assert.equal(usage.costInUsdTicks, 9);
  assert.equal(parseRetryAfterMs("0"), 0);
  assert.equal(parseRetryAfterMs("2"), 2000);
});

test("task executor reads payload.message and honors reset", async () => {
  const store = new ChannelStore();
  const executor = createXaiTaskExecutor({
    env,
    store,
    fetchImpl: (async () => jsonResponse(completion("done"))) as typeof fetch,
  });
  await executor.execute({ channelId: 3, payload: { message: "hi" } }, new AbortController().signal);
  assert.equal(store.getMessages(3).length, 2);
  await executor.execute(
    { channelId: 3, payload: { message: "fresh", reset: true } },
    new AbortController().signal,
  );
  assert.equal(store.getMessages(3).length, 2);
  assert.equal(store.getMessages(3)[0]?.content, "fresh");
});
