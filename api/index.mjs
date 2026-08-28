import { createAppServer } from "../server.mjs";
import playerWorldCommandCatalog from "../player-world-command-catalog.js";
import { reducePlayerWorldCommand } from "../server/player-world-command-engine.mjs";
import { derivePlayerWorldEffects } from "../lib/player-world-derived-effects.mjs";
import DAY1_DATA from "../data/day1.json" with { type: "json" };
import { generateObservation } from "./narrate-observation.mjs";
import { playerWorldProjectionHandler } from "../server/player-world-projection-handler.mjs";
import { resolveFlexibleHazardDecision } from "./resolve-hazard-flex.mjs";
import {
  clearPlayerSessionCookie,
  createPlayerSessionToken,
  isSameOriginRequest,
  playerAuthRpc,
  playerSessionCookie,
  playerSessionTokenFromRequest,
  revokePlayerSession,
  verifyPlayerSession,
} from "./_player-auth.mjs";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://kfgtvifupumjuewwxzmz.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";
const DEFAULT_MODEL = "gpt-5.6-sol";
const LEGACY_LOGIN_ALIASES = new Map([
  ["캐릭터a", "테스트 캐릭터 A"],
  ["캐릭터b", "테스트 캐릭터 B"],
  ["캐릭터c", "테스트 캐릭터 C"],
]);

const CHARACTER_INTERACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["outcome", "targetEffect", "narration"],
  properties: {
    outcome: { type: "string", enum: ["EFFECTIVE", "PARTIAL", "RESISTED", "NEUTRAL"] },
    targetEffect: { type: "string", enum: ["NONE", "CONTACT", "MOVED", "STAGGERED", "FELL", "RESISTED", "SUPPORTED", "BLOCKED", "REACTED", "OTHER"] },
    narration: { type: "string" },
  },
};

const CHARACTER_INTERACTION_PROMPT = `너는 한국어 호러 조사 RPG의 인물 상호작용 판정자다.
사용자가 같은 현장에 실제로 존재하는 다른 캐릭터에게 선언한 한 가지 행동의 즉각적인 결과를 판단한다.

반드시 다음 원칙을 지켜라.
1. 밀기, 당기기, 붙잡기, 때리기, 발로 차기, 앞을 막기, 부축하기, 손을 잡기, 안기, 토닥이기, 손짓하기, 물건을 보여주기, 비웃기, 조롱하기 등 인물 사이의 다양한 물리적·사회적 상호작용을 상황에 맞게 판단한다.
2. actor가 실제로 한 행동과 그 행동 때문에 객관적으로 발생한 직접 결과만 서술한다.
3. target 캐릭터의 성격, 의사, 감정, 생각, 인지 여부를 추정하거나 대신 결정하지 않는다.
4. target의 표정, 시선, 대사, 놀람, 분노, 웃음, 고개 움직임, 회피, 버팀, 저항, 반격, 협조 등 자발적인 반응은 절대 생성하지 않는다. context에 target의 해당 행동이 이미 명시된 경우에만 인용할 수 있다.
5. actor의 물리력 때문에 피할 수 없이 생긴 객관적인 결과(접촉, 몸이 밀림, 넘어짐 등)는 서술할 수 있지만, 그 뒤 target이 무엇을 느끼거나 어떻게 대응하는지는 쓰지 않는다.
6. 사용자가 명시하지 않은 심각한 부상, 골절, 출혈, 기절, 사망, 새 소지품, 위치 이동, 오염 수치 변화는 창작하지 않는다.
7. target의 대사를 임의로 만들지 않는다. actor의 행동에 실제 발화가 포함된 경우에만 그 발화를 그대로 활용할 수 있다.
8. activeHazard가 있더라도 이 API는 인물 상호작용 자체만 판정한다. 이동 경로의 위험을 해결하거나 조사조 진행도를 임의로 전진시키지 않는다.
9. outcome은 EFFECTIVE, PARTIAL, RESISTED, NEUTRAL 중 하나다. targetEffect는 가장 가까운 객관적 즉각 결과 하나만 고른다. 사회적 행동처럼 target의 자발적 반응을 정해야만 효과를 만들 수 있다면 NONE을 사용한다.
10. narration은 1~3개의 자연스러운 한국어 문장으로 작성한다. 첫 문장부터 actor.name과 target.name을 실제 이름 그대로 써서 actor의 행동을 실행한다. 이후 문장은 직접적인 객관적 결과만 쓴다. 예: "테스트B는 테스트C를 향해 노골적으로 비웃는다. 분명한 조롱이다." target이 그것을 알아차렸는지, 어떤 표정을 지었는지, 무엇을 말하거나 바라봤는지는 쓰지 않는다.
11. "판정", "성공", "실패", "시도", "가능", "불가능", "AI", "시스템" 같은 운영 문구를 쓰지 않는다.
12. 캐릭터 이름 뒤의 한국어 조사는 받침에 맞게 자연스럽게 쓴다. 특히 을/를, 이/가, 은/는, 과/와, 으로/로를 틀리지 않는다.
13. context에 없는 새 인물이나 장소 반응을 창작하지 않는다.`;

