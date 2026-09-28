import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  ChannelStore,
  DEFAULT_MODEL,
  DEFAULT_REASONING_EFFORT,
  XAIAPIError,
  XAIAbortError,
  XAIClient,
  XAIConfigError,
  XAIRateLimitError,
  createXaiTaskExecutor,
  isConfigured,
  parseRetryAfterMs,
  parseUsage,
  requireConfigured,
} from "../index.js";

const originalKey = process.env.XAI_API_KEY;

afterEach(() => {
  if (originalKey === undefined) delete process.env.XAI_API_KEY;
  else process.env.XAI_API_KEY = originalKey;
});

function completion(content: string) {
  return {
    id: "chatcmpl-test",
    model: "grok-4.7",
    choices: [
      {
        index: 0,
        finish_reason: "stop",
        message: { role: "assistant", content, reasoning_content: "think" },
      },
    ],
    usage: {
      prompt_tokens: 10,
      completion_tokens: 20,
      total_tokens: 30,
      completion_tokens_details: { reasoning_tokens: 8 },
      prompt_tokens_details: { cached_tokens: 2 },
      cost_in_usd_ticks: 50,
    },
  };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("missing or blank API key throws and never returns a fake reply", () => {
  delete process.env.XAI_API_KEY;
  assert.equal(isConfigured({}), false);
  assert.equal(isConfigured({ XAI_API_KEY: "   " }), false);
  assert.throws(() => requireConfigured({}), XAIConfigError);
  assert.throws(() => new XAIClient({ env: {} }), XAIConfigError);
  assert.throws(
    () => new XAIClient({ env: { XAI_API_KEY: "   " }, fetchImpl: async () => jsonResponse(completion("nope")) }),
    XAIConfigError,
  );
});

test("channel 0 and channel 1 keep independent histories", async () => {
  const bodies: unknown[] = [];
  const client = new XAIClient({
    env: { XAI_API_KEY: "test-key" },
    fetchImpl: async (_url, init) => {
      bodies.push(JSON.parse(String(init?.body)));
      return jsonResponse(completion(`reply-${bodies.length}`));
    },
  });
  await client.chat(0, "from-zero");
  await client.chat(1, "from-one");
  await client.chat(0, "again-zero");
  const first = bodies[0] as { messages: Array<{ content: string }> };
  const second = bodies[1] as { messages: Array<{ content: string }> };
  const third = bodies[2] as { messages: Array<{ content: string }> };
  assert.deepEqual(
    first.messages.map((m) => m.content),
    ["from-zero"],
  );
  assert.deepEqual(
    second.messages.map((m) => m.content),
    ["from-one"],
  );
  assert.deepEqual(
    third.messages.map((m) => m.content),
    ["from-zero", "reply-1", "again-zero"],
  );
  assert.equal(
    second.messages.some((m) => m.content.includes("from-zero")),
    false,
  );
});

test("numeric 3 and string 3 share one context", async () => {
  const client = new XAIClient({
    env: { XAI_API_KEY: "test-key" },
    fetchImpl: async () => jsonResponse(completion("ok")),
  });
  await client.chat(3, "hello");
  await client.chat("3", "again");
  assert.equal(client.getChannelMessages(3).length, 4);
  assert.equal(client.getChannelMessages("3").length, 4);
});

test("defaults to grok-4.7 and high reasoning effort without penalty fields", async () => {
  let url = "";
  let headers: Headers | undefined;
  let body: Record<string, unknown> | undefined;
  const client = new XAIClient({
    env: { XAI_API_KEY: "test-key" },
    fetchImpl: async (input, init) => {
      url = String(input);
      headers = new Headers(init?.headers);
      body = JSON.parse(String(init?.body));
      return jsonResponse(completion("ok"));
    },
  });
  const result = await client.chat(0, "ping");
  assert.match(url, /\/chat\/completions$/);
  assert.equal(headers?.get("authorization"), "Bearer test-key");
  assert.equal(body?.model, DEFAULT_MODEL);
  assert.equal(body?.reasoning_effort, DEFAULT_REASONING_EFFORT);
  assert.equal(body?.stream, false);
  assert.equal("presence_penalty" in (body ?? {}), false);
  assert.equal("frequency_penalty" in (body ?? {}), false);
  assert.equal("stop" in (body ?? {}), false);
  assert.equal(result.reasoningEffort, "high");
  assert.equal(JSON.stringify(result).includes("test-key"), false);
});

test("parses token usage including reasoning and cached tokens", async () => {
  const client = new XAIClient({
    env: { XAI_API_KEY: "test-key" },
    fetchImpl: async () => jsonResponse(completion("ok")),
  });
  const result = await client.chat(2, "count");
  assert.deepEqual(result.usage, {
    promptTokens: 10,
    completionTokens: 20,
    totalTokens: 30,
    reasoningTokens: 8,
    cachedTokens: 2,
    costInUsdTicks: 50,
  });
  assert.deepEqual(client.getChannelUsage(2), result.usage);
  assert.deepEqual(client.getUsage(), result.usage);
});

test("429 retries with Retry-After then succeeds", async () => {
  let calls = 0;
  const client = new XAIClient({
    env: { XAI_API_KEY: "test-key", XAI_MAX_RETRIES: "2" },
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse({ error: { message: "slow down" } }, 429, { "retry-after": "0" });
      }
      return jsonResponse(completion("after-retry"));
    },
  });
  const result = await client.chat(0, "hello");
  assert.equal(calls, 2);
  assert.equal(result.content, "after-retry");
});

