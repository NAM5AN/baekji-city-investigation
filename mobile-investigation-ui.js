(() => {
  "use strict";

  const MOBILE_QUERY = "(max-width: 980px)";
  const PANE_KEY_PREFIX = "baekji_mobile_investigation_pane_v1:";
  const HINT_KEY = "baekji_mobile_investigation_hint_seen_v1";
  const SWIPE_MIN_PX = 46;
  const SWIPE_RATIO = 1.18;

  function decideSwipe(startX, startY, endX, endY, currentPane = "field", viewportWidth = 390) {
    const dx = Number(endX) - Number(startX);
    const dy = Number(endY) - Number(startY);
    const threshold = Math.max(SWIPE_MIN_PX, Number(viewportWidth || 0) * 0.12);
    if (Math.abs(dx) < threshold || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return currentPane;
    return dx < 0 ? "chat" : "field";
  }

  function paneTransform(pane) {
    return pane === "chat" ? "translate3d(-100vw, 0, 0)" : "translate3d(0, 0, 0)";
  }

  function isInteractiveTarget(target) {
    return Boolean(target?.closest?.("textarea, input, select, button, a, [role='button'], [data-mobile-no-swipe]"));
  }

  const TEST_API = Object.freeze({ decideSwipe, paneTransform, isInteractiveTarget });
  if (typeof window !== "undefined") window.__BAEKJI_MOBILE_INVESTIGATION_TEST__ = TEST_API;

  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof sessionStorage === "undefined"
  ) return;

  let mountedRoot = null;
  let currentSessionId = "";
  let currentPane = "field";
  let touchState = null;
  let mountQueued = false;

  function isMobile() {
    return window.matchMedia?.(MOBILE_QUERY)?.matches ?? window.innerWidth <= 980;
  }

  function routeIsInvestigation() {
    return location.hash.replace(/^#\/?/, "").split("/")[0] === "investigate";
  }

  function paneStorageKey(sessionId) {
    return `${PANE_KEY_PREFIX}${sessionId || "unknown"}`;
  }

  function readPane(sessionId) {
    const saved = sessionStorage.getItem(paneStorageKey(sessionId));
    return saved === "chat" ? "chat" : "field";
  }

  function savePane(sessionId, pane) {
    sessionStorage.setItem(paneStorageKey(sessionId), pane === "chat" ? "chat" : "field");
  }

  function measureTopbar() {
    const topbar = document.querySelector(".topbar");
    const height = Math.max(0, Math.ceil(topbar?.getBoundingClientRect?.().height || 0));
    document.documentElement.style.setProperty("--mobile-investigation-topbar", `${height}px`);
  }

  function updateControls({ announce = false } = {}) {
    const body = document.body;
    const button = document.querySelector("[data-mobile-investigation-toggle]");
    const indicator = document.querySelector("[data-mobile-investigation-indicator]");
    const root = document.querySelector(".retro-investigation[data-mobile-investigation-root]");
    const isChat = currentPane === "chat";

    body.classList.toggle("mobile-investigation-chat", isChat);
    body.classList.toggle("mobile-investigation-field", !isChat);
    if (root) root.style.setProperty("--mobile-investigation-transform", paneTransform(currentPane));
    if (button) {
      button.dataset.pane = currentPane;
      button.setAttribute("aria-label", isChat ? "현장 화면 열기" : "채팅과 메뉴 열기");
      button.setAttribute("aria-pressed", String(isChat));
      button.innerHTML = isChat
        ? '<span aria-hidden="true">‹</span><strong>현장</strong>'
        : '<strong>채팅</strong><span aria-hidden="true">›</span>';
    }
    if (indicator) {
      indicator.dataset.pane = currentPane;
      indicator.querySelectorAll("i").forEach((dot, index) => dot.classList.toggle("active", index === (isChat ? 1 : 0)));
      indicator.querySelector("span").textContent = isChat ? "채팅·메뉴" : "현장·SYSTEM";
    }
    if (announce) {
      document.querySelector("[data-mobile-investigation-live]")?.replaceChildren(document.createTextNode(isChat ? "채팅 화면" : "현장 화면"));
    }
  }

  function setPane(pane, { persist = true, announce = true } = {}) {
    currentPane = pane === "chat" ? "chat" : "field";
    if (persist && currentSessionId) savePane(currentSessionId, currentPane);
    updateControls({ announce });
    if (currentPane === "chat") {
      requestAnimationFrame(() => {
        const chat = document.querySelector("[data-chat-stream]");
        if (chat) chat.scrollTop = chat.scrollHeight;
      });
    }
  }

  function togglePane() {
    setPane(currentPane === "chat" ? "field" : "chat");
  }

  function createControls(root) {
    if (!document.querySelector("[data-mobile-investigation-toggle]")) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "retro-mobile-panel-toggle";
      button.dataset.mobileInvestigationToggle = "";
      button.addEventListener("click", togglePane);
      document.body.appendChild(button);
    }

    if (!document.querySelector("[data-mobile-investigation-indicator]")) {
      const indicator = document.createElement("div");
      indicator.className = "retro-mobile-pane-indicator";
      indicator.dataset.mobileInvestigationIndicator = "";
      indicator.innerHTML = '<div aria-hidden="true"><i></i><i></i></div><span>현장·SYSTEM</span>';
      document.body.appendChild(indicator);
    }

    if (!document.querySelector("[data-mobile-investigation-live]")) {
      const live = document.createElement("div");
      live.className = "retro-mobile-sr-only";
      live.dataset.mobileInvestigationLive = "";
      live.setAttribute("aria-live", "polite");
      document.body.appendChild(live);
    }

    if (!sessionStorage.getItem(HINT_KEY) && !document.querySelector("[data-mobile-investigation-hint]")) {
      const hint = document.createElement("div");
      hint.className = "retro-mobile-swipe-hint";
      hint.dataset.mobileInvestigationHint = "";
      hint.innerHTML = '<strong>좌우로 밀어 화면 전환</strong><span>현장·SYSTEM ↔ 채팅·메뉴</span>';
      document.body.appendChild(hint);
      sessionStorage.setItem(HINT_KEY, "1");
      setTimeout(() => hint.classList.add("is-leaving"), 3200);
      setTimeout(() => hint.remove(), 3800);
    }

    root.dataset.mobileInvestigationRoot = "";
  }

  function unmountMobile() {
    mountedRoot = null;
    touchState = null;
    document.body.classList.remove("mobile-investigation-active", "mobile-investigation-chat", "mobile-investigation-field");
    document.querySelectorAll("[data-mobile-investigation-toggle], [data-mobile-investigation-indicator], [data-mobile-investigation-live], [data-mobile-investigation-hint]").forEach((element) => element.remove());
    document.querySelectorAll("[data-mobile-investigation-root]").forEach((element) => {
      delete element.dataset.mobileInvestigationRoot;
      element.style.removeProperty("--mobile-investigation-transform");
    });
  }

  function beginPointer(event) {
    if (event.pointerType !== "touch" || !isMobile() || isInteractiveTarget(event.target)) return;
    const width = window.innerWidth || 390;
    if (event.clientX < 24 || event.clientX > width - 24) return;
    touchState = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      horizontal: false,
    };
  }

  function movePointer(event) {
    if (!touchState || event.pointerId !== touchState.pointerId) return;
    touchState.lastX = event.clientX;
    touchState.lastY = event.clientY;
    const dx = event.clientX - touchState.startX;
    const dy = event.clientY - touchState.startY;
    if (!touchState.horizontal && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * SWIPE_RATIO) touchState.horizontal = true;
    if (touchState.horizontal) event.preventDefault();
  }

  function finishPointer(event) {
    if (!touchState || event.pointerId !== touchState.pointerId) return;
    const nextPane = decideSwipe(
      touchState.startX,
      touchState.startY,
      event.clientX ?? touchState.lastX,
      event.clientY ?? touchState.lastY,
      currentPane,
      window.innerWidth || 390,
    );
    const changed = nextPane !== currentPane;
    touchState = null;
    if (changed) setPane(nextPane);
  }

  function bindSwipe(root) {
    if (root.dataset.mobileSwipeBound === "1") return;
    root.dataset.mobileSwipeBound = "1";
    root.addEventListener("pointerdown", beginPointer, { passive: true });
    root.addEventListener("pointermove", movePointer, { passive: false });
    root.addEventListener("pointerup", finishPointer, { passive: true });
    root.addEventListener("pointercancel", () => { touchState = null; }, { passive: true });
  }

  function mountMobile() {
    mountQueued = false;
    const root = document.querySelector(".retro-investigation[data-session-id]");
    if (!isMobile() || !routeIsInvestigation() || !root) {
      unmountMobile();
      return;
    }

    currentSessionId = root.dataset.sessionId || "";
    if (mountedRoot !== root) {
      mountedRoot = root;
      currentPane = readPane(currentSessionId);
      createControls(root);
      bindSwipe(root);
    }

    document.body.classList.add("mobile-investigation-active");
    measureTopbar();
    updateControls();
  }

  function scheduleMount() {
    if (mountQueued) return;
    mountQueued = true;
    queueMicrotask(mountMobile);
  }

  const media = window.matchMedia?.(MOBILE_QUERY);
  media?.addEventListener?.("change", scheduleMount);
  window.addEventListener("hashchange", scheduleMount);
  window.addEventListener("resize", scheduleMount);
  window.visualViewport?.addEventListener?.("resize", () => {
    measureTopbar();
    scheduleMount();
  });
  window.addEventListener("pageshow", scheduleMount);

  const observer = new MutationObserver(scheduleMount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scheduleMount();
})();
