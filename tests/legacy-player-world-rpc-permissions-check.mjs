import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(new URL("../supabase/migrations/20260828060118_revoke_legacy_player_world_rpc_execute.sql", import.meta.url), "utf8");
const serviceRoleRevocation = fs.readFileSync(new URL("../supabase/migrations/20260828060456_revoke_legacy_world_writer_service_role.sql", import.meta.url), "utf8");
const recovered = fs.readFileSync(new URL("../supabase/recovered-production-migrations/20260809050616_baekji_test_backend_recovery.sql", import.meta.url), "utf8");
const snapshot = fs.readFileSync(new URL("../api/admin-snapshot.mjs", import.meta.url), "utf8");
const communications = fs.readFileSync(new URL("../api/admin-communications.mjs", import.meta.url), "utf8");
const liveProbe = fs.readFileSync(new URL("./tester-auth-live-check.mjs", import.meta.url), "utf8");

for (const signature of [
  "baekji_mvp_get_state(text)",
  "baekji_mvp_get_revision(text)",
  "baekji_mvp_put_state(text, jsonb, text, bigint)",
]) {
  for (const role of ["public", "anon", "authenticated"]) {
    assert.match(migration, new RegExp(`revoke\\s+execute\\s+on\\s+function\\s+public\\.${signature.replace(/[()]/g, "\\$&").replace(/, /g, "\\s*,\\s*")}\\s+from\\s+${role}\\s*;`, "i"), `${signature} must reject ${role}`);
  }
}

assert.match(recovered, /create or replace function public\.baekji_mvp_put_state\(\s*p_state_key text,\s*p_state jsonb,\s*p_writer_id text,\s*p_expected_revision bigint/s, "revocation must retain the recovered production argument order");

assert.match(migration, /grant\s+execute\s+on\s+function\s+public\.baekji_mvp_get_state\(text\)\s+to\s+service_role\s*;/i, "the one remaining server-side legacy read is explicit");
assert.doesNotMatch(migration, /grant\s+execute\s+on\s+function\s+public\.baekji_mvp_get_(?:revision|state)\([^)]*\)\s+to\s+(?:anon|authenticated)/i, "legacy reads must not regain browser grants");
assert.doesNotMatch(migration, /grant\s+execute\s+on\s+function\s+public\.baekji_mvp_put_state/i, "no server writer retains the generic whole-world write RPC");
assert.match(serviceRoleRevocation, /revoke\s+execute\s+on\s+function\s+public\.baekji_mvp_get_revision\(text\)\s+from\s+service_role\s*;/i, "the server must use the command source revision instead of the legacy generic revision RPC");
assert.match(serviceRoleRevocation, /revoke\s+execute\s+on\s+function\s+public\.baekji_mvp_put_state\(text\s*,\s*jsonb\s*,\s*text\s*,\s*bigint\)\s+from\s+service_role\s*;/i, "the server must not retain the generic whole-world writer");
assert.match(liveProbe, /must stay revoked from the publishable browser role/, "CI must treat live legacy-RPC denial as the Stage 8B success condition");
assert.doesNotMatch(liveProbe, /live cloud state RPCs are reachable/, "CI must not require browser access to a retired whole-world RPC");

for (const [label, source] of [["admin snapshot", snapshot], ["admin communications", communications]]) {
  assert.match(source, /from "\.\/\_player-auth\.mjs"/, `${label} must share the server-only RPC transport`);
  assert.match(source, /playerAuthRpc\(env, name, body, fetchImpl\)/, `${label} must route RPC calls through the server-only transport`);
  assert.doesNotMatch(source, /SUPABASE_PUBLISHABLE_KEY|SUPABASE_ANON_KEY|DEFAULT_SUPABASE_KEY/, `${label} must not contain a publishable fallback`);
}

console.log("PASS: legacy full-world RPCs are browser-revoked and admin reads use the server-only credential boundary");
