/**
 * QueuePanel — 攝影工作流代理任務佇列
 *
 * 分支：feat/queue-panel
 * 路徑：client/src/components/QueuePanel.jsx
 * 職責：只維護本檔與 QueuePanel.css。
 *
 * 對齊 feat/scheduler-engine
 *   CHANNEL_COUNT = 10
 *   MAX_RUNNING_PER_CHANNEL = 1
 *   MAX_WAITING_PER_CHANNEL = 10
 *   全域並行 10，全域等待 100
 *
 * TaskStatus = waiting | running | succeeded | failed | cancelled
 */

import { useCallback, useMemo, useState } from 'react';
import './QueuePanel.css';

export const CHANNEL_COUNT = 10;
export const MAX_PARALLEL = 10;
export const MAX_WAITING = 100;
export const MAX_RUNNING_PER_CHANNEL = 1;
export const MAX_WAITING_PER_CHANNEL = 10;
export const WAITING_PREVIEW = 10;

export const DEFAULT_CHANNEL_NAMES = ['進件', '編目', '篩選', '顯影', '精修', '調色', '輸出', '交付', '代理', '備援'];

const STATUS_LABEL = {
  running: '執行中',
  waiting: '等待中',
  succeeded: '已完成',
  completed: '已完成',
  failed: '失敗',
  cancelled: '已取消',
};

function clamp(n, min, max) {
  const value = Number(n);
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function asTime(value) {
  if (value == null || value === '') return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatRelative(value) {
  const date = asTime(value);
  if (!date) return '';
  const diff = Date.now() - date.getTime();
  if (diff < 15000) return '剛剛';
  const sec = Math.floor(Math.max(0, diff) / 1000);
  if (sec < 60) return `${sec} 秒前`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  return `${Math.floor(hr / 24)} 天前`;
}

function asChannelId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 0 || id >= CHANNEL_COUNT) return null;
  return id;
}

function taskTitle(task) {
  const payload = task?.payload;
  if (payload && typeof payload === 'object') {
    const fromPayload =
      payload.title ||
      payload.name ||
      payload.filename ||
      payload.prompt ||
      payload.label ||
      payload.jobName;
    if (fromPayload) return fromPayload;
  }
  if (typeof payload === 'string' && payload.trim()) return payload;
  if (task?.title) return task.title;
  const id = String(task?.id || '');
  return id ? `任務 ${id.slice(0, 8)}` : '未命名任務';
}

function taskProgress(task) {
  const payload = task?.payload;
  if (payload && typeof payload === 'object' && payload.progress != null) return clamp(payload.progress, 0, 100);
  if (task?.progress != null) return clamp(task.progress, 0, 100);
  return task?.status === 'running' ? 12 : 0;
}

function emptyChannels() {
  return Array.from({ length: CHANNEL_COUNT }, (_, channelId) => ({
    channelId,
    running: null,
    waiting: [],
    runningCount: 0,
    waitingCount: 0,
  }));
}

function channelsFromTasks(tasks = []) {
  const channels = emptyChannels();
  for (const task of tasks) {
    const id = asChannelId(task.channelId);
    if (id == null) continue;
    const channel = channels[id];
    if (task.status === 'running' && !channel.running) channel.running = task;
    else if (task.status === 'waiting') channel.waiting.push(task);
  }
  for (const channel of channels) {
    channel.waiting.sort((a, b) => (a.enqueueSeq ?? 0) - (b.enqueueSeq ?? 0));
    channel.runningCount = channel.running ? 1 : 0;
    channel.waitingCount = channel.waiting.length;
  }
  return channels;
}

