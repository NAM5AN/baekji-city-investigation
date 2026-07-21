(() => {
  "use strict";

  const app = document.getElementById("app");
  if (!app || typeof MutationObserver === "undefined") return;

  const SHIELD = "data-motion-replay-shield";
  let queued = false;
  let releaseToken = 0;

  function restoreExistingText(entry) {
    const target = entry.querySelector(".retro-chat-bubble, .retro-character-log-text, .retro-system-copy");
    if (!target) return;
    const fullText = target.dataset.motionFullText;
    if (fullText != null && target.textContent !== fullText) target.textContent = fullText;
    target.classList.remove("motion-type-target", "is-typing");
    delete target.dataset.motionTyping;
  }

  function release(token) {
    if (token !== releaseToken) return;
    document.querySelectorAll(`[${SHIELD}]`).forEach((entry) => {
      entry.classList.remove("retro-action-result-pending");
      entry.removeAttribute(SHIELD);
    });
  }

  function shieldExisting() {
    queued = false;
    const token = ++releaseToken;

    document.querySelectorAll(".motion-stable-existing").forEach((entry) => {
      restoreExistingText(entry);
      entry.setAttribute(SHIELD, "true");
      entry.classList.add("retro-action-result-pending");
    });

    requestAnimationFrame(() => requestAnimationFrame(() => requestAnimationFrame(() => release(token))));
  }

  function queueShield() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(shieldExisting);
  }

  new MutationObserver(queueShield).observe(app, { childList: true });
  window.addEventListener("hashchange", queueShield);
  window.addEventListener("pageshow", queueShield);

  window.__BAEKJI_MOTION_REPLAY_GUARD_TEST__ = Object.freeze({
    shieldExisting,
    restoreExistingText,
  });

  queueShield();
})();