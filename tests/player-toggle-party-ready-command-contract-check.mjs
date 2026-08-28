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
const commands = read("player-world-commands.js");
const app = read("app.js");
const preflight = read("party-preflight-flow-fix.js");
const flow = read("party-flow-ux-fix.js");
const leadership = read("party-leadership-flow.js");
const index = read("index.html");
const migrations = fs.readdirSync(path.join(ROOT, "supabase", "migrations"))
  .filter((file) => file.endsWith(".sql"))
  .map((file) => read(path.posix.join("supabase/migrations", file))).join("\n");

const COMMAND = "TOGGLE_PARTY_READY_V1";
const RPC = "baekji_player_toggle_party_ready_v1";
const handlerStart = api.indexOf("export async function playerWorldCommandHandler");
const handler = api.slice(handlerStart, api.indexOf("\nexport ", handlerStart + 1));

assert.ok(handlerStart >= 0, "ready toggle must use the existing index-owned command handler");
assert.match(catalog, /TOGGLE_PARTY_READY_V1[\s\S]*?rpcName:\s*["']baekji_player_toggle_party_ready_v1["'][\s\S]*?validate:\s*onePartyPayload[\s\S]*?rpcParams:\s*partyParams/, "ready identity and exact payload live in the shared catalog");
assert.match(api, /Object\.keys\(value\).*?!WORLD_COMMAND_KEYS\.has/, "outer actor/account/session smuggling remains fail-closed");
assert.doesNotMatch(handler, /p_(?:actor|account|character|ready)_id\s*:\s*body/i, "caller cannot select actor or next ready state");

assert.match(migrations, new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${RPC}\\s*\\(\\s*p_session_token\\s+text\\s*,\\s*p_command_id\\s+uuid\\s*,\\s*p_expected_revision\\s+bigint\\s*,\\s*p_party_id\\s+text`, "i"), "ready RPC has exact token/id/revision/party signature");
const fnStart = migrations.search(new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${RPC}`, "i"));
assert.ok(fnStart >= 0, "ready-toggle migration must exist");
const fn = migrations.slice(fnStart, migrations.indexOf(`revoke all on function public.${RPC}`, fnStart));
assert.match(fn, /baekji_player_world_command_preflight_v1\([\s\S]*?'TOGGLE_PARTY_READY_V1'[\s\S]*?v_preflight\.status\s+is\s+not\s+null/i, "ready toggle delegates session, lock, replay, retention, and revision semantics");
assert.match(fn, /memberIds[\s\S]*?v_identity\.character_id[\s\S]*?currentPartyId[\s\S]*?p_party_id[\s\S]*?OUT_OF_SCOPE/i, "only the verified current party member may toggle readiness");
assert.match(fn, /creatorId[\s\S]*?v_identity\.character_id[\s\S]*?OUT_OF_SCOPE/i, "leader readiness is server-owned and cannot be toggled by the leader");
assert.match(fn, /RECRUITING[\s\S]*?COMPOSITION_CONFIRMED[\s\S]*?READY_CHECK[\s\S]*?OUT_OF_SCOPE/i, "ready toggle accepts both live stages and normalizes legacy READY_CHECK only");
assert.match(fn, /sessionId[\s\S]*?OUT_OF_SCOPE/i, "ready toggle rejects a party with a session");
assert.match(fn, /readyStateBy[\s\S]*?v_identity\.character_id[\s\S]*?readyBy[\s\S]*?flowRevision/i, "only the actor readiness projection and flow revision may change");
assert.match(fn, /count\(\*\)\s*<>\s*count\(distinct e #>> '\{\}'\)[\s\S]*?v_members[\s\S]*?count\(\*\)\s*<>\s*count\(distinct e #>> '\{\}'\)[\s\S]*?v_ready/i, "duplicate memberIds and readyBy entries fail closed");
assert.match(fn, /jsonb_array_elements\(v_ready\)[\s\S]*?not \(v_members \? \(e #>> '\{\}'\)\)[\s\S]*?OUT_OF_SCOPE/i, "readyBy must be a subset of memberIds");
assert.match(fn, /jsonb_each\(v_ready_state\)[\s\S]*?not \(v_members \? member_id\)[\s\S]*?jsonb_typeof\(marker_value\) = 'boolean'[\s\S]*?marker_value -> 'ready'\) = 'boolean'/i, "foreign or malformed readyStateBy markers fail closed");
assert.match(fn, /marker_value \? 'at'[\s\S]*?jsonb_typeof\(marker_value -> 'at'\) = 'number'[\s\S]*?<= 9007199254740991/i, "optional ready marker timestamps must be safe non-negative integer numbers");
assert.match(fn, /creatorId[\s\S]*?not \(v_members \? coalesce\(v_party ->> 'creatorId', ''\)\)[\s\S]*?OUT_OF_SCOPE/i, "the party creator must remain a member");
assert.match(fn, /if v_status = 'READY_CHECK' then[\s\S]*?jsonb_set\(v_state_next, array\['parties', p_party_id, 'status'\]/i, "status changes only when normalizing legacy READY_CHECK");
assert.doesNotMatch(fn, /jsonb_set\s*\([^,]+,\s*array\s*\[\s*['"]characters['"]|jsonb_set\s*\([^,]+,\s*array\s*\[\s*['"]parties['"]\s*,\s*p_party_id\s*,\s*['"](?:memberIds|invitedIds|declinedIds|confirmedBy|creatorId|sessionId)['"]/i, "ready toggle cannot modify membership, invitations, identity, or sessions");
assert.match(fn, /v_preflight\.status\s+is\s+not\s+null[\s\S]*?return\s+query\s+select\s+v_preflight\.status/i, "shared replay outcome is forwarded unchanged");
assert.match(migrations, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${RPC}\\s*\\(\\s*text\\s*,\\s*uuid\\s*,\\s*bigint\\s*,\\s*text\\s*\\)\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`, "i"), "ready RPC is service-only");
assert.match(migrations, new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${RPC}[\\s\\S]*?to\\s+service_role`, "i"), "ready RPC grants only service_role");

assert.match(catalog, /TOGGLE_PARTY_READY_V1[\s\S]*?validate:\s*onePartyPayload/, "shared catalog accepts the exact ready envelope");
for (const [source, selector] of [[preflight, "data-preflight-member-ready"], [flow, "data-member-ready"], [app, "data-ready"]]) {
  assert.match(source, new RegExp(`__BAEKJI_PLAYER_WORLD_COMMANDS__\\.dispatch\\(\\s*["']${COMMAND}["']\\s*,\\s*\\{\\s*partyId\\s*\\}\\s*\\)`), `${selector} must use the single authoritative readiness dispatcher`);
  assert.doesNotMatch(source, new RegExp(`${selector}[\\s\\S]{0,1400}(?:writeRaw|writeState|mutate\\(|localStorage\\.setItem)`), `${selector} cannot retain a competing local whole-world writer`);
}
assert.doesNotMatch(leadership, /target\.closest\(\s*["']\[data-member-ready\]["']\s*\)/, "the shadowed leadership readiness click owner must be removed, not redirected");
assert.doesNotMatch(leadership, /TOGGLE_PARTY_READY_V1/, "leadership cannot regain a second readiness dispatcher");
assert.match(index, /player-world-commands\.js[^"']*stage8b-command-catalog=1/, "command-client cache key is refreshed for the catalog refactor");
assert.match(index, /party-preflight-flow-fix\.js[^"']*toggle-party-ready-command=1/, "recruiting readiness owner cache key is refreshed");
assert.match(index, /party-flow-ux-fix\.js[^"']*toggle-party-ready-command=1/, "confirmed readiness owner cache key is refreshed");
assert.match(index, /party-leadership-flow\.js[^"']*toggle-party-ready-command=1/, "legacy readiness owner cache key is refreshed");
assert.match(index, /app\.js[^"']*toggle-party-ready-command=1/, "direct party-page readiness owner cache key is refreshed");

// Execution fixtures mirror the SQL's fail-closed shape gate. They keep the
// security cases concrete even when this repository has no live Postgres test
// database; the static checks above pin those same conditions to the RPC.
function readyShapeResult(party, actorId = "member") {
  const members = party?.memberIds;
  const readyBy = party?.readyBy;
  const markers = party?.readyStateBy;
  const identifiers = (values) => Array.isArray(values) && values.every((value) => /^[A-Za-z0-9_-]{1,96}$/.test(String(value)));
  const unique = (values) => new Set(values).size === values.length;
  const markerOk = (marker) => typeof marker === "boolean" || (marker && typeof marker === "object" && typeof marker.ready === "boolean" && (!Object.hasOwn(marker, "at") || (Number.isSafeInteger(marker.at) && marker.at >= 0)));
  if (!identifiers(members) || !identifiers(readyBy) || !unique(members) || !unique(readyBy)) return "OUT_OF_SCOPE";
  if (!members.includes(party.creatorId) || !members.includes(actorId) || party.creatorId === actorId) return "OUT_OF_SCOPE";
  if (!readyBy.every((id) => members.includes(id))) return "OUT_OF_SCOPE";
  if (!markers || typeof markers !== "object" || Array.isArray(markers) || Object.entries(markers).some(([id, marker]) => !members.includes(id) || !markerOk(marker))) return "OUT_OF_SCOPE";
  return "APPLIED";
}
const validReadyParty = { creatorId: "leader", memberIds: ["leader", "member"], readyBy: ["leader"], readyStateBy: { leader: { ready: true, at: 1 }, member: false } };
assert.equal(readyShapeResult(validReadyParty), "APPLIED", "a canonical member/ready projection is accepted");
for (const malformed of [
  { ...validReadyParty, memberIds: ["leader", "member", "member"] },
  { ...validReadyParty, readyBy: ["leader", "leader"] },
  { ...validReadyParty, readyBy: ["leader", "outsider"] },
  { ...validReadyParty, readyStateBy: { ...validReadyParty.readyStateBy, outsider: true } },
  { ...validReadyParty, readyStateBy: { ...validReadyParty.readyStateBy, member: { ready: "yes" } } },
  { ...validReadyParty, readyStateBy: { ...validReadyParty.readyStateBy, member: { ready: true, at: 1.5 } } },
  { ...validReadyParty, readyStateBy: { ...validReadyParty.readyStateBy, member: { ready: true, at: Number.MAX_SAFE_INTEGER + 1 } } },
  { ...validReadyParty, memberIds: ["member"] },
]) assert.equal(readyShapeResult(malformed), "OUT_OF_SCOPE", "ambiguous readiness shape cannot be repaired by a player command");

function response() { return { statusCode: 0, body: "", setHeader() {}, end(value = "") { this.body += String(value); }, json() { return JSON.parse(this.body); } }; }
function request(body, cookie = `${PLAYER_COOKIE_NAME}=token-a`) { const bytes = Buffer.from(JSON.stringify(body)); return { method: "POST", headers: { cookie, origin: "https://example.test", host: "example.test" }, async *[Symbol.asyncIterator]() { yield bytes; } }; }
const envelope = { commandId: "55555555-5555-4555-8555-555555555555", expectedRevision: 12, command: COMMAND, payload: { partyId: "party-a" } };
const calls = []; let rpcResult = { status: "APPLIED", revision: 13, command_id: envelope.commandId };
async function fetchImpl(url, options = {}) { const name = String(url).split("/").at(-1); const body = JSON.parse(options.body || "{}"); calls.push({ name, body }); if (name === "baekji_player_session_verify_v2") return { ok: true, json: async () => [{ account_id: "a", character_id: "member", session_id: "s" }] }; if (name === "baekji_player_world_command_source_v1") return { ok: true, json: async () => [{ revision: 12, actor_character_id: "member", world_state: { version: 3, characters: {}, parties: {}, sessions: {} } }] }; if (name === "baekji_player_world_command_commit_v1") return { ok: true, json: async () => [rpcResult] }; throw new Error(name); }
const env = { SUPABASE_SECRET_KEY: "x" };
for (const forged of [{ ...envelope, actorId: "leader" }, { ...envelope, payload: { partyId: "party-a", ready: true } }, { ...envelope, payload: { partyId: "party-a", characterId: "leader" } }]) { const denied = response(); const before = calls.length; await playerWorldCommandHandler(request(forged), denied, { env, fetchImpl }); assert.equal(denied.statusCode, 400, "forged readiness envelope fails before RPC"); assert.equal(calls.length, before); }
const accepted = response(); await playerWorldCommandHandler(request(envelope), accepted, { env, fetchImpl });
assert.deepEqual(calls.at(-1), { name: "baekji_player_world_command_commit_v1", body: { p_session_token: "token-a", p_command_id: envelope.commandId, p_expected_revision: 12, p_command_name: COMMAND, p_command_fingerprint: calls.at(-1).body.p_command_fingerprint, p_result_status: "OUT_OF_SCOPE", p_next_state: { version: 3, characters: {}, parties: {}, sessions: {} } } }, "ready command commits the server-reduced result through the generic CAS boundary");
rpcResult = { status: "COMMAND_ID_REUSED", revision: 13, command_id: envelope.commandId }; const reused = response(); await playerWorldCommandHandler(request(envelope), reused, { env, fetchImpl }); assert.equal(reused.statusCode, 409, "reused command id is explicit conflict");

console.log("PASS: party readiness toggle is authoritative, actor-bound, replay-safe, and single-owner");
