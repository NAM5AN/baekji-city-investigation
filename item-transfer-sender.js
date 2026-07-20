(() => {
  "use strict";

  const T = window.BAEKJI_ITEM_TRANSFER;
  const UI = window.BAEKJI_ITEM_TRANSFER_UI;
  const L = window.BAEKJI_ITEM_TRANSFER_LIFECYCLE;
  if (!T || !UI || !L) return;

  let activeOfferId = "";
  let lastResolutionKey = "";

  function clearSenderModal() {
    const root = document.getElementById("modal-root");
    const modal = root?.querySelector("[data-item-transfer-sender-modal]");
    if (modal) root.innerHTML = "";
    activeOfferId = "";
  }

  function remaining(offer) {
    return Math.max(0, Number(offer?.expiresAt || 0) - Date.now());
  }

  function formatRemaining(milliseconds) {
    const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
    return `00:${String(seconds).padStart(2, "0")}`;
  }

  function updateTimer(modal, offer) {
    const left = remaining(offer);
    const label = modal?.querySelector("[data-transfer-sender-seconds]");
    const bar = modal?.querySelector("[data-transfer-sender-bar]");
    if (label) label.textContent = formatRemaining(left);
    if (bar) bar.style.transform = `scaleX(${Math.max(0, Math.min(1, left / 60000))})`;
  }

  function cancelOffer(offer) {
    const state = UI.read();
    const giverId = T.uid();
    if (!state || !giverId) return;
    const result = L.cancel(state, offer.id, giverId);
    if (!result.ok) {
      UI.toast("전달을 취소할 수 없습니다.", result.error || "이미 처리된 요청입니다.", "error");
      clearSenderModal();
      return;
    }
    UI.write(state);
    clearSenderModal();
    UI.toast("소지품 전달을 취소했습니다.", offer.itemSnapshot?.displayName || T.display(offer.itemSnapshot || {}));
  }

  function resolutionNotice(state, offerId) {
    if (!offerId) return;
    const resolved = L.resolution(state, offerId);
    if (!resolved) return;
    const key = `${resolved.transferId}:${resolved.decision}:${resolved.resolvedAt}`;
    if (key === lastResolutionKey) return;
    lastResolutionKey = key;
    const offer = (state.itemTransferOffers || []).find((entry) => entry?.id === offerId);
    const itemName = offer?.itemSnapshot?.displayName || T.display(offer?.itemSnapshot || {}) || "물품";
    const title = resolved.decision === "ACCEPT"
      ? "상대방이 소지품을 받았습니다."
      : resolved.decision === "REJECT"
        ? "상대방이 전달을 거절했습니다."
        : resolved.decision === "CANCELLED"
          ? "소지품 전달이 취소됐습니다."
          : "소지품 전달 시간이 만료됐습니다.";
    UI.toast(title, itemName);
  }

  function renderSenderModal(offer) {
    const root = document.getElementById("modal-root");
    if (!root) return;
    if (root.querySelector("[data-item-transfer-modal]")) return;
    if (root.children.length && !root.querySelector("[data-item-transfer-sender-modal]")) return;

    const existing = root.querySelector(`[data-item-transfer-sender-modal="${offer.id}"]`);
    if (existing) {
      activeOfferId = offer.id;
      updateTimer(existing, offer);
      return;
    }

    const item = offer.itemSnapshot || {};
    activeOfferId = offer.id;
    root.innerHTML = `<div class="retro-modal-backdrop retro-transfer-backdrop">
      <section class="retro-modal retro-transfer-modal retro-transfer-sender-wait-modal" role="dialog" aria-modal="true" aria-labelledby="transfer-sender-modal-title" data-item-transfer-sender-modal="${offer.id}">
        <div class="retro-modal-title"><span>소지품 전달 중</span><b>응답 대기</b></div>
        <div class="retro-transfer-sender"><span>받는 캐릭터</span><strong></strong></div>
        <div class="retro-transfer-item-card"><div class="retro-transfer-item-icon">▣</div><div><small>건네는 물품</small><h2 id="transfer-sender-modal-title"></h2><p class="retro-transfer-category"></p></div></div>
        <dl class="retro-transfer-info"><div><dt>상태</dt><dd data-transfer-sender-state></dd></div><div><dt>수량</dt><dd>×${offer.quantity}</dd></div><div><dt>처리</dt><dd>응답 전까지 내 소지품에 유지</dd></div></dl>
        <p class="retro-transfer-waiting-copy"><span class="retro-transfer-wait-dot" aria-hidden="true"></span>상대방의 답변을 기다리는 중...</p>
        <div class="retro-transfer-timer"><span>응답 남은 시간 <b data-transfer-sender-seconds></b></span><div><i data-transfer-sender-bar></i></div></div>
        <div class="retro-transfer-actions retro-transfer-sender-actions"><button type="button" class="retro-modal-button danger" data-transfer-cancel>전달 취소</button></div>
      </section>
    </div>`;
    const modal = root.querySelector(`[data-item-transfer-sender-modal="${offer.id}"]`);
    modal.querySelector(".retro-transfer-sender strong").textContent = T.uname(offer.receiverId);
    modal.querySelector("#transfer-sender-modal-title").textContent = item.displayName || T.display(item);
    modal.querySelector(".retro-transfer-category").textContent = `${item.category || "일반"} · 기본 물품 ${item.baseItemId || offer.baseItemId || "-"}`;
    modal.querySelector("[data-transfer-sender-state]").textContent = item.stateLabel || T.label(item);
    modal.querySelector("[data-transfer-cancel]").addEventListener("click", () => cancelOffer(offer));
    updateTimer(modal, offer);
    requestAnimationFrame(() => modal.querySelector("[data-transfer-cancel]")?.focus());
  }

  function refresh() {
    const state = UI.read();
    const giverId = T.uid();
    if (!state || !giverId) {
      clearSenderModal();
      return;
    }

    const offer = L.outgoing(state, giverId)[0] || null;
    if (!offer) {
      const previous = activeOfferId;
      clearSenderModal();
      resolutionNotice(state, previous);
      return;
    }
    renderSenderModal(offer);
  }

  let refreshQueued = false;
  function queueRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      refresh();
    });
  }

  window.addEventListener("storage", (event) => {
    if (event.key === T.STATE_KEY) queueRefresh();
  });
  window.addEventListener("hashchange", queueRefresh);
  window.addEventListener("pageshow", queueRefresh);
  new MutationObserver(queueRefresh).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(refresh, 250);
  queueRefresh();
})();