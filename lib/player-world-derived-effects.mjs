import DAY1_DATA from "../data/day1.json" with { type: "json" };

const clone = (value) => structuredClone(value);
const scope = (session) => session?.activeEncounter
  ? `route:${session.activeEncounter.fromNode}:${session.activeEncounter.targetNode}`
  : session?.movement ? `route:${session.movement.fromNode}:${session.movement.targetNode}` : `node:${session?.currentNode || ""}`;
const nameFor = (state, id) => String(state?.characters?.[id]?.name || ({ test_a: "테스트 캐릭터 A", test_b: "테스트 캐릭터 B", test_c: "테스트 캐릭터 C" })[id] || "다른 조사자");
const clean = (value) => String(value || "").trim().replace(/^\/+\s*/, "").replace(/\s+/g, " ");
const idOf = (prefix, idFactory, fallback) => idFactory ? idFactory(prefix) : fallback;
function actionText(state, actorId, raw) { return `${nameFor(state, actorId)}가 ${clean(raw)} 행동을 하는 모습이 보인다.`; }
function soundProfile(raw) {
  const value = clean(raw);
  if (/(폭발|폭파|폭탄|터뜨|붕괴|총성|발포)/.test(value)) return { level: "EXTREME", kind: "BLAST" };
  if (/(던지|떨어뜨|깨뜨|부수|내려치|걷어차|충돌|쾅|경보|사이렌|비상벨|소리치|외치|고함|비명)/.test(value)) return { level: "LOUD", kind: "IMPACT" };
  return { level: "LOCAL", kind: "ORDINARY" };
}
function graphDistance(from, to, max = 2) {
  if (!from || !to) return Infinity;
  if (from === to) return 0;
  const graph = new Map();
  for (const route of DAY1_DATA.routes || []) {
    if (!graph.has(route.from)) graph.set(route.from, new Set());
    if (!graph.has(route.to)) graph.set(route.to, new Set());
    graph.get(route.from).add(route.to); graph.get(route.to).add(route.from);
  }
  const queue = [[from, 0]], seen = new Set([from]);
  while (queue.length) { const [node, distance] = queue.shift(); if (distance >= max) continue; for (const next of graph.get(node) || []) { if (next === to) return distance + 1; if (!seen.has(next)) { seen.add(next); queue.push([next, distance + 1]); } } }
  return Infinity;
}
function append(session, entry) { (session.logs ||= []).push(entry); }

