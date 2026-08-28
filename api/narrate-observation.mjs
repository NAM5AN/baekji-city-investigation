const MODEL = "gpt-5.6-sol";
const TIMEOUT_MS = 15000;
const MAX_BODY = 24 * 1024;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["observation"],
  properties: { observation: { type: "string" } },
};

const PROMPT = `너는 한국어 호러 조사 게임의 타인 관찰문 작가다.
같은 현장에 있는 다른 캐릭터가 실제로 보고 들을 수 있는 외부 정보만 1~2문장으로 서술한다.

핵심 원칙은 '행동 선언의 진실'과 '관찰자가 감각으로 확인 가능한 사실'을 분리하는 것이다.

규칙:
1. 속마음, 목적, 의도, 성공·실패, 조사 결과를 추측하지 않는다.
2. 입력 행동을 그대로 복사하지 말고 일반적인 성인의 시야와 청각 기준으로 관찰자 시점으로 바꾼다.
3. 제공된 actorName을 사용한다.
4. visualMode가 OCCLUDED이면 주머니·가방·옷 안쪽, 책상 아래, 몸 뒤처럼 가려진 곳에서 실제로 무엇을 했는지 절대 밝히지 않는다. 관찰 가능한 팔·손의 이동, 천이나 가방이 움직이는 모습, 부스럭거림 같은 외부 단서만 쓴다.
5. 가려진 곳의 손가락 모양, 숨긴 물건의 정체, 제스처의 의미, 목표 대상을 추측하지 않는다. 예: '주머니 속에서 가운데손가락을 세운다'는 '주머니에 손을 넣고 안쪽에서 손을 움직인다' 정도로만 관찰한다.
6. speechMode가 INTERNAL이면 생각·속마음의 내용은 물론 발화가 있었다고도 단정하지 않는다.
7. speechMode가 PRIVATE이면 혼잣말·중얼거림·속삭임의 내용은 절대 쓰지 않고 작게 말하는 외부 행동만 묘사한다.
8. speechMode가 PUBLIC_QUOTE이면 직접 발화 내용은 서버가 별도로 붙이므로 observation에는 인용문을 쓰지 않고, 말하는 모습과 음량 같은 외부 행동만 묘사한다.
9. speechMode가 PUBLIC이면 말하는 행동만 묘사하고 새로운 발화 내용을 창작하지 않는다.
10. 같은 장소에서 평범하게 또렷하게 한 말은 들을 수 있다. 작은 목소리의 내용은 기본 감각으로 알 수 없으며, 추후 perception.hearing 특성이 확장될 수 있다.
11. 제공된 행동에 없는 인물·물건·소리·반응을 만들지 않는다. 단, 입력에 이미 포함된 객관적인 소리(부스럭거림, 충돌음 등)는 관찰 가능한 범위에서 묘사할 수 있다.
12. 관찰자가 볼 수 없는 세부 행동을 '눈치챘다', '알아차렸다', '의도를 파악했다'고 쓰지 않는다. 추후 perception.vision 등 별도 감각 특성 없이는 숨은 의미를 해석하지 않는다.
13. 표제, 목록, 괄호 설명, 내부 추론을 쓰지 않는다.`;

function compact(value, max = 700) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

export function extractQuotedSpeech(raw) {
  const text = compact(raw);
  for (const pattern of [/“([^”]{1,240})”/, /"([^"]{1,240})"/, /‘([^’]{1,240})’/, /'([^']{1,240})'/]) {
    const match = text.match(pattern);
    if (match?.[1]) return compact(match[1], 240);
  }
  return "";
}

export function classifySpeechVisibility(raw) {
  const text = compact(raw);
  const quote = extractQuotedSpeech(text);
  const internal = /(마음속|머릿속|속으로\s*(?:생각|말)|생각(?:한|하|했|한다|하며)|떠올린|상상)/.test(text);
  const privateSpeech = /(혼잣말|중얼|웅얼|속삭|나지막|작은\s*목소리|입안에서|귓속말)/.test(text);
  const loudSpeech = /(소리\s*(?:를\s*)?(?:크게\s*)?(?:지르|지른|질러)|크게\s*소리(?:를)?\s*(?:지르|지른|질러)|소리치|외치|고함|고성|큰\s*소리|목청|고래고래|비명|호통|함성|부르짖|크게\s*(?:말|부르))/.test(text);
  const ordinarySpeech = /(말하|말해|말했|말을\s*(?:건네|걸|한다)|대답|질문|묻(?:는|는다|고|기)|부르(?:는|고|며)|발화|이야기)/.test(text);
  if (internal) return { mode: "INTERNAL", quote, volume: "NONE" };
  if (privateSpeech && !loudSpeech) return { mode: "PRIVATE", quote, volume: "LOW" };
  if (loudSpeech) return { mode: quote ? "PUBLIC_QUOTE" : "PUBLIC", quote, volume: "LOUD" };
  if (quote || ordinarySpeech) return { mode: quote ? "PUBLIC_QUOTE" : "PUBLIC", quote, volume: "NORMAL" };
  return { mode: "NONE", quote: "", volume: "NONE" };
}

