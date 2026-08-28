import DAY1_DATA from "../data/day1.json" with { type: "json" };

// Pure authoritative transition kernel.  It deliberately owns no IO, retries,
// browser timeouts, or persistence: callers supply the snapshot and clock.
const MOVE_DELAY_MS = 1800;

function clone(value) { return structuredClone(value); }
function text(value, max = 1200) { return String(value || "").trim().slice(0, max); }
function clamp(value, low, high) { return Math.min(high, Math.max(low, value)); }
function hashNumber(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return Math.abs(hash >>> 0);
}
function contaminationStage(value) {
  const amount = Number(value) || 0;
  if (amount >= 100) return "완전 용해";
  if (amount >= 80) return "붕락";
  if (amount >= 60) return "용해";
  if (amount >= 40) return "유화";
  if (amount >= 20) return "번짐";
  return "안정";
}
function delta(ruleId, seed) {
  const rule = DAY1_DATA.contaminationRules?.[ruleId] || DAY1_DATA.contaminationRules.EXP_CONTACT_NONE;
  const min = Number(rule?.min) || 0;
  const max = Math.max(min, Number(rule?.max) || 0);
  return min + (hashNumber(seed) % (max - min + 1));
}
function log(session, idFactory, nowMs, type, value, actorId = null, meta = {}) {
  session.logs ||= [];
  session.logs.push({ id: idFactory("log"), type, text: value, actorId, at: nowMs, ...meta });
}
function activeMember(state, actorId, sessionId) {
  const session = state.sessions?.[sessionId];
  return session?.status === "ACTIVE" && session.memberIds?.includes(actorId) ? session : null;
}
function sameScope(left, right) {
  if (!left || !right || left.variant !== right.variant) return false;
  const leftScope = left.activeEncounter ? `route:${left.activeEncounter.fromNode}:${left.activeEncounter.targetNode}` : `node:${left.currentNode}`;
  const rightScope = right.activeEncounter ? `route:${right.activeEncounter.fromNode}:${right.activeEncounter.targetNode}` : `node:${right.currentNode}`;
  return leftScope === rightScope;
}
function reject(state, reason) { return { status: "REJECTED", reason, state }; }
function applied(state) { return { status: "APPLIED", state }; }
function movementMeta(token, sessionId, effect) { return { movementToken: token, movementEffect: effect, id: `movement:${token}:${sessionId}:${effect}` }; }
function addAmbient(state, session, targetNode, ruleId) {
  for (const memberId of session.memberIds || []) {
    const character = state.characters?.[memberId];
    if (!character) continue;
    const change = delta(ruleId || "EXP_AMBIENT_A", `${session.id}:${targetNode}:${memberId}`);
    character.contamination = clamp((Number(character.contamination) || 0) + change, 0, 100);
    character.symptom = contaminationStage(character.contamination);
  }
}
function arrive(state, session, targetNode, ruleId, token, idFactory, nowMs) {
  session.currentNode = targetNode;
  session.currentDetailId = null;
  session.choiceReveal = null;
  addAmbient(state, session, targetNode, ruleId);
  log(session, () => `movement:${token}:${session.id}:arrival`, nowMs, "scene", "이동을 마치고 다음 구역에 도착했다.", null, movementMeta(token, session.id, "arrival"));
  for (const witness of Object.values(state.sessions || {})) {
    if (witness.id === session.id || witness.status !== "ACTIVE" || !sameScope(session, witness)) continue;
    log(witness, () => `movement:${token}:${witness.id}:arrival-presence`, nowMs, "presence", "다른 조사조가 현장에 도착했다.", null, movementMeta(token, witness.id, "arrival-presence"));
  }
}

/**
 * @param {{state: object, actorId: string, command: string, payload: object, nowMs: number, idFactory: (prefix: string) => string}} input
 * @returns {{status: "APPLIED"|"REJECTED", reason?: string, state: object}}
 */
