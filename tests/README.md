# tests/ — 攝影代理 queue invariants

Independent branch: `tests/channel-queue-invariants`.
This folder is the only surface this conversation writes. Product source
(`server/scheduler/**`, `src/components/QueuePanel.*`, `client/**`, `feat/*`)
is owned by other conversations and must not be edited here.

## What is covered

| Invariant | File |
|---|---|
| 10 parallel channels, 1 running each | `scheduler/invariants.test.ts` |
| 10 waiting cap per channel | same |
| FIFO per channel + retry-at-head | same |
| Atomic all-channel dispatch | same |
| Failure retry + dead-letter | same |
| Restart recovery via snapshot.json | same |
| API keys never leak | same + `frontend/queue_panel_contract.test.ts` |
| Desktop / mobile / keyboard / reduced-motion / 3D | `ux/UX_AUDIT.md` |

## How to run

From repo root (Node ≥ 20):

```bash
npm install --prefix tests
npm test --prefix tests
```

Or:

```bash
cd tests && npm install && npm test
```

Tests load the product `SchedulerEngine` from `server/scheduler/index.ts` when
`engine.ts` / `channel.ts` / `store.ts` exist. Until those land on this branch
via merge, tests run against `tests/helpers/reference-engine.ts`, which
implements the published `@ai/scheduler` contract:

- `CHANNEL_COUNT = 10`, ids `0..9`
- `MAX_RUNNING_PER_CHANNEL = 1`
- `MAX_WAITING_PER_CHANNEL = 10` (running slot is not waiting)
- `DEFAULT_MAX_ATTEMPTS = 3`
- snapshot version 1, file `snapshot.json`
- errors `InvalidChannelError`, `QueueFullError`

## Branch policy

- Do not merge product code into this branch from this conversation.
- Rebase onto `main` when integration updates the skeleton.
- When `feat/scheduler-engine` is merged, re-run this suite against the real engine.
