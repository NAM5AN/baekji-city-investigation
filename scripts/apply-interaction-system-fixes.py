from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def read(path):
    return (ROOT / path).read_text(encoding="utf-8")

def write(path, text):
    (ROOT / path).write_text(text, encoding="utf-8")

def replace_once(path, old, new):
    text = read(path)
    if old not in text:
        raise SystemExit(f"missing replacement target in {path}: {old[:80]!r}")
    text2 = text.replace(old, new, 1)
    write(path, text2)

def regex_once(path, pattern, replacement, flags=0):
    text = read(path)
    text2, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"regex replacement count {count} in {path}: {pattern[:80]!r}")
    write(path, text2)

# 1) Same-field cross-party observations must use the real character name.
replace_once(
    "action-log-sync.js",
    '  function observationalActionText(actorId, rawText) {\n    const actorName = USER_LABELS[actorId] || "다른 조사자";',
    '''  function actorNameForId(actorId) {\n    const key = String(actorId || "");\n    const registered = window.__BAEKJI_TESTER_REGISTRY_GUARD__?.values?.().find((entry) => String(entry?.id || "") === key);\n    if (registered?.name || registered?.loginId) return String(registered.name || registered.loginId).trim();\n    if (typeof sessionStorage !== "undefined") {\n      try {\n        const profile = JSON.parse(sessionStorage.getItem("baekji_city_tester_session_profile_v1") || "null");\n        if (String(profile?.id || "") === key && (profile?.name || profile?.loginId)) return String(profile.name || profile.loginId).trim();\n      } catch { /* ignore */ }\n    }\n    return USER_LABELS[key] || "다른 조사자";\n  }\n\n  function observationalActionText(actorId, rawText) {\n    const actorName = actorNameForId(actorId);'''
)
replace_once(
    "action-log-sync.js",
    '    observationalActionText,\n    repairObservedActionTexts,',
    '    observationalActionText,\n    actorNameForId,\n    repairObservedActionTexts,'
)

replace_once(
    "observation-ai-sync.js",
    '  const NAMES = { test_a: "테스트 캐릭터 A", test_b: "테스트 캐릭터 B", test_c: "테스트 캐릭터 C" };\n',
    '''  const NAMES = { test_a: "테스트 캐릭터 A", test_b: "테스트 캐릭터 B", test_c: "테스트 캐릭터 C" };\n\n  function actorNameForId(actorId) {\n    const key = String(actorId || "");\n    const registered = window.__BAEKJI_TESTER_REGISTRY_GUARD__?.values?.().find((entry) => String(entry?.id || "") === key);\n    if (registered?.name || registered?.loginId) return String(registered.name || registered.loginId).trim();\n    if (typeof sessionStorage !== "undefined") {\n      try {\n        const profile = JSON.parse(sessionStorage.getItem("baekji_city_tester_session_profile_v1") || "null");\n        if (String(profile?.id || "") === key && (profile?.name || profile?.loginId)) return String(profile.name || profile.loginId).trim();\n      } catch { /* ignore */ }\n    }\n    return NAMES[key] || "다른 조사자";\n  }\n'''
)
replace_once(
    "observation-ai-sync.js",
    '      jobs.push({ actionId, actorName: NAMES[source.actorId] || "다른 조사자", actionText: clean(source.text), fallback, speechMode: speech.mode, quotedSpeech: speech.quote });',
    '      jobs.push({ actionId, actorName: actorNameForId(source.actorId), actionText: clean(source.text), fallback, speechMode: speech.mode, quotedSpeech: speech.quote });'
)
replace_once(
    "observation-ai-sync.js",
    '  const API = Object.freeze({ extractQuote, speechVisibility, collectJobs });',
    '  const API = Object.freeze({ extractQuote, speechVisibility, actorNameForId, collectJobs });'
)

