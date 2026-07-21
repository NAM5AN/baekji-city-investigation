(() => {
  "use strict";

  const T = window.BAEKJI_ITEM_TRANSFER;
  const UI = window.BAEKJI_ITEM_TRANSFER_UI;
  if (!T || !UI) return;

  function resolution(state, transferId) {
    return (state?.itemTransferResolutions || []).find((entry) => entry?.transferId === transferId) || null;
  }

  function unresolvedOffers(state) {
    return (state?.itemTransferOffers || []).filter((offer) => offer?.id && !resolution(state, offer.id));
  }

  function outgoing(state, giverId) {
    const now = Date.now();
    return unresolvedOffers(state)
      .filter((offer) => offer.giverId === giverId && now < Number(offer.expiresAt || 0))
      .sort((a, b) => Number(a.createdAt || 0) - Number(b.createdAt || 0));
  }

  function appendLog(session, text, offer, decision, reason) {
    if (!session) return;
    if (!Array.isArray(session.logs)) session.logs = [];
    const duplicate = session.logs.some((entry) => entry?.itemTransferOfferId === offer.id && entry?.itemTransferDecision === decision);
    if (duplicate) return;
    session.logs.push({
      id: `item_transfer_${decision.toLowerCase()}_${offer.id}_${session.id}`,
      type: `item-transfer-${decision.toLowerCase()}`,
      text,
      actorId: null,
      at: Date.now(),
      scopeKey: offer.sourceScopeKey || "",
      itemTransferOfferId: offer.id,
      itemTransferDecision: decision,
      itemTransferReason: reason || "",
    });
  }

  function transferSessions(state, offer) {
    const sessions = [
      state?.sessions?.[offer.sourceSessionId],
      state?.sessions?.[offer.receiverSessionId],
      T.sessionOf(state, offer.giverId),
      T.sessionOf(state, offer.receiverId),
    ].filter(Boolean);
    return [...new Map(sessions.map((session) => [session.id, session])).values()];
  }

  function finalizeCancellation(state, offer, reason, resolvedBy = "SYSTEM") {
    if (!state || !offer || resolution(state, offer.id)) return false;
    const itemName = offer.itemSnapshot?.displayName || T.display(offer.itemSnapshot || {}) || "물품";
    const text = resolvedBy === offer.giverId
      ? `${T.uname(offer.giverId)}가 ${T.uname(offer.receiverId)}에게 건네려던 ${itemName} ×${offer.quantity} 전달을 취소했다. 물품은 원래 소유자에게 그대로 남았다.`
      : `${T.uname(offer.giverId)}와 ${T.uname(offer.receiverId)}가 서로 다른 장소로 이동해 ${itemName} ×${offer.quantity} 전달이 자동 취소됐다. 물품은 원래 소유자에게 그대로 남았다.`;

    const result = {
      id: `item_transfer_resolution_${offer.id}`,
      transferId: offer.id,
      decision: "CANCELLED",
      receiverId: offer.receiverId,
      resolvedBy,
      resolvedAt: Date.now(),
      reason,
      version: 1,
    };
    (state.itemTransferResolutions || (state.itemTransferResolutions = [])).push(result);
    transferSessions(state, offer).forEach((session) => appendLog(session, text, offer, "CANCELLED", reason));
    return true;
  }

  function cancel(state, transferId, giverId, reason = "보낸 캐릭터가 전달을 취소했다.") {
    const offer = (state?.itemTransferOffers || []).find((entry) => entry?.id === transferId);
    if (!offer || offer.giverId !== giverId) return { ok: false, error: "OFFER_NOT_FOUND" };
    if (resolution(state, transferId)) return { ok: false, error: "ALREADY_RESOLVED" };
    const changed = finalizeCancellation(state, offer, reason, giverId);
    return changed ? { ok: true, offer, resolution: resolution(state, transferId) } : { ok: false, error: "CANCEL_FAILED" };
  }

  function colocated(state, offer) {
    const giverSession = T.sessionOf(state, offer.giverId);
    const receiverSession = T.sessionOf(state, offer.receiverId);
    if (!giverSession || !receiverSession) return false;
    if (giverSession.status !== "ACTIVE" || receiverSession.status !== "ACTIVE") return false;
    return giverSession.variant === receiverSession.variant && T.scope(giverSession) === T.scope(receiverSession);
  }

  function reconcile(state) {
    if (!state) return false;
    let changed = false;
    const now = Date.now();
    unresolvedOffers(state).forEach((offer) => {
      if (resolution(state, offer.id)) return;
      if (now >= Number(offer.expiresAt || 0)) {
        const result = T.resolveOffer(state, offer.id, offer.receiverId, "EXPIRE");
        if (result.ok) changed = true;
        return;
      }
      if (!colocated(state, offer)) {
        changed = finalizeCancellation(
          state,
          offer,
          "둘 중 한 명이 전달을 시작한 장소를 벗어났다.",
          "SYSTEM",
        ) || changed;
      }
    });
    return changed;
  }

  function reconcileAndWrite() {
    const state = UI.read();
    if (!state || !reconcile(state)) return false;
    UI.write(state);
    try { sessionStorage.removeItem("baekji_transfer_held"); } catch { /* 무시 */ }
    return true;
  }

  let reconciling = false;
  function queueReconcile() {
    if (reconciling) return;
    reconciling = true;
    queueMicrotask(() => {
      reconciling = false;
      reconcileAndWrite();
    });
  }

  window.BAEKJI_ITEM_TRANSFER_LIFECYCLE = Object.freeze({
    resolution,
    unresolvedOffers,
    outgoing,
    cancel,
    colocated,
    reconcile,
    reconcileAndWrite,
  });

  window.addEventListener("storage", (event) => {
    if (event.key === T.STATE_KEY) queueReconcile();
  });
  window.addEventListener("hashchange", queueReconcile);
  window.addEventListener("pageshow", queueReconcile);
  setInterval(queueReconcile, 250);
  queueReconcile();
})();