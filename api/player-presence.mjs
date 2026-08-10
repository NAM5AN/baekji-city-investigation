import { readWorldState } from "./admin-snapshot.mjs";

const DEFAULT_SUPABASE_URL = "https://kfgtvifupumjuewwxzmz.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";
const MAX_BODY_BYTES = 4096;

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
  return response.json().catch(() => null);
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

export async function playerPresenceHandler(request, response, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (request.method !== "POST") return sendJson(response, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  try {
    const body = await readBody(request);
    const characterId = clean(body.characterId, 180);
    const clientId = clean(body.clientId, 180);
    if (!characterId) return sendJson(response, 400, { ok: false, code: "CHARACTER_ID_REQUIRED" });
    const world = await readWorldState(env, fetchImpl);
    if (!world.state?.characters?.[characterId]) return sendJson(response, 404, { ok: false, code: "CHARACTER_NOT_FOUND" });
    await rpc(env, "baekji_player_presence_ping", { p_character_id: characterId, p_client_id: clientId }, fetchImpl);
    return sendJson(response, 200, { ok: true, at: Date.now() });
  } catch (error) {
    const status = Number(error?.statusCode || 502);
    return sendJson(response, status >= 400 && status < 600 ? status : 502, { ok: false, code: status === 413 ? "REQUEST_TOO_LARGE" : status === 400 ? "INVALID_JSON" : "PRESENCE_UNAVAILABLE" });
  }
}

export default async function handler(request, response) {
  return playerPresenceHandler(request, response);
}
