import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const USER_KEY = "baekji_city_mvp_current_user_v034";

function storage() {
  const values = new Map();
  let writes = 0;
  return {
    getItem(key) { return values.has(key) ? values.get(key) : null; },
    setItem(key, value) { writes += 1; values.set(key, String(value)); },
    removeItem(key) { values.delete(key); },
    writes() { return writes; },
    resetWrites() { writes = 0; },
  };
}

const localStorage = storage();
const sessionStorage = storage();
sessionStorage.setItem(USER_KEY, "test_a");

const composerListeners = new Map();
const composer = {
  value: "한글 조합 중인 입력",
  disabled: false,
  placeholder: "",
  selectionStart: 4,
  selectionEnd: 6,
  addEventListener(type, callback) {
    const callbacks = composerListeners.get(type) || [];
    callbacks.push(callback);
    composerListeners.set(type, callbacks);
  },
  dispatchEvent(event) {
    (composerListeners.get(event.type) || []).forEach((callback) => callback.call(this, event));
  },
  focus() {},
};
const sendButton = { disabled: false, textContent: "전송", addEventListener() {} };
const listeners = new Map();
function eventNode(extra = {}) {
  return {
    ...extra,
    addEventListener(type, callback) {
      const entries = listeners.get(this) || new Map();
      const callbacks = entries.get(type) || [];
      callbacks.push(callback);
      entries.set(type, callbacks);
      listeners.set(this, entries);
    },
    dispatchEvent(event) {
      (listeners.get(this)?.get(event.type) || []).forEach((callback) => callback.call(this, event));
    },
  };
}
const chatStream = {
  dataset: {},
  scrollHeight: 1000,
  scrollTop: 120,
  clientHeight: 400,
  isConnected: true,
  writes: 0,
  set innerHTML(value) { this.writes += 1; this._html = value; },
  get innerHTML() { return this._html || ""; },
};
const scene = { outerHTML: "", setAttribute() {} };
const systemPanel = { querySelector() { return null; }, innerHTML: "" };
const panelBody = { innerHTML: "" };
const enterInvestigationButton = eventNode({});
const retiredMapButtons = [];
let headerMapButton = eventNode({ dataset: { openMap: "sA" } });
const headerExtra = {
  writes: 0,
  set innerHTML(value) {
    this.writes += 1;
    this._html = value;
    retiredMapButtons.push(headerMapButton);
    headerMapButton = eventNode({ dataset: { openMap: "sA" } });
  },
  get innerHTML() { return this._html || ""; },
  querySelector(selector) { return selector === "[data-open-map]" ? headerMapButton : null; },
};
const panel = {
  querySelector(selector) { return selector === ".retro-tab-body" ? panelBody : null; },
  querySelectorAll() { return []; },
};
const root = {
  dataset: { sessionId: "sA" },
  querySelector(selector) {
    if (selector === "[data-investigation-scene]") return scene;
    if (selector === "[data-investigation-system]") return systemPanel;
    if (selector === "[data-investigation-panel]") return panel;
    return null;
  },
  querySelectorAll() { return []; },
};

const app = {
  writes: 0,
  set innerHTML(value) { this.writes += 1; this._html = value; },
  get innerHTML() { return this._html || ""; },
  querySelectorAll() { return []; },
};
const document = {
  body: { classList: { add() {}, remove() {} } },
  activeElement: composer,
  fonts: { ready: Promise.resolve() },
  getElementById(id) { return id === "app" ? app : { appendChild() {}, innerHTML: "" }; },
  createElement() { return { classList: { add() {}, remove() {} }, style: {}, dataset: {}, appendChild() {}, remove() {} }; },
  querySelector(selector) {
    if (selector === "[data-investigation-header-extra]") return headerExtra;
    if (selector === "[data-open-map]") return headerMapButton;
    if (selector === "[data-enter-investigation]") return enterInvestigationButton;
    if (selector === "[data-chat-stream]") return chatStream;
    if (selector === "[data-chat-input]") return composer;
    if (selector === "[data-send-chat]") return sendButton;
    if (selector === "[data-ai-status]") return null;
    return null;
  },
  querySelectorAll(selector) {
    if (selector === ".retro-investigation[data-session-id]") return [root];
    return [];
  },
};
const window = eventNode({});
const context = vm.createContext({
  window, document, localStorage, sessionStorage,
  location: { hash: "#/investigate/sA" },
  history: { pushState() {} },
  navigator: {},
  Intl, Date, Math, JSON, String, Object, Array, Set, Map, Promise,
  setTimeout, clearTimeout, setInterval: () => 0,
  requestAnimationFrame: (callback) => callback(),
  console,
});

