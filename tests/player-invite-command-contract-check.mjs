import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLAYER_COOKIE_NAME } from "../api/_player-auth.mjs";
import { playerWorldCommandHandler } from "../api/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const api = read("api/index.mjs"); const app = read("app.js"); const commands = read("player-world-commands.js"); const reinvite = read("party-reinvite-runtime-fix.js"); const membership = read("party-membership-ux-fix.js"); const index = read("index.html");
const catalog = read("player-world-command-catalog.js");
const sql = fs.readdirSync(path.join(ROOT, "supabase", "migrations")).filter((file) => file.endsWith(".sql")).map((file) => read(path.posix.join("supabase/migrations", file))).join("\n");
const COMMAND = "INVITE_PARTY_MEMBER_V1"; const RPC = "baekji_player_invite_party_member_v1";
const handlerStart = api.indexOf("export async function playerWorldCommandHandler"); const handler = api.slice(handlerStart, api.indexOf("\nexport ", handlerStart + 1));
assert.ok(handlerStart >= 0); assert.match(catalog, /INVITE_PARTY_MEMBER_V1[\s\S]*?rpcName:\s*["']baekji_player_invite_party_member_v1["'][\s\S]*?validate:\s*partyInviteePayload[\s\S]*?rpcParams:\s*partyInviteeParams/, "B4 identity, payload, and RPC transport are catalogued once");
assert.match(api, /Object\.keys\(value\).*?!WORLD_COMMAND_KEYS\.has/, "B4 rejects outer actor-smuggling");
assert.match(sql, new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${RPC}\\s*\\(\\s*p_session_token\\s+text\\s*,\\s*p_command_id\\s+uuid\\s*,\\s*p_expected_revision\\s+bigint\\s*,\\s*p_party_id\\s+text\\s*,\\s*p_invitee_id\\s+text`, "i"), "B4 exact dedicated RPC signature");
const start = sql.search(new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${RPC}`, "i")); assert.ok(start >= 0); const fn = sql.slice(start, sql.indexOf(`revoke all on function public.${RPC}`, start));
assert.match(fn, /baekji_player_world_command_preflight_v1\([\s\S]*?'INVITE_PARTY_MEMBER_V1'[\s\S]*?v_preflight\.status\s+is\s+not\s+null/i, "B4 delegates session, lock, replay, retention, and revision handling to the shared envelope");
assert.match(fn, /v_fingerprint\s*:=\s*encode\(digest\('INVITE_PARTY_MEMBER_V1:'\s*\|\|\s*p_party_id\s*\|\|\s*':'\s*\|\|\s*p_invitee_id/i, "B4 fingerprint binds both targets");
assert.match(fn, /v_preflight\.status\s+is\s+not\s+null[\s\S]*?return\s+query\s+select\s+v_preflight\.status/i, "B4 forwards shared replay, conflict, and id-reuse statuses unchanged");
assert.match(fn, /creatorId[\s\S]*?v_identity\.character_id[\s\S]*?memberIds[\s\S]*?v_identity\.character_id[\s\S]*?currentPartyId[\s\S]*?p_party_id/i, "B4 actor must be current leader and member of this party");
assert.match(fn, /coalesce[\s\S]*?status[\s\S]*?RECRUITING[\s\S]*?sessionId[\s\S]*?OUT_OF_SCOPE/i, "B4 must fail closed for status/session");
assert.match(fn, /characters[\s\S]*?p_invitee_id[\s\S]*?(?:is\s+null|not\s+found|OUT_OF_SCOPE)/i, "B4 must fail closed when the invitee character record does not exist");
assert.match(fn, /p_invitee_id[\s\S]*?currentPartyId[\s\S]*?memberIds[\s\S]*?OUT_OF_SCOPE/i, "B4 rejects stale/busy/already-member target");
assert.match(fn, /partyMembershipRemovals[\s\S]*?active[\s\S]*?membershipReinvitedAtBy[\s\S]*?p_invitee_id/i, "B4 derives active removal and stamps reinvite marker internally");
assert.match(fn, /v_removal\s+is\s+not\s+null[\s\S]*?jsonb_typeof\(v_removal\)\s*<>\s*['"]object['"][\s\S]*?OUT_OF_SCOPE/i, "B4 treats a present non-object tombstone as malformed rather than a fresh invite");
assert.match(fn, /v_removal\s+is\s+not\s+null[\s\S]*?jsonb_typeof\(v_removal\s*->\s*['"]active['"]\)\s*<>\s*['"]boolean['"][\s\S]*?OUT_OF_SCOPE/i, "B4 requires a present tombstone active field to be an exact JSON boolean");
assert.match(fn, /v_active_removal\s*:=\s*(?:v_removal\s+is\s+not\s+null\s+and\s*)?\(\s*v_removal\s*->\s*['"]active['"]\s*\)\s*=\s*['"]true['"]::jsonb/i, "B4 accepts an inactive false tombstone without applying the active-marker guards");
assert.match(fn, /v_active_removal[\s\S]*?v_removal\s*->>\s*['"]partyId['"][\s\S]*?p_party_id[\s\S]*?v_removal\s*->>\s*['"]memberId['"][\s\S]*?p_invitee_id[\s\S]*?OUT_OF_SCOPE/i, "B4 active tombstone metadata must match the requested party and invitee or fail closed");
assert.match(fn, /v_active_removal[\s\S]*?(?:v_removal_text\s*!~\s*['"][^'"]*[0-9]|v_removal_at\s*<=\s*0)[\s\S]*?OUT_OF_SCOPE/i, "B4 active tombstone needs a bounded positive numeric at before marker generation; malformed metadata fails closed");
assert.match(fn, /v_next_marker\s*:=\s*greatest\s*\(\s*(?:v_server_now|floor\s*\(\s*extract\s*\(\s*epoch\s+from\s+(?:clock_timestamp|statement_timestamp|now)\s*\(\s*\)\s*\)\s*\*\s*1000\s*\)\s*::bigint)\s*,\s*v_removal_at\s*\+\s*1\s*,\s*v_existing_marker\s*\)/i, "B4 active-removal marker must use greatest(server-time, removal.at + 1, existing marker) so it is both strictly later and monotonic");
assert.match(fn, /NOOP/i, "B4 existing valid pending invite and marker must be ledgered NOOP");
for (const pathName of ["invitedIds", "declinedIds", "membershipReinvitedAtBy"]) assert.match(fn, new RegExp(`jsonb_set[\\s\\S]*?array\\s*\\[\\s*['\"]parties['\"]\\s*,\\s*p_party_id\\s*,\\s*['\"]${pathName}['\"]`, "i"), `B4 conditional write includes ${pathName}`);
assert.doesNotMatch(fn, /jsonb_set\s*\([^,]+,\s*array\s*\[\s*['"](?:characters|sessions|partyMembershipRemovals)['"]|jsonb_set\s*\([^,]+,\s*array\s*\[\s*['"]parties['"]\s*,\s*p_party_id\s*,\s*['"](?:memberIds|confirmedBy|readyBy|readyStateBy|status|sessionId)['"]/i, "B4 must not mutate membership/session/tombstone state");
assert.match(sql, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${RPC}\\s*\\(\\s*text\\s*,\\s*uuid\\s*,\\s*bigint\\s*,\\s*text\\s*,\\s*text\\s*\\)\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`, "i"), "B4 RPC service-only");
const inviteStart = app.indexOf("function inviteUser(partyId, userId)"); const invite = app.slice(inviteStart, app.indexOf("\n  function ", inviteStart + 1));
assert.match(invite, /__BAEKJI_PLAYER_WORLD_COMMANDS__\.dispatch\(\s*["']INVITE_PARTY_MEMBER_V1["']\s*,\s*\{\s*partyId\s*,\s*inviteeId:\s*userId\s*\}\s*\)/, "app is B4 sole card owner");
assert.doesNotMatch(invite, /(?:commitState|saveState|writeRaw|inviteState|render)\s*\(/, "B4 invite owner has no local write/render");
assert.match(app, /inviteUserInFlight\s*=\s*new\s+Set\(\)/, "B4 card owner needs a durable rapid-click guard");
assert.match(invite, /inviteUserInFlight\.has\([^)]*\)[\s\S]*?inviteUserInFlight\.add\([^)]*\)[\s\S]*?finally[\s\S]*?inviteUserInFlight\.delete\([^)]*\)/, "B4 rapid-click guard must release after completion/failure");
assert.match(invite, /\["APPLIED",\s*"NOOP",\s*"REPLAY"\]\.includes\(result\?\.status\)[\s\S]*?toast\(/, "B4 success UX is limited to applied/no-op/replay");
assert.match(invite, /REVISION_CONFLICT[\s\S]*?다시 시도[\s\S]*?WORLD_COMMAND_SYNC_NOT_READY[\s\S]*?잠시 후/i, "B4 conflict and unsettled cloud command must show retry/wait guidance, not success");
assert.doesNotMatch(reinvite, /target\.closest\(\s*["']\[data-invite\]["']\s*\)[\s\S]{0,600}?(?:handleReinvite|writeState|persistence\.writeRaw)|(?:handleReinvite|stampReinvite)[\s\S]{0,600}?writeState\(\s*next\s*,\s*["']reinvite-atomic["']/, "B4 removes only the production [data-invite] capture/local marker writer; pure helper and repair code remain valid");
assert.doesNotMatch(membership, /function\s+stampReinvite[\s\S]*?(?:writeState|persistence\.writeRaw)|\[data-invite\][\s\S]*?(?:stampReinvite|markReinviteState)[\s\S]*?(?:writeState|persistence\.writeRaw)/, "only a production stamp/click writer is forbidden; pure marker helpers and read repair remain allowed");
assert.match(catalog, /INVITE_PARTY_MEMBER_V1/, "B4 catalog allowlists invite/reinvite exact payload");
assert.match(index, /player-world-commands\.js[^"']*stage8b-command-catalog=1/, "B4 command client receives the catalog-refactor cache revision");
assert.match(index, /party-reinvite-runtime-fix\.js[^"']*stage8b-b5=1/, "B4 removes the legacy reinvite production writer behind a fresh sidecar cache key");
assert.match(index, /party-membership-ux-fix\.js[^"']*stage8b-b5=1/, "B4 membership marker repair boundary uses a fresh cache key");

function deferred() { let resolve; let reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; }
function inviteOwner() {
  const ownerStart = app.indexOf("const inviteUserInFlight"); const ownerEnd = app.indexOf("const cancelInviteInFlight", ownerStart);
  assert.ok(ownerStart >= 0 && ownerEnd > ownerStart, "B4 must expose the guarded app sole-owner span");
  const toasts = []; let writes = 0; let calls = 0; let attempt = 0; const first = deferred();
  const fn = new Function("currentState", "partyAccount", "currentUserId", "toast", "commitState", "saveState", "render", "loadState", "window", `"use strict"; ${app.slice(ownerStart, ownerEnd)}; return inviteUser;`)(
    () => ({ characters: { "invitee-a": { currentPartyId: null } } }), () => ({ name: "invitee" }), () => "leader-a", (...args) => toasts.push(args), () => { writes += 1; }, () => { writes += 1; }, () => { writes += 1; }, () => ({ parties: { "party-a": {} } }), { __BAEKJI_PLAYER_WORLD_COMMANDS__: { dispatch: () => { calls += 1; attempt += 1; return attempt === 1 ? first.promise : attempt === 2 ? Promise.reject(new Error("offline")) : Promise.resolve({ status: "REPLAY" }); } } },
  );
  return { fn, first, toasts, writes: () => writes, calls: () => calls };
}
const inviteGuard = inviteOwner(); const pendingOne = inviteGuard.fn("party-a", "invitee-a"); const pendingTwo = inviteGuard.fn("party-a", "invitee-a");
assert.equal(inviteGuard.calls(), 1, "B4 same card rapid double click dispatches exactly once while the command is pending");
inviteGuard.first.resolve({ status: "APPLIED" }); await Promise.all([pendingOne, pendingTwo]);
await inviteGuard.fn("party-a", "invitee-a"); assert.equal(inviteGuard.calls(), 2, "B4 card guard releases after settlement");
await inviteGuard.fn("party-a", "invitee-a"); assert.equal(inviteGuard.calls(), 3, "B4 card guard releases after failure");
async function inviteOutcome(result) {
  const ownerStart = app.indexOf("const inviteUserInFlight"); const ownerEnd = app.indexOf("const cancelInviteInFlight", ownerStart); const toasts = []; let writes = 0;
  const fn = new Function("currentState", "partyAccount", "currentUserId", "toast", "commitState", "saveState", "render", "loadState", "window", `"use strict"; ${app.slice(ownerStart, ownerEnd)}; return inviteUser;`)(
    () => ({ characters: { "invitee-a": { currentPartyId: null } } }), () => ({ name: "invitee" }), () => "leader-a", (...args) => toasts.push(args), () => { writes += 1; }, () => { writes += 1; }, () => { writes += 1; }, () => ({ parties: { "party-a": {} } }), { __BAEKJI_PLAYER_WORLD_COMMANDS__: { dispatch: () => result instanceof Error ? Promise.reject(result) : Promise.resolve(result) } },
  );
  await fn("party-a", "invitee-a"); return { toasts, writes };
}
for (const status of ["APPLIED", "NOOP", "REPLAY"]) { const result = await inviteOutcome({ status }); assert.equal(result.toasts[0]?.[0], "초대를 전송했습니다.", `${status} is successful B4 UX`); assert.equal(result.writes, 0); }
for (const status of ["REVISION_CONFLICT", "OUT_OF_SCOPE"]) { const result = await inviteOutcome({ status }); assert.notEqual(result.toasts[0]?.[0], "초대를 전송했습니다.", `${status} must not look like a successful B4 invitation`); assert.equal(result.writes, 0); }
const settling = await inviteOutcome(Object.assign(new Error("WORLD_COMMAND_SYNC_NOT_READY"), { settlementPending: true })); assert.notEqual(settling.toasts[0]?.[0], "초대를 전송했습니다.", "pending authoritative settlement must not look successful"); assert.equal(settling.writes, 0);

function response() { return { statusCode: 0, body: "", setHeader() {}, end(value = "") { this.body += value; }, json() { return JSON.parse(this.body); } }; }
function request(body) { const bytes = Buffer.from(JSON.stringify(body)); return { method: "POST", headers: { cookie: `${PLAYER_COOKIE_NAME}=token-a`, origin: "https://example.test", host: "example.test" }, async *[Symbol.asyncIterator]() { yield bytes; } }; }
const calls = []; async function fetchImpl(url, options = {}) { const name = String(url).split("/").at(-1); const body = JSON.parse(options.body || "{}"); calls.push({ name, body }); if (name === "baekji_player_session_verify_v2") return { ok: true, json: async () => [{ account_id: "a", character_id: "leader", session_id: "s" }] }; if (name === "baekji_player_world_command_source_v1") return { ok: true, json: async () => [{ revision: 2, actor_character_id: "leader", character_names: {}, world_state: { version: 3, characters: { leader: { id: "leader", currentPartyId: "party-a" }, "invitee-a": { id: "invitee-a", currentPartyId: null } }, parties: { "party-a": { id: "party-a", creatorId: "leader", memberIds: ["leader"], invitedIds: [], declinedIds: [], status: "RECRUITING" } }, sessions: {} } }] }; if (name === "baekji_player_world_command_commit_v1") return { ok: true, json: async () => [{ status: "APPLIED", revision: 3, command_id: "11111111-1111-4111-8111-111111111111" }] }; throw new Error(name); }
const envelope = { commandId: "11111111-1111-4111-8111-111111111111", expectedRevision: 2, command: COMMAND, payload: { partyId: "party-a", inviteeId: "invitee-a" } }; const accepted = response(); await playerWorldCommandHandler(request(envelope), accepted, { env: { SUPABASE_SECRET_KEY: "x" }, fetchImpl });
assert.equal(calls.at(-1).name, "baekji_player_world_command_commit_v1", "B4 uses the shared source/reduce/commit transport");
assert.equal(calls.at(-1).body.p_command_name, COMMAND);
assert.equal(calls.at(-1).body.p_command_id, envelope.commandId);
for (const forged of [{ ...envelope, actorId: "leader-b" }, { ...envelope, payload: { partyId: "party-a", inviteeId: "invitee-a", accountId: "account-b" } }, { ...envelope, payload: { partyId: "party-a" } }]) {
  const denied = response(); const before = calls.length; await playerWorldCommandHandler(request(forged), denied, { env: { SUPABASE_SECRET_KEY: "x" }, fetchImpl });
  assert.equal(denied.statusCode, 400, "B4 actor-smuggling/malformed target payload must fail before RPC"); assert.equal(calls.length, before);
}
console.log("PASS: B4 invite/reinvite is authoritative, marker-safe, and single-owner");
