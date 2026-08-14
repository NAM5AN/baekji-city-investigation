import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const app = fs.readFileSync("app.js", "utf8");
const runtimeUtils = fs.readFileSync("runtime-utils.js", "utf8");
const ux = fs.readFileSync("party-flow-ux-fix.js", "utf8");
const preflight = fs.readFileSync("party-preflight-flow-fix.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");

const renderStart = app.indexOf("  function renderParty(partyId)");
const renderEnd = app.indexOf("  function inviteUser(", renderStart);
assert.ok(renderStart >= 0 && renderEnd > renderStart, "party direct renderer must be discoverable");
const renderParty = app.slice(renderStart, renderEnd);

assert.match(renderParty, /\["조원 구성", "구성 확정", "세션 생성"\]/, "new party flow must render exactly three steps");
assert.doesNotMatch(renderParty, /\["조원 구성", "구성 확정", "전원 준비", "세션 생성"\]|data-party-preflight-back-confirmed/, "new composition-confirmed flow must not expose a separate ready step or back button");
assert.match(renderParty, /readyStage[\s\S]*?party-ready-count/, "confirmed state must retain direct ready counts through the legacy-compatible ready-stage projection");
assert.match(renderParty, /isCreator && readyStage[\s\S]*?data-start-session/, "the confirmed-stage leader must retain departure control so in-site guards can resolve pending or unready blockers");
assert.match(renderParty, /readyStage && !isCreator[\s\S]*?data-ready/, "only members retain the collapsed-flow ready action");
assert.match(renderParty, /pendingInviteIds\.map\(\(memberId\) => pendingInviteRow/, "pending invitations must remain visible in confirmed state");
assert.match(app, /startSessionState/, "atomic confirmed-departure reducer must be exposed through the pending-invite test seam");
assert.doesNotMatch(ux, /party\.status = "READY_CHECK"/, "UX runtime must not transition a new party into READY_CHECK");
assert.doesNotMatch(preflight, /party\.status = "READY_CHECK"/, "preflight runtime must not transition a new party into READY_CHECK");
assert.doesNotMatch(ux, /window\.alert/, "party readiness must not use browser alerts");
assert.match(index, /app\.js\?v=0\.4\.7[^"']*party-confirmed-ready-collapse=1[^"']*departure-guards=1[^"']*stage3a=1/, "app cache key must identify the collapsed confirmed-ready, guarded-departure, and Stage 3-A utility flow");

const apiEnd = app.indexOf("  function renderParty(partyId)");
const helperSource = `${app.slice(0, apiEnd)}\n})();`;
const sandbox = { window: {}, console, structuredClone, document: { getElementById() { return null; } }, localStorage: { getItem() { return null; } }, DAY1_DATA: { meta: { startNode: "E_ENTRY" } } };
 sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(runtimeUtils, sandbox, { filename: "runtime-utils.js" });
vm.runInContext(helperSource, sandbox, { filename: "app-confirmed-ready-helpers.js" });
const api = sandbox.window.__BAEKJI_PENDING_PARTY_INVITES_TEST__;
assert.ok(api, "confirmed-ready atomic reducer API must be exposed");

const base = {
  version: 3,
  parties: { p1: { id: "p1", creatorId: "leader", status: "COMPOSITION_CONFIRMED", memberIds: ["leader", "member"], invitedIds: ["invitee"], confirmedBy: ["leader", "member"], readyBy: ["leader", "member"], readyStateBy: { leader: { ready: true }, member: { ready: true } }, sessionId: null } },
  characters: { leader: { currentPartyId: "p1", currentSessionId: null }, member: { currentPartyId: "p1", currentSessionId: null }, invitee: { currentPartyId: null, currentSessionId: null } }, sessions: {}, sessionSeq: 0,
};
assert.equal(typeof api.startSessionState, "function", "atomic start reducer must be executable");
const started = api.startSessionState(base, "p1", "leader", "s1", 1000, "a", false);
assert.equal(started.ok, false, "pending invitations must require the in-site departure confirmation rather than direct session creation");
assert.deepEqual(Array.from(started.pendingIds), ["invitee"]);
const confirmed = api.startSessionState(base, "p1", "leader", "s1", 1001, "a", true);
assert.equal(confirmed.ok, true, "confirmed pending departure must atomically create the session");
assert.equal(confirmed.snapshot.parties.p1.status, "SESSION_CREATED");
assert.deepEqual(Array.from(confirmed.snapshot.parties.p1.invitedIds), []);
assert.equal(confirmed.snapshot.sessions.s1.status, "BRIEFING");
assert.deepEqual(Array.from(confirmed.snapshot.sessions.s1.memberIds), ["leader", "member"]);
assert.equal(confirmed.snapshot.characters.invitee.currentSessionId, null);

const legacyLeaderUnready = structuredClone(base);
legacyLeaderUnready.parties.p1.invitedIds = [];
legacyLeaderUnready.parties.p1.readyBy = ["member"];
legacyLeaderUnready.parties.p1.readyStateBy = { leader: { ready: false }, member: { ready: true } };
const legacyStarted = api.startSessionState(legacyLeaderUnready, "p1", "leader", "s-legacy", 1002, "a", false);
assert.equal(legacyStarted.ok, true, "legacy confirmed snapshots must treat the hidden leader ready state as ready so a prepared member cannot deadlock departure");

// The reducer above proves the state transition.  This harness additionally
// drives the actual app renderer's bound `data-start-session` click through
// the pending-departure modal.  It deliberately does not call the reducer
// directly: duplicate runtime listeners have caused this boundary to regress
// before.
const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const USER_KEY = "baekji_city_mvp_current_user_v034";

class RuntimeElement {
  constructor(dataset = {}) {
    this.dataset = dataset;
    this.listeners = new Map();
    this.focused = false;
  }
  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }
  click() {
    const event = {
      target: this,
      currentTarget: this,
      preventDefault() {},
      stopImmediatePropagation() {},
    };
    (this.listeners.get("click") || []).forEach((listener) => listener(event));
  }
  focus() { this.focused = true; }
  remove() {}
}