function normalizeChannels(input) {
  if (!Array.isArray(input) || input.length === 0) return emptyChannels();
  const base = emptyChannels();
  for (const raw of input) {
    const id = asChannelId(raw.channelId ?? raw.id);
    if (id == null) continue;
    const runningList = raw.running ? (Array.isArray(raw.running) ? raw.running : [raw.running]) : [];
    const running = runningList.find(Boolean) || null;
    const waiting = Array.isArray(raw.waiting) ? [...raw.waiting] : [];
    waiting.sort((a, b) => (a.enqueueSeq ?? 0) - (b.enqueueSeq ?? 0));
    base[id] = {
      channelId: id,
      running,
      waiting: waiting.slice(0, MAX_WAITING_PER_CHANNEL),
      runningCount: running ? 1 : raw.runningCount || 0,
      waitingCount: raw.waitingCount ?? waiting.length,
    };
  }
  return base;
}

function buildDemoSnapshot() {
  const now = Date.now();
  const iso = (ms) => new Date(now - ms).toISOString();
  const task = (partial) => ({
    attempt: partial.status === 'waiting' ? 0 : 1,
    maxAttempts: 3,
    createdAt: iso(120000),
    updatedAt: iso(10000),
    enqueueSeq: 0,
    payload: {},
    ...partial,
  });
  const channels = [
    {
      channelId: 0,
      running: task({ id: 'ing-21', channelId: 0, status: 'running', startedAt: iso(80000), payload: { title: '婚禮午後段 · 記憶卡匯入', progress: 64 }, enqueueSeq: 21 }),
      waiting: [task({ id: 'ing-22', channelId: 0, status: 'waiting', payload: { title: '迎娶前段 · 補傳 RAW' }, createdAt: iso(70000), enqueueSeq: 22 })],
    },
    {
      channelId: 3,
      running: task({ id: 'dev-08', channelId: 3, status: 'running', startedAt: iso(45000), payload: { title: '教堂室內 · 曝光與白平衡', progress: 41 }, enqueueSeq: 8 }),
      waiting: [],
    },
    {
      channelId: 4,
      running: task({ id: 'ret-14', channelId: 4, status: 'running', startedAt: iso(30000), payload: { title: '主婚紗 · 皮膚與禮服層次', progress: 78 }, enqueueSeq: 14 }),
      waiting: [
        task({ id: 'ret-15', channelId: 4, status: 'waiting', payload: { title: '全家福 · 合照修臉' }, createdAt: iso(55000), enqueueSeq: 15 }),
        task({ id: 'ret-16', channelId: 4, status: 'waiting', payload: { title: '戒指特寫 · 去塵' }, createdAt: iso(40000), enqueueSeq: 16 }),
      ],
    },
    {
      channelId: 5,
      running: task({ id: 'col-05', channelId: 5, status: 'running', startedAt: iso(18000), payload: { title: '金色時刻 · 電影調色', progress: 22 }, enqueueSeq: 5 }),
      waiting: [task({ id: 'col-06', channelId: 5, status: 'waiting', payload: { title: '夜宴燈光 · 色溫統一' }, createdAt: iso(25000), enqueueSeq: 6 })],
    },
    {
      channelId: 6,
      running: null,
      waiting: [
        task({ id: 'exp-03', channelId: 6, status: 'waiting', payload: { title: '客戶預覽 JPEG · 全套匯出' }, createdAt: iso(20000), enqueueSeq: 30 }),
        task({ id: 'exp-04', channelId: 6, status: 'waiting', payload: { title: '印刷 TIFF 300dpi' }, createdAt: iso(15000), enqueueSeq: 31 }),
      ],
    },
  ];
  const filled = normalizeChannels(channels);
  const waitingTasks = filled.flatMap((ch) => ch.waiting);
  const running = filled.map((ch) => ch.running).filter(Boolean);
  const succeeded = [
    task({ id: 'ok-01', channelId: 4, status: 'succeeded', finishedAt: iso(180000), payload: { title: '進場儀式 · 主圖精修' }, enqueueSeq: 4 }),
    task({ id: 'ok-02', channelId: 6, status: 'succeeded', finishedAt: iso(300000), payload: { title: '社群套版 · 1:1 / 4:5' }, enqueueSeq: 2 }),
    task({ id: 'ok-03', channelId: 1, status: 'succeeded', finishedAt: iso(420000), payload: { title: '上午儀式 · 編目完成' }, enqueueSeq: 1 }),
  ];
  const failed = [
    task({ id: 'fail-01', channelId: 3, status: 'failed', finishedAt: iso(90000), lastError: '來源解析度不足，顯影無法穩定放大', payload: { title: '舊底片掃描 · 4K 放大' }, attempt: 3, enqueueSeq: 11 }),
    task({ id: 'fail-02', channelId: 6, status: 'failed', finishedAt: iso(240000), lastError: '通道逾時，請降低批次或重試', payload: { title: '雲端打包 · 原圖 ZIP' }, attempt: 2, enqueueSeq: 9 }),
  ];
  return {
    version: 1,
    savedAt: new Date(now).toISOString(),
    nextEnqueueSeq: 32,
    runningCount: running.length,
    waitingCount: waitingTasks.length,
    tasks: [...running, ...waitingTasks, ...succeeded, ...failed],
    channels: filled,
    succeeded,
    failed,
  };
}

