(() => {
  "use strict";
  const { escapeHtml } = window.__BAEKJI_RUNTIME_UTILS__;
  const { spatialScopeKey } = window.__BAEKJI_DOMAIN_RULES__;

  const ROOT = typeof window !== "undefined" ? window : globalThis;
  const persistence = ROOT.__BAEKJI_WORLD_PERSISTENCE__;
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const PENDING_KEY = "actionNarrationPending";
  const PENDING_AT_KEY = "actionNarrationPendingAt";
  const NARRATION_STALE_MS = 17_000;
  const TESTER_LABELS = Object.freeze({
    test_a: "테스트 캐릭터 A",
    test_b: "테스트 캐릭터 B",
    test_c: "테스트 캐릭터 C",
  });

  function stableChronologicalEntries(logs) {
    return (Array.isArray(logs) ? logs : [])
      .map((entry, index) => ({ entry, index }))
      .sort((left, right) => {
        const leftAt = Number(left.entry?.at) || 0;
        const rightAt = Number(right.entry?.at) || 0;
        return leftAt - rightAt || left.index - right.index;
      })
      .map(({ entry }) => entry);
  }

  function chatSourceEntries(session) {
    return (session?.logs || [])
      .filter((entry) => entry?.type === "interaction" || entry?.type === "chat-divider");
  }

  function needsChronologyRepair(session) {
    const source = chatSourceEntries(session);
    let previousAt = -Infinity;
    for (const entry of source) {
      const at = Number(entry?.at) || 0;
      if (at < previousAt) return true;
      previousAt = at;
    }
    return false;
  }

  function chatTimelineEntries(session) {
    const source = stableChronologicalEntries(chatSourceEntries(session));
    const timeline = [];
    let lastScopeKey = null;

    source.forEach((entry) => {
      if (entry.type === "chat-divider") {
        if (entry.scopeKey !== lastScopeKey) timeline.push(entry);
        lastScopeKey = entry.scopeKey || lastScopeKey;
        return;
      }
      if (entry.scopeKey && entry.scopeKey !== lastScopeKey) {
        timeline.push({
          id: `virtual_divider_${entry.id}`,
          type: "chat-divider",
          text: "",
          scopeKey: entry.scopeKey,
          at: Math.max(0, (Number(entry.at) || 0) - 1),
          virtual: true,
        });
        lastScopeKey = entry.scopeKey;
      }
      timeline.push(entry);
    });

    const currentScopeKey = spatialScopeKey(session);
    if (currentScopeKey && currentScopeKey !== lastScopeKey) {
      const lastAt = timeline.length ? Number(timeline.at(-1)?.at) || 0 : 0;
      timeline.push({
        id: `virtual_current_${currentScopeKey}`,
        type: "chat-divider",
        text: "",
        scopeKey: currentScopeKey,
        at: lastAt + 1,
        virtual: true,
      });
    }
    return timeline;
  }

  function isFreshNarrationPending(entry, now = Date.now()) {
    if (!entry?.[PENDING_KEY]) return false;
    const pendingAt = Number(entry?.[PENDING_AT_KEY]);
    if (!Number.isFinite(pendingAt) || pendingAt <= 0) return false;
    return Math.max(0, Number(now) - pendingAt) < NARRATION_STALE_MS;
  }

  const TEST_API = Object.freeze({
    NARRATION_STALE_MS,
    stableChronologicalEntries,
    needsChronologyRepair,
    spatialScopeKey,
    chatTimelineEntries,
    isFreshNarrationPending,
  });
  ROOT.__BAEKJI_RUNTIME_BASELINE_STABILITY_TEST__ = TEST_API;

  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof localStorage === "undefined" ||
    typeof sessionStorage === "undefined"
  ) return;

  function readState() {
    try {
      const state = JSON.parse(persistence?.readRaw?.() || "null");
      return state?.version === 3 ? state : null;
    } catch {
      return null;
    }
  }

  function currentSessionId() {
    const mounted = document.querySelector("[data-layout-root][data-session-id]")?.dataset?.sessionId;
    if (mounted) return String(mounted);
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    return parts[0] === "investigate" ? String(parts[1] || "") : "";
  }

  function currentUserId() {
    try { return String(sessionStorage.getItem(USER_KEY) || ""); }
    catch { return ""; }
  }

  function registryProfile(actorId) {
    try {
      return ROOT.__BAEKJI_TESTER_REGISTRY_GUARD__?.values?.()
        ?.find?.((entry) => String(entry?.id || "") === String(actorId || "")) || null;
    } catch {
      return null;
    }
  }

  function actorProfile(actorId) {
    const registered = registryProfile(actorId);
    if (registered) {
      const name = String(registered.name || registered.loginId || actorId || "다른 조사자").trim();
      return { name, initial: String(registered.initial || [...name][0] || "?") };
    }
    try {
      const profile = JSON.parse(sessionStorage.getItem("baekji_city_tester_session_profile_v1") || "null");
      if (String(profile?.id || "") === String(actorId || "")) {
        const name = String(profile.name || profile.loginId || actorId || "다른 조사자").trim();
        return { name, initial: String(profile.initial || [...name][0] || "?") };
      }
    } catch { /* ignore */ }
    const name = TESTER_LABELS[String(actorId || "")] || String(actorId || "다른 조사자");
    return { name, initial: [...name][0] || "?" };
  }

  function nodeDisplayName(nodeId) {
    if (nodeId === "E_ENTRY") return "해오름역 구역 입구";
    return ROOT.DAY1_DATA?.places?.[nodeId]?.name || String(nodeId || "현재 위치");
  }

  function chatScopeLabel(scopeKey) {
    const key = String(scopeKey || "");
    if (!key) return "현재 위치";
    if (key.startsWith("node:")) return nodeDisplayName(key.slice(5));
    if (key.startsWith("detail:")) {
      const [, nodeId, detailId] = key.split(":");
      const detail = ROOT.DAY1_DATA?.places?.[nodeId]?.details?.find?.((item) => item.id === detailId);
      return `${nodeDisplayName(nodeId)} · ${detail?.name || "세부 조사 지점"}`;
    }
    if (key.startsWith("route:")) {
      const [, fromNode, toNode] = key.split(":");
      return `${nodeDisplayName(fromNode)} → ${nodeDisplayName(toNode)} 이동 경로`;
    }
    return "현재 위치";
  }

  function chatMarkup(entry, userId) {
    if (entry.type === "chat-divider") {
      return `<div class="retro-chat-divider"><span>${escapeHtml(entry.text || chatScopeLabel(entry.scopeKey))}</span></div>`;
    }
    const actor = entry.actorId ? actorProfile(entry.actorId) : { name: "시스템", initial: "!" };
    const time = new Date(Number(entry.at) || 0).toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit" });
    return `<article class="retro-chat-message ${String(entry.actorId || "") === userId ? "mine" : ""}"><div class="retro-chat-avatar">${escapeHtml(actor.initial)}</div><div class="retro-chat-content"><div class="retro-chat-meta"><strong>${escapeHtml(actor.name)}</strong><span>${escapeHtml(time)}</span></div><div class="retro-chat-bubble">${escapeHtml(entry.text)}</div></div></article>`;
  }

  function timelineSignature(timeline, userId) {
    return `${userId}|${timeline.map((entry) => [entry.id, entry.type, entry.scopeKey, entry.actorId, Number(entry.at) || 0, entry.text].join("\u001f")).join("\u001e")}`;
  }

  function isNearBottom(element, threshold = 48) {
    if (!element) return true;
    return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
  }

  function applyChatChronology() {
    const stream = document.querySelector("[data-chat-stream]");
    const sessionId = currentSessionId();
    if (!stream || !sessionId) return;
    const state = readState();
    const session = state?.sessions?.[sessionId];
    if (!session || !needsChronologyRepair(session)) return;

    const userId = currentUserId();
    const timeline = chatTimelineEntries(session);
    const signature = timelineSignature(timeline, userId);
    if (stream.dataset.baselineChronologySignature === signature) return;

    const atBottom = isNearBottom(stream);
    const previousTop = stream.scrollTop;
    stream.innerHTML = timeline.length
      ? timeline.map((entry) => chatMarkup(entry, userId)).join("")
      : `<div class="retro-chat-empty">현재 위치에서 오간 대화가 없습니다.<br>일반 대화는 그대로, 시스템 판정이 필요한 행동은 /로 시작해 입력하세요.</div>`;
    stream.dataset.baselineChronologySignature = signature;

    requestAnimationFrame(() => {
      if (!stream.isConnected) return;
      if (atBottom) stream.scrollTop = stream.scrollHeight;
      else stream.scrollTop = Math.min(previousTop, Math.max(0, stream.scrollHeight - stream.clientHeight));
    });
  }

  function visibleSystemEntries(session) {
    const userId = currentUserId();
    return (session?.logs || []).filter((entry) => {
      const recipients = Array.isArray(entry?.recipientCharacterIds) ? entry.recipientCharacterIds.map(String) : [];
      const excluded = Array.isArray(entry?.excludedCharacterIds) ? entry.excludedCharacterIds.map(String) : [];
      return (!recipients.length || recipients.includes(userId))
        && !excluded.includes(userId)
        && (entry?.type === "action-input" || (!entry?.actorId && entry?.type !== "interaction" && entry?.type !== "chat-divider"));
    });
  }

  function applyPendingVisibility(now = Date.now()) {
    const sessionId = currentSessionId();
    const state = readState();
    const session = state?.sessions?.[sessionId];
    const lines = [...document.querySelectorAll(".retro-system-scroll .retro-system-line")];
    if (!session || !lines.length) return;
    const entries = visibleSystemEntries(session);
    entries.forEach((entry, index) => {
      const line = lines[index];
      if (!line) return;
      line.classList.toggle("retro-action-result-stale", Boolean(entry?.[PENDING_KEY]) && !isFreshNarrationPending(entry, now));
    });
  }

  const style = document.createElement("style");
  style.dataset.runtimeBaselineStability = "1";
  style.textContent = ".retro-system-line.retro-action-result-pending.retro-action-result-stale{display:block!important}";
  document.head?.appendChild(style);

  let queued = false;
  function scheduleApply() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      applyChatChronology();
      applyPendingVisibility();
    });
  }

  const appRoot = document.getElementById("app");
  if (appRoot) {
    const observer = new MutationObserver(scheduleApply);
    observer.observe(appRoot, { childList: true, subtree: true });
  }
  window.addEventListener("hashchange", scheduleApply);
  window.addEventListener("pageshow", scheduleApply);
  window.addEventListener("storage", (event) => { if (event.key === GLOBAL_KEY) scheduleApply(); });
  setInterval(() => applyPendingVisibility(), 1_000);
  scheduleApply();
})();
