(() => {
  "use strict";

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const toastRoot = document.getElementById("toast-root");
  const app = document.getElementById("app");
  if (!app) return;

  let processing = null;
  let inputAlertTimer = 0;
  let stateCheckQueued = false;
  let appSyncQueued = false;

  function routePage() {
    return location.hash.replace(/^#\/?/, "").split("/").filter(Boolean)[0] || "login";
  }

  function currentSessionId() {
    return document.querySelector(".retro-investigation")?.dataset.sessionId || "";
  }

  function readState() {
    try {
      const value = JSON.parse(localStorage.getItem(GLOBAL_KEY) || "null");
      return value?.version === 3 ? value : null;
    } catch {
      return null;
    }
  }

  function currentSession(state = readState(), sessionId = currentSessionId()) {
    return state?.sessions?.[sessionId] || null;
  }

  function composerElements() {
    const input = document.querySelector("[data-chat-input]");
    return {
      composer: input?.closest(".retro-chat-composer") || null,
      input,
      button: document.querySelector("[data-send-chat]"),
    };
  }

  function suppressInvestigationToasts() {
    const active = routePage() === "investigate";
    document.body.toggleAttribute("data-investigation-toast-suppressed", active);
    if (active && toastRoot?.childElementCount) toastRoot.replaceChildren();
  }

  function restoreInputPlaceholder(input) {
    if (!input) return;
    const original = input.dataset.feedbackOriginalPlaceholder;
    if (original != null) input.placeholder = original;
    delete input.dataset.feedbackOriginalPlaceholder;
  }

  function showInputAlert(message) {
    const { composer, input } = composerElements();
    if (!input || !composer) return;

    clearTimeout(inputAlertTimer);
    if (input.dataset.feedbackOriginalPlaceholder == null) {
      input.dataset.feedbackOriginalPlaceholder = input.placeholder || "";
    }
    input.placeholder = message;
    composer.classList.remove("is-input-alert");
    void composer.offsetWidth;
    composer.classList.add("is-input-alert");
    input.focus({ preventScroll: true });

    inputAlertTimer = setTimeout(() => {
      composer.classList.remove("is-input-alert");
      restoreInputPlaceholder(input);
    }, 1450);
  }

  function invalidActionMessage(rawText) {
    const raw = String(rawText || "").trim();
    if (!raw) return "대화나 행동을 입력해 주세요.";
    if (!raw.startsWith("/")) return "";
    const action = raw.replace(/^\/+\s*/, "").trim();
    if (!action) return "/ 뒤에 행동 내용을 입력해 주세요.";
    if (/(그리고|동시에|한 뒤|후에|,|;|\+| 및 )/.test(action)) {
      return "한 번에 한 가지 행동만 입력해 주세요.";
    }
    return "";
  }

  function processingOverlay(composer) {
    let overlay = composer?.querySelector("[data-action-processing-overlay]");
    if (!overlay && composer) {
      overlay = document.createElement("div");
      overlay.className = "retro-action-processing";
      overlay.dataset.actionProcessingOverlay = "true";
      overlay.setAttribute("role", "status");
      overlay.setAttribute("aria-live", "polite");
      overlay.innerHTML = `<span class="retro-action-processing-spinner" aria-hidden="true"></span><span>처리 중...</span>`;
      composer.appendChild(overlay);
    }
    return overlay;
  }

  function applyProcessingUI() {
    if (!processing) return;
    const { composer, input, button } = composerElements();
    if (!composer || !input) return;

    composer.classList.add("is-action-processing");
    composer.setAttribute("aria-busy", "true");
    processingOverlay(composer);
    input.disabled = true;
    input.placeholder = "";
    if (button) {
      button.disabled = true;
      button.textContent = "처리 중";
    }
  }

  function clearProcessingUI() {
    const { composer, input, button } = composerElements();
    composer?.classList.remove("is-action-processing");
    composer?.removeAttribute("aria-busy");
    composer?.querySelector("[data-action-processing-overlay]")?.remove();

    const session = currentSession();
    if (input) {
      input.disabled = Boolean(session?.movement);
      restoreInputPlaceholder(input);
    }
    if (button) {
      button.disabled = Boolean(session?.movement);
      button.textContent = "전송 ↵";
    }
  }

  function finishProcessing() {
    if (!processing) return;
    clearTimeout(processing.settleTimer);
    clearTimeout(processing.failSafeTimer);
    processing = null;
    document.body.removeAttribute("data-action-processing");
    clearProcessingUI();
  }

  function resultEntries(session) {
    if (!processing || !session) return [];
    return (session.logs || []).filter((entry) =>
      entry?.id &&
      !processing.baselineLogIds.has(entry.id) &&
      entry.type !== "action-input" &&
      entry.type !== "interaction" &&
      entry.type !== "chat-divider"
    );
  }

  function inspectProcessingState() {
    stateCheckQueued = false;
    if (!processing) return;

    const state = readState();
    const session = currentSession(state, processing.sessionId);
    if (!session) return finishProcessing();

    if (session.movement && Number(session.movement.startedAt || 0) >= processing.startedAt - 100) {
      return finishProcessing();
    }

    const entries = resultEntries(session);
    if (!entries.length) {
      applyProcessingUI();
      return;
    }

    const result = entries.at(-1);
    processing.resultId = result.id;
    processing.resultText = String(result.text || "");

    if (result.aiNarrationFinal === true) return finishProcessing();
    if (processing.narrationInFlight > 0) {
      applyProcessingUI();
      return;
    }

    clearTimeout(processing.settleTimer);
    processing.settleTimer = setTimeout(() => {
      if (!processing) return;
      if (processing.narrationStarted && !processing.narrationSettled) {
        applyProcessingUI();
        return;
      }
      finishProcessing();
    }, processing.narrationStarted ? 260 : 180);
  }

  function queueProcessingStateCheck() {
    if (stateCheckQueued) return;
    stateCheckQueued = true;
    queueMicrotask(inspectProcessingState);
  }

  function beginProcessing() {
    const sessionId = currentSessionId();
    const session = currentSession(readState(), sessionId);
    if (!sessionId || !session) return;

    processing = {
      sessionId,
      startedAt: Date.now(),
      baselineLogIds: new Set((session.logs || []).map((entry) => entry?.id).filter(Boolean)),
      resultId: "",
      resultText: "",
      narrationStarted: false,
      narrationSettled: false,
      narrationInFlight: 0,
      settleTimer: 0,
      failSafeTimer: 0,
    };
    document.body.setAttribute("data-action-processing", "true");
    queueMicrotask(() => processing && applyProcessingUI());
    processing.failSafeTimer = setTimeout(finishProcessing, 22_000);
  }

  function validateBeforeSubmit(event) {
    if (routePage() !== "investigate") return;
    const input = document.querySelector("[data-chat-input]");
    if (!input || input.disabled) return;
    const message = invalidActionMessage(input.value);
    if (message) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showInputAlert(message);
      return;
    }
    if (String(input.value || "").trim().startsWith("/")) beginProcessing();
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-send-chat]")) validateBeforeSubmit(event);
  }, true);

  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.isComposing &&
      event.target?.matches?.("[data-chat-input]")
    ) validateBeforeSubmit(event);
  }, true);

  const nativeSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function patchedInvestigationFeedbackSetItem(key, value) {
    const result = nativeSetItem.call(this, key, value);
    if (this === localStorage && key === GLOBAL_KEY && processing) queueProcessingStateCheck();
    return result;
  };

  const nativeFetch = typeof window.fetch === "function" ? window.fetch.bind(window) : null;
  if (nativeFetch) {
    window.fetch = async function feedbackAwareFetch(input, init) {
      const url = typeof input === "string" ? input : String(input?.url || "");
      const narrationRequest = /\/api\/narrate-action(?:\?|$)/.test(url) && processing;
      const active = processing;
      if (narrationRequest && active) {
        active.narrationStarted = true;
        active.narrationSettled = false;
        active.narrationInFlight += 1;
        applyProcessingUI();
      }
      try {
        return await nativeFetch(input, init);
      } finally {
        if (narrationRequest && processing === active) {
          active.narrationInFlight = Math.max(0, active.narrationInFlight - 1);
          active.narrationSettled = active.narrationInFlight === 0;
          setTimeout(() => {
            if (processing === active) {
              queueProcessingStateCheck();
              if (active.resultId && active.narrationSettled) {
                setTimeout(() => processing === active && finishProcessing(), 360);
              }
            }
          }, 0);
        }
      }
    };
  }

  if (toastRoot) {
    new MutationObserver(suppressInvestigationToasts).observe(toastRoot, { childList: true });
  }

  new MutationObserver(() => {
    if (appSyncQueued) return;
    appSyncQueued = true;
    requestAnimationFrame(() => {
      appSyncQueued = false;
      suppressInvestigationToasts();
      if (processing) applyProcessingUI();
    });
  }).observe(app, { childList: true });

  window.addEventListener("hashchange", () => {
    if (routePage() !== "investigate") finishProcessing();
    suppressInvestigationToasts();
  });
  window.addEventListener("pageshow", suppressInvestigationToasts);

  window.__BAEKJI_INVESTIGATION_FEEDBACK_TEST__ = Object.freeze({
    invalidActionMessage,
    routePage,
    inspectProcessingState,
  });

  suppressInvestigationToasts();
})();