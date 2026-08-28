const DEFAULT_MODEL = "gpt-5.6-sol";
const TIMEOUT_MS = 15000;
const MAX_BODY_BYTES = 32 * 1024;

const RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "outcome",
    "progress",
    "selfExposure",
    "targetName",
    "targetExposure",
    "observationNote",
    "usedItemId",
    "usedItemContaminated",
    "narration",
  ],
  properties: {
    outcome: { type: "string", enum: ["SUCCESS", "PARTIAL", "FAIL", "INFO"] },
    progress: { type: "string", enum: ["NONE", "CURRENT", "ALL"] },
    selfExposure: { type: "string", enum: ["NONE", "LOW", "MEDIUM", "HIGH"] },
    targetName: { type: "string" },
    targetExposure: { type: "string", enum: ["NONE", "LOW", "MEDIUM", "HIGH"] },
    observationNote: { type: "string" },
    usedItemId: { type: "string" },
    usedItemContaminated: { type: "boolean" },
    narration: { type: "string" },
  },
};

const SYSTEM_PROMPT = `너는 한국어 호러 조사 RPG의 돌발 위험 진행 판정자다.
이 게임은 정답 선택지를 맞히는 게임이 아니다. 현재 위험과 캐릭터가 실제로 선언한 자유 행동을 물리적·상황적 맥락으로 판단한다.

반드시 다음 원칙을 지켜라.
1. 특정 키워드만으로 성공/실패를 고정하지 않는다. 특히 달리기, 뛰기, 정면돌파, 무시하기는 자동 실패가 아니다. 현재 위험의 성질과 행동의 구체성에 따라 성공·부분성공·실패가 모두 가능하다.
2. 남은 위험이 2개여도 한 번의 연속 행동이 둘 다 실질적으로 돌파한다면 progress=ALL이다. 현재 위험 하나만 넘기면 CURRENT, 위치 진행이 없으면 NONE이다.
3. outcome과 progress는 별개다. 대가를 치르고 통과하면 PARTIAL+CURRENT/ALL이 가능하다. FAIL은 실질적 이동 진전이 없을 때 주로 사용한다.
4. 오염은 성공/실패와 별개로 실제 노출 정도를 판단한다. 접촉이 전혀 없으면 selfExposure=NONE, 약한 가능성은 LOW, 명확한 접촉/노출은 MEDIUM, 심한 직접 노출은 HIGH다. 성공하면서 오염될 수도 있고 실패하면서 오염이 없을 수도 있다.
5. 단순히 주변을 살피거나 듣거나 멈춰 관찰하는 행동은 보통 INFO+NONE이며 observationNote에 다음 행동에 실제로 도움이 되는 짧은 관찰 결과를 남긴다. 이미 축적된 observations가 있으면 후속 행동의 합리성을 평가할 때 반영한다.
6. "틈을 기다렸다가 통과한다", "패턴을 본 뒤 안전한 순간에 달린다"처럼 관찰/대기와 통과가 한 문장에 함께 있으면 단순 관찰로 멈추지 말고 전체 행동을 판정한다.
7. 같은 조의 다른 캐릭터를 밀치거나 앞세우거나 위험을 떠넘기는 행동도 금지하지 않는다. partyMembers에 실제 존재하고 사용자가 이름을 명시한 경우에만 targetName에 정확한 이름을 넣고 targetExposure를 따로 판정한다. 이름이 불명확하면 targetName은 빈 문자열이다. 임의의 사람을 창작하지 않는다.
8. 소지품을 실제로 사용했다면 inventory에서 정확히 일치하는 항목 id만 usedItemId에 넣는다. 도구가 오염원과 대신 접촉했다면 usedItemContaminated=true로 한다. 없는 물건을 만들어내지 않는다.
9. 시트의 safeActions 같은 정답 목록을 추측하지 않는다. 제공된 hazard의 이름·종류·상황, 캐릭터 행동, 기존 관찰 정보만으로 판단한다.
10. narration은 2~4개의 자연스러운 한국어 문장으로 쓴다. 캐릭터가 실제로 한 행동부터 묘사하고, 결과·노출·진행 여부를 장면으로 보여준다. "판정", "성공", "실패", "progress", "오염 수치" 같은 시스템 용어는 쓰지 않는다.
11. context에 없는 부상, 새 아이템, 새 출구, 새 인물, 초능력, 장치를 창작하지 않는다.
12. 캐릭터의 기발한 행동이 물리적으로 말이 되고 현재 위험을 해결한다면 시트에 없는 방식이어도 인정한다.`;

