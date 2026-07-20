(() => {
  "use strict";

  const KEY = "baekji_city_mvp_state_v3";
  const OLD_ACTION_MS = 30000;
  if (typeof Storage === "undefined" || !window.__BAEKJI_SYNC_SET_ITEM__ || !window.__BAEKJI_SYNC_GET_ITEM__) return;

  const wrappedSet = Storage.prototype.setItem;
  const rawSet = window.__BAEKJI_SYNC_SET_ITEM__;
  const rawGet = window.__BAEKJI_SYNC_GET_ITEM__;

  function parse(value) {
    try {
      const state = typeof value === "string" ? JSON.parse(value) : value;
      return state?.version === 3 ? state : null;
    } catch { return null; }
  }

  function sourceMap(state) {
    const map = new Map();
    Object.values(state?.sessions || {}).forEach((session) => (session.logs || []).forEach((entry) => {
      if (entry?.id && entry.type === "action-input") map.set(entry.id, entry);
    }));
    return map;
  }

  function groups(state) {
    const map = new Map();
    Object.values(state?.sessions || {}).forEach((session) => (session.logs || []).forEach((entry) => {
      if (entry?.type !== "field-action" || !entry.sourceActionLogId) return;
      const list = map.get(entry.sourceActionLogId) || [];
      list.push(entry);
      map.set(entry.sourceActionLogId, list);
    }));
    return map;
  }

  function closeOldFallbacks(state, now = Date.now()) {
    const actions = sourceMap(state);
    groups(state).forEach((targets, actionId) => {
      const source = actions.get(actionId);
      if (!source) return;
      const isOldUnprocessed = !source.fieldObservationAiStatus && now - Number(source.at || 0) > OLD_ACTION_MS;
      const isFailed = source.fieldObservationAiStatus === "fallback";
      if (!isOldUnprocessed && !isFailed) return;
      const fallback = targets.find((entry) => entry.observationFallbackText || entry.text);
      const text = String(fallback?.observationFallbackText || fallback?.text || "");
      source.fieldObservationAiStatus = "final";
      source.fieldObservationResultSource = "fallback";
      source.fieldObservationAiText = text;
      targets.forEach((entry) => {
        entry.text = entry.observationFallbackText || entry.text || text;
        entry.observationAiPending = false;
        entry.observationAiFinal = false;
        entry.observationSource = "fallback";
      });
    });
  }

  function restoreFinalTexts(state) {
    const actions = sourceMap(state);
    let changed = false;
    groups(state).forEach((targets, actionId) => {
      const source = actions.get(actionId);
      const text = String(source?.fieldObservationAiText || "").trim();
      if (source?.fieldObservationAiStatus !== "final" || !text) return;
      const isFallback = source.fieldObservationResultSource === "fallback";
      targets.forEach((entry) => {
        if (entry.text !== text) changed = true;
        entry.text = text;
        entry.observationAiPending = false;
        entry.observationAiFinal = !isFallback;
        entry.observationSource = isFallback ? "fallback" : "ai";
        entry.observationTextVersion = isFallback ? 2 : 3;
      });
    });
    return changed;
  }

  Storage.prototype.setItem = function guardedSetItem(key, value) {
    let next = value;
    if (this === localStorage && key === KEY) {
      const incoming = parse(value);
      if (incoming) {
        closeOldFallbacks(incoming);
        next = JSON.stringify(incoming);
      }
    }
    const result = wrappedSet.call(this, key, next);
    if (this !== localStorage || key !== KEY) return result;
    const stored = parse(rawGet.call(localStorage, KEY));
    if (!stored || !restoreFinalTexts(stored)) return result;
    rawSet.call(localStorage, KEY, JSON.stringify(stored));
    return result;
  };

  window.__BAEKJI_OBSERVATION_GUARD_TEST__ = Object.freeze({ closeOldFallbacks, restoreFinalTexts });
})();
