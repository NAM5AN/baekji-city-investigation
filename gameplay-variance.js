(() => {
  "use strict";

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const data = window.DAY1_DATA;
  if (!data?.riskProfiles || !Array.isArray(data.routes)) return;

  function hashNumber(text) {
    let hash = 2166136261;
    for (const ch of String(text)) {
      hash ^= ch.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0);
  }

  function safeParse(raw) {
    try {
      const value = JSON.parse(raw || "null");
      return value?.version === 3 ? value : null;
    } catch {
      return null;
    }
  }

  function addPersistentChoiceReveal(state) {
    if (!state?.sessions) return state;
    Object.values(state.sessions).forEach((session) => {
      if (session?.status !== "ACTIVE" || session.choiceReveal || session.movement) return;
      session.choiceReveal = {
        type: "persistent-menu",
        at: Number(session.startedAt || 1),
      };
    });
    return state;
  }

  const storageProto = typeof Storage !== "undefined" ? Storage.prototype : null;
  const previousGetItem = storageProto?.getItem;
  if (storageProto && previousGetItem) {
    storageProto.getItem = function patchedGameplayGetItem(key) {
      const raw = previousGetItem.call(this, key);
      if (this !== localStorage || key !== GLOBAL_KEY || !raw) return raw;
      const state = safeParse(raw);
      if (!state) return raw;
      return JSON.stringify(addPersistentChoiceReveal(state));
    };
  }

  function activeMovementForProfile(profile) {
    const state = safeParse(previousGetItem?.call(localStorage, GLOBAL_KEY));
    if (!state) return null;
    return Object.values(state.sessions || {}).find((session) => {
      const movement = session?.movement;
      return session?.status === "ACTIVE"
        && movement?.routeId === profile.routeId
        && session.variant === profile.variant
        && Date.now() >= Number(movement.resolveAt || 0) - 120;
    }) || null;
  }

  function pastRouteNarration(text) {
    return String(text || "통로를 따라 이동한다.")
      .replace(/물리 경로를 따라/g, "통로를 따라")
      .replace(/이동한다\.$/, "이동했다.")
      .replace(/내려간다\.$/, "내려갔다.")
      .replace(/올라간다\.$/, "올라갔다.")
      .replace(/되돌아간다\.$/, "되돌아갔다.");
  }

  const originalProfiles = data.riskProfiles;
  data.riskProfiles = new Proxy(originalProfiles, {
    get(target, property, receiver) {
      const profile = Reflect.get(target, property, receiver);
      if (!profile || typeof profile !== "object" || !Array.isArray(profile.hazards) || !profile.hazards.length) return profile;
      const session = activeMovementForProfile(profile);
      if (!session) return profile;
      const movement = session.movement;
      const chance = Math.max(0, Math.min(100, Number(profile.chance ?? 100)));
      const roll = (hashNumber(`${session.id}:${movement.token}:${profile.id}`) % 100) + 1;
      if (roll <= chance) return profile;

      const route = data.routes.find((candidate) => candidate.id === profile.routeId);
      if (route) {
        const originalNarration = route.narration;
        route.narration = `${pastRouteNarration(originalNarration)} 불안정한 징후가 바로 곁을 스쳤지만, 운이 따라 위험 구간을 무사히 통과했다.`;
        queueMicrotask(() => { route.narration = originalNarration; });
      }
      return { ...profile, hazards: [], hazardCount: 0, skippedByChance: true, roll };
    },
  });

  const autoCollapsedSessions = new Set();
  const observer = new MutationObserver(() => {
    const investigation = document.querySelector(".retro-investigation");
    const sessionId = investigation?.dataset.sessionId;
    if (!sessionId || autoCollapsedSessions.has(sessionId)) return;
    const state = safeParse(previousGetItem?.call(localStorage, GLOBAL_KEY));
    const reveal = state?.sessions?.[sessionId]?.choiceReveal;
    if (reveal?.type !== "persistent-menu") return;
    const closeButton = document.querySelector("[data-close-choice-panel]");
    if (!closeButton) return;
    autoCollapsedSessions.add(sessionId);
    closeButton.click();
  });
  observer.observe(document.getElementById("app") || document.body, { childList: true, subtree: true });

  window.__BAEKJI_GAMEPLAY_VARIANCE_TEST__ = Object.freeze({
    hashNumber,
    pastRouteNarration,
    addPersistentChoiceReveal,
  });
})();