# Repair both the visible field-action and its canonical AI source so the v0.4.0
# final-observation canonicalizer cannot restore "다른 조사자" afterward.
regex_once(
    "character-interaction-result-visibility-fix.js",
    r'  function repairObservedActorText\(entry\) \{.*?\n  \}\n\n  function repairMisroutedSlashAction',
    '''  function topicParticle(name) {\n    const chars = Array.from(String(name || "").trim()).reverse();\n    for (const char of chars) {\n      const code = char.charCodeAt(0);\n      if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 ? "은" : "는";\n      if (/\\d/.test(char)) return new Set(["0", "1", "3", "6", "7", "8"]).has(char) ? "은" : "는";\n      if (/[A-Za-z]/.test(char)) return new Set(["F", "L", "M", "N", "R", "S", "X"]).has(char.toUpperCase()) ? "은" : "는";\n    }\n    return "는";\n  }\n\n  function replaceGenericActorLabel(text, actorId) {\n    const name = testerName(actorId);\n    if (!name) return String(text || "");\n    return String(text || "")\n      .replace(/다른 조사자(?:가|이)/g, `${name}${subjectParticle(name)}`)\n      .replace(/다른 조사자(?:는|은)/g, `${name}${topicParticle(name)}`)\n      .replace(/다른 조사자/g, name);\n  }\n\n  function repairObservedSourceText(entry) {\n    if (entry?.type !== "action-input" || !entry.actorId || !entry.fieldObservationAiText) return false;\n    const next = replaceGenericActorLabel(entry.fieldObservationAiText, entry.actorId);\n    if (next === entry.fieldObservationAiText) return false;\n    entry.fieldObservationAiText = next;\n    entry.fieldObservationActorName = testerName(entry.actorId) || entry.fieldObservationActorName || "";\n    return true;\n  }\n\n  function repairObservedActorText(entry, source = null) {\n    if (entry?.type !== "field-action" || !entry.observedActorId) return false;\n    const actorId = source?.actorId || entry.observedActorId;\n    const sourceFinal = source?.fieldObservationAiStatus === "final" ? String(source?.fieldObservationAiText || "") : "";\n    const base = sourceFinal || String(entry.text || "");\n    const next = replaceGenericActorLabel(base, actorId);\n    const name = testerName(actorId);\n    let changed = false;\n    if (next && next !== entry.text) { entry.text = next; changed = true; }\n    if (name && entry.observedActorName !== name) { entry.observedActorName = name; changed = true; }\n    return changed;\n  }\n\n  function repairMisroutedSlashAction''',
    flags=re.S
)
regex_once(
    "character-interaction-result-visibility-fix.js",
    r'    let changed = false;\n    Object\.values\(state\.sessions\)\.forEach\(\(session\) => \{\n      \(session\?\.logs \|\| \[\]\)\.forEach\(\(entry\) => \{\n        if \(repairMisroutedSlashAction\(entry\)\) changed = true;\n        if \(normalizeSystemNarration\(entry\)\) changed = true;\n        if \(repairObservedActorText\(entry\)\) changed = true;\n      \}\);\n    \}\);',
    '''    let changed = false;\n    const actions = new Map();\n    Object.values(state.sessions).forEach((session) => {\n      (session?.logs || []).forEach((entry) => {\n        if (entry?.id && entry.type === "action-input") actions.set(entry.id, entry);\n        if (repairObservedSourceText(entry)) changed = true;\n      });\n    });\n    Object.values(state.sessions).forEach((session) => {\n      (session?.logs || []).forEach((entry) => {\n        if (repairMisroutedSlashAction(entry)) changed = true;\n        if (normalizeSystemNarration(entry)) changed = true;\n        if (repairObservedActorText(entry, actions.get(entry?.sourceActionLogId))) changed = true;\n      });\n    });'''
)
replace_once(
    "character-interaction-result-visibility-fix.js",
    '    testerName,\n    repairMisroutedSlashAction,',
    '    testerName,\n    replaceGenericActorLabel,\n    repairObservedSourceText,\n    repairObservedActorText,\n    repairMisroutedSlashAction,'
)

