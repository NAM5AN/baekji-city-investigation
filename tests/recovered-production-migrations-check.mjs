import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";

const directory = new URL("../supabase/recovered-production-migrations/", import.meta.url);
const activeDirectory = new URL("../supabase/migrations/", import.meta.url);
const expected = new Map([
  ["20260809050616_baekji_test_backend_recovery.sql", { md5: "a13e1d163fd18cf7e84ce30341ab311d", bytes: 6775 }],
  ["20260809152353_admin_auth_foundation.sql", { md5: "18cae308b96e958a1c63c54855300844", bytes: 4108 }],
  ["20260809154048_fix_admin_login_and_session_verify.sql", { md5: "db976f6f7df4b9be9b9fa8a48b59a4e8", bytes: 2138 }],
  ["20260809162058_admin_mvp3_communications.sql", { md5: "d6faadada50573ecf6a7b102080c2a73", bytes: 9683 }],
  ["20260809234033_admin_control_mvp4_audit_and_atomic_state.sql", { md5: "debfce8027694fbb1af158e1959c15c2", bytes: 6753 }],
  ["20260810004035_admin_operations_mvp5.sql", { md5: "991928cee250b20c8f6a6ea1c2734d5a", bytes: 2193 }],
  ["20260810074520_admin_system_sender_label.sql", { md5: "4715cbfb0ab5e1596a6463ca3f2cdcb5", bytes: 6160 }],
]);

const sqlFiles = fs.readdirSync(directory)
  .filter((file) => file.endsWith(".sql"))
  .sort();
assert.deepEqual(sqlFiles, [...expected.keys()], "recovered production migration set must stay explicit");

const activeSqlFiles = fs.readdirSync(activeDirectory)
  .filter((file) => file.endsWith(".sql"))
  .sort();
assert.equal(
  [...expected.keys()].some((file) => activeSqlFiles.includes(file)),
  false,
  "archive-only production snapshots must never enter the active migration chain",
);

for (const [file, { md5, bytes }] of expected) {
  const archiveBytes = fs.readFileSync(new URL(file, directory));
  assert.equal(archiveBytes.length, bytes, `${file} must preserve its production byte length`);
  assert.notEqual(archiveBytes.at(-1), 0x0a, `${file} must not add a trailing LF absent from production`);
  assert.equal(
    crypto.createHash("md5").update(archiveBytes).digest("hex"),
    md5,
    `${file} must remain byte-for-byte equivalent to production`,
  );
}

const readme = fs.readFileSync(new URL("README.md", directory), "utf8");
assert.match(readme, /not an active migration chain/i);
assert.match(readme, /archive-only/i);
assert.match(readme, /byte-for-byte/i);
assert.match(readme, /Do not apply/i);

console.log("PASS: recovered shorts production migrations remain exact, isolated reference snapshots");
