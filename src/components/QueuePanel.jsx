/**
 * QueuePanel — 攝影代理任務佇列面板
 *
 * Branch ownership: feat/queue-panel
 * Files: src/components/QueuePanel.jsx + src/components/QueuePanel.css
 *
 * Presentational panel for multi-channel job queues.
 * Mutations stay in the parent via onCancel / onRetry so other branches
 * can wire a store or API without editing this file.
 *
 * Task:
 *   {
 *     id: string,
 *     title: string,
 *     channelId?: string,
 *     channelName?: string,
 *     status?: 'running' | 'waiting' | 'completed' | 'failed',
 *     order?: number,
 *     progress?: number,
 *     error?: string,
 *     createdAt?: string | number,
 *     startedAt?: string | number,
 *     finishedAt?: string | number
 *   }
 *
 * Channel:
 *   { id, name, capacity?: number, running?: Task[] }
 *
 * Props:
 *   channels, running, waiting, completed, failed, stats,
 *   maxParallel, maxWaiting, onCancel(taskId), onRetry(taskId), className
 */

import { useMemo, useState } from 'react';
import './QueuePanel.css';

export const MAX_PARALLEL = 10;
export const MAX_WAITING = 100;
export const WAITING_PREVIEW = 10;

const STATUS_LABEL = {
  running: '執行中',
  waiting: '等待中',
  completed: '已完成',
  failed: '失敗',
};

const DEMO_CHANNELS = [
  {
    id: 'grade',
    name: '調色',
    capacity: 3,
    running: [
      {
        id: 'r-grade-1',
        title: 'IMG_2048 晴天色溫',
        channelId: 'grade',
        channelName: '調色',
        status: 'running',
        progress: 68,
        startedAt: Date.now() - 72_000,
      },
      {
        id: 'r-grade-2',
        title: '婚紗紀念盤 LUT',
        channelId: 'grade',
        channelName: '調色',
        status: 'running',
        progress: 31,
        startedAt: Date.now() - 28_000,
      },
    ],
  },
  {
    id: 'retouch',
    name: '精修',
    capacity: 2,
    running: [
      {
        id: 'r-retouch-1',
        title: '人像皮膚 + 去背',
        channelId: 'retouch',
        channelName: '精修',
        status: 'running',
        progress: 91,
        startedAt: Date.now() - 140_000,
      },
    ],
  },
  {
    id: 'export',
    name: '輸出',
    capacity: 2,
    running: [],
  },
  {
    id: 'publish',
    name: '發佈',
    capacity: 1,
    running: [],
  },
];

const DEMO_WAITING = [
  { id: 'w-01', title: '家庭寫真調色批次', channelId: 'grade', channelName: '調色', status: 'waiting', order: 1 },
  { id: 'w-02', title: '封面海報 4K 輸出', channelId: 'export', channelName: '輸出', status: 'waiting', order: 2 },
  { id: 'w-03', title: '夜景降噪精修', channelId: 'retouch', channelName: '精修', status: 'waiting', order: 3 },
  { id: 'w-04', title: 'LINE 社群帖發佈', channelId: 'publish', channelName: '發佈', status: 'waiting', order: 4 },
  { id: 'w-05', title: '產品平面紀錄調色', channelId: 'grade', channelName: '調色', status: 'waiting', order: 5 },
  { id: 'w-06', title: '官網縮圖 WebP', channelId: 'export', channelName: '輸出', status: 'waiting', order: 6 },
  { id: 'w-07', title: '師長謝幕去水印', channelId: 'retouch', channelName: '精修', status: 'waiting', order: 7 },
  { id: 'w-08', title: 'IG 限時動態切割', channelId: 'export', channelName: '輸出', status: 'waiting', order: 8 },
  { id: 'w-09', title: '圖庫備份上傳', channelId: 'publish', channelName: '發佈', status: 'waiting', order: 9 },
  { id: 'w-10', title: '團圓合照統一白平衡', channelId: 'grade', channelName: '調色', status: 'waiting', order: 10 },
  { id: 'w-11', title: '後補影像 TIFF 匯出', channelId: 'export', channelName: '輸出', status: 'waiting', order: 11 },
  { id: 'w-12', title: '季度相冊 PDF', channelId: 'export', channelName: '輸出', status: 'waiting', order: 12 },
];

