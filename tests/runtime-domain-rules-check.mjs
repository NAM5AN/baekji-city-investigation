import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const runtimeUtils = fs.readFileSync(new URL("../runtime-utils.js", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../runtime-domain-rules.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

function loadDomainRules() {
  const sandbox = { window: {}, console, JSON, Set, Object, String, Math, Array };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(runtimeUtils, sandbox, { filename: "runtime-utils.js" });
  vm.runInContext(source, sandbox, { filename: "runtime-domain-rules.js" });
  return sandbox.window.__BAEKJI_DOMAIN_RULES__;
}

const rules = loadDomainRules();
assert.ok(rules, "Stage 3-B domain rules must expose one shared runtime surface");
assert.equal(Object.isFrozen(rules), true, "the Stage 3-B domain surface must be frozen");
assert.deepEqual(
  Array.from(Object.keys(rules)).sort(),
  ["contaminationStage", "effectivePartyReady", "partyMembershipChangeAllowed", "partyMembershipRemovalKey", "spatialScopeKey", "storedPartyReady"],
  "the Stage 3-B public surface must stay deliberately small; member-list normalization remains owned by Stage 3-A uniqueArray"
);

const member = "member";
const readyObjectWins = { readyStateBy: { [member]: { ready: false } }, readyBy: [member] };
assert.equal(rules.storedPartyReady(readyObjectWins, member), false, "ready object marker must override legacy readyBy");
assert.equal(rules.storedPartyReady({ readyStateBy: { [member]: true }, readyBy: [] }, member), true, "boolean readyStateBy marker remains supported");
assert.equal(rules.storedPartyReady({ readyStateBy: { [member]: false }, readyBy: [member] }, member), false, "boolean marker must override legacy readyBy");
assert.equal(rules.storedPartyReady({ readyBy: [member] }, member), true, "legacy readyBy is the final stored-ready fallback");
assert.equal(rules.storedPartyReady({ readyBy: [member] }, "other"), false, "stored readiness must stay member-scoped");

for (const status of ["COMPOSITION_CONFIRMED", "READY_CHECK"]) {
  assert.equal(rules.effectivePartyReady({ creatorId: "leader", status, readyStateBy: { leader: { ready: false } } }, "leader"), true, `${status} leader must be effectively ready even for legacy false state`);
}
for (const status of ["RECRUITING", "LOCKED", "SESSION_CREATED", "CLOSED", undefined]) {
  assert.equal(rules.effectivePartyReady({ creatorId: "leader", status, readyStateBy: { leader: { ready: false } } }, "leader"), false, `${String(status)} leader must use stored readiness rather than auto-ready`);
}
assert.equal(rules.effectivePartyReady({ creatorId: "leader", status: "COMPOSITION_CONFIRMED", readyBy: [member] }, member), true, "non-leaders must still use stored readiness in confirmed composition");

assert.equal(rules.partyMembershipChangeAllowed(null), false, "missing party cannot mutate membership");
assert.equal(rules.partyMembershipChangeAllowed({ status: "RECRUITING", sessionId: null }), true, "recruiting party may mutate membership");
assert.equal(rules.partyMembershipChangeAllowed({ status: "COMPOSITION_CONFIRMED", sessionId: "" }), true, "confirmed party without a session may mutate membership");
for (const status of ["SESSION_CREATED", "LOCKED", "CLOSED"]) {
  assert.equal(rules.partyMembershipChangeAllowed({ status, sessionId: null }), false, `${status} party must reject membership mutation`);
}
assert.equal(rules.partyMembershipChangeAllowed({ status: "RECRUITING", sessionId: "s1" }), false, "any session linkage must reject membership mutation");

assert.equal(rules.partyMembershipRemovalKey("p1", "m1"), "p1:m1");
assert.equal(rules.partyMembershipRemovalKey(null, "m1"), ":m1", "null party ID must retain legacy empty-string normalization");
assert.equal(rules.partyMembershipRemovalKey("p1", null), "p1:", "null member ID must retain legacy empty-string normalization");
assert.equal(rules.partyMembershipRemovalKey(0, 0), ":", "zero IDs must retain legacy String(value || '') normalization");

assert.equal(rules.spatialScopeKey(null), "", "missing session has no spatial scope");
assert.equal(rules.spatialScopeKey({ movement: { fromNode: "A", targetNode: "B" }, activeEncounter: { fromNode: "X", targetNode: "Y" }, currentDetailId: "D", currentNode: "N" }), "route:A:B", "movement scope must outrank encounter, detail, and node");
assert.equal(rules.spatialScopeKey({ activeEncounter: { fromNode: "A", targetNode: "B" }, currentDetailId: "D", currentNode: "N" }), "route:A:B", "encounter scope must outrank detail and node");
assert.equal(rules.spatialScopeKey({ currentNode: "A", currentDetailId: "D" }), "detail:A:D", "detail scope must outrank node field scope");
assert.equal(rules.spatialScopeKey({ currentNode: "A", currentDetailId: null }), "node:A", "ordinary field scope must use its current node");
assert.equal(rules.spatialScopeKey({}), "node:undefined", "missing node must preserve the existing exact scope serialization");

for (const [value, expected] of [
  [-1, "안정"], [19, "안정"], [20, "번짐"], [39, "번짐"], [40, "유화"],
  [59, "유화"], [60, "용해"], [79, "용해"], [80, "붕락"], [99, "붕락"],
  [100, "완전 용해"], [101, "완전 용해"], ["40", "유화"], [Number.NaN, "안정"], [Infinity, "완전 용해"],
]) {
  assert.equal(rules.contaminationStage(value), expected, `contamination stage golden value ${String(value)} must remain stable without clamping`);
}

assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|document|fetch|location|Date|Math\.random|crypto\.)\b/, "domain rules must not own storage, DOM, networking, routing, time, or randomness");
assert.doesNotMatch(source, /\b(?:getState|setState|readState|writeState|appendLog|cloud|admin|api)\b/i, "domain rules must not read/write application state, logs, cloud, admin, or API surfaces");