function appRuntime(initialState, userId = "test_a") {
  const local = new Map([[GLOBAL_KEY, JSON.stringify(initialState)]]);
  const session = new Map([[USER_KEY, userId]]);
  let writes = 0;
  let alertCount = 0;
  let confirmCount = 0;
  let modalBuilds = 0;
  let startButton = null;
  let modalElements = {};
  let lastConfirm = null;

  const appRoot = {
    _html: "",
    set innerHTML(value) {
      this._html = String(value);
      startButton = this._html.includes("data-start-session") ? new RuntimeElement() : null;
    },
    get innerHTML() { return this._html; },
  };
  const toasts = [];
  const toastRoot = { appendChild(element) { toasts.push(element); } };
  const modalRoot = {
    _html: "",
    get childElementCount() { return this._html ? 1 : 0; },
    get children() { return this._html ? [{}] : []; },
    set innerHTML(value) {
      this._html = String(value);
      modalElements = {};
      if (!this._html.includes("data-party-start-pending-modal") && !this._html.includes("data-party-departure-modal")) return;
      modalBuilds += 1;
      modalElements.modal = new RuntimeElement();
      modalElements.cancel = new RuntimeElement();
      const partyId = this._html.match(/data-party-(?:start-pending|departure)-confirm="([^"]+)"/)?.[1] || "";
      modalElements.confirm = new RuntimeElement({ partyStartPendingConfirm: partyId, partyDepartureConfirm: partyId });
      lastConfirm = modalElements.confirm;
    },
    get innerHTML() { return this._html; },
    replaceChildren() { this._html = ""; modalElements = {}; },
    querySelector(selector) {
      if (selector === "[data-party-start-pending-modal]" || selector === "[data-party-departure-modal]") return modalElements.modal || null;
      if (selector === "[data-party-start-pending-cancel]" || selector === "[data-party-departure-cancel]") return modalElements.cancel || null;
      if (selector === "[data-party-start-pending-confirm]" || selector === "[data-party-departure-confirm]") return modalElements.confirm || null;
      return null;
    },
  };
  const document = {
    body: { classList: { add() {}, remove() {} } },
    documentElement: { dataset: {} },
    getElementById(id) { return id === "app" ? appRoot : id === "modal-root" ? modalRoot : id === "toast-root" ? toastRoot : null; },
    createElement() { return new RuntimeElement(); },
    querySelector(selector) {
      if (selector === "[data-start-session]") return startButton;
      return modalRoot.querySelector(selector);
    },
    querySelectorAll() { return []; },
  };
  const window = {};
  const context = vm.createContext({
    window, document, localStorage: {
      getItem(key) { return local.has(key) ? local.get(key) : null; },
      setItem(key, value) { writes += 1; local.set(key, String(value)); },
    },
    sessionStorage: {
      getItem(key) { return session.has(key) ? session.get(key) : null; },
      setItem(key, value) { session.set(key, String(value)); },
    },
    location: { hash: "#/party/p1" }, history: { pushState() {} }, navigator: {},
    Intl, Date, Math, JSON, String, Object, Array, Set, Map, Promise, structuredClone,
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, requestAnimationFrame(callback) { callback(); return 1; },
    console,
  });
  context.window = context;
  context.alert = () => { alertCount += 1; };
  context.confirm = () => { confirmCount += 1; return true; };
  vm.runInContext(fs.readFileSync(new URL("../data/day1-data.js", import.meta.url), "utf8"), context);
  vm.runInContext(runtimeUtils, context, { filename: "runtime-utils.js" });
  let fullApp = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
  const footer = fullApp.indexOf('  window.addEventListener("hashchange", render);');
  assert.ok(footer > 0, "app VM must stop before browser startup listeners");
  fullApp = `${fullApp.slice(0, footer)}\n  window.__PARTY_RUNTIME_TEST__ = { renderParty, startSession, effectivePartyReady };\n})();`;
  vm.runInContext(fullApp, context, { filename: "app-party-confirmed-ready-runtime.js" });
  const api = context.window.__PARTY_RUNTIME_TEST__;
  return {
    render() { api.renderParty("p1"); },
    start() { api.startSession("p1"); },
    clickStart() { assert.ok(startButton, "the current party render must bind a start button"); startButton.click(); },
    clickCancel() { assert.ok(modalElements.cancel, "pending modal must bind a cancel button"); modalElements.cancel.click(); },
    clickConfirm() { assert.ok(modalElements.confirm || lastConfirm, "pending modal must bind a confirm button"); (modalElements.confirm || lastConfirm).click(); },
    replaceState(snapshot) { local.set(GLOBAL_KEY, JSON.stringify(snapshot)); },
    snapshot() { return JSON.parse(local.get(GLOBAL_KEY)); },
    writes: () => writes,
    alerts: () => alertCount,
    confirms: () => confirmCount,
    toasts: () => toasts.length,
    modalBuilds: () => modalBuilds,
    modalOpen: () => Boolean(modalRoot.childElementCount),
    hasStartButton: () => Boolean(startButton),
    markup: () => appRoot.innerHTML,
  };
}

