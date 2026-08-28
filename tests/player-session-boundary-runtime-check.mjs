import assert from "node:assert/strict";
import fs from "node:fs";
import { PLAYER_COOKIE_NAME, PLAYER_SESSION_SECONDS, clearPlayerSessionCookie, createPlayerSessionToken, parseCookies, playerAuthRpc, playerSessionCookie, playerSessionTokenFromRequest } from "../api/_player-auth.mjs";
import { playerSessionHandler, testerLoginHandler, testerSignupHandler } from "../api/index.mjs";
import { playerAdminSystemHandler } from "../api/player-admin-system.mjs";
import { playerPresenceHandler } from "../api/player-presence.mjs";
import { adminSnapshotHandler } from "../api/admin-snapshot.mjs";

function response() { return { statusCode: 0, headers: {}, body: "", setHeader(k, v) { this.headers[String(k).toLowerCase()] = v; }, end(v = "") { this.body += String(v); }, json() { return JSON.parse(this.body); } }; }
function request(method, body = null, { url = "/", cookie = "", origin = "" } = {}) { const bytes = Buffer.from(body == null ? "" : JSON.stringify(body)); return { method, url, headers: { ...(cookie ? { cookie } : {}), ...(origin ? { origin, host: "example.test" } : {}) }, async *[Symbol.asyncIterator]() { if (bytes.length) yield bytes; } }; }
const identities = { tokenA: { account_id: "account-a", character_id: "a", character_name: "테스트A", profile_photo: "a.png", session_id: "session-a" }, tokenB: { account_id: "account-b", character_id: "b", character_name: "테스트B", profile_photo: "b.png", session_id: "session-b" } };
const authEnv = { SUPABASE_SECRET_KEY: "test-server-secret" };
const calls = [];
async function fetchImpl(url, options = {}) {
  const name = String(url).split("/").at(-1), body = JSON.parse(options.body || "{}"); calls.push({ name, body });
  const json = (value) => ({ ok: true, status: 200, json: async () => value });
  if (name === "baekji_player_session_verify_v2") return json(identities[body.p_session_token] ? [identities[body.p_session_token]] : []);
  if (name === "baekji_player_session_revoke_v2") return json([true]);
  if (name === "baekji_player_login_v2") return json([{ id: "a", character_name: "테스트A", profile_photo: "a.png" }]);
  if (name === "baekji_player_signup_v2") return json([{ id: "b", character_name: "테스트B", profile_photo: "b.png" }]);
  if (name === "baekji_player_character_bootstrap_v1") return json([{ revision: 0, created: false }]);
  if (name === "baekji_player_admin_system_list_v2") return json([{ id: 7, sender_label: "안내방송", target_kind: "CHARACTER", target_label: "테스트A", message: "확인", created_at: "2026-08-26" }]);
  if (name === "baekji_player_presence_ping_v2") return json([]);
  throw new Error(`unexpected ${name}`);
}
const a = `${PLAYER_COOKIE_NAME}=tokenA`, b = `${PLAYER_COOKIE_NAME}=tokenB`;
assert.equal(PLAYER_COOKIE_NAME, "baekji_player_session"); assert.equal(PLAYER_SESSION_SECONDS, 43200); assert.equal(parseCookies(`x=1; ${a}`).baekji_player_session, "tokenA"); assert.equal(playerSessionTokenFromRequest({ headers: { cookie: a } }), "tokenA"); assert.match(playerSessionCookie("rotated"), /HttpOnly; Secure; SameSite=Strict; Max-Age=43200/); assert.match(clearPlayerSessionCookie(), /Max-Age=0/); assert.notEqual(createPlayerSessionToken(), createPlayerSessionToken());

