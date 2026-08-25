import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../runtime-utils.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

function loadUtils({ withStructuredClone = true } = {}) {
  const sandbox = { window: {}, console, JSON, Set, Object, String, Math };
  if (withStructuredClone) sandbox.structuredClone = structuredClone;
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "runtime-utils.js" });
  return sandbox.window.__BAEKJI_RUNTIME_UTILS__;
}

const utils = loadUtils();
assert.ok(utils, "runtime utilities must be exposed as window.__BAEKJI_RUNTIME_UTILS__");
assert.equal(Object.isFrozen(utils), true, "the public utility surface must be frozen");
assert.deepEqual(Object.keys(utils).sort(), ["clamp", "clone", "escapeHtml", "hashNumber", "uniqueArray"], "the Stage 3-A utility surface must stay deliberately small");

const original = { nested: { count: 1 }, list: [{ id: "a" }], untouched: true };
const cloned = utils.clone(original);
assert.notEqual(cloned, original, "clone must return a new root object");
assert.notEqual(cloned.nested, original.nested, "clone must not retain nested object references");
assert.notEqual(cloned.list, original.list, "clone must not retain nested array references");
cloned.nested.count = 9;
cloned.list[0].id = "changed";
assert.deepEqual(original, { nested: { count: 1 }, list: [{ id: "a" }], untouched: true }, "clone mutations must not leak into the source");

const fallbackUtils = loadUtils({ withStructuredClone: false });
const fallbackOriginal = { nested: { count: 1 }, list: ["a", "b"] };
const fallbackClone = fallbackUtils.clone(fallbackOriginal);
fallbackClone.nested.count = 2;
fallbackClone.list.push("c");
assert.deepEqual(fallbackOriginal, { nested: { count: 1 }, list: ["a", "b"] }, "the JSON fallback clone must remain deep");

assert.deepEqual([...utils.uniqueArray(["b", "a", "b", "c", "a"])], ["b", "a", "c"], "uniqueArray must preserve first-seen order");
assert.deepEqual([...utils.uniqueArray(null)], [], "uniqueArray must reject null safely");
assert.deepEqual([...utils.uniqueArray("abc")], [], "uniqueArray must reject non-array iterables rather than silently changing semantics");

assert.equal(utils.escapeHtml(`&<>"'`), "&amp;&lt;&gt;&quot;&#039;", "escapeHtml must preserve the existing five-character vector exactly");
assert.equal(utils.escapeHtml(null), "", "escapeHtml null behavior must remain compatible with app rendering");
assert.equal(utils.escapeHtml(0), "0", "escapeHtml must retain numeric zero");

assert.equal(utils.clamp(12, 0, 10), 10);
assert.equal(utils.clamp(-2, 0, 10), 0);
assert.equal(utils.clamp("7", 0, 10), 7, "clamp must retain JavaScript numeric-string coercion");
assert.equal(Number.isNaN(utils.clamp(Number.NaN, 0, 10)), true, "clamp must not silently turn NaN into zero");

assert.equal(utils.hashNumber("abc"), 440920331, "hash golden vector must stay stable");
assert.equal(utils.hashNumber(""), 2166136261, "empty hash golden vector must stay stable");
assert.equal(utils.hashNumber(null), 1996966820, "hash must apply String(value), including null");
assert.equal(utils.hashNumber(0), 890022063, "hash must apply String(value), including zero");
assert.equal(utils.hashNumber("해오름역"), 2931750234, "Korean hash golden vector must stay stable");
assert.equal(utils.hashNumber("🧭"), 981608993, "emoji hash golden vector must stay stable");

assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|document|fetch|location)\b/, "runtime utilities must not depend on storage, DOM, networking, or routing");
assert.doesNotMatch(source, /\bDate\b|Math\.random|crypto\./, "runtime utilities must not own time, randomness, or ID generation");