# 2) Never author another player character's voluntary reaction/personality.
new_fallback = r'''  function fallbackDecision(action, actorName, targetName, seed = "") {
    const clean = String(action || "").trim();
    const roll = hashNumber(`${seed}:${clean}`) % 100;
    const actorSubject = withParticle(actorName, "이/가");
    const targetObject = withParticle(targetName, "을/를");
    const push = /(밀치|밀어|떠밀|몸으로\s*밀|어깨로\s*밀)/.test(clean);
    const strike = /(때리|치고|가격|주먹|발로\s*차|걷어차)/.test(clean);
    const pull = /(잡아당|끌어당|당기|붙잡아\s*끌)/.test(clean);
    const grab = /(붙잡|움켜쥐|멱살|팔을?\s*잡|손목을?\s*잡)/.test(clean);
    const support = /(부축|도와|받쳐|일으켜|손을\s*내밀|잡아주|감싸)/.test(clean);
    const block = /(앞을\s*막|길을\s*막|가로막|막아선)/.test(clean);
    const touch = /(만지|쓰다듬|토닥|손을\s*얹|안아|껴안)/.test(clean);
    const gesture = /(손을\s*흔들|손짓|고개를\s*끄덕|인사|가리킨)/.test(clean);
    const mock = /(비웃|조롱|놀리|비꼬|빈정|야유|도발|모욕)/.test(clean);

    if (push) {
      if (roll < 28) return { outcome: "EFFECTIVE", targetEffect: "FELL", narration: `${actorSubject} ${targetObject} 힘껏 밀어낸다. 힘이 그대로 전달되어 ${targetName}의 몸이 뒤로 밀리며 바닥에 넘어간다.` };
      if (roll < 72) return { outcome: "PARTIAL", targetEffect: "MOVED", narration: `${actorSubject} ${targetObject} 밀어낸다. 힘이 닿은 만큼 ${targetName}의 몸이 한두 걸음 뒤로 밀리지만 넘어질 정도의 변화는 생기지 않는다.` };
      return { outcome: "RESISTED", targetEffect: "RESISTED", narration: `${actorSubject} ${targetObject} 밀어내지만 뚜렷한 위치 변화는 일어나지 않는다.` };
    }
    if (strike) {
      if (roll < 55) return { outcome: "EFFECTIVE", targetEffect: "CONTACT", narration: `${actorSubject} ${targetObject} 향해 빠르게 타격을 가한다. 타격이 닿으며 충격이 직접 전달된다.` };
      return { outcome: "PARTIAL", targetEffect: "CONTACT", narration: `${actorSubject} ${targetObject} 향해 타격을 가한다. 동작은 스치듯 닿고 큰 위치 변화는 생기지 않는다.` };
    }
    if (pull) {
      if (roll < 65) return { outcome: "EFFECTIVE", targetEffect: "MOVED", narration: `${actorSubject} ${targetObject} 붙잡아 자신의 쪽으로 잡아당긴다. 당기는 힘으로 ${targetName}의 몸이 한 걸음 가까워진다.` };
      return { outcome: "RESISTED", targetEffect: "RESISTED", narration: `${actorSubject} ${targetObject} 잡아당기지만 뚜렷한 위치 변화는 일어나지 않는다.` };
    }
    if (grab) return { outcome: "EFFECTIVE", targetEffect: "CONTACT", narration: `${actorSubject} ${targetObject} 향해 손을 뻗어 붙잡는다. 직접 접촉한 상태가 된다.` };
    if (support) return { outcome: "EFFECTIVE", targetEffect: "SUPPORTED", narration: `${actorSubject} ${targetObject} 받쳐 주며 몸을 지지한다.` };
    if (block) return { outcome: "EFFECTIVE", targetEffect: "BLOCKED", narration: `${actorSubject} ${targetName} 앞을 가로막고 선다. ${targetName}의 진행 방향이 물리적으로 가로막힌다.` };
    if (touch) return { outcome: "NEUTRAL", targetEffect: "CONTACT", narration: `${actorSubject} ${targetObject} 향해 손을 뻗어 직접 접촉한다.` };
    if (gesture) return { outcome: "NEUTRAL", targetEffect: "NONE", narration: `${actorSubject} ${targetName} 쪽을 향해 몸짓으로 신호를 보낸다.` };
    if (mock) return { outcome: "NEUTRAL", targetEffect: "NONE", narration: `${actorSubject} ${targetObject} 향해 노골적으로 비웃는다. 분명한 조롱이다.` };
    return { outcome: "NEUTRAL", targetEffect: "NONE", narration: `${actorSubject} ${targetName}을 향해 선언한 행동을 그대로 이어간다.` };
  }

'''
regex_once(
    "character-interaction-ai.js",
    r'  function fallbackDecision\(action, actorName, targetName, seed = ""\) \{.*?\n  \}\n\n  function locationName',
    new_fallback + '  function locationName',
    flags=re.S
)
agency_helper = r'''  function stripTargetAgencyNarration(value, targetName) {
    const text = String(value || "").trim();
    const target = String(targetName || "").trim();
    if (!text || !target) return text;
    const escaped = escapeRegExp(target);
    const targetSubject = new RegExp(`(?:${escaped}|상대(?:\\s*캐릭터)?)(?:은|는|이|가|도)`);
    const voluntaryReaction = /(알아차리|눈치채|바라보|쳐다보|시선|표정|굳히|미소|웃(?:고|는다|으며)|울|당황|놀라|화내|분노|대답|말하|외치|소리치|고개를|끄덕|젓|움츠리|피하|회피|버티|저항|반격|협조|따라오|따라가|돌아서|다가오|다가가|반응)/;
    const sentences = text.match(/[^.!?。！？]+[.!?。！？]?/g) || [text];
    const kept = sentences.filter((sentence) => !(targetSubject.test(sentence) && voluntaryReaction.test(sentence)));
    return kept.join(" ").replace(/\\s+/g, " ").trim();
  }

'''
replace_once(
    "character-interaction-ai.js",
    '  function normalizeDecision(value, fallback, actorName, targetName) {',
    agency_helper + '  function normalizeDecision(value, fallback, actorName, targetName) {'
)
replace_once(
    "character-interaction-ai.js",
    '    let narration = String(decision.narration || fallback.narration || "").trim().slice(0, 1200);\n    narration = fixNameParticles(narration, [actorName, targetName]);',
    '    let narration = String(decision.narration || fallback.narration || "").trim().slice(0, 1200);\n    narration = stripTargetAgencyNarration(narration, targetName) || stripTargetAgencyNarration(fallback.narration, targetName);\n    narration = fixNameParticles(narration, [actorName, targetName]);'
)
replace_once(
    "character-interaction-ai.js",
    '    fixNameParticles,\n    fallbackDecision,',
    '    fixNameParticles,\n    stripTargetAgencyNarration,\n    fallbackDecision,'
)

