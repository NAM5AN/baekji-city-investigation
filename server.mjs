import http from "node:http";
import path from "node:path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MODEL = "gpt-5.6-sol";
const MAX_BODY_BYTES = 32 * 1024;
const OPENAI_TIMEOUT_MS = 15_000;

export function resolveRuntimeEnvironment(source = process.env, { platform = process.platform, execFileSyncImpl = execFileSync } = {}) {
  const runtime = { ...source };
  if (platform !== "win32") return runtime;
  for (const name of ["OPENAI_API_KEY", "OPENAI_MODEL"]) {
    if (runtime[name]) continue;
    try {
      const output = execFileSyncImpl("reg.exe", ["query", "HKCU\\Environment", "/v", name], {
        encoding: "utf8",
        windowsHide: true,
        stdio: ["ignore", "pipe", "ignore"],
      });
      const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const match = String(output).match(new RegExp(`^\\s*${escapedName}\\s+REG_(?:SZ|EXPAND_SZ)\\s+(.+?)\\s*$`, "m"));
      if (match?.[1]) runtime[name] = match[1].trim();
    } catch {
      // 환경 변수가 없으면 로컬 판정 모드로 계속 실행합니다.
    }
  }
  return runtime;
}

const INTENTS = [
  "MAP",
  "MOVE",
  "INSPECT_OBJECT",
  "OBSERVE_DETAIL",
  "OBSERVE_SCENE",
  "MUNDANE_INSPECTION",
  "NAVIGATION_HINT",
  "LISTEN",
  "CHECK_SELF",
  "WAIT",
  "HAZARD_RESPONSE",
  "OTHER",
];

const ACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "targetId", "normalizedAction", "confidence", "usedItemName", "usedItemId", "itemUseFit", "itemUseReason", "actionSubject", "sensoryMode", "targetText", "hazardRelevance", "executable"],
  properties: {
    intent: { type: "string", enum: INTENTS },
    targetId: { type: "string" },
    normalizedAction: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    usedItemName: { type: "string" },
    usedItemId: { type: "string" },
    itemUseFit: { type: "string", enum: ["NONE", "SUITABLE", "UNSUITABLE", "MISSING"] },
    itemUseReason: { type: "string" },
    actionSubject: { type: "string", enum: ["SELF", "ENVIRONMENT", "OBJECT", "PERSON", "UNKNOWN"] },
    sensoryMode: { type: "string", enum: ["LISTEN", "LOOK", "TOUCH", "MOVE", "OTHER"] },
    targetText: { type: "string" },
    hazardRelevance: { type: "string", enum: ["RELEVANT", "IRRELEVANT", "NONE"] },
    executable: { type: "boolean" },
  },
};

const NARRATION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["narration"],
  properties: { narration: { type: "string" } },
};

