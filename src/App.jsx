import { useCallback, useEffect, useMemo, useState } from "react";
import Overview from "./components/Overview.jsx";
import Conversation from "./components/Conversation.jsx";
import Queue from "./components/Queue.jsx";
import ProjectSettings from "./components/ProjectSettings.jsx";
import LensScene from "./components/LensScene.jsx";
import "./styles/tokens.css";
import "./styles/layout.css";

const CHANNELS = [
  { id: "overview", index: "01", label: "Overview", meta: "總覽", slot: "Overview" },
  { id: "lens-scene", index: "02", label: "Lens / Scene", meta: "鏡頭場景", slot: "LensScene" },
  { id: "capture", index: "03", label: "Capture", meta: "拍攝", slot: null },
  { id: "library", index: "04", label: "Library", meta: "素材庫", slot: null },
  { id: "color", index: "05", label: "Color", meta: "調光", slot: null },
  { id: "conversation", index: "06", label: "Conversation", meta: "對話", slot: "Conversation" },
  { id: "queue", index: "07", label: "Queue", meta: "使列", slot: "Queue" },
  { id: "delivery", index: "08", label: "Delivery", meta: "交付", slot: null },
  { id: "project-settings", index: "09", label: "Project Settings", meta: "專案設定", slot: "ProjectSettings" },
  { id: "system", index: "10", label: "System", meta: "系統", slot: null },
];

const SLOT_PANELS = {
  capture: {
    kicker: "03  Capture",
    title: "拍攝控制台",
    lede: "即時監看快門、感光度與目前鏡次。此通道可直接操作，無需離開工作台。",
    metrics: [
      { label: "Take", value: "A-014", note: "主鏡頭 · 35mm" },
      { label: "Shutter", value: "1/125", note: "同步棚燈" },
      { label: "ISO", value: "200", note: "低噪點優先" },
      { label: "WB", value: "5600K", note: "日光平衡" },
    ],
    actions: ["備妤下一鏡", "標記合格", "重拍"],
  },
  library: {
    kicker: "04  Library",
    title: "素材庫",
    lede: "依鏡次、場景與色彩版本瀏覽已入庫檔案。",
    metrics: [
      { label: "Raws", value: "428", note: "本專案" },
      { label: "Selects", value: "36", note: "待調光" },
      { label: "Hero", value: "8", note: "已鎖定" },
      { label: "Storage", value: "1.6 TB", note: "可用 4.2 TB" },
    ],
    actions: ["匯入卡片", "篩選 Selects", "開啟對稿"],
  },
  color: {
    kicker: "05  Color",
    title: "調光工作台",
    lede: "曝光、色溫與 LUT 預覽集中在同一資訊層級。",
    metrics: [
      { label: "LUT", value: "Film-239", note: "工作拷貝" },
      { label: "Exposure", value: "+0.15", note: "EV" },
      { label: "Temp", value: "5450K", note: "微暖" },
      { label: "Contrast", value: "1.04", note: "保留高光" },
    ],
    actions: ["套用 Look", "比對前一版", "輸出預覽"],
  },
  delivery: {
    kicker: "08  Delivery",
    title: "交付",
    lede: "匯出規格、目的地與簽核狀態一次看完。",
    metrics: [
      { label: "Preset", value: "Web-2K", note: "sRGB · H.264" },
      { label: "Prints", value: "Ready", note: "16-bit TIFF" },
      { label: "Client", value: "Review", note: "3 張待回" },
      { label: "Archive", value: "Queued", note: "LTO 夜間" },
    ],
    actions: ["匯出 Selects", "送審", "封存專案"],
  },
  system: {
    kicker: "10  System",
    title: "系統",
    lede: "工作站健康狀態與版本，不阻斷拍攝流程。",
    metrics: [
      { label: "Console", value: "0.1.0", note: "photo-console-shell" },
      { label: "Cache", value: "72%", note: "預覽快取" },
      { label: "GPU", value: "Ready", note: "色彩預覽" },
      { label: "Clock", value: "Studio", note: "本地時區" },
    ],
    actions: ["清理快取", "檢查更新", "診斷報告"],
  },
};

const RESERVED = {
  Overview,
  LensScene,
  Conversation,
  Queue,
  ProjectSettings,
};

const STORAGE_KEY = "photo-console.active-channel";

function readStoredChannel() {
  try {
    const value = window.sessionStorage.getItem(STORAGE_KEY);
    if (CHANNELS.some((channel) => channel.id === value)) return value;
  } catch {
    /* private mode */
  }
  return "overview";
}