new_prompt = '''const CHARACTER_INTERACTION_PROMPT = `너는 한국어 호러 조사 RPG의 인물 상호작용 판정자다.\n사용자가 같은 현장에 실제로 존재하는 다른 캐릭터에게 선언한 한 가지 행동의 즉각적인 결과를 판단한다.\n\n반드시 다음 원칙을 지켜라.\n1. 밀기, 당기기, 붙잡기, 때리기, 발로 차기, 앞을 막기, 부축하기, 손을 잡기, 안기, 토닥이기, 손짓하기, 물건을 보여주기, 비웃기, 조롱하기 등 인물 사이의 다양한 물리적·사회적 상호작용을 상황에 맞게 판단한다.\n2. actor가 실제로 한 행동과 그 행동 때문에 객관적으로 발생한 직접 결과만 서술한다.\n3. target 캐릭터의 성격, 의사, 감정, 생각, 인지 여부를 추정하거나 대신 결정하지 않는다.\n4. target의 표정, 시선, 대사, 놀람, 분노, 웃음, 고개 움직임, 회피, 버팀, 저항, 반격, 협조 등 자발적인 반응은 절대 생성하지 않는다. context에 target의 해당 행동이 이미 명시된 경우에만 인용할 수 있다.\n5. actor의 물리력 때문에 피할 수 없이 생긴 객관적인 결과(접촉, 몸이 밀림, 넘어짐 등)는 서술할 수 있지만, 그 뒤 target이 무엇을 느끼거나 어떻게 대응하는지는 쓰지 않는다.\n6. 사용자가 명시하지 않은 심각한 부상, 골절, 출혈, 기절, 사망, 새 소지품, 위치 이동, 오염 수치 변화는 창작하지 않는다.\n7. target의 대사를 임의로 만들지 않는다. actor의 행동에 실제 발화가 포함된 경우에만 그 발화를 그대로 활용할 수 있다.\n8. activeHazard가 있더라도 이 API는 인물 상호작용 자체만 판정한다. 이동 경로의 위험을 해결하거나 조사조 진행도를 임의로 전진시키지 않는다.\n9. outcome은 EFFECTIVE, PARTIAL, RESISTED, NEUTRAL 중 하나다. targetEffect는 가장 가까운 객관적 즉각 결과 하나만 고른다. 사회적 행동처럼 target의 자발적 반응을 정해야만 효과를 만들 수 있다면 NONE을 사용한다.\n10. narration은 1~3개의 자연스러운 한국어 문장으로 작성한다. 첫 문장부터 actor.name과 target.name을 실제 이름 그대로 써서 actor의 행동을 실행한다. 이후 문장은 직접적인 객관적 결과만 쓴다. 예: \"테스트B는 테스트C를 향해 노골적으로 비웃는다. 분명한 조롱이다.\" target이 그것을 알아차렸는지, 어떤 표정을 지었는지, 무엇을 말하거나 바라봤는지는 쓰지 않는다.\n11. \"판정\", \"성공\", \"실패\", \"시도\", \"가능\", \"불가능\", \"AI\", \"시스템\" 같은 운영 문구를 쓰지 않는다.\n12. 캐릭터 이름 뒤의 한국어 조사는 받침에 맞게 자연스럽게 쓴다. 특히 을/를, 이/가, 은/는, 과/와, 으로/로를 틀리지 않는다.\n13. context에 없는 새 인물이나 장소 반응을 창작하지 않는다.`;'''
regex_once(
    "api/index.mjs",
    r'const CHARACTER_INTERACTION_PROMPT = `.*?`;',
    new_prompt,
    flags=re.S
)
server_helper = r'''function stripTargetAgencyNarration(value, targetName) {
  const text = compactText(value, 1200);
  const target = compactText(targetName, 120);
  if (!text || !target) return text;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const targetSubject = new RegExp(`(?:${escaped}|상대(?:\\s*캐릭터)?)(?:은|는|이|가|도)`);
  const voluntaryReaction = /(알아차리|눈치채|바라보|쳐다보|시선|표정|굳히|미소|웃(?:고|는다|으며)|울|당황|놀라|화내|분노|대답|말하|외치|소리치|고개를|끄덕|젓|움츠리|피하|회피|버티|저항|반격|협조|따라오|따라가|돌아서|다가오|다가가|반응)/;
  const sentences = text.match(/[^.!?。！？]+[.!?。！？]?/g) || [text];
  return sentences.filter((sentence) => !(targetSubject.test(sentence) && voluntaryReaction.test(sentence))).join(" ").replace(/\\s+/g, " ").trim();
}

'''
replace_once(
    "api/index.mjs",
    'function validateCharacterInteraction(value) {',
    server_helper + 'function validateCharacterInteraction(value, actorName = "", targetName = "") {'
)
replace_once(
    "api/index.mjs",
    '  const narration = compactText(value?.narration, 1200);',
    '  const rawNarration = compactText(value?.narration, 1200);\n  const narration = stripTargetAgencyNarration(rawNarration, targetName);'
)
replace_once(
    "api/index.mjs",
    '    return sendJson(response, 200, validateCharacterInteraction(parsed));',
    '    return sendJson(response, 200, validateCharacterInteraction(parsed, payload.actor.name, payload.target.name));'
)