function normalize(value) {
  return String(value || "").replace(/\s+/g, "").toLowerCase();
}

function loginQueryName(value) {
  const raw = String(value || "").trim();
  return LEGACY_LOGIN_ALIASES.get(normalize(raw)) || raw;
}

function compactText(value, maxLength = 500) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function sendJson(response, status, payload, headers = {}) {
  const body = JSON.stringify(payload);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Length", Buffer.byteLength(body));
  Object.entries(headers).forEach(([key, value]) => response.setHeader(key, value));
  response.end(body);
}

async function readJsonBody(request, maxBytes = 16 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error("REQUEST_TOO_LARGE"), { statusCode: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw Object.assign(new Error("INVALID_JSON"), { statusCode: 400 }); }
}

function extractOutputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

function cleanCharacterInteraction(body) {
  const actor = body?.actor && typeof body.actor === "object" ? body.actor : {};
  const target = body?.target && typeof body.target === "object" ? body.target : {};
  const status = (value) => ({
    contamination: Math.max(0, Math.min(100, Number(value?.contamination) || 0)),
    symptom: compactText(value?.symptom, 100),
  });
  return {
    action: compactText(body?.action, 700),
    actor: { id: compactText(actor.id, 80), name: compactText(actor.name, 120) },
    target: { id: compactText(target.id, 80), name: compactText(target.name, 120) },
    sameParty: body?.sameParty === true,
    location: compactText(body?.location, 160),
    detail: compactText(body?.detail, 160),
    situation: compactText(body?.situation, 700),
    activeHazard: compactText(body?.activeHazard, 700),
    actorStatus: status(body?.actorStatus),
    targetStatus: status(body?.targetStatus),
    recentSystem: Array.isArray(body?.recentSystem)
      ? body.recentSystem.slice(-6).map((entry) => compactText(entry, 420)).filter(Boolean)
      : [],
  };
}

function stripTargetAgencyNarration(value, targetName) {
  const text = compactText(value, 1200);
  const target = compactText(targetName, 120);
  if (!text || !target) return text;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const targetSubject = new RegExp(`(?:${escaped}|상대(?:\s*캐릭터)?)(?:은|는|이|가|도)`);
  const voluntaryReaction = /(알아차리|눈치채|바라보|쳐다보|시선|표정|굳히|미소|웃(?:고|는다|으며)|울|당황|놀라|화내|분노|대답|말하|외치|소리치|고개를|끄덕|젓|움츠리|피하|회피|버티|저항|반격|협조|따라오|따라가|돌아서|다가오|다가가|반응)/;
  const sentences = text.match(/[^.!?。！？]+[.!?。！？]?/g) || [text];
  return sentences.filter((sentence) => !(targetSubject.test(sentence) && voluntaryReaction.test(sentence))).join(" ").replace(/\s+/g, " ").trim();
}