const cacheScript = '<script src="runtime-utils.js?v=0.1.0&stage3a=1"></script>';
assert.ok(index.includes(cacheScript), "runtime utility script must use the exact Stage 3-A cache key");
const utilsIndex = index.indexOf(cacheScript);
assert.ok(utilsIndex >= 0, "runtime utility script must be present");
for (const consumer of [
  "gameplay-variance.js?v=0.3.31&stage3a=1",
  "action-log-sync.js?v=0.4.2&stage3a=1&stage3b=1&transfer-privacy=1",
  "runtime-baseline-stability.js?v=0.4.5&stage3a=1&stage3b=1&transfer-privacy=1",
  "app.js?v=0.4.15&fix=0b1&local-chat=1&movement-terminal=1&flex-hazard-terminal=1&topbar=1&stage2-foundation-ui=1&stage2-briefing-ui=1&stage2-party-ui=1&stage2-home-briefing-party-ui=1&pending-party-invites=1&party-member-readiness-ux=1&party-invite-grid-stability=1&party-confirmed-ready-collapse=1&pending-departure-set-guard=1&result-party-disband=1&departure-guards=1&stage3a=1&stage3b=1&stage3c=1&transfer-privacy=1&movement-departure-presence=1&item-disposition=1&stage5-world-store=1&stage6a=1&stage6b=1",
  "party-flow-ux-fix.js?v=0.3.88&departure-capture-guard=1&stage3a=1&stage3b=1&stage6b=1",
  "party-leadership-flow.js?v=0.3.69&stage3a=1&stage6b=1",
  "party-roster-modal.js?v=0.3.72&stage3a=1",
  "party-flow-sync.js?v=0.3.68&stage3a=1&stage6b=1",
  "party-reinvite-runtime-fix.js?v=0.3.90&stage3a=1&stage3b=1&stage6b=1",
  "party-membership-ux-fix.js?v=0.3.88&stage3a=1&stage3b=1&stage6b=1",
  "party-preflight-flow-fix.js?v=0.3.97&stage3a=1&stage3b=1&stage6b=1",
  "party-ui-stability.js?v=0.3.94&stage3a=1&stage6b=1",
  "party-member-home-roster.js?v=0.3.98&stage3a=1&stage3b=1",
  "character-interaction-ai.js?v=0.4.3&stage3a=1&stage3b=1&stage6b=1",
  "cross-party-hazard-interaction.js?v=0.3.78&stage3a=1&stage3b=1&stage6b=1",
  "party-transfer-flow.js?v=0.3.79&stage3a=1&stage3b=1&stage6b=1",
  "party-transfer-runtime-fix.js?v=0.3.83&stage3a=1",
]) {
  const consumerIndex = index.indexOf(consumer);
  assert.ok(consumerIndex > utilsIndex, `runtime utilities must load before migrated consumer ${consumer}`);
}

for (const [file, removed] of [
  ["action-log-sync.js", /function (?:clone|unique)\(/],
  ["app.js", /function (?:escapeHtml|clamp|hashNumber)\(/],
  ["character-interaction-ai.js", /function unique\(/],
  ["cross-party-hazard-interaction.js", /function (?:clamp|hashNumber)\(/],
  ["gameplay-variance.js", /function hashNumber\(/],
  ["party-flow-sync.js", /function (?:clone|unique|escapeHtml)\(/],
  ["party-flow-ux-fix.js", /function (?:clone|unique)\(/],
  ["party-leadership-flow.js", /function (?:clone|unique)\(/],
  ["party-member-home-roster.js", /function unique\(/],
  ["party-membership-ux-fix.js", /function (?:clone|unique|escapeHtml)\(/],
  ["party-preflight-flow-fix.js", /function (?:clone|unique)\(/],
  ["party-reinvite-runtime-fix.js", /function (?:clone|unique)\(/],
  ["party-roster-modal.js", /function escapeHtml\(/],
  ["party-transfer-flow.js", /function (?:clone|unique|escapeHtml)\(/],
  ["party-transfer-runtime-fix.js", /function unique\(/],
  ["party-ui-stability.js", /function (?:clone|unique)\(/],
  ["runtime-baseline-stability.js", /(?:function|const) escapeHtml/],
]) {
  const migrated = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  assert.doesNotMatch(migrated, removed, `${file} must remove its Stage 3-A duplicate utility implementation`);
  assert.match(migrated, /BAEKJI_RUNTIME_UTILS/, `${file} must explicitly depend on the shared runtime utility surface`);
}

for (const [file, localContract] of [
  ["app.js", /function unique\(/],
  ["party-roster-modal.js", /function unique\(/],
  ["item-transfer-core.js", /const uniq\s*=/],
  ["foundation-rule-fixes.js", /function hashNumber\(/],
  ["character-interaction-ai.js", /function hashNumber\(/],
  ["cloud-state-sync.js", /function safeParse\(/],
  ["party-flow-sync.js", /function readState\(/],
  ["party-flow-sync.js", /function currentUserId\(/],
  ["app.js", /function appendLog\(/],
]) {
  const retained = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  assert.match(retained, localContract, `${file} retains its deliberate Stage 3-A local contract`);
}

console.log("PASS: Stage 3-A frozen pure runtime utilities, exact load contract, migrated duplicate removal, and explicit exclusions");
