(() => {
  "use strict";

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const DATA = globalThis.DAY1_DATA || globalThis.window?.DAY1_DATA || {};
  const USER_LABELS = {
    test_a: "테스트 캐릭터 A",
    test_b: "테스트 캐릭터 B",
    test_c: "테스트 캐릭터 C",
  };

  function parseState(value) {
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      return parsed?.version === 3 ? parsed : null;
    } catch {
      return null;
    }
  }

  function cleanText(value) {
    return String(value || "").trim().replace(/^\/+\s*/, "").replace(/\s+/g, " ");
  }

  function extractQuote(value) {
    const text = cleanText(value);
    for (const pattern of [/“([^”]{1,240})”/, /"([^"]{1,240})"/, /‘([^’]{1,240})’/, /'([^']{1,240})'/]) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return "";
  }

  function spatialScopeKey(session) {
    if (!session) return "";
    if (session.movement) return `route:${session.movement.fromNode}:${session.movement.targetNode}`;
    if (session.activeEncounter) return `route:${session.activeEncounter.fromNode}:${session.activeEncounter.targetNode}`;
    if (session.currentDetailId) return `detail:${session.currentNode}:${session.currentDetailId}`;
    return `node:${session.currentNode}`;
  }

  function acousticNode(session) {
    return String(
      session?.movement?.targetNode ||
      session?.activeEncounter?.targetNode ||
      session?.currentNode ||
      session?.movement?.fromNode ||
      session?.activeEncounter?.fromNode ||
      ""
    );
  }

  function placeForNode(nodeId) {
    return DATA?.places?.[nodeId] || null;
  }

  function routeList() {
    if (Array.isArray(DATA?.routes)) return DATA.routes;
    return Object.values(DATA?.routes || {});
  }

  function firstRouteValue(route, keys) {
    for (const key of keys) {
      const value = route?.[key];
      if (typeof value === "string" && value) return value;
    }
    return "";
  }

  function routeEndpoints(route) {
    return [
      firstRouteValue(route, ["fromNode", "from", "sourceNode", "startNode", "originNode", "fromPlaceId"]),
      firstRouteValue(route, ["targetNode", "toNode", "to", "destinationNode", "endNode", "targetPlaceId"]),
    ];
  }

  function adjacencyGraph() {
    const graph = new Map();
    const link = (a, b) => {
      if (!a || !b) return;
      if (!graph.has(a)) graph.set(a, new Set());
      graph.get(a).add(b);
    };
    routeList().forEach((route) => {
      const [from, to] = routeEndpoints(route);
      link(from, to);
      link(to, from);
    });
    return graph;
  }

  function graphDistance(fromNode, toNode, maxDistance = 3) {
    if (!fromNode || !toNode) return Infinity;
    if (fromNode === toNode) return 0;
    const graph = adjacencyGraph();
    const queue = [[fromNode, 0]];
    const seen = new Set([fromNode]);
    while (queue.length) {
      const [node, distance] = queue.shift();
      if (distance >= maxDistance) continue;
      for (const next of graph.get(node) || []) {
        if (next === toNode) return distance + 1;
        if (seen.has(next)) continue;
        seen.add(next);
        queue.push([next, distance + 1]);
      }
    }
    return Infinity;
  }

  function classifySound(rawText) {
    const text = cleanText(rawText);
    if (/(폭발|폭파|폭탄|터뜨|터트리|붕괴|무너뜨|총성|발포)/.test(text)) {
      return { level: "EXTREME", kind: "BLAST", quote: extractQuote(text) };
    }
    if (/(물건|물체|의자|병|돌|상자|도구).*(던지|던져|내던|집어던|투척)|(?:던지|던져|내던|집어던|투척).*(물건|물체|의자|병|돌|상자|도구)|떨어뜨|깨뜨|부수|내려치|걷어차|충돌|쾅|문.*세게.*닫/.test(text)) {
      return { level: "LOUD", kind: "IMPACT", quote: "" };
    }
    if (/(호루라기|경보|사이렌|비상벨|종을\s*울)/.test(text)) {
      return { level: "LOUD", kind: "ALARM", quote: "" };
    }
    if (/(소리\s*(?:를\s*)?(?:크게\s*)?(?:지르|지른|질러)|크게\s*소리(?:를)?\s*(?:지르|지른|질러)|소리치|외치|고함|고성|큰\s*소리|목청|고래고래|비명|호통|함성|부르짖)/.test(text)) {
      return { level: "LOUD", kind: "SHOUT", quote: extractQuote(text) };
    }
    return { level: "LOCAL", kind: "ORDINARY", quote: "" };
  }

  function canReceiveSound(sourceSession, witnessSession, profile) {
    if (!sourceSession || !witnessSession || profile.level === "LOCAL") return null;
    if (sourceSession.id === witnessSession.id) return null;
    if (sourceSession.status !== "ACTIVE" || witnessSession.status !== "ACTIVE") return null;
    if (sourceSession.variant !== witnessSession.variant) return null;
    if (spatialScopeKey(sourceSession) === spatialScopeKey(witnessSession)) return null;

    const sourceNode = acousticNode(sourceSession);
    const witnessNode = acousticNode(witnessSession);
    if (!sourceNode || !witnessNode) return null;
    const sourcePlace = placeForNode(sourceNode);
    const witnessPlace = placeForNode(witnessNode);
    const sameFloor = Boolean(sourcePlace?.floorId && sourcePlace.floorId === witnessPlace?.floorId);
    const distance = graphDistance(sourceNode, witnessNode, profile.level === "EXTREME" ? 2 : 1);
    const adjacent = Number.isFinite(distance) && distance > 0;

    if (profile.level === "LOUD" && !(sameFloor || distance === 1)) return null;
    if (profile.level === "EXTREME" && !(sameFloor || (adjacent && distance <= 2))) return null;
    return { sourceNode, witnessNode, sourcePlace, witnessPlace, sameFloor, distance };
  }

  function soundObservationText(action, sourceSession, reach) {
    const profile = classifySound(action.text);
    const actorName = USER_LABELS[action.actorId] || "다른 조사자";
    const placeName = reach.sourcePlace?.name || "인근 장소";
    const floorName = reach.sourcePlace?.floor || "같은 구역";
    const origin = `${floorName}의 ${placeName} 방향`;
    const nearEnoughForWords = profile.kind === "SHOUT" && profile.quote && reach.distance === 1;

    if (profile.kind === "BLAST") return `${origin}에서 강한 폭음이 터지고, 잠시 뒤 바닥과 구조물을 타고 둔한 진동이 전해진다.`;
    if (profile.kind === "IMPACT") return `${origin}에서 무언가가 세게 날아가 부딪히는 듯한 큰 충돌음이 울린다.`;
    if (profile.kind === "ALARM") return `${origin}에서 날카로운 경보성 소리가 길게 울려 퍼진다.`;
    if (nearEnoughForWords) return `${origin}에서 ${actorName}의 목소리로 "${profile.quote}"라고 크게 외치는 소리가 들린다.`;
    return `${origin}에서 누군가 큰 소리로 외치는 목소리가 울려 퍼지지만, 정확한 내용까지는 알아듣기 어렵다.`;
  }

  function makeSoundEventId(actionId) {
    return `sound_event_${String(actionId || "unknown")}`;
  }

  function makeWitnessLogId(actionId, witnessSessionId) {
    return `field_sound_${String(actionId || "unknown")}_${String(witnessSessionId || "unknown")}`;
  }

  function enrichSoundEvents(nextState, previousState) {
    if (!nextState?.sessions) return nextState;
    if (!Array.isArray(nextState.soundEvents)) nextState.soundEvents = [];
    const sessions = Object.values(nextState.sessions);

    sessions.forEach((sourceSession) => {
      if (!Array.isArray(sourceSession.logs)) sourceSession.logs = [];
      const previousIds = new Set((previousState?.sessions?.[sourceSession.id]?.logs || []).map((entry) => entry?.id).filter(Boolean));
      sourceSession.logs.forEach((action) => {
        if (action?.type !== "action-input" || !action.actorId || action.soundEventBroadcasted) return;
        const isNewAction = Boolean(previousState && action.id && !previousIds.has(action.id));
        if (!isNewAction || sourceSession.status !== "ACTIVE") return;
        const profile = classifySound(action.text);
        action.soundEventBroadcasted = true;
        action.soundLevel = profile.level;
        if (profile.level === "LOCAL") return;

        const eventId = makeSoundEventId(action.id);
        if (!nextState.soundEvents.some((event) => event?.id === eventId)) {
          nextState.soundEvents.push({
            id: eventId,
            type: "SOUND",
            level: profile.level,
            kind: profile.kind,
            actorId: action.actorId,
            sourceSessionId: sourceSession.id,
            sourceActionLogId: action.id,
            sourceNode: acousticNode(sourceSession),
            sourceFloorId: placeForNode(acousticNode(sourceSession))?.floorId || "",
            at: Number(action.at) || Date.now(),
            mobReactionEligible: true,
            consumerTypes: ["PLAYER", "MOB_FUTURE"],
          });
        }
        action.soundEventId = eventId;

        sessions.forEach((witnessSession) => {
          const reach = canReceiveSound(sourceSession, witnessSession, profile);
          if (!reach) return;
          if (!Array.isArray(witnessSession.logs)) witnessSession.logs = [];
          const logId = makeWitnessLogId(action.id, witnessSession.id);
          if (witnessSession.logs.some((entry) => entry?.id === logId || (entry?.type === "field-sound" && entry?.sourceActionLogId === action.id))) return;
          witnessSession.logs.push({
            id: logId,
            type: "field-sound",
            text: soundObservationText(action, sourceSession, reach),
            actorId: null,
            at: Number(action.at) || Date.now(),
            sourceActionLogId: action.id,
            soundEventId: eventId,
            soundLevel: profile.level,
            soundKind: profile.kind,
            soundOriginNode: reach.sourceNode,
            soundOriginFloorId: reach.sourcePlace?.floorId || "",
            heardGraphDistance: Number.isFinite(reach.distance) ? reach.distance : null,
            heardOnSameFloor: reach.sameFloor,
            observationMode: "AUDITORY_ONLY",
            mobReactionEligible: true,
            soundEventVersion: 1,
          });
        });
      });
    });

    if (nextState.soundEvents.length > 200) nextState.soundEvents = nextState.soundEvents.slice(-200);
    return nextState;
  }

  const TEST_API = Object.freeze({
    cleanText,
    extractQuote,
    spatialScopeKey,
    acousticNode,
    routeEndpoints,
    graphDistance,
    classifySound,
    canReceiveSound,
    soundObservationText,
    enrichSoundEvents,
  });
  if (typeof window !== "undefined") window.__BAEKJI_SOUND_EVENT_TEST__ = TEST_API;
  if (typeof Storage === "undefined" || typeof localStorage === "undefined") return;

  const previousSetItem = Storage.prototype.setItem;
  const previousGetItem = Storage.prototype.getItem;

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    let nextValue = value;
    if (this === localStorage && key === GLOBAL_KEY) {
      const previousState = parseState(previousGetItem.call(this, key));
      const nextState = parseState(value);
      if (nextState) {
        enrichSoundEvents(nextState, previousState);
        nextValue = JSON.stringify(nextState);
      }
    }
    return previousSetItem.call(this, key, nextValue);
  };
})();