vm.runInContext(fs.readFileSync(new URL("../data/day1-data.js", import.meta.url), "utf8"), context);
let source = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const footer = source.indexOf('  window.addEventListener("hashchange", render);');
assert.ok(footer > 0, "test harness must run before app startup rendering");
source = source.slice(0, footer) + '\n  window.addEventListener("storage", (event) => { if (event.key === GLOBAL_KEY) renderExternalUpdate(); });\n  window.addEventListener("pageshow", () => { if (routeParts()[0] === "investigate") renderExternalUpdate(); });\n  window.__TEST__ = { semanticStateEqual, investigationProjection, classifyExternalInvestigationUpdate, refreshMountedInvestigation, syncChoiceRevealUi, chatPanel, chatStreamMarkup, chatComposerPlaceholder, chatLogEntries, bindInvestigation, playerRouteProjection, consumeUnrelatedExternalRouteUpdate, renderExternalUpdate, render, mutate, setUiTab(value) { ui.tab = value; }, getUi() { return ui; }, setState(value) { state = value; localStorage.setItem(GLOBAL_KEY, JSON.stringify(value)); }, getState() { return state; } };\n})();';
vm.runInContext(source, context, { filename: "app.js" });
const api = window.__TEST__;

function world() {
  return {
    version: 3,
    characters: {
      test_a: { id: "test_a", contamination: 0, symptom: "stable", inventory: {} },
      test_b: { id: "test_b", contamination: 0, symptom: "stable", inventory: {} },
      test_c: { id: "test_c", contamination: 0, symptom: "stable", inventory: {} },
    },
    sessions: {
      sA: {
        id: "sA", status: "ACTIVE", variant: "a", memberIds: ["test_a"], partyId: "pA",
        currentNode: "E_ENTRY", currentDetailId: null, activeEncounter: null, movement: null,
        inspectedObjectIds: [], takenItemKeys: [], choiceReveal: null,
        logs: [{ id: "a-chat-1", type: "interaction", actorId: "test_a", scopeKey: "node:E_ENTRY", at: 100, text: "A" }],
      },
      sC: {
        id: "sC", status: "ACTIVE", variant: "a", memberIds: ["test_c"], partyId: "pC",
        currentNode: "E_ENTRY", currentDetailId: null, activeEncounter: null, movement: null,
        inspectedObjectIds: [], takenItemKeys: [], choiceReveal: null, logs: [],
      },
    },
    parties: {},
  };
}

const initial = world();
initial.sessions.sA.memberIds = ["test_a", "test_b"];
api.setState(initial);
api.bindInvestigation(initial.sessions.sA);
localStorage.resetWrites();

const charactersOnly = structuredClone(initial);
charactersOnly.characters.test_b.contamination = 55;
const unrelated = api.classifyExternalInvestigationUpdate(initial, charactersOnly, "sA", "test_a");
assert.equal(unrelated.kind, "unrelated", "other-character updates must not repaint the mounted investigation");
assert.equal(unrelated.surfaces.chat, false, "other-character updates must not touch chat");

