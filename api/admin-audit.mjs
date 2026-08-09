import { adminSessionTokenFromRequest } from "./_admin-auth.mjs";

const DEFAULT_SUPABASE_URL = "https://kfgtvifupumjuewwxzmz.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}

function config(env) {
  return {
    url: env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
    key: env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY,
  };
}

async function rpc(env, name, body, fetchImpl = globalThis.fetch) {
  const { url, key } = config(env);
  const response = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw Object.assign(new Error(`${name}_${response.status}`), { statusCode: response.status, detail });
  }
  if (response.status === 204) return null;
  return response.json();
}

function queryNumber(request, name, fallback = 0) {
  try {
    const url = new URL(request.url || "/", "http://localhost");
    return Math.max(0, Number(url.searchParams.get(name) || fallback) || 0);
  } catch {
    return fallback;
  }
}

export async function adminAuditHandler(request, response, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (request.method !== "GET") return sendJson(response, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  const token = adminSessionTokenFromRequest(request);
  if (!token) return sendJson(response, 401, { ok: false, code: "ADMIN_SESSION_REQUIRED" });

  try {
    const after = queryNumber(request, "after", 0);
    const limit = Math.max(1, Math.min(200, queryNumber(request, "limit", 120) || 120));
    const rows = await rpc(env, "baekji_admin_audit_list", { p_token: token, p_after_id: after, p_limit: limit }, fetchImpl);
    return sendJson(response, 200, {
      ok: true,
      entries: Array.isArray(rows) ? rows : [],
      serverTime: Date.now(),
    });
  } catch (error) {
    const detail = String(error?.detail || "");
    if (/ADMIN_SESSION_INVALID|ADMIN_SESSION_REQUIRED/.test(detail)) return sendJson(response, 401, { ok: false, code: "ADMIN_SESSION_INVALID" });
    return sendJson(response, 502, { ok: false, code: "ADMIN_AUDIT_UNAVAILABLE" });
  }
}

export default async function handler(request, response) {
  return adminAuditHandler(request, response);
}
