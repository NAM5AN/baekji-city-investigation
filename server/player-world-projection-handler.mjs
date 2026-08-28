import { playerAuthRpc, verifyPlayerSession } from "../api/_player-auth.mjs";

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}

function sessionFailure(response, verified) {
  const code = String(verified?.code || "PLAYER_SESSION_INVALID");
  if (code === "AUTH_BACKEND_TIMEOUT") return sendJson(response, 504, { ok: false, code });
  if (code === "AUTH_BACKEND_UNAVAILABLE") return sendJson(response, 503, { ok: false, code });
  return sendJson(response, 401, { ok: false, code });
}

function projectionRow(value) {
  const row = Array.isArray(value) ? value[0] : value;
  const state = row?.state;
  const revision = Number(row?.revision || 0);
  if (!state || state.version !== 3 || !Number.isSafeInteger(revision) || revision < 0) return null;
  return { state, revision };
}

export async function playerWorldProjectionHandler(request, response, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    return sendJson(response, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  }

  const verified = await verifyPlayerSession(request, { env, fetchImpl });
  if (!verified.ok) return sessionFailure(response, verified);

  try {
    const rows = await playerAuthRpc(env, "baekji_player_world_projection_v1", {
      p_session_token: verified.token,
    }, fetchImpl);
    const projection = projectionRow(rows);
    if (!projection) return sendJson(response, 503, { ok: false, code: "PLAYER_WORLD_UNAVAILABLE" });
    return sendJson(response, 200, { ok: true, actorId: verified.identity.characterId, ...projection });
  } catch (error) {
    if (error?.code === "AUTH_BACKEND_TIMEOUT") return sendJson(response, 504, { ok: false, code: "AUTH_BACKEND_TIMEOUT" });
    return sendJson(response, 503, { ok: false, code: "PLAYER_WORLD_UNAVAILABLE" });
  }
}

export { projectionRow };

export default async function handler(request, response) {
  return playerWorldProjectionHandler(request, response);
}
