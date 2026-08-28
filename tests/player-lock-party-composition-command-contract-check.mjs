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
const app = read("app.js");
const preflight = read("party-preflight-flow-fix.js");
const flow = read("party-flow-ux-fix.js");
const index = read("index.html");
const runtimeUtils = read("runtime-utils.js");
const domainRules = read("runtime-domain-rules.js");
const migrationFiles = fs.readdirSync(path.join(ROOT, "supabase", "migrations"));
const lockMigrationFiles = migrationFiles.filter((file) => file.endsWith("_player_lock_party_composition_command.sql"));
assert.deepEqual(lockMigrationFiles, ["20260828055817_player_lock_party_composition_command.sql"], "one latest migration owns the lock RPC definition");
const lockMigration = read(path.posix.join("supabase/migrations", lockMigrationFiles[0]));

const COMMAND = "LOCK_PARTY_COMPOSITION_V1";
const RPC = "baekji_player_lock_party_composition_v1";
const rpcMentionFiles = migrationFiles.filter((file) => file.endsWith(".sql") && read(path.posix.join("supabase/migrations", file)).includes(RPC));
assert.deepEqual(rpcMentionFiles, lockMigrationFiles, "no later migration may silently replace the lock RPC or its privileges");
const handlerStart = api.indexOf("export async function playerWorldCommandHandler");
const handler = api.slice(handlerStart, api.indexOf("\nexport ", handlerStart + 1));