# 3) A comma is punctuation, not proof of multiple actions. Full stops were never blocked.
replace_once(
    "app.js",
    '  function isMultiAction(text) {\n    return /(그리고|동시에|한 뒤|후에|,|;|\\+| 및 )/.test(text.trim());\n  }',
    '  function isMultiAction(text) {\n    return /(그리고|동시에|한\\s*뒤|한\\s*후|후에|그\\s*다음|뒤이어|\\+|\\s및\\s)/.test(text.trim());\n  }'
)

# Regression coverage for all three issues and the v0.4.0 canonicalizer collision.
regression = r'''import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const UUID_B = "11111111-1111-4111-8111-111111111111";
const registry = { values: () => [{ id: UUID_B, name: "테스트B", loginId: "테스트B" }] };

{
  const window = { __BAEKJI_TESTER_REGISTRY_GUARD__: registry };
  const context = vm.createContext({ window, structuredClone, Date, JSON, Set, Map, console, String, Number, Object, Array });
  vm.runInContext(fs.readFileSync("action-log-sync.js", "utf8"), context, { filename: "action-log-sync.js" });
  const api = window.__BAEKJI_ACTION_LOG_SYNC_TEST__;
  assert.equal(api.actorNameForId(UUID_B), "테스트B");
  assert.match(api.observationalActionText(UUID_B, "고개를 저으며 말한다"), /테스트B/);
  assert.doesNotMatch(api.observationalActionText(UUID_B, "고개를 저으며 말한다"), /다른 조사자/);
}

{
  const window = { __BAEKJI_TESTER_REGISTRY_GUARD__: registry };
  const context = vm.createContext({ window, Date, JSON, Set, Map, console, String, Number, Object, Array });
  vm.runInContext(fs.readFileSync("observation-ai-sync.js", "utf8"), context, { filename: "observation-ai-sync.js" });
  const api = window.__BAEKJI_OBSERVATION_AI_TEST__;
  const state = {
    version: 3,
    sessions: {
      source: { id: "source", logs: [{ id: "a1", type: "action-input", actorId: UUID_B, text: "테스트C를 비웃는다", at: 1 }] },
      witness: { id: "witness", logs: [{ id: "f1", type: "field-action", sourceActionLogId: "a1", observedActorId: UUID_B, text: "가까운 곳에서 다른 조사자가 무언가를 한다." }] },
    },
  };
  const jobs = api.collectJobs(state, 10);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].actorName, "테스트B", "AI 관찰 요청 단계부터 실제 캐릭터 이름을 사용합니다.");
}

{
  class FakeStorage {
    constructor() { this.values = new Map(); }
    getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; }
    setItem(key, value) { this.values.set(String(key), String(value)); }
    removeItem(key) { this.values.delete(String(key)); }
  }
  const localStorage = new FakeStorage();
  const window = {
    __BAEKJI_TESTER_REGISTRY_GUARD__: registry,
    addEventListener() {}, dispatchEvent() {},
  };
  const context = vm.createContext({
    window, Storage: FakeStorage, localStorage, JSON, String, Number, Object, Array, Map, Set, console,
    Event: class Event { constructor(type) { this.type = type; } },
    queueMicrotask: (fn) => fn(), location: { href: "https://example.test/" },
  });
  vm.runInContext(fs.readFileSync("final-observation-write-canonicalizer.js", "utf8"), context, { filename: "final-observation-write-canonicalizer.js" });
  vm.runInContext(fs.readFileSync("character-interaction-result-visibility-fix.js", "utf8"), context, { filename: "character-interaction-result-visibility-fix.js" });
  const world = {
    version: 3,
    sessions: {
      source: { id: "source", logs: [{ id: "a1", type: "action-input", actorId: UUID_B, text: "고개를 저으며 말한다", fieldObservationAiStatus: "final", fieldObservationAiText: "다른 조사자가 고개를 저으며 짧게 말한다." }] },
      witness: { id: "witness", logs: [{ id: "f1", type: "field-action", sourceActionLogId: "a1", observedActorId: UUID_B, text: "다른 조사자가 고개를 저으며 짧게 말한다.", observationAiPending: false, observationAiFinal: true, observationSource: "ai", observationTextVersion: 3 }] },
    },
  };
  localStorage.setItem("baekji_city_mvp_state_v3", JSON.stringify(world));
  const stored = JSON.parse(localStorage.getItem("baekji_city_mvp_state_v3"));
  assert.match(stored.sessions.source.logs[0].fieldObservationAiText, /테스트B/);
  assert.match(stored.sessions.witness.logs[0].text, /테스트B/);
  assert.doesNotMatch(stored.sessions.source.logs[0].fieldObservationAiText, /다른 조사자/);
  assert.doesNotMatch(stored.sessions.witness.logs[0].text, /다른 조사자/);
}

{
  const window = { DAY1_DATA: {}, __BAEKJI_TESTER_REGISTRY_GUARD__: registry };
  const context = vm.createContext({ window, Date, JSON, Set, Map, console, String, Number, Object, Array, Math });
  vm.runInContext(fs.readFileSync("character-interaction-ai.js", "utf8"), context, { filename: "character-interaction-ai.js" });
  const api = window.__BAEKJI_CHARACTER_INTERACTION_TEST__;
  const mock = api.fallbackDecision("테스트C를 비웃는다", "테스트B", "테스트C", "seed");
  assert.match(mock.narration, /테스트B.*테스트C.*비웃/);
  assert.match(mock.narration, /분명한 조롱/);
  assert.doesNotMatch(mock.narration, /알아차리|표정|바라본|반응/);
  const sanitized = api.stripTargetAgencyNarration("테스트B는 테스트C를 향해 노골적으로 비웃는다. 분명한 조롱이다. 테스트C는 자신을 겨냥한 조롱을 알아차리고 표정을 굳힌 채 테스트B를 바라본다.", "테스트C");
  assert.equal(sanitized, "테스트B는 테스트C를 향해 노골적으로 비웃는다. 분명한 조롱이다.");
  const physical = api.stripTargetAgencyNarration("테스트B가 테스트C를 밀어낸다. 테스트C는 힘이 닿은 만큼 뒤로 밀린다.", "테스트C");
  assert.match(physical, /뒤로 밀린다/);
}

{
  const app = fs.readFileSync("app.js", "utf8");
  const match = app.match(/function isMultiAction\(text\) \{[\s\S]*?\n  \}/);
  assert(match, "isMultiAction must exist");
  const isMultiAction = vm.runInNewContext(`(${match[0]})`);
  assert.equal(isMultiAction("테스트C를 보고, 비웃는다."), false, "쉼표 하나만으로 다중 행동을 차단하지 않습니다.");
  assert.equal(isMultiAction("응."), false, "마침표는 전송 차단 사유가 아닙니다.");
  assert.equal(isMultiAction("문을 연 뒤 안으로 들어간다"), true);
  assert.equal(isMultiAction("문을 열고 동시에 뛰어든다"), true);
}

{
  const server = fs.readFileSync("api/index.mjs", "utf8");
  assert.match(server, /자발적인 반응은 절대 생성하지 않는다/);
  assert.match(server, /stripTargetAgencyNarration/);
  assert.doesNotMatch(server, /이어어서 상대의 반응/);
  assert.doesNotMatch(server, /이어져서 상대의 반응/);
}

console.log("PASS: same-field names stay canonical, target agency is protected, and punctuation no longer blocks one-action sends");
'''
write("tests/interaction-system-regression-check.mjs", regression)
replace_once(
    "tests/action-log-sync-check.mjs",
    'await import("./final-observation-write-stability-check.mjs");',
    'await import("./final-observation-write-stability-check.mjs");\nawait import("./interaction-system-regression-check.mjs");'
)