function validateCharacterInteraction(value, actorName = "", targetName = "") {
  const outcomes = new Set(["EFFECTIVE", "PARTIAL", "RESISTED", "NEUTRAL"]);
  const effects = new Set(["NONE", "CONTACT", "MOVED", "STAGGERED", "FELL", "RESISTED", "SUPPORTED", "BLOCKED", "REACTED", "OTHER"]);
  const rawNarration = compactText(value?.narration, 1200);
  const narration = stripTargetAgencyNarration(rawNarration, targetName);
  if (!narration) throw Object.assign(new Error("AI_EMPTY_RESULT"), { statusCode: 502 });
  return {
    outcome: outcomes.has(value?.outcome) ? value.outcome : "NEUTRAL",
    targetEffect: effects.has(value?.targetEffect) ? value.targetEffect : "OTHER",
    narration,
  };
}

function playerUser(row, fallbackName = "") {
  const id = String(row?.id || "").trim();
  if (!id) return null;
  return {
    id,
    characterName: String(row?.character_name || row?.characterName || fallbackName),
    profilePhoto: String(row?.profile_photo || row?.profilePhoto || ""),
  };
}

function authErrorCode(error, fallback) {
  const message = String(error?.payload?.message || error?.payload?.error || error?.message || "");
  const safeSignupCodes = new Set([
    "CHARACTER_NAME_TAKEN",
    "INVALID_CHARACTER_NAME",
    "INVALID_PIN",
    "INVALID_PROFILE_PHOTO",
    "PROFILE_PHOTO_TOO_LARGE",
    "SIGNUP_LIMIT_REACHED",
  ]);
  return safeSignupCodes.has(message) ? message : fallback;
}

function authFailure(response, error, fallback = "AUTH_BACKEND_UNAVAILABLE") {
  if (error?.code === "AUTH_BACKEND_TIMEOUT") return sendJson(response, 504, { ok: false, error: "AUTH_BACKEND_TIMEOUT" });
  return sendJson(response, 503, { ok: false, error: fallback });
}

function isLoginThrottled(error) {
  return String(error?.payload?.message || error?.payload?.error || "") === "LOGIN_THROTTLED";
}

function sessionUser(identity) {
  return {
    id: identity.characterId,
    characterName: identity.characterName,
    profilePhoto: identity.profilePhoto,
  };
}

function sessionVerificationFailure(response, verified) {
  if (verified.code === "AUTH_BACKEND_TIMEOUT") return sendJson(response, 504, { ok: false, code: "AUTH_BACKEND_TIMEOUT" });
  if (verified.code === "AUTH_BACKEND_UNAVAILABLE") return sendJson(response, 503, { ok: false, code: "AUTH_BACKEND_UNAVAILABLE" });
  const headers = verified.code === "PLAYER_SESSION_INVALID" ? { "Set-Cookie": clearPlayerSessionCookie() } : {};
  return sendJson(response, 401, { ok: false, code: verified.code }, headers);
}

async function bootstrapPlayerCharacter(env, token, fetchImpl) {
  const rows = await playerAuthRpc(env, "baekji_player_character_bootstrap_v1", { p_session_token: token }, fetchImpl);
  const row = Array.isArray(rows) ? rows[0] : rows;
  const revision = Number(row?.revision);
  if (!Number.isSafeInteger(revision) || revision < 0 || typeof row?.created !== "boolean") throw new Error("PLAYER_BOOTSTRAP_UNAVAILABLE");
}

const WORLD_COMMAND_KEYS = new Set(["commandId", "expectedRevision", "command", "payload"]);
const UUID_V4_OR_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validWorldCommandBody(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  if (Object.keys(value).length !== WORLD_COMMAND_KEYS.size || Object.keys(value).some((key) => !WORLD_COMMAND_KEYS.has(key))) return false;
  if (!UUID_V4_OR_V7.test(String(value.commandId || ""))) return false;
  if (!Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 0) return false;
  if (!value.payload || typeof value.payload !== "object" || Array.isArray(value.payload)) return false;
  return playerWorldCommandCatalog.validatePayload(value.command, value.payload);
}

function safeWorldCommandResult(row) {
  const status = String(row?.status || "");
  const revision = Number(row?.revision);
  const commandId = String(row?.command_id || row?.commandId || "");
  if (!new Set(["APPLIED", "NOOP", "REPLAY", "REVISION_CONFLICT", "OUT_OF_SCOPE", "COMMAND_ID_REUSED"]).has(status) || !Number.isSafeInteger(revision) || revision < 0 || !UUID_V4_OR_V7.test(commandId)) return null;
  return { ok: true, status, revision, commandId };
}

