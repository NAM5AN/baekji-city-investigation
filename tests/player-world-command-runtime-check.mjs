import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../player-world-commands.js", import.meta.url), "utf8");
const catalogSource = fs.readFileSync(new URL("../player-world-command-catalog.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const party = fs.readFileSync(new URL("../party-flow-sync.js", import.meta.url), "utf8");

assert.match(index, /cloud-state-sync\.js[^"']*stage8b-b1=1[^"']*[\s\S]*player-world-command-catalog\.js[^"']*stage8b-command-catalog=1[^"']*[\s\S]*player-world-commands\.js[^"']*stage8b-command-catalog=1/, "cloud state and command catalog must load before the command client");
assert.match(party, /__BAEKJI_PLAYER_WORLD_COMMANDS__\.dispatch\(\s*["']CONFIRM_BRIEFING_V1["']\s*,\s*\{\s*\}\s*\)/, "briefing confirmation must call the one B1 dispatcher exactly once");
const partyConfirmStart = party.indexOf("async function confirmBriefing(");
assert.ok(partyConfirmStart >= 0);
const partyConfirm = party.slice(partyConfirmStart, party.indexOf("\n  document.addEventListener", partyConfirmStart));
assert.doesNotMatch(partyConfirm, /(?:writeState|writeRaw|localStorage\.setItem|confirmBriefingState)\s*\(/, "B1 briefing confirmation must not locally persist a competing world write");

function runClient({ responses, ready = true, settle = true } = {}) {
  const requests = [];
  const events = [];
  let failedLeases = 0;
  const listeners = new Map();
  const queue = [...responses];
  let gateReady = ready;
  const localValues = new Map();
  const sessionValues = new Map([["baekji_city_mvp_current_user_v034", "test_a"]]);
  const storage = (values) => ({
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  });
  const context = vm.createContext({
    console,
    crypto: { randomUUID: () => "11111111-1111-4111-8111-111111111111" },
    localStorage: storage(localValues),
    sessionStorage: storage(sessionValues),
    navigator: { onLine: true },
    queueMicrotask,
    CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
    fetch: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) });
      const next = queue.shift();
      if (next?.throw) throw new Error(next.message || "network failure");
      return next;
    },
    window: {
      __BAEKJI_CLOUD_SYNC__: {
        canDispatchAuthoritativeCommand: () => gateReady,
        begin: () => ({ ready: gateReady, revision: 0 }),
        complete: async () => { if (!settle) gateReady = false; return settle; },
        fail: async () => { failedLeases += 1; },
      },
      addEventListener(type, listener) { listeners.set(type, listener); },
      dispatchEvent(event) { events.push(event); listeners.get(event.type)?.(event); return true; },
    },
  });
  context.globalThis = context;
  vm.runInContext(catalogSource, context, { filename: "player-world-command-catalog.js" });
  context.window.__BAEKJI_PLAYER_WORLD_COMMAND_CATALOG__ = context.__BAEKJI_PLAYER_WORLD_COMMAND_CATALOG__;
  vm.runInContext(source, context, { filename: "player-world-commands.js" });
  return { api: context.window.__BAEKJI_PLAYER_WORLD_COMMANDS__, requests, events, context, failedLeases: () => failedLeases };
}

const success = (revision, status = "APPLIED") => ({ ok: true, status: 200, json: async () => ({ ok: true, status, revision, commandId: "11111111-1111-4111-8111-111111111111" }) });
const runtime = runClient({ responses: [success(7)] });
assert.ok(Object.isFrozen(runtime.api), "player command public boundary must be frozen");
assert.deepEqual(Object.keys(runtime.api).sort(), ["conflicts", "discardConflict", "dispatch", "flushOutbox", "queued", "retryConflict", "revision"], "public command API exposes dispatch, revision, and explicit actor-scoped outbox conflict settlement");
assert.equal(typeof runtime.api.dispatch, "function");
assert.equal(typeof runtime.api.flushOutbox, "function");
assert.equal(typeof runtime.api.queued, "function");
assert.equal(typeof runtime.api.revision, "function");
assert.equal(runtime.api.revision(), 0);
const applied = await runtime.api.dispatch("CONFIRM_BRIEFING_V1", {});
assert.deepEqual(applied, { ok: true, status: "APPLIED", revision: 7, commandId: "11111111-1111-4111-8111-111111111111" });
assert.equal(runtime.api.revision(), 7, "authoritative server revision must replace the client revision");
assert.equal(runtime.requests.length, 1);
assert.equal(runtime.requests[0].url, "/api/player-world-command");
assert.equal(runtime.requests[0].options.method, "POST");
assert.equal(runtime.requests[0].options.credentials, "same-origin");
assert.equal(runtime.requests[0].options.headers["Content-Type"], "application/json");
assert.deepEqual(runtime.requests[0].body, { commandId: "11111111-1111-4111-8111-111111111111", expectedRevision: 0, command: "CONFIRM_BRIEFING_V1", payload: {} }, "browser request must be a strict allowlisted command envelope");
assert.equal(runtime.events.length, 1);
assert.equal(runtime.events[0].type, "baekji-world-command-applied");
assert.deepEqual({ ...runtime.events[0].detail }, applied, "the authoritative result/revision must be forwarded without a local snapshot");

const retryError = { throw: true, message: "offline" };
const retried = runClient({ responses: [retryError, success(9, "REPLAY")] });
const replay = await retried.api.dispatch("CONFIRM_BRIEFING_V1", {});
assert.equal(retried.requests.length, 2, "one transient failure may retry once");
assert.deepEqual(retried.requests[1].body, retried.requests[0].body, "the retry must reuse exactly the same idempotency command id and revision");
assert.equal(replay.status, "REPLAY");
assert.equal(retried.api.revision(), 9);
assert.equal(retried.events.at(-1).type, "baekji-world-command-applied", "a replay still forces an authoritative refresh");

const offline = runClient({ responses: [success(11, "REPLAY")], ready: false });
offline.context.navigator.onLine = false;
const queued = await offline.api.dispatch("CONFIRM_BRIEFING_V1", {});
assert.equal(queued.status, "QUEUED", "offline command is retained as an envelope, not a world snapshot");
assert.equal(offline.api.queued(), 1);
assert.equal(offline.requests.length, 0, "offline dispatch must not issue a request");
offline.context.navigator.onLine = true;
offline.context.window.__BAEKJI_CLOUD_SYNC__.canDispatchAuthoritativeCommand = () => true;
offline.context.window.__BAEKJI_CLOUD_SYNC__.begin = () => ({ ready: true, revision: 0 });
await offline.api.flushOutbox();
assert.equal(offline.requests.length, 1, "online recovery flushes the queued command exactly once");
assert.equal(offline.requests[0].body.commandId, queued.commandId, "outbox replay must preserve the original command id");
assert.equal(offline.requests[0].body.expectedRevision, queued.revision, "outbox replay must preserve the original expected revision");
assert.equal(offline.api.queued(), 0, "successful replay removes only the settled envelope");
assert.equal(offline.events.at(-1).detail.fromOutbox, true, "outbox success still publishes the authoritative result");

const conflicted = runClient({ responses: [success(5, "REVISION_CONFLICT"), success(6, "APPLIED")], ready: false });
conflicted.context.navigator.onLine = false;
const conflictQueued = await conflicted.api.dispatch("CONFIRM_BRIEFING_V1", {});
conflicted.context.navigator.onLine = true;
conflicted.context.window.__BAEKJI_CLOUD_SYNC__.canDispatchAuthoritativeCommand = () => true;
conflicted.context.window.__BAEKJI_CLOUD_SYNC__.begin = () => ({ ready: true, revision: 0 });
await conflicted.api.flushOutbox();
assert.equal(conflicted.api.queued(), 1, "a stale offline intent must remain queued after revision conflict");
assert.equal(conflicted.api.conflicts().length, 1, "the retained conflict must be explicitly discoverable");
assert.equal(conflicted.api.conflicts()[0].commandId, conflictQueued.commandId);
assert.equal(conflicted.events.at(-1).detail.retained, true, "the conflict event must tell consumers that the intent was not discarded");
await conflicted.api.flushOutbox();
assert.equal(conflicted.requests.length, 1, "automatic flush must not spin or silently rebase a conflicted intent");
conflicted.context.window.__BAEKJI_CLOUD_SYNC__.begin = () => ({ ready: true, revision: 5 });
await conflicted.api.retryConflict(conflictQueued.commandId);
assert.equal(conflicted.requests.length, 2, "only explicit retry may reissue a conflicted intent");
assert.equal(conflicted.requests[1].body.commandId, conflictQueued.commandId, "explicit retry preserves the original idempotency key");
assert.equal(conflicted.requests[1].body.expectedRevision, 5, "explicit retry rebases to the newly settled canonical revision");
assert.equal(conflicted.api.queued(), 0, "an applied explicit retry removes the retained intent");

const discarded = runClient({ responses: [success(5, "REVISION_CONFLICT")], ready: false });
discarded.context.navigator.onLine = false;
const discardQueued = await discarded.api.dispatch("CONFIRM_BRIEFING_V1", {});
discarded.context.navigator.onLine = true;
discarded.context.window.__BAEKJI_CLOUD_SYNC__.canDispatchAuthoritativeCommand = () => true;
discarded.context.window.__BAEKJI_CLOUD_SYNC__.begin = () => ({ ready: true, revision: 0 });
await discarded.api.flushOutbox();
assert.equal(discarded.api.discardConflict(discardQueued.commandId), true, "the user-facing boundary may explicitly discard a stale intent");
assert.equal(discarded.api.queued(), 0);
assert.equal(discarded.events.at(-1).detail.resolution, "DISCARDED");

const lostOutOfScope = runClient({ responses: [{ throw: true, message: "response lost after server commit" }, success(10, "OUT_OF_SCOPE")] });
const replayedFailure = await lostOutOfScope.api.dispatch("DECLINE_PARTY_INVITE_V1", { partyId: "party-a" });
assert.equal(lostOutOfScope.requests.length, 2, "a transient response loss retries the immutable command once");
assert.deepEqual(lostOutOfScope.requests[1].body, lostOutOfScope.requests[0].body, "the retry keeps the exact command id and payload bytes after a lost server response");
assert.equal(replayedFailure.status, "OUT_OF_SCOPE", "a stored non-success command result must stay OUT_OF_SCOPE, never become success-looking REPLAY");
assert.equal(lostOutOfScope.events.at(-1).detail.status, "OUT_OF_SCOPE", "the authoritative event may carry only the current non-success result, not a forged replay success");

const blocked = runClient({ responses: [success(1)], ready: false });
await assert.rejects(() => blocked.api.dispatch("CONFIRM_BRIEFING_V1", {}), /WORLD_COMMAND_SYNC_NOT_READY/, "a legacy pending/pushing cloud write must block B1 before it can race the command");
assert.equal(blocked.requests.length, 0, "blocked B1 dispatch must not issue a command request");

const invalid = runClient({ responses: [success(1)] });
await assert.rejects(() => invalid.api.dispatch("MOVE_V1", {}), /WORLD_COMMAND_UNSUPPORTED/);
await assert.rejects(() => invalid.api.dispatch("CONFIRM_BRIEFING_V1", { actorId: "spoof" }), /WORLD_COMMAND_INVALID_PAYLOAD/);
assert.equal(invalid.requests.length, 0, "unsupported command kinds and actor smuggling must be rejected before network I/O");

const refreshFailed = runClient({ responses: [success(10)], settle: false });
await assert.rejects(() => refreshFailed.api.dispatch("CONFIRM_BRIEFING_V1", {}), /WORLD_COMMAND_SYNC_NOT_READY/, "an unsettled authoritative refresh must not look successful to UI callers");
assert.equal(refreshFailed.events.length, 0, "failed authoritative refresh must emit neither applied nor conflict events");
assert.equal(refreshFailed.requests.length, 1, "an unsettled authoritative refresh sends only its original command envelope");
await assert.rejects(() => refreshFailed.api.dispatch("CONFIRM_BRIEFING_V1", {}), /WORLD_COMMAND_SYNC_NOT_READY/, "a retry while cloud recovery is pending must wait instead of creating a fresh command");
assert.equal(refreshFailed.requests.length, 1, "sync-pending retry must not create a second command id/request");

const reused = runClient({ responses: [{ ok: false, status: 409, json: async () => ({ ok: true, status: "COMMAND_ID_REUSED", revision: 10, commandId: "11111111-1111-4111-8111-111111111111" }) }] });
await assert.rejects(() => reused.api.dispatch("DECLINE_PARTY_INVITE_V1", { partyId: "party-a" }), /WORLD_COMMAND_409/, "a B2 fingerprint conflict must reject rather than look applied to the caller");
assert.equal(reused.events.length, 0, "a B2 command-id reuse conflict must never publish applied/conflict events");
assert.equal(reused.api.revision(), 0, "a B2 command-id reuse conflict must not advance client revision");
assert.equal(reused.failedLeases(), 1, "a B2 command-id reuse conflict must release the cloud command reservation");

const cancel = runClient({ responses: [success(12)] });
await cancel.api.dispatch("CANCEL_PARTY_INVITE_V1", { partyId: "party-a", inviteeId: "invitee-a" });
assert.deepEqual(cancel.requests[0].body, { commandId: "11111111-1111-4111-8111-111111111111", expectedRevision: 0, command: "CANCEL_PARTY_INVITE_V1", payload: { partyId: "party-a", inviteeId: "invitee-a" } }, "B3 uses the same reserved cloud gate and immutable exact cancel envelope");

const invite = runClient({ responses: [success(13)] });
await invite.api.dispatch("INVITE_PARTY_MEMBER_V1", { partyId: "party-a", inviteeId: "invitee-a" });
assert.deepEqual(invite.requests[0].body, { commandId: "11111111-1111-4111-8111-111111111111", expectedRevision: 0, command: "INVITE_PARTY_MEMBER_V1", payload: { partyId: "party-a", inviteeId: "invitee-a" } }, "B4 invite/reinvite uses the same reserved cloud gate and exact envelope");
const inviteUnsettled = runClient({ responses: [success(14)], settle: false });
await assert.rejects(() => inviteUnsettled.api.dispatch("INVITE_PARTY_MEMBER_V1", { partyId: "party-a", inviteeId: "invitee-a" }), /WORLD_COMMAND_SYNC_NOT_READY/, "B4 must not report a command as successful until its cloud settlement completes");
assert.equal(inviteUnsettled.requests.length, 1, "B4 unsettled command sends only the original POST");
await assert.rejects(() => inviteUnsettled.api.dispatch("INVITE_PARTY_MEMBER_V1", { partyId: "party-a", inviteeId: "invitee-a" }), /WORLD_COMMAND_SYNC_NOT_READY/);
assert.equal(inviteUnsettled.requests.length, 1, "B4 settlement-pending retry must issue zero additional POSTs");

const accept = runClient({ responses: [success(15)] });
await accept.api.dispatch("ACCEPT_PARTY_INVITE_V1", { partyId: "party-a" });
assert.deepEqual(accept.requests[0].body, { commandId: "11111111-1111-4111-8111-111111111111", expectedRevision: 0, command: "ACCEPT_PARTY_INVITE_V1", payload: { partyId: "party-a" } }, "B5 accept uses the reserved gate and exact immutable envelope");
const acceptUnsettled = runClient({ responses: [success(16)], settle: false });
await assert.rejects(() => acceptUnsettled.api.dispatch("ACCEPT_PARTY_INVITE_V1", { partyId: "party-a" }), /WORLD_COMMAND_SYNC_NOT_READY/);
assert.equal(acceptUnsettled.requests.length, 1, "B5 unsettled acceptance sends only its original POST");
await assert.rejects(() => acceptUnsettled.api.dispatch("ACCEPT_PARTY_INVITE_V1", { partyId: "party-a" }), /WORLD_COMMAND_SYNC_NOT_READY/);
assert.equal(acceptUnsettled.requests.length, 1, "B5 settlement-pending retry creates zero extra POSTs");

const create = runClient({ responses: [success(17)] });
await create.api.dispatch("CREATE_PARTY_V1", {});
assert.deepEqual(create.requests[0].body.payload, {}, "create keeps the exact empty payload through the shared catalog");

const rename = runClient({ responses: [success(18)] });
await rename.api.dispatch("RENAME_PARTY_V1", { partyId: "party-a", name: "  새   이름  " });
assert.deepEqual(rename.requests[0].body.payload, { partyId: "party-a", name: "새 이름" }, "rename canonicalization comes from the shared catalog before network I/O");

const ready = runClient({ responses: [success(19)] });
await ready.api.dispatch("TOGGLE_PARTY_READY_V1", { partyId: "party-a" });
assert.deepEqual(ready.requests[0].body.payload, { partyId: "party-a" }, "ready command uses the catalog's one-party payload shape");

const lock = runClient({ responses: [success(20)] });
await lock.api.dispatch("LOCK_PARTY_COMPOSITION_V1", { partyId: "party-a" });
assert.deepEqual(lock.requests[0].body.payload, { partyId: "party-a" }, "composition lock uses the catalog's one-party payload shape");

console.log("PASS: B1 client retries one immutable command envelope, tracks revision, and refuses unsafe local cloud races");
