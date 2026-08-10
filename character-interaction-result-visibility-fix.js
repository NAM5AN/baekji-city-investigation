(() => {
  "use strict";

  if (window.__BAEKJI_CHARACTER_INTERACTION_RESULT_VISIBILITY_FIX__) return;

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const previousSetItem = Storage.prototype.setItem;
  const previousGetItem = Storage.prototype.getItem;
  let repairing = false;

  function normalizeWorld(raw) {
    let state;
    try { state = JSON.parse(String(raw || "null")); }
    catch { return { raw, changed: false }; }
    if (!state || state.version !== 3 || !state.sessions) return { raw, changed: false };

    let changed = false;
    Object.values(state.sessions).forEach((session) => {
      (session?.logs || []).forEach((entry) => {
        if (entry?.kind !== "CHARACTER_INTERACTION_RESULT") return;

        // Player SYSTEM feed intentionally hides ordinary entries carrying actorId.
        // Interaction outcomes are SYSTEM narration, so keep the source identity as
        // metadata and clear actorId from the render-classification field.
        if (entry.actorId) {
          if (!entry.interactionActorId) entry.interactionActorId = entry.actorId;
          entry.actorId = null;
          changed = true;
        }
        if (!entry.systemNarration) {
          entry.systemNarration = true;
          changed = true;
        }
      });
    });

    return { raw: changed ? JSON.stringify(state) : raw, changed };
  }

  Storage.prototype.setItem = function patchedCharacterInteractionResultSetItem(key, value) {
    if (String(key) !== GLOBAL_KEY || repairing) return previousSetItem.call(this, key, value);
    const normalized = normalizeWorld(value);
    return previousSetItem.call(this, key, normalized.raw);
  };

  function repairLiveWorld() {
    if (repairing) return false;
    const raw = previousGetItem.call(localStorage, GLOBAL_KEY);
    const normalized = normalizeWorld(raw);
    if (!normalized.changed) return false;
    repairing = true;
    try { previousSetItem.call(localStorage, GLOBAL_KEY, normalized.raw); }
    finally { repairing = false; }
    try { window.dispatchEvent(new Event("hashchange")); } catch { /* ignore */ }
    return true;
  }

  window.__BAEKJI_CHARACTER_INTERACTION_RESULT_VISIBILITY_FIX__ = Object.freeze({
    normalizeWorld,
    repairLiveWorld,
  });

  repairLiveWorld();
  window.addEventListener?.("storage", (event) => {
    if (event.key === GLOBAL_KEY) queueMicrotask(repairLiveWorld);
  });
})();