function sendJson(res, status, payload) {
  const text = JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(text);
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("REQUEST_TOO_LARGE"), { statusCode: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw Object.assign(new Error("INVALID_JSON"), { statusCode: 400 });
  }
}

function cleanText(value, max = 900) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanPayload(body) {
  const list = (value, max = 8) => Array.isArray(value) ? value.slice(0, max) : [];
  return {
    action: cleanText(body?.action, 700),
    actorName: cleanText(body?.actorName, 100),
    currentLocation: cleanText(body?.currentLocation, 160),
    targetLocation: cleanText(body?.targetLocation, 160),
    encounterOverview: cleanText(body?.encounterOverview, 700),
    currentHazard: {
      id: cleanText(body?.currentHazard?.id, 80),
      name: cleanText(body?.currentHazard?.name, 160),
      kind: cleanText(body?.currentHazard?.kind, 120),
    },
    remainingHazards: list(body?.remainingHazards).map((item) => ({
      id: cleanText(item?.id, 80),
      name: cleanText(item?.name, 160),
      kind: cleanText(item?.kind, 120),
    })),
    observations: list(body?.observations, 6).map((item) => cleanText(item, 240)).filter(Boolean),
    partyMembers: list(body?.partyMembers, 12).map((item) => ({ id: cleanText(item?.id, 80), name: cleanText(item?.name, 120) })).filter((item) => item.id && item.name),
    inventory: list(body?.inventory, 30).map((item) => ({
      id: cleanText(item?.id, 80),
      name: cleanText(item?.name, 120),
      state: cleanText(item?.state, 60),
      quantity: Math.max(0, Math.min(99, Number(item?.quantity) || 0)),
    })).filter((item) => item.id && item.name && item.quantity > 0),
    contamination: Math.max(0, Math.min(100, Number(body?.contamination) || 0)),
  };
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

export async function resolveFlexibleHazardDecision(body, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const payload = cleanPayload(body);
  if (!payload.action || !payload.currentHazard.id) throw Object.assign(new Error("INVALID_HAZARD_REQUEST"), { statusCode: 400 });
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw Object.assign(new Error("AI_NOT_CONFIGURED"), { statusCode: 503 });
  const baseUrl = String(env.OPENAI_API_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${baseUrl}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || DEFAULT_MODEL,
        input: [
          { role: "developer", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload) },
        ],
        text: { format: { type: "json_schema", name: "flexible_hazard_resolution", strict: true, schema: RESPONSE_SCHEMA } },
        max_output_tokens: 900,
      }),
      signal: controller.signal,
    });
    const responsePayload = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error("AI_REQUEST_FAILED"), { statusCode: 502, detail: cleanText(responsePayload?.error?.message, 240) });
    const decision = JSON.parse(extractOutputText(responsePayload) || "null");
    if (!decision) throw Object.assign(new Error("AI_EMPTY_RESULT"), { statusCode: 502 });
    return decision;
  } finally {
    clearTimeout(timeout);
  }
}

export default async function handler(req, res) {
  // Canonical state is assembled by /api/player-world-command.  This old
  // public endpoint intentionally no longer accepts browser supplied context.
  return sendJson(res, 410, { error: "USE_PLAYER_WORLD_COMMAND" });
}
