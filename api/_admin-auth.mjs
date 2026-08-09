import crypto from "node:crypto";

const COOKIE_NAME = "baekji_admin_session";
const MAX_SESSION_SECONDS = 12 * 60 * 60;

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function decodeBase64url(value) {
  return Buffer.from(String(value || ""), "base64url").toString("utf8");
}

function signatureFor(payloadPart, secret) {
  return crypto.createHmac("sha256", secret).update(payloadPart).digest("base64url");
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

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

export function signAdminSession(admin, secret, { now = Date.now(), maxAgeSeconds = MAX_SESSION_SECONDS } = {}) {
  if (!secret) throw new Error("ADMIN_SESSION_SECRET_REQUIRED");
  const issuedAt = Math.floor(now / 1000);
  const payload = {
    id: String(admin?.id || ""),
    name: String(admin?.name || admin?.id || "관리자"),
    role: "ADMIN",
    iat: issuedAt,
    exp: issuedAt + Math.max(60, Math.min(MAX_SESSION_SECONDS, Number(maxAgeSeconds) || MAX_SESSION_SECONDS)),
  };
  if (!payload.id) throw new Error("ADMIN_ID_REQUIRED");
  const payloadPart = base64url(JSON.stringify(payload));
  return `${payloadPart}.${signatureFor(payloadPart, secret)}`;
}

export function verifyAdminToken(token, secret, { now = Date.now() } = {}) {
  if (!secret) return { ok: false, status: 503, code: "ADMIN_AUTH_NOT_CONFIGURED" };
  const [payloadPart, signature, extra] = String(token || "").split(".");
  if (!payloadPart || !signature || extra) return { ok: false, status: 401, code: "ADMIN_SESSION_REQUIRED" };
  if (!safeEqual(signature, signatureFor(payloadPart, secret))) return { ok: false, status: 401, code: "ADMIN_SESSION_INVALID" };
  let payload;
  try { payload = JSON.parse(decodeBase64url(payloadPart)); }
  catch { return { ok: false, status: 401, code: "ADMIN_SESSION_INVALID" }; }
  const nowSeconds = Math.floor(now / 1000);
  if (payload?.role !== "ADMIN" || !payload?.id || !Number.isFinite(Number(payload?.exp)) || Number(payload.exp) <= nowSeconds) {
    return { ok: false, status: 401, code: "ADMIN_SESSION_EXPIRED" };
  }
  return {
    ok: true,
    admin: { id: String(payload.id), name: String(payload.name || payload.id), role: "ADMIN" },
    payload,
  };
}

export function verifyAdminRequest(request, env = process.env) {
  const cookies = parseCookies(request?.headers?.cookie || "");
  return verifyAdminToken(cookies[COOKIE_NAME], env.ADMIN_SESSION_SECRET || "");
}

export function adminSessionCookie(token, { maxAgeSeconds = MAX_SESSION_SECONDS } = {}) {
  return `${COOKIE_NAME}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${Math.max(60, Math.min(MAX_SESSION_SECONDS, Number(maxAgeSeconds) || MAX_SESSION_SECONDS))}`;
}

export { COOKIE_NAME };
