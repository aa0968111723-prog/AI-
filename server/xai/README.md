# @ai/xai

Official xAI client for the Photo Workflow Agent. Owned by `feat/server-xai` under `server/xai/` only.

## Env

| Variable | Default | Notes |
|---|---|---|
| `XAI_API_KEY` | *(required)* | Server-side only. Missing/blank throws `XAIConfigError` and never fabricates a reply. |
| `XAI_BASE_URL` | `https://api.x.ai/v1` | Official inference API |
| `XAI_MODEL` | `grok-4.7` | |
| `XAI_REASONING_EFFORT` | `high` | `low` / `medium` / `high` / `xhigh` |
| `XAI_TIMEOUT_MS` | `600000` | High reasoning can take minutes |
| `XAI_MAX_RETRIES` | `3` | 429 and transient 5xx |
| `XAI_MAX_CONTEXT_MESSAGES` | `40` | Per-channel history cap |

## Scheduler API

```ts
import {
  chat,
  createXaiTaskExecutor,
  getChannelMessages,
  getUsage,
  isConfigured,
  resetChannel,
} from "../xai/index.ts";

if (!isConfigured()) throw new Error("XAI_API_KEY is not set");

await chat(3, "cull this batch");
await createXaiTaskExecutor().execute(
  { channelId: 3, payload: { message: "cull this batch" } },
  AbortSignal.timeout(600_000),
);
```

`3` and `"3"` share the same isolated conversation. History is written only after a successful API response.

```bash
cd server/xai && npm install && npm test
```
