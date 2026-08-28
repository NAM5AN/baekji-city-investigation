import assert from "node:assert/strict";
import { playerWorldCommandHandler } from "../api/index.mjs";
import { PLAYER_COOKIE_NAME } from "../api/_player-auth.mjs";

function response() { return { statusCode: 0, body: "", setHeader() {}, end(value = "") { this.body += String(value); } }; }
function request(body) { const bytes = Buffer.from(JSON.stringify(body)); return { method: "POST", headers: { cookie: `${PLAYER_COOKIE_NAME}=token-a`, origin: "https://example.test", host: "example.test" }, async *[Symbol.asyncIterator]() { yield bytes; } }; }
const state = { version: 3, characters: { a: { id: "a", currentSessionId: "s1", contamination: 0, inventory: {} }, b: { id: "b", currentSessionId: "s2", contamination: 0, inventory: {} } }, parties: {}, sessions: { s1: { id: "s1", status: "ACTIVE", variant: "a", currentNode: "E_ENTRY", memberIds: ["a"], logs: [] }, s2: { id: "s2", status: "ACTIVE", variant: "a", currentNode: "E_ENTRY", memberIds: ["b"], logs: [] } } };
let committed = null;
async function fetchImpl(url, options = {}) {
  const name = String(url).split("/").at(-1); const body = JSON.parse(options.body || "{}");
  if (name === "baekji_player_session_verify_v2") return { ok: true, json: async () => [{ account_id: "account-a", character_id: "a", session_id: "session-a" }] };
  if (name === "baekji_player_world_command_source_v1") return { ok: true, json: async () => [{ revision: 7, actor_character_id: "a", world_state: state, character_names: { a: "A", b: "B" } }] };
  if (name === "baekji_player_world_command_commit_v1") { committed = body; return { ok: true, json: async () => [{ status: "APPLIED", revision: 8, command_id: body.p_command_id }] }; }
  if (String(url).endsWith("/responses")) return { ok: true, json: async () => ({ output_text: JSON.stringify({ outcome: "EFFECTIVE", targetEffect: "CONTACT", narration: "A가 B의 손을 잡는다." }) }) };
  throw new Error(`unexpected ${name}`);
}
const r = response();
await playerWorldCommandHandler(request({ commandId: "00000001-0000-4000-8000-000000000000", expectedRevision: 7, command: "CHARACTER_INTERACTION_V1", payload: { sessionId: "s1", targetId: "b", actionText: "손을 잡는다" } }), r, { env: { SUPABASE_SECRET_KEY: "test", OPENAI_API_KEY: "test" }, fetchImpl });
assert.equal(r.statusCode, 200);
assert.equal(committed.p_result_status, "APPLIED");
assert.ok(committed.p_next_state.sessions.s2.logs.some((entry) => entry.kind === "CHARACTER_INTERACTION_RESULT"));
console.log("PASS: AI decisions use canonical source context and commit only through the command CAS");