# Ensure syntax checks include the interaction modules that are now critical.
replace_once(
    "package.json",
    'node --check choice-chat-feedback.js && node --check cross-party-hazard-interaction.js',
    'node --check choice-chat-feedback.js && node --check character-interaction-ai.js && node --check character-interaction-result-visibility-fix.js && node --check final-observation-write-canonicalizer.js && node --check api/index.mjs && node --check cross-party-hazard-interaction.js'
)

# Cache keys for modified browser assets. Keep package release at v0.4.0; these are post-release asset revisions.
asset_replacements = {
    'app.js?v=0.3.18': 'app.js?v=0.4.1',
    'observation-ai-sync.js?v=0.3.34': 'observation-ai-sync.js?v=0.4.1',
    'action-log-sync.js?v=0.3.33': 'action-log-sync.js?v=0.4.1',
    'character-interaction-ai.js?v=0.3.98': 'character-interaction-ai.js?v=0.4.1',
    'character-interaction-result-visibility-fix.js?v=0.3.101': 'character-interaction-result-visibility-fix.js?v=0.4.1',
}
for path in [ROOT / "index.html", *sorted((ROOT / "tests").glob("*.mjs"))]:
    text = path.read_text(encoding="utf-8")
    for old, new in asset_replacements.items():
        text = text.replace(old, new)
    path.write_text(text, encoding="utf-8")

print("interaction system fixes applied")