export function classifyVisualVisibility(raw) {
  const text = compact(raw);
  if (/(주머니|포켓).*(?:속|안)|(?:속|안).*?(?:주머니|포켓)/.test(text)) return { mode: "OCCLUDED", kind: "POCKET" };
  if (/(가방|배낭|파우치).*(?:속|안)|(?:속|안).*?(?:가방|배낭|파우치)/.test(text)) return { mode: "OCCLUDED", kind: "BAG" };
  if (/(책상|탁자|테이블).*(?:아래|밑)|(?:아래|밑).*?(?:책상|탁자|테이블)/.test(text)) return { mode: "OCCLUDED", kind: "UNDER_TABLE" };
  if (/(등\s*뒤|몸\s*뒤|뒤로\s*숨|등에\s*가려|몸에\s*가려)/.test(text)) return { mode: "OCCLUDED", kind: "BEHIND_BODY" };
  if (/(소매|옷|재킷|자켓|코트).*(?:속|안쪽)|(?:속|안쪽).*?(?:소매|옷|재킷|자켓|코트)/.test(text)) return { mode: "OCCLUDED", kind: "CLOTHING" };
  if (/(시야\s*밖|보이지\s*않(?:는|게)|가려진\s*(?:곳|채)|사각지대|완전히\s*가린)/.test(text)) return { mode: "OCCLUDED", kind: "GENERIC" };
  return { mode: "VISIBLE", kind: "VISIBLE" };
}

function redactDirectSpeech(text, mode) {
  const replacement = mode === "PRIVATE" ? "‘내용을 알아들을 수 없는 작은 말’" : mode === "INTERNAL" ? "‘겉으로 드러나지 않는 내부 내용’" : "‘직접 발화’";
  return compact(text).replace(/“[^”]{1,240}”|"[^"]{1,240}"|‘[^’]{1,240}’|'[^']{1,240}'/g, replacement);
}

function occludedActionText(actorName, kind) {
  if (kind === "POCKET") return `${actorName}가 주머니에 손을 넣고 안쪽에서 손을 움직인다.`;
  if (kind === "BAG") return `${actorName}가 가방 안쪽으로 손을 넣고 보이지 않는 곳에서 손을 움직인다.`;
  if (kind === "UNDER_TABLE") return `${actorName}가 한 손을 책상 아래로 내리고 보이지 않는 곳에서 손을 움직인다.`;
  if (kind === "BEHIND_BODY") return `${actorName}가 한 손을 등 뒤로 가져가 몸에 가린 채 손을 움직인다.`;
  if (kind === "CLOTHING") return `${actorName}가 옷 안쪽으로 손을 넣고 가려진 곳에서 손을 움직인다.`;
  return `${actorName}가 몸이나 주변 물체에 가려진 곳으로 손을 가져가 보이지 않는 곳에서 움직인다.`;
}

