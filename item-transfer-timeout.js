(() => {
  "use strict";
  const T = window.BAEKJI_ITEM_TRANSFER;
  const UI = window.BAEKJI_ITEM_TRANSFER_UI;
  if (!T || !UI) return;
  const KEY = "baekji_transfer_held";
  const held = () => sessionStorage.getItem(KEY) || "";
  const setHeld = (id = "") => id ? sessionStorage.setItem(KEY, id) : sessionStorage.removeItem(KEY);
  const pending = () => T.pending(UI.read(), T.uid())[0] || null;
  function hide(id) { setHeld(id); const root = document.getElementById("modal-root"); if (root) root.innerHTML = ""; drawButton(); }
  function reopen() { setHeld(); UI.showPendingModal(); }
  function drawButton() {
    document.querySelectorAll("[data-transfer-reopen]").forEach((node) => node.remove());
    const offer = pending();
    if (!offer || held() !== offer.id) return;
    const choice = document.querySelector("[data-open-choice-panel], .retro-choice-launch");
    if (!choice?.parentElement) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "retro-transfer-resume-launch";
    button.dataset.transferReopen = "true";
    button.textContent = "◆ 양도 요청";
    button.addEventListener("click", reopen);
    choice.parentElement.insertBefore(button, choice);
  }
  function decorate() {
    const modal = document.querySelector("[data-item-transfer-modal]");
    if (!modal || modal.dataset.timerReady) return;
    const offer = pending();
    if (!offer || offer.id !== modal.dataset.itemTransferModal) return;
    modal.dataset.timerReady = "true";
    const title = modal.querySelector(".retro-modal-title");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "retro-transfer-close";
    close.textContent = "×";
    close.setAttribute("aria-label", "보류");
    close.addEventListener("click", () => hide(offer.id));
    title?.appendChild(close);
    const actions = modal.querySelector(".retro-transfer-actions");
    const hold = document.createElement("button");
    hold.type = "button";
    hold.className = "retro-modal-button hold";
    hold.textContent = "보류";
    hold.addEventListener("click", () => hide(offer.id));
    actions?.prepend(hold);
    const timer = document.createElement("div");
    timer.className = "retro-transfer-timer";
    timer.innerHTML = '<span>응답 남은 시간 <b data-transfer-seconds></b></span><div><i data-transfer-bar></i></div>';
    actions?.before(timer);
  }
  function tick() {
    const state = UI.read();
    const offer = T.pending(state, T.uid())[0];
    if (!offer) { setHeld(); drawButton(); return; }
    const left = Math.max(0, Number(offer.expiresAt) - Date.now());
    if (!left) { T.resolveOffer(state, offer.id, T.uid(), "EXPIRE"); UI.write(state); setHeld(); return; }
    const modal = document.querySelector(`[data-item-transfer-modal="${offer.id}"]`);
    if (modal) {
      const seconds = Math.ceil(left / 1000);
      const label = modal.querySelector("[data-transfer-seconds]");
      const bar = modal.querySelector("[data-transfer-bar]");
      if (label) label.textContent = `00:${String(seconds).padStart(2, "0")}`;
      if (bar) bar.style.transform = `scaleX(${left / 60000})`;
    }
    drawButton();
  }
  new MutationObserver(() => { decorate(); drawButton(); }).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(tick, 250);
  tick();
})();
