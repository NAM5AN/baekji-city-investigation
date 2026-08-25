import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../admin-dashboard.html", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../admin-observation-mvp2.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../admin-observation-mvp2.css", import.meta.url), "utf8");
const polishJs = new URL("../admin-observation-people-polish.js", import.meta.url);
const polishCss = new URL("../admin-observation-people-polish.css", import.meta.url);

assert.doesNotMatch(html, /admin-observation-people-polish\.(?:css|js)/, "direct observation rendering must not load the legacy people-polish lane");
assert.equal(fs.existsSync(polishJs), false, "legacy people-polish JavaScript file must be removed after its behavior moves into the observation renderer");
assert.equal(fs.existsSync(polishCss), false, "legacy people-polish stylesheet must be removed after its rules move into the observation stylesheet");
assert.doesNotMatch(source, /MutationObserver|queueMicrotask/, "observation member labels must be rendered from snapshot data, not patched after paint");
assert.match(source, /admin-observe-party-members/, "zone people rows must emit their member label in the first render");

[
  /\.admin-observe-person > \.admin-observe-avatar\{flex:0 0 36px;width:36px;height:36px;aspect-ratio:1\/1;border-radius:7px;overflow:hidden\}/,
  /\.admin-observe-person > \.admin-observe-avatar\.large\{flex-basis:44px;width:44px;height:44px\}/,
  /\.admin-observe-person > \.admin-observe-avatar img\{display:block;width:100%;height:100%;object-fit:cover\}/,
  /\.admin-observe-person > span:not\(\.admin-observe-avatar\)\{min-width:0;flex:1\}/,
  /\.admin-observe-party-members\{display:block!important;margin-top:4px!important;color:var\(--accent\)!important;font-size:8px!important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\}/,
].forEach((rule, index) => assert.match(css, rule, `main observation stylesheet must own migrated people-polish rule ${index + 1}`));

class Element {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.className = "";
    this.type = "";
    this.textContent = "";
  }

  closest(selector) {
    const map = {
      "[data-admin-observe-launch]": "adminObserveLaunch",
      "[data-observe-jump]": "observeJump",
      "[data-observe-open-navigator]": "observeOpenNavigator",
      "[data-observe-back]": "observeBack",
      "[data-observe-crumb-index]": "observeCrumbIndex",
      "[data-observe-modal-tab]": "observeModalTab",
      "[data-admin-detail]": "adminDetail",
    };
    return Object.entries(map).some(([needle, key]) => selector.includes(needle) && Object.hasOwn(this.dataset, key)) ? this : null;
  }
}

const modalRoot = { innerHTML: "" };
const tabs = {
  children: [],
  querySelector() { return null; },
  append(node) { this.children.push(node); },
};
let captureConsumer = null;
let captureRegistrations = 0;
let snapshotConsumer = null;
const modalConsumers = [];
let renderCount = 0;
let owner = "";

const shell = Object.freeze({
  modal: Object.freeze({
    root: () => modalRoot,
    render(nextOwner, markup) {
      owner = nextOwner;
      renderCount += 1;
      modalRoot.innerHTML = String(markup);
    },
    getOwner: () => owner,
    subscribe(callback) { modalConsumers.push(callback); return () => {}; },
  }),
  snapshot: Object.freeze({
    subscribe(callback) { snapshotConsumer = callback; return () => {}; },
  }),
  onCaptureClick(callback) {
    captureRegistrations += 1;
    captureConsumer = callback;
    return () => {};
  },
});

const window = { __BAEKJI_ADMIN_SHELL__: shell, DAY1_DATA: { places: { E_G_PLAZA: { id: "E_G_PLAZA", name: "환승광장", floor: "지상", floorId: "G", order: 1 } }, variants: {}, meta: {} } };
const document = {
  querySelector(selector) { return selector === ".admin-tabs" ? tabs : null; },
  createElement() { return new Element(); },
};
const context = vm.createContext({ window, document, Element, Object, Array, String, Number, Boolean, Set, Map, Date, JSON, console });
vm.runInContext(source, context, { filename: "admin-observation-mvp2.js" });

