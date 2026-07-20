(() => {
  "use strict";
  const T = window.BAEKJI_ITEM_TRANSFER;
  const UI = window.BAEKJI_ITEM_TRANSFER_UI;
  if (!T || !UI) return;

  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-transfer-item-button]");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();

    const state = UI.read();
    const giverId = T.uid();
    const receiverId = document.querySelector("[data-transfer-target]")?.value || "";
    const reference = document.querySelector("[data-transfer-item]")?.value || "";
    const item = T.entries(state?.characters?.[giverId]).find((candidate) => candidate.inventoryKey === reference || candidate.itemId === reference);
    if (!state || !giverId || !receiverId || !item) {
      UI.toast("받을 인물과 소지품을 선택해 주세요.", "전달은 현재 같은 현장에 있는 인물에게만 가능합니다.", "error");
      return;
    }

    const result = T.createOffer(state, {
      giverId,
      receiverId,
      inventoryKey: item.inventoryKey,
      quantity: 1,
      source: "inventory-button",
    });
    if (!result.ok) {
      UI.toast("소지품을 건넬 수 없습니다.", result.error, "error");
      return;
    }
    UI.write(state);
    UI.toast("전달 제안을 보냈습니다.", `${T.uname(receiverId)}가 수락해야 소지품이 이동합니다.`);
  }, true);
})();