localStorage.setItem(GLOBAL_KEY, JSON.stringify(charactersOnly));
assert.equal(api.refreshMountedInvestigation(), true, "unrelated remote update is consumed without a full render");
assert.equal(chatStream.writes, 0, "unrelated remote update must perform zero chat stream writes");
assert.equal(localStorage.writes(), 1, "remote refresh must never write the shared world back or start a ping-pong");

const sameState = structuredClone(charactersOnly);
const noPaint = api.classifyExternalInvestigationUpdate(charactersOnly, sameState, "sA", "test_a");
assert.equal(noPaint.surfaces.chat, false, "virtual current divider time must not create a false chat diff");

const chatUpdate = structuredClone(charactersOnly);
chatUpdate.sessions.sA.logs.push({ id: "a-chat-2", type: "interaction", actorId: "test_b", scopeKey: "node:E_ENTRY", at: 200, text: "B" });
const soloChat = structuredClone(charactersOnly);
soloChat.sessions.sC.logs.push({ id: "c-chat-1", type: "interaction", actorId: "test_c", scopeKey: "node:E_ENTRY", at: 150, text: "C" });
const soloUpdateForParty = api.classifyExternalInvestigationUpdate(charactersOnly, soloChat, "sA", "test_a");
assert.equal(soloUpdateForParty.surfaces.chat, false, "solo C chat must not repaint the two-person A/B party chat");
const partyChatForSolo = api.classifyExternalInvestigationUpdate(charactersOnly, chatUpdate, "sC", "test_c");
assert.equal(partyChatForSolo.surfaces.chat, false, "A/B chat must not repaint solo C when C's own persisted chat is unchanged");

const chatClassification = api.classifyExternalInvestigationUpdate(charactersOnly, chatUpdate, "sA", "test_a");
assert.equal(chatClassification.kind, "selective");
assert.equal(chatClassification.surfaces.chat, true, "same-session chat updates must refresh only the chat surface");

localStorage.setItem(GLOBAL_KEY, JSON.stringify(chatUpdate));
assert.equal(api.refreshMountedInvestigation(), true);
assert.equal(chatStream.writes, 1, "same-session chat update must write the chat stream once");
assert.equal(document.activeElement, composer, "chat refresh must preserve focused composer identity");
assert.equal(composer.value, "한글 조합 중인 입력");
assert.equal(composer.selectionStart, 4);
assert.equal(composer.selectionEnd, 6);
assert.equal(chatStream.scrollTop, 120, "a non-bottom chat reader keeps their scroll position");

const storageChat = structuredClone(chatUpdate);
storageChat.sessions.sA.logs.push({ id: "a-chat-storage", type: "interaction", actorId: "test_a", scopeKey: "node:E_ENTRY", at: 250, text: "storage" });
localStorage.setItem(GLOBAL_KEY, JSON.stringify(storageChat));
const storageWritesBefore = chatStream.writes;
window.dispatchEvent({ type: "storage", key: GLOBAL_KEY });
assert.equal(chatStream.writes, storageWritesBefore + 1, "real storage ingress must selectively refresh mounted chat");
assert.equal(document.activeElement, composer);

const pageshowWritesBefore = chatStream.writes;
window.dispatchEvent({ type: "pageshow" });
assert.equal(chatStream.writes, pageshowWritesBefore, "pageshow ingress must consume unchanged state without repaint");

composer.dispatchEvent({ type: "compositionstart" });
const imeUpdate = structuredClone(storageChat);
imeUpdate.sessions.sA.logs.push({ id: "a-chat-ime", type: "interaction", actorId: "test_b", scopeKey: "node:E_ENTRY", at: 260, text: "IME" });
localStorage.setItem(GLOBAL_KEY, JSON.stringify(imeUpdate));
window.dispatchEvent({ type: "storage", key: GLOBAL_KEY });
assert.equal(api.getUi().pendingExternalRender, true, "storage during IME must defer the selective refresh");
assert.equal(chatStream.writes, pageshowWritesBefore, "IME deferral must keep DOM stable until composition ends");
composer.dispatchEvent({ type: "compositionend", target: composer });
assert.equal(api.getUi().pendingExternalRender, false);
assert.equal(chatStream.writes, pageshowWritesBefore + 1, "compositionend must flush one deferred remote chat update");
assert.equal(document.activeElement, composer);

