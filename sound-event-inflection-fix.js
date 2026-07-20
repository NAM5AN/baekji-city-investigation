(() => {
  "use strict";
  const KEY = "baekji_city_mvp_state_v3";
  const DATA = globalThis.DAY1_DATA || window.DAY1_DATA || {};
  const USERS = { test_a: "테스트 캐릭터 A", test_b: "테스트 캐릭터 B", test_c: "테스트 캐릭터 C" };
  const clean = (value) => String(value || "").trim().replace(/^\/+\s*/, "").replace(/\s+/g, " ");
  const quote = (value) => {
    const text = clean(value);
    for (const pattern of [/“([^”]{1,240})”/, /"([^"]{1,240})"/, /‘([^’]{1,240})’/, /'([^']{1,240})'/]) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return "";
  };
  function classify(value) {
    const text = clean(value);
    if (/(소리(?:친|쳐|쳤)|외(?:친|쳐|쳤))/.test(text)) return { level: "LOUD", kind: "SHOUT", quote: quote(text) };
    return null;
  }
  const scope = (session) => session?.currentDetailId ? `detail:${session.currentNode}:${session.currentDetailId}` : `node:${session?.currentNode || ""}`;
  const routes = () => Array.isArray(DATA.routes) ? DATA.routes : Object.values(DATA.routes || {});
  function linked(left, right) {
    if (!left || !right) return false;
    return routes().some((route) => {
      const from = route.fromNode || route.from;
      const to = route.targetNode || route.toNode || route.to;
      return (from === left && to === right) || (from === right && to === left);
    });
  }
  function enrich(state, previous) {
    if (!state?.sessions) return state;
    if (!Array.isArray(state.soundEvents)) state.soundEvents = [];
    const sessions = Object.values(state.sessions);
    sessions.forEach((source) => {
      const oldIds = new Set((previous?.sessions?.[source.id]?.logs || []).map((entry) => entry?.id));
      (source.logs || []).forEach((action) => {
        if (action?.type !== "action-input" || !action.actorId || oldIds.has(action.id)) return;
        const profile = classify(action.text);
        if (!profile || action.soundEventId) return;
        const eventId = `sound_event_${action.id}`;
        action.soundEventBroadcasted = true;
        action.soundLevel = "LOUD";
        action.soundEventId = eventId;
        if (!state.soundEvents.some((event) => event?.id === eventId)) state.soundEvents.push({
          id: eventId, type: "SOUND", level: "LOUD", kind: "SHOUT", actorId: action.actorId,
          sourceSessionId: source.id, sourceActionLogId: action.id, sourceNode: source.currentNode,
          sourceFloorId: DATA.places?.[source.currentNode]?.floorId || "", at: Number(action.at) || Date.now(),
          mobReactionEligible: true, consumerTypes: ["PLAYER", "MOB_FUTURE"],
        });
        sessions.forEach((witness) => {
          if (witness.id === source.id || witness.status !== "ACTIVE" || source.status !== "ACTIVE" || witness.variant !== source.variant || scope(witness) === scope(source)) return;
          const sourcePlace = DATA.places?.[source.currentNode];
          const witnessPlace = DATA.places?.[witness.currentNode];
          const sameFloor = sourcePlace?.floorId && sourcePlace.floorId === witnessPlace?.floorId;
          if (!sameFloor && !linked(source.currentNode, witness.currentNode)) return;
          const id = `field_sound_${action.id}_${witness.id}`;
          if ((witness.logs || []).some((entry) => entry?.id === id || entry?.sourceActionLogId === action.id && entry?.type === "field-sound")) return;
          const origin = `${sourcePlace?.floor || "같은 구역"}의 ${sourcePlace?.name || "인근 장소"} 방향`;
          const words = linked(source.currentNode, witness.currentNode) && profile.quote
            ? `${USERS[action.actorId] || "다른 조사자"}의 목소리로 "${profile.quote}"라고 크게 외치는 소리가 들린다.`
            : "누군가 큰 소리로 외치는 목소리가 울려 퍼지지만, 정확한 내용까지는 알아듣기 어렵다.";
          (witness.logs || (witness.logs = [])).push({ id, type: "field-sound", text: `${origin}에서 ${words}`, actorId: null,
            at: Number(action.at) || Date.now(), sourceActionLogId: action.id, soundEventId: eventId,
            soundLevel: "LOUD", soundKind: "SHOUT", soundOriginNode: source.currentNode,
            soundOriginFloorId: sourcePlace?.floorId || "", heardOnSameFloor: Boolean(sameFloor),
            observationMode: "AUDITORY_ONLY", mobReactionEligible: true, soundEventVersion: 2 });
        });
      });
    });
    return state;
  }
  window.__BAEKJI_SOUND_INFLECTION_TEST__ = Object.freeze({ classify, enrich });
  if (typeof Storage === "undefined" || typeof localStorage === "undefined") return;
  const previousSet = Storage.prototype.setItem;
  const previousGet = Storage.prototype.getItem;
  Storage.prototype.setItem = function patchedSetItem(key, value) {
    let next = value;
    if (this === localStorage && key === KEY) {
      let before = null;
      let state = null;
      try { before = JSON.parse(previousGet.call(this, key) || "null"); state = JSON.parse(String(value)); } catch { state = null; }
      if (state?.version === 3) next = JSON.stringify(enrich(state, before));
    }
    return previousSet.call(this, key, next);
  };
})();