const DEMO_COMPLETED = [
  { id: 'c-01', title: 'IMG_2041 已匯出', channelName: '輸出', status: 'completed', finishedAt: Date.now() - 420_000 },
  { id: 'c-02', title: '社廟活動海報', channelName: '調色', status: 'completed', finishedAt: Date.now() - 900_000 },
  { id: 'c-03', title: '官網首圖精修', channelName: '精修', status: 'completed', finishedAt: Date.now() - 1_260_000 },
];

const DEMO_FAILED = [
  {
    id: 'f-01',
    title: '夜間降噪批次',
    channelName: '精修',
    status: 'failed',
    error: '模型逾時：推理超過 90 秒未回應',
    finishedAt: Date.now() - 180_000,
  },
  {
    id: 'f-02',
    title: 'Drive 圖庫同步',
    channelName: '發佈',
    status: 'failed',
    error: '權限不足，無法寫入目標資料夾',
    finishedAt: Date.now() - 60_000,
  },
];

function clamp(n, min, max) {
  const value = Number(n);
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function formatClock(value) {
  if (value == null || value === '') return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
}

function isEmptyLists({ channels, running, waiting, completed, failed }) {
  return (
    (!channels || channels.length === 0) &&
    (!running || running.length === 0) &&
    (!waiting || waiting.length === 0) &&
    (!completed || completed.length === 0) &&
    (!failed || failed.length === 0)
  );
}

function groupRunningByChannel(running = [], channels = []) {
  const map = new Map();
  channels.forEach((channel) => {
    map.set(channel.id, [...(channel.running || [])]);
  });
  running.forEach((task) => {
    const key = task.channelId || 'default';
    if (!map.has(key)) map.set(key, []);
    const list = map.get(key);
    if (!list.some((item) => item.id === task.id)) list.push(task);
  });
  return map;
}

function buildChannels(channels = [], running = []) {
  const grouped = groupRunningByChannel(running, channels);
  const ids = new Set([
    ...channels.map((channel) => channel.id),
    ...[...grouped.keys()],
  ]);

  return [...ids].map((id) => {
    const source = channels.find((channel) => channel.id === id);
    const runningTasks = grouped.get(id) || [];
    const capacity = Math.max(
      1,
      Number(source?.capacity) || runningTasks.length || 1,
    );
    return {
      id,
      name: source?.name || runningTasks[0]?.channelName || id,
      capacity,
      running: runningTasks,
    };
  });
}

function deriveStats({ channels, waiting, completed, stats, maxParallel, maxWaiting }) {
  const runningCount = channels.reduce(
    (sum, channel) => sum + (channel.running?.length || 0),
    0,
  );
  return {
    running: stats?.running ?? runningCount,
    waiting: stats?.waiting ?? waiting.length,
    completed: stats?.completed ?? completed.length,
    maxParallel: stats?.maxParallel ?? maxParallel,
    maxWaiting: stats?.maxWaiting ?? maxWaiting,
  };
}

function ProgressBar({ value = 0, max = 100, tone = 'gen', label }) {
  const safeMax = Math.max(1, Number(max) || 1);
  const ratio = clamp((Number(value) || 0) / safeMax, 0, 1);
  return (
    <div className="qp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={safeMax} aria-valuenow={Math.round(ratio * safeMax)} aria-label={label}>
      <span className={`qp-bar-fill qp-bar-fill--${tone}`} style={{ width: `${ratio * 100}%` }} />
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`qp-badge qp-badge--${status || 'waiting'}`}>
      <span className="qp-badge-dot" aria-hidden="true" />
      {STATUS_LABEL[status] || status || '等待中'}
    </span>
  );
}

function TaskMeta({ task }) {
  const time = formatClock(task.startedAt || task.finishedAt || task.createdAt);
  return (
    <p className="qp-task-meta">
      {task.channelName ? <span>{task.channelName}</span> : null}
      {time ? <span>{time}</span> : null}
    </p>
  );
}

function RunningRow({ task }) {
  const progress = clamp(task.progress ?? 0, 0, 100);
  return (
    <article className="qp-task qp-task--running">
      <div className="qp-task-head">
        <h4 className="qp-task-title">{task.title}</h4>
        <span className="qp-task-pct">{Math.round(progress)}%</span>
      </div>
      <ProgressBar value={progress} max={100} tone="gen" label={`${task.title} 進度`} />
    </article>
  );
}