function runtimeFixture({ pending = ["test_c"], status = "COMPOSITION_CONFIRMED", memberReady = true, leaderReady = true } = {}) {
  return {
    version: 3,
    sessionSeq: 0,
    characters: {
      test_a: { id: "test_a", currentPartyId: "p1", currentSessionId: null, inventory: {}, contamination: 0, symptom: "stable" },
      test_b: { id: "test_b", currentPartyId: "p1", currentSessionId: null, inventory: {}, contamination: 0, symptom: "stable" },
      test_c: { id: "test_c", currentPartyId: null, currentSessionId: null, inventory: {}, contamination: 0, symptom: "stable" },
    },
    parties: {
      p1: {
        id: "p1", name: "runtime party", creatorId: "test_a", status,
        memberIds: ["test_a", "test_b"], invitedIds: pending, declinedIds: [],
        confirmedBy: ["test_a", "test_b"], readyBy: ["test_a", ...(memberReady ? ["test_b"] : [])],
        readyStateBy: { test_a: { ready: leaderReady }, test_b: { ready: memberReady } }, sessionId: null,
      },
    },
    sessions: {},
  };
}

const pendingRuntime = appRuntime(runtimeFixture());
pendingRuntime.render();
pendingRuntime.clickStart();
pendingRuntime.clickStart();
assert.equal(pendingRuntime.modalBuilds(), 1, "pending all-ready leader start must open exactly one in-site modal");
assert.equal(pendingRuntime.writes(), 0, "opening the pending-departure modal must not write shared state");
assert.equal(pendingRuntime.alerts(), 0, "pending departure must not use window.alert");
assert.equal(pendingRuntime.confirms(), 0, "pending departure must not use window.confirm");
const beforeCancel = pendingRuntime.snapshot();
pendingRuntime.clickCancel();
assert.equal(pendingRuntime.modalOpen(), false, "modal cancel must close the in-site dialog");
assert.equal(pendingRuntime.writes(), 0, "modal cancel must not write shared state");
assert.deepEqual(pendingRuntime.snapshot(), beforeCancel, "modal cancel must leave invitations and readiness unchanged");

pendingRuntime.clickStart();
pendingRuntime.clickConfirm();
pendingRuntime.clickConfirm(); // retained listener models a competing capture/runtime callback.
const pendingStarted = pendingRuntime.snapshot();
assert.equal(pendingRuntime.writes(), 1, "pending confirmation must commit exactly one global write even with a competing repeat handler");
assert.deepEqual(pendingStarted.parties.p1.invitedIds, [], "confirmed departure must cancel pending invitations atomically");
assert.equal(pendingStarted.parties.p1.status, "SESSION_CREATED");
const pendingSession = pendingStarted.sessions[pendingStarted.parties.p1.sessionId];
assert.equal(pendingSession?.status, "BRIEFING");
assert.deepEqual(pendingSession?.memberIds, ["test_a", "test_b"], "an invited non-member must never leak into the departing session");
assert.equal(pendingStarted.characters.test_c.currentSessionId, null);