/** Applies deterministic effects in a clone of the canonical snapshot. */
export function derivePlayerWorldEffects({ state, effect, context = {}, nowMs, idFactory }) {
  if (!state || !Number.isFinite(nowMs)) return { applied: false, state };
  const next = clone(state);
  const sessions = Object.values(next.sessions || {});
  const source = next.sessions?.[context.sessionId];

  if (effect === "ACTION_FANOUT") {
    const action = source?.logs?.find((entry) => entry?.id === context.actionLogId);
    if (!source || !action || action.type !== "action-input" || !action.actorId) return { applied: false, state };
    const sourceScope = scope(source);
    const eventId = action.eventId || `world_event_${action.id}`;
    action.eventId = eventId;
    for (const witness of sessions.filter((entry) => entry.id !== source.id && entry.status === "ACTIVE" && entry.variant === source.variant && scope(entry) === sourceScope)) {
      const id = `field_action_${action.id}_${witness.id}`;
      if (witness.logs?.some((entry) => entry?.id === id || entry?.sourceActionLogId === action.id)) continue;
      append(witness, { id, eventId, type: "field-action", text: actionText(next, action.actorId, action.text), actorId: null, at: Number(action.at) || nowMs, scopeKey: sourceScope, observedActorId: action.actorId, observedSessionId: source.id, sourceActionLogId: action.id, observationAiPending: true, observationAiFinal: false, observationSource: "fallback", observationTextVersion: 2 });
    }
    action.fieldObservationBroadcasted = true;
    return { applied: true, state: next };
  }

  if (effect === "SOUND_FANOUT") {
    const action = source?.logs?.find((entry) => entry?.id === context.actionLogId);
    if (!source || !action || action.type !== "action-input" || !action.actorId) return { applied: false, state };
    const profile = soundProfile(action.text); action.soundEventBroadcasted = true; action.soundLevel = profile.level;
    if (profile.level === "LOCAL") return { applied: true, state: next };
    const sourceNode = source.movement?.targetNode || source.activeEncounter?.targetNode || source.currentNode;
    const sourcePlace = DAY1_DATA.places?.[sourceNode] || {};
    const eventId = `sound_event_${action.id}`;
    next.soundEvents ||= [];
    if (!next.soundEvents.some((entry) => entry?.id === eventId)) next.soundEvents.push({ id: eventId, type: "SOUND", level: profile.level, kind: profile.kind, actorId: action.actorId, sourceSessionId: source.id, sourceActionLogId: action.id, sourceNode, sourceFloorId: sourcePlace.floorId || "", at: Number(action.at) || nowMs, mobReactionEligible: true, consumerTypes: ["PLAYER", "MOB_FUTURE"] });
    action.soundEventId = eventId;
    for (const witness of sessions) {
      if (witness.id === source.id || witness.status !== "ACTIVE" || witness.variant !== source.variant || scope(witness) === scope(source)) continue;
      const node = witness.movement?.targetNode || witness.activeEncounter?.targetNode || witness.currentNode;
      const place = DAY1_DATA.places?.[node] || {};
      const distance = graphDistance(sourceNode, node, profile.level === "EXTREME" ? 2 : 1);
      const reachable = sourcePlace.floorId === place.floorId || (profile.level === "EXTREME" ? distance <= 2 : distance === 1);
      if (!reachable) continue;
      const id = `field_sound_${action.id}_${witness.id}`;
      if (witness.logs?.some((entry) => entry?.id === id || (entry?.type === "field-sound" && entry?.sourceActionLogId === action.id))) continue;
      append(witness, { id, type: "field-sound", text: `${sourcePlace.floor || "인근 구역"}의 ${sourcePlace.name || "인근 장소"} 방향에서 큰 소리가 들린다.`, actorId: null, at: Number(action.at) || nowMs, sourceActionLogId: action.id, soundEventId: eventId, soundLevel: profile.level, soundKind: profile.kind, soundOriginNode: sourceNode, soundOriginFloorId: sourcePlace.floorId || "", heardGraphDistance: Number.isFinite(distance) ? distance : null, heardOnSameFloor: sourcePlace.floorId === place.floorId, observationMode: "AUDITORY_ONLY", mobReactionEligible: true, soundEventVersion: 1 });
    }
    if (next.soundEvents.length > 200) next.soundEvents = next.soundEvents.slice(-200);
    return { applied: true, state: next };
  }

  if (effect === "PRESENCE") {
    if (!source || !context.event || !context.token) return { applied: false, state };
    const event = context.event;
    const targetScope = event === "DEPARTURE" ? `node:${context.fromNode}` : event === "ROUTE" ? `route:${context.fromNode}:${context.targetNode}` : `node:${context.targetNode}`;
    for (const witness of sessions.filter((entry) => entry.id !== source.id && entry.status === "ACTIVE" && entry.variant === source.variant && scope(entry) === targetScope)) {
      const id = `movement:${context.token}:${witness.id}:${event.toLowerCase()}-presence`;
      if (witness.logs?.some((entry) => entry?.id === id)) continue;
      append(witness, { id, type: "presence", text: event === "ARRIVAL" ? "다른 조사조가 현장에 도착했다." : "다른 조사조의 인기척이 느껴진다.", actorId: null, at: nowMs, movementToken: context.token, movementEffect: `${event.toLowerCase()}-presence` });
    }
    return { applied: true, state: next };
  }

  if (effect === "FINALIZE_OBSERVATION") {
    const sourceActionId = String(context.sourceActionLogId || "");
    const sourceAction = sessions.flatMap((session) => session.logs || []).find((entry) => entry?.id === sourceActionId && entry.type === "action-input");
    if (!sourceAction) return { applied: false, state };
    const final = String(context.observation || "").trim();
    const status = context.status === "final" && final ? "final" : "fallback";
    for (const session of sessions) for (const entry of session.logs || []) {
      if (entry?.type !== "field-action" || entry.sourceActionLogId !== sourceActionId) continue;
      if (status === "final") entry.text = final;
      entry.observedActorId = sourceAction.actorId || entry.observedActorId || null;
      entry.observationAiPending = false; entry.observationAiFinal = status === "final"; entry.observationSource = status === "final" ? "ai" : "fallback"; entry.observationTextVersion = status === "final" ? 3 : 2;
    }
    sourceAction.fieldObservationAiStatus = status; sourceAction.fieldObservationAiCompletedAt = nowMs;
    if (status === "final") sourceAction.fieldObservationAiText = final;
    return { applied: true, state: next };
  }

  if (effect === "CHARACTER_INTERACTION_RESULT") {
    if (!source || !context.eventId || !context.narration) return { applied: false, state };
    const recipientIds = context.visibility === "TARGET_ONLY" ? [source.id, context.targetSessionId] : sessions.filter((entry) => entry.status === "ACTIVE" && entry.variant === source.variant && scope(entry) === scope(source)).map((entry) => entry.id);
    for (const sessionId of new Set(recipientIds.filter(Boolean))) {
      const recipient = next.sessions?.[sessionId]; if (!recipient || recipient.logs?.some((entry) => entry?.interactionEventId === context.eventId && entry.kind === "CHARACTER_INTERACTION_RESULT")) continue;
      append(recipient, { id: idOf("interaction", idFactory, `interaction_${context.eventId}_${sessionId}`), type: context.outcome === "RESISTED" ? "fail" : context.outcome === "NEUTRAL" ? "scene" : "success", text: String(context.narration), actorId: null, at: nowMs, kind: "CHARACTER_INTERACTION_RESULT", interactionEventId: context.eventId, interactionActorId: context.actorId || null, targetId: context.targetId || null, sourceSessionId: source.id, targetSessionId: context.targetSessionId || null, outcome: context.outcome || "NEUTRAL", targetEffect: context.targetEffect || "NONE", scopeKey: scope(source), aiNarrationFinal: true, characterInteraction: true, systemNarration: true });
    }
    return { applied: true, state: next };
  }
  return { applied: false, state };
}
