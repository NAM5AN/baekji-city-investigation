(() => {
  "use strict";
  const T = window.BAEKJI_ITEM_TRANSFER;
  const UI = window.BAEKJI_ITEM_TRANSFER_UI;
  if (!T || !UI) return;

  const KEY = "baekji_transfer_held";
  const held = () => {
    try { return sessionStorage.getItem(KEY) || ""; } catch { return ""; }
  };
  const setHeld = (id = "") => {
    try {
      if (id) sessionStorage.setItem(KEY, id);
      else sessionStorage.removeItem(KEY);
    } catch { /* 저장소를 사용할 수 없는 환경은 무시합니다. */ }
  };
  const pending = () => T.pending(UI.read(), T.uid())[0] || null;

  function hide(id) {
    setHeld(id);
    const root = document.getElementById("modal-root");
    if (root) root.innerHTML = "";
    drawButton();
  }

  function reopen() {
    setHeld();
    drawButton();
    UI.showPendingModal();
  }

  function drawButton() {
    const offer = pending();
    const buttons = [...document.querySelectorAll("[data-transfer-reopen]")];

    if (!offer || held() !== offer.id) {
      buttons.forEach((button) => button.remove());
      return;
    }

    const choice = document.querySelector("[data-open-choice-panel], .retro-choice-launch");
    if (!choice?.parentElement) {
      buttons.forEach((button) => button.remove());
      return;
    }

    let button = buttons.find((node) => node.dataset.transferReopen === offer.id) || null;
    buttons.filter((node) => node !== button).forEach((node) => node.remove());

    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "retro-transfer-resume-launch";
      button.dataset.transferReopen = offer.id;
      button.textContent = "◆ 양도 요청";
      button.addEventListener("click", reopen);
    }

    if (button.parentElement !== choice.parentElement || button.nextElementSibling !== choice) {
      choice.parentElement.insertBefore(button, choice);
    }
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
    if (!offer) {
      if (held()) setHeld();
      drawButton();
      return;
    }

    const left = Math.max(0, Number(offer.expiresAt) - Date.now());
    if (left <= 0) {
      T.resolveOffer(state, offer.id, T.uid(), "EXPIRE");
      UI.write(state);
      setHeld();
      drawButton();
      return;
    }

    const modal = document.querySelector(`[data-item-transfer-modal="${offer.id}"]`);
    if (modal) {
      const seconds = Math.ceil(left / 1000);
      const nextLabel = `00:${String(seconds).padStart(2, "0")}`;
      const nextTransform = `scaleX(${Math.max(0, Math.min(1, left / 60000))})`;
      const label = modal.querySelector("[data-transfer-seconds]");
      const bar = modal.querySelector("[data-transfer-bar]");
      if (label && label.textContent !== nextLabel) label.textContent = nextLabel;
      if (bar && bar.style.transform !== nextTransform) bar.style.transform = nextTransform;
    }
    drawButton();
  }

  let syncQueued = false;
  function queueSync() {
    if (syncQueued) return;
    syncQueued = true;
    queueMicrotask(() => {
      syncQueued = false;
      decorate();
      drawButton();
    });
  }

  new MutationObserver(queueSync).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", queueSync);
  window.addEventListener("pageshow", queueSync);
  setInterval(tick, 250);
  tick();
})();