const movement = structuredClone(imeUpdate);
movement.sessions.sA.movement = { token: "move-1", routeId: "E_R001", fromNode: "E_ENTRY", targetNode: "E_G_PLAZA", startedAt: 300, resolveAt: 2100 };
localStorage.setItem(GLOBAL_KEY, JSON.stringify(movement));
assert.equal(api.refreshMountedInvestigation(), true, "movement start must use the selective refresh path");
assert.equal(document.activeElement, composer, "movement refresh must not replace the composer");
assert.equal(composer.value, "한글 조합 중인 입력");
assert.equal(composer.disabled, true, "movement can disable the existing composer in place");

const soloDuringMove = structuredClone(movement);
soloDuringMove.sessions.sC.logs.push({ id: "c-during-move", type: "interaction", actorId: "test_c", scopeKey: "node:E_ENTRY", at: 350, text: "C during" });
assert.equal(api.classifyExternalInvestigationUpdate(movement, soloDuringMove, "sA", "test_a").surfaces.chat, false, "solo C traffic during A/B movement must not churn A/B chat");

chatStream.scrollTop = 600;
const arrival = structuredClone(movement);
arrival.sessions.sA.movement = null;
arrival.sessions.sA.currentNode = "E_G_PLAZA";
arrival.sessions.sA.logs.push({ id: "a-arrive", type: "scene", actorId: null, at: 2200, text: "arrived" });
localStorage.setItem(GLOBAL_KEY, JSON.stringify(arrival));
assert.equal(api.refreshMountedInvestigation(), true, "movement completion must use the selective refresh path");
assert.equal(document.activeElement, composer, "movement completion must preserve composer identity");
assert.equal(composer.disabled, false);
assert.equal(chatStream.scrollTop, chatStream.scrollHeight, "bottom-following chat stays at the latest entry after a selective update");

const soloAfterMove = structuredClone(arrival);
soloAfterMove.sessions.sC.logs.push({ id: "c-after-move", type: "interaction", actorId: "test_c", scopeKey: "node:E_ENTRY", at: 2300, text: "C after" });
assert.equal(api.classifyExternalInvestigationUpdate(arrival, soloAfterMove, "sA", "test_a").surfaces.chat, false, "solo C traffic after A/B movement must not churn A/B chat");

const choiceReveal = structuredClone(arrival);
choiceReveal.sessions.sA.choiceReveal = { type: "context", at: 2400 };
localStorage.setItem(GLOBAL_KEY, JSON.stringify(choiceReveal));
assert.equal(api.refreshMountedInvestigation(), true);
assert.equal(api.getUi().choicePanelOpen, true, "partial refresh must apply the same choiceReveal UI state as initial render");
const choiceCleared = structuredClone(choiceReveal);
choiceCleared.sessions.sA.choiceReveal = null;
localStorage.setItem(GLOBAL_KEY, JSON.stringify(choiceCleared));
assert.equal(api.refreshMountedInvestigation(), true);
assert.equal(api.getUi().choicePanelOpen, false);

const emptyChatSession = { ...choiceCleared.sessions.sA, logs: [] };
const emptyChatPanel = api.chatPanel(emptyChatSession, choiceCleared.characters.test_a, null);
assert.ok(emptyChatPanel.includes(api.chatStreamMarkup(api.chatLogEntries(emptyChatSession))), "initial and selective empty-chat/scope markup must share one renderer");
assert.equal(composer.placeholder, api.chatComposerPlaceholder(choiceCleared.sessions.sA, null), "selective composer copy must match initial composer contract");

