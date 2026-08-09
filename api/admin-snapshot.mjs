import { adminSessionTokenFromRequest } from "./_admin-auth.mjs";

const DEFAULT_SUPABASE_URL = "https://kfgtvifupumjuewwxzmz.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";
const STATE_KEY = "day1_world";

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}

function supabaseConfig(env) {
  return {
    url: env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
    key: env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY,
  };
}

async function rpc(env, name, body, fetchImpl = globalThis.fetch) {
  const { url, key } = supabaseConfig(env);
  const response = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`${name}_${response.status}`);
  return response.json();
}

async function verifyAdminSession(env, token, fetchImpl = globalThis.fetch) {
  if (!token) return null;
  const rows = await rpc(env, "baekji_admin_session_check", { p_session_token: token }, fetchImpl);
  const row = Array.isArray(rows) ? rows[0] || null : null;
  if (!row?.login_id) return null;
  return { id: String(row.login_id), name: String(row.display_name || row.login_id), role: "ADMIN" };
}

async function readWorldState(env, fetchImpl = globalThis.fetch) {
  const payload = await rpc(env, "baekji_mvp_get_state", { p_state_key: STATE_KEY }, fetchImpl);
  const row = Array.isArray(payload) ? payload[0] || null : payload;
  return row?.state?.version === 3 ? { state: row.state, revision: Number(row.revision || 0) } : { state: null, revision: 0 };
}

async function readCharacterDirectory(env, fetchImpl = globalThis.fetch) {
  try {
    const rows = await rpc(env, "baekji_tester_list_accounts", {}, fetchImpl);
    return (Array.isArray(rows) ? rows : []).map((row) => ({
      id: String(row?.id || ""),
      name: String(row?.character_name || row?.id || ""),
      profilePhoto: String(row?.profile_photo || ""),
    })).filter((row) => row.id);
  } catch {
    return [];
  }
}

export async function adminSnapshotHandler(request, response, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (request.method !== "GET") return sendJson(response, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  const token = adminSessionTokenFromRequest(request);
  if (!token) return sendJson(response, 401, { ok: false, code: "ADMIN_SESSION_REQUIRED" });
  try {
    const admin = await verifyAdminSession(env, token, fetchImpl);
    if (!admin) return sendJson(response, 401, { ok: false, code: "ADMIN_SESSION_INVALID" });
    const [world, directory] = await Promise.all([
      readWorldState(env, fetchImpl),
      readCharacterDirectory(env, fetchImpl),
    ]);
    return sendJson(response, 200, {
      ok: true,
      admin,
      revision: world.revision,
      serverTime: Date.now(),
      state: world.state,
      directory,
    });
  } catch (error) {
    return sendJson(response, 502, { ok: false, code: "WORLD_STATE_UNAVAILABLE", message: String(error?.message || error) });
  }
}

export default async function handler(request, response) {
  return adminSnapshotHandler(request, response);
}

export { verifyAdminSession, readWorldState, readCharacterDirectory };