function safeWorldCommandSource(row, actorId) {
  const source = Array.isArray(row) ? row[0] : row;
  const revision = Number(source?.revision);
  const state = source?.world_state ?? source?.worldState;
  const names = source?.character_names ?? source?.characterNames ?? {};
  const sourceActorId = String(source?.actor_character_id || source?.actorCharacterId || "");
  if (!Number.isSafeInteger(revision) || revision < 0 || sourceActorId !== actorId || !state || typeof state !== "object" || Array.isArray(state) || Number(state.version) !== 3) return null;
  return { revision, state, names: names && typeof names === "object" && !Array.isArray(names) ? names : {} };
}

function canonicalScope(session) {
  if (session?.movement) return `route:${session.movement.fromNode}:${session.movement.targetNode}`;
  if (session?.activeEncounter) return `route:${session.activeEncounter.fromNode}:${session.activeEncounter.targetNode}`;
  if (session?.currentDetailId) return `detail:${session.currentNode}:${session.currentDetailId}`;
  return `node:${session?.currentNode || ""}`;
}

function characterName(source, id) {
  return compactText(source.names?.[id] || source.state?.characters?.[id]?.name || id, 120);
}

function canonicalInteractionContext(source, actorId, payload) {
  const state = source.state;
  const actor = state.characters?.[actorId] || {};
  const target = state.characters?.[payload.targetId] || {};
  const session = state.sessions?.[payload.sessionId];
  const targetSession = state.sessions?.[target.currentSessionId];
  if (!session || !targetSession || !session.memberIds?.includes(actorId) || payload.targetId === actorId
    || targetSession.status !== "ACTIVE" || session.status !== "ACTIVE" || session.variant !== targetSession.variant || canonicalScope(session) !== canonicalScope(targetSession)) return null;
  return {
    action: payload.actionText,
    actor: { id: actorId, name: characterName(source, actorId) },
    target: { id: payload.targetId, name: characterName(source, payload.targetId) },
    sameParty: session.id === targetSession.id,
    location: compactText(DAY1_DATA.places?.[session.currentNode]?.name || session.currentNode, 160),
    detail: compactText(session.currentDetailId || "", 160),
    situation: compactText(session.activeEncounter?.overview || "", 700),
    activeHazard: compactText(session.activeEncounter?.hazards?.[session.activeEncounter.currentIndex] || "", 700),
    actorStatus: { contamination: Number(actor.contamination) || 0, symptom: compactText(actor.symptom, 100) },
    targetStatus: { contamination: Number(target.contamination) || 0, symptom: compactText(target.symptom, 100) },
    recentSystem: (session.logs || []).filter((entry) => entry && !entry.actorId).slice(-6).map((entry) => compactText(entry.text, 420)).filter(Boolean),
  };
}

function canonicalHazardContext(source, actorId, payload) {
  const state = source.state;
  const actor = state.characters?.[actorId] || {};
  const session = state.sessions?.[payload.sessionId];
  const encounter = session?.activeEncounter;
  if (!session || !encounter || !session.memberIds?.includes(actorId) || session.status !== "ACTIVE"
    || session.lastMovementTransition?.kind !== "ENCOUNTER" || session.lastMovementTransition?.token !== payload.movementToken
    || encounter.currentIndex !== payload.hazardIndex || encounter.hazards?.[encounter.currentIndex] !== payload.hazardId) return null;
  const remainingHazards = encounter.hazards.slice(encounter.currentIndex).map((id) => ({ id, name: compactText(DAY1_DATA.hazardTemplates?.[id]?.name || id, 160), kind: compactText(DAY1_DATA.hazardTemplates?.[id]?.kind || "위험", 120) }));
  const inScope = Object.entries(state.characters || {}).filter(([id, character]) => {
    const candidate = state.sessions?.[character?.currentSessionId];
    return id !== actorId && candidate?.status === "ACTIVE" && candidate.variant === session.variant && canonicalScope(candidate) === canonicalScope(session);
  }).map(([id]) => ({ id, name: characterName(source, id) }));
  return {
    action: payload.actionText,
    actorName: characterName(source, actorId),
    currentLocation: compactText(DAY1_DATA.places?.[encounter.fromNode]?.name || encounter.fromNode, 160),
    targetLocation: compactText(DAY1_DATA.places?.[encounter.targetNode]?.name || encounter.targetNode, 160),
    encounterOverview: compactText(encounter.overview, 700), currentHazard: remainingHazards[0], remainingHazards,
    observations: Array.isArray(encounter.flexInsights) ? encounter.flexInsights.slice(-6) : [],
    partyMembers: inScope,
    inventory: Object.values(actor.inventory || {}).map((item) => ({ id: String(item?.itemId || item?.id || ""), name: compactText(item?.name, 120), state: compactText(item?.state || "CLEAN", 60), quantity: Number(item?.quantity) || 0 })).filter((item) => item.id && item.name && item.quantity > 0),
    contamination: Number(actor.contamination) || 0,
  };
}

