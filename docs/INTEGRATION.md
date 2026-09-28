# Integration landing paths

`main` now has the Express + Vite skeleton (`6fff3bc`).
Integration does not implement domain modules, scheduler, xAI, storage, or QueuePanel.

## How other branches should land

Rebase onto `main` first. Keep files in the reserved paths below. Do not introduce a repo-root `src/` tree.

| Conversation | Branch | Land files here |
|---|---|---|
| jobs … gallery | `feat/<module>` | `server/src/modules/<module>/**`, `client/src/pages/<Module>Page.jsx`, `client/src/api/<module>.js` |
| scheduler | `feat/scheduler-engine` | `server/scheduler/**` |
| storage | `feat/server-api-storage` | `server/storage/**` |
| xAI | `feat/server-xai` | `server/xai/**` |
| QueuePanel | `feat/queue-panel` | `client/src/components/QueuePanel.jsx`, `client/src/components/QueuePanel.css` |
| ConversationPanel | `feat/conversation-panel` | `client/src/components/ConversationPanel.jsx` |

## QueuePanel

PR #8 currently puts files at repo-root `src/components/`. That path is unused by the Vite app.
Move them to `client/src/components/` after rebasing onto `main`. Integration only provides `/queue` as a placeholder page.

## Do not

- Merge #8 / #10 / #3 onto `main` until they rebase and use the paths above.
- Change `server/src/lib/envelope.js` or the `app.js` mount list from a feature branch.
- Call model vendors from the agent shell.