assert.equal(captureRegistrations, 1, "observation must register exactly one consumer through the shared shell capture lane");
assert.equal(typeof captureConsumer, "function", "shared shell must receive the observation click consumer");
assert.equal(tabs.children.length, 1, "observation launch control must still install once");

const snapshot = {
  state: {
    storyDay: 1,
    loopId: "LOOP-1",
    characters: {
      a: { id: "a", currentPartyId: "p1", currentSessionId: "s1", contamination: 0 },
      b: { id: "b", currentPartyId: "p1", currentSessionId: "s1", contamination: 0 },
      c: { id: "c", currentPartyId: "p1", currentSessionId: "s1", contamination: 0 },
    },
    parties: {
      p1: { id: "p1", name: "중복 조", memberIds: ["a", "b", "c"], sessionId: "s1" },
      p2: { id: "p2", name: "중복 조", memberIds: [], sessionId: "s2" },
    },
    sessions: {
      s1: { id: "s1", partyId: "p1", memberIds: ["a", "b", "c"], status: "ACTIVE", currentNode: "E_G_PLAZA" },
      s2: { id: "s2", partyId: "p2", memberIds: [], status: "ACTIVE", currentNode: "E_G_PLAZA" },
    },
  },
  directory: [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "B" },
  ],
};
snapshotConsumer(snapshot);

function dispatch(dataset) {
  const event = {
    target: new Element(dataset),
    prevented: 0,
    stopped: 0,
    preventDefault() { this.prevented += 1; },
    stopImmediatePropagation() { this.stopped += 1; },
  };
  const before = renderCount;
  captureConsumer(event);
  assert.equal(renderCount, before + 1, "one capture click must produce exactly one observation render");
  assert.equal(event.prevented, 1, "observation capture action must prevent the legacy handler path");
  assert.equal(event.stopped, 1, "observation capture action must stop the duplicate handler path");
}

dispatch({ adminObserveLaunch: "" });
dispatch({ observeJump: "zone", observeId: "node:E_G_PLAZA" });
dispatch({ observeModalTab: "people" });

const p1Row = modalRoot.innerHTML.match(/<button[^>]*data-observe-id="p1"[\s\S]*?<\/button>/)?.[0] || "";
assert.ok(p1Row, "p1 row must remain separately addressable by its party/session id");
assert.match(p1Row, /admin-observe-party-members">조원 · A · B<\/small>/, "p1 member label must dedupe canonical display names while retaining first member order");
assert.equal((p1Row.match(/\bB\b/g) || []).length, 1, "the duplicate canonical B member must appear only once in p1's direct label");
const p2Row = modalRoot.innerHTML.match(/<button[^>]*data-observe-id="p2"[\s\S]*?<\/button>/)?.[0] || "";
assert.ok(p2Row, "same-named p2 row must remain separately addressable by its party/session id");
assert.doesNotMatch(p2Row, /admin-observe-party-members|조원 · A · B/, "p1 member label must not leak to same-named p2 with zero members");
assert.equal((modalRoot.innerHTML.match(/admin-observe-party-members/g) || []).length, 1, "only the populated party row may render a member label");

const beforeSnapshotRerender = renderCount;
snapshotConsumer(snapshot);
assert.equal(renderCount, beforeSnapshotRerender + 1, "an active observation view must rerender exactly once per snapshot delivery");

owner = "";
modalConsumers.forEach((callback) => callback({ open: false, owner: "" }));
const beforeClosedSnapshot = renderCount;
snapshotConsumer(snapshot);
assert.equal(renderCount, beforeClosedSnapshot, "shell modal close ownership must clear the observation view and block stale snapshot rerenders");

console.log("PASS: observation renders isolated party member labels directly with one shell capture action and one snapshot rerender");
