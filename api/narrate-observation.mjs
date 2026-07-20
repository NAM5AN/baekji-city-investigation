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
같은 현장에 있는 다른 캐릭터가 실제로 보고 들을 수 있는 외부 행동만 1~2문장으로 서술한다.

규칙:
1. 속마음, 목적, 의도, 성공·실패, 조사 결과를 추측하지 않는다.
2. 입력 행동을 그대로 복사하지 말고 자연스러운 관찰자 시점으로 바꾼다.
3. 제공된 actorName을 사용한다.
4. speechMode가 PRIVATE이면 혼잣말·중얼거림의 내용은 절대 쓰지 않고, 작게 중얼거리는 모습만 묘사한다.
5. speechMode가 PUBLIC_QUOTE이면 직접 발화 내용은 서버가 별도로 붙이므로 observation에는 인용문을 쓰지 않고, 큰 소리로 외치는 외부 행동만 묘사한다.
6. speechMode가 PUBLIC이면 큰 소리의 행동은 묘사하되 새로운 발화 내용을 창작하지 않는다.
7. 제공된 행동에 없는 인물·물건·소리·반응을 만들지 않는다.
8. 표제, 목록, 괄호 설명, 내부 추론을 쓰지 않는다.`;

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
  const privateSpeech = /(혼잣말|중얼|웅얼|속삭|나지막|작은\s*목소리|입안에서)/.test(text);
  const publicSpeech = /(소리\s*(?:를\s*)?(?:크게\s*)?(?:지르|지른|질러)|크게\s*소리(?:를)?\s*(?:지르|지른|질러)|소리치|외치|고함|고성|큰\s*소리|목청|고래고래|비명|호통|함성|크게\s*(?:말|부르))/.test(text);
  if (privateSpeech && !publicSpeech) return { mode: "PRIVATE", quote };
  if (publicSpeech) return { mode: quote ? "PUBLIC_QUOTE" : "PUBLIC", quote };
  return { mode: "NONE", quote };
}

function redactDirectSpeech(text, mode) {
  const replacement = mode === "PRIVATE" ? "‘내용을 알아들을 수 없는 작은 말’" : "‘직접 발화’";
  return compact(text).replace(/“[^”]{1,240}”|"[^"]{1,240}"|‘[^’]{1,240}’|'[^']{1,240}'/g, replacement);
}

export function sanitizeObservationPayload(body) {
  const actionText = compact(body?.actionText, 700);
  const actorName = compact(body?.actorName, 80) || "다른 조사자";
  const speech = classifySpeechVisibility(actionText);
  return {
    actorName,
    action: redactDirectSpeech(actionText, speech.mode),
    speechMode: speech.mode,
    audibleQuote: speech.mode === "PUBLIC_QUOTE" ? speech.quote : "",
    fallback: compact(body?.fallback, 700),
  };
}

function stripInventedQuotes(text) {
  return compact(text, 700).replace(/\s*[“"][^”"]+[”"]\s*/g, " ").replace(/\s*‘[^’]+’\s*/g, " ").replace(/\s+/g, " ").trim();
}

export function composeObservation(observation, payload) {
  const base = stripInventedQuotes(observation) || payload.fallback;
  if (payload.speechMode !== "PUBLIC_QUOTE" || !payload.audibleQuote) return compact(base, 900);
  const first = /[.!?。]$/.test(base) ? base : `${base}.`;
  return compact(`${first} ${payload.actorName}의 목소리로 "${payload.audibleQuote}"라는 말이 또렷하게 들린다.`, 1000);
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

export default async function handler(request, response) {
  try {
    if (request.method !== "POST") return send(response, 405, { error: "METHOD_NOT_ALLOWED" });
    if (!sameOrigin(request)) return send(response, 403, { error: "ORIGIN_NOT_ALLOWED" });
    if (!process.env.OPENAI_API_KEY) return send(response, 503, { error: "AI_NOT_CONFIGURED", fallback: "local" });
    const payload = sanitizeObservationPayload(await readBody(request));
    if (!payload.action || !payload.fallback) return send(response, 400, { error: "OBSERVATION_CONTEXT_REQUIRED" });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const baseUrl = String(process.env.OPENAI_API_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
      const apiResponse = await fetch(`${baseUrl}/responses`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || MODEL,
          input: [{ role: "developer", content: PROMPT }, { role: "user", content: JSON.stringify(payload) }],
          text: { format: { type: "json_schema", name: "field_observation", strict: true, schema: SCHEMA } },
          max_output_tokens: 260,
        }),
        signal: controller.signal,
      });
      const responsePayload = await apiResponse.json().catch(() => ({}));
      if (!apiResponse.ok) return send(response, 502, { error: "AI_SERVICE_UNAVAILABLE", fallback: "local" });
      let parsed;
      try { parsed = JSON.parse(outputText(responsePayload)); }
      catch { return send(response, 502, { error: "AI_INVALID_OUTPUT", fallback: "local" }); }
      const observation = composeObservation(parsed?.observation, payload);
      if (!observation) return send(response, 502, { error: "AI_EMPTY_OUTPUT", fallback: "local" });
      return send(response, 200, { observation, speechMode: payload.speechMode });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    const status = Number(error?.statusCode) || (error?.name === "AbortError" ? 504 : 500);
    return send(response, status, { error: status >= 500 ? "AI_SERVICE_UNAVAILABLE" : compact(error?.message, 80), fallback: "local" });
  }
}