for (const [handler, body, token, status] of [[testerLoginHandler, { characterName: "테스트A", pin: "0000" }, "login-token", 200], [testerSignupHandler, { characterName: "테스트B", pin: "1234", profilePhoto: "data:image/png;base64,AA" }, "signup-token", 201]]) { const r = response(); await handler(request("POST", body), r, { env: authEnv, fetchImpl, tokenFactory: () => token }); assert.equal(r.statusCode, status); assert.match(r.headers["set-cookie"], new RegExp(`${PLAYER_COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict`)); assert.doesNotMatch(r.body, new RegExp(token)); }
const largePhoto = `data:image/png;base64,${"a".repeat(20 * 1024)}`;
const largeSignup = response(); const callsBeforeLargeSignup = calls.length;
await testerSignupHandler(request("POST", { characterName: "테스트B", pin: "1234", profilePhoto: largePhoto }), largeSignup, { env: authEnv, fetchImpl, tokenFactory: () => "large-signup-token" });
assert.equal(largeSignup.statusCode, 201, "valid profile photos above the shared 16KiB limit must reach signup RPC");
assert.equal(calls.length, callsBeforeLargeSignup + 2, "signup and authoritative bootstrap are both required"); assert.equal(calls.filter((x) => x.name === "baekji_player_signup_v2").at(-1).body.p_profile_photo.length, largePhoto.length);
const oversizedSignup = response(); const callsBeforeOversizedSignup = calls.length;
await testerSignupHandler(request("POST", { characterName: "테스트B", pin: "1234", profilePhoto: `data:image/png;base64,${"a".repeat(600 * 1024)}` }), oversizedSignup, { env: authEnv, fetchImpl, tokenFactory: () => "never" });
assert.equal(oversizedSignup.statusCode, 413); assert.equal(calls.length, callsBeforeOversizedSignup, "over-limit signup bodies must be rejected before RPC");
assert.deepEqual(calls.find((x) => x.name === "baekji_player_login_v2").body, { p_character_name: "테스트A", p_pin: "0000", p_session_token: "login-token", p_previous_session_token: null });
assert.deepEqual(calls.find((x) => x.name === "baekji_player_signup_v2").body, { p_character_name: "테스트B", p_pin: "1234", p_profile_photo: "data:image/png;base64,AA", p_session_token: "signup-token", p_previous_session_token: null });
assert.deepEqual(calls.filter((x) => x.name === "baekji_player_character_bootstrap_v1").slice(0, 2).map((x) => x.body), [{ p_session_token: "login-token" }, { p_session_token: "signup-token" }], "login and signup bootstrap the authoritative character before returning their cookie");
const rotated = response(); await testerLoginHandler(request("POST", { characterName: "테스트A", pin: "0000" }, { cookie: `${PLAYER_COOKIE_NAME}=old-token` }), rotated, { env: authEnv, fetchImpl, tokenFactory: () => "new-token" }); assert.equal(rotated.statusCode, 200); assert.deepEqual(calls.filter((x) => x.name === "baekji_player_login_v2").at(-1).body, { p_character_name: "테스트A", p_pin: "0000", p_session_token: "new-token", p_previous_session_token: "old-token" });
const rotatedSignup = response(); await testerSignupHandler(request("POST", { characterName: "테스트B", pin: "1234", profilePhoto: "data:image/png;base64,AA" }, { cookie: `${PLAYER_COOKIE_NAME}=old-token` }), rotatedSignup, { env: authEnv, fetchImpl, tokenFactory: () => "new-signup-token" }); assert.equal(rotatedSignup.statusCode, 201); assert.deepEqual(calls.filter((x) => x.name === "baekji_player_signup_v2").at(-1).body, { p_character_name: "테스트B", p_pin: "1234", p_profile_photo: "data:image/png;base64,AA", p_session_token: "new-signup-token", p_previous_session_token: "old-token" });
for (const [handler, body] of [[testerLoginHandler, { characterName: "테스트A", pin: "0000" }], [testerSignupHandler, { characterName: "테스트B", pin: "1234", profilePhoto: "data:image/png;base64,AA" }]]) { const r = response(); const before = calls.length; await handler(request("POST", body, { origin: "https://evil.test" }), r, { env: authEnv, fetchImpl }); assert.equal(r.statusCode, 403); assert.equal(calls.length, before); assert.equal(r.headers["set-cookie"], undefined); }