const directRuntime = appRuntime(runtimeFixture({ pending: [] }));
directRuntime.render();
directRuntime.clickStart();
assert.equal(directRuntime.modalBuilds(), 0, "zero pending invitations must start directly without a modal");
assert.equal(directRuntime.writes(), 1, "zero-pending departure must produce exactly one global write");
assert.equal(directRuntime.snapshot().parties.p1.status, "SESSION_CREATED");

const raceRuntime = appRuntime(runtimeFixture());
raceRuntime.render();
raceRuntime.clickStart();
const acceptedWhileOpen = raceRuntime.snapshot();
acceptedWhileOpen.parties.p1.memberIds.push("test_c");
acceptedWhileOpen.parties.p1.invitedIds = [];
acceptedWhileOpen.parties.p1.confirmedBy.push("test_c");
acceptedWhileOpen.parties.p1.readyStateBy.test_c = { ready: false };
acceptedWhileOpen.characters.test_c.currentPartyId = "p1";
raceRuntime.replaceState(acceptedWhileOpen);
raceRuntime.clickConfirm();
const raceAfterConfirm = raceRuntime.snapshot();
assert.equal(raceRuntime.writes(), 0, "an invite accepted while the modal is open must abort stale confirmation without a write");
assert.equal(Object.keys(raceAfterConfirm.sessions).length, 0, "stale pending confirmation must not create a session");
assert.deepEqual(raceAfterConfirm.parties.p1.invitedIds, [], "stale confirmation must not lose latest invitation data");
assert.ok(raceAfterConfirm.parties.p1.memberIds.includes("test_c"));
assert.equal(raceAfterConfirm.parties.p1.readyStateBy.test_c.ready, false);

// Keep the cardinality unchanged: a count-only confirmation guard would
// incorrectly cancel the newly-added invitation here.
const replacementRuntime = appRuntime(runtimeFixture({ pending: ["test_c"] }));
replacementRuntime.render();
replacementRuntime.clickStart();
const replacementWhileOpen = replacementRuntime.snapshot();
replacementWhileOpen.parties.p1.invitedIds = ["replacement_pending_b"];
replacementRuntime.replaceState(replacementWhileOpen);
replacementRuntime.clickConfirm();
const replacementAfterConfirm = replacementRuntime.snapshot();
assert.equal(replacementRuntime.writes(), 0, "same-count pending replacement must abort instead of cancelling a different invitee");
assert.equal(Object.keys(replacementAfterConfirm.sessions).length, 0, "same-count pending replacement must not create a session");
assert.deepEqual(replacementAfterConfirm.parties.p1.invitedIds, ["replacement_pending_b"], "the latest replacement invitation must be preserved exactly");
assert.equal(replacementRuntime.toasts(), 1, "stale pending replacement must surface the in-site abort toast");
assert.equal(replacementRuntime.alerts(), 0, "stale pending replacement must not fall back to window.alert");
assert.equal(replacementRuntime.confirms(), 0, "stale pending replacement must not fall back to window.confirm");

const unreadyMemberRuntime = appRuntime(runtimeFixture({ pending: ["test_c"], memberReady: false }));
unreadyMemberRuntime.render();
assert.equal(unreadyMemberRuntime.hasStartButton(), true, "the leader must retain departure control when a member is unready so the guard can offer atomic removal");
unreadyMemberRuntime.start();
assert.equal(unreadyMemberRuntime.modalBuilds(), 1);
assert.equal(unreadyMemberRuntime.writes(), 0);

const unreadyLeaderRuntime = appRuntime(runtimeFixture({ pending: ["test_c"], status: "RECRUITING", leaderReady: false }));
unreadyLeaderRuntime.render();
assert.equal(unreadyLeaderRuntime.hasStartButton(), false, "an unready pre-confirmation leader must not receive a departure control");
unreadyLeaderRuntime.start();
assert.equal(unreadyLeaderRuntime.modalBuilds(), 0);
assert.equal(unreadyLeaderRuntime.writes(), 0);

const legacyRuntime = appRuntime(runtimeFixture({ pending: ["test_c"], status: "READY_CHECK", leaderReady: false }));
legacyRuntime.render();
assert.match(legacyRuntime.markup(), /1\.[\s\S]*2\.[\s\S]*3\./, "legacy READY_CHECK must render as the collapsed three-step flow");
assert.equal(legacyRuntime.hasStartButton(), true, "legacy READY_CHECK must treat the leader as effectively ready");
legacyRuntime.clickStart();
assert.equal(legacyRuntime.modalBuilds(), 1, "legacy READY_CHECK must use the same pending-departure modal path");

console.log("PASS: composition confirmation owns readiness and pending-invite departure atomically");
