import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("party-leadership-flow.js", "utf8");
const runtimeUtils = fs.readFileSync("runtime-utils.js", "utf8");
const worldPersistence = fs.readFileSync("world-persistence.js", "utf8");
const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const USER_KEY = "baekji_city_mvp_current_user_v034";

class FakeElement {
  constructor(matches = {}, dataset = {}) {
    this.matchesMap = matches;
    this.dataset = dataset;
  }
  closest(selector) { return this.matchesMap[selector] ? this : null; }
  remove() { this.removed = true; }
}

const baseState = {
  version: 3,
  storyDay: 1,
  loopId: "LOOP-001",
  eventSeq: 0,
  sessionSeq: 0,
  characters: {
    leader: { id: "leader", contamination: 0, symptom: "안정", inventory: {}, currentPartyId: null, currentSessionId: null, onlineAt: null },
    member: { id: "member", contamination: 0, symptom: "안정", inventory: {}, currentPartyId: null, currentSessionId: null, onlineAt: null },
  },
  parties: {},
  sessions: {},
  itemClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
};

const local = new Map([[GLOBAL_KEY, JSON.stringify(baseState)]]);
const session = new Map([[USER_KEY, "leader"]]);
let warningActive = true;
let clickHandler = null;
let canonicalWrites = 0;
let emittedEvents = 0;

const warning = new FakeElement();
const modalRoot = {
  children: [],
  innerHTML: "",
  querySelector(selector) { return selector === "[data-party-leadership-warning]" && warningActive ? warning : null; },
  contains(node) { return warningActive && node === warning; },
  replaceChildren() { warningActive = false; this.innerHTML = ""; },
};

const document = {
  documentElement: { dataset: {} },
  getElementById(id) { return id === "modal-root" ? modalRoot : null; },
  querySelector(selector) { return selector === "[data-party-leadership-warning]" && warningActive ? warning : null; },
  querySelectorAll() { return []; },
  createElement() { return new FakeElement(); },
  addEventListener(type, handler) { if (type === "click") clickHandler = handler; },
};

const location = { hash: "#/home" };
const listeners = new Map();
const context = vm.createContext({
  console,
  structuredClone,
  Element: FakeElement,
  CSS: { escape(value) { return String(value); } },
  CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
  Event: class Event { constructor(type) { this.type = type; } },
  HashChangeEvent: class HashChangeEvent { constructor(type) { this.type = type; } },
  queueMicrotask,
  setTimeout,
  clearTimeout,
  requestAnimationFrame(callback) { callback(); return 1; },
  localStorage: {
    getItem(key) { return local.has(key) ? local.get(key) : null; },
    setItem(key, value) { canonicalWrites += 1; local.set(key, String(value)); },
  },
  sessionStorage: {
    getItem(key) { return session.has(key) ? session.get(key) : null; },
    setItem(key, value) { session.set(key, String(value)); },
  },
  document,
  location,
});
context.window = context;
context.addEventListener = (type, handler) => listeners.set(type, handler);
context.dispatchEvent = () => { emittedEvents += 1; return true; };

vm.runInContext(runtimeUtils, context, { filename: "runtime-utils.js" });
vm.runInContext(worldPersistence, context, { filename: "world-persistence.js" });
vm.runInContext(source, context, { filename: "party-leadership-flow.js" });
assert.equal(typeof clickHandler, "function", "party leadership click handler must be registered");
let createPosts = 0;
let settleCreate = null;
context.__BAEKJI_PLAYER_WORLD_COMMANDS__ = {
  dispatch(command, payload) {
    createPosts += 1;
    assert.equal(command, "CREATE_PARTY_V1", "leadership confirmation owns only the create command");
    assert.equal(JSON.stringify(payload), "{}", "create command has no client-generated fields");
    return new Promise((resolve) => {
      settleCreate = () => {
        const canonical = JSON.parse(local.get(GLOBAL_KEY));
        canonical.characters.leader.currentPartyId = "server-party";
        canonical.parties["server-party"] = {
          id: "server-party", name: "해오름역 조사조 1", creatorId: "leader", destination: "E", status: "RECRUITING",
          memberIds: ["leader"], invitedIds: [], declinedIds: [], confirmedBy: [], readyBy: [], sessionId: null, createdAt: 1700000000000,
        };
        local.set(GLOBAL_KEY, JSON.stringify(canonical)); resolve({ status: "APPLIED" });
      };
    });
  },
};

