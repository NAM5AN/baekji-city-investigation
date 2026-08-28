import { isSameOriginRequest, playerAuthRpc, verifyPlayerSession } from "./_player-auth.mjs";

const MAX_BODY_BYTES = 4096;

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
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

function clean(value, maxLength) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, maxLength);
}

function verifiedFailure(response, verified) {
  if (verified.code === "AUTH_BACKEND_TIMEOUT") return sendJson(response, 504, { ok: false, code: "AUTH_BACKEND_TIMEOUT" });
  if (verified.code === "AUTH_BACKEND_UNAVAILABLE") return sendJson(response, 503, { ok: false, code: "AUTH_BACKEND_UNAVAILABLE" });
  return sendJson(response, 401, { ok: false, code: verified.code });
}

export async function playerPresenceHandler(request, response, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (request.method !== "POST") return sendJson(response, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  if (!isSameOriginRequest(request)) return sendJson(response, 403, { ok: false, code: "ORIGIN_FORBIDDEN" });
  try {
    const verified = await verifyPlayerSession(request, { env, fetchImpl });
    if (!verified.ok) return verifiedFailure(response, verified);
    const body = await readBody(request);
    const characterId = clean(body.characterId, 180);
    const clientId = clean(body.clientId, 180);
    if (characterId && characterId !== verified.identity.characterId) return sendJson(response, 403, { ok: false, code: "PLAYER_CHARACTER_FORBIDDEN" });
    await playerAuthRpc(env, "baekji_player_presence_ping_v2", {
      p_session_token: verified.token,
      p_client_id: clientId,
    }, fetchImpl);
    return sendJson(response, 200, { ok: true, at: Date.now() });
  } catch (error) {
    if (error?.code === "AUTH_BACKEND_TIMEOUT") return sendJson(response, 504, { ok: false, code: "AUTH_BACKEND_TIMEOUT" });
    if (error?.code === "AUTH_BACKEND_UNAVAILABLE") return sendJson(response, 503, { ok: false, code: "AUTH_BACKEND_UNAVAILABLE" });
    const status = Number(error?.statusCode || 502);
    return sendJson(response, status >= 400 && status < 600 ? status : 502, { ok: false, code: status === 413 ? "REQUEST_TOO_LARGE" : status === 400 ? "INVALID_JSON" : "PRESENCE_UNAVAILABLE" });
  }
}

export default async function handler(request, response) {
  return playerPresenceHandler(request, response);
}
