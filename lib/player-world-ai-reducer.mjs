import DAY1_DATA from "../data/day1.json" with { type: "json" };
import { derivePlayerWorldEffects } from "./player-world-derived-effects.mjs";

const clone = (value) => structuredClone(value);
const clean = (value, max = 1200) => String(value || "").trim().replace(/\s+/g, " ").slice(0, max);
const clamp = (value) => Math.max(0, Math.min(100, Number(value) || 0));
function hashNumber(value) { let hash = 2166136261; for (const char of String(value || "")) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); } return Math.abs(hash >>> 0); }
function stage(value) { return value >= 100 ? "완전 용해" : value >= 80 ? "붕락" : value >= 60 ? "용해" : value >= 40 ? "유화" : value >= 20 ? "번짐" : "안정"; }
function scope(session) {
  if (session?.movement) return `route:${session.movement.fromNode}:${session.movement.targetNode}`;
  if (session?.activeEncounter) return `route:${session.activeEncounter.fromNode}:${session.activeEncounter.targetNode}`;
  if (session?.currentDetailId) return `detail:${session.currentNode}:${session.currentDetailId}`;
  return `node:${session?.currentNode || ""}`;
}
function sessionFor(state, characterId) { const id = state.characters?.[characterId]?.currentSessionId; return id ? state.sessions?.[id] : null; }
function exposureDelta(level, seed) {
  const ruleId = level === "HIGH" ? "EXP_CONTACT_HIGH" : level === "MEDIUM" ? "EXP_CONTACT_MEDIUM" : level === "LOW" ? "EXP_CONTACT_LOW" : "EXP_CONTACT_NONE";
  const rule = DAY1_DATA.contaminationRules?.[ruleId] || { min: 0, max: 0 };
  const min = Number(rule.min) || 0; const max = Math.max(min, Number(rule.max) || 0);
  return min + (hashNumber(seed) % (max - min + 1));
}
function ruleDelta(ruleId, seed) {
  const rule = DAY1_DATA.contaminationRules?.[ruleId] || DAY1_DATA.contaminationRules?.EXP_CONTACT_NONE || { min: 0, max: 0 };
  const min = Number(rule.min) || 0; const max = Math.max(min, Number(rule.max) || 0);
  return min + (hashNumber(seed) % (max - min + 1));
}
function expose(character, level, seed) {
  if (!character) return 0;
  const amount = exposureDelta(level, seed);
  character.contamination = clamp(Number(character.contamination || 0) + amount);
  character.symptom = stage(character.contamination);
  return amount;
}
function append(session, idFactory, nowMs, type, text, actorId = null, extra = {}) {
  session.logs ||= [];
  const entry = { id: idFactory("log"), type, text, actorId, at: nowMs, ...extra };
  session.logs.push(entry);
  return entry;
}
function ambientArrival(state, session, encounter, nowMs) {
  for (const memberId of session.memberIds || []) {
    const character = state.characters?.[memberId];
    if (!character) continue;
    character.contamination = clamp(Number(character.contamination || 0) + ruleDelta(encounter.ambientRuleId || "EXP_AMBIENT_A", `${session.id}:${encounter.targetNode}:${memberId}`));
    character.symptom = stage(character.contamination);
  }
  session.currentNode = encounter.targetNode;
  session.currentDetailId = null;
  session.activeEncounter = null;
}

