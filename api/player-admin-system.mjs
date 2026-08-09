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
  if (!response.ok) throw new Error(`${name}_${response.status}`);
  if (response.status === 204) return null;
  return response.json();
}

function queryParams(request) {
  try { return new URL(request.url || "/", "http://localhost").searchParams; }
  catch { return new URLSearchParams(); }
}

export async function playerAdminSystemHandler(request, response, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (request.method !== "GET") return sendJson(response, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  const params = queryParams(request);
  const characterId = String(params.get("characterId") || "").trim().slice(0, 160);
  const after = Math.max(0, Number(params.get("after") || 0) || 0);
  if (!characterId) return sendJson(response, 400, { ok: false, code: "CHARACTER_ID_REQUIRED" });
  try {
    const rows = await rpc(env, "baekji_player_admin_system_list", {
      p_character_id: characterId,
      p_after_id: after,
      p_limit: after ? 100 : 60,
    }, fetchImpl);
    return sendJson(response, 200, {
      ok: true,
      events: Array.isArray(rows) ? rows : [],
      serverTime: Date.now(),
    });
  } catch {
    return sendJson(response, 502, { ok: false, code: "ADMIN_SYSTEM_FEED_UNAVAILABLE" });
  }
}

export default async function handler(request, response) {
  return playerAdminSystemHandler(request, response);
}
