(() => {
  "use strict";
  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const SESSION_PROFILE_KEY = "baekji_city_tester_session_profile_v1";
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const LEGACY_BY_NAME = new Map([
    ["테스트캐릭터a", "test_a"], ["캐릭터a", "test_a"],
    ["테스트캐릭터b", "test_b"], ["캐릭터b", "test_b"],
    ["테스트캐릭터c", "test_c"], ["캐릭터c", "test_c"],
  ]);
  let repairing = false;
  let queued = false;

  const normalize = (value) => String(value || "").replace(/\s+/g, "").toLowerCase();
  const isObject = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));

  function mergeCollision(left, right) {
    if (!isObject(left) || !isObject(right)) return right ?? left;
    const out = { ...left };
    Object.entries(right).forEach(([key, value]) => {
      if (isObject(out[key]) && isObject(value)) out[key] = mergeCollision(out[key], value);
      else if (value !== undefined) out[key] = value;
    });
    return out;
  }

  function replaceIdentity(value, legacyId, currentId) {
    if (value === legacyId) return currentId;
    if (Array.isArray(value)) return [...new Set(value.map((item) => replaceIdentity(item, legacyId, currentId)))];
    if (!isObject(value)) return value;
    const out = {};
    Object.entries(value).forEach(([key, item]) => {
      const nextKey = key === legacyId ? currentId : key;
      const nextValue = replaceIdentity(item, legacyId, currentId);
      out[nextKey] = Object.prototype.hasOwnProperty.call(out, nextKey)
        ? mergeCollision(out[nextKey], nextValue)
        : nextValue;
    });
    return out;
  }

  function mergedCharacter(legacy, current, currentId) {
    const left = isObject(legacy) ? legacy : {};
    const right = isObject(current) ? current : {};
    const out = mergeCollision(left, right);
    out.id = currentId;
    out.currentPartyId = right.currentPartyId || left.currentPartyId || null;
    out.currentSessionId = right.currentSessionId || left.currentSessionId || null;
    out.inventory = mergeCollision(left.inventory || {}, right.inventory || {});
    const rightContamination = Number(right.contamination);
    const leftContamination = Number(left.contamination);
    out.contamination = Number.isFinite(rightContamination) && rightContamination > 0
      ? rightContamination
      : Number.isFinite(leftContamination) ? leftContamination : 0;
    out.symptom = String(right.symptom || left.symptom || "안정");
    if (!("onlineAt" in out)) out.onlineAt = null;
    return out;
  }

  function repairSnapshot(snapshot, currentId, legacyId) {
    if (!snapshot || snapshot.version !== 3 || !UUID_RE.test(String(currentId || "")) || !legacyId) return snapshot;
    const originalLegacy = snapshot.characters?.[legacyId];
    const originalCurrent = snapshot.characters?.[currentId];
    const repaired = replaceIdentity(snapshot, legacyId, currentId);
    repaired.characters ||= {};
    repaired.characters[currentId] = mergedCharacter(originalLegacy, originalCurrent, currentId);
    delete repaired.characters[legacyId];
    return repaired;
  }

  function currentLegacyId(currentId) {
    const registryUser = window.__BAEKJI_TESTER_REGISTRY_GUARD__?.values?.()
      ?.find?.((user) => String(user?.id || "") === currentId);
    let name = String(registryUser?.name || registryUser?.loginId || "");
    if (!name) {
      try {
        const saved = JSON.parse(sessionStorage.getItem(SESSION_PROFILE_KEY) || "null");
        if (String(saved?.id || "") === currentId) name = String(saved?.name || saved?.loginId || "");
      } catch { /* ignore */ }
    }
    return LEGACY_BY_NAME.get(normalize(name)) || "";
  }

  function dispatchUpdate(oldRaw, newRaw) {
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
    window.dispatchEvent(new CustomEvent("baekji-tester-identity-repaired", { detail: { version: "0.3.96" } }));
  }

  function repairNow() {
    if (repairing) return false;
    const currentId = String(sessionStorage.getItem(USER_KEY) || "");
    if (!UUID_RE.test(currentId)) return false;
    const legacyId = currentLegacyId(currentId);
    if (!legacyId) return false;
    const oldRaw = persistence.readRaw();
    let snapshot;
    try { snapshot = JSON.parse(oldRaw || "null"); } catch { snapshot = null; }
    if (!snapshot || snapshot.version !== 3) return false;

    const hasLegacyReference = oldRaw?.includes(`\"${legacyId}\"`);
    const currentCharacter = snapshot.characters?.[currentId];
    const legacyCharacter = snapshot.characters?.[legacyId];
    const needsPartyRecovery = !currentCharacter?.currentPartyId && legacyCharacter?.currentPartyId;
    const needsSessionRecovery = !currentCharacter?.currentSessionId && legacyCharacter?.currentSessionId;
    if (!hasLegacyReference && !needsPartyRecovery && !needsSessionRecovery) return false;

    const next = repairSnapshot(snapshot, currentId, legacyId);
    const newRaw = JSON.stringify(next);
    if (newRaw === oldRaw) return false;
    repairing = true;
    try { persistence.writeRaw(newRaw); }
    finally { repairing = false; }
    dispatchUpdate(oldRaw, newRaw);
    return true;
  }

  function scheduleRepair() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      repairNow();
    });
  }

  window.__BAEKJI_TESTER_IDENTITY_REPAIR_TEST__ = Object.freeze({ normalize, replaceIdentity, mergedCharacter, repairSnapshot });
  window.__BAEKJI_TESTER_IDENTITY_REPAIR__ = Object.freeze({ version: "0.3.96", repairNow });
  const persistence = window.__BAEKJI_WORLD_PERSISTENCE__;
  if (!persistence) return;

  window.addEventListener("storage", (event) => {
    if (!event.key || event.key === GLOBAL_KEY) scheduleRepair();
  });
  window.addEventListener("baekji-cloud-sync", scheduleRepair);
  window.addEventListener("baekji-tester-directory-ready", scheduleRepair);
  window.addEventListener("pageshow", scheduleRepair);
  scheduleRepair();
})();
