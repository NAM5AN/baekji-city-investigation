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

  function colocated(state, offer) {
    const giverSession = T.sessionOf(state, offer?.giverId);
    const receiverSession = T.sessionOf(state, offer?.receiverId);
    return Boolean(
      giverSession?.status === "ACTIVE"
      && receiverSession?.status === "ACTIVE"
      && giverSession.variant === receiverSession.variant
      && T.scope(giverSession) === T.scope(receiverSession)
    );
  }

  let reconciling = false;
  async function reconcile() {
    if (reconciling) return false;
    const state = UI.read();
    const actorId = T.uid();
    if (!state || !actorId) return false;
    const now = Date.now();
    const offer = unresolvedOffers(state).find((entry) => (
      entry.giverId === actorId
      && (now >= Number(entry.expiresAt || 0) || !colocated(state, entry))
    ));
    if (!offer) return false;
    reconciling = true;
    try {
      const command = now >= Number(offer.expiresAt || 0)
        ? "EXPIRE_ITEM_TRANSFER_V1"
        : "CANCEL_ITEM_TRANSFER_V1";
      const result = await UI.dispatch(command, { transferId: offer.id });
      return result.status === "APPLIED" || result.status === "REPLAY";
    } catch { return false; }
    finally { reconciling = false; }
  }

  function queueReconcile() { queueMicrotask(() => { void reconcile(); }); }

  window.BAEKJI_ITEM_TRANSFER_LIFECYCLE = Object.freeze({
    resolution,
    unresolvedOffers,
    outgoing,
    colocated,
    reconcile,
  });

  window.addEventListener("storage", (event) => {
    if (event.key === T.STATE_KEY) queueReconcile();
  });
  window.addEventListener("hashchange", queueReconcile);
  window.addEventListener("pageshow", queueReconcile);
  setInterval(queueReconcile, 250);
  queueReconcile();
})();
