(() => {
  "use strict";

  const MOBILE_QUERY = "(max-width: 980px)";
  const ATTENTION_CLASS = "choice-chat-attention";
  const MOBILE_SLIDE_MS = 220;
  let attentionTimer = 0;
  let pendingSuggestedText = "";
  let syncingInput = false;

  function isSuggestedActionTarget(target) {
    return Boolean(target?.closest?.("[data-suggested-action]"));
  }

  function isSendTarget(target) {
    return Boolean(target?.closest?.("[data-send-chat]"));
  }

  function isMobileInvestigation() {
    const mobile = window.matchMedia?.(MOBILE_QUERY)?.matches ?? window.innerWidth <= 980;
    return mobile && document.body.classList.contains("mobile-investigation-active");
  }

  function switchToChatPane() {
    if (!isMobileInvestigation()) return false;
    if (document.body.classList.contains("mobile-investigation-chat")) return false;
    const toggle = document.querySelector("[data-mobile-investigation-toggle]");
    if (!toggle) return false;
    toggle.click();
    return true;
  }

  function pulseComposer() {
    const input = document.querySelector("[data-chat-input]");
    const composer = input?.closest?.(".retro-chat-composer");
    if (!composer) return false;

    window.clearTimeout(attentionTimer);
    composer.classList.remove(ATTENTION_CLASS);
    void composer.offsetWidth;
    composer.classList.add(ATTENTION_CLASS);
    attentionTimer = window.setTimeout(() => composer.classList.remove(ATTENTION_CLASS), 620);
    return true;
  }

  function syncChatInput(input, value = input?.value) {
    if (!input) return false;
    const text = String(value ?? "");
    if (input.value !== text) input.value = text;
    syncingInput = true;
    try {
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    } finally {
      syncingInput = false;
    }
    return true;
  }

  function rememberSuggestedInput() {
    const input = document.querySelector("[data-chat-input]");
    const text = String(input?.value || "");
    if (!input || !text.trim()) return false;
    pendingSuggestedText = text;
    syncChatInput(input, text);
    return true;
  }

  function prepareSendFromSuggestedInput() {
    const input = document.querySelector("[data-chat-input]");
    if (!input) return false;
    const visibleText = String(input.value || "");
    const text = visibleText.trim() ? visibleText : pendingSuggestedText;
    if (!text.trim()) return false;
    syncChatInput(input, text);
    return true;
  }

  function runChoiceFeedback() {
    const switched = switchToChatPane();
    window.setTimeout(pulseComposer, switched ? MOBILE_SLIDE_MS : 0);
    return switched;
  }

  const TEST_API = Object.freeze({
    isSuggestedActionTarget,
    isSendTarget,
    runChoiceFeedback,
    pulseComposer,
    switchToChatPane,
    syncChatInput,
    rememberSuggestedInput,
    prepareSendFromSuggestedInput,
    MOBILE_SLIDE_MS,
  });
  if (typeof window !== "undefined") window.__BAEKJI_CHOICE_CHAT_FEEDBACK_TEST__ = TEST_API;

  if (typeof document === "undefined") return;

  document.addEventListener("input", (event) => {
    if (syncingInput || !event.target?.matches?.("[data-chat-input]")) return;
    pendingSuggestedText = String(event.target.value || "");
  });

  // Capture send clicks so the app's own button listener always sees the same
  // state as if the user had manually edited the auto-filled choice text.
  document.addEventListener("click", (event) => {
    if (!isSendTarget(event.target)) return;
    prepareSendFromSuggestedInput();
    queueMicrotask(() => { pendingSuggestedText = ""; });
  }, true);

  document.addEventListener("click", (event) => {
    if (!isSuggestedActionTarget(event.target)) return;
    // The app's own option handler runs first on the button and writes the text.
    // Defer until that render has completed, then emit a real input event so
    // the internal composer state is identical to manual typing.
    queueMicrotask(() => {
      rememberSuggestedInput();
      runChoiceFeedback();
    });
  });
})();
