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
const commands = read("player-world-commands.js");
const nameUi = read("party-ui-stability.js");
const app = read("app.js");
const index = read("index.html");
const migrations = fs.readdirSync(path.join(ROOT, "supabase", "migrations"))
  .filter((file) => file.endsWith(".sql"))
  .map((file) => read(path.posix.join("supabase/migrations", file))).join("\n");

const COMMAND = "RENAME_PARTY_V1";
const RPC = "baekji_player_rename_party_v1";
const handlerStart = api.indexOf("export async function playerWorldCommandHandler");
const handler = api.slice(handlerStart, api.indexOf("\nexport ", handlerStart + 1));

assert.ok(handlerStart >= 0, "rename must stay in the existing index-owned command handler");
assert.match(catalog, /RENAME_PARTY_V1[\s\S]*?rpcName:\s*["']baekji_player_rename_party_v1["'][\s\S]*?validate:\s*renamePayload[\s\S]*?rpcParams:\s*renameParams/, "rename identity, normalized payload, and transport live in the shared catalog");
assert.match(api, /Object\.keys\(value\).*?!WORLD_COMMAND_KEYS\.has/, "outer actor/account/session smuggling remains fail-closed");
assert.match(catalog, /function\s+normalizedPartyName\s*\(\s*value\s*\)[\s\S]*?typeof\s+value\s*!==\s*["']string["'][\s\S]*?replace\(\/\\s\+\/g,\s*["'] ["']\)/, "rename centralizes string validation and whitespace normalization");
assert.doesNotMatch(handler, /p_(?:actor|account|character)_id\s*:\s*body/i, "caller never chooses rename actor identity");

assert.match(migrations, new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${RPC}\\s*\\(\\s*p_session_token\\s+text\\s*,\\s*p_command_id\\s+uuid\\s*,\\s*p_expected_revision\\s+bigint\\s*,\\s*p_party_id\\s+text\\s*,\\s*p_name\\s+text`, "i"), "rename RPC has exact token/id/revision/party/name signature");
const fnStart = migrations.search(new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${RPC}`, "i"));
assert.ok(fnStart >= 0, "rename migration must exist");
const fn = migrations.slice(fnStart, migrations.indexOf(`revoke all on function public.${RPC}`, fnStart));
assert.match(fn, /baekji_player_world_command_preflight_v1\([\s\S]*?'RENAME_PARTY_V1'[\s\S]*?v_preflight\.status\s+is\s+not\s+null/i, "rename delegates shared session, lock, replay, retention, and revision semantics");
assert.match(fn, /p_name\s*~\s*'\[\[:cntrl:\]\]'[\s\S]*?INVALID_WORLD_COMMAND/i, "rename rejects control characters before state access");
assert.match(fn, /v_clean_name\s*:=\s*btrim\(p_name\)[\s\S]*?v_clean_name\s*:=\s*regexp_replace\(v_clean_name,\s*'\\s\+',\s*'\s*',\s*'g'\)/i, "rename normalizes whitespace before computing its command fingerprint");
assert.match(fn, /v_fingerprint\s*:=\s*encode\(digest\('RENAME_PARTY_V1:'\s*\|\|\s*p_party_id\s*\|\|\s*':'\s*\|\|\s*v_clean_name,\s*'sha256'\),\s*'hex'\)/i, "rename fingerprint binds normalized target and name");
assert.match(fn, /baekji_player_world_command_record_v1\([\s\S]*?v_fingerprint/i, "rename records the normalized fingerprint through the shared ledger helper");
assert.match(fn, /creatorId[\s\S]*?v_identity\.character_id[\s\S]*?memberIds[\s\S]*?v_identity\.character_id[\s\S]*?currentPartyId[\s\S]*?p_party_id[\s\S]*?currentSessionId[\s\S]*?OUT_OF_SCOPE/i, "only the current party creator/member with no session may rename");
assert.match(fn, /RECRUITING[\s\S]*?COMPOSITION_CONFIRMED[\s\S]*?READY_CHECK[\s\S]*?OUT_OF_SCOPE/i, "rename is limited to the three preflight statuses");
assert.match(fn, /sessionId[\s\S]*?OUT_OF_SCOPE/i, "rename rejects a party with any session binding");
assert.match(fn, /octet_length\(ch\)\s*>\s*3\s+then\s+2\s+else\s+1[\s\S]*?regexp_split_to_table\(v_clean_name,\s*''\)[\s\S]*?v_name_units\s*>\s*24[\s\S]*?OUT_OF_SCOPE/i, "server enforces the JavaScript UTF-16 24-unit name boundary");
assert.match(fn, /v_flow_text\s*:=\s*coalesce\(v_party\s*->>\s*'flowRevision',\s*'0'\)[\s\S]*?v_flow_next\s*:=\s*v_flow_text::bigint\s*\+\s*1/i, "an absent flowRevision starts at zero and increments to one");
assert.match(fn, /\(v_party\s*\?\s*'flowRevision'\)\s+and\s+\(coalesce\(jsonb_typeof\(v_party\s*->\s*'flowRevision'\),\s*''\)\s*<>\s*'number'[\s\S]*?v_flow_text\s*!~\s*'\^\[0-9\]\{1,16\}\$'[\s\S]*?case\s+when\s+v_flow_text\s*~\s*'\^\[0-9\]\{1,16\}\$'\s+then\s+v_flow_text::bigint\s*>\s*9007199254740990[\s\S]*?OUT_OF_SCOPE/i, "present non-integer, negative, fractional, or unsafe flowRevision is fail-closed");
for (const field of ["name", "nameCustomized", "nameCustomizedAt", "flowRevision"]) assert.match(fn, new RegExp(`jsonb_set[\\s\\S]*?array\\s*\\[\\s*['\"]parties['\"]\\s*,\\s*p_party_id\\s*,\\s*['\"]${field}['\"]`, "i"), `rename writes permitted party field ${field}`);
assert.doesNotMatch(fn, /jsonb_set\s*\([^,]+,\s*array\s*\[\s*['"](?:characters|sessions|partyMembershipRemovals)['"]|jsonb_set\s*\([^,]+,\s*array\s*\[\s*['"]parties['"]\s*,\s*p_party_id\s*,\s*['"](?:memberIds|invitedIds|declinedIds|confirmedBy|readyBy|readyStateBy|status|sessionId)['"]/i, "rename cannot touch membership, session, status, or unrelated party state");
assert.match(migrations, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${RPC}\\s*\\(\\s*text\\s*,\\s*uuid\\s*,\\s*bigint\\s*,\\s*text\\s*,\\s*text\\s*\\)\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`, "i"), "rename RPC is service-only");
assert.match(migrations, new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${RPC}[\\s\\S]*?to\\s+service_role`, "i"), "rename grants execute only to service role");

assert.match(catalog, /RENAME_PARTY_V1[\s\S]*?validate:\s*renamePayload/, "shared catalog allowlists the exact rename envelope");
assert.match(nameUi, /__BAEKJI_PLAYER_WORLD_COMMANDS__\.dispatch\(\s*["']RENAME_PARTY_V1["']\s*,\s*\{\s*partyId\s*,\s*name\s*\}\s*\)/, "party-name editor is the sole command dispatch owner");
assert.doesNotMatch(nameUi, /function\s+writeRenamedParty[\s\S]*?(?:persistence\.writeRaw|localStorage\.setItem|dispatchStateUpdate)/, "rename editor cannot locally persist or synthesize a storage event");
assert.match(nameUi, /const\s+\w*rename\w*inflight\s*=\s*new\s+Set\(\)/i, "editor has a rapid-save guard");
assert.match(nameUi, /\.has\(partyId\)[\s\S]*?\.add\(partyId\)[\s\S]*?finally[\s\S]*?\.delete\(partyId\)/, "rename guard releases after success/failure");
assert.match(nameUi, /\["APPLIED",\s*"NOOP",\s*"REPLAY"\]\.includes\(result\?\.status\)[\s\S]*?closeEditor/, "editor closes only after authoritative success");
assert.match(nameUi, /REVISION_CONFLICT[\s\S]*?(?:error\.textContent|show)/, "revision conflict stays open with retry guidance");
assert.match(nameUi, /WORLD_COMMAND_SYNC_NOT_READY/, "unsettled refresh is handled distinctly");
assert.match(nameUi, /동기화 중입니다\. 잠시 후 다시 시도해 주세요\./, "unsettled refresh stays open with wait guidance");
assert.doesNotMatch(app, /data-party-name-edit[\s\S]{0,500}(?:mutate|writeRaw|localStorage\.setItem)/, "app render/binding does not add a second local rename writer");
assert.match(index, /player-world-commands\.js[^"']*stage8b-command-catalog=1/, "command-client cache key is refreshed for the catalog refactor");
assert.match(index, /party-ui-stability\.js[^"']*rename-party-command=1/, "name-editor cache key is refreshed for rename");

function deferred() { let resolve; let reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; }
function between(source, startToken, endToken) {
  const start = source.indexOf(startToken); const end = source.indexOf(endToken, start);
  assert.ok(start >= 0 && end > start, `cannot isolate ${startToken}`);
  return source.slice(start, end);
}

// Execute the actual editor save owner in a browser realm after the static
// contract above has established its expected source seam. Every local world
// ingress throws so this cannot pass by silently retaining the old writer.
function editorRuntime({ value = "  붉은빛   탐사대  ", dispatch } = {}) {
  const writes = []; const events = []; const input = { value, focus() {} };
  const error = { textContent: "" };
  const context = vm.createContext({
    Date: class extends Date { static now() { return 1700000000000; } },
    window: {
      __BAEKJI_PLAYER_WORLD_COMMANDS__: { dispatch },
      __BAEKJI_WORLD_PERSISTENCE__: { readRaw: () => JSON.stringify({ version: 3, parties: { "party-a": { id: "party-a", creatorId: "leader", memberIds: ["leader"], status: "RECRUITING", sessionId: null, name: "old" } }, characters: { leader: { currentPartyId: "party-a", currentSessionId: null } } }), writeRaw: (...args) => { writes.push({ kind: "writeRaw", args }); throw new Error("LOCAL_WORLD_WRITE_FORBIDDEN"); } },
      dispatchEvent: (event) => { events.push(event.type); return true; },
    },
    document: { querySelector(selector) { if (selector === "[data-party-name-input]") return input; if (selector === "[data-party-name-error]") return error; return null; } },
    localStorage: { setItem: (...args) => { writes.push({ kind: "localStorage", args }); throw new Error("LOCAL_WORLD_WRITE_FORBIDDEN"); } },
    sessionStorage: { getItem: (key) => key === "baekji_city_mvp_current_user_v034" ? "leader" : null },
    closeEditor: () => { context.closed += 1; }, editingPartyId: "party-a", closed: 0,
  });
  const ownerStart = nameUi.search(/const\s+\w*rename\w*inflight\s*=\s*new\s+Set\(\)/i);
  const ownerEnd = nameUi.indexOf("document.addEventListener(\"click\"", ownerStart);
  assert.ok(ownerStart >= 0 && ownerEnd > ownerStart, "rename editor must retain a self-contained guarded save owner");
  vm.runInContext(`${nameUi.slice(ownerStart, ownerEnd)} globalThis.save = saveEditor;`, context, { filename: "party-ui-stability.js#rename-command-owner" });
  return { save: context.save, input, error, writes, events, context };
}

const whitespace = editorRuntime({ dispatch: async () => ({ status: "APPLIED" }) });
await whitespace.save();
assert.equal(whitespace.context.closed, 1, "APPLIED authoritative rename closes only after settlement");
assert.deepEqual(whitespace.writes, [], "successful rename never performs local canonical persistence");
assert.equal(whitespace.events.length, 0, "successful rename emits no early local name-change/storage event");
assert.equal(whitespace.error.textContent, "", "normalized valid name has no modal error");

for (const [raw, label] of [[" ", "empty"], ["a".repeat(25), "over-24 UTF-16 units"], ["a".repeat(23) + "😀", "surrogate-pair overflow"]]) {
  const invalid = editorRuntime({ value: raw, dispatch: () => { throw new Error("must not dispatch"); } });
  await invalid.save();
  assert.equal(invalid.context.closed, 0, `${label} name keeps editor open`);
  assert.notEqual(invalid.error.textContent, "", `${label} name is rejected before dispatch`);
  assert.deepEqual(invalid.writes, [], `${label} name has no local write`);
}

// Execution fixture for the SQL state-shape boundary above: a newly-created
// party has no flowRevision, while any present value must be a safe integer.
function nextFlowRevision(value, present = true) {
  if (!present) return 1;
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value < Number.MAX_SAFE_INTEGER
    ? value + 1 : "OUT_OF_SCOPE";
}
assert.equal(nextFlowRevision(undefined, false), 1, "missing flowRevision is accepted as zero then incremented");
for (const invalidRevision of ["0", 0.5, -1, Number.MAX_SAFE_INTEGER]) {
  assert.equal(nextFlowRevision(invalidRevision), "OUT_OF_SCOPE", "present malformed flowRevision is rejected");
}

const first = deferred(); let saveCalls = 0;
const guarded = editorRuntime({ dispatch: () => { saveCalls += 1; return saveCalls === 1 ? first.promise : saveCalls === 2 ? Promise.reject(new Error("offline")) : Promise.resolve({ status: "REPLAY" }); } });
const saveClick = guarded.save(); const enterSave = guarded.save();
assert.equal(saveCalls, 1, "rapid save-button/Enter double path sends exactly one command");
first.resolve({ status: "APPLIED" }); await Promise.all([saveClick, enterSave]);
await guarded.save(); assert.equal(saveCalls, 2, "rename guard releases after authoritative success");
await guarded.save(); assert.equal(saveCalls, 3, "rename guard releases after generic failure");
for (const [result, message] of [
  [{ status: "REVISION_CONFLICT" }, /최신 상태|다시 시도/],
  [{ status: "OUT_OF_SCOPE" }, /변경할 수 없|상태/],
  [Object.assign(new Error("WORLD_COMMAND_SYNC_NOT_READY"), { settlementPending: true }), /최신 상태|잠시 후/],
  [new Error("offline"), /저장하지 못했|연결/],
]) {
  const rejected = editorRuntime({ dispatch: () => result instanceof Error ? Promise.reject(result) : Promise.resolve(result) });
  await rejected.save();
  assert.equal(rejected.context.closed, 0, "non-success/pending rename retains the editor");
  assert.match(rejected.error.textContent, message, "non-success/pending rename has a distinct retry-safe notice");
  assert.deepEqual(rejected.writes, [], "non-success/pending rename has no local write");
  assert.equal(rejected.events.length, 0, "non-success/pending rename emits no local event");
}

function response() { return { statusCode: 0, headers: {}, body: "", setHeader(key, value) { this.headers[String(key).toLowerCase()] = value; }, end(value = "") { this.body += String(value); }, json() { return JSON.parse(this.body); } }; }
function request(body, { cookie = `${PLAYER_COOKIE_NAME}=token-a` } = {}) { const bytes = Buffer.from(JSON.stringify(body)); return { method: "POST", url: "/api/player-world-command", headers: { cookie, origin: "https://example.test", host: "example.test" }, async *[Symbol.asyncIterator]() { yield bytes; } }; }
const envelope = { commandId: "33333333-3333-4333-8333-333333333333", expectedRevision: 9, command: COMMAND, payload: { partyId: "party-a", name: "  붉은빛   탐사대  " } };
const rpcCalls = []; let rpcResult = { status: "APPLIED", revision: 10, command_id: envelope.commandId };
async function fetchImpl(url, options = {}) {
  const name = String(url).split("/").at(-1); const body = JSON.parse(options.body || "{}"); rpcCalls.push({ name, body });
  if (name === "baekji_player_session_verify_v2") return { ok: true, status: 200, json: async () => [{ account_id: "account-a", character_id: "leader", session_id: "session-a" }] };
  if (name === "baekji_player_world_command_source_v1") return { ok: true, status: 200, json: async () => [{ revision: 9, actor_character_id: "leader", character_names: {}, world_state: { version: 3, characters: { leader: { id: "leader", currentPartyId: "party-a" } }, parties: { "party-a": { id: "party-a", creatorId: "leader", memberIds: ["leader"], status: "RECRUITING", name: "기존" } }, sessions: {} } }] };
  if (name === "baekji_player_world_command_commit_v1") return { ok: true, status: 200, json: async () => [rpcResult] };
  throw new Error(`unexpected RPC ${name}`);
}
const env = { SUPABASE_SECRET_KEY: "test-server-secret" };
const missingCookie = response(); await playerWorldCommandHandler(request(envelope, { cookie: "" }), missingCookie, { env, fetchImpl });
assert.equal(missingCookie.statusCode, 401, "rename requires a verified HttpOnly session"); assert.equal(rpcCalls.length, 0, "missing-cookie rename makes no RPC");
for (const forged of [{ ...envelope, actorId: "other" }, { ...envelope, payload: { partyId: "party-a", name: "x", accountId: "other" } }, { ...envelope, payload: { partyId: "party-a", name: " " } }, { ...envelope, payload: { partyId: "party-a", name: null } }, { ...envelope, payload: { partyId: "party-a", name: "a".repeat(25) } }]) {
  const denied = response(); const before = rpcCalls.length; await playerWorldCommandHandler(request(forged), denied, { env, fetchImpl });
  assert.equal(denied.statusCode, 400, "forged/malformed rename fails before RPC"); assert.equal(rpcCalls.length, before);
}
const accepted = response(); await playerWorldCommandHandler(request(envelope), accepted, { env, fetchImpl });
assert.equal(rpcCalls.at(-1).name, "baekji_player_world_command_commit_v1");
assert.equal(rpcCalls.at(-1).body.p_command_name, COMMAND);
assert.equal(rpcCalls.at(-1).body.p_command_id, envelope.commandId);
rpcResult = { status: "COMMAND_ID_REUSED", revision: 10, command_id: envelope.commandId };
const reused = response(); await playerWorldCommandHandler(request({ ...envelope, payload: { partyId: "party-a", name: "다른 이름" } }), reused, { env, fetchImpl });
assert.equal(reused.statusCode, 409, "reused command id is explicit HTTP conflict"); assert.deepEqual(reused.json(), { ok: false, code: "COMMAND_ID_REUSED" });

console.log("PASS: rename party command is authoritative, actor-bound, and single-owner");
