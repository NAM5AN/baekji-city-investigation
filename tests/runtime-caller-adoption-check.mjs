import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const runtimeUtils = fs.readFileSync(new URL("../runtime-utils.js", import.meta.url), "utf8");
const worldPersistence = fs.readFileSync(new URL("../world-persistence.js", import.meta.url), "utf8");
const domainRules = fs.readFileSync(new URL("../runtime-domain-rules.js", import.meta.url), "utf8");
const worldStore = fs.readFileSync(new URL("../world-store.js", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const itemTransfer = fs.readFileSync(new URL("../item-transfer-core.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.doesNotMatch(app, /function clonePartyInviteSnapshot\(/, "party invite reducers must use Stage 3-A clone directly instead of keeping a local wrapper");
assert.match(app, /const \{[^}]*\bclone\b[^}]*\} = window\.__BAEKJI_RUNTIME_UTILS__/, "app must destructure the shared clone utility");
assert.match(app, /const draft = clone\(snapshot\);/, "party invite reducers must call shared clone directly");
assert.doesNotMatch(itemTransfer, /(?:const|function)\s+scope\s*=/, "item transfer must not retain a local spatial-scope definition");
assert.match(itemTransfer, /const \{\s*spatialScopeKey:\s*scope\s*\} = window\.__BAEKJI_DOMAIN_RULES__;/, "item transfer must alias the shared spatial scope key directly");

function appApi(withStructuredClone) {
  const apiEnd = app.indexOf("  function renderParty(partyId)");
  assert.ok(apiEnd > 0, "party invite reducer seam must precede the renderer");
  const sandbox = {
    window: {}, console, JSON, Set, Object, String, Math, Array,
    document: { getElementById() { return null; } },
    localStorage: { getItem() { return null; } },
    DAY1_DATA: { meta: { startNode: "E_ENTRY" } },
  };
  if (withStructuredClone) sandbox.structuredClone = structuredClone;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(runtimeUtils, sandbox, { filename: "runtime-utils.js" });
  sandbox.localStorage = { getItem() { return null; }, setItem() {} };
  vm.runInContext(worldPersistence, sandbox, { filename: "world-persistence.js" });
  vm.runInContext(worldStore, sandbox, { filename: "world-store.js" });
  vm.runInContext(domainRules, sandbox, { filename: "runtime-domain-rules.js" });
  vm.runInContext(`${app.slice(0, apiEnd)}\n})();`, sandbox, { filename: "app-party-clone-adoption.js" });
  return sandbox.window.__BAEKJI_PENDING_PARTY_INVITES_TEST__;
}

function inviteFixture() {
  return {
    version: 3, sessionSeq: 0, sessions: {},
    characters: {
      leader: { currentPartyId: "p1", currentSessionId: null, profile: { untouched: true } },
      member: { currentPartyId: "p1", currentSessionId: null },
      invitee: { currentPartyId: null, currentSessionId: null, inventory: { token: { quantity: 1 } } },
    },
    parties: {
      p1: { id: "p1", creatorId: "leader", status: "RECRUITING", memberIds: ["leader", "member"], invitedIds: [], declinedIds: [], confirmedBy: [], readyBy: [], readyStateBy: {}, sessionId: null },
    },
  };
}

for (const withStructuredClone of [true, false]) {
  const api = appApi(withStructuredClone);
  assert.equal(typeof api?.inviteState, "function", "party invite reducer seam must remain runnable");
  const source = inviteFixture();
  const before = JSON.stringify(source);
  const invited = api.inviteState(source, "p1", "invitee", "leader", 1000);
  assert.equal(JSON.stringify(source), before, "invite reducer must not mutate its input snapshot");
  assert.deepEqual(Array.from(invited.parties.p1.invitedIds), ["invitee"], "invite reducer output must preserve pending-invite behavior");
  invited.characters.invitee.inventory.token.quantity = 9;
  assert.equal(source.characters.invitee.inventory.token.quantity, 1, "clone output must not retain nested references to input state");
  const cancelled = api.cancelInviteState(invited, "p1", "invitee", "leader", 1001);
  assert.deepEqual(Array.from(cancelled.parties.p1.invitedIds), [], "cancel reducer must retain cloned-state behavior");
}

const transferSandbox = { window: {}, globalThis: null, Date, JSON, Set, Map, Object, String, Number, Math, console };
transferSandbox.globalThis = transferSandbox;
transferSandbox.window = transferSandbox;
vm.createContext(transferSandbox);
vm.runInContext(runtimeUtils, transferSandbox, { filename: "runtime-utils.js" });
vm.runInContext(domainRules, transferSandbox, { filename: "runtime-domain-rules.js" });
vm.runInContext(itemTransfer, transferSandbox, { filename: "item-transfer-core.js" });
const transfer = transferSandbox.window.__BAEKJI_ITEM_TRANSFER_TEST__;
const rules = transferSandbox.window.__BAEKJI_DOMAIN_RULES__;
assert.ok(transfer, "item-transfer test surface must remain exposed");
assert.equal(transfer.scope, rules.spatialScopeKey, "item transfer public scope must retain the exact shared function identity");
for (const [session, expected] of [
  [null, ""],
  [{ movement: { fromNode: "A", targetNode: "B" }, activeEncounter: { fromNode: "X", targetNode: "Y" }, currentNode: "N", currentDetailId: "D" }, "route:A:B"],
  [{ activeEncounter: { fromNode: "A", targetNode: "B" }, currentNode: "N", currentDetailId: "D" }, "route:A:B"],
  [{ currentNode: "A", currentDetailId: "D" }, "detail:A:D"],
  [{ currentNode: "A", currentDetailId: null }, "node:A"],
  [{}, "node:undefined"],
]) assert.equal(transfer.scope(session), expected, `item-transfer scope golden ${expected} must match domain rules`);

const coLocated = {
  version: 3,
  characters: { giver: { currentSessionId: "s1", inventory: { key: { itemId: "key", name: "key", quantity: 1, state: "CLEAN" } } }, receiver: { currentSessionId: "s2", inventory: {} } },
  sessions: {
    s1: { id: "s1", status: "ACTIVE", variant: "c", memberIds: ["giver"], currentNode: "A", currentDetailId: null, movement: { fromNode: "A", targetNode: "B" }, logs: [] },
    s2: { id: "s2", status: "ACTIVE", variant: "c", memberIds: ["receiver"], currentNode: "A", currentDetailId: null, activeEncounter: { fromNode: "A", targetNode: "B" }, logs: [] },
  },
};
const offer = transfer.createOffer(coLocated, { giverId: "giver", receiverId: "receiver", inventoryKey: "key" });
assert.equal(offer.ok, true, "movement and encounter sessions in the same shared route scope must remain co-located");
assert.equal(offer.offer.sourceScopeKey, rules.spatialScopeKey(coLocated.sessions.s1), "offer sourceScopeKey must use the exact shared domain projection");
const separated = structuredClone(coLocated);
separated.sessions.s2.activeEncounter.targetNode = "C";
assert.equal(transfer.createOffer(separated, { giverId: "giver", receiverId: "receiver", inventoryKey: "key" }).error, "NOT_COLOCATED", "different shared scopes must keep rejecting transfer offers");

const utilsScript = '<script src="runtime-utils.js?v=0.1.0&stage3a=1"></script>';
const domainScript = '<script src="runtime-domain-rules.js?v=0.1.0&stage3b=1"></script>';
const itemScript = '<script src="item-transfer-core.js?v=0.3.42&stage3c=1&transfer-privacy=1"></script>';
const appScript = '<script src="app.js?v=0.4.14&fix=0b1&local-chat=1&movement-terminal=1&flex-hazard-terminal=1&topbar=1&stage2-foundation-ui=1&stage2-briefing-ui=1&stage2-party-ui=1&stage2-home-briefing-party-ui=1&pending-party-invites=1&party-member-readiness-ux=1&party-invite-grid-stability=1&party-confirmed-ready-collapse=1&pending-departure-set-guard=1&result-party-disband=1&departure-guards=1&stage3a=1&stage3b=1&stage3c=1&transfer-privacy=1&movement-departure-presence=1&item-disposition=1&stage5-world-store=1&stage6a=1"></script>';
for (const script of [utilsScript, domainScript, itemScript, appScript]) assert.ok(index.includes(script), `exact Stage 3-C cache key must be present: ${script}`);
assert.ok(index.indexOf(utilsScript) < index.indexOf(domainScript), "domain rules must remain after runtime utilities");
assert.ok(index.indexOf(domainScript) < index.indexOf(itemScript), "item transfer must load after domain rules");
assert.ok(index.indexOf(itemScript) < index.indexOf(appScript), "item transfer must remain before app startup");

console.log("PASS: Stage 3-C direct clone and item-transfer shared-scope caller adoption");