function fallbackCharacterInteractionDecision(context) {
  return {
    outcome: "NEUTRAL",
    targetEffect: "NONE",
    narration: `${context.actor.name}는 ${context.target.name}을 향해 선언한 동작을 실행한다.`,
  };
}

function fallbackFlexibleHazardDecision(context, payload) {
  const action = String(context.action || "");
  const movement = /(통과|빠져나|벗어나|건너|돌파|달려|뛰어|이동|나간|간다)/.test(action);
  const progressAll = movement && (context.remainingHazards?.length <= 1 || /(끝까지|빠져나|벗어나|정면돌파|통과|돌파|계속\s*(?:달|뛰|간))/.test(action));
  const aggressive = /(밀|떠밀|앞세|방패|내세|던지|넘어뜨|밀치)/.test(action);
  const cooperative = /(손을\s*잡|부축|도와|끌어주|함께|데리고|감싸)/.test(action);
  const target = payload.targetId ? context.partyMembers?.find((entry) => entry.id === payload.targetId) : null;
  return {
    outcome: aggressive ? "PARTIAL" : cooperative ? "SUCCESS" : movement ? "PARTIAL" : "INFO",
    progress: progressAll ? "ALL" : movement ? "CURRENT" : "NONE",
    selfExposure: cooperative || aggressive ? "LOW" : "NONE",
    targetName: target?.name || "",
    targetExposure: target ? (aggressive ? "MEDIUM" : cooperative ? "LOW" : "NONE") : "NONE",
    observationNote: "",
    usedItemId: "",
    usedItemContaminated: false,
    narration: movement
      ? `${context.actorName}는 선언한 방식으로 위험 구간을 통과하려 움직인다.`
      : `${context.actorName}는 위험 구간 안에서 주변 상황에 영향을 주지 않는 행동을 이어간다.`,
  };
}

function safeCommandMetadata(command, metadata) {
  if (command !== "START_PARTY_SESSION_V1" || metadata?.requiresConfirmation !== true) return undefined;
  const ids = (value) => Array.isArray(value) ? value.map((entry) => String(entry || "")).filter((entry) => /^[A-Za-z0-9_-]{1,96}$/.test(entry)).slice(0, 16) : [];
  return { requiresConfirmation: true, pendingIds: ids(metadata.pendingIds), unreadyIds: ids(metadata.unreadyIds) };
}

