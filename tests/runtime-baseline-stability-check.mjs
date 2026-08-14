import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("runtime-baseline-stability.js", "utf8");
const context = vm.createContext({ console, globalThis: null });
context.globalThis = context;
vm.runInContext(source, context, { filename: "runtime-baseline-stability.js" });

const api = context.__BAEKJI_RUNTIME_BASELINE_STABILITY_TEST__;
assert.ok(api, "runtime baseline stability test API must be exposed");

const ordered = api.stableChronologicalEntries([
  { id: "late", at: 300 },
  { id: "same-b", at: 200 },
  { id: "early", at: 100 },
  { id: "same-a", at: 200 },
]);
assert.deepEqual(Array.from(ordered, (entry) => entry.id), ["early", "same-b", "same-a", "late"], "chronology must sort by timestamp while preserving equal-time source order");

const alreadyOrderedSession = {
  currentNode: "E_ENTRY",
  currentDetailId: null,
  movement: null,
  activeEncounter: null,
  logs: [
    { id: "entry", type: "chat-divider", scopeKey: "node:E_ENTRY", text: "입구", at: 100 },
    { id: "chat-entry", type: "interaction", scopeKey: "node:E_ENTRY", actorId: "test_a", text: "정상", at: 110 },
  ],
};
assert.equal(api.needsChronologyRepair(alreadyOrderedSession), false, "normal chat must not be re-rendered by the repair layer");

const shuffledSession = {
  currentNode: "E_B",
  currentDetailId: null,
  movement: null,
  activeEncounter: null,
  logs: [
    { id: "arrive-b", type: "chat-divider", scopeKey: "node:E_B", text: "B", at: 300 },
    { id: "entry", type: "chat-divider", scopeKey: "node:E_ENTRY", text: "입구", at: 100 },
    { id: "chat-b", type: "interaction", scopeKey: "node:E_B", actorId: "test_a", text: "도착", at: 310 },
    { id: "chat-route", type: "interaction", scopeKey: "route:E_ENTRY:E_B", actorId: "test_a", text: "이동 중", at: 210 },
    { id: "route", type: "chat-divider", scopeKey: "route:E_ENTRY:E_B", text: "이동 경로", at: 200 },
    { id: "chat-entry", type: "interaction", scopeKey: "node:E_ENTRY", actorId: "test_a", text: "출발 전", at: 110 },
  ],
};
assert.equal(api.needsChronologyRepair(shuffledSession), true, "cloud-merged out-of-order logs must be detected");
const timeline = api.chatTimelineEntries(shuffledSession);
assert.deepEqual(
  Array.from(timeline, (entry) => entry.id),
  ["entry", "chat-entry", "route", "chat-route", "arrive-b", "chat-b"],
  "cloud-merged log array order must not scramble the player chat timeline",
);

const missingDivider = api.chatTimelineEntries({
  currentNode: "E_B",
  currentDetailId: null,
  movement: null,
  activeEncounter: null,
  logs: [
    { id: "a", type: "interaction", scopeKey: "node:E_ENTRY", actorId: "test_a", text: "A", at: 10 },
    { id: "b", type: "interaction", scopeKey: "node:E_B", actorId: "test_a", text: "B", at: 20 },
  ],
});
assert.deepEqual(
  Array.from(missingDivider, (entry) => entry.id),
  ["virtual_divider_a", "a", "virtual_divider_b", "b"],
  "scope changes must still receive deterministic virtual dividers after chronological sorting",
);

const movingSession = {
  currentNode: "E_ENTRY",
  currentDetailId: null,
  activeEncounter: null,
  movement: { fromNode: "E_ENTRY", targetNode: "E_B" },
  logs: [
    { id: "entry", type: "chat-divider", scopeKey: "node:E_ENTRY", text: "입구", at: 100 },
    { id: "chat-entry", type: "interaction", scopeKey: "node:E_ENTRY", actorId: "test_a", text: "이동 전", at: 110 },
  ],
};
const movingTimelineA = api.chatTimelineEntries(movingSession);
const movingTimelineB = api.chatTimelineEntries(movingSession);
assert.deepEqual(
  JSON.parse(JSON.stringify(movingTimelineA)),
  JSON.parse(JSON.stringify(movingTimelineB)),
  "movement timeline generation must be deterministic across repeated observer passes",
);
assert.equal(movingTimelineA.at(-1).id, "virtual_current_route:E_ENTRY:E_B");
assert.equal(movingTimelineA.at(-1).at, 111, "virtual current divider must use a stable timestamp instead of Date.now()");

const base = 1_000_000;
assert.equal(api.isFreshNarrationPending({ actionNarrationPending: true, actionNarrationPendingAt: base }, base + api.NARRATION_STALE_MS - 1), true);
assert.equal(api.isFreshNarrationPending({ actionNarrationPending: true, actionNarrationPendingAt: base }, base + api.NARRATION_STALE_MS), false, "expired narration markers must never hide a result indefinitely");
assert.equal(api.isFreshNarrationPending({ actionNarrationPending: true }, base), false, "pending markers without a timestamp are stale by definition");
assert.equal(api.isFreshNarrationPending({ actionNarrationPending: false, actionNarrationPendingAt: base }, base + 1), false);

const html = fs.readFileSync("index.html", "utf8");
assert.ok(html.includes("runtime-baseline-stability.js?v=0.4.4"));
assert.ok(html.indexOf("action-log-sync.js") < html.indexOf("runtime-baseline-stability.js"), "stability guard must run after the action pending-marker layer");
assert.ok(html.indexOf("runtime-baseline-stability.js") < html.indexOf("app.js?v=0.4.5"), "stability guard must observe the first investigation render");
assert.match(source, /retro-action-result-pending\.retro-action-result-stale\{display:block!important\}/);
assert.match(source, /needsChronologyRepair/);
assert.match(source, /if \(!session \|\| !needsChronologyRepair\(session\)\) return;/);
assert.match(source, /const lastAt = timeline\.length \? Number\(timeline\.at\(-1\)\?\.at\) \|\| 0 : 0;/);
assert.match(source, /observer\.observe\(appRoot, \{ childList: true, subtree: true \}\)/);

console.log("PASS: chat repair is deterministic, only runs for broken chronology, and stale narration markers cannot hide SYSTEM results forever");
