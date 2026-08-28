import assert from "node:assert/strict";
import vm from "node:vm";
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
  env: { SUPABASE_SECRET_KEY: "test-server-secret" },
  fetchImpl: async (url, options) => {
    snapshotCalls.push({ url: String(url), body: JSON.parse(options.body) });
    assert.equal(options.headers.apikey, "test-server-secret", "admin snapshot RPCs must use the server-only credential");
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
const shell = await readFile(new URL("../admin-shell-runtime.js", import.meta.url), "utf8");
const logGroupingCss = await readFile(new URL("../admin-log-recipient-grouping.css", import.meta.url), "utf8");
const logGroupingJs = await readFile(new URL("../admin-log-recipient-grouping.js", import.meta.url), "utf8");
const loginBridge = await readFile(new URL("../admin-login-bridge.js", import.meta.url), "utf8");
const index = await readFile(new URL("../index.html", import.meta.url), "utf8");

for (const tab of ["overview", "zones", "parties", "characters", "logs"]) {
  assert.match(html, new RegExp(`data-admin-tab=\\"${tab}\\"`));
}
assert.match(html, /admin-chat-rail/);
assert.match(html, /SYSTEM 전송/);
assert.match(html, /admin-log-recipient-grouping\.css/);
assert.match(html, /admin-log-recipient-grouping\.js/);
assert.match(html, /admin-shell-runtime\.js\?v=0\.1\.0/);
assert.match(html, /admin-dashboard\.css\?v=0\.1\.1&stage4d=1/);
assert.match(html, /admin-dashboard\.js\?v=0\.1\.2&shell-runtime=1&stage4d=1/);
assert.doesNotMatch(html, /admin-control-status-mvp4\.js/, "dashboard must not load the removed status decorator");
assert.ok(html.indexOf("admin-canonical-zones.js") < html.indexOf("admin-shell-runtime.js"));
assert.ok(html.indexOf("admin-shell-runtime.js") < html.indexOf("admin-dashboard.js"));
assert.ok(html.indexOf("admin-dashboard.js") < html.indexOf("admin-log-recipient-grouping.js"), "admin log grouping must run after the base dashboard renderer");
assert.match(css, /grid-template-columns:minmax\(0,1fr\) 330px/);
assert.match(css, /\.admin-modal-backdrop/);
assert.match(logGroupingCss, /\.admin-log-recipients/);
assert.match(js, /__BAEKJI_ADMIN_SHELL__/);
assert.match(js, /shell\.snapshot\.refresh\(\)/);
assert.match(shell, /\/api\/admin-snapshot/);
assert.match(js, /code === "ADMIN_SNAPSHOT_OFFLINE" \? "OFFLINE" : setup \? "SETUP" : "LOCKED"/);
assert.match(js, /presentConnection\("READ ONLY"\)/);
assert.match(js, /동기화 중…/);
assert.match(js, /연결 끊김/);
assert.match(js, /설정 확인 필요/);
assert.doesNotMatch(js, /MutationObserver|document\.body\.append|createElement\(\s*["']style["']\s*\)/, "dashboard owns connection state directly without a decorator");
assert.match(css, /\[data-admin-connection\]\[data-admin-sync-visible="true"\]/);
assert.match(css, /\[data-admin-connection\]\[data-admin-sync-kind="error"\]/);
assert.match(js, /data-admin-detail/);
assert.match(js, /data-log-party/);
assert.doesNotMatch(js, /localStorage\.getItem/);
assert.doesNotMatch(js, /localStorage\.setItem/);
assert.match(js, /READ ONLY/);
assert.match(loginBridge, /\^AD\\d\+\$/);
assert.match(loginBridge, /\/api\/admin-login/);
assert.match(loginBridge, /stopImmediatePropagation/);
assert.ok(index.indexOf("admin-login-bridge.js") < index.indexOf("tester-auth.js"), "admin handler must register before tester handlers");

const groupingSandbox = { console, Date, Map, Set, Object, String, Number, JSON, Array };
vm.createContext(groupingSandbox);
vm.runInContext(logGroupingJs, groupingSandbox, { filename: "admin-log-recipient-grouping.js" });
const grouping = groupingSandbox.__BAEKJI_ADMIN_LOG_GROUPING_TEST__;
assert.ok(grouping, "admin log grouping test API must be exposed before DOM bootstrapping");

const systemBase = {
  actor: "SYSTEM",
  type: "success",
  timeText: "2026. 8. 11. 16:36:12",
  text: "동일한 SYSTEM 판정 로그",
};
const mergedSystem = grouping.groupDescriptors([
  { ...systemBase, partyId: "party_a", partyName: "조사조 A" },
  { ...systemBase, partyId: "party_b", partyName: "조사조 B" },
]);
assert.equal(mergedSystem.length, 1, "same SYSTEM log broadcast to different parties must render as one admin row");
assert.equal(mergedSystem[0].grouped, true);
assert.equal(mergedSystem[0].items.length, 2);

const separateObservations = grouping.groupDescriptors([
  { ...systemBase, type: "field-action", partyId: "party_a", partyName: "조사조 A" },
  { ...systemBase, type: "field-action", partyId: "party_b", partyName: "조사조 B" },
]);
assert.equal(separateObservations.length, 2, "per-character field observations must never be collapsed");
assert.ok(separateObservations.every((entry) => entry.grouped === false));

const samePartyDuplicates = grouping.groupDescriptors([
  { ...systemBase, partyId: "party_a", partyName: "조사조 A" },
  { ...systemBase, partyId: "party_a", partyName: "조사조 A" },
]);
assert.equal(samePartyDuplicates.length, 2, "duplicates inside one party must remain visible as a real duplicate-writing bug");

const recipients = grouping.recipientNames({
  state: {
    parties: {
      party_a: { id: "party_a", memberIds: ["a"] },
      party_b: { id: "party_b", memberIds: ["b", "a"] },
    },
  },
  directory: [
    { id: "a", name: "테스트A" },
    { id: "b", name: "테스트B" },
  ],
}, [
  { partyId: "party_a", partyName: "조사조 A" },
  { partyId: "party_b", partyName: "조사조 B" },
]);
assert.deepEqual(Array.from(recipients), ["테스트A", "테스트B"], "grouped rows must show unique recipient character names");

console.log("PASS: AD admin login uses an HttpOnly DB session and dashboard groups cross-party SYSTEM broadcasts without collapsing observer-specific logs");
