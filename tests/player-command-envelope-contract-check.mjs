import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const envelope = read("supabase/migrations/20260828055659_player_confirm_briefing_command.sql");
const commands = [
  ["20260828055659_player_confirm_briefing_command.sql", "CONFIRM_BRIEFING_V1"],
  ["20260828055706_player_decline_party_invite_command.sql", "DECLINE_PARTY_INVITE_V1"],
  ["20260828055712_player_cancel_party_invite_command.sql", "CANCEL_PARTY_INVITE_V1"],
  ["20260828055719_player_invite_party_member_command.sql", "INVITE_PARTY_MEMBER_V1"],
  ["20260828055726_player_accept_party_invite_command.sql", "ACCEPT_PARTY_INVITE_V1"],
  ["20260828055757_player_rename_party_command.sql", "RENAME_PARTY_V1"],
  ["20260828055804_player_create_party_command.sql", "CREATE_PARTY_V1"],
  ["20260828055810_player_toggle_party_ready_command.sql", "TOGGLE_PARTY_READY_V1"],
  ["20260828055817_player_lock_party_composition_command.sql", "LOCK_PARTY_COMPOSITION_V1"],
];
const commandMigrationFiles = fs.readdirSync(path.join(ROOT, "supabase", "migrations"))
  .filter((file) => /^202608(?:26|28).*player_.*_command\.sql$/.test(file))
  .sort();
assert.deepEqual(commandMigrationFiles, commands.map(([file]) => file).sort(), "the structural package covers exactly the nine shipped player commands without adding a domain feature");

assert.match(envelope, /function\s+public\.baekji_player_world_command_preflight_v1[\s\S]*?security\s+invoker[\s\S]*?set\s+search_path\s*=\s*public\s*,\s*extensions/i);
assert.match(envelope, /baekji_player_session_verify_v2[\s\S]*?state_key\s*=\s*'day1_world'[\s\S]*?for\s+update[\s\S]*?30 days[\s\S]*?offset\s+511[\s\S]*?COMMAND_ID_REUSED[\s\S]*?REVISION_CONFLICT/i);
assert.match(envelope, /function\s+public\.baekji_player_world_command_record_v1[\s\S]*?security\s+invoker[\s\S]*?insert\s+into\s+public\.baekji_player_world_command_ledger/is);
assert.match(envelope, /p_command_version\s+is\s+null[\s\S]*?p_command_version\s*<>\s*1/i, "shared helpers fail closed for a null or unsupported command version");
assert.match(envelope, /p_result_status\s+is\s+null[\s\S]*?p_result_status\s+not\s+in\s*\(\s*'APPLIED'\s*,\s*'NOOP'\s*,\s*'OUT_OF_SCOPE'\s*\)/i, "the recorder fails closed for a null or unsupported terminal status");
for (const signature of [
  "baekji_player_world_command_preflight_v1(text, uuid, bigint, text, integer, text)",
  "baekji_player_world_command_record_v1(uuid, uuid, text, integer, text, text, bigint)",
]) {
  assert.match(envelope, new RegExp(`revoke\\s+all\\s+on\\s+function\\s+public\\.${signature.replace(/[().]/g, "\\$&")}\\s+from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated\\s*,\\s*service_role`, "i"));
  assert.doesNotMatch(envelope, new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${signature.replace(/[().]/g, "\\$&")}\\s+to`, "i"));
}

for (const [file, name] of commands) {
  const source = read(path.posix.join("supabase/migrations", file));
  const commandSource = file === "20260828055659_player_confirm_briefing_command.sql"
    ? source.slice(source.indexOf("create or replace function public.baekji_player_confirm_briefing_v1"))
    : source;
  assert.match(source, new RegExp(`baekji_player_world_command_preflight_v1\\([\\s\\S]*?'${name}'`, "i"), `${name} delegates session/lock/replay/revision to the shared envelope`);
  assert.match(source, /v_preflight\.status\s+is\s+not\s+null[\s\S]{0,300}return\s+query\s+select\s+v_preflight\.status/i, `${name} returns envelope terminal statuses unchanged`);
  assert.match(source, /v_world\.state\s*:=\s*v_preflight\.world_state[\s\S]{0,120}v_world\.revision\s*:=\s*v_preflight\.revision/i, `${name} uses the locked canonical snapshot`);
  assert.equal((commandSource.match(/baekji_player_world_command_preflight_v1\s*\(/gi) || []).length, 1, `${name} enters the shared preflight exactly once`);
  assert.match(commandSource, new RegExp(`baekji_player_world_command_record_v1\\([\\s\\S]*?'${name}'[\\s\\S]*?'APPLIED'`, "i"), `${name} records its successful terminal result through the shared recorder`);
  assert.doesNotMatch(commandSource, /insert\s+into\s+public\.baekji_player_world_command_ledger/i, `${name} records results only through the shared recorder`);
  assert.doesNotMatch(commandSource, /baekji_player_session_verify_v2\s*\(|delete\s+from\s+public\.baekji_player_world_command_ledger|\bfor\s+update\b/i, `${name} must not reintroduce duplicated auth, retention, or world-lock boilerplate`);
}

const directLedgerInserts = (envelope.match(/insert\s+into\s+public\.baekji_player_world_command_ledger/gi) || []).length;
assert.equal(directLedgerInserts, 1, "only the shared recorder may insert command-ledger rows");

console.log("PASS: all nine player commands delegate preflight to the non-public shared envelope");