export function reducePlayerWorldInvestigationCommand({ state, actorId, command, payload = {}, nowMs, idFactory }) {
  if (!state || !actorId || !command || typeof idFactory !== "function" || !Number.isFinite(nowMs)) return reject(state, "INVALID_INPUT");
  const next = clone(state);
  const sessionId = text(payload.sessionId, 120);

  if (command === "END_SESSION_V1") {
    const session = activeMember(next, actorId, sessionId);
    if (!session || session.activeEncounter) return reject(state, "OUT_OF_SCOPE");
    session.status = "COMPLETED";
    session.endedAt = nowMs;
    log(session, idFactory, nowMs, "scene", "조사를 마치고 현재까지 확인한 기록을 확정했다.");
    return applied(next);
  }

  if (command === "BEGIN_MOVEMENT_V1") {
    const session = activeMember(next, actorId, sessionId);
    const route = DAY1_DATA.routes?.find((entry) => entry.id === text(payload.routeId, 120));
    if (!session || !route || session.movement || session.activeEncounter || route.from !== session.currentNode) return reject(state, "OUT_OF_SCOPE");
    const token = idFactory("move");
    const actionText = text(payload.actionText, 700);
    if (actionText) log(session, idFactory, nowMs, "action-input", actionText, actorId, { kind: "MOVE" });
    session.choiceReveal = null;
    session.movement = { token, routeId: route.id, fromNode: route.from, targetNode: route.to, actorId, startedAt: nowMs, resolveAt: nowMs + MOVE_DELAY_MS, actionText, itemUse: null };
    for (const witness of Object.values(next.sessions || {})) {
      if (witness.id === session.id || witness.status !== "ACTIVE" || witness.variant !== session.variant || witness.currentNode !== route.from || witness.movement || witness.activeEncounter) continue;
      log(witness, () => `movement:${token}:${witness.id}:departure-presence`, nowMs, "presence", "다른 조사조가 이동을 시작했다.", null, movementMeta(token, witness.id, "departure-presence"));
    }
    return applied(next);
  }

  if (command === "SETTLE_MOVEMENT_V1") {
    const session = activeMember(next, actorId, sessionId);
    const token = text(payload.movementToken, 160);
    const movement = session?.movement;
    if (!session || !movement || movement.token !== token) return reject(state, "OUT_OF_SCOPE");
    if (nowMs < Number(movement.resolveAt)) return reject(state, "NOT_DUE");
    const route = DAY1_DATA.routes?.find((entry) => entry.id === movement.routeId);
    const profile = route && DAY1_DATA.riskProfiles?.[`${route.id}:${session.variant}`];
    if (!route) return reject(state, "INVALID_ROUTE");
    session.movement = null;
    const hazards = profile?.hazards || [];
    if (hazards.length) {
      session.activeEncounter = { routeId: route.id, fromNode: route.from, targetNode: route.to, overview: profile.overview || "", ambientRuleId: profile.ambientRuleId, hazards: [...hazards], currentIndex: 0, resolutions: [] };
      session.lastMovementTransition = { token, kind: "ENCOUNTER", routeId: route.id, fromNode: route.from, targetNode: route.to, completedAt: nowMs };
      log(session, () => `movement:${token}:${session.id}:encounter`, nowMs, "risk", profile.overview || "이동 경로에 위험이 나타났다.", null, movementMeta(token, session.id, "encounter"));
    } else {
      const before = Object.fromEntries((session.memberIds || []).map((id) => [id, Number(next.characters?.[id]?.contamination || 0)]));
      arrive(next, session, route.to, profile?.ambientRuleId, token, idFactory, nowMs);
      const changes = Object.fromEntries((session.memberIds || []).map((id) => [id, (Number(next.characters?.[id]?.contamination || 0) - before[id])]).filter(([, value]) => value > 0));
      session.lastMovementTransition = { token, kind: "ARRIVED", routeId: route.id, fromNode: route.from, targetNode: route.to, completedAt: nowMs, contaminationBaselines: before, contaminationDeltas: changes };
    }
    return applied(next);
  }

  if (command === "RESOLVE_HAZARD_V1") {
    const session = activeMember(next, actorId, sessionId);
    const encounter = session?.activeEncounter;
    const token = text(payload.movementToken, 160);
    const hazardId = encounter?.hazards?.[encounter.currentIndex];
    if (!session || !encounter || !hazardId || token !== session.lastMovementTransition?.token || Number(payload.hazardIndex) !== encounter.currentIndex || text(payload.hazardId, 120) !== hazardId) return reject(state, "OUT_OF_SCOPE");
    const action = text(payload.actionText);
    if (!action) return reject(state, "INVALID_ACTION");
    log(session, idFactory, nowMs, "action-input", action, actorId, { kind: "HAZARD_RESPONSE" });
    const hazard = DAY1_DATA.hazardTemplates?.[hazardId] || {};
    const lower = action.toLowerCase();
    const selectedItemId = text(payload.itemId, 160);
    const character = next.characters?.[actorId];
    if (!character) return reject(state, "OUT_OF_SCOPE");
    const hasItem = Boolean(selectedItemId && character.inventory?.[selectedItemId]?.quantity > 0);
    const risky = /(뛰|달려|맨손|무시|강하게 밀|밟고|잡고 버틴|그냥 간)/.test(lower);
    const safe = (hazard.safeKeywords || []).some((keyword) => lower.includes(String(keyword).toLowerCase()));
    const outcome = risky ? "FAIL" : safe || hasItem ? "SUCCESS" : "PARTIAL";
    const ruleId = outcome === "FAIL" ? (hazard.failRule || "EXP_CONTACT_MEDIUM") : outcome === "PARTIAL" ? "EXP_CONTACT_LOW" : hasItem ? "EXP_ITEM_ONLY" : "EXP_CONTACT_NONE";
    const change = delta(ruleId, `${sessionId}:${hazardId}:${action}:${encounter.currentIndex}`);
    character.contamination = clamp((Number(character.contamination) || 0) + change, 0, 100);
    character.symptom = contaminationStage(character.contamination);
    if (hasItem && ruleId === "EXP_ITEM_ONLY") character.inventory[selectedItemId].state = "CONTAMINATED";
    encounter.resolutions ||= [];
    encounter.resolutions.push({ hazardId, actorId, text: action, selectedItemId: selectedItemId || null, outcome, ruleId, delta: change });
    const index = encounter.currentIndex++;
    if (encounter.currentIndex >= encounter.hazards.length) {
      arrive(next, session, encounter.targetNode, encounter.ambientRuleId, token, idFactory, nowMs);
      session.activeEncounter = null;
      session.lastMovementTransition = { ...session.lastMovementTransition, kind: "ARRIVED", completedAt: nowMs };
    }
    log(session, () => `movement:${token}:${session.id}:hazard:${index}:${hazardId}`, nowMs, outcome === "FAIL" ? "fail" : "success", "위험 대응 결과를 기록했다.", null, movementMeta(token, session.id, `hazard:${index}:${hazardId}`));
    return applied(next);
  }

  if (command === "INVESTIGATION_ACTION_V1") {
    const session = activeMember(next, actorId, sessionId);
    const kind = text(payload.kind, 80);
    const encounterKinds = new Set(["ITEM_UNAVAILABLE", "HAZARD_HINT", "LISTEN", "CHECK_SELF", "WAIT", "OBSERVE_HAZARD", "IRRELEVANT_HAZARD_ACTION"]);
    if (!session || session.movement || (session.activeEncounter && !encounterKinds.has(kind))) return reject(state, "OUT_OF_SCOPE");
    if (!session.activeEncounter && ["HAZARD_HINT", "OBSERVE_HAZARD", "IRRELEVANT_HAZARD_ACTION"].includes(kind)) return reject(state, "OUT_OF_SCOPE");
    const targetId = text(payload.targetId, 160);
    if (kind === "DETAIL") {
      if (!DAY1_DATA.places?.[session.currentNode]?.details?.some((detail) => detail.id === targetId)) return reject(state, "INVALID_TARGET");
      session.currentDetailId = targetId;
      log(session, idFactory, nowMs, "chat-divider", "조사 지점을 확인한다.");
    } else if (kind === "OBSERVE") {
      log(session, idFactory, nowMs, "scene", "주변을 관찰했다.", actorId);
    } else if (kind === "INSPECT") {
      const object = Object.values(DAY1_DATA.objectsByDetail || {}).flat().find((entry) => entry.id === targetId);
      if (!object || object.detailId !== session.currentDetailId) return reject(state, "INVALID_TARGET");
      session.inspectedObjectIds ||= [];
      if (!session.inspectedObjectIds.includes(targetId)) session.inspectedObjectIds.push(targetId);
      log(session, idFactory, nowMs, "scene", "대상을 조사했다.", actorId);
    } else if (kind === "TAKE") {
      const objectId = text(payload.objectId, 160);
      const itemId = text(payload.itemId, 160);
      if (!session.inspectedObjectIds?.includes(objectId)) return reject(state, "INVALID_TARGET");
      const mapping = (DAY1_DATA.objectItems?.[objectId] || []).find((entry) => entry.itemId === itemId);
      if (!mapping) return reject(state, "INVALID_TARGET");
      const claims = (next.itemClaimsByVariant ||= {})[session.variant] ||= {};
      const key = `${objectId}:${itemId}`;
      if (claims[key]) return reject(state, "ALREADY_CLAIMED");
      claims[key] = { objectId, itemId, characterId: actorId, sessionId, claimedAt: nowMs };
      session.takenItemKeys ||= [];
      if (!session.takenItemKeys.includes(key)) session.takenItemKeys.push(key);
      const actor = next.characters?.[actorId];
      if (!actor) return reject(state, "OUT_OF_SCOPE");
      const inventory = actor.inventory ||= {};
      inventory[itemId] ||= { itemId, name: DAY1_DATA.itemCatalog?.[itemId]?.name || mapping.name, category: DAY1_DATA.itemCatalog?.[itemId]?.category || "일반", quantity: 0, state: "CLEAN" };
      inventory[itemId].quantity += Number(mapping.default || 1);
      log(session, idFactory, nowMs, "item", "현장 물품을 획득했다.", actorId);
    } else if (["ACTION_INPUT", "ITEM_UNAVAILABLE", "MAP", "HAZARD_HINT", "LISTEN", "CHECK_SELF", "WAIT", "OBSERVE_HAZARD", "IRRELEVANT_HAZARD_ACTION", "OBSERVE_DETAIL", "OBSERVE_SCENE", "MUNDANE_INSPECTION", "NAVIGATION_HINT", "ALREADY_AT_DESTINATION", "ROUTE_GUIDANCE", "AMBIGUOUS_MOVE", "OTHER"].includes(kind)) {
      const actionText = text(payload.text, 700);
      if (kind !== "ACTION_INPUT" && actionText) log(session, idFactory, nowMs, "action-input", actionText, actorId, { kind });
      if (kind === "HAZARD_HINT" || kind === "NAVIGATION_HINT" || kind === "AMBIGUOUS_MOVE") session.choiceReveal = { type: session.activeEncounter ? "hazard" : "context", at: nowMs, actorId };
      if (["ACTION_INPUT", "ALREADY_AT_DESTINATION", "ROUTE_GUIDANCE"].includes(kind)) session.choiceReveal = null;
      const resultText = ({
        MAP: "현재 위치와 연결 경로를 확인했다.",
        ITEM_UNAVAILABLE: "선택한 물품은 지금 사용할 수 없다.",
        HAZARD_HINT: "현재 위험을 넘기기 위한 선택지를 다시 확인했다.",
        LISTEN: "주변의 소리와 인기척에 집중했다.",
        CHECK_SELF: "현재 오염도와 몸 상태를 확인했다.",
        WAIT: "상황의 변화를 살피며 잠시 기다렸다.",
        OBSERVE_HAZARD: "눈앞의 위험을 자세히 관찰했다.",
        IRRELEVANT_HAZARD_ACTION: "그 행동만으로는 현재 위험을 해결할 수 없다.",
        OBSERVE_DETAIL: "선택한 지점을 자세히 관찰했다.",
        OBSERVE_SCENE: "주변 상황을 다시 살폈다.",
        MUNDANE_INSPECTION: "대상을 살폈지만 특별한 단서는 찾지 못했다.",
        NAVIGATION_HINT: "현재 위치에서 이동 가능한 경로를 확인했다.",
        ALREADY_AT_DESTINATION: "이미 요청한 목적지에 도착해 있다.",
        ROUTE_GUIDANCE: "목적지까지는 인접 구역을 차례로 이동해야 한다.",
        AMBIGUOUS_MOVE: "이동할 경로를 하나로 정해야 한다.",
        OTHER: "그 행동으로는 현재 상황에 변화를 만들 수 없다.",
      })[kind] || actionText || kind;
      log(session, idFactory, nowMs, ["ITEM_UNAVAILABLE", "OTHER", "IRRELEVANT_HAZARD_ACTION"].includes(kind) ? "fail" : kind === "ACTION_INPUT" ? "action-input" : "scene", kind === "ACTION_INPUT" ? actionText : resultText, kind === "ACTION_INPUT" ? actorId : null, { kind });
    } else return reject(state, "INVALID_ACTION");
    return applied(next);
  }

  if (command === "SEND_FIELD_CHAT_V1") {
    const session = activeMember(next, actorId, sessionId);
    const message = text(payload.text);
    if (!session || session.movement || !message) return reject(state, "OUT_OF_SCOPE");
    for (const recipient of Object.values(next.sessions || {})) {
      if (recipient.id !== session.id && (recipient.status !== "ACTIVE" || !sameScope(session, recipient))) continue;
      log(recipient, idFactory, nowMs, "interaction", `“${message}”`, actorId, { scopeKey: session.activeEncounter ? `route:${session.activeEncounter.fromNode}:${session.activeEncounter.targetNode}` : `node:${session.currentNode}` });
    }
    return applied(next);
  }

  return reject(state, "UNSUPPORTED_COMMAND");
}
