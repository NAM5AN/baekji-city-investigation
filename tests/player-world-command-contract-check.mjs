import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const api = read("api/index.mjs");
const catalog = read("player-world-command-catalog.js");
const auth = read("api/_player-auth.mjs");
const engine = read("server/player-world-command-engine.mjs");
const vercel = JSON.parse(read("vercel.json"));
const migrations = fs.readdirSync(path.join(ROOT, "supabase", "migrations"))
  .filter((file) => file.endsWith(".sql"))
  .map((file) => ({ file, source: read(path.posix.join("supabase/migrations", file)) }));
const sql = migrations.map((entry) => entry.source).join("\n");

// Commands remain actor-bound, while source/reduce/commit centralizes the
// canonical write boundary instead of exposing a browser state writer.
assert.match(api, /export\s+async\s+function\s+playerWorldCommandHandler\s*\(/, "B1 must be an index-owned handler so it does not consume a new Vercel function slot");
assert.match(api, /url\.pathname\s*===\s*["']\/api\/player-world-command["']/, "the index function must route the player world command endpoint");
assert.match(api, /request\.method\s*!==\s*["']POST["']/, "command endpoint must be POST-only");
assert.match(api, /isSameOriginRequest\(request\)/, "command endpoint must reject cross-origin cookie writes");
assert.match(api, /verifyPlayerSession\(request/, "command actor must always come from the HttpOnly session");
assert.match(catalog, /CONFIRM_BRIEFING_V1[\s\S]*?rpcName:\s*["']baekji_player_confirm_briefing_v1["']/, "B1 command/RPC identity lives in the shared catalog");
assert.doesNotMatch(api, /baekji_mvp_put_state[^\n]*player-world-command|player-world-command[\s\S]{0,1000}baekji_mvp_put_state/, "the command endpoint must never regain generic whole-world PUT authority");

const commandStart = api.indexOf("export async function playerWorldCommandHandler");
assert.ok(commandStart >= 0);
const commandSlice = api.slice(commandStart, api.indexOf("\nexport ", commandStart + 1) > commandStart ? api.indexOf("\nexport ", commandStart + 1) : api.length);
assert.match(commandSlice, /commandId/, "caller idempotency key is required");
assert.match(commandSlice, /expectedRevision/, "optimistic revision is required");
assert.match(catalog, /CONFIRM_BRIEFING_V1/, "only B1's explicit command kind is catalogued");
assert.match(api, /WORLD_COMMAND_KEYS[\s\S]*?Object\.keys\(value\).*?!WORLD_COMMAND_KEYS\.has/, "the strict envelope allowlist must reject actor-smuggling fields");
assert.match(commandSlice, /p_session_token/, "RPC body must supply only the server-extracted session token");
assert.match(commandSlice, /p_command_id/, "RPC body must supply the client idempotency key");
assert.match(commandSlice, /p_expected_revision/, "RPC body must supply the optimistic revision");
assert.match(commandSlice, /baekji_player_world_command_source_v1/, "handler reads one canonical command source after session verification");
assert.match(commandSlice, /reducePlayerWorldCommand\(/, "handler delegates mutation semantics to the pure server reducer");
assert.match(commandSlice, /baekji_player_world_command_commit_v1/, "handler commits only the reducer result through the CAS/ledger RPC");
assert.match(commandSlice, /p_next_state:\s*reduced\.status === "APPLIED" \? reduced\.state : source\.state/, "only the server supplies the next snapshot to commit");
assert.match(engine, /family === "party"[\s\S]*reducePlayerWorldPartyCommand[\s\S]*family === "investigation"[\s\S]*family === "inventory"/, "one pure engine selects the finite family reducers");
assert.doesNotMatch(commandSlice, /\.\.\.body|JSON\.stringify\(body\)/, "untrusted command body must never be forwarded wholesale to RPC");
assert.doesNotMatch(commandSlice, /identity\.(?:characterId|accountId|sessionId).*body|body.*identity\.(?:characterId|accountId|sessionId)/, "actor identity must not be caller-selectable");
assert.match(api, /new Set\(\["APPLIED", "NOOP", "REPLAY", "REVISION_CONFLICT", "OUT_OF_SCOPE", "COMMAND_ID_REUSED"\]\)/, "response mapping must distinguish replay/revision-conflict/no-op/out-of-scope/id reuse without leaking state");
assert.doesNotMatch(commandSlice, /sendJson\(response,\s*200,\s*\{[^}]*\b(?:state|characters|parties|sessions)\s*:/i, "command response must not return a whole world snapshot");

assert.match(auth, /function\s+isSameOriginRequest/, "shared same-origin guard remains the cookie-write boundary");
assert.match(sql, /create\s+(?:or\s+replace\s+)?function\s+public\.baekji_player_confirm_briefing_v1\s*\(\s*p_session_token\s+text\s*,\s*p_command_id\s+uuid\s*,\s*p_expected_revision\s+bigint/i, "B1 RPC must have exactly token, UUID command id, and expected revision inputs");
assert.match(sql, /create\s+table\s+if\s+not\s+exists\s+public\.baekji_player_world_command_ledger/i, "idempotent command ledger must be private and durable");
assert.match(sql, /alter\s+table\s+public\.baekji_player_world_command_ledger\s+enable\s+row\s+level\s+security/i, "ledger must be RLS-protected");
assert.match(sql, /revoke\s+all\s+on\s+table\s+public\.baekji_player_world_command_ledger\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i, "ledger must not be browser-readable");
assert.match(sql, /for\s+update/i, "command must lock its ledger/state rows before deciding replay or revision");
assert.match(sql, /p_command_id/, "ledger operation must use caller command id");
assert.match(sql, /p_expected_revision/, "RPC must enforce optimistic revision");
assert.match(sql, /return\s+query\s+select\s+'REVISION_CONFLICT'/i, "stale revisions must have an explicit non-write outcome");
assert.match(sql, /v_member_ids\s*\?\s*v_preflight\.actor_character_id[\s\S]*?creatorId[\s\S]*?'OUT_OF_SCOPE'/i, "a session outsider or leader must be rejected at the SQL authority boundary");
assert.match(sql, /(?:COMMAND_NOOP|NOOP)/i, "an already-confirmed actor must be idempotent no-op");
assert.match(sql, /briefingConfirmedBy/i, "B1 must mutate briefing confirmation");

const functionStart = sql.search(/create\s+(?:or\s+replace\s+)?function\s+public\.baekji_player_confirm_briefing_v1/i);
assert.ok(functionStart >= 0);
const functionSlice = sql.slice(functionStart, sql.indexOf("revoke all on function public.baekji_player_confirm_briefing_v1", functionStart));
assert.match(functionSlice, /v_preflight\.status\s+is\s+not\s+null[\s\S]*?return\s+query\s+select\s+v_preflight\.status/i, "B1 forwards shared-envelope replay and conflict statuses unchanged");
// The actor's currentSessionId is necessarily read from characters; only JSONB
// mutation targets are prohibited from reaching characters or parties.
assert.doesNotMatch(functionSlice, /jsonb_set\s*\([^,]+,\s*array\s*\[\s*['"](?:characters|parties)['"]/i, "B1 must not mutate characters or parties");
assert.match(functionSlice, /jsonb_set[\s\S]*briefingConfirmedBy/i, "B1's sole world mutation must target sessions.*.briefingConfirmedBy");
assert.match(sql, /revoke\s+all\s+on\s+function\s+public\.baekji_player_confirm_briefing_v1\s*\(\s*text\s*,\s*uuid\s*,\s*bigint\s*\)\s+from\s+public\s*,\s*anon\s*,\s*authenticated/i, "only the server role may execute B1 RPC");
assert.match(sql, /grant\s+execute\s+on\s+function\s+public\.baekji_player_confirm_briefing_v1\s*\(\s*text\s*,\s*uuid\s*,\s*bigint\s*\)\s+to\s+service_role/i, "B1 RPC must grant only service_role");

const configuredFunctions = Object.keys(vercel.functions || {});
assert.equal(configuredFunctions.includes("api/player-world-projection.mjs"), false, "projection is routed through the authenticated index boundary instead of consuming a separate function slot");
assert.ok(vercel.rewrites.some((rule) => rule.source === "/api/player-world-projection" && rule.destination === "/api/index.mjs"), "projection route must stay explicitly mapped to the session-authenticated boundary");
assert.equal(fs.existsSync(path.join(ROOT, "api", "player-world-command.mjs")), false, "B1 must not add a standalone Vercel function");

console.log("PASS: B1 player world command is actor-bound, idempotent, revision-safe, and index-routed");
