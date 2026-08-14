(() => {
  "use strict";

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const ENTRY_NODE = "E_ENTRY";
  const POLL_MS = 280;
  const GUEST_POLL_MS = 1000;
  const data = window.DAY1_DATA || { places: {} };
  let writing = false;
  let timer = 0;

  function currentUserId() {
    try { return String(sessionStorage.getItem(USER_KEY) || ""); }
    catch { return ""; }
  }

  function readState() {
    try {
      const state = JSON.parse(localStorage.getItem(GLOBAL_KEY) || "null");
      return state?.version === 3 ? state : null;
    } catch {
      return null;
    }
  }

  function activeSession(session) {
    return session?.status === "ACTIVE";
  }

  function scopeKey(session) {
    if (!session) return "";
    if (session.movement) return `route:${session.movement.fromNode || session.currentNode}:${session.movement.targetNode || ""}`;
    if (session.activeEncounter) return `route:${session.activeEncounter.fromNode || session.currentNode}:${session.activeEncounter.targetNode || ""}`;
    if (session.currentDetailId) return `detail:${session.currentNode}:${session.currentDetailId}`;
    return `node:${session.currentNode || ""}`;
  }

  function entrySessions(state) {
    return Object.values(state?.sessions || {}).filter((session) => activeSession(session) && scopeKey(session) === `node:${ENTRY_NODE}`);
  }

  function pairKey(a, b) {
    return [String(a?.id || ""), String(b?.id || "")].sort().join("::");
  }

  function partyName(state, session) {
    const party = state?.parties?.[session?.partyId];
    return String(party?.name || "다른 조사조");
  }

  function nodeName(nodeId) {
    if (nodeId === ENTRY_NODE) return "해오름역 구역 입구";
    return data.places?.[nodeId]?.name || String(nodeId || "다음 구역");
  }

  function appendPresence(session, eventId, at, text, extra = {}) {
    session.logs ||= [];
    if (session.logs.some((entry) => entry?.id === eventId)) return false;
    session.logs.push({ id: eventId, type: "presence", at, actorId: null, text, entryPresenceFix: true, ...extra });
    return true;
  }

  function hasRecentMeetingLog(session, at = Date.now()) {
    return (session?.logs || []).slice(-16).some((entry) => {
      const text = String(entry?.text || "");
      return Math.abs(Number(entry?.at || 0) - at) <= 4000 &&
        text.includes("해오름역 구역 입구") &&
        (text.includes("합류") || text.includes("마주쳤") || text.includes("마주쳐"));
    });
  }

  function hasRecentDepartureLog(session, at) {
    return (session?.logs || []).slice(-12).some((entry) =>
      entry?.type === "presence" &&
      Math.abs(Number(entry.at || 0) - at) <= 3500 &&
      String(entry.text || "").includes("해오름역 구역 입구") &&
      String(entry.text || "").includes("떠나")
    );
  }

  function hasDeparturePresenceToken(session, token) {
    return (session?.logs || []).some((entry) => String(entry?.movementToken || "") === String(token || "") && entry?.movementEffect === "departure-presence");
  }

  function currentPairs(state) {
    const sessions = entrySessions(state);
    const result = new Set();
    for (let i = 0; i < sessions.length; i += 1) {
      for (let j = i + 1; j < sessions.length; j += 1) {
        if (sessions[i].variant !== sessions[j].variant) continue;
        result.add(pairKey(sessions[i], sessions[j]));
      }
    }
    return result;
  }

  const initial = readState();
  let seenPairs = currentPairs(initial);
  let previousScopes = new Map(Object.values(initial?.sessions || {}).map((session) => [String(session.id), {
    scope: scopeKey(session),
    variant: session.variant,
    movementToken: String(session.movement?.token || ""),
  }]));

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
      window.dispatchEvent(event);
    }
  }

  function reconcile() {
    clearTimeout(timer);
    if (!currentUserId()) {
      timer = setTimeout(reconcile, GUEST_POLL_MS);
      return;
    }
    if (writing) {
      timer = setTimeout(reconcile, POLL_MS);
      return;
    }

    const oldRaw = localStorage.getItem(GLOBAL_KEY);
    const state = readState();
    if (!state) {
      timer = setTimeout(reconcile, POLL_MS);
      return;
    }

    let changed = false;
    const sessions = entrySessions(state);
    const byId = new Map(Object.values(state.sessions || {}).map((session) => [String(session.id), session]));

    for (let i = 0; i < sessions.length; i += 1) {
      for (let j = i + 1; j < sessions.length; j += 1) {
        const a = sessions[i];
        const b = sessions[j];
        if (a.variant !== b.variant) continue;
        const key = pairKey(a, b);
        if (seenPairs.has(key)) continue;
        const at = Date.now();
        // Normal movement arrivals already use app.js presence handling. The bridge is
        // only for the special BRIEFING -> ACTIVE entry activation path or a missed race.
        if (hasRecentMeetingLog(a, at) || hasRecentMeetingLog(b, at)) {
          seenPairs.add(key);
          continue;
        }
        changed = appendPresence(a, `entry_meet_${key}_${a.id}`, at, `${partyName(state, b)}와 해오름역 구역 입구에서 마주쳐 같은 현장에 합류했다.`) || changed;
        changed = appendPresence(b, `entry_meet_${key}_${b.id}`, at, `${partyName(state, a)}와 해오름역 구역 입구에서 마주쳐 같은 현장에 합류했다.`) || changed;
        seenPairs.add(key);
      }
    }

    byId.forEach((session, sessionId) => {
      const previous = previousScopes.get(sessionId);
      const current = scopeKey(session);
      if (!previous || previous.scope !== `node:${ENTRY_NODE}` || current === `node:${ENTRY_NODE}` || !activeSession(session)) return;
      const movement = session.movement;
      const transition = session.lastMovementTransition;
      const transitionMatchesDeparture = transition?.fromNode === ENTRY_NODE
        && (transition?.targetNode === session.currentNode || transition?.targetNode === session.activeEncounter?.targetNode);
      const departureAt = Number(movement?.startedAt || (transitionMatchesDeparture && transition?.completedAt) || Date.now());
      const token = String(movement?.token || (transitionMatchesDeparture && transition?.token) || `${sessionId}_${departureAt}`);
      sessions
        .filter((witness) => witness.id !== session.id && witness.variant === session.variant)
        .forEach((witness) => {
          if (hasDeparturePresenceToken(witness, token)) return;
          const targetNode = movement?.targetNode || (transitionMatchesDeparture && transition?.targetNode) || session.currentNode;
          changed = appendPresence(
            witness,
            `movement:${token}:${witness.id}:departure-presence`,
            departureAt,
            `${partyName(state, session)}가 해오름역 구역 입구를 떠나 ${nodeName(targetNode)} 방향으로 이동을 시작했다.`,
            { movementToken: token, movementEffect: "departure-presence" },
          ) || changed;
        });
    });

    const nextPairs = currentPairs(state);
    seenPairs = new Set([...seenPairs].filter((key) => nextPairs.has(key)));
    nextPairs.forEach((key) => seenPairs.add(key));
    previousScopes = new Map(Object.values(state.sessions || {}).map((session) => [String(session.id), {
      scope: scopeKey(session),
      variant: session.variant,
      movementToken: String(session.movement?.token || ""),
    }]));

    if (changed) {
      const newRaw = JSON.stringify(state);
      writing = true;
      try { localStorage.setItem(GLOBAL_KEY, newRaw); }
      finally { writing = false; }
      dispatchUpdate(oldRaw, newRaw);
    }

    timer = setTimeout(reconcile, POLL_MS);
  }

  window.__BAEKJI_ENTRY_PRESENCE_FIX_TEST__ = Object.freeze({
    currentUserId,
    scopeKey,
    pairKey,
    currentPairs,
    hasRecentMeetingLog,
    hasRecentDepartureLog,
    hasDeparturePresenceToken,
  });
  reconcile();
})();
