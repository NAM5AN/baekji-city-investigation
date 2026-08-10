(() => {
  "use strict";

  if (window.__BAEKJI_CHARACTER_INTERACTION_RESULT_VISIBILITY_FIX__) return;

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const previousSetItem = Storage.prototype.setItem;
  const previousGetItem = Storage.prototype.getItem;
  let repairing = false;

  function testerName(userId) {
    const id = String(userId || "");
    if (!id) return "";
    const legacy = {
      test_a: "테스트 캐릭터 A",
      test_b: "테스트 캐릭터 B",
      test_c: "테스트 캐릭터 C",
    }[id];
    if (legacy) return legacy;
    const users = window.__BAEKJI_TESTER_REGISTRY_GUARD__?.values?.() || [];
    const user = users.find((entry) => String(entry?.id || "") === id);
    return String(user?.name || user?.loginId || "").trim();
  }

  function subjectParticle(name) {
    const chars = Array.from(String(name || "").trim()).reverse();
    for (const char of chars) {
      const code = char.charCodeAt(0);
      if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 ? "이" : "가";
      if (/\d/.test(char)) return new Set(["0", "1", "3", "6", "7", "8"]).has(char) ? "이" : "가";
      if (/[A-Za-z]/.test(char)) return new Set(["F", "L", "M", "N", "R", "S", "X"]).has(char.toUpperCase()) ? "이" : "가";
    }
    return "가";
  }

  function repairObservedActorText(entry) {
    if (entry?.type !== "field-action" || !entry.observedActorId) return false;
    const name = testerName(entry.observedActorId);
    if (!name || !/다른 조사자(?:가|이)/.test(String(entry.text || ""))) return false;
    entry.text = String(entry.text).replace(/다른 조사자(?:가|이)/, `${name}${subjectParticle(name)}`);
    entry.observedActorName = name;
    return true;
  }

  function normalizeWorld(raw) {
    let state;
    try { state = JSON.parse(String(raw || "null")); }
    catch { return { raw, changed: false }; }
    if (!state || state.version !== 3 || !state.sessions) return { raw, changed: false };

    let changed = false;
    Object.values(state.sessions).forEach((session) => {
      (session?.logs || []).forEach((entry) => {
        if (entry?.kind === "CHARACTER_INTERACTION_RESULT") {
          // The player SYSTEM feed classifies non-action narration as visible only
          // when actorId is empty. Keep source identity separately for admin/audit.
          if (entry.actorId) {
            if (!entry.interactionActorId) entry.interactionActorId = entry.actorId;
            entry.actorId = null;
            changed = true;
          }
          if (!entry.systemNarration) {
            entry.systemNarration = true;
            changed = true;
          }
        }
        if (repairObservedActorText(entry)) changed = true;
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
    testerName,
  });

  repairLiveWorld();
  window.addEventListener?.("storage", (event) => {
    if (event.key === GLOBAL_KEY) queueMicrotask(repairLiveWorld);
  });
  window.addEventListener?.("baekji-tester-directory-ready", () => queueMicrotask(repairLiveWorld));
})();