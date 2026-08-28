import { randomBytes } from "node:crypto";

const DEFAULT_SUPABASE_URL = "https://kfgtvifupumjuewwxzmz.supabase.co";
const PLAYER_COOKIE_NAME = "baekji_player_session";
const PLAYER_SESSION_SECONDS = 12 * 60 * 60;
const PLAYER_AUTH_TIMEOUT_MS = 6000;

export function parseCookies(header = "") {
  return String(header || "").split(";").reduce((output, pair) => {
    const index = pair.indexOf("=");
    if (index < 0) return output;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) output[key] = value;
    return output;
  }, {});
}

export function playerSessionTokenFromRequest(request) {
  return String(parseCookies(request?.headers?.cookie || "")[PLAYER_COOKIE_NAME] || "");
}

export function isSameOriginRequest(request) {
  const origin = request?.headers?.origin;
  if (!origin) return true;
  try { return new URL(origin).host === request?.headers?.host; }
  catch { return false; }
}

export function playerSessionCookie(token, { maxAgeSeconds = PLAYER_SESSION_SECONDS } = {}) {
  const maxAge = Math.max(60, Math.min(PLAYER_SESSION_SECONDS, Number(maxAgeSeconds) || PLAYER_SESSION_SECONDS));
  return `${PLAYER_COOKIE_NAME}=${String(token || "")}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function clearPlayerSessionCookie() {
  return `${PLAYER_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export function createPlayerSessionToken() {
  return randomBytes(32).toString("base64url");
}

function config(env) {
  const secretKey = String(env.SUPABASE_SECRET_KEY || "").trim();
  const legacyServiceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  return {
    url: env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
    key: secretKey || legacyServiceRoleKey,
    isLegacyServiceRole: !secretKey && Boolean(legacyServiceRoleKey),
  };
}

function authError(code, statusCode, payload = null) {
  const error = new Error(code);
  error.code = code;
  error.statusCode = statusCode;
  error.payload = payload;
  return error;
}

export async function playerAuthRpc(env, name, body, fetchImpl = globalThis.fetch, { timeoutMs = PLAYER_AUTH_TIMEOUT_MS } = {}) {
  const { url, key, isLegacyServiceRole } = config(env);
  if (!key) throw authError("AUTH_BACKEND_UNAVAILABLE", 503);
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeout = controller ? setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || PLAYER_AUTH_TIMEOUT_MS)) : 0;
  try {
    const response = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: key,
        ...(isLegacyServiceRole ? { Authorization: `Bearer ${key}` } : {}),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller?.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw authError("AUTH_BACKEND_UNAVAILABLE", Number(response.status || 503), payload);
    return payload;
  } catch (error) {
    if (controller?.signal.aborted || error?.name === "AbortError") throw authError("AUTH_BACKEND_TIMEOUT", 504);
    if (error?.code === "AUTH_BACKEND_UNAVAILABLE") throw error;
    throw authError("AUTH_BACKEND_UNAVAILABLE", 503);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function normalizeIdentity(row) {
  const accountId = String(row?.account_id || row?.accountId || "").trim();
  const characterId = String(row?.character_id || row?.characterId || "").trim();
  const sessionId = String(row?.session_id || row?.sessionId || "").trim();
  if (!accountId || !characterId || !sessionId) return null;
  return Object.freeze({
    accountId,
    characterId,
    characterName: String(row?.character_name || row?.characterName || ""),
    profilePhoto: String(row?.profile_photo || row?.profilePhoto || ""),
    sessionId,
    issuedAt: String(row?.issued_at || row?.issuedAt || ""),
    expiresAt: String(row?.expires_at || row?.expiresAt || ""),
  });
}

export async function verifyPlayerSession(request, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const token = playerSessionTokenFromRequest(request);
  if (!token) return { ok: false, code: "PLAYER_SESSION_REQUIRED" };
  try {
    const rows = await playerAuthRpc(env, "baekji_player_session_verify_v2", { p_session_token: token }, fetchImpl);
    const identity = normalizeIdentity(Array.isArray(rows) ? rows[0] : rows);
    return identity ? { ok: true, token, identity } : { ok: false, code: "PLAYER_SESSION_INVALID" };
  } catch (error) {
    if (error?.code === "AUTH_BACKEND_TIMEOUT" || error?.code === "AUTH_BACKEND_UNAVAILABLE") {
      return { ok: false, code: error.code, statusCode: error.statusCode };
    }
    return { ok: false, code: "PLAYER_SESSION_INVALID" };
  }
}

export async function revokePlayerSession(request, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const token = playerSessionTokenFromRequest(request);
  if (!token) return false;
  try {
    await playerAuthRpc(env, "baekji_player_session_revoke_v2", { p_session_token: token }, fetchImpl);
    return true;
  } catch {
    return false;
  }
}

export { PLAYER_COOKIE_NAME, PLAYER_SESSION_SECONDS, PLAYER_AUTH_TIMEOUT_MS };
