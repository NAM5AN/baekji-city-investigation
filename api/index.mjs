import { createAppServer } from "../server.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://kfgtvifupumjuewwxzmz.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";
const LEGACY_LOGIN_ALIASES = new Map([
  ["캐릭터a", "테스트 캐릭터 A"],
  ["캐릭터b", "테스트 캐릭터 B"],
  ["캐릭터c", "테스트 캐릭터 C"],
]);

function normalize(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function loginQueryName(value) {
  const raw = String(value || "").trim();
  return LEGACY_LOGIN_ALIASES.get(normalize(raw)) || raw;
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Length", Buffer.byteLength(body));
  response.end(body);
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 8 * 1024) throw Object.assign(new Error("REQUEST_TOO_LARGE"), { statusCode: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw Object.assign(new Error("INVALID_JSON"), { statusCode: 400 }); }
}

async function handleTesterLogin(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }

  let body;
  try { body = await readJsonBody(request); }
  catch (error) { return sendJson(response, error.statusCode || 400, { ok: false, error: error.message || "INVALID_REQUEST" }); }

  const characterName = loginQueryName(body?.characterName);
  const pin = String(body?.pin || "");
  if (!characterName || characterName.length > 40 || !/^\d{4}$/.test(pin)) {
    return sendJson(response, 401, { ok: false, error: "INVALID_CREDENTIALS" });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const upstream = await globalThis.fetch(`${SUPABASE_URL}/rest/v1/rpc/baekji_tester_login`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ p_character_name: characterName, p_pin: pin }),
      cache: "no-store",
      signal: controller.signal,
    });
    const rows = await upstream.json().catch(() => []);
    if (!upstream.ok) {
      console.error("[tester-login] supabase response", upstream.status);
      return sendJson(response, 503, { ok: false, error: "AUTH_BACKEND_UNAVAILABLE" });
    }
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row?.id) return sendJson(response, 401, { ok: false, error: "INVALID_CREDENTIALS" });
    return sendJson(response, 200, {
      ok: true,
      user: {
        id: String(row.id),
        characterName: String(row.character_name || characterName),
        profilePhoto: String(row.profile_photo || ""),
      },
    });
  } catch (error) {
    if (error?.name === "AbortError") return sendJson(response, 504, { ok: false, error: "AUTH_BACKEND_TIMEOUT" });
    console.error("[tester-login] request failed", error?.message || error);
    return sendJson(response, 503, { ok: false, error: "AUTH_BACKEND_UNAVAILABLE" });
  } finally {
    clearTimeout(timeout);
  }
}

const appServer = createAppServer({
  env: process.env,
  fetchImpl: globalThis.fetch,
});
const requestListener = appServer.listeners("request")[0];

export default async function handler(request, response) {
  const url = new URL(request.url || "/", "http://localhost");
  if (url.pathname === "/api/tester-login" || url.pathname === "/api/tester-login.mjs") {
    return handleTesterLogin(request, response);
  }
  return requestListener(request, response);
}

export const __TESTER_LOGIN_TEST__ = Object.freeze({ normalize, loginQueryName });
