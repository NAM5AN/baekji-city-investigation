import { adminSessionTokenFromRequest } from "./_admin-auth.mjs";
import { verifyAdminSession, readWorldState } from "./admin-snapshot.mjs";

const DEFAULT_SUPABASE_URL = "https://kfgtvifupumjuewwxzmz.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";
const STATE_KEY = "day1_world";
const MAX_BODY_BYTES = 12 * 1024;
const STUCK_MOVEMENT_MS = 10_000;

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

function clean(value, maxLength = 180) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function patchEnvelope(state, requestId, data) {
  return {
    seq: Math.max(0, Number(state.adminControlSeq || 0)) + 1,
    requestId,
    at: Date.now(),
    action: "SESSION_CONTROL",
    targetKind: "SESSION",
    targetId: data.sessionId,
    data: data.patchData,
  };
}

function attachPatch(state, patch) {
  state.adminControlSeq = patch.seq;
  const history = Array.isArray(state.adminControlPatches) ? state.adminControlPatches : [];
  state.adminControlPatches = [...history, patch]
    .filter((entry, index, array) => array.findIndex((candidate) => Number(candidate?.seq || 0) === Number(entry?.seq || 0)) === index)
    .sort((a, b) => Number(a?.seq || 0) - Number(b?.seq || 0))
    .slice(-1000);
}

function sessionBefore(session) {
  return {
    status: String(session.status || ""),
    currentNode: String(session.currentNode || ""),
    currentDetailId: session.currentDetailId || null,
    movement: session.movement || null,
    activeEncounter: session.activeEncounter || null,
    endedAt: session.endedAt || null,
  };
}

function applySessionOperation(sourceState, body, requestId, now = Date.now()) {
  const state = clone(sourceState);
  if (!state || state.version !== 3 || !state.sessions || typeof state.sessions !== "object") {
    throw Object.assign(new Error("WORLD_STATE_UNAVAILABLE"), { statusCode: 503 });
  }
  const operation = clean(body.operation, 40).toUpperCase();
  const sessionId = clean(body.sessionId, 180);
  const session = state.sessions?.[sessionId];
  if (!session) throw Object.assign(new Error("ADMIN_TARGET_SESSION_NOT_FOUND"), { statusCode: 404 });
  const before = sessionBefore(session);
  let summary = "";
  let patchData = {};
  let metadata = {};

  if (operation === "SESSION_PAUSE") {
    if (session.status !== "ACTIVE") throw Object.assign(new Error("SESSION_NOT_ACTIVE"), { statusCode: 409 });
    if (session.movement) throw Object.assign(new Error("SESSION_MOVEMENT_MUST_RECOVER_FIRST"), { statusCode: 409 });
    session.status = "PAUSED";
    session.endedAt = null;
    patchData = { status: "PAUSED" };
    summary = `조사 세션 ${sessionId}을 일시정지했습니다.`;
  } else if (operation === "SESSION_RESUME") {
    if (session.status !== "PAUSED") throw Object.assign(new Error("SESSION_NOT_PAUSED"), { statusCode: 409 });
    session.status = "ACTIVE";
    session.endedAt = null;
    patchData = { status: "ACTIVE" };
    summary = `조사 세션 ${sessionId}을 재개했습니다.`;
  } else if (operation === "SESSION_FORCE_END") {
    if (session.status === "COMPLETED") throw Object.assign(new Error("SESSION_ALREADY_COMPLETED"), { statusCode: 409 });
    session.status = "COMPLETED";
    session.endedAt = now;
    session.movement = null;
    session.activeEncounter = null;
    session.choiceReveal = null;
    patchData = { status: "COMPLETED", clearTransient: true };
    summary = `조사 세션 ${sessionId}을 강제 종료했습니다.`;
  } else if (operation === "SESSION_RECOVER") {
    const resetField = body.resetField === true;
    const hadTransient = Boolean(session.movement || session.activeEncounter || (resetField && session.currentDetailId));
    if (!hadTransient) throw Object.assign(new Error("SESSION_NOTHING_TO_RECOVER"), { statusCode: 409 });
    session.movement = null;
    session.activeEncounter = null;
    session.choiceReveal = { type: "persistent-menu", at: now };
    patchData = { clearTransient: true };
    if (resetField) {
      session.currentDetailId = null;
      patchData.nodeId = String(session.currentNode || "");
    }
    metadata = { resetField };
    summary = resetField
      ? `조사 세션 ${sessionId}을 현재 구역 기본 화면으로 복구했습니다.`
      : `조사 세션 ${sessionId}의 이동·돌발상황 상태를 복구했습니다.`;
  } else {
    throw Object.assign(new Error("ADMIN_SESSION_OPERATION_INVALID"), { statusCode: 400 });
  }

  const patch = patchEnvelope(state, requestId, { sessionId, patchData });
  attachPatch(state, patch);
  return {
    state,
    patch,
    action: operation,
    targetKind: "SESSION",
    targetId: sessionId,
    before,
    after: sessionBefore(session),
    summary,
    metadata: { ...metadata, partyId: String(session.partyId || ""), adminControlSeq: patch.seq },
  };
}