const confirmButton = new FakeElement({ "[data-party-leadership-confirm]": true });
const confirmEvent = {
  target: confirmButton,
  prevented: false,
  stopped: false,
  preventDefault() { this.prevented = true; },
  stopImmediatePropagation() { this.stopped = true; },
};
clickHandler(confirmEvent);
assert.equal(createPosts, 1, "leader warning confirmation sends exactly one authoritative POST");
assert.equal(warningActive, true, "warning remains visible until authoritative settlement");
clickHandler(confirmEvent);
assert.equal(createPosts, 1, "rapid duplicate warning confirmation is guarded before a second POST");
settleCreate();
await new Promise((resolve) => setTimeout(resolve, 0));

const createdState = JSON.parse(local.get(GLOBAL_KEY));
const partyId = createdState.characters.leader.currentPartyId;
assert.equal(partyId, "server-party", "leader navigation uses the refreshed canonical party id");
assert.equal(createdState.parties[partyId]?.creatorId, "leader");
assert.equal(location.hash, `#/party/${partyId}`, "leader confirmation must navigate to the party page");
assert.equal(warningActive, false, "leadership warning overlay must be fully removed before navigation");
assert.equal(canonicalWrites, 0, "leadership confirmation performs no local canonical write");
assert.equal(emittedEvents, 0, "leadership confirmation emits no local creation event");
assert.equal(confirmEvent.prevented, true);
assert.equal(confirmEvent.stopped, true);

createdState.characters.member.currentPartyId = partyId;
createdState.parties[partyId].memberIds.push("member");
local.set(GLOBAL_KEY, JSON.stringify(createdState));
session.set(USER_KEY, "member");
location.hash = "#/home";

const openButton = new FakeElement({ "[data-open-party]": true }, { openParty: partyId });
const openEvent = {
  target: openButton,
  prevented: false,
  stopped: false,
  preventDefault() { this.prevented = true; },
  stopImmediatePropagation() { this.stopped = true; },
};
clickHandler(openEvent);
assert.equal(location.hash, "#/home", "member open click must never navigate into the leader-only party page");
assert.equal(openEvent.prevented, true);
assert.equal(openEvent.stopped, true);

const pendingConfirmed = JSON.parse(local.get(GLOBAL_KEY));
pendingConfirmed.parties[partyId].status = "COMPOSITION_CONFIRMED";
pendingConfirmed.parties[partyId].memberIds = ["leader"];
pendingConfirmed.parties[partyId].invitedIds = ["member"];
pendingConfirmed.parties[partyId].declinedIds = [];
pendingConfirmed.parties[partyId].confirmedBy = ["leader"];
pendingConfirmed.characters.member.currentPartyId = null;
local.set(GLOBAL_KEY, JSON.stringify(pendingConfirmed));
session.set(USER_KEY, "member");

const acceptButton = new FakeElement({ "[data-party-flow-accept], [data-accept]": true }, { partyFlowAccept: partyId });
const acceptEvent = {
  target: acceptButton,
  prevented: false,
  stopped: false,
  preventDefault() { this.prevented = true; },
  stopImmediatePropagation() { this.stopped = true; },
};
clickHandler(acceptEvent);
const acceptedConfirmed = JSON.parse(local.get(GLOBAL_KEY));
assert.equal(acceptedConfirmed.characters.member.currentPartyId, null, "B5 leadership capture must not locally accept an invitation");
assert.ok(!acceptedConfirmed.parties[partyId].memberIds.includes("member"));
assert.ok(acceptedConfirmed.parties[partyId].invitedIds.includes("member"));
assert.equal(acceptedConfirmed.parties[partyId].status, "COMPOSITION_CONFIRMED");
assert.equal(acceptEvent.prevented, false, "B5 leaves acceptance to the authoritative home/modal command owners");
assert.equal(acceptEvent.stopped, false);

// A rejected command must leave the warning and route untouched. This uses the
// same installed production click owner after returning to a no-party state.
const retryState = JSON.parse(JSON.stringify(baseState));
local.set(GLOBAL_KEY, JSON.stringify(retryState)); session.set(USER_KEY, "leader"); location.hash = "#/home"; warningActive = true;
context.__BAEKJI_PLAYER_WORLD_COMMANDS__.dispatch = () => Promise.reject(new Error("offline"));
const writesBeforeFailure = canonicalWrites; const eventsBeforeFailure = emittedEvents;
clickHandler(confirmEvent); await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(warningActive, true, "failed create keeps the leadership warning open");
assert.equal(location.hash, "#/home", "failed create cannot route optimistically");
assert.equal(canonicalWrites, writesBeforeFailure, "failed create makes no local canonical write");
assert.equal(emittedEvents, eventsBeforeFailure, "failed create emits no local creation event");

assert.doesNotMatch(source, /new MutationObserver/, "party leadership layer must not use a self-triggering DOM observer");
console.log("PASS: leader warning clears and navigates; member open is blocked without page lock");