async function finalizeNewActionObservations(source, reduced, { env, fetchImpl, nowMs }) {
  if (reduced.status !== "APPLIED") return reduced;
  const previousIds = new Set(Object.values(source.state.sessions || {}).flatMap((session) => (session.logs || []).map((entry) => entry?.id)).filter(Boolean));
  const actions = Object.values(reduced.state.sessions || {}).flatMap((session) => (session.logs || [])
    .filter((entry) => entry?.type === "action-input" && entry.id && !previousIds.has(entry.id))
    .map((entry) => ({ sessionId: session.id, entry })));
  for (const action of actions) {
    const fallback = Object.values(reduced.state.sessions || {}).flatMap((session) => session.logs || [])
      .find((entry) => entry?.type === "field-action" && entry.sourceActionLogId === action.entry.id)?.text || "";
    if (!fallback) continue;
    let observation = "";
    let status = "fallback";
    if (env.OPENAI_API_KEY) {
      try {
        const generated = await generateObservation({
          actorName: characterName(source, action.entry.actorId),
          actionText: action.entry.text,
          fallback,
        }, { env, fetchImpl });
        observation = generated.observation;
        status = observation ? "final" : "fallback";
      } catch { /* The deterministic observer-safe fallback remains canonical. */ }
    }
    const finalized = derivePlayerWorldEffects({
      state: reduced.state,
      effect: "FINALIZE_OBSERVATION",
      context: { sourceActionLogId: action.entry.id, status, observation },
      nowMs,
    });
    if (finalized.applied) reduced = { ...reduced, state: finalized.state };
  }
  return reduced;
}

export async function resolveCharacterInteractionDecision(body, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const payload = cleanCharacterInteraction(body);
  if (!payload.action || !payload.actor.id || !payload.actor.name || !payload.target.id || !payload.target.name) throw Object.assign(new Error("INTERACTION_CONTEXT_REQUIRED"), { statusCode: 400 });
  if (!env.OPENAI_API_KEY) throw Object.assign(new Error("AI_NOT_CONFIGURED"), { statusCode: 503 });
  const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const baseUrl = String(env.OPENAI_API_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
    const upstream = await fetchImpl(`${baseUrl}/responses`, { method: "POST", headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ model: env.OPENAI_MODEL || DEFAULT_MODEL, input: [{ role: "developer", content: CHARACTER_INTERACTION_PROMPT }, { role: "user", content: JSON.stringify(payload) }], text: { format: { type: "json_schema", name: "character_interaction_resolution", strict: true, schema: CHARACTER_INTERACTION_SCHEMA } }, max_output_tokens: 700 }), signal: controller.signal });
    const responsePayload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) throw Object.assign(new Error("AI_REQUEST_FAILED"), { statusCode: 502 });
    const parsed = JSON.parse(extractOutputText(responsePayload) || "null");
    return validateCharacterInteraction(parsed, payload.actor.name, payload.target.name);
  } finally { clearTimeout(timeout); }
}