test("exhausted 429 and API errors do not append the user turn", async () => {
  const limited = new XAIClient({
    env: { XAI_API_KEY: "test-key", XAI_MAX_RETRIES: "0" },
    fetchImpl: async () => jsonResponse({ error: "limited" }, 429, { "retry-after": "0" }),
  });
  await assert.rejects(() => limited.chat(0, "do-not-keep"), XAIRateLimitError);
  assert.deepEqual(limited.getChannelMessages(0), []);

  const bad = new XAIClient({
    env: { XAI_API_KEY: "sk-secret-key" },
    fetchImpl: async () => jsonResponse({ error: { message: "bad sk-secret-key" } }, 400),
  });
  await assert.rejects(() => bad.chat(0, "keep-out"), (error: unknown) => {
    assert.ok(error instanceof XAIAPIError);
    assert.doesNotMatch((error as Error).message, /sk-secret-key/);
    return true;
  });
  assert.deepEqual(bad.getChannelMessages(0), []);
});

test("abort signal does not append history", async () => {
  const controller = new AbortController();
  controller.abort();
  const client = new XAIClient({
    env: { XAI_API_KEY: "test-key" },
    fetchImpl: async () => jsonResponse(completion("should-not-run")),
  });
  await assert.rejects(() => client.chat(0, "aborted", { signal: controller.signal }), XAIAbortError);
  assert.deepEqual(client.getChannelMessages(0), []);
});

test("createXaiTaskExecutor reads payload.message and honors the channel", async () => {
  let seen = "";
  const store = new ChannelStore();
  const executor = createXaiTaskExecutor({
    env: { XAI_API_KEY: "test-key" },
    store,
    fetchImpl: async (_url, init) => {
      seen = String(init?.body);
      return jsonResponse(completion("done"));
    },
  });
  await executor.execute(
    { channelId: 4, payload: { message: "from-scheduler", systemPrompt: "sys" } },
    new AbortController().signal,
  );
  const body = JSON.parse(seen) as { messages: Array<{ role: string; content: string }> };
  assert.equal(body.messages[0]?.role, "system");
  assert.equal(body.messages[0]?.content, "sys");
  assert.equal(body.messages[1]?.content, "from-scheduler");
  assert.equal(store.getMessages(4).at(-1)?.content, "done");
});

test("parseRetryAfterMs and parseUsage helpers", () => {
  assert.equal(parseRetryAfterMs("2"), 2000);
  assert.equal(parseRetryAfterMs(null), undefined);
  assert.equal(parseUsage({ prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 }).promptTokens, 5);
});
