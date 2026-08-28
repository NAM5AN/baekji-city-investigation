import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLAYER_COOKIE_NAME } from "../api/_player-auth.mjs";
import { playerWorldCommandHandler } from "../api/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const api = read("api/index.mjs");
const catalog = read("player-world-command-catalog.js");
const app = read("app.js");
const party = read("party-flow-sync.js");
const commands = read("player-world-commands.js");
const index = read("index.html");
const migrations = fs.readdirSync(path.join(ROOT, "supabase", "migrations"))
  .filter((file) => file.endsWith(".sql"))
  .map((file) => read(path.posix.join("supabase/migrations", file))).join("\n");

const DECLINE = "DECLINE_PARTY_INVITE_V1";
const commandStart = api.indexOf("export async function playerWorldCommandHandler");
assert.ok(commandStart >= 0);
const commandSlice = api.slice(commandStart, api.indexOf("\nexport ", commandStart + 1) > commandStart ? api.indexOf("\nexport ", commandStart + 1) : api.length);
assert.match(catalog, /DECLINE_PARTY_INVITE_V1[\s\S]*?rpcName:\s*["']baekji_player_decline_party_invite_v1["']/, "B2 identity/transport live in the shared catalog");
assert.match(catalog, /DECLINE_PARTY_INVITE_V1[\s\S]*?validate:\s*onePartyPayload[\s\S]*?rpcParams:\s*partyParams/, "B2 catalog payload is exactly {partyId}");
assert.doesNotMatch(commandSlice, /p_(?:character|actor|account|session)_id\s*:\s*body/i, "actor identity must never be selected from B2 body fields");
assert.doesNotMatch(commandSlice, /\.\.\.body|JSON\.stringify\(body\)/, "B2 may not forward an arbitrary body to RPC");
assert.match(api, /Object\.keys\(value\).*?!WORLD_COMMAND_KEYS\.has/, "the strict outer envelope must reject actor-smuggling fields");

const responseMatcher = /new Set\(\["APPLIED", "NOOP", "REPLAY", "REVISION_CONFLICT", "OUT_OF_SCOPE", "COMMAND_ID_REUSED"\]\)/;
assert.match(api, responseMatcher, "B2 response remains a small status/revision/commandId allowlist");
assert.match(commandSlice, /return\s+sendJson\(response,\s*200,\s*metadata\s*\?\s*\{\s*\.\.\.result,\s*metadata\s*\}\s*:\s*result\)/, "B2 response is derived from the narrow commit result, not a canonical snapshot");
assert.doesNotMatch(commandSlice, /sendJson\(response,\s*200,\s*\{[^}]*\b(?:state|characters|parties|sessions)\s*:/i, "B2 response must not disclose a whole world snapshot");

assert.match(migrations, /create\s+(?:or\s+replace\s+)?function\s+public\.baekji_player_decline_party_invite_v1\s*\(\s*p_session_token\s+text\s*,\s*p_command_id\s+uuid\s*,\s*p_expected_revision\s+bigint\s*,\s*p_party_id\s+text/i, "B2 SQL signature is token, command id, revision, and target party only");
assert.match(migrations, /from\s+public\.baekji_player_session_verify_v2\(p_session_token\)/i, "SQL must derive the actor from the server session");
assert.match(migrations, /for\s+update/i, "B2 must row-lock ledger/world state before revision or replay decisions");
assert.match(migrations, /p_expected_revision\s*<>\s*v_world\.revision/i, "B2 must reject stale optimistic revisions before a world mutation");
assert.match(migrations, /command_fingerprint|payload_fingerprint/i, "ledger must retain an immutable command fingerprint");
assert.match(migrations, /COMMAND_ID_REUSED/i, "same command id with a different command/payload must be rejected, never replayed");
assert.match(migrations, /v_(?:invited|members)\s*\?\s*v_identity\.character_id/i, "B2 must distinguish an invited actor from outsider/member attempts");
assert.match(migrations, /creatorId[\s\S]*?OUT_OF_SCOPE/i, "party leader may not decline an invite as another actor");
assert.match(migrations, /RECRUITING[\s\S]*?COMPOSITION_CONFIRMED/i, "B2 must restrict decline to invitation-capable party statuses");

const declineFnStart = migrations.search(/create\s+(?:or\s+replace\s+)?function\s+public\.baekji_player_decline_party_invite_v1/i);
assert.ok(declineFnStart >= 0);
const declineFn = migrations.slice(declineFnStart, migrations.indexOf("revoke all on function public.baekji_player_decline_party_invite_v1", declineFnStart));
const briefingFnStart = migrations.search(/create\s+(?:or\s+replace\s+)?function\s+public\.baekji_player_confirm_briefing_v1/i);
assert.ok(briefingFnStart >= 0);
const briefingFn = migrations.slice(briefingFnStart, migrations.indexOf("revoke all on function public.baekji_player_confirm_briefing_v1", briefingFnStart));
for (const [label, fn] of [["B1 briefing", briefingFn], ["B2 decline", declineFn]]) {
  assert.match(fn, /v_preflight\.status\s+is\s+not\s+null[\s\S]*?return\s+query\s+select\s+v_preflight\.status/i, `${label}: shared envelope statuses are forwarded unchanged`);
}
assert.match(declineFn, /jsonb_set[\s\S]*?array\s*\[\s*['"]parties['"]\s*,\s*p_party_id\s*,\s*['"]invitedIds['"]\s*\]/i, "B2 may mutate the target party invitedIds path");
assert.match(declineFn, /jsonb_set[\s\S]*?array\s*\[\s*['"]parties['"]\s*,\s*p_party_id\s*,\s*['"]declinedIds['"]\s*\]/i, "B2 may mutate the target party declinedIds path");
assert.doesNotMatch(declineFn, /jsonb_set\s*\([^,]+,\s*array\s*\[\s*['"](?:characters|sessions)['"]/i, "B2 must not mutate characters or sessions");
assert.doesNotMatch(declineFn, /jsonb_set\s*\([^,]+,\s*array\s*\[\s*['"]parties['"]\s*,\s*p_party_id\s*,\s*['"](?:memberIds|confirmedBy|readyBy|readyStateBy|status|sessionId)['"]/i, "B2 must mutate only the two invitation paths");
assert.match(declineFn, /coalesce\s*\(\s*v_world\.state\s*#>>\s*array\s*\[\s*['"]parties['"]\s*,\s*p_party_id\s*,\s*['"]status['"]\s*\]\s*,\s*['"]['"]\s*\)\s+not\s+in/i, "a missing/null party status must be an explicit out-of-scope rejection");
assert.match(declineFn, /memberIds[\s\S]*?v_identity\.character_id/i, "an already-member actor must be rejected even if a malformed snapshot lacks currentPartyId");
assert.match(migrations, /revoke\s+all\s+on\s+function\s+public\.baekji_player_decline_party_invite_v1\s*\(\s*text\s*,\s*uuid\s*,\s*bigint\s*,\s*text\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i, "B2 RPC is service-only");
assert.match(migrations, /grant\s+execute\s+on\s+function\s+public\.baekji_player_decline_party_invite_v1\s*\(\s*text\s*,\s*uuid\s*,\s*bigint\s*,\s*text\s*\)\s+to\s+service_role/i, "B2 RPC grants service_role only");

assert.match(migrations, /create\s+index\s+if\s+not\s+exists\s+baekji_player_world_command_ledger_actor_created_idx\s+on\s+public\.baekji_player_world_command_ledger\s*\(\s*actor_account_id\s*,\s*created_at\s+desc\s*,\s*command_id\s*\)/i, "ledger retention needs the exact actor/recent-command index");
assert.doesNotMatch(migrations, /baekji_player_world_command_ledger_prune_v1/i, "retention must be enforced by each command, not an unreserved maintenance RPC");
assert.match(migrations, /created_at\s*<\s*now\(\)\s*-\s*interval\s*'30 days'/i, "every command must prune ledger entries older than 30 days");
assert.match(migrations, /offset\s+511/i, "per-actor retention must retain at most the most recent 512 command rows");
assert.match(migrations, /actor_account_id\s*=\s*v_identity\.account_id/i, "retention must be actor-scoped; one player cannot evict another's replay evidence");
assert.match(declineFn, /baekji_player_world_command_preflight_v1\([\s\S]*?'DECLINE_PARTY_INVITE_V1'[\s\S]*?baekji_player_world_command_record_v1\([\s\S]*?'DECLINE_PARTY_INVITE_V1'/i, "B2 delegates shared lock/replay retention and records its terminal result through the envelope");

const appDeclineStart = app.indexOf("function declineInvite(partyId)");
assert.ok(appDeclineStart >= 0);
const appDecline = app.slice(appDeclineStart, app.indexOf("\n  function ", appDeclineStart + 1));
assert.match(appDecline, /__BAEKJI_PLAYER_WORLD_COMMANDS__\.dispatch\(\s*["']DECLINE_PARTY_INVITE_V1["']\s*,\s*\{\s*partyId\s*\}\s*\)/, "home decline must dispatch the B2 command once");
assert.doesNotMatch(appDecline, /(?:commitState|writeRaw|localStorage\.setItem|declineInviteState)\s*\(/, "home decline must not locally persist a competing world write");
assert.match(appDecline, /if\s*\(\s*\[["']APPLIED["']\s*,\s*["']NOOP["']\s*,\s*["']REPLAY["']\s*\]\.includes\(result\?\.status\)\s*\)\s*\{[\s\S]*?toast\(\s*["']초대를 거절했습니다\.["']\s*\)/, "home decline may show success only for applied/no-op/replay");
assert.match(appDecline, /result\?\.status\s*===\s*["']REVISION_CONFLICT["'][\s\S]*?최신 상태를 확인한 뒤 다시 시도/, "home decline must guide conflicts to retry, not success");
const partyDeclineStart = party.indexOf("function declineInvitation(partyId)");
assert.ok(partyDeclineStart >= 0);
const partyDecline = party.slice(partyDeclineStart, party.indexOf("\n  async function", partyDeclineStart));
assert.match(partyDecline, /__BAEKJI_PLAYER_WORLD_COMMANDS__\.dispatch\(\s*["']DECLINE_PARTY_INVITE_V1["']\s*,\s*\{\s*partyId\s*\}\s*\)/, "modal decline must dispatch the same B2 command once");
assert.doesNotMatch(partyDecline, /(?:writeState|writeRaw|localStorage\.setItem|declineInviteState)\s*\(/, "modal decline must not locally persist a competing world write");
assert.match(partyDecline, /if\s*\(\s*\[["']APPLIED["']\s*,\s*["']NOOP["']\s*,\s*["']REPLAY["']\s*\]\.includes\(result\?\.status\)\s*\)\s*\{[\s\S]*?clearDeferredInvite\([\s\S]*?clearInvitationModal\(/, "modal decline may clear deferred/modal only for applied/no-op/replay");
assert.match(partyDecline, /result\?\.status\s*===\s*["']REVISION_CONFLICT["'][\s\S]*?(?:console\.warn|toast)/, "modal decline must preserve invitation/modal for a revision conflict");
assert.match(catalog, /DECLINE_PARTY_INVITE_V1/, "shared catalog explicitly allows B2");
assert.match(index, /player-world-commands\.js[^"']*stage8b-command-catalog=1/, "B2 remains available through the current shared command-client cache revision");
assert.doesNotMatch(party, /\[data-party-flow-decline\]\s*,\s*\[data-decline\]/, "party-flow must not capture the app-owned bare [data-decline] click and double-dispatch B2");
assert.match(api, /if\s*\(result\.status\s*===\s*["']COMMAND_ID_REUSED["']\)\s*return\s+sendJson\(response,\s*409\s*,\s*\{\s*ok:\s*false\s*,\s*code:\s*["']COMMAND_ID_REUSED["']\s*\}\s*\)/, "same command id with another payload must be an explicit HTTP 409 conflict");
assert.match(commands, /if\s*\(!response\.ok\s*\|\|\s*!payload\?\.ok\)\s*\{[\s\S]*?throw error;/, "a 409 command-id reuse must reject before the client can publish an applied event");

function deferred() { let resolve; let reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; }
function extractFunction(source, startToken, endToken) {
  const start = source.indexOf(startToken); const end = source.indexOf(endToken, start);
  assert.ok(start >= 0 && end > start, `cannot extract ${startToken}`);
  return source.slice(start, end);
}
const homeCalls = []; const homeFirst = deferred(); let homeAttempt = 0;
const homeWindow = { __BAEKJI_PLAYER_WORLD_COMMANDS__: { dispatch: () => { homeCalls.push(++homeAttempt); return homeAttempt === 1 ? homeFirst.promise : homeAttempt === 2 ? Promise.reject(new Error("offline")) : Promise.resolve({ status: "REPLAY" }); } } };
const homeFn = new Function("currentUserId", "loadState", "toast", "window", `"use strict"; ${extractFunction(app, "const declineInviteInFlight", "  function partyStep")}; return declineInvite;`)(() => "actor-a", () => ({ parties: { "party-a": {} } }), () => {}, homeWindow);
const homePendingA = homeFn("party-a"); const homePendingB = homeFn("party-a");
assert.equal(homeCalls.length, 1, "two rapid home declines for one party must dispatch once");
homeFirst.resolve({ status: "APPLIED" }); await Promise.all([homePendingA, homePendingB]);
await homeFn("party-a"); assert.equal(homeCalls.length, 2, "home decline guard must release after success");
await homeFn("party-a"); assert.equal(homeCalls.length, 3, "home decline guard must release after failure too");

const modalCalls = []; const modalFirst = deferred(); let modalAttempt = 0;
const modalFn = new Function("currentUserId", "readState", "clearDeferredInvite", "clearInvitationModal", "console", "window", `"use strict"; const declineInvitationInFlight = new Set(); ${extractFunction(party, "async function declineInvitation", "  async function confirmBriefing")}; return declineInvitation;`)(
  () => "actor-a", () => ({ parties: { "party-a": {} } }), () => {}, () => {}, { warn() {} }, { __BAEKJI_PLAYER_WORLD_COMMANDS__: { dispatch: () => { modalCalls.push(++modalAttempt); return modalAttempt === 1 ? modalFirst.promise : modalAttempt === 2 ? Promise.reject(new Error("offline")) : Promise.resolve({ status: "NOOP" }); } } },
);
const modalPendingA = modalFn("party-a"); const modalPendingB = modalFn("party-a");
assert.equal(modalCalls.length, 1, "two rapid modal declines for one party must dispatch once");
modalFirst.resolve({ status: "APPLIED" }); await Promise.all([modalPendingA, modalPendingB]);
await modalFn("party-a"); assert.equal(modalCalls.length, 2, "modal decline guard must release after success");
await modalFn("party-a"); assert.equal(modalCalls.length, 3, "modal decline guard must release after failure too");

function response() { return { statusCode: 0, headers: {}, body: "", setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }, end(v = "") { this.body += String(v); }, json() { return JSON.parse(this.body); } }; }
function request(body, { cookie = `${PLAYER_COOKIE_NAME}=token-a`, origin = "https://example.test" } = {}) { const bytes = Buffer.from(JSON.stringify(body)); return { method: "POST", url: "/api/player-world-command", headers: { cookie, origin, host: "example.test" }, async *[Symbol.asyncIterator]() { yield bytes; } }; }
const rpcCalls = [];
const env = { SUPABASE_SECRET_KEY: "test-server-secret" };
let declineResult = { status: "APPLIED", revision: 14, command_id: "11111111-1111-4111-8111-111111111111" };
async function fetchImpl(url, options = {}) {
  const name = String(url).split("/").at(-1); const body = JSON.parse(options.body || "{}"); rpcCalls.push({ name, body });
  if (name === "baekji_player_session_verify_v2") return { ok: true, status: 200, json: async () => [{ account_id: "account-a", character_id: "actor-a", session_id: "session-a" }] };
  if (name === "baekji_player_world_command_source_v1") return { ok: true, status: 200, json: async () => [{ revision: 13, actor_character_id: "actor-a", character_names: {}, world_state: { version: 3, characters: { "actor-a": { id: "actor-a" } }, parties: { "party-a": { id: "party-a", creatorId: "leader-a", memberIds: ["leader-a"], invitedIds: ["actor-a"], declinedIds: [], status: "RECRUITING" } }, sessions: {} } }] };
  if (name === "baekji_player_world_command_commit_v1") return { ok: true, status: 200, json: async () => [declineResult] };
  throw new Error(`unexpected RPC ${name}`);
}
const envelope = { commandId: "11111111-1111-4111-8111-111111111111", expectedRevision: 13, command: DECLINE, payload: { partyId: "party-a" } };
const ok = response(); await playerWorldCommandHandler(request(envelope), ok, { env, fetchImpl });
assert.equal(ok.statusCode, 200);
assert.deepEqual(ok.json(), { ok: true, status: "APPLIED", revision: 14, commandId: envelope.commandId });
assert.equal(rpcCalls.at(-1).name, "baekji_player_world_command_commit_v1", "B2 now reaches the shared server commit boundary after canonical source reduction");
assert.equal(rpcCalls.at(-1).body.p_session_token, "token-a");
assert.equal(rpcCalls.at(-1).body.p_command_id, envelope.commandId);
assert.equal(rpcCalls.at(-1).body.p_expected_revision, 13);
assert.equal(rpcCalls.at(-1).body.p_command_name, DECLINE);
declineResult = { status: "REPLAY", revision: 14, command_id: envelope.commandId };
const replay = response(); await playerWorldCommandHandler(request(envelope), replay, { env, fetchImpl });
assert.deepEqual(replay.json(), { ok: true, status: "REPLAY", revision: 14, commandId: envelope.commandId }, "same command id and payload surface the ledger replay result without a second local mutation");
declineResult = { status: "OUT_OF_SCOPE", revision: 14, command_id: envelope.commandId };
const storedFailure = response(); await playerWorldCommandHandler(request(envelope), storedFailure, { env, fetchImpl });
assert.deepEqual(storedFailure.json(), { ok: true, status: "OUT_OF_SCOPE", revision: 14, commandId: envelope.commandId }, "a replayed SQL OUT_OF_SCOPE result must reach the UI as OUT_OF_SCOPE, never as a success-looking REPLAY");
declineResult = { status: "COMMAND_ID_REUSED", revision: 14, command_id: envelope.commandId };
const reused = response(); await playerWorldCommandHandler(request({ ...envelope, payload: { partyId: "party-b" } }), reused, { env, fetchImpl });
assert.equal(reused.statusCode, 409, "same command id with a different payload must be reported as an HTTP conflict");
assert.deepEqual(reused.json(), { ok: false, code: "COMMAND_ID_REUSED" }, "same command id with a different payload surfaces a rejection, never a replay");
for (const forged of [
  { ...envelope, actorId: "actor-b" },
  { ...envelope, payload: { partyId: "party-a", characterId: "actor-b" } },
  { ...envelope, payload: { partyId: "" } },
]) {
  const denied = response(); const before = rpcCalls.length; await playerWorldCommandHandler(request(forged), denied, { env, fetchImpl });
  assert.equal(denied.statusCode, 400, "actor-smuggling/invalid B2 envelopes must fail before session/RPC"); assert.equal(rpcCalls.length, before);
}

console.log("PASS: B2 decline-invite command is narrow, actor-bound, idempotent, and retention-bounded");
