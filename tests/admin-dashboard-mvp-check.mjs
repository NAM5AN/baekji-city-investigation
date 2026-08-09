import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { adminSessionTokenFromRequest, adminSessionCookie } from "../api/_admin-auth.mjs";
import { adminLoginHandler } from "../api/admin-login.mjs";
import { adminSnapshotHandler } from "../api/admin-snapshot.mjs";

function responseCollector() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(value = "") { this.body += String(value); },
  };
}

function jsonRequest(method, body, headers = {}) {
  const bytes = Buffer.from(JSON.stringify(body || {}));
  return {
    method,
    headers,
    async *[Symbol.asyncIterator]() { yield bytes; },
  };
}

assert.equal(adminSessionTokenFromRequest({ headers: { cookie: "other=1; baekji_admin_session=test-token; x=2" } }), "test-token");
assert.match(adminSessionCookie("opaque-token"), /^baekji_admin_session=opaque-token; Path=\/; HttpOnly; Secure; SameSite=Strict;/);

const loginResponse = responseCollector();
let loginRpcUrl = "";
let loginRpcBody = null;
await adminLoginHandler(jsonRequest("POST", { loginId: "AD1", password: "0000" }), loginResponse, {
  env: {},
  fetchImpl: async (url, options) => {
    loginRpcUrl = String(url);
    loginRpcBody = JSON.parse(options.body);
    return {
      ok: true,
      json: async () => [{ session_token: "opaque-session-token", login_id: "AD1", display_name: "관리자 AD1", expires_at: "2026-08-10T12:00:00Z" }],
    };
  },
});
assert.equal(loginResponse.statusCode, 200);
assert.match(loginRpcUrl, /\/rpc\/baekji_admin_login$/);
assert.deepEqual(loginRpcBody, { p_login_id: "AD1", p_password: "0000" });
assert.match(loginResponse.headers["set-cookie"], /HttpOnly/);
assert.doesNotMatch(loginResponse.body, /opaque-session-token/, "session token must never be exposed to browser JavaScript");
assert.equal(JSON.parse(loginResponse.body).admin.id, "AD1");

const failedLoginResponse = responseCollector();
await adminLoginHandler(jsonRequest("POST", { loginId: "AD1", password: "9999" }), failedLoginResponse, {
  env: {},
  fetchImpl: async () => ({ ok: true, json: async () => [] }),
});
assert.equal(failedLoginResponse.statusCode, 401);

let fetchCount = 0;
const unauthorizedResponse = responseCollector();
await adminSnapshotHandler({ method: "GET", headers: {} }, unauthorizedResponse, {
  env: {},
  fetchImpl: async () => { fetchCount += 1; throw new Error("must not fetch"); },
});
assert.equal(unauthorizedResponse.statusCode, 401);
assert.equal(fetchCount, 0, "requests without an admin cookie must not touch world state");

const worldState = {
  version: 3,
  storyDay: 1,
  loopId: "LOOP-001",
  characters: { a: { id: "a", contamination: 12, symptom: "안정", inventory: {} } },
  parties: {},
  sessions: {},
};
const responses = [
  { ok: true, json: async () => [{ login_id: "AD1", display_name: "관리자 AD1", expires_at: "2026-08-10T12:00:00Z" }] },
  { ok: true, json: async () => [{ state: worldState, revision: 7 }] },
  { ok: true, json: async () => [{ id: "a", character_name: "캐릭터 A", profile_photo: "data:image/jpeg;base64,AA" }] },
];
const snapshotCalls = [];
const authorizedResponse = responseCollector();
await adminSnapshotHandler({ method: "GET", headers: { cookie: "baekji_admin_session=opaque-session-token" } }, authorizedResponse, {
  env: {},
  fetchImpl: async (url, options) => {
    snapshotCalls.push({ url: String(url), body: JSON.parse(options.body) });
    return responses.shift();
  },
});
assert.equal(authorizedResponse.statusCode, 200);
assert.match(snapshotCalls[0].url, /\/rpc\/baekji_admin_session_verify$/);
assert.deepEqual(snapshotCalls[0].body, { p_token: "opaque-session-token" });
const payload = JSON.parse(authorizedResponse.body);
assert.equal(payload.ok, true);
assert.equal(payload.admin.id, "AD1");
assert.equal(payload.revision, 7);
assert.deepEqual(payload.state, worldState);
assert.deepEqual(payload.directory, [{ id: "a", name: "캐릭터 A", profilePhoto: "data:image/jpeg;base64,AA" }]);

const html = await readFile(new URL("../admin-dashboard.html", import.meta.url), "utf8");
const css = await readFile(new URL("../admin-dashboard.css", import.meta.url), "utf8");
const js = await readFile(new URL("../admin-dashboard.js", import.meta.url), "utf8");
const loginBridge = await readFile(new URL("../admin-login-bridge.js", import.meta.url), "utf8");
const index = await readFile(new URL("../index.html", import.meta.url), "utf8");

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
assert.match(loginBridge, /\^AD\\d\+\$/);
assert.match(loginBridge, /\/api\/admin-login/);
assert.match(loginBridge, /stopImmediatePropagation/);
assert.ok(index.indexOf("admin-login-bridge.js") < index.indexOf("tester-auth.js"), "admin handler must register before tester handlers");

console.log("PASS: AD admin login uses an HttpOnly DB session and opens the secure tabbed read-only dashboard");
