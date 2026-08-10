import { createAppServer } from "../server.mjs";

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
1. 밀기, 당기기, 붙잡기, 때리기, 발로 차기, 앞을 막기, 부축하기, 손을 잡기, 안기, 토닥이기, 손짓하기, 물건을 보여주기 등 인물 사이의 다양한 물리적·사회적 상호작용을 모두 상황에 맞게 판단한다.
2. 행동을 자동 성공이나 자동 실패로 고정하지 않는다. 힘의 방향, 동작의 구체성, 현재 장소와 자세를 고려해 밀쳐졌지만 버티기, 몇 걸음 밀리기, 비틀거리기, 넘어지기처럼 자연스러운 차이를 낸다.
3. 캐릭터 능력치나 성격 정보가 없으면 평범한 성인 수준의 즉각적인 반응만 가정한다. 임의의 초능력, 특별한 전투 기술, 숨겨진 장비를 만들지 않는다.
4. 사용자가 명시하지 않은 심각한 부상, 골절, 출혈, 기절, 사망, 새 소지품, 위치 이동, 오염 수치 변화는 창작하지 않는다. 단순한 균형 상실·밀림·넘어짐·접촉·버팀 정도의 즉각적인 물리 반응은 허용한다.
5. 상대 캐릭터의 대사를 임의로 만들지 않는다. 사용자의 행동에 실제 발화가 포함된 경우에만 그 발화를 그대로 활용할 수 있다.
6. 부축·도움·손을 내미는 행동은 상황에 맞으면 자연스럽게 도움 효과를 낼 수 있다. 가로막기·붙잡기·밀치기처럼 상대 의사와 충돌하는 행동은 상대가 버티거나 피하는 결과도 가능하다.
7. activeHazard가 있더라도 이 API는 인물 상호작용 자체만 판정한다. 이동 경로의 위험을 해결하거나 조사조 진행도를 임의로 전진시키지 않는다.
8. outcome은 EFFECTIVE, PARTIAL, RESISTED, NEUTRAL 중 하나다. targetEffect는 가장 가까운 즉각 결과 하나만 고른다.
9. narration은 2~4개의 자연스러운 한국어 문장으로 작성한다. 첫 문장부터 actor.name과 target.name을 실제 이름 그대로 써서 사용자가 한 행동을 실행하고, 이어서 상대의 반응과 즉각적인 결과를 장면으로 보여준다.
10. "판정", "성공", "실패", "시도", "가능", "불가능", "AI", "시스템" 같은 운영 문구를 쓰지 않는다.
11. 캐릭터 이름 뒤의 한국어 조사는 받침에 맞게 자연스럽게 쓴다. 특히 을/를, 이/가, 은/는, 과/와, 으로/로를 틀리지 않는다.
12. context에 없는 새 인물이나 장소 반응을 창작하지 않는다.`;

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
    if (size > 16 * 1024) throw Object.assign(new Error("REQUEST_TOO_LARGE"), { statusCode: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw Object.assign(new Error("INVALID_JSON"), { statusCode: 400 }); }
}

function isSameOriginRequest(request) {
  const origin = request.headers?.origin;
  if (!origin) return true;
  try { return new URL(origin).host === request.headers.host; }
  catch { return false; }
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

function validateCharacterInteraction(value) {
  const outcomes = new Set(["EFFECTIVE", "PARTIAL", "RESISTED", "NEUTRAL"]);
  const effects = new Set(["NONE", "CONTACT", "MOVED", "STAGGERED", "FELL", "RESISTED", "SUPPORTED", "BLOCKED", "REACTED", "OTHER"]);
  const narration = compactText(value?.narration, 1200);
  if (!narration) throw Object.assign(new Error("AI_EMPTY_RESULT"), { statusCode: 502 });
  return {
    outcome: outcomes.has(value?.outcome) ? value.outcome : "NEUTRAL",
    targetEffect: effects.has(value?.targetEffect) ? value.targetEffect : "OTHER",
    narration,
  };
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

async function handleCharacterInteraction(request, response) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
  }
  if (!isSameOriginRequest(request)) return sendJson(response, 403, { error: "ORIGIN_NOT_ALLOWED" });

  let payload;
  try { payload = cleanCharacterInteraction(await readJsonBody(request)); }
  catch (error) { return sendJson(response, error.statusCode || 400, { error: error.message || "INVALID_REQUEST" }); }

  if (!payload.action || !payload.actor.id || !payload.actor.name || !payload.target.id || !payload.target.name) {
    return sendJson(response, 400, { error: "INTERACTION_CONTEXT_REQUIRED" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return sendJson(response, 503, { error: "AI_NOT_CONFIGURED" });
  const baseUrl = String(process.env.OPENAI_API_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const upstream = await globalThis.fetch(`${baseUrl}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        input: [
          { role: "developer", content: CHARACTER_INTERACTION_PROMPT },
          { role: "user", content: JSON.stringify(payload) },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "character_interaction_resolution",
            strict: true,
            schema: CHARACTER_INTERACTION_SCHEMA,
          },
        },
        max_output_tokens: 700,
      }),
      cache: "no-store",
      signal: controller.signal,
    });
    const responsePayload = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      console.error("[character-interaction] OpenAI response", upstream.status, compactText(responsePayload?.error?.message, 180));
      return sendJson(response, 502, { error: "AI_REQUEST_FAILED" });
    }
    let parsed;
    try { parsed = JSON.parse(extractOutputText(responsePayload) || "null"); }
    catch { parsed = null; }
    if (!parsed) return sendJson(response, 502, { error: "AI_INVALID_RESULT" });
    return sendJson(response, 200, validateCharacterInteraction(parsed));
  } catch (error) {
    if (error?.name === "AbortError") return sendJson(response, 504, { error: "AI_TIMEOUT" });
    console.error("[character-interaction] request failed", error?.message || error);
    return sendJson(response, 502, { error: "AI_REQUEST_FAILED" });
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
  if (url.pathname === "/api/resolve-character-interaction") {
    return handleCharacterInteraction(request, response);
  }
  return requestListener(request, response);
}

export const __TESTER_LOGIN_TEST__ = Object.freeze({ normalize, loginQueryName });
export const __CHARACTER_INTERACTION_API_TEST__ = Object.freeze({ cleanCharacterInteraction, validateCharacterInteraction });
