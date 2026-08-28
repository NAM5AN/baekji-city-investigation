import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import catalog from "../player-world-command-catalog.js";
import { PLAYER_COOKIE_NAME } from "../api/_player-auth.mjs";
import { playerWorldCommandHandler } from "../api/index.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const api = read("api/index.mjs"), client = read("player-world-commands.js"), index = read("index.html");
const entries = [
  ["CONFIRM_BRIEFING_V1", {}, "party"], ["DECLINE_PARTY_INVITE_V1", { partyId: "p" }, "party"], ["CANCEL_PARTY_INVITE_V1", { partyId: "p", inviteeId: "b" }, "party"], ["INVITE_PARTY_MEMBER_V1", { partyId: "p", inviteeId: "b" }, "party"], ["ACCEPT_PARTY_INVITE_V1", { partyId: "p" }, "party"], ["RENAME_PARTY_V1", { partyId: "p", name: "  새   이름  " }, "party"], ["CREATE_PARTY_V1", {}, "party"], ["TOGGLE_PARTY_READY_V1", { partyId: "p" }, "party"], ["LOCK_PARTY_COMPOSITION_V1", { partyId: "p" }, "party"],
  ["REOPEN_PARTY_RECRUITING_V1", { partyId: "p" }, "party"], ["LEAVE_PARTY_V1", { partyId: "p" }, "party"], ["REMOVE_PARTY_MEMBER_V1", { partyId: "p", memberId: "b" }, "party"], ["DISBAND_RECRUITING_PARTY_V1", { partyId: "p" }, "party"], ["START_PARTY_SESSION_V1", { partyId: "p" }, "party"], ["FORCE_START_PARTY_SESSION_V1", { partyId: "p" }, "party"], ["ROLLBACK_BRIEFING_V1", { sessionId: "s" }, "party"], ["ACTIVATE_SESSION_V1", { sessionId: "s" }, "party"], ["DISBAND_COMPLETED_PARTY_V1", { sessionId: "s" }, "party"], ["REQUEST_PARTY_TRANSFER_V1", { targetPartyId: "p" }, "party"], ["APPROVE_PARTY_TRANSFER_V1", { requestId: "r" }, "party"], ["REJECT_PARTY_TRANSFER_V1", { requestId: "r" }, "party"],
  ["END_SESSION_V1", { sessionId: "s" }, "investigation"], ["BEGIN_MOVEMENT_V1", { sessionId: "s", routeId: "route" }, "investigation"], ["SETTLE_MOVEMENT_V1", { sessionId: "s", movementToken: "move" }, "investigation"], ["RESOLVE_HAZARD_V1", { sessionId: "s", movementToken: "move", hazardIndex: 0, hazardId: "h", actionText: "확인" }, "investigation"], ["INVESTIGATION_ACTION_V1", { sessionId: "s", kind: "OBSERVE" }, "investigation"], ["SEND_FIELD_CHAT_V1", { sessionId: "s", text: "확인" }, "investigation"],
  ["OFFER_ITEM_TRANSFER_V1", { receiverId: "b", inventoryKey: "item", quantity: 1 }, "inventory"], ["RESOLVE_ITEM_TRANSFER_V1", { transferId: "t", decision: "ACCEPT" }, "inventory"], ["CANCEL_ITEM_TRANSFER_V1", { transferId: "t" }, "inventory"], ["EXPIRE_ITEM_TRANSFER_V1", { transferId: "t" }, "inventory"], ["CLAIM_FIELD_ITEM_V1", { sessionId: "s", objectId: "o", itemId: "i" }, "inventory"],
  ["CHARACTER_INTERACTION_V1", { sessionId: "s", targetId: "b", actionText: "손을 잡는다" }, "ai"], ["RESOLVE_FLEXIBLE_HAZARD_V1", { sessionId: "s", movementToken: "move", hazardIndex: 0, hazardId: "h", actionText: "확인한다" }, "ai"],
];
assert.equal(entries.length, 34, "Stage 8B exposes a finite 34-command contract");
assert.deepEqual(catalog.commands, entries.map(([command]) => command));
assert.ok(Object.isFrozen(catalog));
assert.match(index, /player-world-command-catalog\.js[\s\S]*player-world-commands\.js/);
assert.match(api, /import\s+playerWorldCommandCatalog\s+from\s+["']\.\.\/player-world-command-catalog\.js["']/);
assert.match(client, /__BAEKJI_PLAYER_WORLD_COMMAND_CATALOG__[\s\S]*canonicalizePayload/);
for (const [command, payload, family] of entries) {
  const canonical = catalog.canonicalizePayload(command, payload);
  assert.equal(catalog.validatePayload(command, payload), true, `${command} exact payload`);
  assert.equal(catalog.family(command), family, `${command} family`);
  assert.ok(canonical, `${command} canonicalizes`);
  assert.equal(catalog.validatePayload(command, { ...payload, actorId: "spoof" }), false, `${command} rejects actor smuggling`);
  if (command === "RENAME_PARTY_V1") assert.equal(canonical.name, "새 이름");
}
assert.equal(catalog.validatePayload("MOVE_V1", {}), false);
assert.equal(catalog.validatePayload("RENAME_PARTY_V1", { partyId: "p", name: " " }), false);

function response() { return { statusCode: 0, body: "", setHeader() {}, end(value = "") { this.body += String(value); } }; }
function request(body) { const bytes = Buffer.from(JSON.stringify(body)); return { method: "POST", headers: { cookie: `${PLAYER_COOKIE_NAME}=token-a`, origin: "https://example.test", host: "example.test" }, async *[Symbol.asyncIterator]() { yield bytes; } }; }
const world = { version: 3, characters: { a: { id: "a", currentPartyId: null, currentSessionId: null } }, parties: {}, sessions: {} };
const calls = [];
async function fetchImpl(url, options = {}) {
  const name = String(url).split("/").at(-1), body = JSON.parse(options.body || "{}"); calls.push({ name, body });
  if (name === "baekji_player_session_verify_v2") return { ok: true, json: async () => [{ account_id: "account-a", character_id: "a", session_id: "session-a" }] };
  if (name === "baekji_player_world_command_source_v1") return { ok: true, json: async () => [{ revision: 7, actor_character_id: "a", world_state: world }] };
  if (name === "baekji_player_world_command_commit_v1") return { ok: true, json: async () => [{ status: "APPLIED", revision: 8, command_id: body.p_command_id }] };
  throw new Error(`unexpected RPC ${name}`);
}
for (let position = 0; position < entries.length; position += 1) {
  const [command, payload] = entries[position], commandId = `${String(position + 1).padStart(8, "0")}-0000-4000-8000-000000000000`;
  const r = response(); await playerWorldCommandHandler(request({ commandId, expectedRevision: 7, command, payload }), r, { env: { SUPABASE_SECRET_KEY: "test" }, fetchImpl });
  assert.equal(r.statusCode, 200, `${command} reaches source/reduce/commit`);
  const commit = calls.at(-1); assert.equal(commit.name, "baekji_player_world_command_commit_v1");
  assert.deepEqual(Object.keys(commit.body).sort(), ["p_command_fingerprint", "p_command_id", "p_command_name", "p_expected_revision", "p_next_state", "p_result_status", "p_session_token"].sort());
  assert.equal(commit.body.p_command_name, command); assert.equal(commit.body.p_command_id, commandId);
}
console.log("PASS: catalog owns all 34 exact command contracts and the generic source/reduce/commit route");