function diagnosticIssues(state, session, now = Date.now()) {
  const issues = [];
  const party = state.parties?.[session.partyId] || null;
  const memberIds = Array.isArray(session.memberIds) ? session.memberIds : [];
  if (!party) issues.push({ code: "PARTY_MISSING", level: "critical", text: "연결된 조사조 정보가 없습니다." });
  if (!memberIds.length) issues.push({ code: "SESSION_EMPTY", level: "critical", text: "세션에 조원이 없습니다." });
  memberIds.forEach((id) => {
    const character = state.characters?.[id];
    if (!character) issues.push({ code: "CHARACTER_MISSING", level: "critical", text: `조원 ${id}의 캐릭터 상태가 없습니다.` });
    else if (character.currentSessionId && character.currentSessionId !== session.id) issues.push({ code: "MEMBER_SESSION_MISMATCH", level: "warning", text: `조원 ${id}의 현재 세션 연결이 다릅니다.` });
  });
  if (session.status === "COMPLETED" && (session.movement || session.activeEncounter)) {
    issues.push({ code: "COMPLETED_WITH_TRANSIENT", level: "critical", text: "종료된 세션에 이동/돌발상황 상태가 남아 있습니다." });
  }
  const resolveAt = Number(session.movement?.resolveAt || 0);
  if (session.movement && resolveAt > 0 && now - resolveAt > STUCK_MOVEMENT_MS) {
    issues.push({ code: "STUCK_MOVEMENT", level: "critical", text: "이동 완료 시간이 지났지만 이동 상태가 남아 있습니다." });
  }
  if (session.status === "PAUSED") issues.push({ code: "ADMIN_PAUSED", level: "info", text: "관리자에 의해 일시정지된 세션입니다." });
  const hazards = session.activeEncounter?.hazards;
  const currentIndex = Number(session.activeEncounter?.currentIndex || 0);
  if (session.activeEncounter && (!Array.isArray(hazards) || !hazards.length || currentIndex < 0 || currentIndex >= hazards.length)) {
    issues.push({ code: "HAZARD_STATE_INVALID", level: "warning", text: "돌발상황 진행 인덱스가 비정상입니다." });
  }
  return issues;
}

function buildDiagnostics(state, presenceRows, now = Date.now()) {
  const presence = new Map((Array.isArray(presenceRows) ? presenceRows : []).map((row) => [String(row.character_id), row.last_seen_at]));
  return Object.values(state.sessions || {}).map((session) => ({
    id: String(session.id || ""),
    partyId: String(session.partyId || ""),
    status: String(session.status || ""),
    variant: String(session.variant || ""),
    currentNode: String(session.currentNode || ""),
    currentDetailId: session.currentDetailId || null,
    movement: session.movement || null,
    activeEncounter: session.activeEncounter || null,
    memberIds: Array.isArray(session.memberIds) ? session.memberIds : [],
    issues: diagnosticIssues(state, session, now),
    presence: (Array.isArray(session.memberIds) ? session.memberIds : []).map((characterId) => ({
      characterId,
      lastSeenAt: presence.get(String(characterId)) || null,
    })),
  }));
}

