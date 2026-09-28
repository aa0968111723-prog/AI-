import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./ConversationPanel.css";

const DEFAULT_CHANNELS = [
  { id: "overview", index: "01", label: "Overview", meta: "總覽" },
  { id: "lens-scene", index: "02", label: "Lens / Scene", meta: "鏡頭場景" },
  { id: "capture", index: "03", label: "Capture", meta: "拍攝" },
  { id: "library", index: "04", label: "Library", meta: "素材庫" },
  { id: "color", index: "05", label: "Color", meta: "調光" },
  { id: "conversation", index: "06", label: "Conversation", meta: "對話" },
  { id: "queue", index: "07", label: "Queue", meta: "使列" },
  { id: "delivery", index: "08", label: "Delivery", meta: "交付" },
  { id: "project-settings", index: "09", label: "Project Settings", meta: "專案設定" },
  { id: "system", index: "10", label: "System", meta: "系統" },
];

function createId() {
  return `cp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function doneHistory(messages) {
  return (messages || [])
    .filter((msg) => msg.status === "done" && msg.content)
    .map((msg) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    }));
}

function normalizeResult(res) {
  if (res == null) {
    return { ok: false, error: { code: "EMPTY_RESPONSE", message: "沒有回覆" } };
  }
  if (typeof res === "string") {
    return { ok: true, content: res };
  }
  if (res.ok === false) {
    return {
      ok: false,
      error: {
        code: res.error?.code || "ERROR",
        message: res.error?.message || "派送失敗",
      },
    };
  }
  if (typeof res.content === "string") {
    return { ok: true, content: res.content, id: res.id };
  }
  if (typeof res.data?.content === "string") {
    return { ok: true, content: res.data.content, id: res.data.id };
  }
  return { ok: false, error: { code: "INVALID_RESPONSE", message: "回覆格式無法解析" } };
}

function formatClock(value) {
  try {
    return new Intl.DateTimeFormat("zh-TW", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(value);
  } catch {
    return "";
  }
}

export default function ConversationPanel({
  channels = DEFAULT_CHANNELS,
  activeChannelId,
  defaultChannelId,
  onChannelChange,
  dispatch,
  dispatchAll,
  disabled = false,
  onHistoryChange,
}) {
  const channelList = channels.length ? channels : DEFAULT_CHANNELS;
  const [internalActive, setInternalActive] = useState(
    defaultChannelId || channelList[0]?.id || "overview",
  );
  const activeId = activeChannelId || internalActive;
  const [histories, setHistories] = useState({});
  const [drafts, setDrafts] = useState({});
  const [status, setStatus] = useState({});
  const [banner, setBanner] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const composingRef = useRef(false);
  const inflightRef = useRef(new Map());
  const threadRef = useRef(null);

  const active = useMemo(
    () => channelList.find((channel) => channel.id === activeId) || channelList[0],
    [activeId, channelList],
  );
  const thread = histories[active?.id] || [];
  const draft = drafts[active?.id] || "";
  const busyCount = channelList.filter((channel) => status[channel.id] === "running").length;
  const canType = !disabled && Boolean(dispatch);
  const canSendSingle =
    canType && draft.trim().length > 0 && status[active?.id] !== "running";
  const canSendAll = canType && draft.trim().length > 0;

  const selectChannel = useCallback(
    (id) => {
      setInternalActive(id);
      onChannelChange?.(id);
    },
    [onChannelChange],
  );

  const patchHistory = useCallback((channelId, updater) => {
    setHistories((prev) => {
      const nextList = updater(prev[channelId] || []);
      const next = { ...prev, [channelId]: nextList };
      onHistoryChange?.(next);
      return next;
    });
  }, [onHistoryChange]);

  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [thread.length, activeId]);

  useEffect(() => {
    return () => {
      inflightRef.current.forEach((controller) => controller.abort());
      inflightRef.current.clear();
    };
  }, []);

  const copyReply = useCallback(async (text, id) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const helper = document.createElement("textarea");
        helper.value = text;
        helper.setAttribute("readonly", "");
        helper.style.position = "fixed";
        helper.style.left = "-9999px";
        document.body.appendChild(helper);
        helper.select();
        document.execCommand("copy");
        document.body.removeChild(helper);
      }
      setCopiedId(id);
      window.setTimeout(() => {
        setCopiedId((current) => (current === id ? null : current));
      }, 1600);
    } catch {
      setBanner({ tone: "error", text: "無法複製到剪貼簿" });
    }
  }, []);

  const runDispatch = useCallback(
    async (channel, text, mode, placeholderId) => {
      const prior = inflightRef.current.get(channel.id);
      if (prior) prior.abort();
      const controller = new AbortController();
      inflightRef.current.set(channel.id, controller);
      setStatus((prev) => ({ ...prev, [channel.id]: "running" }));

      try {
        const snapshot = histories[channel.id] || [];
        const res = await dispatch({
          channelId: channel.id,
          text,
          history: doneHistory(snapshot),
          mode,
          signal: controller.signal,
        });
        const normalized = normalizeResult(res);
        if (normalized.ok) {
          patchHistory(channel.id, (list) =>
            list.map((msg) =>
              msg.id === placeholderId
                ? { ...msg, content: normalized.content, status: "done", error: undefined }
                : msg,
            ),
          );
          setStatus((prev) => ({ ...prev, [channel.id]: "idle" }));
        } else {
          patchHistory(channel.id, (list) =>
            list.map((msg) =>
              msg.id === placeholderId
                ? { ...msg, status: "error", error: normalized.error }
                : msg,
            ),
          );
          setStatus((prev) => ({ ...prev, [channel.id]: "error" }));
          setBanner({
            tone: "error",
            text: `${channel.index} ${normalized.error.code}: ${normalized.error.message}`,
          });
        }
      } catch (err) {
        if (controller.signal.aborted || err?.name === "AbortError") {
          patchHistory(channel.id, (list) => list.filter((msg) => msg.id !== placeholderId));
          setStatus((prev) => ({ ...prev, [channel.id]: "idle" }));
          return;
        }
        const error = {
          code: err?.code || "INTERNAL_ERROR",
          message: err?.message || "派送時發生錯誤",
        };
        patchHistory(channel.id, (list) =>
          list.map((msg) => (msg.id === placeholderId ? { ...msg, status: "error", error } : msg)),
        );
        setStatus((prev) => ({ ...prev, [channel.id]: "error" }));
        setBanner({ tone: "error", text: `${channel.index} ${error.code}: ${error.message}` });
      } finally {
        inflightRef.current.delete(channel.id);
      }
    },
    [dispatch, histories, patchHistory],
  );

  const submit = useCallback(
    async (mode) => {
      const text = draft.trim();
      if (!text || disabled) return;
      if (!dispatch) {
        setBanner({ tone: "error", text: "父層未注入 dispatch，無法派送" });
        return;
      }
      if (mode === "single" && status[active.id] === "running") return;

      setBanner(null);
      setDrafts((prev) => ({ ...prev, [active.id]: "" }));

      if (mode === "single") {
        const userId = createId();
        const agentId = createId();
        const now = Date.now();
        patchHistory(active.id, (list) => [
          ...list,
          { id: userId, role: "user", content: text, channelId: active.id, status: "done", createdAt: now, mode },
          { id: agentId, role: "agent", content: "", channelId: active.id, status: "running", createdAt: now, mode },
        ]);
        await runDispatch(active, text, "single", agentId);
        return;
      }

      const skipped = channelList.filter((channel) => status[channel.id] === "running");
      const targets = channelList.filter((channel) => status[channel.id] !== "running");
      if (!targets.length) {
        setBanner({ tone: "info", text: "所有通道都在執行中" });
        return;
      }
      if (skipped.length) {
        setBanner({
          tone: "info",
          text: `已略過執行中通道：${skipped.map((channel) => channel.index).join(", ")}`,
        });
      }

      const now = Date.now();
      const placeholders = {};
      targets.forEach((channel) => {
        const userId = createId();
        const agentId = createId();
        placeholders[channel.id] = agentId;
        patchHistory(channel.id, (list) => [
          ...list,
          { id: userId, role: "user", content: text, channelId: channel.id, status: "done", createdAt: now, mode: "all" },
          { id: agentId, role: "agent", content: "", channelId: channel.id, status: "running", createdAt: now, mode: "all" },
        ]);
      });

      if (typeof dispatchAll === "function") {
        try {
          const results = await dispatchAll({
            channelIds: targets.map((channel) => channel.id),
            text,
            mode: "all",
          });
          const list = Array.isArray(results) ? results : [];
          targets.forEach((channel, index) => {
            const normalized = normalizeResult(list[index] || list.find((item) => item?.channelId === channel.id));
            if (normalized.ok) {
              patchHistory(channel.id, (msgs) =>
                msgs.map((msg) =>
                  msg.id === placeholders[channel.id]
                    ? { ...msg, content: normalized.content, status: "done", error: undefined }
                    : msg,
                ),
              );
              setStatus((prev) => ({ ...prev, [channel.id]: "idle" }));
            } else {
              patchHistory(channel.id, (msgs) =>
                msgs.map((msg) =>
                  msg.id === placeholders[channel.id]
                    ? { ...msg, status: "error", error: normalized.error }
                    : msg,
                ),
              );
              setStatus((prev) => ({ ...prev, [channel.id]: "error" }));
            }
          });
        } catch (err) {
          targets.forEach((channel) => {
            const error = {
              code: err?.code || "INTERNAL_ERROR",
              message: err?.message || "全通道派送失敗",
            };
            patchHistory(channel.id, (msgs) =>
              msgs.map((msg) =>
                msg.id === placeholders[channel.id] ? { ...msg, status: "error", error } : msg,
              ),
            );
            setStatus((prev) => ({ ...prev, [channel.id]: "error" }));
          });
          setBanner({ tone: "error", text: err?.message || "全通道派送失敗" });
        }
        return;
      }

      await Promise.allSettled(
        targets.map((channel) => runDispatch(channel, text, "all", placeholders[channel.id])),
      );
    },
    [active, canType, channelList, disabled, dispatch, dispatchAll, draft, patchHistory, runDispatch, status],
  );

  const onKeyDown = (event) => {
    const ime =
      event.nativeEvent.isComposing || event.keyCode === 229 || composingRef.current;
    if (event.key !== "Enter") return;
    if (event.shiftKey) return;
    if (ime) return;
    event.preventDefault();
    if (canSendSingle) submit("single");
  };

  return (
    <section className="conversation-panel" aria-label="攝影代理對話">
      <header className="cp-header">
        <div>
          <p className="cp-kicker">06  Conversation</p>
          <h1 className="cp-title">攝影代理對話</h1>
          <p className="cp-lede">
            每條通道獨立紀錄。任務由父層注入的 API 派送，瀏覽器不儲存金鑰。
          </p>
        </div>
        <span className={`cp-status${busyCount ? " is-busy" : ""}`}>
          <i className="cp-status-dot" />
          {busyCount ? `執行中 ${busyCount}` : "Standby"}
        </span>
      </header>

      <div className="cp-channels" role="tablist" aria-label="對話通道">
        {channelList.map((channel) => (
          <button
            key={channel.id}
            type="button"
            role="tab"
            aria-selected={channel.id === active.id}
            className={`cp-chip${channel.id === active.id ? " is-active" : ""}${status[channel.id] === "running" ? " is-busy" : ""}${status[channel.id] === "error" ? " is-error" : ""}`}
            onClick={() => selectChannel(channel.id)}
          >
            <span className="cp-chip-index">{channel.index}</span>
            <span className="cp-chip-label">{channel.label}</span>
            <span className="cp-chip-meta">{channel.meta}</span>
          </button>
        ))}
      </div>

      {banner ? <p className={`cp-banner is-${banner.tone}`}>{banner.text}</p> : null}

      <div className="cp-thread" ref={threadRef} aria-live="polite">
        {thread.length === 0 ? (
          <p className="cp-empty">
            {active.index} · {active.label}。輸入任務後按 Enter 送出，或派送到全部通道。
          </p>
        ) : (
          thread.map((msg) => (
            <article
              key={msg.id}
              className={`cp-msg ${msg.role === "user" ? "is-user" : "is-agent"}${msg.status === "running" ? " is-running" : ""}${msg.status === "error" ? " is-error" : ""}`}
              aria-busy={msg.status === "running"}
            >
              <div className="cp-msg-meta">
                <span>{msg.role === "user" ? "任務" : "代理"}</span>
                <span>{msg.mode === "all" ? "全通道" : active.index}</span>
                <span>{formatClock(msg.createdAt)}</span>
                {msg.status === "running" ? <span>執行中…</span> : null}
                {msg.role === "agent" && msg.status === "done" && msg.content ? (
                  <button
                    type="button"
                    className={`cp-copy${copiedId === msg.id ? " is-copied" : ""}`}
                    onClick={() => copyReply(msg.content, msg.id)}
                  >
                    {copiedId === msg.id ? "已複製" : "複製"}
                  </button>
                ) : null}
              </div>
              <p className="cp-msg-body">
                {msg.status === "running" ? "執行中…" : msg.content}
              </p>
              {msg.error ? (
                <p className="cp-msg-error">
                  {msg.error.code}: {msg.error.message}
                </p>
              ) : null}
            </article>
          ))
        )}
      </div>

      <form
        className="cp-composer"
        onSubmit={(event) => {
          event.preventDefault();
          if (canSendSingle) submit("single");
        }}
      >
        <label className="visually-hidden" htmlFor="cp-task-input">
          任務輸入
        </label>
        <textarea
          id="cp-task-input"
          className="cp-input"
          rows={4}
          placeholder={`給 ${active.index} ${active.label} 的任務…`}
          value={draft}
          disabled={!canType}
          onChange={(event) =>
            setDrafts((prev) => ({ ...prev, [active.id]: event.target.value }))
          }
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onKeyDown={onKeyDown}
        />
        <div className="cp-toolbar">
          <p className="cp-hint">Enter 送出 · Shift+Enter 換行 · 注音/倉頡組字中不送出</p>
          <button type="button" className="cp-send-all" disabled={!canSendAll} onClick={() => submit("all")}>
            全通道派送
          </button>
          <button type="submit" className="cp-send" disabled={!canSendSingle}>
            送出
          </button>
        </div>
      </form>
    </section>
  );
}