const abort = new Error("aborted"); abort.name = "AbortError";
await assert.rejects(() => playerAuthRpc(authEnv, "baekji_player_login", {}, async () => { throw abort; }, { timeoutMs: 1 }), (error) => error.code === "AUTH_BACKEND_TIMEOUT" && error.statusCode === 504);
await assert.rejects(() => playerAuthRpc(authEnv, "baekji_player_login", {}, async () => { throw new Error("network down"); }), (error) => error.code === "AUTH_BACKEND_UNAVAILABLE" && error.statusCode === 503);
const timeoutLogin = response(); await testerLoginHandler(request("POST", { characterName: "테스트A", pin: "0000" }), timeoutLogin, { env: authEnv, fetchImpl: async () => { throw abort; }, tokenFactory: () => "never" }); assert.equal(timeoutLogin.statusCode, 504); assert.deepEqual(timeoutLogin.json(), { ok: false, error: "AUTH_BACKEND_TIMEOUT" }); assert.equal(timeoutLogin.headers["set-cookie"], undefined);
const unavailableSignup = response(); await testerSignupHandler(request("POST", { characterName: "테스트B", pin: "1234", profilePhoto: "data:image/png;base64,AA" }), unavailableSignup, { env: authEnv, fetchImpl: async () => { throw new Error("network down"); }, tokenFactory: () => "never" }); assert.equal(unavailableSignup.statusCode, 503); assert.deepEqual(unavailableSignup.json(), { ok: false, error: "AUTH_BACKEND_UNAVAILABLE" }); assert.equal(unavailableSignup.headers["set-cookie"], undefined);
const throttledLogin = response();
await testerLoginHandler(request("POST", { characterName: "테스트A", pin: "0000" }), throttledLogin, {
  env: authEnv,
  fetchImpl: async () => ({ ok: false, status: 400, json: async () => ({ message: "LOGIN_THROTTLED" }) }),
  tokenFactory: () => "never",
});
assert.equal(throttledLogin.statusCode, 429, "server must translate the internal throttle signal to a uniform retry response");
assert.deepEqual(throttledLogin.json(), { ok: false, error: "AUTH_RETRY_LATER" });
assert.equal(throttledLogin.headers["set-cookie"], undefined, "throttling must not disclose or replace an existing session");

for (const [cookie, code, shouldClear] of [["", "PLAYER_SESSION_REQUIRED", false], [`${PLAYER_COOKIE_NAME}=expired`, "PLAYER_SESSION_INVALID", true]]) { const r = response(); await playerSessionHandler(request("GET", null, { cookie }), r, { env: authEnv, fetchImpl }); assert.equal(r.statusCode, 401); assert.equal(r.json().code, code); assert.equal(Boolean(r.headers["set-cookie"]), shouldClear, "only truly invalid sessions clear the display cookie"); }
for (const [failure, status, code] of [[new Error("network down"), 503, "AUTH_BACKEND_UNAVAILABLE"], [abort, 504, "AUTH_BACKEND_TIMEOUT"]]) { const r = response(); await playerSessionHandler(request("GET", null, { cookie: a }), r, { env: authEnv, fetchImpl: async () => { throw failure; } }); assert.equal(r.statusCode, status); assert.equal(r.json().code, code); assert.equal(r.headers["set-cookie"], undefined, "transient verification failures must not clear the session display cache"); }
const session = response(); await playerSessionHandler(request("GET", null, { cookie: a }), session, { env: authEnv, fetchImpl }); assert.deepEqual(session.json(), { ok: true, user: { id: "a", characterName: "테스트A", profilePhoto: "a.png" } });
const logout = response(); await playerSessionHandler(request("DELETE", null, { cookie: a }), logout, { env: authEnv, fetchImpl }); assert.equal(logout.statusCode, 200); assert.match(logout.headers["set-cookie"], /Max-Age=0/); assert.deepEqual(calls.at(-1), { name: "baekji_player_session_revoke_v2", body: { p_session_token: "tokenA" } });