async function applyAtomic(env, token, world, mutation, requestId, fetchImpl) {
  const rows = await rpc(env, "baekji_admin_state_apply", {
    p_token: token,
    p_state_key: STATE_KEY,
    p_state: mutation.state,
    p_expected_revision: world.revision,
    p_request_id: requestId,
    p_action: mutation.action,
    p_target_kind: mutation.targetKind,
    p_target_id: mutation.targetId,
    p_summary: mutation.summary,
    p_before_state: mutation.before,
    p_after_state: mutation.after,
    p_metadata: mutation.metadata,
  }, fetchImpl);
  return Array.isArray(rows) ? rows[0] || null : rows || null;
}

async function readPresence(env, token, fetchImpl) {
  const rows = await rpc(env, "baekji_admin_presence_list", { p_token: token }, fetchImpl);
  return Array.isArray(rows) ? rows : [];
}

export async function adminSessionOpsHandler(request, response, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const token = adminSessionTokenFromRequest(request);
  if (!token) return sendJson(response, 401, { ok: false, code: "ADMIN_SESSION_REQUIRED" });
  try {
    const admin = await verifyAdminSession(env, token, fetchImpl);
    if (!admin) return sendJson(response, 401, { ok: false, code: "ADMIN_SESSION_INVALID" });

    if (request.method === "GET") {
      const [world, presence] = await Promise.all([readWorldState(env, fetchImpl), readPresence(env, token, fetchImpl)]);
      if (!world.state) return sendJson(response, 503, { ok: false, code: "WORLD_STATE_UNAVAILABLE" });
      return sendJson(response, 200, {
        ok: true,
        admin,
        revision: world.revision,
        serverTime: Date.now(),
        sessions: buildDiagnostics(world.state, presence),
      });
    }

    if (request.method !== "POST") return sendJson(response, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
    const body = await readBody(request);
    const requestId = clean(body.requestId, 120);
    if (!requestId) return sendJson(response, 400, { ok: false, code: "ADMIN_REQUEST_ID_REQUIRED" });
    let world = await readWorldState(env, fetchImpl);
    if (!world.state) return sendJson(response, 503, { ok: false, code: "WORLD_STATE_UNAVAILABLE" });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const mutation = applySessionOperation(world.state, body, requestId);
      const result = await applyAtomic(env, token, world, mutation, requestId, fetchImpl);
      if (result?.accepted) {
        return sendJson(response, 200, {
          ok: true,
          admin,
          revision: Number(result.revision || world.revision),
          auditId: Number(result.audit_id || 0),
          summary: mutation.summary,
          operation: mutation.action,
        });
      }
      if (result?.state?.version === 3) {
        world = { state: result.state, revision: Number(result.revision || 0) };
        continue;
      }
      world = await readWorldState(env, fetchImpl);
    }
    return sendJson(response, 409, { ok: false, code: "ADMIN_CONTROL_CONFLICT" });
  } catch (error) {
    const message = String(error?.message || "ADMIN_SESSION_OPS_UNAVAILABLE");
    const known = new Set([
      "REQUEST_TOO_LARGE", "INVALID_JSON", "WORLD_STATE_UNAVAILABLE", "ADMIN_TARGET_SESSION_NOT_FOUND",
      "SESSION_NOT_ACTIVE", "SESSION_MOVEMENT_MUST_RECOVER_FIRST", "SESSION_NOT_PAUSED", "SESSION_ALREADY_COMPLETED",
      "SESSION_NOTHING_TO_RECOVER", "ADMIN_SESSION_OPERATION_INVALID",
    ]);
    const status = Number(error?.statusCode || (known.has(message) ? 400 : 502));
    return sendJson(response, status >= 400 && status < 600 ? status : 502, { ok: false, code: known.has(message) ? message : "ADMIN_SESSION_OPS_UNAVAILABLE" });
  }
}

export default async function handler(request, response) {
  return adminSessionOpsHandler(request, response);
}

export { applySessionOperation, diagnosticIssues, buildDiagnostics };
