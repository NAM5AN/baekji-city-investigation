import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const gameplaySource = fs.readFileSync(new URL("../gameplay-variance.js", import.meta.url), "utf8");
const motionSource = fs.readFileSync(new URL("../retro-motion.js", import.meta.url), "utf8");
const motionCss = fs.readFileSync(new URL("../retro-ambient-type.css", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

class FakeStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.has(key) ? this.values.get(key) : null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}

const localStorage = new FakeStorage();
const state = {
  version: 3,
  sessions: {
    s1: {
      id: "s1",
      status: "ACTIVE",
      variant: "c",
      startedAt: 10,
      choiceReveal: null,
      movement: { routeId: "R1", token: "move-1", resolveAt: 0 },
    },
  },
};
localStorage.setItem("baekji_city_mvp_state_v3", JSON.stringify(state));

class FakeMutationObserver { observe() {} }
const sandbox = {
  window: {
    DAY1_DATA: {
      routes: [{ id: "R1", narration: "통로를 따라 이동한다." }],
      riskProfiles: {
        "R1:c": { id: "risk-r1-c", routeId: "R1", variant: "c", chance: 0, hazards: ["HZ_TEST"], hazardCount: 1 },
      },
    },
  },
  Storage: FakeStorage,
  localStorage,
  document: { querySelector: () => null, getElementById: () => ({}) },
  MutationObserver: FakeMutationObserver,
  Date,
  Math,
  JSON,
  Object,
  String,
  Number,
  Array,
  Reflect,
  Proxy,
  queueMicrotask,
};
vm.runInNewContext(gameplaySource, sandbox);

const helpers = sandbox.window.__BAEKJI_GAMEPLAY_VARIANCE_TEST__;
assert.ok(helpers, "gameplay variance test helpers should be exposed");
const choiceState = { version: 3, sessions: { active: { status: "ACTIVE", startedAt: 3, choiceReveal: null, movement: null } } };
helpers.addPersistentChoiceReveal(choiceState);
assert.equal(choiceState.sessions.active.choiceReveal.type, "persistent-menu");
assert.match(helpers.pastRouteNarration("통로를 따라 이동한다."), /이동했다/);

const skippedProfile = sandbox.window.DAY1_DATA.riskProfiles["R1:c"];
assert.deepEqual([...skippedProfile.hazards], [], "chance miss should skip the encounter");
assert.equal(skippedProfile.skippedByChance, true);
assert.match(gameplaySource, /무사히 통과했다/);
assert.match(gameplaySource, /profile\.chance/);

assert.doesNotMatch(motionSource, /function typeText/);
assert.doesNotMatch(motionSource, /typingTimers/);
assert.match(motionSource, /motion-stable-new/);
assert.match(motionSource, /motion-map-unfold/);
assert.match(motionCss, /retro-ambient-breathe/);
assert.match(motionCss, /retro-dissolve-flow/);
assert.match(motionCss, /retro-map-unfold/);
assert.match(motionCss, /retro-type-caret/);
assert.match(index, /gameplay-variance\.js\?v=0\.3\.31/);
assert.match(index, /retro-ambient-type\.css\?v=0\.3\.31/);

console.log("v0.3.31 ambient, persistent choice, and chance-risk checks passed");