const unsafeId = 's"]\\:has(*)';
root.dataset.sessionId = unsafeId;
context.location.hash = `#/investigate/${unsafeId}`;
const unsafeWorld = structuredClone(choiceCleared);
unsafeWorld.sessions[unsafeId] = { ...unsafeWorld.sessions.sA, id: unsafeId };
delete unsafeWorld.sessions.sA;
api.setState(unsafeWorld);
assert.equal(api.refreshMountedInvestigation(), true, "opaque session ids must be matched through dataset equality, not interpolated CSS selectors");
root.dataset.sessionId = "sA";
context.location.hash = "#/investigate/sA";
api.setState(choiceCleared);

const writesBeforeRepeat = chatStream.writes;
assert.equal(api.refreshMountedInvestigation(), true, "pageshow/storage-style repeat is consumed as a no-paint update");
assert.equal(chatStream.writes, writesBeforeRepeat, "repeated unchanged remote state must not rewrite chat or loop");

function party(id, memberIds, invitedIds = []) {
  return {
    id, name: id, creatorId: memberIds[0], status: "RECRUITING",
    memberIds, invitedIds, declinedIds: [], confirmedBy: [], readyBy: [], sessionId: null,
  };
}

const homeBase = structuredClone(choiceCleared);
sessionStorage.setItem(USER_KEY, "test_b");
homeBase.parties.pA = party("pA", ["test_a", "test_b"]);
homeBase.characters.test_b.currentPartyId = "pA";
homeBase.characters.test_b.currentSessionId = "sA";
homeBase.sessions.sA.partyId = "pA";
context.location.hash = "#/home";
api.setState(homeBase);
app.writes = 0;

const homeUnrelated = structuredClone(homeBase);
homeUnrelated.sessions.sA.logs.push({ id: "a-home", type: "interaction", actorId: "test_a", scopeKey: "node:E_G_PLAZA", at: 2990, text: "unrelated A" });
homeUnrelated.sessions.sC.logs.push({ id: "c-home", type: "interaction", actorId: "test_c", scopeKey: "node:E_ENTRY", at: 3000, text: "unrelated" });
localStorage.setItem(GLOBAL_KEY, JSON.stringify(homeUnrelated));
window.dispatchEvent({ type: "storage", key: GLOBAL_KEY });
assert.equal(app.writes, 0, "A/C unrelated world chat must not repaint B's home route");

const homeInvite = structuredClone(homeUnrelated);
homeInvite.parties.pInvite = party("pInvite", ["test_c"], ["test_b"]);
localStorage.setItem(GLOBAL_KEY, JSON.stringify(homeInvite));
window.dispatchEvent({ type: "storage", key: GLOBAL_KEY });
assert.equal(app.writes, 1, "a relevant home invitation must trigger exactly one full route render");

context.location.hash = "#/party/pA";
api.setState(homeInvite);
app.writes = 0;
const partyUnrelated = structuredClone(homeInvite);
partyUnrelated.sessions.sC.logs.push({ id: "c-party", type: "interaction", actorId: "test_c", scopeKey: "node:E_ENTRY", at: 3010, text: "unrelated party" });
localStorage.setItem(GLOBAL_KEY, JSON.stringify(partyUnrelated));
window.dispatchEvent({ type: "storage", key: GLOBAL_KEY });
assert.equal(app.writes, 0, "unrelated session chat must not repaint the current party route");
const partyReady = structuredClone(partyUnrelated);
partyReady.parties.pA.readyBy.push("test_a");
localStorage.setItem(GLOBAL_KEY, JSON.stringify(partyReady));
window.dispatchEvent({ type: "storage", key: GLOBAL_KEY });
assert.equal(app.writes, 1, "current party readiness must trigger exactly one full party render");

