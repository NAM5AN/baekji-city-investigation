(() => {
  "use strict";

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const app = document.getElementById("app");
  if (!app || typeof MutationObserver === "undefined") return;

  const buckets = new Map();
  const choiceRevealKeys = new Map();
  let stabilizeQueued = false;
  let suppressQueued = false;

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

  function classify(element, key, seen, seeded, pending = false) {
    if (!element || !key) return;

    const previousKey = element.dataset.motionEntryId;
    const previousState = element.dataset.motionStability;
    if (previousKey === key && previousState) {
      if (pending) element.classList.add("retro-action-result-pending");
      return;
    }

    element.dataset.motionEntryId = key;
    element.classList.remove("motion-stable-existing", "motion-stable-new", "motion-stable-pending");

    if (pending) {
      element.dataset.motionStability = "pending";
      element.classList.add("retro-action-result-pending", "motion-stable-pending");
      return;
    }

    element.classList.remove("retro-action-result-pending");
    const existing = !seeded || seen.has(key);
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
      classify(line, key, bucket.system, bucket.systemSeeded, Boolean(entry?.actionNarrationPending));
    });
    bucket.systemSeeded = true;
  }

  function tagChatEntries(session, bucket) {
    const entries = visibleChatEntries(session);
    const messages = [...document.querySelectorAll("[data-chat-stream] .retro-chat-message")];
    messages.forEach((message, index) => {
      const entry = entries[index];
      const key = entry?.id ? `chat:${entry.id}` : `chat:fallback:${index}`;
      classify(message, key, bucket.chat, bucket.chatSeeded, false);
    });

    const dividerCounts = new Map();
    document.querySelectorAll("[data-chat-stream] .retro-chat-divider").forEach((divider) => {
      const label = String(divider.textContent || "").replace(/\s+/g, " ").trim();
      const count = (dividerCounts.get(label) || 0) + 1;
      dividerCounts.set(label, count);
      classify(divider, `chat-divider:${label}:${count}`, bucket.chat, bucket.chatSeeded, false);
    });
    bucket.chatSeeded = true;
  }

  function closeFreshChoicePanel(state, sessionId) {
    const session = state?.sessions?.[sessionId];
    const reveal = session?.choiceReveal;
    const key = reveal ? `${sessionId}:${reveal.type || "context"}:${reveal.at || 0}` : "";

    if (!key) {
      choiceRevealKeys.set(sessionId, "");
      return;
    }
    if (choiceRevealKeys.get(sessionId) === key) return;
    choiceRevealKeys.set(sessionId, key);

    const closeButton = document.querySelector("[data-close-choice-panel]");
    if (!closeButton) return;
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
  }

  function suppressExistingReplay() {
    suppressQueued = false;
    document.querySelectorAll(
      ".motion-stable-existing.motion-chat-new, .motion-stable-existing.motion-system-new"
    ).forEach((entry) => {
      entry.classList.remove("motion-chat-new", "motion-system-new");
      entry.style.removeProperty("--motion-index");
      restoreTypingTarget(entry.querySelector(".retro-chat-bubble, .retro-character-log-text, .retro-system-copy"));
    });

    document.querySelectorAll(".motion-stable-existing .motion-type-target, .motion-stable-existing [data-motion-typing='true']")
      .forEach(restoreTypingTarget);
  }

  function queueSuppress() {
    if (suppressQueued) return;
    suppressQueued = true;
    queueMicrotask(suppressExistingReplay);
  }

  function stabilize() {
    stabilizeQueued = false;
    const sessionId = currentSessionId();
    const state = parseState();
    const session = state?.sessions?.[sessionId];
    if (!sessionId || !session) return;

    const bucket = bucketFor(sessionId);
    closeFreshChoicePanel(state, sessionId);
    tagSystemEntries(session, bucket);
    tagChatEntries(session, bucket);
    queueSuppress();
    setTimeout(queueSuppress, 75);
    setTimeout(queueSuppress, 220);
  }

  function queueStabilize() {
    if (stabilizeQueued) return;
    stabilizeQueued = true;
    queueMicrotask(stabilize);
  }

  const observer = new MutationObserver((mutations) => {
    let needsStabilize = false;
    let needsSuppress = false;
    mutations.forEach((mutation) => {
      if (mutation.type === "childList") {
        needsStabilize = true;
        needsSuppress = true;
      } else if (mutation.type === "attributes") {
        needsSuppress = true;
      }
    });
    if (needsStabilize) queueStabilize();
    if (needsSuppress) queueSuppress();
  });

  observer.observe(app, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["class", "data-motion-typing"],
  });

  window.__BAEKJI_RENDER_MOTION_STABILITY_TEST__ = Object.freeze({
    visibleSystemEntries,
    visibleChatEntries,
    currentSessionId,
  });

  stabilize();
})();