(() => {
  "use strict";

  const API_URL = "/api/player-admin-system";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const POLL_MS = 1200;
  const MAX_EVENTS = 80;
  const events = new Map();
  let lastId = 0;
  let activeUserId = "";
  let timer = 0;
  let loading = false;
  let injecting = false;
  let observerQueued = false;
  let newEventIds = new Set();

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function currentUserId() {
    try { return String(sessionStorage.getItem(USER_KEY) || ""); }
    catch { return ""; }
  }

  function mountedSessionId() {
    return String(document.querySelector(".retro-investigation[data-session-id]")?.dataset.sessionId || "");
  }

  function eventSessionIds(event) {
    return Array.isArray(event?.recipient_session_ids) ? event.recipient_session_ids.map(String) : [];
  }

  function relevantEvents(sessionId) {
    if (!sessionId) return [];
    return [...events.values()]
      .filter((event) => eventSessionIds(event).includes(sessionId))
      .sort((a, b) => Number(a.id || 0) - Number(b.id || 0));
  }

  function timeText(value) {
    const date = new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? "--:--" : date.toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit" });
  }

  function systemMarkup(event) {
    const fresh = newEventIds.has(Number(event.id || 0)) ? " is-new" : "";
    return `<div class="retro-system-line retro-admin-system-line${fresh}" data-admin-system-event="${Number(event.id || 0)}"><span class="retro-admin-system-badge">운영 SYSTEM</span><span class="retro-log-time">[${esc(timeText(event.created_at))}]</span><span class="retro-admin-system-text">${esc(event.message || "")}</span></div>`;
  }

  function chatMarkup(event) {
    const fresh = newEventIds.has(Number(event.id || 0)) ? " is-new" : "";
    return `<article class="retro-admin-system-chat${fresh}" data-admin-system-chat-event="${Number(event.id || 0)}"><header><strong>운영 SYSTEM</strong><span>${esc(timeText(event.created_at))}</span></header><p>${esc(event.message || "")}</p><small>${esc(event.target_label || "운영진 공지")}</small></article>`;
  }

  function nearBottom(element, threshold = 70) {
    if (!element) return false;
    return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
  }

  function inject() {
    if (injecting) return;
    injecting = true;
    try {
      const sessionId = mountedSessionId();
      if (!sessionId) return;
      const rows = relevantEvents(sessionId);
      if (!rows.length) return;
      const system = document.querySelector(".retro-system-scroll");
      const chat = document.querySelector("[data-chat-stream]");
      const systemWasNear = nearBottom(system);
      const chatWasNear = nearBottom(chat);
      let addedFresh = false;

      rows.forEach((event) => {
        const id = Number(event.id || 0);
        const fresh = newEventIds.has(id);
        if (system && !system.querySelector(`[data-admin-system-event="${id}"]`)) {
          system.insertAdjacentHTML("beforeend", systemMarkup(event));
          addedFresh ||= fresh;
        }
        if (chat && !chat.querySelector(`[data-admin-system-chat-event="${id}"]`)) {
          chat.insertAdjacentHTML("beforeend", chatMarkup(event));
          addedFresh ||= fresh;
        }
      });

      if (system && (systemWasNear || addedFresh)) system.scrollTop = system.scrollHeight;
      if (chat && (chatWasNear || addedFresh)) chat.scrollTop = chat.scrollHeight;
      if (addedFresh) {
        setTimeout(() => {
          newEventIds.clear();
          document.querySelectorAll(".retro-admin-system-line.is-new,.retro-admin-system-chat.is-new").forEach((node) => node.classList.remove("is-new"));
        }, 1800);
      }
    } finally {
      injecting = false;
    }
  }

  function scheduleInject() {
    if (observerQueued) return;
    observerQueued = true;
    requestAnimationFrame(() => {
      observerQueued = false;
      inject();
    });
  }

  function mergeIncoming(incoming, markNew = true) {
    (Array.isArray(incoming) ? incoming : []).forEach((event) => {
      const id = Number(event?.id || 0);
      if (!id) return;
      if (!events.has(id) && markNew) newEventIds.add(id);
      events.set(id, event);
      lastId = Math.max(lastId, id);
    });
    const ids = [...events.keys()].sort((a, b) => b - a);
    ids.slice(MAX_EVENTS).forEach((id) => events.delete(id));
  }

  async function poll() {
    const userId = currentUserId();
    if (userId !== activeUserId) {
      activeUserId = userId;
      events.clear();
      newEventIds.clear();
      lastId = 0;
    }
    if (!userId || loading) {
      clearTimeout(timer);
      timer = setTimeout(poll, POLL_MS);
      return;
    }

    loading = true;
    try {
      const query = new URLSearchParams({ characterId: userId, after: String(lastId) });
      const response = await fetch(`${API_URL}?${query}`, { method: "GET", cache: "no-store", credentials: "same-origin" });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data?.ok) {
        mergeIncoming(data.events || [], lastId > 0);
        inject();
      }
    } catch {
      // 운영 SYSTEM 피드가 잠시 끊겨도 조사 자체는 계속 진행합니다.
    } finally {
      loading = false;
      clearTimeout(timer);
      timer = setTimeout(poll, POLL_MS);
    }
  }

  const appRoot = document.getElementById("app");
  if (appRoot && typeof MutationObserver === "function") {
    const observer = new MutationObserver(scheduleInject);
    observer.observe(appRoot, { childList: true, subtree: true });
  }
  window.addEventListener("focus", () => { poll(); scheduleInject(); });
  window.addEventListener("hashchange", scheduleInject);

  window.__BAEKJI_ADMIN_SYSTEM_FEED_TEST__ = Object.freeze({
    eventSessionIds,
    mergeIncoming,
    relevantEvents,
    mountedSessionId,
  });

  poll();
})();
