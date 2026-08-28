import assert from "node:assert/strict";
import fs from "node:fs";

const sql = fs.readFileSync(new URL("../supabase/migrations/20260828055542_player_session_authorization.sql", import.meta.url), "utf8");
const v2 = [
  ["baekji_player_login_v2", "text, text, text, text"],
  ["baekji_player_signup_v2", "text, text, text, text, text"],
  ["baekji_player_session_verify_v2", "text"],
  ["baekji_player_session_revoke_v2", "text"],
  ["baekji_player_presence_ping_v2", "text, text"],
  ["baekji_player_admin_system_list_v2", "text, bigint, integer"],
];

for (const [name, signature] of v2) {
  assert.match(sql, new RegExp(`create or replace function public\\.${name}\\(`), `${name} must be introduced as an additive v2 RPC`);
  assert.match(sql, new RegExp(`revoke all on function public\\.${name}\\(${signature}\\) from public, anon, authenticated;`), `${name} must not be directly callable by browser roles`);
  assert.match(sql, new RegExp(`grant execute on function public\\.${name}\\(${signature}\\) to service_role;`), `${name} must be callable only by the server credential`);
}

for (const name of ["baekji_player_login", "baekji_player_signup", "baekji_player_session_verify", "baekji_player_session_revoke", "baekji_player_admin_system_list", "baekji_player_presence_ping"]) {
  assert.doesNotMatch(sql, new RegExp(`(?:create or replace |drop )function public\\.${name}\\(`), `additive migration must leave legacy ${name} untouched for staged client cutover`);
  assert.doesNotMatch(sql, new RegExp(`(?:revoke|grant) [\\s\\S]*?function public\\.${name}\\(`), `additive migration must not alter legacy ${name} grants`);
}

assert.match(sql, /create table if not exists public\.baekji_player_sessions/, "opaque server session records must be private state");
assert.match(sql, /create table if not exists public\.baekji_player_login_throttles/, "PIN throttling must be durable shared state");
assert.match(sql, /enable row level security;[\s\S]*revoke all on table public\.baekji_player_login_throttles from public, anon, authenticated;/, "browser roles must not read throttle state");
assert.match(sql, /insert into public\.baekji_player_login_throttles\(login_key_hash\)[\s\S]*on conflict \(login_key_hash\) do nothing;/, "throttle key creation must tolerate concurrency");
assert.match(sql, /where login_key_hash = v_login_key_hash\s+for update;/, "concurrent attempts for one name must serialize with a row lock");
assert.match(sql, /when v_throttle\.failure_count \+ 1 < 5 then null/, "first four bad PINs must not lock an account");
assert.match(sql, /least\(300, 30 \* \(2 \^ least\(v_throttle\.failure_count \+ 1 - 5, 4\)\)::integer\)/, "lockout must exponentially back off but remain bounded");
assert.match(sql, /delete from public\.baekji_player_login_throttles where login_key_hash = v_login_key_hash;/, "successful login must reset the durable throttle record");
assert.match(sql, /updated_at < v_issued_at - interval '30 days'[\s\S]*limit 100/, "stale throttle cleanup must be bounded");
assert.match(sql, /last_used_at <= v_now - interval '60 seconds'/, "session verification must bound write amplification from polling clients");

const feed = sql.match(/create or replace function public\.baekji_player_admin_system_list_v2[\s\S]*?\n\$\$;/)?.[0] || "";
const feedProjection = feed.match(/returns table\([\s\S]*?\)\s*language sql/)?.[0] || "";
assert.match(feedProjection, /created_at timestamptz/, "feed must return its explicit safe projection");
assert.doesNotMatch(feedProjection, /recipient_(?:session|character)_ids/, "feed response projection must never disclose recipient metadata");
assert.match(feed, /current_session_id/, "feed must derive the character's current session server-side");
assert.match(feed, /current_session_id\s*=\s*any\(e\.recipient_session_ids\)/, "a notification addressed to an old session must not be readable after reassignment");
assert.match(feed, /identity\.character_id\s*=\s*any\(e\.recipient_character_ids\)/, "feed must also remain character-bound");

assert.doesNotMatch(sql, /baekji_mvp_(?:get|put)_state/, "S-WORLD-001/002 remain BLOCKED; this additive session migration must not falsely claim whole-world write remediation");
console.log("PASS: additive v2 RPC catalog is service-only, throttled atomically, and feed visibility is current-session-bound without recipient metadata");
