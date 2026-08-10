(() => {
  "use strict";

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const VERSION = "0.3.91";
  let writing = false;
  let queued = false;

  function readState(raw = null) {
    try {
      const parsed = JSON.parse(raw == null ? localStorage.getItem(GLOBAL_KEY) || "null" : raw);
      return parsed?.version === 3 ? parsed : null;
    } catch {
      return null;
    }
  }

  function displayName(state, party) {
    return window.__BAEKJI_PARTY_NAME_UI__?.displayName?.(state, party) || String(party?.name || "다른 조사조");
  }

  function repairEntryPresenceLabels(state) {
    if (!state?.parties || !state?.sessions) return false;
    const replacements = Object.values(state.parties).map((party) => {
      const raw = String(party?.name || "").trim();
      const display = displayName(state, party);
      return raw && display && raw !== display ? { raw, display } : null;
    }).filter(Boolean);
    if (!replacements.length) return false;

    let changed = false;
    Object.values(state.sessions).forEach((session) => {
      (session?.logs || []).forEach((entry) => {
        if (!entry?.entryPresenceFix || entry.type !== "presence" || typeof entry.text !== "string") return;
        let next = entry.text;
        replacements.forEach(({ raw, display }) => {
          if (next.includes(raw)) next = next.split(raw).join(display);
        });
        if (next === entry.text) return;
        entry.text = next;
        entry.partyLabelVersion = VERSION;
        changed = true;
      });
    });
    return changed;
  }

  function dispatchUpdate(oldRaw, newRaw) {
    if (oldRaw === newRaw) return;
    try {
      window.dispatchEvent(new StorageEvent("storage", {
        key: GLOBAL_KEY,
        oldValue: oldRaw,
        newValue: newRaw,
        storageArea: localStorage,
        url: location.href,
      }));
    } catch {
      const event = new Event("storage");
      Object.defineProperty(event, "key", { value: GLOBAL_KEY });
      Object.defineProperty(event, "oldValue", { value: oldRaw });
      Object.defineProperty(event, "newValue", { value: newRaw });
      window.dispatchEvent(event);
    }
  }

  function repair(raw = null) {
    if (writing) return false;
    const oldRaw = raw == null ? localStorage.getItem(GLOBAL_KEY) : String(raw || "");
    const state = readState(oldRaw);
    if (!state || !repairEntryPresenceLabels(state)) return false;
    const newRaw = JSON.stringify(state);
    writing = true;
    try { localStorage.setItem(GLOBAL_KEY, newRaw); }
    finally { writing = false; }
    dispatchUpdate(oldRaw, newRaw);
    return true;
  }

  function scheduleRepair() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      repair();
    });
  }

  window.addEventListener("storage", (event) => {
    if (writing || (event.key && event.key !== GLOBAL_KEY)) return;
    repair(event.newValue || null);
  });
  window.addEventListener("baekji-party-name-change", scheduleRepair);
  window.addEventListener("hashchange", scheduleRepair);

  window.__BAEKJI_ENTRY_PRESENCE_PARTY_LABEL_TEST__ = Object.freeze({ repairEntryPresenceLabels });
  scheduleRepair();
})();
