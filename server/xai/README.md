# server/xai

Official xAI client for the photography agent. Each scheduler channel keeps an independent conversation. The API key stays on the server; this module never fabricates a reply when `XAI_API_KEY` is missing.

```ts
import {
  chat,
  createXaiClient,
  createXaiTaskExecutor,
  isConfigured,
  resetChannel,
} from "../xai/index.js";

if (!isConfigured()) {
  throw new Error("XAI_API_KEY is not set");
}

await chat(3, "描述這組燈光");
engine.setExecutor(createXaiTaskExecutor(createXaiClient()));
```

Task payload accepted by `createXaiTaskExecutor()`:
`{ message | content | prompt | text, systemPrompt?, model?, reasoningEffort?, reset? }`

| Env | Default |
|---|---|
| `XAI_API_KEY` | required |
| `XAI_BASE_URL` | `https://api.x.ai/v1` |
| `XAI_MODEL` | `grok-4.7` |
| `XAI_REASONING_EFFORT` | `high` |
| `XAI_TIMEOUT_MS` | `600000` |
| `XAI_MAX_RETRIES` | `3` |

```bash
cd server/xai && npm install && npm test
```