function CapacityBar({ value, max, tone = 'accent', label }) {
  const safeMax = Math.max(1, Number(max) || 1);
  const safeValue = clamp(value, 0, safeMax);
  const pct = clamp((safeValue / safeMax) * 100, 0, 100);
  const over = Number(value) > Number(max);
  return (
    <div className="qp-meter">
      <div
        className={`qp-meter__fill qp-meter__fill--${over ? 'danger' : tone}`}
        style={{ width: `${pct}%` }}
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={safeValue}
        aria-label={label}
      />
    </div>
  );
}

function StatusBadge({ status }) {
  const key = status === 'completed' ? 'succeeded' : status;
  return (
    <span className={`qp-badge qp-badge--${key}`}>
      <span className="qp-badge__dot" aria-hidden="true" />
      {STATUS_LABEL[key] || key}
    </span>
  );
}

function TaskRow({ task, order, channelName, pending, showCancel, showRetry, onCancel, onRetry }) {
  const status = task.status === 'completed' ? 'succeeded' : task.status;
  const progress = taskProgress(task);
  const timeHint = formatRelative(task.finishedAt || task.startedAt || task.updatedAt || task.createdAt);
  const error = task.lastError || task.error;
  return (
    <article className={`qp-task qp-task--${status}`}>
      <div className="qp-task__index" aria-hidden="true">
        {order != null ? String(order).padStart(2, '0') : '•'}
      </div>
      <div className="qp-task__body">
        <div className="qp-task__top">
          <h3 className="qp-task__title">{taskTitle(task)}</h3>
          <StatusBadge status={status} />
        </div>
        <div className="qp-task__meta">
          <span className="qp-task__channel">{channelName}</span>
          {timeHint ? <span className="qp-task__time">{timeHint}</span> : null}
          {task.maxAttempts ? (
            <span className="qp-task__attempt">嘗試 {task.attempt ?? 0}/{task.maxAttempts}</span>
          ) : null}
        </div>
        {status === 'running' ? (
          <div className="qp-task__progress">
            <CapacityBar value={progress} max={100} tone="running" label={`${taskTitle(task)} 進度 ${Math.round(progress)}%`} />
            <span className="qp-task__pct">{Math.round(progress)}%</span>
          </div>
        ) : null}
        {status === 'failed' && error ? <p className="qp-task__error">{error}</p> : null}
      </div>
      {showCancel || showRetry ? (
        <div className="qp-task__actions">
          {showCancel ? (
            <button type="button" className="qp-btn qp-btn--ghost" disabled={pending} aria-label="取消等待任務" onClick={() => onCancel(task.id)}>
              {pending ? '取消中' : '取消'}
            </button>
          ) : null}
          {showRetry ? (
            <button type="button" className="qp-btn qp-btn--primary" disabled={pending} aria-label="重試失敗任務" onClick={() => onRetry(task.id)}>
              {pending ? '重試中' : '重試'}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function ChannelCard({ channel, name, pendingIds, canCancel, onCancel }) {
  const running = channel.running;
  const waiting = (channel.waiting || []).slice(0, MAX_WAITING_PER_CHANNEL);
  const used = running ? 1 : 0;
  const waitingCount = channel.waitingCount ?? waiting.length;
  const busy = Boolean(running) || waiting.length > 0;
  const hiddenWaiting = Math.max(0, (channel.waiting || []).length - waiting.length);
  return (
    <details className={`qp-channel${busy ? ' qp-channel--busy' : ''}`} open={busy}>
      <summary className="qp-channel__summary">
        <div className="qp-channel__id">CH {channel.channelId}</div>
        <div className="qp-channel__copy">
          <h3 className="qp-channel__name">{name}</h3>
          <p className="qp-channel__cap">
            執行 {used}/{MAX_RUNNING_PER_CHANNEL} · 等待 {waitingCount}/{MAX_WAITING_PER_CHANNEL}
          </p>
        </div>
        <div className="qp-channel__meters">
          <CapacityBar value={used} max={MAX_RUNNING_PER_CHANNEL} tone={used ? 'running' : 'accent'} label={`${name} 執行容量 ${used}/${MAX_RUNNING_PER_CHANNEL}`} />
          <CapacityBar value={waitingCount} max={MAX_WAITING_PER_CHANNEL} tone={waitingCount >= MAX_WAITING_PER_CHANNEL ? 'warn' : 'accent'} label={`${name} 等待容量 ${waitingCount}/${MAX_WAITING_PER_CHANNEL}`} />
        </div>
      </summary>
      <div className="qp-channel__body">
        <p className="qp-channel__label">正在執行</p>
        {running ? <TaskRow task={running} channelName={name} /> : <p className="qp-empty qp-empty--compact">此通道目前沒有執行中的任務</p>}
        <p className="qp-channel__label">等待中（最多 {MAX_WAITING_PER_CHANNEL} 筆）</p>
        {waiting.length === 0 ? (
          <p className="qp-empty qp-empty--compact">佇列是空的</p>
        ) : (
          <ul className="qp-list">
            {waiting.map((task, index) => (
              <li key={task.id}>
                <TaskRow task={task} order={index + 1} channelName={name} pending={pendingIds.has(task.id)} showCancel={canCancel} onCancel={onCancel} />
              </li>
            ))}
          </ul>
        )}
        {hiddenWaiting > 0 ? <p className="qp-more">另有 {hiddenWaiting} 筆未顯示</p> : null}
      </div>
    </details>
  );
}

export default function QueuePanel({
  snapshot,
  channels,
  tasks,
  waiting,
  completed,
  failed,
  stats,
  channelNames = DEFAULT_CHANNEL_NAMES,
  maxParallel = MAX_PARALLEL,
  maxWaiting = MAX_WAITING,
  onCancel,
  onRetry,
  className = '',
}) {
  const unmanaged = snapshot == null && channels == null && tasks == null && waiting == null && completed == null && failed == null;
  const demo = useMemo(() => (unmanaged ? buildDemoSnapshot() : null), [unmanaged]);
  const [localSnapshot, setLocalSnapshot] = useState(demo);
  const [pendingIds, setPendingIds] = useState(() => new Set());
  const source = snapshot || localSnapshot;

  const flattened = useMemo(
    () => [
      ...(Array.isArray(waiting) ? waiting : []),
      ...(Array.isArray(completed) ? completed : []),
      ...(Array.isArray(failed) ? failed : []),
    ],
    [waiting, completed, failed],
  );

  const resolvedChannels = useMemo(() => {
    if (channels) return normalizeChannels(channels);
    if (source?.channels) return normalizeChannels(source.channels);
    if (tasks) return channelsFromTasks(tasks);
    if (source?.tasks) return channelsFromTasks(source.tasks);
    if (flattened.length) return channelsFromTasks(flattened);
    return emptyChannels();
  }, [channels, tasks, source, flattened]);

  const allTasks = useMemo(() => {
    if (Array.isArray(tasks) && tasks.length) return tasks;
    if (Array.isArray(source?.tasks) && source.tasks.length) return source.tasks;
    const collected = [];
    for (const channel of resolvedChannels) {
      if (channel.running) collected.push(channel.running);
      collected.push(...(channel.waiting || []));
    }
    collected.push(...flattened);
    return collected;
  }, [tasks, source, resolvedChannels, flattened]);

  const resolvedFailed = useMemo(() => {
    if (Array.isArray(failed)) return failed;
    if (Array.isArray(source?.failed)) return source.failed;
    return allTasks.filter((task) => task.status === 'failed');
  }, [failed, source, allTasks]);

  const resolvedSucceeded = useMemo(() => {
    const list = Array.isArray(completed)
      ? completed
      : Array.isArray(source?.succeeded)
        ? source.succeeded
        : allTasks.filter((task) => task.status === 'succeeded' || task.status === 'completed');
    return [...list].sort((a, b) => {
      const ta = new Date(a.finishedAt || a.updatedAt || 0).getTime();
      const tb = new Date(b.finishedAt || b.updatedAt || 0).getTime();
      return tb - ta;
    });
  }, [completed, source, allTasks]);

  const runningCount = stats?.running ?? source?.runningCount ?? resolvedChannels.reduce((sum, channel) => sum + (channel.running ? 1 : 0), 0);
  const waitingCount = stats?.waiting ?? source?.waitingCount ?? resolvedChannels.reduce((sum, channel) => sum + (channel.waitingCount ?? channel.waiting.length), 0);
  const completedCount = stats?.completed ?? resolvedSucceeded.length;
  const parallelCap = stats?.maxParallel ?? maxParallel;
  const waitingCap = stats?.maxWaiting ?? maxWaiting;
  const canCancel = unmanaged || typeof onCancel === 'function';
  const canRetry = unmanaged || typeof onRetry === 'function';

  const markPending = useCallback((id, on) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleCancel = useCallback(async (taskId) => {
    markPending(taskId, true);
    try {
      if (onCancel) await onCancel(taskId);
      if (unmanaged) {
        setLocalSnapshot((prev) => {
          const stamp = new Date().toISOString();
          const nextTasks = (prev?.tasks || []).map((task) =>
            task.id === taskId && task.status === 'waiting'
              ? { ...task, status: 'cancelled', updatedAt: stamp, finishedAt: stamp }
              : task,
          );
          return {
            ...prev,
            tasks: nextTasks,
            channels: channelsFromTasks(nextTasks),
            waitingCount: nextTasks.filter((task) => task.status === 'waiting').length,
            runningCount: nextTasks.filter((task) => task.status === 'running').length,
            failed: prev?.failed || [],
            succeeded: prev?.succeeded || [],
          };
        });
      }
    } finally {
      markPending(taskId, false);
    }
  }, [onCancel, unmanaged, markPending]);

  const handleRetry = useCallback(async (taskId) => {
    markPending(taskId, true);
    try {
      if (onRetry) await onRetry(taskId);
      if (unmanaged) {
        setLocalSnapshot((prev) => {
          const target = [...(prev?.failed || []), ...(prev?.tasks || [])].find((task) => task.id === taskId);
          if (!target) return prev;
          const retried = {
            ...target,
            status: 'waiting',
            lastError: undefined,
            attempt: target.attempt || 0,
            updatedAt: new Date().toISOString(),
            enqueueSeq: prev?.nextEnqueueSeq || 1,
          };
          const nextTasks = [...(prev?.tasks || []).filter((task) => task.id !== taskId), retried];
          return {
            ...prev,
            nextEnqueueSeq: (prev?.nextEnqueueSeq || 1) + 1,
            tasks: nextTasks,
            channels: channelsFromTasks(nextTasks),
            failed: (prev?.failed || []).filter((task) => task.id !== taskId),
            succeeded: prev?.succeeded || [],
            waitingCount: nextTasks.filter((task) => task.status === 'waiting').length,
            runningCount: nextTasks.filter((task) => task.status === 'running').length,
          };
        });
      }
    } finally {
      markPending(taskId, false);
    }
  }, [onRetry, unmanaged, markPending]);

  const names = Array.from({ length: CHANNEL_COUNT }, (_, index) => channelNames[index] || `通道 ${index}`);

  return (
    <section className={`qp-panel ${className}`.trim()} aria-labelledby="qp-panel-title">
      <header className="qp-hero">
        <div className="qp-hero__copy">
          <p className="qp-kicker">攝影工作流代理</p>
          <h2 id="qp-panel-title" className="qp-title">任務佇列</h2>
          <p className="qp-subtitle">10 條通道各 1 個執行槽、各 10 筆等待；全域並行 {parallelCap}、等待 {waitingCap}。</p>
        </div>
      </header>
      <div className="qp-stats" role="group" aria-label="全域佇列統計" aria-live="polite">
        <article className="qp-stat">
          <div className="qp-stat__label">目前並行</div>
          <div className="qp-stat__value"><strong>{runningCount}</strong><span> / {parallelCap}</span></div>
          <CapacityBar value={runningCount} max={parallelCap} tone={runningCount >= parallelCap ? 'warn' : 'accent'} label={`目前並行 ${runningCount} / ${parallelCap}`} />
        </article>
        <article className="qp-stat">
          <div className="qp-stat__label">等待中</div>
          <div className="qp-stat__value"><strong>{waitingCount}</strong><span> / {waitingCap}</span></div>
          <CapacityBar value={waitingCount} max={waitingCap} tone={waitingCount >= waitingCap ? 'danger' : waitingCount > waitingCap * 0.8 ? 'warn' : 'accent'} label={`等待中 ${waitingCount} / ${waitingCap}`} />
        </article>
        <article className="qp-stat">
          <div className="qp-stat__label">已完成</div>
          <div className="qp-stat__value"><strong>{completedCount}</strong></div>
          <p className="qp-stat__hint">累計成功筆數</p>
        </article>
      </div>
      <section className="qp-block" aria-labelledby="qp-channels-title">
        <div className="qp-block__head">
          <h3 id="qp-channels-title">通道狀態</h3>
          <span className="qp-block__count">{CHANNEL_COUNT} 通道</span>
        </div>
        <div className="qp-channels">
          {resolvedChannels.map((channel) => (
            <ChannelCard key={channel.channelId} channel={channel} name={names[channel.channelId]} pendingIds={pendingIds} canCancel={canCancel} onCancel={handleCancel} />
          ))}
        </div>
      </section>
      <div className="qp-grid qp-grid--split">
        <section className="qp-block" aria-labelledby="qp-failed-title">
          <div className="qp-block__head">
            <h3 id="qp-failed-title">失敗</h3>
            <span className="qp-block__count">{resolvedFailed.length} 筆</span>
          </div>
          {resolvedFailed.length === 0 ? <p className="qp-empty">沒有失敗任務</p> : (
            <ul className="qp-list">
              {resolvedFailed.map((task) => (
                <li key={task.id}>
                  <TaskRow task={task} channelName={names[asChannelId(task.channelId) ?? 0]} pending={pendingIds.has(task.id)} showRetry={canRetry} onRetry={handleRetry} />
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="qp-block" aria-labelledby="qp-done-title">
          <div className="qp-block__head">
            <h3 id="qp-done-title">最近完成</h3>
            <span className="qp-block__count">{resolvedSucceeded.length} 筆</span>
          </div>
          {resolvedSucceeded.length === 0 ? <p className="qp-empty">尚無完成紀錄</p> : (
            <ul className="qp-list">
              {resolvedSucceeded.slice(0, 8).map((task) => (
                <li key={task.id}>
                  <TaskRow task={task} channelName={names[asChannelId(task.channelId) ?? 0]} />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  );
}