const SYSTEM_PROMPT = `너는 한국어 조사 게임의 행동 의도 분류기다.
사용자는 맞춤법이 불완전하거나 구어체·축약형·유행어·명사형 종결을 쓸 수 있다. 예: "지도 봄", "이동한당", "동부 출입구로 감", "계단을 따라간다", "개찰구로 가자".

반드시 다음 원칙을 지켜라.
1. 최종 성공·실패나 오염 수치를 창작하지 말고, 행동 의도·후보 targetId·명시적으로 사용한 물건만 분류한다.
2. targetId는 제공된 routes/details/objects의 id 중 하나만 쓴다. 대상이 없거나 확실하지 않으면 빈 문자열이다.
3. 위험 상황에서 지도 보기, 주변 관찰, 길 묻기는 각각 MAP, OBSERVE_SCENE/OBSERVE_DETAIL, NAVIGATION_HINT다. 위험 대응으로 오판하지 않는다.
4. 위험을 피해 걷기·건너기·막기·기다렸다 통과하기처럼 물리적으로 대응하는 행동은 HAZARD_RESPONSE다. 위험 중에는 MOVE로 위험을 건너뛰지 않는다.
5. 현재 장소의 등록 오브젝트를 확인하면 INSPECT_OBJECT, 등록되지 않은 평범한 대상을 살피면 MUNDANE_INSPECTION이다.
6. 목적지가 분명한 이동은 MOVE다. destinations에 이름이 있어도 현재 routes에 그 목적지로 바로 가는 경로가 없거나 이미 현재 장소라면 targetId는 빈 문자열이다. 절대로 다른 목적지의 route id를 대신 고르지 않는다. 이동 의도만 있고 목적지가 없을 때도 MOVE와 빈 targetId를 반환한다.
7. "손잡이를 손수건으로 닦고 이동한다"처럼 어떤 물건을 꺼내거나 착용하거나 도구로 쓰는 문장은 usedItemName에 그 물건 이름을 남긴다. 물건을 쓰지 않으면 usedItemName과 usedItemId는 빈 문자열, itemUseFit은 NONE이다.
8. inventory는 캐릭터가 실제로 가진 물건만 담는다. 사용 물건과 일치하는 inventory 항목이 있으면 그 id를 usedItemId로 쓴다. 언급한 물건이 inventory에 없으면 usedItemId는 빈 문자열, itemUseFit은 MISSING이다. 비슷한 물건을 임의로 대신 쓰지 않는다.
9. 가진 물건이면 태그·상태·재질·크기와 사용 목적을 대조해 itemUseFit을 SUITABLE 또는 UNSUITABLE로 고르고, itemUseReason에는 판정 이유만 짧게 쓴다. 이 평가는 최종 행동 성공 여부가 아니라 해당 물건을 그 용도로 쓸 수 있는지만 뜻한다.
10. "방송 잡음을 듣는다"처럼 소리에 집중하면 LISTEN·sensoryMode LISTEN이다. 스피커를 보거나 조사하는 행동으로 바꾸지 않는다.
11. 자신의 피부·몸·옷·오염 상태를 살피면 CHECK_SELF·actionSubject SELF다. 주변이나 바닥을 관찰하는 행동으로 바꾸지 않는다.
12. 위험 상황의 hazardRelevance는 실제로 눈앞의 위험을 피하고, 막고, 건너거나 안전한 틈을 이용하는 물리 행동에만 RELEVANT다. 엉뚱한 말, 자기 상태 확인, 듣기, 단순 기다리기는 IRRELEVANT이며 HAZARD_RESPONSE가 아니다.
13. executable은 문장에 적힌 행동 자체를 지금 수행할 수 있는지를 뜻한다. 단어나 의미를 알 수 없는 입력은 false다.
14. targetText에는 사용자가 실제로 향한 대상만 짧게 남긴다. normalizedAction은 준비 동작과 후속 행동의 순서를 보존한 짧고 자연스러운 한국어 행동문이다. 내부 추론이나 설명을 쓰지 않는다.`;

const NARRATION_PROMPT = `너는 한국어 호러 조사 게임의 결과문 작가다. 제공된 action, interpretation, event, context를 바탕으로 SYSTEM 결과문 한 개만 작성한다.

반드시 다음 원칙을 지켜라.
1. event는 이미 확정된 게임 사실이다. outcome, contaminationDelta, arrived, 위치, 소지품, 위험 진행 여부를 바꾸지 않는다.
2. 2~4개의 자연스러운 한국어 문장으로 쓴다. 표제, 목록, 괄호 설명, 내부 추론은 쓰지 않는다.
3. 사용자가 한 행동을 첫 문장부터 정확히 실행한다. 듣기는 소리로, 자기 상태 확인은 몸과 피부로, 기다리기는 기다리는 모습으로 묘사한다. 감각 양식을 다른 행동으로 바꾸지 않는다.
4. context와 event에 없는 인물, 소지품, 단서, 출구, 장치 반응, 부상, 상태 변화를 창작하지 않는다.
5. 위험과 무관한 행동은 행동 자체가 가능하면 자연스럽게 수행하되 위험을 해결하거나 통과시키지 않는다.
6. 다음과 같은 운영·판정투 문구를 쓰지 않는다: 입력, 요청, 판정, 시도, 대상, 현재 장면, 주변 구조에는 변화가 없다, 필요한 준비를 갖추지 못해, 그 뒤의 행동도 이어지지 않는다, 행동은 완료되지 않는다, 원하는 결과.
7. 실패도 인물의 실제 동작과 눈앞에서 확인되는 원인으로 보여 준다. "AI", "시스템이", "가능/불가능" 같은 설명은 쓰지 않는다.
8. fallback은 사실 확인용 초안일 뿐이다. 더 자연스럽고 몰입감 있게 새로 쓴다.`;

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
  [".woff", "font/woff"],
  [".ttf", "font/ttf"],
  [".otf", "font/otf"],
]);

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  response.end(body);
}

