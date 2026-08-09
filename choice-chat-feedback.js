(() => {
  "use strict";

  const MOBILE_QUERY = "(max-width: 980px)";
  const ATTENTION_CLASS = "choice-chat-attention";
  const MOBILE_SLIDE_MS = 220;
  let attentionTimer = 0;

  function isSuggestedActionTarget(target) {
    return Boolean(target?.closest?.("[data-suggested-action]"));
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

  function runChoiceFeedback() {
    const switched = switchToChatPane();
    window.setTimeout(pulseComposer, switched ? MOBILE_SLIDE_MS : 0);
    return switched;
  }

  const TEST_API = Object.freeze({
    isSuggestedActionTarget,
    runChoiceFeedback,
    pulseComposer,
    switchToChatPane,
    MOBILE_SLIDE_MS,
  });
  if (typeof window !== "undefined") window.__BAEKJI_CHOICE_CHAT_FEEDBACK_TEST__ = TEST_API;

  if (typeof document === "undefined") return;

  document.addEventListener("click", (event) => {
    if (!isSuggestedActionTarget(event.target)) return;
    // The app's own option handler runs first on the button and writes the text.
    // Defer our visual feedback until that render has completed.
    queueMicrotask(runChoiceFeedback);
  });
})();