export async function playerWorldCommandHandler(request, response, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  }
  if (!isSameOriginRequest(request)) return sendJson(response, 403, { ok: false, code: "ORIGIN_FORBIDDEN" });

  let body;
  try { body = await readJsonBody(request, 4 * 1024); }
  catch (error) { return sendJson(response, error.statusCode || 400, { ok: false, code: error.message || "INVALID_REQUEST" }); }
  // Explicitly reject caller-provided characterId/accountId/sessionId (and all
  // other extras): identity is derived exclusively from the HttpOnly cookie.
  if (["characterId", "accountId", "sessionId"].some((key) => Object.hasOwn(body || {}, key))) return sendJson(response, 400, { ok: false, code: "INVALID_WORLD_COMMAND" });
  if (!validWorldCommandBody(body)) return sendJson(response, 400, { ok: false, code: "INVALID_WORLD_COMMAND" });

  const verified = await verifyPlayerSession(request, { env, fetchImpl });
  if (!verified.ok) return sessionVerificationFailure(response, verified);
  try {
    const canonicalPayload = playerWorldCommandCatalog.canonicalizePayload(body.command, body.payload);
    if (!canonicalPayload) return sendJson(response, 400, { ok: false, code: "INVALID_WORLD_COMMAND" });
    const sourceRows = await playerAuthRpc(env, "baekji_player_world_command_source_v1", { p_session_token: verified.token }, fetchImpl);
    const source = safeWorldCommandSource(sourceRows, verified.identity.characterId);
    if (!source) return sendJson(response, 503, { ok: false, code: "WORLD_COMMAND_UNAVAILABLE" });
    let serverDecision = null;
    if (body.command === "CHARACTER_INTERACTION_V1") {
      const context = canonicalInteractionContext(source, verified.identity.characterId, canonicalPayload);
      if (context) {
        try { serverDecision = await resolveCharacterInteractionDecision(context, { env, fetchImpl }); }
        catch { serverDecision = fallbackCharacterInteractionDecision(context); }
      }
    } else if (body.command === "RESOLVE_FLEXIBLE_HAZARD_V1") {
      const context = canonicalHazardContext(source, verified.identity.characterId, canonicalPayload);
      if (context) {
        try { serverDecision = await resolveFlexibleHazardDecision(context, { env, fetchImpl }); }
        catch { serverDecision = fallbackFlexibleHazardDecision(context, canonicalPayload); }
      }
    }
    const nowMs = Date.now();
    let reduced = reducePlayerWorldCommand({
      state: source.state,
      actorId: verified.identity.characterId,
      commandId: body.commandId,
      command: body.command,
      payload: canonicalPayload,
      nowMs,
      names: source.names,
      serverDecision,
    });
    reduced = await finalizeNewActionObservations(source, reduced, { env, fetchImpl, nowMs });
    const commitRows = await playerAuthRpc(env, "baekji_player_world_command_commit_v1", {
      p_session_token: verified.token,
      p_command_id: body.commandId,
      p_expected_revision: body.expectedRevision,
      p_command_name: body.command,
      p_command_fingerprint: reduced.fingerprint,
      p_result_status: reduced.status,
      p_next_state: reduced.status === "APPLIED" ? reduced.state : source.state,
    }, fetchImpl);
    const result = safeWorldCommandResult(Array.isArray(commitRows) ? commitRows[0] : commitRows);
    if (!result) return sendJson(response, 503, { ok: false, code: "WORLD_COMMAND_UNAVAILABLE" });
    if (result.status === "COMMAND_ID_REUSED") return sendJson(response, 409, { ok: false, code: "COMMAND_ID_REUSED" });
    const metadata = result.status === reduced.status ? safeCommandMetadata(body.command, reduced.metadata) : undefined;
    return sendJson(response, 200, metadata ? { ...result, metadata } : result);
  } catch (error) {
    if (error?.code === "AUTH_BACKEND_TIMEOUT") return sendJson(response, 504, { ok: false, code: "AUTH_BACKEND_TIMEOUT" });
    return sendJson(response, 503, { ok: false, code: "WORLD_COMMAND_UNAVAILABLE" });
  }
}

export async function playerSessionHandler(request, response, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (request.method === "GET") {
    const verified = await verifyPlayerSession(request, { env, fetchImpl });
    if (!verified.ok) return sessionVerificationFailure(response, verified);
    return sendJson(response, 200, { ok: true, user: sessionUser(verified.identity) });
  }
  if (request.method === "DELETE") {
    if (!isSameOriginRequest(request)) return sendJson(response, 403, { ok: false, code: "ORIGIN_FORBIDDEN" });
    const verified = await verifyPlayerSession(request, { env, fetchImpl });
    if (!verified.ok) {
      if (verified.code === "AUTH_BACKEND_TIMEOUT") return sendJson(response, 504, { ok: false, code: "AUTH_BACKEND_TIMEOUT" });
      if (verified.code === "AUTH_BACKEND_UNAVAILABLE") return sendJson(response, 503, { ok: false, code: "AUTH_BACKEND_UNAVAILABLE" });
      await revokePlayerSession(request, { env, fetchImpl });
      return sendJson(response, 401, { ok: false, code: verified.code }, { "Set-Cookie": clearPlayerSessionCookie() });
    }
    const revoked = await revokePlayerSession(request, { env, fetchImpl });
    if (!revoked) return sendJson(response, 503, { ok: false, code: "AUTH_BACKEND_UNAVAILABLE" });
    return sendJson(response, 200, { ok: true }, { "Set-Cookie": clearPlayerSessionCookie() });
  }
  response.setHeader("Allow", "GET, DELETE");
  return sendJson(response, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
}

export async function testerLoginHandler(request, response, { env = process.env, fetchImpl = globalThis.fetch, tokenFactory = createPlayerSessionToken } = {}) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }
  if (!isSameOriginRequest(request)) return sendJson(response, 403, { ok: false, error: "ORIGIN_FORBIDDEN" });

  let body;
  try { body = await readJsonBody(request); }
  catch (error) { return sendJson(response, error.statusCode || 400, { ok: false, error: error.message || "INVALID_REQUEST" }); }

  const characterName = loginQueryName(body?.characterName);
  const pin = String(body?.pin || "");
  if (!characterName || characterName.length > 40 || !/^\d{4}$/.test(pin)) {
    return sendJson(response, 401, { ok: false, error: "INVALID_CREDENTIALS" });
  }

  try {
    const token = tokenFactory();
    const rows = await playerAuthRpc(env, "baekji_player_login_v2", {
      p_character_name: characterName,
      p_pin: pin,
      p_session_token: token,
      p_previous_session_token: playerSessionTokenFromRequest(request) || null,
    }, fetchImpl);
    const user = playerUser(Array.isArray(rows) ? rows[0] : rows, characterName);
    if (!user) return sendJson(response, 401, { ok: false, error: "INVALID_CREDENTIALS" });
    await bootstrapPlayerCharacter(env, token, fetchImpl);
    return sendJson(response, 200, {
      ok: true,
      user,
    }, { "Set-Cookie": playerSessionCookie(token) });
  } catch (error) {
    if (isLoginThrottled(error)) return sendJson(response, 429, { ok: false, error: "AUTH_RETRY_LATER" });
    console.error("[tester-login] request failed", error?.message || error);
    return authFailure(response, error);
  }
}

