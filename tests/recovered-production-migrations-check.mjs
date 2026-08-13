import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";

const directory = new URL("../supabase/recovered-production-migrations/", import.meta.url);
const expected = new Map([
  ["20260809050616_baekji_test_backend_recovery.sql", ["a13e1d163fd18cf7e84ce30341ab311d", 6775]],
  ["20260809152353_admin_auth_foundation.sql", ["18cae308b96e958a1c63c54855300844", 4108]],
  ["20260809154048_fix_admin_login_and_session_verify.sql", ["db976f6f7df4b9be9b9fa8a48b59a4e8", 2138]],
  ["20260809162058_admin_mvp3_communications.sql", ["d6faadada50573ecf6a7b102080c2a73", 9683]],
]);

const sqlFiles = fs.readdirSync(directory)
  .filter((file) => file.endsWith(".sql"))
  .sort();
assert.deepEqual(sqlFiles, [...expected.keys()], "recovered production migration set must stay explicit");

for (const [file, [hash, length]] of expected) {
  const sql = fs.readFileSync(new URL(file, directory), "utf8").trimEnd();
  assert.equal(sql.length, length, `${file} must preserve its production character length`);
  assert.equal(
    crypto.createHash("md5").update(sql).digest("hex"),
    hash,
    `${file} must remain byte-for-byte equivalent to production`,
  );
}

const readme = fs.readFileSync(new URL("README.md", directory), "utf8");
assert.match(readme, /not an active migration chain/i);
assert.match(readme, /Do not apply/i);

console.log("PASS: recovered shorts production migrations remain exact, isolated reference snapshots");
