import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { signAdminSession, verifyAdminToken } from "../api/_admin-auth.mjs";
import { adminSnapshotHandler } from "../api/admin-snapshot.mjs";

const secret = "test-admin-session-secret-at-least-long-enough";
const now = 1_800_000_000_000;
const token = signAdminSession({ id: "admin_a", name: "관리자 A" }, secret, { now, maxAgeSeconds: 3600 });
assert.equal(verifyAdminToken(token, secret, { now: now + 1000 }).ok, true);
assert.equal(verifyAdminToken(token, "wrong-secret", { now }).status, 401);
assert.equal(verifyAdminToken(token, "", { now }).status, 503);
assert.equal(verifyAdminToken(token, secret, { now: now + 4_000_000 }).code, "ADMIN_SESSION_EXPIRED");

function responseCollector() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(value = "") { this.body += String(value); },
  };
}

let fetchCount = 0;
const unauthorizedResponse = responseCollector();
await adminSnapshotHandler({ method: "GET", headers: {} }, unauthorizedResponse, {
  env: { ADMIN_SESSION_SECRET: secret },
  fetchImpl: async () => { fetchCount += 1; throw new Error("must not fetch"); },
});
assert.equal(unauthorizedResponse.statusCode, 401);
assert.equal(fetchCount, 0, "unauthenticated requests must not touch world state");

const worldState = {
  version: 3,
  storyDay: 1,
  loopId: "LOOP-001",
  characters: { a: { id: "a", contamination: 12, symptom: "안정", inventory: {} } },
  parties: {},
  sessions: {},
};
const responses = [
  { ok: true, json: async () => [{ state: worldState, revision: 7 }] },
  { ok: true, json: async () => [{ id: "a", character_name: "캐릭터 A", profile_photo: "data:image/jpeg;base64,AA" }] },
];
const authorizedResponse = responseCollector();
await adminSnapshotHandler({ method: "GET", headers: { cookie: `baekji_admin_session=${token}` } }, authorizedResponse, {
  env: { ADMIN_SESSION_SECRET: secret },
  fetchImpl: async () => responses.shift(),
});
assert.equal(authorizedResponse.statusCode, 200);
const payload = JSON.parse(authorizedResponse.body);
assert.equal(payload.ok, true);
assert.equal(payload.admin.id, "admin_a");
assert.equal(payload.revision, 7);
assert.deepEqual(payload.state, worldState);
assert.deepEqual(payload.directory, [{ id: "a", name: "캐릭터 A", profilePhoto: "data:image/jpeg;base64,AA" }]);

const html = await readFile(new URL("../admin-dashboard.html", import.meta.url), "utf8");
const css = await readFile(new URL("../admin-dashboard.css", import.meta.url), "utf8");
const js = await readFile(new URL("../admin-dashboard.js", import.meta.url), "utf8");

for (const tab of ["overview", "zones", "parties", "characters", "logs"]) {
  assert.match(html, new RegExp(`data-admin-tab=\\"${tab}\\"`));
}
assert.match(html, /admin-chat-rail/);
assert.match(html, /SYSTEM 전송/);
assert.match(css, /grid-template-columns:minmax\(0,1fr\) 330px/);
assert.match(css, /\.admin-modal-backdrop/);
assert.match(js, /\/api\/admin-snapshot/);
assert.match(js, /data-admin-detail/);
assert.match(js, /data-log-party/);
assert.doesNotMatch(js, /localStorage\.getItem/);
assert.doesNotMatch(js, /localStorage\.setItem/);
assert.match(js, /READ ONLY/);

console.log("PASS: secure read-only admin dashboard uses tabs, detail modals, persistent chat rail, and authenticated snapshot API");
