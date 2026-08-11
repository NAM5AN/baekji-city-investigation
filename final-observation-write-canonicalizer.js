(() => {
  "use strict";

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  if (typeof Storage === "undefined" || typeof localStorage === "undefined") return;

  const previousSetItem = Storage.prototype.setItem;
  const previousGetItem = Storage.prototype.getItem;

  function parseState(value) {
    try {
      const state = typeof value === "string" ? JSON.parse(value) : value;
      return state?.version === 3 ? state : null;
    } catch {
      return null;
    }
  }

  function canonicalizeFinalObservationTexts(state) {
    if (!state?.sessions) return false;
    const actions = new Map();
    Object.values(state.sessions).forEach((session) => {
      (session?.logs || []).forEach((entry) => {
        if (entry?.id && entry.type === "action-input") actions.set(entry.id, entry);
      });
    });

    let changed = false;
    Object.values(state.sessions).forEach((session) => {
      (session?.logs || []).forEach((entry) => {
        if (entry?.type !== "field-action" || !entry.sourceActionLogId) return;
        const source = actions.get(entry.sourceActionLogId);
        const finalText = String(source?.fieldObservationAiText || "").trim();
        if (source?.fieldObservationAiStatus !== "final" || !finalText) return;

        const isFallback = source.fieldObservationResultSource === "fallback";
        const actorId = source.actorId || entry.observedActorId || null;
        const nextFinal = !isFallback;
        const nextSource = isFallback ? "fallback" : "ai";
        const nextVersion = isFallback ? 2 : 3;

        if (entry.text !== finalText) changed = true;
        if (entry.observedActorId !== actorId) changed = true;
        if (entry.observationAiPending !== false) changed = true;
        if (entry.observationAiFinal !== nextFinal) changed = true;
        if (entry.observationSource !== nextSource) changed = true;
        if (Number(entry.observationTextVersion) !== nextVersion) changed = true;

        entry.text = finalText;
        entry.observedActorId = actorId;
        entry.observationAiPending = false;
        entry.observationAiFinal = nextFinal;
        entry.observationSource = nextSource;
        entry.observationTextVersion = nextVersion;
      });
    });
    return changed;
  }

  Storage.prototype.setItem = function canonicalFinalObservationSetItem(key, value) {
    if (this !== localStorage || String(key) !== GLOBAL_KEY) {
      return previousSetItem.call(this, key, value);
    }

    const state = parseState(value);
    if (!state) return previousSetItem.call(this, key, value);

    canonicalizeFinalObservationTexts(state);
    const nextValue = JSON.stringify(state);
    const currentValue = previousGetItem.call(this, key);

    // action-log-sync can still attempt its legacy generic v2 repair. If that
    // repair canonicalizes back to the already-stored final v3 state, stop here
    // so no native storage event or cloud push is generated at all.
    if (currentValue === nextValue) return undefined;
    return previousSetItem.call(this, key, nextValue);
  };

  window.__BAEKJI_FINAL_OBSERVATION_WRITE_TEST__ = Object.freeze({
    parseState,
    canonicalizeFinalObservationTexts,
  });
})();