assert.ok(handlerStart >= 0, "composition lock uses the existing world-command handler");
assert.match(catalog, /LOCK_PARTY_COMPOSITION_V1[\s\S]*?rpcName:\s*["']baekji_player_lock_party_composition_v1["'][\s\S]*?validate:\s*onePartyPayload[\s\S]*?rpcParams:\s*partyParams/, "lock identity and exact payload live in the shared catalog");
assert.match(api, /Object\.keys\(value\).*?!WORLD_COMMAND_KEYS\.has/, "outer actor/account/session smuggling remains fail-closed");
assert.doesNotMatch(handler, /p_(?:actor|account|character|leader|ready|confirmed)_id\s*:\s*body/i, "caller cannot select the leader, confirmations, or readiness");

const signature = `create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${RPC}\\s*\\(\\s*p_session_token\\s+text\\s*,\\s*p_command_id\\s+uuid\\s*,\\s*p_expected_revision\\s+bigint\\s*,\\s*p_party_id\\s+text`;
assert.match(lockMigration, new RegExp(signature, "i"), "lock RPC has the exact token/id/revision/party signature");
assert.equal((lockMigration.match(new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${RPC}`, "ig")) || []).length, 1, "the latest migration defines the lock RPC exactly once");
const fnStart = lockMigration.search(new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+public\\.${RPC}`, "i"));
assert.ok(fnStart >= 0, "composition-lock migration exists");
const fn = lockMigration.slice(fnStart, lockMigration.indexOf(`revoke all on function public.${RPC}`, fnStart));
assert.match(fn, /security\s+definer\s+set\s+search_path\s*=\s*public\s*,\s*extensions/i, "security definer pins its search path");
assert.match(fn, /v_fingerprint\s*:=\s*encode\(digest\('LOCK_PARTY_COMPOSITION_V1:'\s*\|\|\s*p_party_id/i, "lock fingerprint binds the target party");
assert.match(fn, /baekji_player_world_command_preflight_v1\([\s\S]*?'LOCK_PARTY_COMPOSITION_V1'[\s\S]*?v_preflight\.status\s+is\s+not\s+null/i, "lock delegates session, lock, replay, retention, and revision semantics");
assert.match(fn, /creatorId[^\n]*<>\s*v_identity\.character_id[\s\S]*?not \(v_members \? v_identity\.character_id\)[\s\S]*?currentPartyId[^\n]*<>\s*p_party_id[\s\S]*?OUT_OF_SCOPE/i, "only the verified current-party leader can lock composition");
assert.match(fn, /currentSessionId[\s\S]*?sessionId[\s\S]*?OUT_OF_SCOPE/i, "active actor or party sessions fail closed");
assert.match(fn, /v_status\s*<>\s*'RECRUITING'[\s\S]*?OUT_OF_SCOPE/i, "only RECRUITING can transition through this command");
assert.match(fn, /count\(\*\)\s*<>\s*count\(distinct e #>> '\{\}'\)[\s\S]*?v_members[\s\S]*?count\(\*\)\s*<>\s*count\(distinct e #>> '\{\}'\)[\s\S]*?v_ready/i, "duplicate memberIds and readyBy fail closed");
assert.match(fn, /jsonb_array_elements\(v_ready\)[\s\S]*?not \(v_members \? \(e #>> '\{\}'\)\)[\s\S]*?OUT_OF_SCOPE/i, "readyBy must be a member subset");
assert.match(fn, /jsonb_each\(v_ready_state\)[\s\S]*?not \(v_members \? member_id\)[\s\S]*?jsonb_typeof\(marker_value\) = 'boolean'[\s\S]*?marker_value -> 'ready'\) = 'boolean'/i, "foreign and malformed readiness markers fail closed");
assert.match(fn, /marker_value \? 'at'[\s\S]*?jsonb_typeof\(marker_value -> 'at'\) = 'number'[\s\S]*?<= 9007199254740991/i, "optional readiness timestamps remain safe integers");
assert.match(fn, /jsonb_set\([\s\S]*?v_ready_state[\s\S]*?v_identity\.character_id[\s\S]*?'ready'\s*,\s*true[\s\S]*?v_now_ms/i, "leader readiness is stamped true using server time while other markers are preserved");
assert.match(fn, /jsonb_array_elements\(v_members\)\s+with\s+ordinality[\s\S]*?v_ready_state_next[\s\S]*?v_ready_next/i, "readyBy is rebuilt from preserved markers in member order");
assert.match(fn, /confirmedBy[\s\S]*?v_members[\s\S]*?COMPOSITION_CONFIRMED[\s\S]*?compositionLockedAt[\s\S]*?v_now_ms[\s\S]*?flowRevision/i, "lock confirms all members, stamps the lock, and increments flow revision");
assert.doesNotMatch(fn, /jsonb_set\s*\([^;]+array\s*\[\s*'(?:characters|sessions)'|jsonb_set\s*\([^;]+array\s*\[\s*'parties'\s*,\s*p_party_id\s*,\s*'(?:memberIds|invitedIds|declinedIds|creatorId|sessionId)'/i, "lock cannot modify identity, membership, invitations, or sessions");
assert.match(lockMigration, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${RPC}\\s*\\(\\s*text\\s*,\\s*uuid\\s*,\\s*bigint\\s*,\\s*text\\s*\\)\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`, "i"), "lock RPC is not browser-callable");
assert.match(lockMigration, new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${RPC}[\\s\\S]*?to\\s+service_role\\s*;\\s*$`, "i"), "the latest permission statement grants only service_role");

assert.match(catalog, /LOCK_PARTY_COMPOSITION_V1[\s\S]*?validate:\s*onePartyPayload/, "shared catalog accepts the exact lock envelope");
assert.match(preflight, /__BAEKJI_PLAYER_WORLD_COMMANDS__\.dispatch\(\s*["']LOCK_PARTY_COMPOSITION_V1["']\s*,\s*\{\s*partyId\s*\}\s*\)/, "the actual window-capture owner dispatches the lock command");
const lockClientStart = preflight.indexOf("  async function lockComposition(");
const lockClient = preflight.slice(lockClientStart, preflight.indexOf("\n  function ", lockClientStart));
assert.ok(lockClientStart >= 0 && lockClient.length > 0, "the lock command client is discoverable");
assert.doesNotMatch(lockClient, /writeState|writeRaw|mutate\(|localStorage\.setItem/, "the lock owner cannot retain a whole-world writer");
assert.doesNotMatch(flow, /const lock\s*=\s*target\.closest\(\s*["']\[data-confirm-composition\]["']\s*\)/, "the shadow document-capture lock owner is removed");
assert.doesNotMatch(flow, /function lockCompositionState\(/, "the dead reset-semantics lock helper is removed");
assert.doesNotMatch(app, /addEventListener\(\s*["']click["']\s*,\s*\(\)\s*=>\s*confirmComposition/, "the shadow target listener is removed");
assert.doesNotMatch(app, /function confirmComposition\(/, "the app cannot retain a local composition writer");
const rootScripts = fs.readdirSync(ROOT).filter((file) => file.endsWith(".js"));
const closestOwners = rootScripts.filter((file) => (read(file).match(/\.closest\(\s*["']\[data-confirm-composition\]["']\s*\)/g) || []).length > 0);
assert.deepEqual(closestOwners, ["party-preflight-flow-fix.js"], "only the preflight window-capture module may consume the lock selector");
const directTargetOwners = rootScripts.filter((file) => /querySelector\(\s*["']\[data-confirm-composition\]["']\s*\)[\s\S]{0,160}addEventListener\(\s*["']click["']/.test(read(file)));
assert.deepEqual(directTargetOwners, [], "no target listener may bypass the authoritative lock owner");
const commandDispatchOwners = rootScripts.filter((file) => /\.dispatch\(\s*["']LOCK_PARTY_COMPOSITION_V1["']/.test(read(file)));
assert.deepEqual(commandDispatchOwners, ["party-preflight-flow-fix.js"], "one interactive module dispatches the lock command");
assert.equal(rootScripts.filter((file) => /mutate\(\s*["']confirm-composition["']/.test(read(file))).length, 0, "the retired local mutation reason cannot reappear");
for (const source of ["app.js", "party-flow-ux-fix.js", "party-preflight-flow-fix.js"]) {
  assert.match(index, new RegExp(`${source.replace(".", "\\.")}[^"']*lock-party-composition-command=1`), `cache-bump ${source}`);
}
assert.match(index, /player-world-command-catalog\.js[^"']*stage8b-command-catalog=1/, "catalog is cache-bumped before its consumers");
assert.match(index, /player-world-commands\.js[^"']*stage8b-command-catalog=1/, "shared command client is cache-bumped with the catalog");

function modeledLock(partyInput, actorInput, actorId = "leader", at = 100) {
  const party = structuredClone(partyInput);
  const actor = structuredClone(actorInput);
  const ids = (values) => Array.isArray(values) && values.every((value) => typeof value === "string" && /^[A-Za-z0-9_-]{1,96}$/.test(value));
  const unique = (values) => new Set(values).size === values.length;
  const markerOk = (marker) => typeof marker === "boolean" || (marker && typeof marker === "object" && !Array.isArray(marker) && typeof marker.ready === "boolean" && (!Object.hasOwn(marker, "at") || (Number.isSafeInteger(marker.at) && marker.at >= 0)));
  const members = party.memberIds;
  const readyBy = party.readyBy ?? [];
  const readyStateBy = party.readyStateBy ?? {};
  const flowRevision = party.flowRevision ?? 0;
  if (!ids(members) || !ids(readyBy) || !unique(members) || !unique(readyBy)
      || !readyBy.every((id) => members.includes(id))
      || !readyStateBy || typeof readyStateBy !== "object" || Array.isArray(readyStateBy)
      || Object.entries(readyStateBy).some(([id, marker]) => !members.includes(id) || !markerOk(marker))
      || !Number.isSafeInteger(flowRevision) || flowRevision < 0 || flowRevision > Number.MAX_SAFE_INTEGER - 1
      || party.creatorId !== actorId || !members.includes(actorId)
      || actor.currentPartyId !== party.id || actor.currentSessionId
      || party.sessionId || party.status !== "RECRUITING") return { status: "OUT_OF_SCOPE", party: partyInput };
  party.readyStateBy = structuredClone(readyStateBy);
  for (const memberId of members) {
    if (!Object.hasOwn(party.readyStateBy, memberId)) party.readyStateBy[memberId] = { ready: readyBy.includes(memberId), at };
  }
  party.readyStateBy[actorId] = { ready: true, at };
  const effectiveReady = (memberId) => {
    const marker = party.readyStateBy[memberId];
    return typeof marker === "boolean" ? marker : marker?.ready === true;
  };
  party.readyBy = members.filter(effectiveReady);
  party.confirmedBy = [...members];
  party.status = "COMPOSITION_CONFIRMED";
  party.compositionLockedAt = at;
  party.flowRevision = flowRevision + 1;
  return { status: "APPLIED", party };
}

const readyMarker = { ready: true, at: 7, note: "preserve" };
const lockParty = { id: "p1", creatorId: "leader", status: "RECRUITING", memberIds: ["waiting", "leader", "ready_member"], confirmedBy: ["stale"], readyBy: ["ready_member"], readyStateBy: { waiting: false, ready_member: readyMarker }, sessionId: null, flowRevision: 4 };
const lockActor = { currentPartyId: "p1", currentSessionId: null };
const modeled = modeledLock(lockParty, lockActor);
assert.equal(modeled.status, "APPLIED");
assert.deepEqual(modeled.party.readyStateBy.ready_member, readyMarker, "a pre-ready object marker survives lock byte-for-byte");
assert.equal(modeled.party.readyStateBy.waiting, false, "an existing boolean marker is preserved");
assert.deepEqual(modeled.party.readyStateBy.leader, { ready: true, at: 100 }, "the verified leader alone receives the server-time ready marker");
assert.deepEqual(modeled.party.readyBy, ["leader", "ready_member"], "readyBy is rebuilt in member order");
assert.deepEqual(modeled.party.confirmedBy, lockParty.memberIds, "all and only current members are confirmed");
assert.equal(modeled.party.status, "COMPOSITION_CONFIRMED");
assert.equal(modeled.party.compositionLockedAt, 100);
assert.equal(modeled.party.flowRevision, 5);
assert.equal(lockParty.status, "RECRUITING", "the model leaves its canonical input immutable");
for (const [party, actor = lockActor] of [
  [{ ...lockParty, memberIds: ["leader", "ready_member", "ready_member"] }],
  [{ ...lockParty, readyBy: ["ready_member", "ready_member"] }],
  [{ ...lockParty, readyBy: ["outsider"] }],
  [{ ...lockParty, readyStateBy: { ...lockParty.readyStateBy, outsider: true } }],
  [{ ...lockParty, readyStateBy: { ...lockParty.readyStateBy, ready_member: { ready: "yes" } } }],
  [{ ...lockParty, readyStateBy: { ...lockParty.readyStateBy, ready_member: { ready: true, at: Number.MAX_SAFE_INTEGER + 1 } } }],
  [{ ...lockParty, creatorId: "other" }],
  [{ ...lockParty, status: "COMPOSITION_CONFIRMED" }],
  [{ ...lockParty, sessionId: "s1" }],
  [lockParty, { ...lockActor, currentSessionId: "s1" }],
]) assert.equal(modeledLock(party, actor).status, "OUT_OF_SCOPE", "ambiguous or unauthorized lock state cannot be repaired");

class FakeElement {
  constructor(selectors = {}, dataset = {}) { this.selectors = selectors; this.dataset = dataset; this.attrs = new Map(); this.disabled = false; }
  closest(selector) { return this.selectors[selector] ? this : null; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  removeAttribute(name) { this.attrs.delete(name); }
}
function clickEvent(target) { return { target, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } }; }
function deferred() { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; }
function lockRuntime(dispatch, { includeShadowDocumentRuntime = false } = {}) {
  const initial = { version: 3, characters: { leader: { currentPartyId: "p1", currentSessionId: null }, member: { currentPartyId: "p1", currentSessionId: null } }, parties: { p1: { id: "p1", creatorId: "leader", status: "RECRUITING", memberIds: ["leader", "member"], invitedIds: [], declinedIds: [], confirmedBy: [], readyBy: ["member"], readyStateBy: { member: { ready: true, at: 10 } }, sessionId: null, flowRevision: 2 } }, sessions: {} };
  let raw = JSON.stringify(initial); let writes = 0; let calls = 0;
  const windowClicks = []; const documentClicks = [];
  const document = { documentElement: { dataset: {} }, getElementById() { return null; }, querySelectorAll() { return []; }, addEventListener(type, handler, capture) { if (type === "click") documentClicks.push({ handler, capture }); } };
  const context = vm.createContext({ console, structuredClone, Element: FakeElement, document, location: { hash: "#/party/p1", href: "https://example.test/#/party/p1" }, localStorage: {}, sessionStorage: { getItem() { return "leader"; }, setItem() {} }, StorageEvent: class StorageEvent {}, Event: class Event {}, CustomEvent: class CustomEvent {}, queueMicrotask(callback) { callback(); } });
  context.window = context;
  context.addEventListener = (type, handler, capture) => { if (type === "click") windowClicks.push({ handler, capture }); };
  context.dispatchEvent = () => true;
  context.__BAEKJI_WORLD_PERSISTENCE__ = { readRaw: () => raw, writeRaw(value) { writes += 1; raw = String(value); } };
  context.__BAEKJI_PLAYER_WORLD_COMMANDS__ = { dispatch(command, payload) { calls += 1; assert.equal(command, COMMAND); assert.deepEqual(JSON.parse(JSON.stringify(payload)), { partyId: "p1" }); return dispatch(); } };
  vm.runInContext(runtimeUtils, context, { filename: "runtime-utils.js" });
  vm.runInContext(domainRules, context, { filename: "runtime-domain-rules.js" });
  if (includeShadowDocumentRuntime) vm.runInContext(flow, context, { filename: "party-flow-ux-fix.js" });
  vm.runInContext(preflight, context, { filename: "party-preflight-flow-fix.js" });
  assert.equal(windowClicks.length, 1, "preflight registers one window click owner");
  assert.equal(windowClicks[0].capture, true, "the authoritative owner is registered in window capture phase");
  if (includeShadowDocumentRuntime) {
    assert.equal(documentClicks.length, 1, "the legacy flow module registers one document capture handler");
    assert.equal(documentClicks[0].capture, true);
  }
  return {
    click(control) {
      const event = clickEvent(control);
      for (const { handler } of windowClicks) { handler(event); if (event.stopped) return event; }
      for (const { handler } of documentClicks) { handler(event); if (event.stopped) return event; }
      return event;
    },
    snapshot: () => JSON.parse(raw), calls: () => calls, writes: () => writes,
  };
}

const pending = deferred();
const runtime = lockRuntime(() => pending.promise);
const control = new FakeElement({ "[data-confirm-composition]": true });
const first = runtime.click(control); runtime.click(control);
assert.equal(runtime.calls(), 1, "rapid duplicate lock clicks dispatch exactly once while settlement is pending");
assert.equal(runtime.writes(), 0, "lock cannot optimistically write the whole world");
assert.equal(runtime.snapshot().parties.p1.status, "RECRUITING", "canonical local state stays unchanged until authoritative refresh");
assert.equal(runtime.snapshot().parties.p1.readyStateBy.member.ready, true, "pre-ready state is not locally reset");
assert.equal(first.prevented, true); assert.equal(first.stopped, true);
pending.resolve({ status: "APPLIED" }); await Promise.resolve(); await Promise.resolve();
assert.equal(runtime.writes(), 0, "successful settlement still relies on authoritative refresh");

const combinedRuntime = lockRuntime(() => Promise.resolve({ status: "APPLIED" }), { includeShadowDocumentRuntime: true });
const combinedClick = combinedRuntime.click(new FakeElement({ "[data-confirm-composition]": true }));
await Promise.resolve(); await Promise.resolve();
assert.equal(combinedRuntime.calls(), 1, "window capture dispatches once before the document capture runtime");
assert.equal(combinedRuntime.writes(), 0, "the full capture order cannot reach a local lock writer");
assert.equal(combinedRuntime.snapshot().parties.p1.status, "RECRUITING", "combined runtimes still await canonical refresh");
assert.equal(combinedClick.stopped, true, "window capture stops downstream document and target listeners");

function response() { return { statusCode: 0, body: "", setHeader() {}, end(value = "") { this.body += String(value); }, json() { return JSON.parse(this.body); } }; }
function request(body, cookie = `${PLAYER_COOKIE_NAME}=token-a`) { const bytes = Buffer.from(JSON.stringify(body)); return { method: "POST", headers: { cookie, origin: "https://example.test", host: "example.test" }, async *[Symbol.asyncIterator]() { yield bytes; } }; }
const envelope = { commandId: "66666666-6666-4666-8666-666666666666", expectedRevision: 21, command: COMMAND, payload: { partyId: "party-a" } };
const calls = []; let rpcResult = { status: "APPLIED", revision: 22, command_id: envelope.commandId };
async function fetchImpl(url, options = {}) { const name = String(url).split("/").at(-1); const body = JSON.parse(options.body || "{}"); calls.push({ name, body }); if (name === "baekji_player_session_verify_v2") return { ok: true, json: async () => [{ account_id: "a", character_id: "leader", session_id: "s" }] }; if (name === "baekji_player_world_command_source_v1") return { ok: true, json: async () => [{ revision: 21, actor_character_id: "leader", world_state: { version: 3, characters: {}, parties: {}, sessions: {} } }] }; if (name === "baekji_player_world_command_commit_v1") return { ok: true, json: async () => [rpcResult] }; throw new Error(name); }
const env = { SUPABASE_SECRET_KEY: "x" };
for (const forged of [{ ...envelope, leaderId: "leader" }, { ...envelope, payload: { partyId: "party-a", readyBy: ["leader"] } }, { ...envelope, payload: { partyId: "party-a", status: "COMPOSITION_CONFIRMED" } }]) { const denied = response(); const before = calls.length; await playerWorldCommandHandler(request(forged), denied, { env, fetchImpl }); assert.equal(denied.statusCode, 400, "forged lock envelope fails before any RPC"); assert.equal(calls.length, before); }
const accepted = response(); await playerWorldCommandHandler(request(envelope), accepted, { env, fetchImpl });
assert.equal(calls.at(-1).name, "baekji_player_world_command_commit_v1", "lock reaches the generic CAS commit rather than a per-command RPC");
assert.deepEqual(Object.keys(calls.at(-1).body).sort(), ["p_session_token", "p_command_id", "p_expected_revision", "p_command_name", "p_command_fingerprint", "p_result_status", "p_next_state"].sort());
assert.equal(calls.at(-1).body.p_command_name, COMMAND);
rpcResult = { status: "COMMAND_ID_REUSED", revision: 22, command_id: envelope.commandId }; const reused = response(); await playerWorldCommandHandler(request(envelope), reused, { env, fetchImpl }); assert.equal(reused.statusCode, 409, "changed command-id reuse remains an explicit conflict");

console.log("PASS: party composition lock is authoritative, leader-bound, readiness-preserving, and single-owner");
