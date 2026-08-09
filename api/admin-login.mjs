import { adminSessionCookie } from "./_admin-auth.mjs";

const DEFAULT_SUPABASE_URL = "https://kfgtvifupumjuewwxzmz.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";
const MAX_BODY_BYTES = 4096;

function sendJson(response, status, payload, headers = {}) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  Object.entries(headers).forEach(([key, value]) => response.setHeader(key, value));
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("REQUEST_TOO_LARGE"), { statusCode: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw Object.assign(new Error("INVALID_JSON"), { statusCode: 400 }); }
}

async function rpc(env, name, body, fetchImpl = globalThis.fetch) {
  const url = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY;
  const response = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${name}_${response.status}`);
  return response.json();
}

export async function adminLoginHandler(request, response, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (request.method !== "POST") return sendJson(response, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  try {
    const body = await readBody(request);
    const loginId = String(body?.loginId || "").trim();
    const password = String(body?.password || "");
    if (!loginId || !password) return sendJson(response, 400, { ok: false, code: "ADMIN_CREDENTIALS_REQUIRED" });

    const rows = await rpc(env, "baekji_admin_login", { p_login_id: loginId, p_password: password }, fetchImpl);
    const row = Array.isArray(rows) ? rows[0] || null : null;
    if (!row?.session_token || !row?.login_id) return sendJson(response, 401, { ok: false, code: "ADMIN_LOGIN_FAILED" });

    return sendJson(response, 200, {
      ok: true,
      admin: { id: String(row.login_id), name: String(row.display_name || row.login_id), role: "ADMIN" },
      redirect: "/admin-dashboard.html",
    }, { "Set-Cookie": adminSessionCookie(row.session_token) });
  } catch (error) {
    return sendJson(response, Number(error?.statusCode || 502), { ok: false, code: error?.message === "INVALID_JSON" ? "INVALID_JSON" : "ADMIN_LOGIN_UNAVAILABLE" });
  }
}

export default async function handler(request, response) {
  return adminLoginHandler(request, response);
}
