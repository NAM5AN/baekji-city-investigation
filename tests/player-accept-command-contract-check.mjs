import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { PLAYER_COOKIE_NAME } from "../api/_player-auth.mjs";
import { playerWorldCommandHandler } from "../api/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const api = read("api/index.mjs"); const catalog = read("player-world-command-catalog.js"); const app = read("app.js"); const commands = read("player-world-commands.js"); const flow = read("party-flow-sync.js"); const ux = read("party-flow-ux-fix.js"); const leadership = read("party-leadership-flow.js"); const reinvite = read("party-reinvite-runtime-fix.js"); const membership = read("party-membership-ux-fix.js"); const index = read("index.html");
const migration = read("supabase/migrations/20260828055726_player_accept_party_invite_command.sql");
const COMMAND = "ACCEPT_PARTY_INVITE_V1"; const RPC = "baekji_player_accept_party_invite_v1";
const handlerStart = api.indexOf("export async function playerWorldCommandHandler"); const handler = api.slice(handlerStart, api.indexOf("\nexport ", handlerStart + 1));

assert.ok(handlerStart >= 0, "B5 remains index-routed and does not add a Vercel function");
assert.match(catalog, /ACCEPT_PARTY_INVITE_V1[\s\S]*?rpcName:\s*["']baekji_player_accept_party_invite_v1["']/, "B5 command/RPC identity lives in the shared catalog");
assert.match(api, /Object\.keys\(value\).*?!WORLD_COMMAND_KEYS\.has/, "B5 rejects outer actor-smuggling fields");
assert.match(catalog, /ACCEPT_PARTY_INVITE_V1[\s\S]*?validate:\s*onePartyPayload[\s\S]*?rpcParams:\s*partyParams/, "B5 catalog payload is exactly {partyId}");
assert.doesNotMatch(handler, /p_(?:actor|account|character)_id\s*:\s*body/i, "B5 never accepts caller-selected actor identity");

assert.match(migration, new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${RPC}\\s*\\(\\s*p_session_token\\s+text\\s*,\\s*p_command_id\\s+uuid\\s*,\\s*p_expected_revision\\s+bigint\\s*,\\s*p_party_id\\s+text`, "i"), "B5 exact dedicated RPC signature");
const fnStart = migration.search(new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${RPC}`, "i")); assert.ok(fnStart >= 0); const fn = migration.slice(fnStart, migration.indexOf(`revoke all on function public.${RPC}`, fnStart));
assert.match(fn, /baekji_player_world_command_preflight_v1\([\s\S]*?'ACCEPT_PARTY_INVITE_V1'[\s\S]*?v_preflight\.status\s+is\s+not\s+null/i, "B5 delegates token identity, lock, retention, replay, and revision to the shared envelope");
assert.match(fn, /v_fingerprint\s*:=\s*encode\(digest\('ACCEPT_PARTY_INVITE_V1:'\s*\|\|\s*p_party_id/i, "B5 fingerprint binds the accepted party");
assert.match(fn, /baekji_player_world_command_preflight_v1\([\s\S]*?'ACCEPT_PARTY_INVITE_V1'[\s\S]*?v_preflight\.status\s+is\s+not\s+null/i, "B5 delegates shared replay and revision semantics to the envelope");
assert.match(fn, /jsonb_typeof\(v_party\)\s*<>\s*'object'[\s\S]*?jsonb_typeof\(v_actor\)\s*<>\s*'object'[\s\S]*?OUT_OF_SCOPE/i, "B5 fail-closes missing party/actor objects");
assert.match(fn, /(?:memberIds|invitedIds|declinedIds)[\s\S]*?jsonb_typeof[\s\S]*?array[\s\S]*?OUT_OF_SCOPE/i, "B5 fail-closes malformed invitation collections");
assert.match(fn, /jsonb_typeof\(v_confirmed\)\s*<>\s*'array'[\s\S]*?jsonb_typeof\(v_ready\)\s*<>\s*'array'[\s\S]*?OUT_OF_SCOPE/i, "B5 fail-closes malformed confirmation/readiness arrays");
assert.match(fn, /jsonb_typeof\(v_ready_state\)\s*<>\s*'object'[\s\S]*?jsonb_typeof\(v_joined_map\)\s*<>\s*'object'[\s\S]*?jsonb_typeof\(v_markers\)\s*<>\s*'object'[\s\S]*?OUT_OF_SCOPE/i, "B5 fail-closes malformed readiness/joined/reinvite maps");
for (const name of ["v_members", "v_invited", "v_declined", "v_confirmed", "v_ready"]) assert.match(fn, new RegExp(`jsonb_array_elements(?:_text)?\\(${name}\\)[\\s\\S]*?jsonb_typeof|jsonb_array_elements_text\\(${name}\\)`, "i"), `B5 validates every ${name} element is a JSON string, not merely that its collection is an array`);
assert.match(fn, /currentPartyId[\s\S]*?currentSessionId/i, "B5 requires an unassigned, non-session actor");
assert.match(fn, /not\s*\(v_invited\s*\?\s*v_identity\.character_id\)[\s\S]*?v_members\s*\?\s*v_identity\.character_id[\s\S]*?OUT_OF_SCOPE/i, "B5 requires a pending invite and rejects an already-member actor");
assert.match(fn, /creatorId[\s\S]*?\^\[A-Za-z0-9_-\]\{1,96\}\$[\s\S]*?v_members\s*\?\s*v_creator_id[\s\S]*?characters[\s\S]*?v_creator_id[\s\S]*?currentPartyId[\s\S]*?p_party_id[\s\S]*?currentSessionId[\s\S]*?OUT_OF_SCOPE/i, "B5 fail-closes malformed/non-member/unassigned-or-session-bound party creator integrity");
assert.match(fn, /RECRUITING[\s\S]*?COMPOSITION_CONFIRMED[\s\S]*?READY_CHECK[\s\S]*?OUT_OF_SCOPE/i, "B5 explicitly allows recruiting/confirmed and rejects READY_CHECK");
assert.match(fn, /v_removal\s+is\s+not\s+null[\s\S]*?jsonb_typeof\(v_removal\)\s*<>\s*'object'[\s\S]*?OUT_OF_SCOPE/i, "B5 treats present malformed tombstone history as out of scope");
assert.match(fn, /jsonb_typeof\(v_removal\s*->\s*'active'\)\s*<>\s*'boolean'[\s\S]*?OUT_OF_SCOPE/i, "B5 requires active tombstone to be an exact JSON boolean");
assert.match(fn, /v_removal\s+is\s+not\s+null[\s\S]*?partyId[\s\S]*?p_party_id[\s\S]*?memberId[\s\S]*?v_identity\.character_id[\s\S]*?\^\[1-9\]\[0-9\]\{0,14\}\$[\s\S]*?OUT_OF_SCOPE/i, "B5 validates every present tombstone party/member/positive at, including inactive history");
assert.match(fn, /v_active_removal[\s\S]*?v_existing_marker\s*<=\s*v_removal_at[\s\S]*?OUT_OF_SCOPE/i, "B5 active removal acceptance requires a valid later reinvite marker");
assert.match(fn, /v_joined_text[\s\S]*?(?:=\s*''|\^\[1-9\]\[0-9\]\{0,14\}\$)[\s\S]*?OUT_OF_SCOPE/i, "B5 permits an absent joined marker as zero but fail-closes any present non-positive/non-numeric actor joined value");
assert.match(fn, /v_marker_text[\s\S]*?(?:=\s*''|\^\[1-9\]\[0-9\]\{0,14\}\$)[\s\S]*?OUT_OF_SCOPE/i, "B5 fail-closes a present invalid actor reinvite marker for both active and inactive tombstones");
assert.match(fn, /greatest\s*\([\s\S]*?(?:clock_timestamp|statement_timestamp|now)[\s\S]*?v_removal_at\s*\+\s*1[\s\S]*?v_existing_joined\s*\+\s*1[\s\S]*?v_existing_marker\s*\+\s*1/i, "B5 joined timestamp is server-derived and monotonic over removal/existing join/active marker");
for (const pathName of ["memberIds", "invitedIds", "declinedIds", "confirmedBy", "readyBy", "readyStateBy", "membershipJoinedAtBy"]) assert.match(fn, new RegExp(`jsonb_set[\\s\\S]*?array\\s*\\[\\s*['\"]parties['\"]\\s*,\\s*p_party_id\\s*,\\s*['\"]${pathName}['\"]`, "i"), `B5 owns party ${pathName} cleanup`);
for (const pathName of ["currentPartyId", "currentSessionId"]) assert.match(fn, new RegExp(`jsonb_set[\\s\\S]*?array\\s*\\[\\s*['\"]characters['\"]\\s*,\\s*v_identity\\.character_id\\s*,\\s*['\"]${pathName}['\"]`, "i"), `B5 owns actor ${pathName} only`);
assert.match(fn, /partyMembershipRemovals[\s\S]*?active[\s\S]*?false[\s\S]*?clearedAt/i, "B5 clears only an active matching tombstone with server clearedAt");
assert.match(fn, /membershipReinvitedAtBy[\s\S]*?-\s*v_identity\.character_id/i, "B5 removes only the actor's reinvite marker on acceptance");
assert.doesNotMatch(fn, /jsonb_set\s*\([^,]+,\s*array\s*\[\s*['"]parties['"]\s*,\s*p_party_id\s*,\s*['"]status['"]/i, "B5 never mutates party status");
assert.match(fn, /if\s+v_party_status\s*=\s*'COMPOSITION_CONFIRMED'[\s\S]*?confirmedBy[\s\S]*?readyBy[\s\S]*?readyStateBy[\s\S]*?ready:\s*false[\s\S]*?v_joined_at/i, "B5 composition-confirmed accept adds only actor confirmation, clears actor readiness, and stamps actor ready=false at joinedAt");
assert.match(fn, /if\s+v_party_status\s*=\s*'RECRUITING'[\s\S]*?(?:confirmedBy|v_confirmed)[\s\S]*?(?:readyBy|v_ready)[\s\S]*?(?:readyStateBy|v_ready_state)/i, "B5 recruiting accept removes only actor stale confirmation/readiness state");
assert.match(fn, /v_ready_state\s*-\s*v_identity\.character_id/i, "B5 recruiting path deletes only the actor ready-state key and preserves other entries");
assert.doesNotMatch(fn, /jsonb_array_elements_text\(v_(?:confirmed|ready)\)[\s\S]{0,200}v_members\s*\?\s*x/i, "B5 confirmed/ready cleanup removes only actor, never filters unrelated entries by current membership");
assert.match(fn, /v_confirmed\s*:=\s*v_confirmed\s*-\s*v_identity\.character_id[\s\S]*?COMPOSITION_CONFIRMED[\s\S]*?v_confirmed\s*:=\s*v_confirmed\s*\|\|\s*to_jsonb\(v_identity\.character_id\)/i, "B5 preserves other confirmed entries and appends only actor in composition-confirmed");
assert.match(fn, /v_joined(?:_map|_by)?\s*:=\s*jsonb_set\([^\n]*array\s*\[\s*v_identity\.character_id\s*\]/i, "B5 updates membershipJoinedAtBy at the actor key only, preserving unrelated map entries");
assert.match(fn, /v_markers\s*:=\s*v_markers\s*-\s*v_identity\.character_id/i, "B5 deletes only the actor reinvite marker and preserves unrelated markers");
assert.match(fn, /if\s+v_active_removal\s+then[\s\S]*?partyMembershipRemovals[\s\S]*?active[\s\S]*?false[\s\S]*?clearedAt/i, "B5 clears a tombstone only when the validated tombstone is active");
assert.doesNotMatch(fn, /partyMembershipRemovals[\s\S]*?jsonb_set[\s\S]*?v_active_removal\s*=\s*false/i, "B5 fresh/inactive acceptance cannot manufacture or rewrite a tombstone");
assert.doesNotMatch(fn, /\bp_state\b|baekji_mvp_put_state/i, "B5 cannot proxy a generic whole-state write");
assert.doesNotMatch(fn, /jsonb_set\s*\([^,]+,\s*array\s*\[\s*['"]sessions['"]|jsonb_set\s*\([^,]+,\s*array\s*\[\s*['"]characters['"]\s*,\s*(?!v_identity\.character_id)/i, "B5 cannot mutate sessions or another character");
assert.match(migration, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${RPC}[\\s\\S]*?from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`, "i"), "B5 RPC is service-only");
assert.match(migration, new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${RPC}[\\s\\S]*?to\\s+service_role`, "i"), "B5 grants only service_role");

const acceptStart = app.indexOf("function acceptInvite(partyId)"); const accept = app.slice(acceptStart, app.indexOf("\n  const declineInviteInFlight", acceptStart));
assert.match(accept, /__BAEKJI_PLAYER_WORLD_COMMANDS__\.dispatch\(\s*["']ACCEPT_PARTY_INVITE_V1["']\s*,\s*\{\s*partyId\s*\}\s*\)/, "app home accept dispatches B5 exact command");
assert.doesNotMatch(accept, /(?:commitState|saveState|writeState|render)\s*\(/, "B5 home owner has no local state write/render before authority settles");
assert.match(app, /acceptInviteInFlight\s*=\s*new\s+Set\(\)/, "B5 home owner has a durable rapid-click guard");
assert.match(accept, /acceptInviteInFlight\.has[\s\S]*?\.add[\s\S]*?finally[\s\S]*?\.delete/, "B5 home guard releases after settlement/failure");
assert.match(accept, /\["APPLIED",\s*"NOOP",\s*"REPLAY"\]\.includes\(result\?\.status\)[\s\S]*?(?:go|toast)/, "B5 home route/success happens only after a successful authoritative status");
assert.match(flow, /data-party-flow-accept/, "B5 modal owner remains explicit and separate from home cards");
assert.match(flow, /target\.closest\(\s*["']\[data-party-flow-accept\]["']\s*\)/, "B5 modal flow captures its modal selector only");
assert.doesNotMatch(flow, /target\.closest\(\s*["']\[data-accept\]["']\s*\)/, "B5 modal flow never captures bare home accept cards");
for (const [label, source] of [["ux", ux], ["leadership", leadership], ["reinvite", reinvite]]) assert.doesNotMatch(source, /target\.closest\(\s*["'](?:\[data-party-flow-accept\](?:,\s*\[data-accept\])?|\[data-accept\])["']\s*\)[\s\S]{0,900}?(?:acceptInvite|handleAccept|writeState|commitState)/, `B5 ${label} sidecar has no production accept capture/writer`);
for (const name of ["rememberJoinIntent", "readJoinIntent", "applyJoinIntent", "join-stamp"]) assert.doesNotMatch(membership, new RegExp(name), `B5 removes production membership join-intent ${name}`);
assert.match(membership, /markMemberJoinedState[\s\S]*?repairMembershipRemovals/, "B5 retains pure join helper and external stale-merge repair");
assert.match(catalog, /ACCEPT_PARTY_INVITE_V1[\s\S]*?validate:\s*onePartyPayload/, "B5 catalog allowlists the exact accept envelope");
assert.match(index, /player-world-command-catalog\.js[^"']*stage8b-command-catalog=1/, "catalog is cache-bumped before its consumers");
assert.match(index, /player-world-commands\.js[^"']*stage8b-command-catalog=1/, "shared command client is cache-bumped with the catalog");

// The HTTP boundary must reject unauthenticated or forged accept envelopes
// before it can touch either the session verifier or the command RPC.
function response() {
  return {
    statusCode: 0, headers: {}, body: "",
    setHeader(key, value) { this.headers[String(key).toLowerCase()] = value; },
    end(value = "") { this.body += String(value); },
    json() { return JSON.parse(this.body); },
  };
}
function request(body, { cookie = `${PLAYER_COOKIE_NAME}=token-a`, origin = "https://example.test" } = {}) {
  const bytes = Buffer.from(JSON.stringify(body));
  return { method: "POST", url: "/api/player-world-command", headers: { cookie, origin, host: "example.test" }, async *[Symbol.asyncIterator]() { yield bytes; } };
}
const acceptEnvelope = { commandId: "11111111-1111-4111-8111-111111111111", expectedRevision: 13, command: COMMAND, payload: { partyId: "party-a" } };
const rpcCalls = [];
let acceptResult = { status: "APPLIED", revision: 14, command_id: acceptEnvelope.commandId };
async function fetchImpl(url, options = {}) {
  const name = String(url).split("/").at(-1);
  const body = JSON.parse(options.body || "{}");
  rpcCalls.push({ name, body });
  if (name === "baekji_player_session_verify_v2") return { ok: true, status: 200, json: async () => [{ account_id: "account-a", character_id: "actor-a", session_id: "session-a" }] };
  if (name === "baekji_player_world_command_source_v1") return { ok: true, status: 200, json: async () => [{ revision: 13, actor_character_id: "actor-a", character_names: {}, world_state: { version: 3, characters: { "actor-a": { id: "actor-a", currentPartyId: null } }, parties: { "party-a": { id: "party-a", creatorId: "leader", memberIds: ["leader"], invitedIds: ["actor-a"], declinedIds: [], status: "RECRUITING" } }, sessions: {} } }] };
  if (name === "baekji_player_world_command_commit_v1") return { ok: true, status: 200, json: async () => [acceptResult] };
  throw new Error(`unexpected RPC ${name}`);
}
const env = { SUPABASE_SECRET_KEY: "test-server-secret" };
const missingCookie = response();
await playerWorldCommandHandler(request(acceptEnvelope, { cookie: "" }), missingCookie, { env, fetchImpl });
assert.equal(missingCookie.statusCode, 401, "B5 requires the verified HttpOnly session cookie");
assert.equal(rpcCalls.length, 0, "missing-cookie acceptance must not contact session/RPC backends");
for (const forged of [
  { ...acceptEnvelope, actorId: "actor-b" },
  { ...acceptEnvelope, payload: { partyId: "party-a", characterId: "actor-b" } },
  { ...acceptEnvelope, payload: { partyId: "party-a", accountId: "account-b" } },
]) {
  const denied = response(); const before = rpcCalls.length;
  await playerWorldCommandHandler(request(forged), denied, { env, fetchImpl });
  assert.equal(denied.statusCode, 400, "B5 actor-smuggling must be rejected before session/RPC");
  assert.equal(rpcCalls.length, before, "forged B5 envelope must never reach RPC");
}
const accepted = response();
await playerWorldCommandHandler(request(acceptEnvelope), accepted, { env, fetchImpl });
assert.deepEqual(accepted.json(), { ok: true, status: "APPLIED", revision: 14, commandId: acceptEnvelope.commandId });
assert.equal(rpcCalls.at(-1).name, "baekji_player_world_command_commit_v1", "B5 commits through shared source/reduce/commit");
assert.equal(rpcCalls.at(-1).body.p_command_name, COMMAND);
assert.equal(rpcCalls.at(-1).body.p_command_id, acceptEnvelope.commandId);
acceptResult = { status: "OUT_OF_SCOPE", revision: 14, command_id: acceptEnvelope.commandId };
const outOfScope = response(); await playerWorldCommandHandler(request(acceptEnvelope), outOfScope, { env, fetchImpl });
assert.deepEqual(outOfScope.json(), { ok: true, status: "OUT_OF_SCOPE", revision: 14, commandId: acceptEnvelope.commandId }, "B5 OUT_OF_SCOPE reaches UI as a non-success status, never a replay success");
acceptResult = { status: "COMMAND_ID_REUSED", revision: 14, command_id: acceptEnvelope.commandId };
const reused = response(); await playerWorldCommandHandler(request({ ...acceptEnvelope, payload: { partyId: "party-b" } }), reused, { env, fetchImpl });
assert.equal(reused.statusCode, 409, "B5 command fingerprint reuse is an HTTP conflict");
assert.deepEqual(reused.json(), { ok: false, code: "COMMAND_ID_REUSED" });

// Execute the production-owned accept functions in separate browser realms.
// They are cut at their real neighbouring declarations, so the check remains
// coupled to production source without booting unrelated legacy writers.
function deferred() { let resolve; let reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; }
function between(source, startToken, endToken) {
  const start = source.indexOf(startToken); const end = source.indexOf(endToken, start);
  assert.ok(start >= 0 && end > start, `cannot isolate ${startToken}`);
  return source.slice(start, end);
}
function loadHomeAccept(dispatch, effects) {
  const context = vm.createContext({
    window: { __BAEKJI_PLAYER_WORLD_COMMANDS__: { dispatch } },
    toast: (...args) => effects.toasts.push(args), go: (route) => effects.routes.push(route),
  });
  vm.runInContext(`${between(app, "const acceptInviteInFlight", "  const declineInviteInFlight")} globalThis.accept = acceptInvite;`, context, { filename: "app.js#b5-home-accept" });
  return context.accept;
}
function loadModalAccept(dispatch, effects) {
  const context = vm.createContext({
    window: { __BAEKJI_PLAYER_WORLD_COMMANDS__: { dispatch } },
    currentUserId: () => "actor-a", clearDeferredInvite: (...args) => effects.deferred.push(args), clearInvitationModal: () => { effects.modalClears += 1; },
    showInvitationCommandNotice: (message) => effects.notices.push(message), console: { warn: () => {} }, location: { hash: "#/home" },
  });
  vm.runInContext(`const acceptInvitationInFlight = new Set(); ${between(flow, "async function acceptInvitation", "  async function declineInvitation")} globalThis.accept = acceptInvitation;`, context, { filename: "party-flow-sync.js#b5-modal-accept" });
  return { accept: context.accept, context };
}
const homeEffects = { toasts: [], routes: [] }; const homeCalls = []; const homeFirst = deferred(); let homeAttempt = 0;
const homeAccept = loadHomeAccept(() => { homeCalls.push(++homeAttempt); return homeAttempt === 1 ? homeFirst.promise : homeAttempt === 2 ? Promise.reject(new Error("offline")) : Promise.resolve({ status: "REPLAY" }); }, homeEffects);
const homeA = homeAccept("party-a"); const homeB = homeAccept("party-a");
assert.equal(homeCalls.length, 1, "two rapid real home clicks issue one authoritative dispatch");
homeFirst.resolve({ status: "APPLIED" }); await Promise.all([homeA, homeB]);
assert.deepEqual(homeEffects.routes, ["party/party-a"], "only settled success routes the home card");
await homeAccept("party-a"); assert.equal(homeCalls.length, 2, "home guard releases after success");
await homeAccept("party-a"); assert.equal(homeCalls.length, 3, "home guard releases after failure");
const homeNoSuccess = { toasts: [], routes: [] }; const rejectedHome = loadHomeAccept(() => Promise.resolve({ status: "OUT_OF_SCOPE" }), homeNoSuccess);
await rejectedHome("party-a"); assert.equal(homeNoSuccess.routes.length, 0, "OUT_OF_SCOPE never routes the home card as an accepted invite");

const modalEffects = { deferred: [], modalClears: 0, notices: [] }; const modalCalls = []; const modalFirst = deferred(); let modalAttempt = 0;
const modalRuntime = loadModalAccept(() => { modalCalls.push(++modalAttempt); return modalAttempt === 1 ? modalFirst.promise : modalAttempt === 2 ? Promise.reject(new Error("offline")) : Promise.resolve({ status: "NOOP" }); }, modalEffects);
const modalA = modalRuntime.accept("party-a"); const modalB = modalRuntime.accept("party-a");
assert.equal(modalCalls.length, 1, "two rapid real modal clicks issue one authoritative dispatch");
modalFirst.resolve({ status: "APPLIED" }); await Promise.all([modalA, modalB]);
assert.deepEqual(modalEffects.deferred, [["actor-a", "party-a"]], "only settled modal success clears the deferred invite");
assert.equal(modalEffects.modalClears, 1, "only settled modal success closes the modal");
assert.equal(modalRuntime.context.location.hash, "#/party/party-a", "only settled modal success routes to the joined party");
const deferredBeforeGenericFailure = modalEffects.deferred.length;
const clearsBeforeGenericFailure = modalEffects.modalClears;
const routeBeforeGenericFailure = modalRuntime.context.location.hash;
const noticesBeforeGenericFailure = modalEffects.notices.length;
await modalRuntime.accept("party-a"); assert.equal(modalCalls.length, 2, "modal guard releases after success");
assert.deepEqual(modalEffects.notices.slice(noticesBeforeGenericFailure), ["초대 수락을 저장하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요."], "generic network/API rejection shows its explicit retry-safe modal notice");
assert.equal(modalEffects.deferred.length, deferredBeforeGenericFailure, "generic rejection does not clear deferred invite state");
assert.equal(modalEffects.modalClears, clearsBeforeGenericFailure, "generic rejection does not close the invitation modal");
assert.equal(modalRuntime.context.location.hash, routeBeforeGenericFailure, "generic rejection does not route as a successful acceptance");
await modalRuntime.accept("party-a"); assert.equal(modalCalls.length, 3, "modal guard releases after failure");
const modalNoSuccess = { deferred: [], modalClears: 0, notices: [] }; const rejectedModal = loadModalAccept(() => Promise.resolve({ status: "OUT_OF_SCOPE" }), modalNoSuccess);
await rejectedModal.accept("party-a");
assert.equal(modalNoSuccess.deferred.length, 0, "OUT_OF_SCOPE retains the deferred invitation");
assert.equal(modalNoSuccess.modalClears, 0, "OUT_OF_SCOPE retains the invitation modal");
assert.equal(modalNoSuccess.notices.length, 1, "OUT_OF_SCOPE shows a retry-safe modal notice instead of silently dismissing the invitation");

// Combined click fixture: full app boot is intentionally avoided because it
// initializes unrelated legacy state owners.  We install the exact app card
// binding and the real listener bodies from every B5 sidecar in index order.
// The static guards above prove that those sidecars contain no accept path;
// this realm proves their installed listeners cannot add a second dispatch.
class AcceptElement {
  constructor(dataset, matches) { this.dataset = dataset; this.matches = matches; }
  closest(selector) { return String(selector).split(",").some((entry) => this.matches?.[entry.trim()]) ? this : null; }
  removeAttribute() {} remove() {} querySelector() { return null; }
}
function clickListenerSlice(source, anchor) {
  const start = source.indexOf(anchor); assert.ok(start >= 0, `missing listener ${anchor}`);
  const bodyStart = source.indexOf("{", start); let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}" && --depth === 0) return `${source.slice(start, index + 1)});`;
  }
  throw new Error(`unclosed listener ${anchor}`);
}
const combinedDispatches = []; const canonicalWrites = [];
const hubListeners = [];
const homeButton = new AcceptElement({ accept: "party-a" }, { "[data-accept]": true });
homeButton.addEventListener = (_type, listener) => { homeButton.click = listener; };
const combinedDocument = {
  querySelectorAll(selector) { return selector === "[data-accept]" ? [homeButton] : []; },
  querySelector() { return null; }, getElementById() { return null; }, documentElement: { dataset: {} },
  addEventListener(type, listener) { if (type === "click") hubListeners.push(listener); },
};
const combinedWindowListeners = [];
const combined = vm.createContext({
  Element: AcceptElement, document: combinedDocument, location: { hash: "#/home" }, console: { warn() {} },
  window: {
    __BAEKJI_PLAYER_WORLD_COMMANDS__: { dispatch: (command, payload) => { combinedDispatches.push({ command, payload }); return Promise.resolve({ status: "APPLIED" }); } },
    __BAEKJI_WORLD_PERSISTENCE__: { writeRaw: (...args) => canonicalWrites.push({ kind: "writeRaw", args }), readRaw: () => null },
    addEventListener(type, listener) { if (type === "click") combinedWindowListeners.push(listener); }, dispatchEvent() {},
  },
  toast() {}, go() {}, currentUserId: () => "actor-a", clearDeferredInvite() {}, clearInvitationModal() {}, showInvitationCommandNotice() {},
  writeState: (...args) => canonicalWrites.push({ kind: "writeState", args }), commitState: (...args) => canonicalWrites.push({ kind: "commitState", args }),
  queueMicrotask() {}, setTimeout() {}, setInterval() {}, sessionStorage: { getItem: () => null, setItem() {} }, localStorage: { getItem: () => null, setItem: (...args) => canonicalWrites.push({ kind: "localStorage.setItem", args }) },
});
combined.globalThis = combined;
vm.runInContext(`${between(app, "const acceptInviteInFlight", "  const declineInviteInFlight")} globalThis.homeAccept = acceptInvite;`, combined, { filename: "app.js#combined-b5" });
vm.runInContext(`const acceptInvitationInFlight = new Set(); ${between(flow, "async function acceptInvitation", "  async function declineInvitation")} globalThis.modalAccept = acceptInvitation;`, combined, { filename: "party-flow-sync.js#combined-b5" });
// Exact app home binding (the real card renderer installs this listener).
vm.runInContext('document.querySelectorAll("[data-accept]").forEach((el) => el.addEventListener("click", () => homeAccept(el.dataset.accept)));', combined, { filename: "app.js#home-card-binding" });
for (const [filename, source, anchor] of [
  ["party-flow-ux-fix.js", ux, 'document.addEventListener("click", (event) =>'],
  ["party-leadership-flow.js", leadership, 'document.addEventListener("click", (event) =>'],
  ["party-flow-sync.js", flow, 'document.addEventListener("click", (event) =>'],
  ["party-membership-ux-fix.js", membership, 'document.addEventListener("click", (event) =>'],
]) {
  const listener = clickListenerSlice(source, anchor);
  // Flow is given its production accept function; all other source guards
  // prohibit an accept branch, so their listener body remains inert here.
  const executable = filename === "party-flow-sync.js" ? listener.replace("void acceptInvitation(", "void globalThis.modalAccept(") : listener;
  vm.runInContext(executable, combined, { filename: `${filename}#combined-b5-listener` });
}
function combinedEvent(target) { return { target, preventDefault() {}, stopImmediatePropagation() {} }; }
for (const listener of [...hubListeners, ...combinedWindowListeners]) listener(combinedEvent(homeButton));
await homeButton.click();
assert.equal(combinedDispatches.length, 1, "combined home card click has exactly one authoritative owner");
const modalTarget = new AcceptElement({ partyFlowAccept: "party-b" }, { "[data-party-flow-accept]": true });
for (const listener of [...hubListeners, ...combinedWindowListeners]) listener(combinedEvent(modalTarget));
await Promise.resolve();
assert.equal(combinedDispatches.length, 2, "combined modal click has exactly one authoritative owner across all B5 sidecars");
assert.equal(canonicalWrites.length, 0, "combined B5 accept clicks issue no canonical local-world writes");

// This is the final client-side settlement gate: a server APPLIED result that
// cannot be authoritatively refreshed must not release either UI owner.
const commandSource = commands;
const pendingRequests = [];
let commandInFlight = false;
const commandContext = vm.createContext({
  crypto: { randomUUID: () => "22222222-2222-4222-8222-222222222222" },
  CustomEvent: class CustomEvent { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } },
  fetch: async (_url, options) => { pendingRequests.push(JSON.parse(options.body)); return { ok: true, status: 200, json: async () => ({ ok: true, status: "APPLIED", revision: 15, commandId: "22222222-2222-4222-8222-222222222222" }) }; },
  window: { __BAEKJI_CLOUD_SYNC__: {
    canDispatchAuthoritativeCommand: () => !commandInFlight,
    begin: () => { if (commandInFlight) return { ready: false }; commandInFlight = true; return { ready: true, revision: 14 }; },
    // The real cloud gate retains its lease while recovery is pending.
    complete: async () => false, fail: async () => { commandInFlight = false; },
  }, addEventListener() {}, dispatchEvent() {} },
});
commandContext.globalThis = commandContext;
vm.runInContext(catalog, commandContext, { filename: "player-world-command-catalog.js#b5-settlement" });
commandContext.window.__BAEKJI_PLAYER_WORLD_COMMAND_CATALOG__ = commandContext.__BAEKJI_PLAYER_WORLD_COMMAND_CATALOG__;
vm.runInContext(commandSource, commandContext, { filename: "player-world-commands.js#b5-settlement" });
await assert.rejects(() => commandContext.window.__BAEKJI_PLAYER_WORLD_COMMANDS__.dispatch(COMMAND, { partyId: "party-a" }), /WORLD_COMMAND_SYNC_NOT_READY/, "unsettled B5 success stays pending instead of releasing UI success");
await assert.rejects(() => commandContext.window.__BAEKJI_PLAYER_WORLD_COMMANDS__.dispatch(COMMAND, { partyId: "party-a" }), /WORLD_COMMAND_SYNC_NOT_READY/);
assert.equal(pendingRequests.length, 1, "settlement-pending B5 retry creates zero additional HTTP requests");

console.log("PASS: B5 accept-invite command boundary is authoritative, fail-closed, and single-owner");