function isSameOriginRequest(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try {
    return new URL(origin).host === request.headers.host;
  } catch {
    return false;
  }
}

async function readJsonBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      const error = new Error("REQUEST_TOO_LARGE");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    const error = new Error("INVALID_JSON");
    error.statusCode = 400;
    throw error;
  }
}

function compactText(value, maxLength = 500) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function compactCandidate(candidate) {
  return {
    id: compactText(candidate?.id, 80),
    name: compactText(candidate?.name, 120),
  };
}

function sanitizeRequestPayload(body) {
  const context = body?.context && typeof body.context === "object" ? body.context : {};
  const phase = context.phase === "hazard" ? "hazard" : "scene";
  const cleanList = (value) => Array.isArray(value) ? value.slice(0, 40).map(compactCandidate).filter((item) => item.id && item.name) : [];
  return {
    text: compactText(body?.text, 700),
    context: {
      phase,
      currentLocation: compactText(context.currentLocation, 160),
      currentDetail: compactText(context.currentDetail, 160),
      visibleSituation: compactText(context.visibleSituation, 700),
      routes: cleanList(context.routes),
      destinations: cleanList(context.destinations),
      details: cleanList(context.details),
      objects: cleanList(context.objects),
      inventory: Array.isArray(context.inventory) ? context.inventory.slice(0, 40).map((item) => ({
        id: compactText(item?.id, 80),
        name: compactText(item?.name, 120),
        state: compactText(item?.state, 40),
        quantity: Math.max(0, Math.min(99, Number(item?.quantity) || 0)),
        tags: Array.isArray(item?.tags) ? item.tags.slice(0, 12).map((tag) => compactText(tag, 60)).filter(Boolean) : [],
        primary: compactText(item?.primary, 80),
        secondary: compactText(item?.secondary, 240),
      })).filter((item) => item.id && item.name && item.quantity > 0) : [],
      characterStatus: {
        contamination: Math.max(0, Math.min(100, Number(context.characterStatus?.contamination) || 0)),
        symptom: compactText(context.characterStatus?.symptom, 120),
      },
      recentSystem: Array.isArray(context.recentSystem) ? context.recentSystem.slice(-12).map((entry) => compactText(entry, 500)).filter(Boolean) : [],
    },
  };
}

