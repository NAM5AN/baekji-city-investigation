import { adminSessionTokenFromRequest } from "./_admin-auth.mjs";

const DEFAULT_SUPABASE_URL = "https://kfgtvifupumjuewwxzmz.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";
const STATE_KEY = "day1_world";
const MAX_BODY_BYTES = 8192;

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

function values(object) {
  return Object.values(object && typeof object === "object" ? object : {});
}

function unique(items) {
  return [...new Set((Array.isArray(items) ? items : []).map((item) => String(item || "")).filter(Boolean))];
}

function sessionScopeKey(session) {
  if (!session) return "";
  if (session.movement) return `route:${session.movement.fromNode || session.currentNode}:${session.movement.targetNode || ""}`;
  if (session.activeEncounter) return `route:${session.activeEncounter.fromNode || session.currentNode}:${session.activeEncounter.targetNode || ""}`;
  if (session.currentDetailId) return `detail:${session.currentNode}:${session.currentDetailId}`;
  return `node:${session.currentNode || ""}`;
}

function activeSessions(state) {
  return values(state?.sessions).filter((session) => session?.status === "ACTIVE");
}

function zoneMatches(session, targetId) {
  const scope = sessionScopeKey(session);
  if (!targetId) return false;
  if (scope === targetId) return true;
  if (targetId.startsWith("node:")) {
    const nodeId = targetId.slice(5);
    return scope.startsWith(`detail:${nodeId}:`);
  }
  return false;
}

function resolveSystemRecipients(state, targetKind, targetId) {
  const sessions = activeSessions(state);
  let selectedSessions = [];
  let characterIds = [];

  if (targetKind === "ALL") {
    selectedSessions = sessions;
    characterIds = unique(selectedSessions.flatMap((session) => session.memberIds || []));
  } else if (targetKind === "ZONE") {
    selectedSessions = sessions.filter((session) => zoneMatches(session, targetId));
    characterIds = unique(selectedSessions.flatMap((session) => session.memberIds || []));
  } else if (targetKind === "PARTY") {
    const party = state?.parties?.[targetId] || null;
    selectedSessions = sessions.filter((session) => session.partyId === targetId || party?.sessionId === session.id);
    characterIds = unique(selectedSessions.flatMap((session) => session.memberIds || []));
  } else if (targetKind === "CHARACTER") {
    const character = state?.characters?.[targetId] || null;
    const session = character?.currentSessionId ? state?.sessions?.[character.currentSessionId] : sessions.find((candidate) => candidate.memberIds?.includes(targetId));
    if (session?.status === "ACTIVE") selectedSessions = [session];
    if (selectedSessions.length && targetId) characterIds = [targetId];
  }

  return {
    characterIds: unique(characterIds),
    sessionIds: unique(selectedSessions.map((session) => session.id)),
    scopes: selectedSessions.map((session) => ({
      sessionId: String(session.id || ""),
      partyId: String(session.partyId || ""),
      scopeKey: sessionScopeKey(session),
      memberIds: unique(session.memberIds || []),
    })),
  };
}

async function verifyAdmin(env, token, fetchImpl) {
  if (!token) return null;
  const rows = await rpc(env, "baekji_admin_session_verify", { p_token: token }, fetchImpl);
  const row = Array.isArray(rows) ? rows[0] || null : null;
  return row?.login_id ? { id: String(row.login_id), name: String(row.display_name || row.login_id) } : null;
}

async function readWorld(env, fetchImpl) {
  const rows = await rpc(env, "baekji_mvp_get_state", { p_state_key: STATE_KEY }, fetchImpl);
  const row = Array.isArray(rows) ? rows[0] || null : rows || null;
  return row?.state?.version === 3 ? { state: row.state, revision: Number(row.revision || 0) } : { state: null, revision: 0 };
}

function queryNumber(request, name, fallback = 0) {
  try {
    const url = new URL(request.url || "/", "http://localhost");
    return Math.max(0, Number(url.searchParams.get(name) || fallback) || 0);
  } catch { return fallback; }
}

