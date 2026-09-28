# @ai/scheduler

Independent 10-channel FIFO scheduling engine. Owns only `server/scheduler/`.

## Caps

- 10 channels (`channelId` integer `0..9`)
- 1 running + 10 waiting per channel (running does not count as waiting)
- Max 10 parallel / 100 waiting
- New `enqueue()` throws `QueueFullError` when that channel already has 10 waiting tasks

## API

```ts
const engine = new SchedulerEngine(executor, { dataDir });
await engine.start();
const task = await engine.enqueue(payload, { channelId: 0 });
await engine.cancel(waitingId);
engine.getTask(task.id);
engine.listTasks({ channelId: 0 });
engine.getChannel(0);
engine.snapshot();
await engine.stop();
```

`TaskExecutor`: `{ execute(task, signal): Promise<void> }`

- `start()` is required before enqueue/cancel
- `cancel()` is waiting-only
- retry goes to the same channel tail
- restart recovery puts interrupted running at the front (`attempt` unchanged; dispatch increments)
- persist via `snapshot.json.tmp` + rename
- `stop()` bumps a generation so late executor callbacks cannot rewrite persisted running

## Errors

`InvalidChannelError` · `QueueFullError` · `TaskNotFoundError` · `CancelRunningError` · `CannotCancelError` · `SchedulerNotStartedError`

## Tests

```bash
cd server/scheduler
npm install
npm test
```
