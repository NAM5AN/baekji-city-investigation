(() => {
  "use strict";
  const T = window.BAEKJI_ITEM_TRANSFER;
  const UI = window.BAEKJI_ITEM_TRANSFER_UI;
  if (!T || !UI) return;

  let busy = false;
  let bypassOnce = false;

  function likelyTransfer(text) {
    const value = String(text || "").trim();
    return value.startsWith("/") && /(건네|건넨|건넬|전달|넘겨|내밀|주려고|준다|주겠|맡긴|쥐여)/.test(value);
  }

  async function decide(text, context) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch("/api/interpret-transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context }),
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`TRANSFER_AI_${response.status}`);
      const payload = await response.json();
      return payload?.mode === "OFFER" ? payload : T.localInterpret(text, context);
    } catch {
      return T.localInterpret(text, context);
    } finally {
      clearTimeout(timer);
    }
  }

  function setPending(active) {
    const button = document.querySelector("[data-send-chat]");
    const input = document.querySelector("[data-chat-input]");
    if (button) {
      button.disabled = active;
      button.textContent = active ? "양도 확인 중" : "전송 ↵";
    }
    if (input) input.disabled = active;
  }

  function replayOriginal(button) {
    bypassOnce = true;
    queueMicrotask(() => button?.click());
  }

  async function processTransfer(text, button, input) {
    if (busy) return;
    busy = true;
    setPending(true);
    try {
      let state = UI.read();
      const giverId = T.uid();
      if (!state || !giverId) return replayOriginal(button);
      let decision = await decide(text, T.context(state, giverId));
      state = UI.read();
      if (!state) return replayOriginal(button);
      if (decision.mode !== "OFFER") decision = T.localInterpret(text, T.context(state, giverId));
      if (decision.mode !== "OFFER") return replayOriginal(button);

      const result = T.createOffer(state, {
        giverId,
        receiverId: decision.targetCharacterId,
        inventoryKey: decision.inventoryKey,
        quantity: Math.max(1, Number(decision.quantity || 1)),
        actionText: text,
        source: "free-action-ai",
      });
      if (!result.ok) {
        const messages = {
          NOT_COLOCATED: "현재 같은 현장에 있는 캐릭터에게만 건넬 수 있습니다.",
          ITEM_NOT_AVAILABLE: "해당 상태의 물품 수량이 부족하거나 다른 전달 제안에 묶여 있습니다.",
          ACTIVE_SESSION_REQUIRED: "진행 중인 조사 현장에서만 물품을 건넬 수 있습니다.",
        };
        UI.toast("소지품을 건넬 수 없습니다.", messages[result.error] || result.error, "error");
        return;
      }
      UI.write(state);
      if (input) input.value = "";
      input?.dispatchEvent(new Event("input", { bubbles: true }));
      UI.toast("전달 제안을 보냈습니다.", `${T.uname(result.offer.receiverId)}가 수락해야 소지품이 이동합니다.`);
    } finally {
      busy = false;
      setPending(false);
    }
  }

  document.addEventListener("click", (event) => {
    const button = event.target?.closest?.("[data-send-chat]");
    if (!button) return;
    if (bypassOnce) {
      bypassOnce = false;
      return;
    }
    const input = document.querySelector("[data-chat-input]");
    const text = input?.value || "";
    if (!likelyTransfer(text)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    processTransfer(text, button, input);
  }, true);

  document.addEventListener("keydown", (event) => {
    const input = event.target?.closest?.("[data-chat-input]");
    if (!input || event.key !== "Enter" || event.shiftKey || event.isComposing || !likelyTransfer(input.value)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    processTransfer(input.value, document.querySelector("[data-send-chat]"), input);
  }, true);
})();