export async function adminCommunicationsHandler(request, response, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const token = adminSessionTokenFromRequest(request);
  if (!token) return sendJson(response, 401, { ok: false, code: "ADMIN_SESSION_REQUIRED" });

  try {
    const admin = await verifyAdmin(env, token, fetchImpl);
    if (!admin) return sendJson(response, 401, { ok: false, code: "ADMIN_SESSION_INVALID" });

    if (request.method === "GET") {
      const afterChat = queryNumber(request, "afterChat", 0);
      const afterSystem = queryNumber(request, "afterSystem", 0);
      const [chatRows, systemRows] = await Promise.all([
        rpc(env, "baekji_admin_chat_list", { p_token: token, p_after_id: afterChat, p_limit: afterChat ? 100 : 80 }, fetchImpl),
        rpc(env, "baekji_admin_system_list", { p_token: token, p_after_id: afterSystem, p_limit: afterSystem ? 100 : 40 }, fetchImpl),
      ]);
      return sendJson(response, 200, {
        ok: true,
        admin,
        chatMessages: Array.isArray(chatRows) ? chatRows : [],
        systemEvents: Array.isArray(systemRows) ? systemRows : [],
        serverTime: Date.now(),
      });
    }

    if (request.method !== "POST") return sendJson(response, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
    const body = await readBody(request);
    const kind = String(body?.kind || "").toLowerCase();

    if (kind === "chat") {
      const message = cleanText(body?.message, 1200);
      if (!message) return sendJson(response, 400, { ok: false, code: "ADMIN_CHAT_MESSAGE_REQUIRED" });
      const rows = await rpc(env, "baekji_admin_chat_send", { p_token: token, p_message: message }, fetchImpl);
      const entry = Array.isArray(rows) ? rows[0] || null : null;
      return sendJson(response, 200, { ok: true, message: entry });
    }

    if (kind === "system") {
      const targetKind = String(body?.targetKind || "").toUpperCase();
      const targetId = cleanText(body?.targetId, 180);
      const targetLabel = cleanText(body?.targetLabel, 240);
      const senderLabel = cleanText(body?.senderLabel, 40) || "SYSTEM";
      const message = cleanText(body?.message, 1600);
      if (!["ALL", "ZONE", "PARTY", "CHARACTER"].includes(targetKind)) return sendJson(response, 400, { ok: false, code: "ADMIN_SYSTEM_TARGET_REQUIRED" });
      if (targetKind !== "ALL" && !targetId) return sendJson(response, 400, { ok: false, code: "ADMIN_SYSTEM_TARGET_REQUIRED" });
      if (!message) return sendJson(response, 400, { ok: false, code: "ADMIN_SYSTEM_MESSAGE_REQUIRED" });

      const world = await readWorld(env, fetchImpl);
      if (!world.state) return sendJson(response, 503, { ok: false, code: "WORLD_STATE_UNAVAILABLE" });
      const recipients = resolveSystemRecipients(world.state, targetKind, targetId);
      if (!recipients.characterIds.length || !recipients.sessionIds.length) {
        return sendJson(response, 409, { ok: false, code: "ADMIN_SYSTEM_NO_RECIPIENTS" });
      }

      const rows = await rpc(env, "baekji_admin_system_send", {
        p_token: token,
        p_target_kind: targetKind,
        p_target_id: targetId || null,
        p_target_label: targetLabel || (targetKind === "ALL" ? "전체 참가자" : targetId),
        p_message: message,
        p_recipient_character_ids: recipients.characterIds,
        p_recipient_session_ids: recipients.sessionIds,
        p_scope_snapshot: { revision: world.revision, scopes: recipients.scopes, senderLabel },
      }, fetchImpl);
      const rawEvent = Array.isArray(rows) ? rows[0] || null : null;
      const event = rawEvent ? { ...rawEvent, sender_label: senderLabel } : rawEvent;
      return sendJson(response, 200, { ok: true, event });
    }

    return sendJson(response, 400, { ok: false, code: "ADMIN_COMMUNICATION_KIND_INVALID" });
  } catch (error) {
    const status = Number(error?.statusCode || 502);
    const code = error?.message === "INVALID_JSON" || error?.message === "REQUEST_TOO_LARGE"
      ? error.message
      : "ADMIN_COMMUNICATION_UNAVAILABLE";
    return sendJson(response, status >= 400 && status < 500 ? status : 502, { ok: false, code });
  }
}

export default async function handler(request, response) {
  return adminCommunicationsHandler(request, response);
}

export { sessionScopeKey, zoneMatches, resolveSystemRecipients, activeSessions };
