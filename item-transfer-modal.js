(() => {
  "use strict";
  const T = window.BAEKJI_ITEM_TRANSFER;
  if (!T) return;

  let activeModalId = "";
  const read = () => T.parse(localStorage.getItem(T.STATE_KEY));

  function dispatchState(oldValue, newValue) {
    try {
      window.dispatchEvent(new StorageEvent("storage", {
        key: T.STATE_KEY,
        oldValue,
        newValue,
        storageArea: localStorage,
        url: location.href,
      }));
    } catch {
      const event = new Event("storage");
      Object.defineProperty(event, "key", { value: T.STATE_KEY });
      Object.defineProperty(event, "newValue", { value: newValue });
      window.dispatchEvent(event);
    }
  }

  function write(state) {
    T.aliasAll(state);
    const oldValue = localStorage.getItem(T.STATE_KEY);
    localStorage.setItem(T.STATE_KEY, JSON.stringify(state));
    dispatchState(oldValue, localStorage.getItem(T.STATE_KEY));
  }

  function toast(title, copy = "", type = "") {
    const root = document.getElementById("toast-root");
    if (!root) return;
    const element = document.createElement("div");
    element.className = `toast ${type}`;
    element.innerHTML = '<div class="toast-title"></div><div class="toast-copy"></div>';
    element.firstElementChild.textContent = title;
    element.lastElementChild.textContent = copy;
    if (!copy) element.lastElementChild.remove();
    root.appendChild(element);
    setTimeout(() => element.remove(), 3600);
  }

  function closeModal(transferId = "") {
    const root = document.getElementById("modal-root");
    if (root && (!transferId || root.querySelector(`[data-item-transfer-modal="${transferId}"]`))) root.innerHTML = "";
    activeModalId = "";
    queueMicrotask(showPendingModal);
  }

  function resolveTransfer(transferId, decision) {
    const state = read();
    const receiverId = T.uid();
    if (!state || !receiverId) return;
    const result = T.resolveOffer(state, transferId, receiverId, decision);
    if (!result.ok) {
      toast("전달 요청을 처리할 수 없습니다.", result.error, "error");
      closeModal(transferId);
      return;
    }
    write(state);
    closeModal(transferId);
    toast(
      result.resolution.decision === "ACCEPT" ? "소지품을 받았습니다." : "소지품을 받지 않았습니다.",
      result.offer.itemSnapshot?.displayName || result.offer.itemSnapshot?.name || "물품",
    );
  }

  function showPendingModal() {
    const root = document.getElementById("modal-root");
    if (!root) return;
    const state = read();
    const receiverId = T.uid();
    const offer = state && receiverId ? T.pending(state, receiverId)[0] : null;
    if (!offer) {
      if (activeModalId && root.querySelector("[data-item-transfer-modal]")) root.innerHTML = "";
      activeModalId = "";
      return;
    }
    if (activeModalId === offer.id && root.querySelector(`[data-item-transfer-modal="${offer.id}"]`)) return;
    if (root.children.length && !root.querySelector("[data-item-transfer-modal]")) return;

    const item = offer.itemSnapshot || {};
    activeModalId = offer.id;
    root.innerHTML = `<div class="retro-modal-backdrop retro-transfer-backdrop">
      <section class="retro-modal retro-transfer-modal" role="dialog" aria-modal="true" aria-labelledby="transfer-modal-title" data-item-transfer-modal="${offer.id}">
        <div class="retro-modal-title"><span>소지품 전달 요청</span><b>응답 필요</b></div>
        <div class="retro-transfer-sender"><span>보낸 캐릭터</span><strong></strong></div>
        <div class="retro-transfer-item-card"><div class="retro-transfer-item-icon">▣</div><div><small>전달하려는 물품</small><h2 id="transfer-modal-title"></h2><p class="retro-transfer-category"></p></div></div>
        <dl class="retro-transfer-info"><div><dt>상태</dt><dd data-transfer-state></dd></div><div><dt>수량</dt><dd>×${offer.quantity}</dd></div><div><dt>처리</dt><dd>수락 전까지 원래 소유자에게 유지</dd></div></dl>
        <p class="retro-transfer-note">수락하면 같은 상태의 물품끼리만 합쳐집니다. 상태가 다르면 별도의 소지품으로 보관됩니다.</p>
        <div class="retro-transfer-actions"><button type="button" class="retro-modal-button danger" data-transfer-reject>거절</button><button type="button" class="retro-modal-button primary" data-transfer-accept>수락</button></div>
      </section>
    </div>`;
    root.querySelector(".retro-transfer-sender strong").textContent = T.uname(offer.giverId);
    root.querySelector("#transfer-modal-title").textContent = item.displayName || T.display(item);
    root.querySelector(".retro-transfer-category").textContent = `${item.category || "일반"} · 기본 물품 ${item.baseItemId || offer.baseItemId || "-"}`;
    root.querySelector("[data-transfer-state]").textContent = item.stateLabel || T.label(item);
    root.querySelector("[data-transfer-reject]").addEventListener("click", () => resolveTransfer(offer.id, "REJECT"));
    root.querySelector("[data-transfer-accept]").addEventListener("click", () => resolveTransfer(offer.id, "ACCEPT"));
    requestAnimationFrame(() => root.querySelector("[data-transfer-accept]")?.focus());
  }

  function decorateInventory() {
    const state = read();
    const inventory = state?.characters?.[T.uid()]?.inventory || {};
    document.querySelectorAll("[data-item-modal]").forEach((row) => {
      if (row.querySelector(".retro-item-state-badge")) return;
      const reference = row.dataset.itemModal;
      const item = inventory[reference] || Object.values(inventory).find((candidate) => candidate?.itemId === reference);
      if (!item) return;
      const badge = document.createElement("small");
      badge.className = "retro-item-state-badge";
      badge.textContent = T.label(item);
      row.appendChild(badge);
    });
  }

  window.BAEKJI_ITEM_TRANSFER_UI = Object.freeze({ read, write, toast, showPendingModal, decorateInventory });
  window.addEventListener("storage", (event) => {
    if (event.key !== T.STATE_KEY) return;
    T.aliasAll(T.parse(event.newValue) || read());
    queueMicrotask(showPendingModal);
    queueMicrotask(decorateInventory);
  });
  window.addEventListener("hashchange", () => queueMicrotask(showPendingModal));
  window.addEventListener("pageshow", () => queueMicrotask(showPendingModal));
  new MutationObserver(() => {
    queueMicrotask(showPendingModal);
    queueMicrotask(decorateInventory);
  }).observe(document.documentElement, { childList: true, subtree: true });
  T.aliasAll(read());
  queueMicrotask(showPendingModal);
  queueMicrotask(decorateInventory);
})();