function WaitingRow({ task, index, onCancel, canCancel }) {
  const order = task.order ?? index + 1;
  return (
    <article className="qp-row">
      <span className="qp-order" aria-label={`順序 ${order}`}>
        {String(order).padStart(2, '0')}
      </span>
      <div className="qp-row-body">
        <h4 className="qp-task-title">{task.title}</h4>
        <TaskMeta task={task} />
      </div>
      <button
        type="button"
        className="qp-btn qp-btn--ghost"
        onClick={() => onCancel?.(task.id)}
        disabled={!canCancel}
        aria-label={`取消等待：${task.title}`}
      >
        取消
      </button>
    </article>
  );
}

function ResultRow({ task, onRetry, canRetry }) {
  const failed = task.status === 'failed';
  return (
    <article className={`qp-row qp-row--${failed ? 'failed' : 'completed'}`}>
      <StatusBadge status={failed ? 'failed' : 'completed'} />
      <div className="qp-row-body">
        <h4 className="qp-task-title">{task.title}</h4>
        <TaskMeta task={task} />
        {failed && task.error ? <p className="qp-error">{task.error}</p> : null}
      </div>
      {failed ? (
        <button
          type="button"
          className="qp-btn qp-btn--accent"
          onClick={() => onRetry?.(task.id)}
          disabled={!canRetry}
          aria-label={`重試失敗：${task.title}`}
        >
          重試
        </button>
      ) : null}
    </article>
  );
}

function ChannelCard({ channel }) {
  const used = channel.running.length;
  const capacity = Math.max(1, channel.capacity || used || 1);
  const idle = used === 0;
  return (
    <section className={`qp-channel${idle ? ' qp-channel--idle' : ''}`}>
      <header className="qp-channel-head">
        <div>
          <h3 className="qp-channel-name">{channel.name}</h3>
          <p className="qp-channel-sub">{idle ? '空閒中' : `執行 ${used} 筆`}</p>
        </div>
        <span className="qp-channel-cap">{used}/{capacity}</span>
      </header>
      <ProgressBar
        value={used}
        max={capacity}
        tone={used >= capacity ? 'warn' : 'gen'}
        label={`${channel.name} 容量 ${used}/${capacity}`}
      />
      {idle ? (
        <p className="qp-empty qp-empty--compact">此通道目前沒有執行中的任務</p>
      ) : (
        <div className="qp-channel-tasks">
          {channel.running.map((task) => (
            <RunningRow key={task.id} task={task} />
          ))}
        </div>
      )}
    </section>
  );
}

function StatCard({ label, value, max, tone, hint }) {
  return (
    <article className="qp-stat">
      <p className="qp-stat-label">{label}</p>
      <p className="qp-stat-value">
        <strong>{value}</strong>
        {max != null ? <span className="qp-stat-max">/{max}</span> : null}
      </p>
      {max != null ? <ProgressBar value={value} max={max} tone={tone} label={`${label} ${value}/${max}`} /> : <div className="qp-bar qp-bar--ghost" />}
      {hint ? <p className="qp-stat-hint">{hint}</p> : null}
    </article>
  );
}