const domainScript = '<script src="runtime-domain-rules.js?v=0.1.0&stage3b=1"></script>';
const utilsScript = '<script src="runtime-utils.js?v=0.1.0&stage3a=1"></script>';
assert.ok(index.includes(domainScript), "domain rules must use the exact Stage 3-B cache key");
assert.ok(index.indexOf(domainScript) > index.indexOf(utilsScript), "domain rules must load after Stage 3-A runtime utilities");
for (const consumer of [
  "action-log-sync.js?v=0.4.2&stage3a=1&stage3b=1&transfer-privacy=1",
  "sound-event-sync.js?v=0.3.35&stage3b=1",
  "runtime-baseline-stability.js?v=0.4.5&stage3a=1&stage3b=1&transfer-privacy=1",
  "app.js?v=0.4.12&fix=0b1&local-chat=1&movement-terminal=1&flex-hazard-terminal=1&topbar=1&stage2-foundation-ui=1&stage2-briefing-ui=1&stage2-party-ui=1&stage2-home-briefing-party-ui=1&pending-party-invites=1&party-member-readiness-ux=1&party-invite-grid-stability=1&party-confirmed-ready-collapse=1&pending-departure-set-guard=1&result-party-disband=1&departure-guards=1&stage3a=1&stage3b=1&stage3c=1&transfer-privacy=1&movement-departure-presence=1&item-disposition=1",
  "party-flow-ux-fix.js?v=0.3.87&departure-capture-guard=1&stage3a=1&stage3b=1",
  "party-reinvite-runtime-fix.js?v=0.3.89&stage3a=1&stage3b=1",
  "party-membership-ux-fix.js?v=0.3.87&stage3a=1&stage3b=1",
  "party-preflight-flow-fix.js?v=0.3.96&stage3a=1&stage3b=1",
  "party-member-home-roster.js?v=0.3.98&stage3a=1&stage3b=1",
  "character-interaction-ai.js?v=0.4.2&stage3a=1&stage3b=1",
  "cross-party-hazard-interaction.js?v=0.3.77&stage3a=1&stage3b=1",
  "party-transfer-flow.js?v=0.3.78&stage3a=1&stage3b=1",
]) {
  assert.ok(index.indexOf(consumer) > index.indexOf(domainScript), `domain rules must load before migrated consumer ${consumer}`);
}

for (const [file, localDefinition] of [
  ["app.js", /function (?:effectivePartyReady|spatialScopeKey|contaminationStage)\(/],
  ["action-log-sync.js", /function spatialScopeKey\(/],
  ["character-interaction-ai.js", /function spatialScopeKey\(/],
  ["cross-party-hazard-interaction.js", /function (?:spatialScopeKey|contaminationStage)\(/],
  ["party-transfer-flow.js", /function spatialScopeKey\(/],
  ["runtime-baseline-stability.js", /function spatialScopeKey\(/],
  ["sound-event-sync.js", /function spatialScopeKey\(/],
  ["party-flow-ux-fix.js", /function (?:effectiveReady|effectivePartyReady|storedPartyReady)\(/],
  ["party-preflight-flow-fix.js", /function (?:effectiveReady|effectivePartyReady|storedPartyReady)\(/],
  ["party-member-home-roster.js", /function (?:effectiveReady|effectivePartyReady|storedPartyReady)\(/],
  ["party-membership-ux-fix.js", /function (?:partyMembershipChangeAllowed|partyMembershipRemovalKey)\(/],
  ["party-reinvite-runtime-fix.js", /function (?:partyMembershipChangeAllowed|partyMembershipRemovalKey)\(/],
]) {
  const consumer = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  assert.doesNotMatch(consumer, localDefinition, `${file} must remove its migrated Stage 3-B local domain-rule definitions`);
  assert.match(consumer, /BAEKJI_DOMAIN_RULES/, `${file} must explicitly depend on shared Stage 3-B domain rules`);
}
for (const [file, localDefinition] of [
  ["foundation-rule-fixes.js", /function contaminationStage\(/],
  ["cloud-state-sync.js", /function contaminationStage\(/],
  ["entry-presence-fix.js", /function scopeKey\(/],
]) {
  const consumer = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  assert.match(consumer, localDefinition, `${file} remains a deliberate local-domain exclusion in Stage 3-B`);
}

console.log("PASS: Stage 3-B frozen pure domain rules, golden boundaries, exact load order, and deliberate migration boundaries");
