import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { PLAYER_COOKIE_NAME } from "../api/_player-auth.mjs";
import { playerWorldCommandHandler } from "../api/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const api = read("api/index.mjs");
const catalog = read("player-world-command-catalog.js");
const app = read("app.js");
const leadership = read("party-leadership-flow.js");
const commands = read("player-world-commands.js");
const index = read("index.html");
const migrations = fs.readdirSync(path.join(ROOT, "supabase", "migrations"))
  .filter((file) => file.endsWith(".sql")).map((file) => read(path.posix.join("supabase/migrations", file))).join("\n");

const COMMAND = "CREATE_PARTY_V1";
const RPC = "baekji_player_create_party_v1";
const handlerStart = api.indexOf("export async function playerWorldCommandHandler");
const handler = api.slice(handlerStart, api.indexOf("\nexport ", handlerStart + 1));
const createOwnerStart = leadership.indexOf("async function createPartyAfterWarning");
const createOwnerEnd = leadership.indexOf("function confirmMemberComposition", createOwnerStart);
const createOwnerSource = leadership.slice(createOwnerStart, createOwnerEnd);

assert.ok(handlerStart >= 0, "create must use the existing index-owned command handler");
assert.match(catalog, /CREATE_PARTY_V1[\s\S]*?rpcName:\s*["']baekji_player_create_party_v1["'][\s\S]*?validate:\s*emptyPayload[\s\S]*?rpcParams:\s*noParams/, "create identity and empty transport live in the shared catalog");
assert.match(api, /Object\.keys\(value\).*?!WORLD_COMMAND_KEYS\.has/, "caller actor/account/session fields remain fail-closed");

assert.match(migrations, new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${RPC}\\s*\\(\\s*p_session_token\\s+text\\s*,\\s*p_command_id\\s+uuid\\s*,\\s*p_expected_revision\\s+bigint`, "i"), "create RPC has the exact session/id/revision signature");
const fnStart = migrations.search(new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${RPC}`, "i"));
assert.ok(fnStart >= 0, "create migration must exist");
const fn = migrations.slice(fnStart, migrations.indexOf(`revoke all on function public.${RPC}`, fnStart));
assert.match(fn, /v_fingerprint\s*:=\s*encode\(digest\('CREATE_PARTY_V1'\s*,\s*'sha256'\)/i, "create has a stable empty-payload fingerprint");
assert.match(fn, /baekji_player_world_command_preflight_v1\([\s\S]*?'CREATE_PARTY_V1'[\s\S]*?v_preflight\.status\s+is\s+not\s+null/i, "create delegates shared session, lock, replay, retention, and revision semantics");
assert.match(fn, /jsonb_typeof\(v_world\.state\s*->\s*'characters'\)[\s\S]*?'object'[\s\S]*?jsonb_typeof\(v_parties\)[\s\S]*?'object'[\s\S]*?OUT_OF_SCOPE/i, "create fails closed unless character and parties maps are exact objects");
for (const binding of ["currentPartyId", "currentSessionId"]) assert.match(fn, new RegExp(`jsonb_typeof\\(v_actor\\s*->\\s*'${binding}'\\)[\\s\\S]*?not\\s+in\\s*\\(\\s*'string'\\s*,\\s*'null'\\s*\\)[\\s\\S]*?OUT_OF_SCOPE`, "i"), `actor ${binding} is absent/null/string only; malformed shapes are out of scope`);
assert.match(fn, /currentPartyId[\s\S]*?currentSessionId[\s\S]*?OUT_OF_SCOPE/i, "only an existing unbound actor with no session may create");
assert.match(fn, /gen_random_uuid|uuid_generate_v4/i, "party id is server-generated and collision-safe");
assert.match(fn, /clock_timestamp|statement_timestamp|extract\s*\(\s*epoch/i, "createdAt is server-generated");
for (const field of ["id", "name", "creatorId", "destination", "status", "memberIds", "invitedIds", "declinedIds", "confirmedBy", "readyBy", "sessionId", "createdAt"]) {
  assert.match(fn, new RegExp(`['"]${field}['"]`, "i"), `create initial party carries ${field}`);
}
assert.doesNotMatch(fn, /['"](?:readyStateBy|flowRevision)['"]/i, "create preserves the legacy initial shape without manufacturing readiness or flow fields");
assert.match(fn, /'RECRUITING'[\s\S]*?memberIds[\s\S]*?v_identity\.character_id[\s\S]*?invitedIds[\s\S]*?'\[\]'[\s\S]*?sessionId[\s\S]*?'null'/i, "create starts a one-member recruiting party with no invites/session");
assert.match(fn, /jsonb_set[\s\S]*?(?:array\s*)?\['parties',\s*v_party_id\]/i, "create inserts only its server-generated party object");
assert.match(fn, /jsonb_set[\s\S]*?(?:array\s*)?\['characters',\s*v_identity\.character_id,\s*'currentPartyId'\]/i, "create binds only the verified actor to that party");
assert.doesNotMatch(fn, /\['characters',\s*v_identity\.character_id,\s*'(?!currentPartyId)|\['(?:sessions|partyMembershipRemovals)'/i, "create cannot mutate sessions, removals, or unrelated actor state");
assert.match(migrations, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${RPC}\\s*\\(\\s*text\\s*,\\s*uuid\\s*,\\s*bigint\\s*\\)\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`, "i"), "create RPC is service-only");
assert.match(migrations, new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${RPC}[\\s\\S]*?to\\s+service_role`, "i"), "create grants execute only to service_role");

assert.match(catalog, /CREATE_PARTY_V1[\s\S]*?validate:\s*emptyPayload/, "catalog accepts only an empty create payload");
assert.match(leadership, /__BAEKJI_PLAYER_WORLD_COMMANDS__\.dispatch\(\s*["']CREATE_PARTY_V1["']\s*,\s*\{\s*\}\s*\)/, "leadership warning confirmation is the sole create dispatcher");
assert.match(leadership, /createPartyInFlight\s*=\s*new\s+Set\(\)/, "warning confirmation has a rapid-confirm guard");
assert.match(leadership, /createPartyInFlight\.has[\s\S]*?\.add[\s\S]*?finally[\s\S]*?\.delete/, "create guard releases after settlement/failure");
assert.match(leadership, /\["APPLIED",\s*"REPLAY"\]\.includes\(result\?\.status\)[\s\S]*?readState\(\)[\s\S]*?characters[\s\S]*?currentPartyId[\s\S]*?navigateToParty/, "only authoritative settlement and refreshed canonical actor state may close/navigate the warning");
assert.match(leadership, /WORLD_COMMAND_SYNC_NOT_READY[\s\S]*?잠시 후/i, "pending settlement keeps warning open with wait guidance");
assert.ok(createOwnerStart >= 0 && createOwnerEnd > createOwnerStart, "warning create owner remains separately inspectable from pure legacy helpers");
assert.doesNotMatch(createOwnerSource, /(?:persistence\.writeRaw|writeState|makePartyId|createLeaderPartyState)/, "warning owner has no local create writer/id generation");
assert.doesNotMatch(app, /function\s+createParty\s*\([\s\S]*?(?:mutate\(\s*["']create-party|id\(\s*["']party)/, "app direct local create path is removed");
assert.doesNotMatch(app, /data-create-party[^\n]{0,150}addEventListener\(\s*["']click["']\s*,\s*createParty/, "app does not bind a competing direct create owner");
assert.match(index, /player-world-commands\.js[^"']*stage8b-command-catalog=1/, "command-client cache key is refreshed for the catalog refactor");
assert.match(index, /party-leadership-flow\.js[^"']*create-party-command=1/, "leadership owner cache key is refreshed for create");

function deferred() { let resolve; let reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; }
function createOwner(dispatch, canonicalState = { characters: { leader: { currentPartyId: null, currentSessionId: null } } }) {
  const start = leadership.indexOf("const createPartyInFlight");
  const end = leadership.indexOf("function confirmMemberComposition", start);
  assert.ok(start >= 0 && end > start, "create owner must remain a self-contained leadership warning slice");
  const writes = []; const events = []; const route = [];
  const context = vm.createContext({
    window: { __BAEKJI_PLAYER_WORLD_COMMANDS__: { dispatch }, __BAEKJI_WORLD_PERSISTENCE__: { writeRaw: (...args) => { writes.push(args); throw new Error("LOCAL_WRITE"); } } },
    persistence: { writeRaw: (...args) => { writes.push(args); throw new Error("LOCAL_WRITE"); } },
    localStorage: { setItem: (...args) => { writes.push(args); throw new Error("LOCAL_WRITE"); } },
    dispatchEvent: (event) => { events.push(event?.type); },
    readState: () => canonicalState, currentUserId: () => "leader", currentParty: (snapshot, userId) => {
      const partyId = snapshot?.characters?.[userId]?.currentPartyId;
      return partyId ? snapshot?.parties?.[partyId] || null : null;
    },
    clearLeadershipModal: () => { context.cleared += 1; }, navigateToParty: (partyId) => route.push(partyId),
    showLeadershipNotice: (message) => { context.notice = message; }, cleared: 0, notice: "",
  });
  vm.runInContext(`${leadership.slice(start, end)} globalThis.create = createPartyAfterWarning;`, context, { filename: "party-leadership-flow.js#create-owner" });
  return { create: context.create, writes, events, route, context };
}

const pending = deferred(); let postCount = 0;
const canonical = { characters: { leader: { currentPartyId: null, currentSessionId: null } } };
const guarded = createOwner(() => { postCount += 1; return pending.promise; }, canonical);
const first = guarded.create(); const second = guarded.create();
assert.equal(postCount, 1, "rapid warning confirmation dispatches one authoritative POST");
assert.equal(guarded.route.length, 0, "route waits for authoritative settlement");
canonical.characters.leader.currentPartyId = "server-party"; pending.resolve({ status: "APPLIED" }); await Promise.all([first, second]);
assert.deepEqual(guarded.route, ["server-party"], "settled refreshed canonical party id is the only navigation target");
assert.deepEqual(guarded.writes, [], "create success performs no canonical local write"); assert.deepEqual(guarded.events, [], "create success emits no local creation event");
for (const outcome of [{ status: "OUT_OF_SCOPE" }, { status: "REVISION_CONFLICT" }, Object.assign(new Error("WORLD_COMMAND_SYNC_NOT_READY"), { settlementPending: true }), new Error("offline")]) {
  const rejected = createOwner(() => outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome));
  await rejected.create(); assert.equal(rejected.route.length, 0, "non-success/pending create retains warning and route"); assert.deepEqual(rejected.writes, []); assert.deepEqual(rejected.events, []);
}
const missingCanonical = createOwner(() => Promise.resolve({ status: "APPLIED" }));
await missingCanonical.create(); assert.equal(missingCanonical.route.length, 0, "settlement without a refreshed canonical currentPartyId cannot navigate");

function response() { return { statusCode: 0, body: "", setHeader() {}, end(value = "") { this.body += String(value); }, json() { return JSON.parse(this.body); } }; }
function request(body, cookie = `${PLAYER_COOKIE_NAME}=token-a`) { const bytes = Buffer.from(JSON.stringify(body)); return { method: "POST", headers: { cookie, origin: "https://example.test", host: "example.test" }, async *[Symbol.asyncIterator]() { yield bytes; } }; }
const envelope = { commandId: "44444444-4444-4444-8444-444444444444", expectedRevision: 7, command: COMMAND, payload: {} };
const calls = []; let rpcResult = { status: "APPLIED", revision: 8, command_id: envelope.commandId };
async function fetchImpl(url, options = {}) { const name = String(url).split("/").at(-1); const body = JSON.parse(options.body || "{}"); calls.push({ name, body }); if (name === "baekji_player_session_verify_v2") return { ok: true, json: async () => [{ account_id: "a", character_id: "leader", session_id: "s" }] }; if (name === "baekji_player_world_command_source_v1") return { ok: true, json: async () => [{ revision: 7, actor_character_id: "leader", character_names: {}, world_state: { version: 3, sessionSeq: 0, characters: { leader: { id: "leader", currentPartyId: null } }, parties: {}, sessions: {} } }] }; if (name === "baekji_player_world_command_commit_v1") return { ok: true, json: async () => [rpcResult] }; throw new Error(name); }
const missing = response(); await playerWorldCommandHandler(request(envelope, ""), missing, { env: { SUPABASE_SECRET_KEY: "x" }, fetchImpl });
assert.equal(missing.statusCode, 401, "create without verified cookie makes no RPC"); assert.equal(calls.length, 0);
for (const forged of [{ ...envelope, actorId: "other" }, { ...envelope, payload: { partyId: "caller-owned" } }, { ...envelope, payload: { createdAt: 1 } }]) { const denied = response(); const before = calls.length; await playerWorldCommandHandler(request(forged), denied, { env: { SUPABASE_SECRET_KEY: "x" }, fetchImpl }); assert.equal(denied.statusCode, 400); assert.equal(calls.length, before); }
const accepted = response(); await playerWorldCommandHandler(request(envelope), accepted, { env: { SUPABASE_SECRET_KEY: "x" }, fetchImpl });
assert.equal(calls.at(-1).name, "baekji_player_world_command_commit_v1"); assert.equal(calls.at(-1).body.p_command_name, COMMAND); assert.equal(calls.at(-1).body.p_command_id, envelope.commandId);
rpcResult = { status: "COMMAND_ID_REUSED", revision: 8, command_id: envelope.commandId }; const reused = response(); await playerWorldCommandHandler(request(envelope), reused, { env: { SUPABASE_SECRET_KEY: "x" }, fetchImpl }); assert.equal(reused.statusCode, 409, "command-id reuse is explicit conflict");

console.log("PASS: party creation is authoritative, server-generated, and single-owner");
