import assert from "node:assert/strict";
import http from "node:http";
import fs from "node:fs";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createAppServer, resolveRuntimeEnvironment } from "../server.mjs";

const registryCalls = [];
const registryEnvironment = resolveRuntimeEnvironment({}, {
  platform: "win32",
  execFileSyncImpl(command, args) {
    registryCalls.push({ command, args });
    const name = args.at(-1);
    if (name === "OPENAI_API_KEY") return "HKEY_CURRENT_USER\\Environment\r\n    OPENAI_API_KEY    REG_SZ    registry-test-key\r\n";
    if (name === "OPENAI_MODEL") return "HKEY_CURRENT_USER\\Environment\r\n    OPENAI_MODEL    REG_SZ    registry-test-model\r\n";
    throw new Error("NOT_FOUND");
  },
});
assert.equal(registryEnvironment.OPENAI_API_KEY, "registry-test-key");
assert.equal(registryEnvironment.OPENAI_MODEL, "registry-test-model");
assert.equal(registryCalls.length, 2);
assert.equal(registryCalls[0].command, "reg.exe");
assert.deepEqual(registryCalls[0].args, ["query", "HKCU\\Environment", "/v", "OPENAI_API_KEY"]);
let unexpectedRegistryRead = false;
const existingEnvironment = resolveRuntimeEnvironment({ OPENAI_API_KEY: "current-process-key" }, {
  platform: "win32",
  execFileSyncImpl() { unexpectedRegistryRead = true; throw new Error("SHOULD_NOT_READ_KEY"); },
});
assert.equal(existingEnvironment.OPENAI_API_KEY, "current-process-key");
assert.equal(unexpectedRegistryRead, true, "없는 OPENAI_MODEL만 레지스트리에서 확인합니다.");

async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}

async function close(server) {
  server.close();
  await once(server, "close");
}

let capturedRequest = null;
const mockOpenAI = http.createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  capturedRequest = {
    url: request.url,
    authorization: request.headers.authorization,
    body: JSON.parse(Buffer.concat(chunks).toString("utf8")),
  };
  const userContent = capturedRequest.body.input.find((item) => item.role === "user")?.content || "{}";
  const userPayload = JSON.parse(userContent);
  if (capturedRequest.body.text?.format?.name === "action_narration") {
    const narration = userPayload.interpretation?.intent === "LISTEN"
      ? "테스트 캐릭터 A는 방송 잡음에 귀를 기울인다. 치직거리는 숨 사이로 몇 음절이 겹쳐 들리지만 온전한 문장은 잡히지 않는다."
      : "테스트 캐릭터 A는 눈앞의 상황에 맞춰 몸을 움직인다. 확정된 결과만 짧게 남는다.";
    response.writeHead(200, { "Content-Type": "application/json" });
    return response.end(JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify({ narration }) }] }] }));
  }
  const submittedText = userPayload.text || "";
  const analysis = {
    actionSubject: submittedText.includes("내 피부") ? "SELF" : "ENVIRONMENT",
    sensoryMode: submittedText.includes("듣") ? "LISTEN" : "MOVE",
    targetText: submittedText.includes("듣") ? "방송 잡음" : "동부 출입구",
    hazardRelevance: userPayload.context?.phase === "hazard" ? (submittedText.includes("피해") ? "RELEVANT" : "IRRELEVANT") : "NONE",
    executable: submittedText !== "테스트",
  };
  const inferredIntent = submittedText.includes("듣") ? "LISTEN"
    : submittedText.includes("내 피부") ? "CHECK_SELF"
      : userPayload.context?.phase === "hazard" && !submittedText.includes("피해") ? "OTHER"
        : userPayload.context?.phase === "hazard" ? "HAZARD_RESPONSE"
          : "MOVE";
  const interpretation = submittedText.includes("손수건") ? {
    intent: "MOVE",
    targetId: "E_R002",
    normalizedAction: "손잡이를 손수건으로 닦은 뒤 동부 출입구로 이동한다",
    confidence: 0.99,
    usedItemName: "손수건",
    usedItemId: "",
    itemUseFit: "MISSING",
    itemUseReason: "손수건이 현재 소지품에 없다",
    ...analysis,
  } : {
    intent: inferredIntent,
    targetId: inferredIntent === "MOVE" ? "E_R002" : "",
    normalizedAction: inferredIntent === "MOVE" ? "동부 출입구로 이동한다" : submittedText,
    confidence: 0.99,
    usedItemName: "",
    usedItemId: "",
    itemUseFit: "NONE",
    itemUseReason: "",
    ...analysis,
  };
  const result = {
    output: [{
      type: "message",
      content: [{
        type: "output_text",
        text: JSON.stringify(interpretation),
      }],
    }],
  };
  response.writeHead(200, { "Content-Type": "application/json" });
  response.end(JSON.stringify(result));
});

