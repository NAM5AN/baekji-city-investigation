import { playerAuthRpc, verifyPlayerSession } from "./_player-auth.mjs";

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}

function queryParams(request) {
  try { return new URL(request.url || "/", "http://localhost").searchParams; }
  catch { return new URLSearchParams(); }
}

function verifiedFailure(response, verified) {
  if (verified.code === "AUTH_BACKEND_TIMEOUT") return sendJson(response, 504, { ok: false, code: "AUTH_BACKEND_TIMEOUT" });
  if (verified.code === "AUTH_BACKEND_UNAVAILABLE") return sendJson(response, 503, { ok: false, code: "AUTH_BACKEND_UNAVAILABLE" });
  return sendJson(response, 401, { ok: false, code: verified.code });
}

export async function playerAdminSystemHandler(request, response, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (request.method !== "GET") return sendJson(response, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  const verified = await verifyPlayerSession(request, { env, fetchImpl });
  if (!verified.ok) return verifiedFailure(response, verified);
  const params = queryParams(request);
  const characterId = String(params.get("characterId") || "").trim().slice(0, 160);
  const after = Math.max(0, Number(params.get("after") || 0) || 0);
  if (characterId && characterId !== verified.identity.characterId) return sendJson(response, 403, { ok: false, code: "PLAYER_CHARACTER_FORBIDDEN" });
  try {
    const rows = await playerAuthRpc(env, "baekji_player_admin_system_list_v2", {
      p_session_token: verified.token,
      p_after_id: after,
      p_limit: after ? 100 : 60,
    }, fetchImpl);
    return sendJson(response, 200, {
      ok: true,
      events: (Array.isArray(rows) ? rows : []).map((row) => ({
        id: Number(row?.id || 0),
        sender_label: String(row?.sender_label || "SYSTEM"),
        target_kind: String(row?.target_kind || ""),
        target_label: String(row?.target_label || ""),
        message: String(row?.message || ""),
        created_at: String(row?.created_at || ""),
      })).filter((row) => row.id > 0),
      serverTime: Date.now(),
    });
  } catch (error) {
    if (error?.code === "AUTH_BACKEND_TIMEOUT") return sendJson(response, 504, { ok: false, code: "AUTH_BACKEND_TIMEOUT" });
    return sendJson(response, 503, { ok: false, code: "ADMIN_SYSTEM_FEED_UNAVAILABLE" });
  }
}

export default async function handler(request, response) {
  return playerAdminSystemHandler(request, response);
}
