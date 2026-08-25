import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const app = fs.readFileSync("app.js", "utf8");
const ux = fs.readFileSync("party-flow-ux-fix.js", "utf8");
const runtimeUtils = fs.readFileSync("runtime-utils.js", "utf8");
const worldStore = fs.readFileSync("world-store.js", "utf8");
const domainRules = fs.readFileSync("runtime-domain-rules.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const USER_KEY = "baekji_city_mvp_current_user_v034";

assert.match(index, /party-flow-ux-fix\.js\?v=0\.3\.87&departure-capture-guard=1&stage3a=1&stage3b=1/, "capture guard must retain its exact Stage 3-B cache key");

class Element {
  constructor(dataset = {}) { this.dataset = dataset; this.listeners = new Map(); }
  addEventListener(type, listener) { this.listeners.set(type, [...(this.listeners.get(type) || []), listener]); }
  closest(selector) { return selector.includes("[data-start-session]") && Object.hasOwn(this.dataset, "startSession") ? this : null; }
  remove() {}
  focus() {}
}

function fixture({ pending = [], memberReady = true } = {}) {
  return { version: 3, sessionSeq: 0, characters: { test_a: { id: "test_a", currentPartyId: "p1", currentSessionId: null, inventory: {} }, test_b: { id: "test_b", currentPartyId: "p1", currentSessionId: null, inventory: {} }, test_c: { id: "test_c", currentPartyId: null, currentSessionId: null, inventory: {} } }, parties: { p1: { id: "p1", creatorId: "test_a", status: "COMPOSITION_CONFIRMED", memberIds: ["test_a", "test_b"], invitedIds: pending, declinedIds: [], confirmedBy: ["test_a", "test_b"], readyBy: ["test_a", ...(memberReady ? ["test_b"] : [])], readyStateBy: { test_a: { ready: true }, test_b: { ready: memberReady } }, sessionId: null } }, sessions: {} };
}

function runtime(initial) {
  const local = new Map([[GLOBAL_KEY, JSON.stringify(initial)]],); const session = new Map([[USER_KEY, "test_a"]]);
  const captures = []; let writes = 0; let start = null; let modal = ""; let back = null;
  const appRoot = { set innerHTML(value) { start = String(value).includes("data-start-session") ? new Element({ startSession: "" }) : null; }, get innerHTML() { return ""; } };
  const modalRoot = { set innerHTML(value) { modal = String(value); back = modal ? new Element() : null; }, get innerHTML() { return modal; }, replaceChildren() { modal = ""; back = null; }, querySelector(selector) { return selector.includes("cancel") ? back : null; } };
  const document = { body: { classList: { add() {}, remove() {} } }, documentElement: { dataset: {} }, fonts: { ready: Promise.resolve() }, getElementById(id) { return id === "app" ? appRoot : id === "modal-root" ? modalRoot : { appendChild() {} }; }, querySelector(selector) { return selector === "[data-start-session]" ? start : modalRoot.querySelector(selector); }, querySelectorAll() { return []; }, createElement() { return new Element(); }, addEventListener(type, listener, capture) { if (type === "click" && capture === true) captures.push(listener); }, removeEventListener() {} };
  const context = vm.createContext({ window: {}, document, localStorage: { getItem(key) { return local.get(key) || null; }, setItem(key, value) { writes += 1; local.set(key, String(value)); } }, sessionStorage: { getItem(key) { return session.get(key) || null; } }, location: { hash: "#/party/p1" }, history: { pushState() {} }, navigator: {}, Element, Intl, Date, Math, JSON, String, Object, Array, Set, Map, Promise, structuredClone, setTimeout() { return 0; }, clearTimeout() {}, setInterval() { return 0; }, requestAnimationFrame(callback) { callback(); return 1; }, console });
  context.window = context; context.addEventListener = () => {}; context.dispatchEvent = () => true;
  vm.runInContext(fs.readFileSync("data/day1-data.js", "utf8"), context);
  vm.runInContext(runtimeUtils, context, { filename: "runtime-utils.js" });
  vm.runInContext(worldStore, context, { filename: "world-store.js" });
  vm.runInContext(domainRules, context, { filename: "runtime-domain-rules.js" });
  const footer = app.lastIndexOf("})();");
  vm.runInContext(`${app.slice(0, footer)}window.__CAPTURE_TEST__ = { renderParty };\n})();`, context, { filename: "app-capture-order.js" });
  vm.runInContext(ux, context, { filename: "party-flow-ux-capture.js" });
  context.window.__CAPTURE_TEST__.renderParty("p1");
  function dispatch(target) { let stopped = false; const event = { target, preventDefault() {}, stopImmediatePropagation() { stopped = true; } }; for (const listener of captures) { if (!stopped) listener(event); } if (!stopped) for (const listener of target.listeners.get("click") || []) listener({ target, currentTarget: target }); }
  return { start() { assert.ok(start); dispatch(start); }, back() { assert.ok(back); dispatch(back); }, modal: () => modal, writes: () => writes, snapshot: () => JSON.parse(local.get(GLOBAL_KEY)) };
}

for (const entry of [
  [{ memberReady: false }, "준비 중인 캐릭터가 있습니다", "탈퇴 후 조사 출발"],
  [{ pending: ["test_c"] }, "초대 중인 캐릭터가 있습니다", "초대 취소 후 조사 출발"],
  [{ pending: ["test_c"], memberReady: false }, "초대 및 준비 중인 캐릭터가 있습니다", "탈퇴·초대 취소 후 조사 출발"],
]) {
  const [options, heading, primary] = entry; const r = runtime(fixture(options)); r.start();
  assert.match(r.modal(), new RegExp(`<h2>${heading}</h2>`), "document capture must allow the app guard modal to render");
  assert.match(r.modal(), new RegExp(`>${primary}</button>`), "guard modal primary label must remain exact");
  assert.equal(r.writes(), 0, "blocked departure open must not write"); r.back(); assert.equal(r.writes(), 0, "blocked departure back must not write");
}
const direct = runtime(fixture()); direct.start();
assert.equal(direct.writes(), 1, "all-clear departure must reach the app target listener exactly once");
assert.equal(Object.keys(direct.snapshot().sessions).length, 1, "all-clear departure must create one briefing session");

console.log("PASS: document capture does not suppress guarded departure target binding");
