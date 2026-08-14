import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync("party-leadership-flow.js", "utf8");
const runtimeUtils = fs.readFileSync("runtime-utils.js", "utf8");
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
    setItem(key, value) { local.set(key, String(value)); },
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
context.dispatchEvent = () => true;

vm.runInContext(runtimeUtils, context, { filename: "runtime-utils.js" });
vm.runInContext(source, context, { filename: "party-leadership-flow.js" });
assert.equal(typeof clickHandler, "function", "party leadership click handler must be registered");

const confirmButton = new FakeElement({ "[data-party-leadership-confirm]": true });
const confirmEvent = {
  target: confirmButton,
  prevented: false,
  stopped: false,
  preventDefault() { this.prevented = true; },
  stopImmediatePropagation() { this.stopped = true; },
};
clickHandler(confirmEvent);

const createdState = JSON.parse(local.get(GLOBAL_KEY));
const partyId = createdState.characters.leader.currentPartyId;
assert.ok(partyId, "leader confirmation must create a party immediately");
assert.equal(createdState.parties[partyId]?.creatorId, "leader");
assert.equal(location.hash, `#/party/${partyId}`, "leader confirmation must navigate to the party page");
assert.equal(warningActive, false, "leadership warning overlay must be fully removed before navigation");
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
assert.equal(acceptedConfirmed.characters.member.currentPartyId, partyId, "capture click must accept an invite while composition is confirmed");
assert.ok(acceptedConfirmed.parties[partyId].memberIds.includes("member"));
assert.ok(!acceptedConfirmed.parties[partyId].invitedIds.includes("member"));
assert.equal(acceptedConfirmed.parties[partyId].status, "COMPOSITION_CONFIRMED");
assert.equal(acceptEvent.prevented, true);
assert.equal(acceptEvent.stopped, true);

assert.doesNotMatch(source, /new MutationObserver/, "party leadership layer must not use a self-triggering DOM observer");
console.log("PASS: leader warning clears and navigates; member open is blocked without page lock");
