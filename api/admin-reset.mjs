import { adminSessionTokenFromRequest } from "./_admin-auth.mjs";
import { verifyAdminSession, readWorldState } from "./admin-snapshot.mjs";

const DEFAULT_SUPABASE_URL = "https://kfgtvifupumjuewwxzmz.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";
const STATE_KEY = "day1_world";
const MAX_BODY_BYTES = 4 * 1024;
const DEMO_USER_IDS = ["test_a", "test_b", "test_c"];

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

function cleanText(value, maxLength) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function blankCharacter(userId) {
  return {
    id: userId,
    contamination: 0,
    symptom: "안정",
    inventory: {},
    currentPartyId: null,
    currentSessionId: null,
    onlineAt: null,
  };
}

function makeInitialStateForAdminReset() {
  const characters = {};
  DEMO_USER_IDS.forEach((userId) => { characters[userId] = blankCharacter(userId); });
  return {
    version: 3,
    storyDay: 1,
    loopId: "LOOP-001",
    eventSeq: 0,
    sessionSeq: 0,
    characters,
    parties: {},
    sessions: {},
    itemClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
  };
}

function worldSummary(state) {
  return {
    storyDay: Number(state?.storyDay || 1),
    loopId: String(state?.loopId || ""),
    characterCount: Object.keys(state?.characters || {}).length,
    partyCount: Object.keys(state?.parties || {}).length,
    sessionCount: Object.keys(state?.sessions || {}).length,
    claimedItemCount: Object.values(state?.itemClaimsByVariant || {}).reduce((sum, claims) => sum + Object.keys(claims || {}).length, 0),
  };
}

async function atomicReset(env, token, requestId, world, fetchImpl) {
  const nextState = makeInitialStateForAdminReset();
  const rows = await rpc(env, "baekji_admin_state_apply", {
    p_token: token,
    p_state_key: STATE_KEY,
    p_state: nextState,
    p_expected_revision: world.revision,
    p_request_id: requestId,
    p_action: "WORLD_RESET",
    p_target_kind: "WORLD",
    p_target_id: STATE_KEY,
    p_summary: "조사 사이트 전체 데모 상태를 초기화했습니다.",
    p_before_state: worldSummary(world.state),
    p_after_state: worldSummary(nextState),
    p_metadata: { resetMode: "SAME_AS_PLAYER_DEMO_RESET", preservesAccounts: true },
  }, fetchImpl);
  return { result: Array.isArray(rows) ? rows[0] || null : rows || null, nextState };
}

export async function adminResetHandler(request, response, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (request.method !== "POST") return sendJson(response, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  const token = adminSessionTokenFromRequest(request);
  if (!token) return sendJson(response, 401, { ok: false, code: "ADMIN_SESSION_REQUIRED" });

  try {
    const admin = await verifyAdminSession(env, token, fetchImpl);
    if (!admin) return sendJson(response, 401, { ok: false, code: "ADMIN_SESSION_INVALID" });
    const body = await readBody(request);
    const requestId = cleanText(body.requestId, 120);
    const confirmation = cleanText(body.confirmation, 20);
    if (!requestId) return sendJson(response, 400, { ok: false, code: "ADMIN_REQUEST_ID_REQUIRED" });
    if (confirmation !== "초기화") return sendJson(response, 400, { ok: false, code: "RESET_CONFIRMATION_REQUIRED" });

    let world = await readWorldState(env, fetchImpl);
    if (!world.state) return sendJson(response, 503, { ok: false, code: "WORLD_STATE_UNAVAILABLE" });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { result } = await atomicReset(env, token, requestId, world, fetchImpl);
      if (result?.accepted) {
        return sendJson(response, 200, {
          ok: true,
          admin,
          alreadyApplied: result.already_applied === true,
          revision: Number(result.revision || world.revision),
          auditId: Number(result.audit_id || 0),
          summary: "조사 사이트를 초기 상태로 되돌렸습니다.",
        });
      }
      if (result?.state?.version === 3) {
        world = { state: result.state, revision: Number(result.revision || 0) };
        continue;
      }
      world = await readWorldState(env, fetchImpl);
    }

    return sendJson(response, 409, { ok: false, code: "ADMIN_RESET_CONFLICT" });
  } catch (error) {
    const message = String(error?.message || "ADMIN_RESET_UNAVAILABLE");
    const known = new Set(["REQUEST_TOO_LARGE", "INVALID_JSON", "WORLD_STATE_UNAVAILABLE", "ADMIN_RESET_CONFLICT"]);
    const status = Number(error?.statusCode || (known.has(message) ? 400 : 502));
    return sendJson(response, status >= 400 && status < 600 ? status : 502, { ok: false, code: known.has(message) ? message : "ADMIN_RESET_UNAVAILABLE" });
  }
}

export default async function handler(request, response) {
  return adminResetHandler(request, response);
}

export { makeInitialStateForAdminReset, blankCharacter, worldSummary };
