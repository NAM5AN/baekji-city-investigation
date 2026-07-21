(() => {
  "use strict";

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const app = document.getElementById("app");
  if (!app || typeof MutationObserver === "undefined") return;

  const buckets = new Map();
  const initialChoiceClosed = new Set();
  let stabilizeFrame = 0;

  function parseState() {
    try {
      const state = JSON.parse(localStorage.getItem(GLOBAL_KEY) || "null");
      return state?.version === 3 ? state : null;
    } catch {
      return null;
    }
  }

  function currentSessionId() {
    const mounted = document.querySelector(".retro-investigation")?.dataset.sessionId;
    if (mounted) return mounted;
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    return parts[0] === "investigate" ? parts[1] || "" : "";
  }

  function bucketFor(sessionId) {
    if (!buckets.has(sessionId)) {
      buckets.set(sessionId, {
        system: new Set(),
        chat: new Set(),
        pendingSystem: new Set(),
        systemSeeded: false,
        chatSeeded: false,
      });
    }
    return buckets.get(sessionId);
  }

  function visibleSystemEntries(session) {
    return (session?.logs || []).filter((entry) =>
      entry?.type === "action-input" ||
      (!entry?.actorId && entry?.type !== "interaction" && entry?.type !== "chat-divider")
    );
  }

  function visibleChatEntries(session) {
    return (session?.logs || []).filter((entry) => entry?.type === "interaction");
  }

  function markEntry(element, key, seen, pendingKeys, seeded, pending = false) {
    if (!element || !key) return;

    const previousKey = element.dataset.motionEntryId;
    const previousState = element.dataset.motionStability;
    if (previousKey === key && previousState) {
      if (pending) {
        pendingKeys.add(key);
        element.dataset.motionStability = "pending";
        element.classList.remove("motion-stable-existing", "motion-stable-new");
        element.classList.add("retro-action-result-pending", "motion-stable-pending");
        return;
      }
      if (previousState === "pending") {
        pendingKeys.delete(key);
        element.dataset.motionStability = "new";
        element.classList.remove("retro-action-result-pending", "motion-stable-pending", "motion-stable-existing");
        element.classList.add("motion-stable-new");
        seen.add(key);
      }
      return;
    }

    element.dataset.motionEntryId = key;
    element.classList.remove(
      "motion-stable-existing",
      "motion-stable-new",
      "motion-stable-pending",
      "retro-action-result-pending",
    );

    if (pending) {
      pendingKeys.add(key);
      element.dataset.motionStability = "pending";
      element.classList.add("retro-action-result-pending", "motion-stable-pending");
      return;
    }

    const completedPending = pendingKeys.delete(key);
    const existing = !completedPending && (!seeded || seen.has(key));
    element.dataset.motionStability = existing ? "existing" : "new";
    element.classList.add(existing ? "motion-stable-existing" : "motion-stable-new");
    seen.add(key);
  }

  function tagSystemEntries(session, bucket) {
    const entries = visibleSystemEntries(session);
    const lines = [...document.querySelectorAll(".retro-system-scroll .retro-system-line")];

    lines.forEach((line, index) => {
      const entry = entries[index];
      const key = entry?.id ? `system:${entry.id}` : `system:fallback:${index}`;
      markEntry(
        line,
        key,
        bucket.system,
        bucket.pendingSystem,
        bucket.systemSeeded,
        Boolean(entry?.actionNarrationPending),
      );
    });
    bucket.systemSeeded = true;
  }

  function tagChatEntries(session, bucket) {
    const entries = visibleChatEntries(session);
    const messages = [...document.querySelectorAll("[data-chat-stream] .retro-chat-message")];
    const noPending = new Set();

    messages.forEach((message, index) => {
      const entry = entries[index];
      const key = entry?.id ? `chat:${entry.id}` : `chat:fallback:${index}`;
      markEntry(message, key, bucket.chat, noPending, bucket.chatSeeded, false);
    });

    const dividerCounts = new Map();
    document.querySelectorAll("[data-chat-stream] .retro-chat-divider").forEach((divider) => {
      const label = String(divider.textContent || "").replace(/\s+/g, " ").trim();
      const count = (dividerCounts.get(label) || 0) + 1;
      dividerCounts.set(label, count);
      markEntry(divider, `chat-divider:${label}:${count}`, bucket.chat, noPending, bucket.chatSeeded, false);
    });
    bucket.chatSeeded = true;
  }

  function closeInitialChoicePanel(state, sessionId) {
    if (initialChoiceClosed.has(sessionId)) return;
    const session = state?.sessions?.[sessionId];
    if (!session?.choiceReveal) return;

    const closeButton = document.querySelector("[data-close-choice-panel]");
    if (!closeButton) return;
    initialChoiceClosed.add(sessionId);

    const panel = closeButton.closest(".retro-scene-actions");
    if (panel) panel.hidden = true;
    queueMicrotask(() => {
      if (closeButton.isConnected) closeButton.click();
    });
  }

  function restoreTypingTarget(target) {
    if (!target) return;
    const fullText = target.dataset.motionFullText;
    if (fullText != null && target.textContent !== fullText) target.textContent = fullText;
    target.classList.remove("is-typing", "motion-type-target");
    delete target.dataset.motionTyping;
    const wrapper = target.closest("[data-motion-typing]");
    if (wrapper && wrapper !== target) delete wrapper.dataset.motionTyping;
  }

  function suppressExistingReplay() {
    document.querySelectorAll(".motion-stable-existing").forEach((entry) => {
      entry.classList.remove("motion-chat-new", "motion-system-new");
      entry.style.removeProperty("--motion-index");
      restoreTypingTarget(entry.querySelector(".retro-chat-bubble, .retro-character-log-text, .retro-system-copy"));
    });
  }

  function stabilize() {
    stabilizeFrame = 0;
    const sessionId = currentSessionId();
    const state = parseState();
    const session = state?.sessions?.[sessionId];
    if (!sessionId || !session) return;

    const bucket = bucketFor(sessionId);
    closeInitialChoicePanel(state, sessionId);
    tagSystemEntries(session, bucket);
    tagChatEntries(session, bucket);

    suppressExistingReplay();
    setTimeout(suppressExistingReplay, 90);
    setTimeout(suppressExistingReplay, 220);
    setTimeout(suppressExistingReplay, 420);
  }

  function queueStabilize() {
    if (stabilizeFrame) return;
    stabilizeFrame = requestAnimationFrame(stabilize);
  }

  // app.innerHTML이 교체되는 렌더만 감지합니다.
  // 채팅 타이핑의 글자 변화나 하위 요소의 클래스 변화는 감시하지 않아
  // 모션 감시기끼리 서로 재호출되는 루프를 만들지 않습니다.
  const observer = new MutationObserver(queueStabilize);
  observer.observe(app, { childList: true });

  window.addEventListener("hashchange", queueStabilize);
  window.addEventListener("pageshow", queueStabilize);

  window.__BAEKJI_RENDER_MOTION_STABILITY_TEST__ = Object.freeze({
    visibleSystemEntries,
    visibleChatEntries,
    currentSessionId,
    restoreTypingTarget,
    suppressExistingReplay,
  });

  queueStabilize();
})();