function SlotPanel({ channelId }) {
  const panel = SLOT_PANELS[channelId];
  if (!panel) return null;

  return (
    <section className="slot-panel" aria-labelledby={`slot-title-${channelId}`}>
      <p className="slot-kicker">{panel.kicker}</p>
      <h1 className="slot-title" id={`slot-title-${channelId}`}>
        {panel.title}
      </h1>
      <p className="slot-lede">{panel.lede}</p>
      <div className="slot-grid">
        {panel.metrics.map((metric) => (
          <article key={metric.label} className="metric-card">
            <span className="metric-label">{metric.label}</span>
            <strong className="metric-value">{metric.value}</strong>
            <span className="metric-note">{metric.note}</span>
          </article>
        ))}
      </div>
      <div className="slot-toolbar">
        {panel.actions.map((action) => (
          <button key={action} type="button" className="slot-action">
            {action}
          </button>
        ))}
      </div>
    </section>
  );
}

export default function App() {
  const [activeId, setActiveId] = useState(readStoredChannel);
  const [navOpen, setNavOpen] = useState(false);

  const active = useMemo(
    () => CHANNELS.find((channel) => channel.id === activeId) ?? CHANNELS[0],
    [activeId],
  );

  const selectChannel = useCallback((id) => {
    setActiveId(id);
    setNavOpen(false);
    try {
      window.sessionStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const onKey = (event) => {
      if (event.target instanceof HTMLElement) {
        const tag = event.target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || event.target.isContentEditable) return;
      }
      if (event.key === "Escape") {
        setNavOpen(false);
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const map = {
        1: "overview",
        2: "lens-scene",
        3: "capture",
        4: "library",
        5: "color",
        6: "conversation",
        7: "queue",
        8: "delivery",
        9: "project-settings",
        0: "system",
      };
      const next = map[event.key];
      if (next) selectChannel(next);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectChannel]);

  const ReservedView = active.slot ? RESERVED[active.slot] : null;

  return (
    <div className={`console-shell${navOpen ? " is-nav-open" : ""}`} data-channel={active.id}>
      <div className="nav-backdrop" hidden={!navOpen} onClick={() => setNavOpen(false)} />

      <aside className="console-rail" aria-label="製作通道">
        <div className="console-brand">
          <span className="brand-mark" aria-hidden="true" />
          <div>
            <p className="brand-name">Atelier</p>
            <p className="brand-sub">Photography Console</p>
          </div>
        </div>

        <p className="rail-label">Channels</p>
        <nav className="console-channels">
          {CHANNELS.map((channel) => (
            <button
              key={channel.id}
              type="button"
              className={`channel-btn${channel.id === active.id ? " is-active" : ""}`}
              aria-current={channel.id === active.id ? "page" : undefined}
              onClick={() => selectChannel(channel.id)}
            >
              <span className="channel-index">{channel.index}</span>
              <span className="channel-copy">
                <span className="channel-label">{channel.label}</span>
                <span className="channel-meta">{channel.meta}</span>
              </span>
            </button>
          ))}
        </nav>

        <div className="rail-footer">
          <span className="rail-status">
            <i className="status-live" />
            Live floor
          </span>
        </div>
      </aside>

      <div className="console-main">
        <header className="console-status">
          <div className="status-left">
            <button
              type="button"
              className="nav-toggle"
              aria-expanded={navOpen}
              aria-controls="mobile-channels"
              onClick={() => setNavOpen((open) => !open)}
            >
              通道
            </button>
            <div>
              <p className="status-project">LOOKBOOK / AW26</p>
              <p className="status-path">
                {active.index} · {active.label}
              </p>
            </div>
          </div>
          <div className="status-right">
            <span className="status-chip is-live">REC standby</span>
            <span className="status-chip is-ready">Grade ready</span>
          </div>
        </header>

        <main className="console-workspace" id="workspace">
          <div className="workspace-slot" data-channel={active.id}>
            {ReservedView ? <ReservedView /> : <SlotPanel channelId={active.id} />}
          </div>
        </main>
      </div>

      <nav className="console-bottom-nav" id="mobile-channels" aria-label="手機通道">
        {CHANNELS.map((channel) => (
          <button
            key={channel.id}
            type="button"
            className={`bottom-channel${channel.id === active.id ? " is-active" : ""}`}
            onClick={() => selectChannel(channel.id)}
          >
            <span className="bottom-index">{channel.index}</span>
            <span className="bottom-label">{channel.label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