export default function QueuePanel({
  channels = [],
  running = [],
  waiting = [],
  completed = [],
  failed = [],
  stats,
  maxParallel = MAX_PARALLEL,
  maxWaiting = MAX_WAITING,
  onCancel,
  onRetry,
  className = '',
}) {
  const unmanaged = isEmptyLists({ channels, running, waiting, completed, failed });
  const [demo, setDemo] = useState(() => ({
    channels: DEMO_CHANNELS,
    waiting: DEMO_WAITING,
    completed: DEMO_COMPLETED,
    failed: DEMO_FAILED,
  }));

  const model = unmanaged ? demo : { channels, waiting, completed, failed, running };

  const resolvedChannels = useMemo(
    () => buildChannels(model.channels, model.running || running),
    [model.channels, model.running, running],
  );

  const resolvedWaiting = model.waiting || [];
  const resolvedCompleted = model.completed || [];
  const resolvedFailed = model.failed || [];
  const previewWaiting = resolvedWaiting.slice(0, WAITING_PREVIEW);
  const hiddenWaiting = Math.max(0, resolvedWaiting.length - previewWaiting.length);

  const board = deriveStats({
    channels: resolvedChannels,
    waiting: resolvedWaiting,
    completed: resolvedCompleted,
    stats,
    maxParallel,
    maxWaiting,
  });

  const handleCancel = (taskId) => {
    if (onCancel) {
      onCancel(taskId);
      return;
    }
    if (!unmanaged) return;
    setDemo((current) => ({
      ...current,
      waiting: current.waiting.filter((task) => task.id !== taskId),
    }));
  };

  const handleRetry = (taskId) => {
    if (onRetry) {
      onRetry(taskId);
      return;
    }
    if (!unmanaged) return;
    setDemo((current) => {
      const target = current.failed.find((task) => task.id === taskId);
      if (!target) return current;
      const nextWaiting = [
        ...current.waiting,
        {
          ...target,
          status: 'waiting',
          error: undefined,
          order: current.waiting.length + 1,
        },
      ];
      return {
        ...current,
        failed: current.failed.filter((task) => task.id !== taskId),
        waiting: nextWaiting,
      };
    });
  };

  const canCancel = Boolean(onCancel) || unmanaged;
  const canRetry = Boolean(onRetry) || unmanaged;
  const results = [
    ...resolvedFailed,
    ...resolvedCompleted,
  ];

  return (
    <section className={`qp ${className}`.trim()} aria-labelledby="qp-title">
      <header className="qp-header">
        <div>
          <p className="qp-kicker">攝影代理</p>
          <h2 id="qp-title" className="qp-title">任務佇列</h2>
        </div>
        <span className="qp-live">
          <span className="qp-live-dot" aria-hidden="true" />
          即時
        </span>
      </header>

      <div className="qp-stats" aria-live="polite">
        <StatCard label="目前並行" value={board.running} max={board.maxParallel} tone={board.running >= board.maxParallel ? 'warn' : 'gen'} hint="全局最大 10 條並行" />
        <StatCard label="等待中" value={board.waiting} max={board.maxWaiting} tone={board.waiting >= board.maxWaiting ? 'danger' : 'warn'} hint="佇列容量 100 筆" />
        <StatCard label="已完成" value={board.completed} tone="good" hint="累計完成筆數" />
      </div>

      <div className="qp-section">
        <div className="qp-section-head">
          <h3 className="qp-section-title">通道執行中</h3>
          <span className="qp-section-count">{board.running} / {board.maxParallel}</span>
        </div>
        {resolvedChannels.length === 0 ? (
          <p className="qp-empty">目前沒有通道任務</p>
        ) : (
          <div className="qp-channel-grid">
            {resolvedChannels.map((channel) => (
              <ChannelCard key={channel.id} channel={channel} />
            ))}
          </div>
        )}
      </div>

      <div className="qp-section">
        <div className="qp-section-head">
          <h3 className="qp-section-title">等待任務</h3>
          <span className="qp-section-count">
            顯示 {previewWaiting.length} / {resolvedWaiting.length}
          </span>
        </div>
        {previewWaiting.length === 0 ? (
          <p className="qp-empty">佇列是空的</p>
        ) : (
          <div className="qp-list">
            {previewWaiting.map((task, index) => (
              <WaitingRow
                key={task.id}
                task={task}
                index={index}
                onCancel={handleCancel}
                canCancel={canCancel}
              />
            ))}
          </div>
        )}
        {hiddenWaiting > 0 ? (
          <p className="qp-more">另有 {hiddenWaiting} 筆未顯示（上限 {board.maxWaiting}）</p>
        ) : null}
      </div>

      <div className="qp-section">
        <div className="qp-section-head">
          <h3 className="qp-section-title">完成與失敗</h3>
          <span className="qp-section-count">
            完成 {resolvedCompleted.length} · 失敗 {resolvedFailed.length}
          </span>
        </div>
        {results.length === 0 ? (
          <p className="qp-empty">尚無完成或失敗記錄</p>
        ) : (
          <div className="qp-list">
            {results.map((task) => (
              <ResultRow
                key={task.id}
                task={task}
                onRetry={handleRetry}
                canRetry={canRetry}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