context.location.hash = "#/briefing/sA";
const briefingBase = structuredClone(partyReady);
briefingBase.sessions.sA.status = "BRIEFING";
api.setState(briefingBase);
app.writes = 0;
const briefingUnrelated = structuredClone(briefingBase);
briefingUnrelated.sessions.sC.logs.push({ id: "c-brief", type: "interaction", actorId: "test_c", scopeKey: "node:E_ENTRY", at: 3020, text: "unrelated brief" });
localStorage.setItem(GLOBAL_KEY, JSON.stringify(briefingUnrelated));
window.dispatchEvent({ type: "storage", key: GLOBAL_KEY });
assert.equal(app.writes, 0, "unrelated world chat must not repaint briefing");
const briefingRelevant = structuredClone(briefingUnrelated);
briefingRelevant.sessions.sA.variant = "b";
localStorage.setItem(GLOBAL_KEY, JSON.stringify(briefingRelevant));
window.dispatchEvent({ type: "storage", key: GLOBAL_KEY });
assert.equal(app.writes, 1, "relevant briefing variant change must trigger exactly one full render");

const localMutationBase = structuredClone(homeBase);
context.location.hash = "#/home";
api.setState(localMutationBase);
const storageWritesBeforeLocalMutation = localStorage.writes();
api.mutate("local-test", (draft) => { draft.characters.test_b.contamination = 12; });
assert.equal(localStorage.writes(), storageWritesBeforeLocalMutation + 1, "local mutate must keep its normal single shared-world write");
assert.equal(api.getState().characters.test_b.contamination, 12, "local mutate semantics must remain unchanged by external gating");

api.setUiTab("inventory");
const inventoryBase = structuredClone(choiceCleared);
const inventoryOwnChange = structuredClone(inventoryBase);
inventoryOwnChange.characters.test_a.inventory.tool = { itemId: "tool", name: "tool", quantity: 1, state: "CLEAN" };
assert.equal(api.classifyExternalInvestigationUpdate(inventoryBase, inventoryOwnChange, "sA", "test_a").surfaces.panel, true, "inventory tab must refresh for the current character inventory");
const inventoryUnrelated = structuredClone(inventoryBase);
inventoryUnrelated.sessions.sC.logs.push({ id: "c-inventory", type: "interaction", actorId: "test_c", at: 4000, text: "unrelated" });
assert.equal(api.classifyExternalInvestigationUpdate(inventoryBase, inventoryUnrelated, "sA", "test_a").surfaces.panel, false, "inventory tab must ignore unrelated session logs");

api.setUiTab("status");
const statusOwnChange = structuredClone(inventoryBase);
statusOwnChange.characters.test_a.contamination = 33;
assert.equal(api.classifyExternalInvestigationUpdate(inventoryBase, statusOwnChange, "sA", "test_a").surfaces.panel, true, "status tab must refresh for current character status");
assert.equal(api.classifyExternalInvestigationUpdate(inventoryBase, inventoryUnrelated, "sA", "test_a").surfaces.panel, false, "status tab must ignore unrelated session logs");

api.setUiTab("record");
const recordInspect = structuredClone(inventoryBase);
recordInspect.sessions.sA.inspectedObjectIds.push("E_OBJ_001");
assert.equal(api.classifyExternalInvestigationUpdate(inventoryBase, recordInspect, "sA", "test_a").surfaces.panel, true, "record tab must refresh when inspected results change");
const recordLogOnly = structuredClone(inventoryBase);
recordLogOnly.sessions.sA.logs.push({ id: "system-record", type: "scene", actorId: null, at: 4010, text: "system" });
assert.equal(api.classifyExternalInvestigationUpdate(inventoryBase, recordLogOnly, "sA", "test_a").surfaces.panel, false, "record tab must not rerender for logs it does not display");
api.setUiTab("chat");

assert.ok(retiredMapButtons.length >= 1, "movement/header changes must replace the header button with its DOM subtree");
for (const button of retiredMapButtons) {
  assert.ok((listeners.get(button)?.get("click") || []).length <= 1, "retired map buttons must never accumulate duplicate listeners");
}
assert.equal((listeners.get(headerMapButton)?.get("click") || []).length, 1, "the current map button must have exactly one listener");

console.log("PASS: external world sync selectively refreshes investigation surfaces without composer replacement, false chat diffs, or write ping-pong");
