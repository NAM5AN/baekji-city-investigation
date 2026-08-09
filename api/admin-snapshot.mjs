import { verifyAdminRequest } from "./_admin-auth.mjs";

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

async function readWorldState(env, fetchImpl = globalThis.fetch) {
  const url = env.SUPABASE_URL || DEFAULT_SUPABASE_URL;
  const key = env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY;
  const response = await fetchImpl(`${url}/rest/v1/rpc/baekji_mvp_get_state`, {
    method: "POST",
    headers: {
      apikey: key,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ p_state_key: STATE_KEY }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`WORLD_STATE_${response.status}`);
  const payload = await response.json();
  const row = Array.isArray(payload) ? payload[0] || null : payload;
  return row?.state?.version === 3 ? { state: row.state, revision: Number(row.revision || 0) } : { state: null, revision: 0 };
}

export async function adminSnapshotHandler(request, response, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (request.method !== "GET") return sendJson(response, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  const auth = verifyAdminRequest(request, env);
  if (!auth.ok) return sendJson(response, auth.status, { ok: false, code: auth.code });
  try {
    const world = await readWorldState(env, fetchImpl);
    return sendJson(response, 200, {
      ok: true,
      admin: auth.admin,
      revision: world.revision,
      serverTime: Date.now(),
      state: world.state,
    });
  } catch (error) {
    return sendJson(response, 502, { ok: false, code: "WORLD_STATE_UNAVAILABLE", message: String(error?.message || error) });
  }
}

export default async function handler(request, response) {
  return adminSnapshotHandler(request, response);
}

export { readWorldState };