const mockBase = await listen(mockOpenAI);
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const aiServer = createAppServer({
  rootDir: projectRoot,
  env: {
    OPENAI_API_KEY: "test-key-never-return",
    OPENAI_MODEL: "test-model",
    OPENAI_API_BASE_URL: `${mockBase}/v1`,
  },
});
const aiBase = await listen(aiServer);

try {
  const statusResponse = await fetch(`${aiBase}/api/ai/status`);
  assert.equal(statusResponse.status, 200);
  const status = await statusResponse.json();
  assert.deepEqual(status, { available: true, mode: "ai", model: "test-model" });
  assert.ok(!JSON.stringify(status).includes("test-key"));

  const interpretationResponse = await fetch(`${aiBase}/api/interpret-action`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": aiBase,
    },
    body: JSON.stringify({
      text: "동부 출입구로 감",
      context: {
        phase: "scene",
        currentLocation: "환승광장",
        visibleSituation: "동쪽과 서쪽으로 통로가 갈라진다.",
        routes: [
          { id: "E_R002", name: "동부 출입구" },
          { id: "E_R003", name: "서부 출입구" },
        ],
        details: [],
        objects: [],
        inventory: [
          { id: "ITEM_114", name: "휴지", state: "CLEAN", quantity: 1, tags: ["ABSORBENT_MATERIAL"], primary: "ABSORBENT_MATERIAL", secondary: "표면을 닦을 수 있다" },
        ],
      },
    }),
  });
  assert.equal(interpretationResponse.status, 200);
  const interpretation = await interpretationResponse.json();
  assert.deepEqual(interpretation, {
    intent: "MOVE",
    targetId: "E_R002",
    normalizedAction: "동부 출입구로 이동한다",
    confidence: 0.99,
    usedItemName: "",
    usedItemId: "",
    itemUseFit: "NONE",
    itemUseReason: "",
    actionSubject: "ENVIRONMENT",
    sensoryMode: "MOVE",
    targetText: "동부 출입구",
    hazardRelevance: "NONE",
    executable: true,
  });
  assert.equal(capturedRequest.url, "/v1/responses");
  assert.equal(capturedRequest.authorization, "Bearer test-key-never-return");
  assert.equal(capturedRequest.body.model, "test-model");
  assert.equal(capturedRequest.body.text.format.type, "json_schema");
  assert.equal(capturedRequest.body.text.format.strict, true);
  assert.ok(JSON.stringify(capturedRequest.body.input).includes("구어체"));
  assert.ok(JSON.stringify(capturedRequest.body.input).includes("E_R002"));
  assert.ok(JSON.stringify(capturedRequest.body.input).includes("ITEM_114"));
  assert.ok(!JSON.stringify(interpretation).includes("test-key"));

  const missingItemResponse = await fetch(`${aiBase}/api/interpret-action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": aiBase },
    body: JSON.stringify({
      text: "손잡이를 손수건으로 닦고 동부 출입구로 이동한다",
      context: {
        phase: "scene",
        currentLocation: "환승광장",
        visibleSituation: "동부 출입구로 이어지는 통로가 있다.",
        routes: [{ id: "E_R002", name: "동부 출입구" }],
        details: [], objects: [], inventory: [],
      },
    }),
  });
  assert.equal(missingItemResponse.status, 200);
  const missingItem = await missingItemResponse.json();
  assert.equal(missingItem.usedItemName, "손수건");
  assert.equal(missingItem.usedItemId, "");
  assert.equal(missingItem.itemUseFit, "MISSING");
  assert.match(missingItem.itemUseReason, /소지품/);

  const listenResponse = await fetch(`${aiBase}/api/interpret-action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": aiBase },
    body: JSON.stringify({
      text: "방송 잡음을 듣는다",
      context: { phase: "hazard", currentLocation: "동부 출입구", visibleSituation: "흰 잔상이 통로를 가로지른다.", routes: [], details: [], objects: [], inventory: [], characterStatus: { contamination: 3, symptom: "TRACE" } },
    }),
  });
  assert.equal(listenResponse.status, 200);
  const listen = await listenResponse.json();
  assert.equal(listen.intent, "LISTEN");
  assert.equal(listen.sensoryMode, "LISTEN");
  assert.equal(listen.hazardRelevance, "IRRELEVANT");

  const narrationResponse = await fetch(`${aiBase}/api/narrate-action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": aiBase },
    body: JSON.stringify({
      text: "방송 잡음을 듣는다",
      interpretation: listen,
      event: { kind: "LISTEN", outcome: "NO_PROGRESS", hazardId: "HZ_TEMP_04", fallback: "테스트 캐릭터 A는 방송 잡음에 귀를 기울인다." },
      context: { phase: "hazard", currentLocation: "동부 출입구", visibleSituation: "흰 잔상이 통로를 가로지른다.", routes: [], details: [], objects: [], inventory: [], characterStatus: { contamination: 3, symptom: "TRACE" } },
    }),
  });
  assert.equal(narrationResponse.status, 200);
  const narration = await narrationResponse.json();
  assert.match(narration.narration, /귀를 기울/);
  assert.doesNotMatch(narration.narration, /가까이서 보/);
  assert.equal(capturedRequest.body.text.format.name, "action_narration");
  assert.ok(JSON.stringify(capturedRequest.body.input).includes("감각 양식"));

  const indexResponse = await fetch(`${aiBase}/`);
  assert.equal(indexResponse.status, 200);
  assert.match(indexResponse.headers.get("content-type"), /text\/html/);
  assert.match(await indexResponse.text(), /app\.js\?v=0\.3\.18/);
} finally {
  await close(aiServer);
  await close(mockOpenAI);
}

const localServer = createAppServer({ rootDir: projectRoot, env: {} });
const localBase = await listen(localServer);
try {
  const status = await (await fetch(`${localBase}/api/ai/status`)).json();
  assert.deepEqual(status, { available: false, mode: "local", model: "" });
  const response = await fetch(`${localBase}/api/interpret-action`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Origin": localBase },
    body: JSON.stringify({ text: "이동한당", context: {} }),
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "AI_NOT_CONFIGURED", fallback: "local" });
} finally {
  await close(localServer);
}

const browserSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const runBatch = fs.readFileSync(new URL("../run.bat", import.meta.url), "utf8");
assert.ok(!browserSource.includes("OPENAI_API_KEY"), "브라우저 번들에 API 키 환경 변수 이름도 포함하지 않습니다.");
assert.ok(browserSource.includes("/api/interpret-action"));
assert.ok(browserSource.includes("/api/narrate-action"));
assert.ok(browserSource.includes("localActionInterpretation"));
assert.ok(browserSource.includes("requestAIInterpretation(session, text, localInterpretation)"));
assert.ok(browserSource.includes('return interpretation.intent !== "MAP"'));
assert.ok(!/powershell/i.test(runBatch), "run.bat에는 즉시 종료 원인이 된 중첩 PowerShell 구문이 없어야 합니다.");
assert.ok(runBatch.includes("goto node_missing"));
assert.ok(runBatch.includes(":hold"));
assert.ok(runBatch.includes("pause"));
assert.ok(runBatch.includes("Exit code"));

console.log("PASS: v0.3.18 AI 행동 의미·위험 관련성·소지품·자연어 결과 생성·로컬 폴백 계약");