async function denied(handler, method, body, options, code) { const r = response(), before = calls.length; await handler(request(method, body, options), r, { env: authEnv, fetchImpl }); assert.equal(r.statusCode, code === "PLAYER_CHARACTER_FORBIDDEN" ? 403 : 401); assert.equal(r.json().code, code); assert.equal(calls.length, before + (options.cookie ? 1 : 0)); }
await denied(playerAdminSystemHandler, "GET", null, { url: "/api/player-admin-system", cookie: "" }, "PLAYER_SESSION_REQUIRED");
await denied(playerAdminSystemHandler, "GET", null, { url: "/api/player-admin-system?characterId=b", cookie: a }, "PLAYER_CHARACTER_FORBIDDEN");
await denied(playerPresenceHandler, "POST", { characterId: "b", clientId: "spoof" }, { url: "/api/player-presence", cookie: a }, "PLAYER_CHARACTER_FORBIDDEN");
await denied(playerPresenceHandler, "POST", { clientId: "missing" }, { url: "/api/player-presence", cookie: "" }, "PLAYER_SESSION_REQUIRED");
const feed = response(); await playerAdminSystemHandler(request("GET", null, { url: "/api/player-admin-system", cookie: a }), feed, { env: authEnv, fetchImpl }); assert.deepEqual(calls.at(-1), { name: "baekji_player_admin_system_list_v2", body: { p_session_token: "tokenA", p_after_id: 0, p_limit: 60 } }); assert.deepEqual(feed.json().events, [{ id: 7, sender_label: "안내방송", target_kind: "CHARACTER", target_label: "테스트A", message: "확인", created_at: "2026-08-26" }]);
const presence = response(); await playerPresenceHandler(request("POST", { clientId: "tab-a" }, { cookie: a }), presence, { env: authEnv, fetchImpl }); assert.deepEqual(calls.at(-1), { name: "baekji_player_presence_ping_v2", body: { p_session_token: "tokenA", p_client_id: "tab-a" } });
const admin = response(); let adminCalls = 0; await adminSnapshotHandler(request("GET", null, { cookie: b }), admin, { env: {}, fetchImpl: async () => { adminCalls += 1; throw new Error("must not fetch"); } }); assert.equal(admin.statusCode, 401); assert.equal(adminCalls, 0);
const bootstrap = fs.readFileSync(new URL("../player-session-bootstrap.js", import.meta.url), "utf8");
const signupClient = fs.readFileSync(new URL("../tester-signup-complete.js", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const homeRecovery = fs.readFileSync(new URL("../home-navigation-recovery.js", import.meta.url), "utf8");
assert.match(bootstrap, /Object\.freeze\(\{ get: \(\) => identity, refresh \}\)/, "bootstrap must expose no direct session-adoption write seam");
assert.doesNotMatch(bootstrap, /adopt\s*[,}]/, "adopt must remain private to verified refresh");
assert.match(bootstrap, /const generation = \+\+refreshGeneration;/, "overlapping session refreshes must be ordered");
assert.match(bootstrap, /generation === refreshGeneration \? adopt\(payload\.user\) : identity/, "an older successful refresh must not overwrite a newer identity decision");
assert.match(bootstrap, /window\.addEventListener\("baekji-player-session-logged-out", clearIdentity\)/, "successful app logout must clear bootstrap memory through a private event");
assert.match(bootstrap, /CustomEvent\("baekji-player-session-ready", \{ detail: \{ user: null \} \}\)/, "logout clearing must notify dependent identity consumers with null");
assert.match(app, /window\.dispatchEvent\(new Event\("baekji-player-session-logged-out"\)\)/, "only a successfully revoked or already-invalid server session may clear the rendered app identity");
assert.match(app, /\["PLAYER_SESSION_REQUIRED", "PLAYER_SESSION_INVALID"\]\.includes\(payload\?\.code\)/, "logout must converge to the signed-out terminal state when the cookie is already absent or invalid");
assert.match(homeRecovery, /if \(logout\) \{[\s\S]*?return;[\s\S]*?\}/, "navigation recovery must not retain a second client-side logout fallback");
assert.doesNotMatch(homeRecovery, /sessionStorage\.removeItem\(USER_KEY\)/, "navigation recovery must not clear identity on a transient DELETE failure");
assert.match(signupClient, /await session\?\.refresh\?\.\(\)/, "signup completion must verify and adopt the newly issued cookie before home navigation");
console.log("PASS: player sessions rotate/revoke, isolate cookies, derive actor identity, and block cross-character feed/presence access");