export function reducePlayerWorldAiCommand({ state, actorId, command, payload = {}, decision, nowMs, idFactory, names = {} }) {
  if (!state || !actorId || !decision || !Number.isFinite(nowMs) || typeof idFactory !== "function") return { status: "OUT_OF_SCOPE", state };
  const next = clone(state);
  const actor = next.characters?.[actorId];
  const source = next.sessions?.[clean(payload.sessionId, 120)];
  if (!actor || !source || source.status !== "ACTIVE" || !source.memberIds?.includes(actorId)) return { status: "OUT_OF_SCOPE", state };

  if (command === "CHARACTER_INTERACTION_V1") {
    const targetId = clean(payload.targetId, 120);
    const actionText = clean(payload.actionText, 700);
    const target = next.characters?.[targetId];
    const targetSession = sessionFor(next, targetId);
    if (!target || targetId === actorId || !targetSession || targetSession.status !== "ACTIVE" || source.variant !== targetSession.variant || scope(source) !== scope(targetSession) || !actionText) return { status: "OUT_OF_SCOPE", state };
    const eventId = idFactory("character_interaction");
    append(source, idFactory, nowMs, "action-input", actionText, actorId, { scopeKey: scope(source), characterInteraction: true, interactionEventId: eventId });
    const derived = derivePlayerWorldEffects({
      state: next,
      effect: "CHARACTER_INTERACTION_RESULT",
      context: {
        sessionId: source.id, targetSessionId: targetSession.id, eventId,
        narration: clean(decision.narration, 1200), actorId, targetId,
        outcome: decision.outcome, targetEffect: decision.targetEffect,
        visibility: "FIELD",
      },
      nowMs,
      idFactory,
    });
    return derived.applied ? { status: "APPLIED", state: derived.state } : { status: "OUT_OF_SCOPE", state };
  }

  if (command === "RESOLVE_FLEXIBLE_HAZARD_V1") {
    const encounter = source.activeEncounter;
    const transition = source.lastMovementTransition;
    const action = clean(payload.actionText, 700);
    const hazardIndex = Number(payload.hazardIndex);
    const hazardId = encounter?.hazards?.[encounter.currentIndex];
    if (!encounter || !transition || transition.kind !== "ENCOUNTER" || transition.token !== payload.movementToken || encounter.currentIndex !== hazardIndex || hazardId !== payload.hazardId || !action) return { status: "OUT_OF_SCOPE", state };
    const progress = ["NONE", "CURRENT", "ALL"].includes(decision.progress) ? decision.progress : "NONE";
    const outcome = ["SUCCESS", "PARTIAL", "FAIL", "INFO"].includes(decision.outcome) ? decision.outcome : "PARTIAL";
    const exposure = (value) => ["NONE", "LOW", "MEDIUM", "HIGH"].includes(value) ? value : "NONE";
    let targetId = clean(payload.targetId, 120);
    let targetSession = sessionFor(next, targetId);
    if (!targetId && decision.targetName) {
      targetId = Object.keys(next.characters || {}).find((id) => id !== actorId && names[id] === decision.targetName) || "";
      targetSession = sessionFor(next, targetId);
    }
    const targetAllowed = targetId && targetSession?.status === "ACTIVE" && targetSession.variant === source.variant && scope(targetSession) === scope(source);
    if (targetId && !targetAllowed) return { status: "OUT_OF_SCOPE", state };
    source.choiceReveal = null;
    encounter.flexInsights ||= [];
    encounter.resolutions ||= [];
    const note = clean(decision.observationNote, 280);
    if (note) { encounter.flexInsights.push(note); if (encounter.flexInsights.length > 6) encounter.flexInsights.splice(0, encounter.flexInsights.length - 6); }
    const resolutionIndex = encounter.resolutions.length;
    const selfDelta = expose(actor, exposure(decision.selfExposure), `${source.id}:${hazardId}:${action}:self:${resolutionIndex}`);
    const targetDelta = targetAllowed ? expose(next.characters[targetId], exposure(decision.targetExposure), `${source.id}:${hazardId}:${action}:target:${targetId}:${resolutionIndex}`) : 0;
    const usedItemId = clean(decision.usedItemId, 220);
    if (usedItemId && decision.usedItemContaminated && actor.inventory?.[usedItemId]) actor.inventory[usedItemId].state = "CONTAMINATED";
    const actionEntry = append(source, idFactory, nowMs, "action-input", action, actorId, { scopeKey: scope(source), flexibleHazardAction: true });
    encounter.resolutions.push({ hazardId, actorId, text: action, outcome, progress, selfExposure: exposure(decision.selfExposure), selfDelta, targetId: targetAllowed ? targetId : null, targetSessionId: targetAllowed ? targetSession.id : null, targetExposure: targetAllowed ? exposure(decision.targetExposure) : "NONE", targetDelta, flexible: true, crossParty: Boolean(targetAllowed && targetSession.id !== source.id) });
    if (progress === "ALL") encounter.currentIndex = encounter.hazards.length;
    else if (progress === "CURRENT") encounter.currentIndex += 1;
    let arrived = false;
    if (progress !== "NONE" && encounter.currentIndex >= encounter.hazards.length) { ambientArrival(next, source, encounter, nowMs); arrived = true; }
    source.lastMovementTransition = { ...transition, kind: arrived ? "ARRIVED" : "ENCOUNTER", completedAt: arrived ? nowMs : transition.completedAt };
    append(source, idFactory, nowMs, outcome === "FAIL" ? "fail" : outcome === "INFO" ? "scene" : "success", clean(decision.narration, 1200) || "조사자는 선언한 방식으로 위험에 대응한다.", null, { kind: targetAllowed && targetSession.id !== source.id ? "CROSS_PARTY_HAZARD_RESPONSE" : "FLEX_HAZARD_RESPONSE", hazardActorId: actorId, hazardId, outcome, progress, contaminationDelta: selfDelta, targetId: targetAllowed ? targetId : null, targetContaminationDelta: targetDelta, arrived, systemNarration: true });
    if (targetAllowed && targetSession.id !== source.id) append(targetSession, idFactory, nowMs, "interaction", `/${action}`, actorId, { scopeKey: scope(targetSession), crossParty: true, sourceActionLogId: actionEntry.id });
    return { status: "APPLIED", state: next };
  }

  return { status: "OUT_OF_SCOPE", state };
}