export async function testerSignupHandler(request, response, { env = process.env, fetchImpl = globalThis.fetch, tokenFactory = createPlayerSessionToken } = {}) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { ok: false, error: "METHOD_NOT_ALLOWED" });
  }
  if (!isSameOriginRequest(request)) return sendJson(response, 403, { ok: false, error: "ORIGIN_FORBIDDEN" });
  let body;
  try { body = await readJsonBody(request, 600 * 1024); }
  catch (error) { return sendJson(response, error.statusCode || 400, { ok: false, error: error.message || "INVALID_REQUEST" }); }
  const characterName = String(body?.characterName || "").trim();
  const pin = String(body?.pin || "");
  const profilePhoto = String(body?.profilePhoto || "");
  try {
    const token = tokenFactory();
    const rows = await playerAuthRpc(env, "baekji_player_signup_v2", {
      p_character_name: characterName,
      p_pin: pin,
      p_profile_photo: profilePhoto,
      p_session_token: token,
      p_previous_session_token: playerSessionTokenFromRequest(request) || null,
    }, fetchImpl);
    const user = playerUser(Array.isArray(rows) ? rows[0] : rows, characterName);
    if (!user) return sendJson(response, 503, { ok: false, error: "SIGNUP_UNAVAILABLE" });
    await bootstrapPlayerCharacter(env, token, fetchImpl);
    return sendJson(response, 201, { ok: true, user }, { "Set-Cookie": playerSessionCookie(token) });
  } catch (error) {
    const code = authErrorCode(error, "");
    if (code) return sendJson(response, 400, { ok: false, error: code });
    return authFailure(response, error);
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
    return testerLoginHandler(request, response);
  }
  if (url.pathname === "/api/tester-signup") {
    return testerSignupHandler(request, response);
  }
  if (url.pathname === "/api/player-session") {
    return playerSessionHandler(request, response);
  }
  if (url.pathname === "/api/player-world-command") {
    return playerWorldCommandHandler(request, response);
  }
  if (url.pathname === "/api/player-world-projection") {
    return playerWorldProjectionHandler(request, response);
  }
  if (url.pathname === "/api/resolve-character-interaction") {
    // Decisions are only valid when coupled to the command source/CAS commit.
    // Keep the historical URL non-operational so a browser cannot submit its
    // own context and then write a result.
    return sendJson(response, 410, { error: "USE_PLAYER_WORLD_COMMAND" });
  }
  return requestListener(request, response);
}

export const __TESTER_LOGIN_TEST__ = Object.freeze({ normalize, loginQueryName });
export const __CHARACTER_INTERACTION_API_TEST__ = Object.freeze({ cleanCharacterInteraction, validateCharacterInteraction });
