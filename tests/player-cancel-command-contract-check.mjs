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

const COMMAND = "CANCEL_PARTY_INVITE_V1";
const RPC = "baekji_player_cancel_party_invite_v1";
const handlerStart = api.indexOf("export async function playerWorldCommandHandler");
const handler = api.slice(handlerStart, api.indexOf("\nexport ", handlerStart + 1));
assert.ok(handlerStart >= 0, "B3 must remain routed by api/index.mjs, not a new Vercel function");
assert.equal(fs.existsSync(path.join(ROOT, "api", "player-cancel-party-invite.mjs")), false, "B3 must not add a fourteenth Vercel function");
assert.match(catalog, /CANCEL_PARTY_INVITE_V1[\s\S]*?rpcName:\s*["']baekji_player_cancel_party_invite_v1["'][\s\S]*?validate:\s*partyInviteePayload[\s\S]*?rpcParams:\s*partyInviteeParams/, "B3 identity, exact payload, and transport live in the shared catalog");
assert.doesNotMatch(handler, /p_(?:actor|account|character|session)_id\s*:\s*body/i, "B3 must derive actor/session identity solely from the cookie");
assert.match(api, /Object\.keys\(value\).*?!WORLD_COMMAND_KEYS\.has/, "B3 outer envelope must reject actor-smuggling extras");
assert.match(catalog, /CANCEL_PARTY_INVITE_V1[\s\S]*?validate:\s*partyInviteePayload/, "B3 payload is exactly {partyId, inviteeId}");

assert.match(migrations, new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${RPC}\\s*\\(\\s*p_session_token\\s+text\\s*,\\s*p_command_id\\s+uuid\\s*,\\s*p_expected_revision\\s+bigint\\s*,\\s*p_party_id\\s+text\\s*,\\s*p_invitee_id\\s+text`, "i"), "B3 needs the exact dedicated RPC signature");
const fnStart = migrations.search(new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${RPC}`, "i"));
assert.ok(fnStart >= 0, "B3 migration must define the dedicated RPC");
const cancelFn = migrations.slice(fnStart, migrations.indexOf(`revoke all on function public.${RPC}`, fnStart));
assert.match(cancelFn, /baekji_player_world_command_preflight_v1\([\s\S]*?'CANCEL_PARTY_INVITE_V1'[\s\S]*?v_preflight\.status\s+is\s+not\s+null/i, "B3 delegates session, lock, replay, retention, and revision handling to the shared envelope");
assert.match(cancelFn, /v_fingerprint\s*:=\s*encode\(digest\('CANCEL_PARTY_INVITE_V1:'\s*\|\|\s*p_party_id\s*\|\|\s*':'\s*\|\|\s*p_invitee_id/i, "B3 fingerprint binds command and both targets");
assert.match(cancelFn, /v_preflight\.status\s+is\s+not\s+null[\s\S]*?return\s+query\s+select\s+v_preflight\.status/i, "B3 forwards shared replay, conflict, and id-reuse statuses unchanged");
assert.match(cancelFn, /creatorId[\s\S]*?v_identity\.character_id[\s\S]*?OUT_OF_SCOPE/i, "B3 must reject outsider/non-leader cancellation");
assert.match(cancelFn, /memberIds[\s\S]*?v_identity\.character_id[\s\S]*?OUT_OF_SCOPE/i, "B3 must reject a creator record that is not a current party member");
assert.match(cancelFn, /characters[\s\S]*?v_identity\.character_id[\s\S]*?currentPartyId[\s\S]*?p_party_id[\s\S]*?OUT_OF_SCOPE/i, "B3 must require actor currentPartyId to match the target party");
assert.match(cancelFn, /coalesce\s*\(\s*v_world\.state\s*#>>\s*array\s*\[\s*['"]parties['"]\s*,\s*p_party_id\s*,\s*['"]status['"]\s*\]\s*,\s*['"]['"]\s*\)\s+not\s+in\s*\(\s*['"]RECRUITING['"]\s*,\s*['"]COMPOSITION_CONFIRMED['"]\s*\)/i, "B3 must fail closed for null/missing/non-invitation statuses");
assert.match(cancelFn, /coalesce\s*\(\s*v_world\.state\s*#>>\s*array\s*\[\s*['"]parties['"]\s*,\s*p_party_id\s*,\s*['"]sessionId['"]\s*\]\s*,\s*['"]['"]\s*\)\s*<>\s*['"]['"]/i, "B3 must reject nonempty party sessionId");
assert.match(cancelFn, /memberIds[\s\S]*?p_invitee_id[\s\S]*?OUT_OF_SCOPE/i, "B3 must never cancel an already joined member");
assert.match(cancelFn, /invitedIds[\s\S]*?p_invitee_id[\s\S]*?OUT_OF_SCOPE/i, "B3 must reject non-pending/stale target cancellation");
assert.match(cancelFn, /jsonb_set[\s\S]*?array\s*\[\s*['"]parties['"]\s*,\s*p_party_id\s*,\s*['"]invitedIds['"]\s*\]/i, "B3 may mutate invitedIds only");
assert.match(cancelFn, /jsonb_set[\s\S]*?array\s*\[\s*['"]parties['"]\s*,\s*p_party_id\s*,\s*['"]declinedIds['"]\s*\]/i, "B3 may mutate declinedIds only");
assert.doesNotMatch(cancelFn, /jsonb_set\s*\([^,]+,\s*array\s*\[\s*['"](?:characters|sessions)['"]|jsonb_set\s*\([^,]+,\s*array\s*\[\s*['"]parties['"]\s*,\s*p_party_id\s*,\s*['"](?:memberIds|confirmedBy|readyBy|readyStateBy|status|sessionId)['"]/i, "B3 must change exactly invitedIds and declinedIds");
assert.match(migrations, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${RPC}\\s*\\(\\s*text\\s*,\\s*uuid\\s*,\\s*bigint\\s*,\\s*text\\s*,\\s*text\\s*\\)\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`, "i"), "B3 RPC must remain service-only");
assert.match(migrations, new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${RPC}\\s*\\(\\s*text\\s*,\\s*uuid\\s*,\\s*bigint\\s*,\\s*text\\s*,\\s*text\\s*\\)\\s+to\\s+service_role`, "i"), "B3 grants execute only to service_role");

const cancelStart = app.indexOf("function cancelInvite(partyId, userId)");
const cancel = app.slice(cancelStart, app.indexOf("\n  function ", cancelStart + 1));
assert.ok(cancelStart >= 0, "B3 app cancel owner must exist");
assert.match(cancel, /__BAEKJI_PLAYER_WORLD_COMMANDS__\.dispatch\(\s*["']CANCEL_PARTY_INVITE_V1["']\s*,\s*\{\s*partyId\s*,\s*inviteeId:\s*userId\s*\}\s*\)/, "B3 app owner must dispatch the exact payload once");
assert.doesNotMatch(cancel, /(?:commitState|saveState|writeRaw|localStorage\.setItem|cancelInviteState)\s*\(/, "B3 app owner must not retain a competing local write");
assert.match(app, /cancelInviteInFlight\s*=\s*new\s+Set\(\)/, "B3 app owner needs a per-party rapid-click guard");
assert.match(cancel, /cancelInviteInFlight\.has\([^)]*\)[\s\S]*?cancelInviteInFlight\.add\([^)]*\)[\s\S]*?finally[\s\S]*?cancelInviteInFlight\.delete\([^)]*\)/, "B3 rapid-click guard must release after either completion or failure");
assert.doesNotMatch(party, /party-invite-cancel/, "B3 must have one click owner; party-flow must not capture app cancel cards");
assert.match(catalog, /CANCEL_PARTY_INVITE_V1/, "B3 shared catalog validates the cancel command");
assert.match(index, /player-world-commands\.js[^"']*stage8b-command-catalog=1/, "B3 command runtime receives the catalog-refactor cache revision");

function deferred() { let resolve; let reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; }
function cancelOwner() {
  const start = app.indexOf("const cancelInviteInFlight"); const end = app.indexOf("  const partyReadyInFlight", start);
  assert.ok(start >= 0 && end > start, "B3 guard must live outside cancelInvite and survive a second call");
  let calls = 0; let attempt = 0; const first = deferred();
  const window = { __BAEKJI_PLAYER_WORLD_COMMANDS__: { dispatch: () => { calls += 1; attempt += 1; return attempt === 1 ? first.promise : attempt === 2 ? Promise.reject(new Error("offline")) : Promise.resolve({ status: "REPLAY" }); } } };
  const fn = new Function("currentUserId", "toast", "render", "loadState", "commitState", "saveState", "window", `"use strict"; ${app.slice(start, end)}; return cancelInvite;`)(() => "leader-a", () => {}, () => {}, () => ({ parties: { "party-a": {} } }), () => { throw new Error("LOCAL_WRITE_FORBIDDEN"); }, () => { throw new Error("LOCAL_WRITE_FORBIDDEN"); }, window);
  return { fn, first, calls: () => calls };
}
const cancelOwnerRuntime = cancelOwner();
const pendingOne = cancelOwnerRuntime.fn("party-a", "invitee-a"); const pendingTwo = cancelOwnerRuntime.fn("party-a", "invitee-a");
assert.equal(cancelOwnerRuntime.calls(), 1, "two rapid B3 card calls must issue one dispatch");
cancelOwnerRuntime.first.resolve({ status: "APPLIED" }); await Promise.all([pendingOne, pendingTwo]);
await cancelOwnerRuntime.fn("party-a", "invitee-a"); assert.equal(cancelOwnerRuntime.calls(), 2, "B3 guard must release after success");
await cancelOwnerRuntime.fn("party-a", "invitee-a"); assert.equal(cancelOwnerRuntime.calls(), 3, "B3 guard must release after failure");
async function cancelOutcome(result) {
  const start = app.indexOf("const cancelInviteInFlight"); const end = app.indexOf("  const partyReadyInFlight", start);
  const toasts = []; let renders = 0; let localWrites = 0;
  const fn = new Function("currentUserId", "toast", "render", "loadState", "commitState", "saveState", "window", `"use strict"; ${app.slice(start, end)}; return cancelInvite;`)(
    () => "leader-a", (...args) => toasts.push(args), () => { renders += 1; }, () => ({ parties: { "party-a": {} } }), () => { localWrites += 1; }, () => { localWrites += 1; }, { __BAEKJI_PLAYER_WORLD_COMMANDS__: { dispatch: () => result instanceof Error ? Promise.reject(result) : Promise.resolve(result) } },
  );
  await fn("party-a", "invitee-a"); return { toasts, renders, localWrites };
}
for (const status of ["APPLIED", "NOOP", "REPLAY"]) {
  const outcome = await cancelOutcome({ status });
  assert.equal(outcome.toasts[0]?.[0], "초대를 취소했습니다.", `${status} is the only successful B3 cancellation UX`);
  assert.equal(outcome.renders + outcome.localWrites, 0, "B3 command outcome must not locally write/render competing state");
}
for (const status of ["REVISION_CONFLICT", "OUT_OF_SCOPE"]) {
  const outcome = await cancelOutcome({ status });
  assert.notEqual(outcome.toasts[0]?.[0], "초대를 취소했습니다.", `${status} must not look like a successful B3 cancellation`);
  assert.equal(outcome.renders + outcome.localWrites, 0, "B3 rejected outcome must not locally write/render");
}
const settling = await cancelOutcome(Object.assign(new Error("WORLD_COMMAND_SYNC_NOT_READY"), { settlementPending: true }));
assert.notEqual(settling.toasts[0]?.[0], "초대를 취소했습니다.", "pending authoritative settlement must not look successful");
assert.match(String(settling.toasts[0]?.[0]), /최신 상태를 확인/, "pending settlement must tell the player to wait for sync");
assert.equal(settling.renders + settling.localWrites, 0, "pending settlement must not locally write/render");

function response() { return { statusCode: 0, headers: {}, body: "", setHeader(key, value) { this.headers[String(key).toLowerCase()] = value; }, end(value = "") { this.body += String(value); }, json() { return JSON.parse(this.body); } }; }
function request(body) { const bytes = Buffer.from(JSON.stringify(body)); return { method: "POST", url: "/api/player-world-command", headers: { cookie: `${PLAYER_COOKIE_NAME}=token-a`, origin: "https://example.test", host: "example.test" }, async *[Symbol.asyncIterator]() { yield bytes; } }; }
const rpcCalls = [];
async function fetchImpl(url, options = {}) {
  const name = String(url).split("/").at(-1); const body = JSON.parse(options.body || "{}"); rpcCalls.push({ name, body });
  if (name === "baekji_player_session_verify_v2") return { ok: true, status: 200, json: async () => [{ account_id: "account-a", character_id: "leader-a", session_id: "session-a" }] };
  if (name === "baekji_player_world_command_source_v1") return { ok: true, status: 200, json: async () => [{ revision: 14, actor_character_id: "leader-a", character_names: {}, world_state: { version: 3, characters: { "leader-a": { id: "leader-a", currentPartyId: "party-a" } }, parties: { "party-a": { id: "party-a", creatorId: "leader-a", memberIds: ["leader-a"], invitedIds: ["invitee-a"], declinedIds: [], status: "RECRUITING", sessionId: null } }, sessions: {} } }] };
  if (name === "baekji_player_world_command_commit_v1") return { ok: true, status: 200, json: async () => [{ status: "APPLIED", revision: 15, command_id: "11111111-1111-4111-8111-111111111111" }] };
  throw new Error(`unexpected RPC ${name}`);
}
const envelope = { commandId: "11111111-1111-4111-8111-111111111111", expectedRevision: 14, command: COMMAND, payload: { partyId: "party-a", inviteeId: "invitee-a" } };
const accepted = response(); await playerWorldCommandHandler(request(envelope), accepted, { env: { SUPABASE_SECRET_KEY: "test-server-secret" }, fetchImpl });
assert.equal(accepted.statusCode, 200);
assert.equal(rpcCalls.at(-1).name, "baekji_player_world_command_commit_v1", "B3 commits through the shared reducer boundary");
assert.equal(rpcCalls.at(-1).body.p_session_token, "token-a");
assert.equal(rpcCalls.at(-1).body.p_command_name, COMMAND);
assert.equal(rpcCalls.at(-1).body.p_command_id, envelope.commandId);
for (const forged of [{ ...envelope, actorId: "leader-b" }, { ...envelope, payload: { partyId: "party-a", inviteeId: "invitee-a", accountId: "account-b" } }, { ...envelope, payload: { partyId: "party-a" } }]) {
  const denied = response(); const before = rpcCalls.length; await playerWorldCommandHandler(request(forged), denied, { env: { SUPABASE_SECRET_KEY: "test-server-secret" }, fetchImpl });
  assert.equal(denied.statusCode, 400, "B3 actor-smuggling or malformed payload must fail before RPC"); assert.equal(rpcCalls.length, before);
}

console.log("PASS: B3 cancel-invite command is actor-bound, ledger-safe, and single-owner");