function stripFallbackQuotes(value) {
  return compact(value, 900).replace(/\s*[“"][^”"]+[”"]\s*/g, " ").replace(/\s*‘[^’]+’\s*/g, " ").replace(/\s+/g, " ").trim();
}

function safeFallback(bodyFallback, actorName, speech, visual) {
  if (visual.mode === "OCCLUDED") return occludedActionText(actorName, visual.kind);
  if (speech.mode === "INTERNAL") return `${actorName}에게서 겉으로 드러나는 뚜렷한 발화는 들리지 않는다.`;
  const fallback = stripFallbackQuotes(bodyFallback);
  if (fallback) return fallback;
  if (speech.mode === "PRIVATE") return `${actorName}가 작은 목소리로 중얼거리지만 내용은 알아듣기 어렵다.`;
  if (speech.mode === "PUBLIC" || speech.mode === "PUBLIC_QUOTE") return `${actorName}가 주변에서 알아들을 수 있는 목소리로 말을 한다.`;
  return `${actorName}가 손과 몸을 움직이는 모습이 보인다.`;
}

export function sanitizeObservationPayload(body) {
  const actionText = compact(body?.actionText, 700);
  const actorName = compact(body?.actorName, 80) || "다른 조사자";
  const speech = classifySpeechVisibility(actionText);
  const visual = classifyVisualVisibility(actionText);
  const observableAction = visual.mode === "OCCLUDED" ? occludedActionText(actorName, visual.kind) : actionText;
  return {
    actorName,
    action: redactDirectSpeech(observableAction, speech.mode),
    speechMode: speech.mode,
    speechVolume: speech.volume,
    audibleQuote: speech.mode === "PUBLIC_QUOTE" ? speech.quote : "",
    visualMode: visual.mode,
    visualKind: visual.kind,
    fallback: safeFallback(body?.fallback, actorName, speech, visual),
  };
}

function stripInventedQuotes(text) {
  return compact(text, 700).replace(/\s*[“"][^”"]+[”"]\s*/g, " ").replace(/\s*‘[^’]+’\s*/g, " ").replace(/\s+/g, " ").trim();
}

export function composeObservation(observation, payload) {
  const base = stripInventedQuotes(observation) || payload.fallback;
  if (payload.speechMode !== "PUBLIC_QUOTE" || !payload.audibleQuote) return compact(base, 900);
  const first = /[.!?。]$/.test(base) ? base : `${base}.`;
  const manner = payload.speechVolume === "LOUD" ? "큰 목소리로" : "또렷한 목소리로";
  return compact(`${first} ${payload.actorName}의 ${manner} "${payload.audibleQuote}"라는 말이 들린다.`, 1000);
}

function outputText(payload) {
  if (typeof payload?.output_text === "string") return payload.output_text;
  for (const item of payload?.output || []) for (const content of item?.content || []) {
    if (content?.type === "output_text" && typeof content.text === "string") return content.text;
  }
  return "";
}

async function readBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY) throw Object.assign(new Error("REQUEST_TOO_LARGE"), { statusCode: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw Object.assign(new Error("INVALID_JSON"), { statusCode: 400 }); }
}

function sameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === request.headers.host; }
  catch { return false; }
}

function send(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

export async function generateObservation(body, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (!env.OPENAI_API_KEY) throw Object.assign(new Error("AI_NOT_CONFIGURED"), { statusCode: 503 });
  const payload = sanitizeObservationPayload(body);
  if (!payload.action || !payload.fallback) throw Object.assign(new Error("OBSERVATION_CONTEXT_REQUIRED"), { statusCode: 400 });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const baseUrl = String(env.OPENAI_API_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
    const apiResponse = await fetchImpl(`${baseUrl}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || MODEL,
        input: [{ role: "developer", content: PROMPT }, { role: "user", content: JSON.stringify(payload) }],
        text: { format: { type: "json_schema", name: "field_observation", strict: true, schema: SCHEMA } },
        max_output_tokens: 260,
      }),
      signal: controller.signal,
    });
    const responsePayload = await apiResponse.json().catch(() => ({}));
    if (!apiResponse.ok) throw Object.assign(new Error("AI_SERVICE_UNAVAILABLE"), { statusCode: 502 });
    let parsed;
    try { parsed = JSON.parse(outputText(responsePayload)); }
    catch { throw Object.assign(new Error("AI_INVALID_OUTPUT"), { statusCode: 502 }); }
    const observation = composeObservation(parsed?.observation, payload);
    if (!observation) throw Object.assign(new Error("AI_EMPTY_OUTPUT"), { statusCode: 502 });
    return { observation, speechMode: payload.speechMode, visualMode: payload.visualMode };
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(request, response) {
  try {
    if (request.method !== "POST") return send(response, 405, { error: "METHOD_NOT_ALLOWED" });
    if (!sameOrigin(request)) return send(response, 403, { error: "ORIGIN_NOT_ALLOWED" });
    return send(response, 200, await generateObservation(await readBody(request)));
  } catch (error) {
    const status = Number(error?.statusCode) || (error?.name === "AbortError" ? 504 : 500);
    return send(response, status, { error: status >= 500 ? "AI_SERVICE_UNAVAILABLE" : compact(error?.message, 80), fallback: "local" });
  }
}