function sanitizeNarrationPayload(body) {
  const actionPayload = sanitizeRequestPayload({ text: body?.text, context: body?.context });
  const interpretation = body?.interpretation && typeof body.interpretation === "object" ? body.interpretation : {};
  const event = body?.event && typeof body.event === "object" ? body.event : {};
  return {
    action: actionPayload.text,
    interpretation: {
      intent: INTENTS.includes(interpretation.intent) ? interpretation.intent : "OTHER",
      normalizedAction: compactText(interpretation.normalizedAction, 240),
      actionSubject: compactText(interpretation.actionSubject, 30),
      sensoryMode: compactText(interpretation.sensoryMode, 30),
      targetText: compactText(interpretation.targetText, 160),
      hazardRelevance: compactText(interpretation.hazardRelevance, 30),
      executable: interpretation.executable !== false,
      usedItemName: compactText(interpretation.usedItemName, 120),
      itemUseFit: compactText(interpretation.itemUseFit, 30),
    },
    event: {
      kind: compactText(event.kind, 80),
      outcome: compactText(event.outcome, 80),
      hazardId: compactText(event.hazardId, 80),
      contaminationDelta: Math.max(0, Math.min(100, Number(event.contaminationDelta) || 0)),
      contaminationAfter: Math.max(0, Math.min(100, Number(event.contaminationAfter) || 0)),
      arrived: event.arrived === true,
      currentLocation: compactText(event.currentLocation, 160),
      objectName: compactText(event.objectName, 160),
      detailName: compactText(event.detailName, 160),
      fallback: compactText(event.fallback, 1200),
    },
    context: actionPayload.context,
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

function validateInterpretation(value, context) {
  const intent = INTENTS.includes(value?.intent) ? value.intent : "OTHER";
  const candidateIds = new Set([
    ...context.routes.map((item) => item.id),
    ...context.details.map((item) => item.id),
    ...context.objects.map((item) => item.id),
  ]);
  let targetId = compactText(value?.targetId, 80);
  if (targetId && !candidateIds.has(targetId)) targetId = "";
  if (intent === "MOVE" && targetId && !context.routes.some((item) => item.id === targetId)) targetId = "";
  if (intent === "INSPECT_OBJECT" && targetId && !context.objects.some((item) => item.id === targetId)) targetId = "";
  if (intent === "OBSERVE_DETAIL" && targetId && !context.details.some((item) => item.id === targetId)) targetId = "";
  const normalizedAction = compactText(value?.normalizedAction, 240);
  const confidence = Number.isFinite(value?.confidence) ? Math.max(0, Math.min(1, value.confidence)) : 0;
  const inventoryIds = new Set(context.inventory.map((item) => item.id));
  const usedItemName = compactText(value?.usedItemName, 120);
  let usedItemId = compactText(value?.usedItemId, 80);
  if (usedItemId && !inventoryIds.has(usedItemId)) usedItemId = "";
  let itemUseFit = ["NONE", "SUITABLE", "UNSUITABLE", "MISSING"].includes(value?.itemUseFit) ? value.itemUseFit : "NONE";
  let itemUseReason = compactText(value?.itemUseReason, 240);
  if (!usedItemName) {
    usedItemId = "";
    itemUseFit = "NONE";
    itemUseReason = "";
  } else if (!usedItemId) {
    itemUseFit = "MISSING";
  }
  const actionSubject = ["SELF", "ENVIRONMENT", "OBJECT", "PERSON", "UNKNOWN"].includes(value?.actionSubject) ? value.actionSubject : "UNKNOWN";
  const sensoryMode = ["LISTEN", "LOOK", "TOUCH", "MOVE", "OTHER"].includes(value?.sensoryMode) ? value.sensoryMode : "OTHER";
  const targetText = compactText(value?.targetText, 160);
  let hazardRelevance = ["RELEVANT", "IRRELEVANT", "NONE"].includes(value?.hazardRelevance) ? value.hazardRelevance : "NONE";
  if (context.phase !== "hazard") hazardRelevance = "NONE";
  if (context.phase === "hazard" && intent !== "HAZARD_RESPONSE") hazardRelevance = "IRRELEVANT";
  const executable = value?.executable === true;
  return { intent, targetId, normalizedAction, confidence, usedItemName, usedItemId, itemUseFit, itemUseReason, actionSubject, sensoryMode, targetText, hazardRelevance, executable };
}

async function requestOpenAI(payload, env, fetchImpl) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error("AI_NOT_CONFIGURED");
    error.statusCode = 503;
    throw error;
  }
  const baseUrl = String(env.OPENAI_API_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  try {
    const apiResponse = await fetchImpl(`${baseUrl}/responses`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || DEFAULT_MODEL,
        input: [
          { role: "developer", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload) },
        ],
        text: {
          format: {
            type: "json_schema",
            name: "action_interpretation",
            strict: true,
            schema: ACTION_SCHEMA,
          },
        },
        max_output_tokens: 320,
      }),
      signal: controller.signal,
    });
    const responsePayload = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      const error = new Error(compactText(responsePayload?.error?.message, 240) || `OPENAI_HTTP_${apiResponse.status}`);
      error.statusCode = 502;
      throw error;
    }
    const outputText = extractOutputText(responsePayload);
    if (!outputText) {
      const error = new Error("AI_EMPTY_OUTPUT");
      error.statusCode = 502;
      throw error;
    }
    let parsed;
    try {
      parsed = JSON.parse(outputText);
    } catch {
      const error = new Error("AI_INVALID_OUTPUT");
      error.statusCode = 502;
      throw error;
    }
    return validateInterpretation(parsed, payload.context);
  } finally {
    clearTimeout(timeout);
  }
}

async function requestOpenAINarration(payload, env, fetchImpl) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    const error = new Error("AI_NOT_CONFIGURED");
    error.statusCode = 503;
    throw error;
  }
  const baseUrl = String(env.OPENAI_API_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  try {
    const apiResponse = await fetchImpl(`${baseUrl}/responses`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || DEFAULT_MODEL,
        input: [
          { role: "developer", content: NARRATION_PROMPT },
          { role: "user", content: JSON.stringify(payload) },
        ],
        text: { format: { type: "json_schema", name: "action_narration", strict: true, schema: NARRATION_SCHEMA } },
        max_output_tokens: 520,
      }),
      signal: controller.signal,
    });
    const responsePayload = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) {
      const error = new Error(compactText(responsePayload?.error?.message, 240) || `OPENAI_HTTP_${apiResponse.status}`);
      error.statusCode = 502;
      throw error;
    }
    const outputText = extractOutputText(responsePayload);
    let parsed;
    try { parsed = JSON.parse(outputText); }
    catch {
      const error = new Error("AI_INVALID_OUTPUT");
      error.statusCode = 502;
      throw error;
    }
    const narration = compactText(parsed?.narration, 1200);
    if (!narration) {
      const error = new Error("AI_EMPTY_OUTPUT");
      error.statusCode = 502;
      throw error;
    }
    return { narration };
  } finally {
    clearTimeout(timeout);
  }
}

async function serveStatic(request, response, rootDir) {
  const url = new URL(request.url || "/", "http://localhost");
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    response.writeHead(400).end("Bad Request");
    return;
  }
  const relativePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.resolve(rootDir, relativePath);
  if (filePath !== rootDir && !filePath.startsWith(`${rootDir}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) throw new Error("NOT_FILE");
    const headers = {
      "Content-Type": MIME_TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
      "Content-Length": info.size,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
      "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; font-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'",
    };
    if (path.basename(filePath) === "index.html") headers["Cache-Control"] = "no-store";
    response.writeHead(200, headers);
    if (request.method === "HEAD") return response.end();
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not Found");
  }
}

export function createAppServer({ rootDir = MODULE_DIR, env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const resolvedRoot = path.resolve(rootDir);
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      if (url.pathname === "/api/ai/status" && request.method === "GET") {
        return sendJson(response, 200, {
          available: Boolean(env.OPENAI_API_KEY),
          mode: env.OPENAI_API_KEY ? "ai" : "local",
          model: env.OPENAI_API_KEY ? (env.OPENAI_MODEL || DEFAULT_MODEL) : "",
        });
      }
      if (url.pathname === "/api/interpret-action" && request.method === "POST") {
        if (!isSameOriginRequest(request)) return sendJson(response, 403, { error: "ORIGIN_NOT_ALLOWED" });
        if (!env.OPENAI_API_KEY) return sendJson(response, 503, { error: "AI_NOT_CONFIGURED", fallback: "local" });
        const payload = sanitizeRequestPayload(await readJsonBody(request));
        if (!payload.text) return sendJson(response, 400, { error: "ACTION_REQUIRED" });
        const interpretation = await requestOpenAI(payload, env, fetchImpl);
        return sendJson(response, 200, interpretation);
      }
      if (url.pathname === "/api/narrate-action" && request.method === "POST") {
        if (!isSameOriginRequest(request)) return sendJson(response, 403, { error: "ORIGIN_NOT_ALLOWED" });
        if (!env.OPENAI_API_KEY) return sendJson(response, 503, { error: "AI_NOT_CONFIGURED", fallback: "local" });
        const payload = sanitizeNarrationPayload(await readJsonBody(request));
        if (!payload.action || !payload.event.fallback) return sendJson(response, 400, { error: "NARRATION_CONTEXT_REQUIRED" });
        return sendJson(response, 200, await requestOpenAINarration(payload, env, fetchImpl));
      }
      if (!["GET", "HEAD"].includes(request.method || "")) return sendJson(response, 405, { error: "METHOD_NOT_ALLOWED" });
      return serveStatic(request, response, resolvedRoot);
    } catch (error) {
      const statusCode = Number(error?.statusCode) || (error?.name === "AbortError" ? 504 : 500);
      const publicCode = statusCode >= 500 ? "AI_SERVICE_UNAVAILABLE" : compactText(error?.message, 80) || "REQUEST_FAILED";
      return sendJson(response, statusCode, { error: publicCode, fallback: "local" });
    }
  });
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  const runtimeEnv = resolveRuntimeEnvironment();
  const port = Number(runtimeEnv.PORT || 4173);
  const host = runtimeEnv.HOST || "127.0.0.1";
  const server = createAppServer({ env: runtimeEnv });
  server.listen(port, host, () => {
    const mode = runtimeEnv.OPENAI_API_KEY ? `AI ${runtimeEnv.OPENAI_MODEL || DEFAULT_MODEL}` : "LOCAL FALLBACK";
    console.log(`백지도시 v0.3.18 · ${mode}`);
    console.log(`http://localhost:${port}`);
  });
}
