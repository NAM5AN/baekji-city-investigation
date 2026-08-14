(() => {
  "use strict";
  const { uniqueArray: unique } = window.__BAEKJI_RUNTIME_UTILS__;
  const { spatialScopeKey } = window.__BAEKJI_DOMAIN_RULES__;

  const DATA = window.DAY1_DATA || {};
  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const SESSION_PROFILE_KEY = "baekji_city_tester_session_profile_v1";
  const SUPABASE_URL = "https://kfgtvifupumjuewwxzmz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";
  const VERSION = "0.3.98";
  const DEMO_NAMES = new Map([
    ["test_a", "테스트 캐릭터 A"],
    ["test_b", "테스트 캐릭터 B"],
    ["test_c", "테스트 캐릭터 C"],
  ]);
  const accounts = new Map(DEMO_NAMES);
  let directoryReady = false;
  let directoryPromise = null;
  let resolving = false;
  let replaying = false;

  function normalize(value) {
    return String(value || "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  }

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(GLOBAL_KEY) || "null");
      return parsed?.version === 3 ? parsed : null;
    } catch {
      return null;
    }
  }

  function currentUserId() {
    try { return String(sessionStorage.getItem(USER_KEY) || ""); }
    catch { return ""; }
  }

  function currentSessionProfile() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_PROFILE_KEY) || "null"); }
    catch { return null; }
  }

  function registryAccount(id) {
    const key = String(id || "");
    const values = window.__BAEKJI_TESTER_REGISTRY_GUARD__?.values?.() || [];
    return values.find((entry) => String(entry?.id || "") === key) || null;
  }

  function nameForId(id) {
    const key = String(id || "");
    const registered = registryAccount(key);
    if (registered?.name || registered?.loginId) return String(registered.name || registered.loginId).trim();
    if (accounts.has(key)) return String(accounts.get(key));
    const profile = currentSessionProfile();
    if (String(profile?.id || "") === key && (profile?.name || profile?.loginId)) return String(profile.name || profile.loginId).trim();
    return key;
  }

  function aliasesForName(name) {
    const raw = String(name || "").trim();
    if (!raw) return [];
    const aliases = new Set([raw, raw.replace(/\s+/g, "")]);
    if (/^테스트\s*/.test(raw)) {
      const stripped = raw.replace(/^테스트\s*/, "").trim();
      if (stripped) {
        aliases.add(stripped);
        aliases.add(stripped.replace(/\s+/g, ""));
      }
    }
    const demo = raw.match(/^테스트\s*캐릭터\s*([ABC])$/i);
    if (demo?.[1]) {
      aliases.add(`캐릭터${demo[1].toUpperCase()}`);
      aliases.add(`캐릭터 ${demo[1].toUpperCase()}`);
    }
    return [...aliases].filter(Boolean);
  }

  function loadAccountDirectory() {
    if (directoryPromise) return directoryPromise;
    directoryPromise = fetch(`${SUPABASE_URL}/rest/v1/rpc/baekji_tester_list_accounts`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: "{}",
      cache: "no-store",
    }).then((response) => response.ok ? response.json() : []).then((rows) => {
      (rows || []).forEach((row) => {
        if (row?.id && row?.character_name) accounts.set(String(row.id), String(row.character_name).trim());
      });
    }).catch(() => {}).finally(() => {
      directoryReady = true;
      window.dispatchEvent?.(new CustomEvent("baekji-character-directory-ready"));
    });
    return directoryPromise;
  }

  function sessionForUser(snapshot, uid) {
    const character = snapshot?.characters?.[uid];
    if (character?.currentSessionId && snapshot.sessions?.[character.currentSessionId]) return snapshot.sessions[character.currentSessionId];
    const route = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (route[0] === "investigate" && route[1] && snapshot?.sessions?.[route[1]]) return snapshot.sessions[route[1]];
    return Object.values(snapshot?.sessions || {}).find((session) => session?.status === "ACTIVE" && (session.memberIds || []).includes(uid)) || null;
  }

  function fieldSessions(snapshot, session) {
    const scopeKey = spatialScopeKey(session);
    if (!scopeKey) return [];
    return Object.values(snapshot?.sessions || {}).filter((candidate) =>
      candidate?.id !== session.id &&
      candidate?.status === "ACTIVE" &&
      candidate?.variant === session.variant &&
      spatialScopeKey(candidate) === scopeKey
    );
  }

  function presentCharacters(snapshot, session, uid = "") {
    if (!session) return [];
    const result = [];
    const add = (id, sessionId, ownParty) => {
      const key = String(id || "");
      if (!key || key === uid || result.some((entry) => entry.id === key)) return;
      const name = nameForId(key);
      result.push({ id: key, name, sessionId, ownParty, aliases: aliasesForName(name) });
    };
    (session.memberIds || []).forEach((id) => add(id, session.id, true));
    fieldSessions(snapshot, session).forEach((candidate) => (candidate.memberIds || []).forEach((id) => add(id, candidate.id, false)));
    return result;
  }

  function targetForAction(snapshot, session, uid, action) {
    const clean = normalize(action);
    if (!clean) return null;
    const candidates = presentCharacters(snapshot, session, uid).flatMap((entry) =>
      entry.aliases.map((alias) => ({ entry, alias, normalized: normalize(alias) }))
    ).filter((item) => item.normalized).sort((left, right) => right.normalized.length - left.normalized.length);
    const matched = candidates.find((item) => clean.includes(item.normalized));
    return matched ? { ...matched.entry, matchedAlias: matched.alias } : null;
  }

  function finalSoundInfo(name) {
    const chars = Array.from(String(name || "").trim()).reverse();
    for (const char of chars) {
      const code = char.charCodeAt(0);
      if (code >= 0xac00 && code <= 0xd7a3) {
        const jong = (code - 0xac00) % 28;
        return { hasBatchim: jong !== 0, rieul: jong === 8 };
      }
      if (/\d/.test(char)) {
        const has = new Set(["0", "1", "3", "6", "7", "8"]).has(char);
        return { hasBatchim: has, rieul: new Set(["1", "7", "8"]).has(char) };
      }
      if (/[A-Za-z]/.test(char)) {
        const upper = char.toUpperCase();
        const batchim = new Set(["F", "L", "M", "N", "R", "S", "X"]);
        return { hasBatchim: batchim.has(upper), rieul: new Set(["L", "R"]).has(upper) };
      }
    }
    return { hasBatchim: false, rieul: false };
  }

  function particleFor(name, pair) {
    const { hasBatchim, rieul } = finalSoundInfo(name);
    if (pair === "을/를") return hasBatchim ? "을" : "를";
    if (pair === "이/가") return hasBatchim ? "이" : "가";
    if (pair === "은/는") return hasBatchim ? "은" : "는";
    if (pair === "과/와") return hasBatchim ? "과" : "와";
    if (pair === "으로/로") return hasBatchim && !rieul ? "으로" : "로";
    return "";
  }

  function withParticle(name, pair) {
    return `${name}${particleFor(name, pair)}`;
  }

  function fixNameParticles(text, names) {
    let output = String(text || "");
    const pairs = [
      ["을", "를", "을/를"],
      ["이", "가", "이/가"],
      ["은", "는", "은/는"],
      ["과", "와", "과/와"],
      ["으로", "로", "으로/로"],
    ];
    unique(names.filter(Boolean)).sort((a, b) => b.length - a.length).forEach((name) => {
      const escaped = escapeRegExp(name);
      pairs.forEach(([left, right, pair]) => {
        const desired = particleFor(name, pair);
        const pattern = new RegExp(`${escaped}\\s*(?:${left}|${right})`, "g");
        output = output.replace(pattern, `${name}${desired}`);
      });
    });
    return output;
  }

  function hashNumber(text) {
    let hash = 2166136261;
    for (const char of String(text || "")) {
      hash ^= char.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0);
  }

  function fallbackDecision(action, actorName, targetName, seed = "") {
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
    return { outcome: "NEUTRAL", targetEffect: "NONE", narration: `${actorSubject} ${targetObject} 향해 선언한 행동을 그대로 이어간다.` };
  }

  function locationName(session) {
    if (!session) return "";
    if (session.activeEncounter) {
      const from = DATA.places?.[session.activeEncounter.fromNode]?.name || session.activeEncounter.fromNode;
      const to = DATA.places?.[session.activeEncounter.targetNode]?.name || session.activeEncounter.targetNode;
      return `${from} → ${to} 이동 경로`;
    }
    if (session.currentNode === "E_ENTRY") return "해오름역 구역 입구";
    return DATA.places?.[session.currentNode]?.name || session.currentNode || "";
  }

  function detailName(session) {
    if (!session?.currentDetailId) return "";
    for (const place of Object.values(DATA.places || {})) {
      const detail = (place.details || []).find((entry) => entry.id === session.currentDetailId);
      if (detail) return detail.name || "";
    }
    return "";
  }

  function situationText(session) {
    if (session?.activeEncounter) return String(session.activeEncounter.overview || "");
    const detail = session?.currentDetailId ? detailName(session) : "";
    if (detail) return `${detail}에 머물고 있다.`;
    return `${locationName(session)}에 함께 있다.`;
  }

  function recentSystem(session) {
    return (session?.logs || [])
      .filter((entry) => entry && !entry.actorId && !["interaction", "chat-divider"].includes(entry.type))
      .slice(-6)
      .map((entry) => String(entry.text || "").slice(0, 420));
  }

  function shouldDeferToHazard(session, action) {
    if (!session?.activeEncounter) return false;
    const clean = String(action || "");
    const progress = /(통과|돌파|건너|빠져나|벗어나|앞세|방패|내세|위험을?\s*(?:피|막|넘)|통로를?\s*(?:지나|건너)|발판|잔류물|흰\s*(?:선|얼룩|점액)|계속\s*(?:간|달|뛰)|이동)/.test(clean);
    return progress;
  }

  function visibilityForAction(action) {
    return /(귓속말|속삭|귀에\s*대고|몰래\s*말|나지막)/.test(String(action || "")) ? "TARGET_ONLY" : "FIELD";
  }

  function interactionContext(snapshot, session, uid, target, action) {
    const actor = snapshot?.characters?.[uid] || {};
    const targetCharacter = snapshot?.characters?.[target.id] || {};
    return {
      action,
      actor: { id: uid, name: nameForId(uid) },
      target: { id: target.id, name: target.name },
      sameParty: target.sessionId === session.id,
      location: locationName(session),
      detail: detailName(session),
      situation: situationText(session),
      activeHazard: session.activeEncounter ? String(session.activeEncounter.overview || "") : "",
      actorStatus: { contamination: Number(actor.contamination) || 0, symptom: String(actor.symptom || "") },
      targetStatus: { contamination: Number(targetCharacter.contamination) || 0, symptom: String(targetCharacter.symptom || "") },
      recentSystem: recentSystem(session),
    };
  }

  function stripTargetAgencyNarration(value, targetName) {
    const text = String(value || "").trim();
    const target = String(targetName || "").trim();
    if (!text || !target) return text;
    const escaped = escapeRegExp(target);
    const targetSubject = new RegExp(`(?:${escaped}|상대(?:\s*캐릭터)?)(?:은|는|이|가|도)`);
    const voluntaryReaction = /(알아차리|눈치채|바라보|쳐다보|시선|표정|굳히|미소|웃(?:고|는다|으며)|울|당황|놀라|화내|분노|대답|말하|외치|소리치|고개를|끄덕|젓|움츠리|피하|회피|버티|저항|반격|협조|따라오|따라가|돌아서|다가오|다가가|반응)/;
    const sentences = text.match(/[^.!?。！？]+[.!?。！？]?/g) || [text];
    const kept = sentences.filter((sentence) => !(targetSubject.test(sentence) && voluntaryReaction.test(sentence)));
    return kept.join(" ").replace(/\s+/g, " ").trim();
  }

  function normalizeDecision(value, fallback, actorName, targetName) {
    const outcomes = new Set(["EFFECTIVE", "PARTIAL", "RESISTED", "NEUTRAL"]);
    const effects = new Set(["NONE", "CONTACT", "MOVED", "STAGGERED", "FELL", "RESISTED", "SUPPORTED", "BLOCKED", "REACTED", "OTHER"]);
    const decision = value && typeof value === "object" ? value : {};
    let narration = String(decision.narration || fallback.narration || "").trim().slice(0, 1200);
    narration = stripTargetAgencyNarration(narration, targetName) || stripTargetAgencyNarration(fallback.narration, targetName);
    narration = fixNameParticles(narration, [actorName, targetName]);
    return {
      outcome: outcomes.has(decision.outcome) ? decision.outcome : fallback.outcome,
      targetEffect: effects.has(decision.targetEffect) ? decision.targetEffect : fallback.targetEffect,
      narration,
    };
  }

  async function resolveWithAI(context, fallback) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 16000) : null;
    try {
      const response = await fetch("/api/resolve-character-interaction", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(context),
        cache: "no-store",
        signal: controller?.signal,
      });
      if (!response.ok) throw new Error(`CHARACTER_INTERACTION_${response.status}`);
      return normalizeDecision(await response.json(), fallback, context.actor.name, context.target.name);
    } catch {
      return normalizeDecision(fallback, fallback, context.actor.name, context.target.name);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  function appendLog(session, type, text, actorId = null, meta = {}) {
    session.logs ||= [];
    const entry = {
      id: `log_char_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      text,
      actorId,
      at: Date.now(),
      ...meta,
    };
    session.logs.push(entry);
    return entry;
  }

  function saveState(snapshot) {
    localStorage.setItem(GLOBAL_KEY, JSON.stringify(snapshot));
    try { window.dispatchEvent(new Event("hashchange")); } catch { /* ignore */ }
  }

  function setPending(pending) {
    const input = document.querySelector("[data-chat-input]");
    const button = document.querySelector("[data-send-chat]");
    if (input) input.disabled = pending;
    if (button) {
      button.disabled = pending;
      button.textContent = pending ? "상황 판정 중" : "전송 ↵";
    }
  }

  function clearComposer() {
    const input = document.querySelector("[data-chat-input]");
    if (!input) return;
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function replayToNormalHandler() {
    const button = document.querySelector("[data-send-chat]");
    if (!button) return false;
    replaying = true;
    try { button.click(); }
    finally { replaying = false; }
    return true;
  }

  function capturedSessionIds(snapshot, session, target, visibility) {
    if (visibility === "TARGET_ONLY") return unique([session.id, target.sessionId]);
    return unique([session.id, ...fieldSessions(snapshot, session).map((candidate) => candidate.id)]);
  }

  async function handleInteraction() {
    if (resolving) return true;
    const input = document.querySelector("[data-chat-input]");
    const raw = String(input?.value || "").trim();
    if (!raw.startsWith("/")) return false;
    const action = raw.replace(/^\/+\s*/, "").trim();
    if (!action) return false;
    const uid = currentUserId();
    let snapshot = readState();
    let session = sessionForUser(snapshot, uid);
    if (!snapshot || !uid || !session || session.movement) return false;

    if (!directoryReady) await loadAccountDirectory();
    snapshot = readState();
    session = sessionForUser(snapshot, uid);
    const target = session ? targetForAction(snapshot, session, uid, action) : null;
    if (!session || !target || shouldDeferToHazard(session, action)) return replayToNormalHandler();

    resolving = true;
    setPending(true);
    try {
      const actorName = nameForId(uid);
      const fallback = fallbackDecision(action, actorName, target.name, `${session.id}:${uid}:${target.id}:${session.logs?.length || 0}`);
      const context = interactionContext(snapshot, session, uid, target, action);
      const visibility = visibilityForAction(action);
      const sessionIds = capturedSessionIds(snapshot, session, target, visibility);
      const eventId = `char_interaction_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      appendLog(session, "action-input", action, uid, {
        scopeKey: spatialScopeKey(session),
        fieldObservationBroadcasted: true,
        characterInteraction: true,
        interactionEventId: eventId,
        targetId: target.id,
      });
      clearComposer();
      saveState(snapshot);

      const decision = await resolveWithAI(context, fallback);
      const latest = readState() || snapshot;
      const resultType = decision.outcome === "RESISTED" ? "fail" : decision.outcome === "NEUTRAL" ? "scene" : "success";
      sessionIds.forEach((sessionId) => {
        const recipient = latest.sessions?.[sessionId];
        if (!recipient) return;
        if ((recipient.logs || []).some((entry) => entry?.interactionEventId === eventId && entry?.kind === "CHARACTER_INTERACTION_RESULT")) return;
        appendLog(recipient, resultType, decision.narration, null, {
          kind: "CHARACTER_INTERACTION_RESULT",
          interactionEventId: eventId,
          actorId: uid,
          targetId: target.id,
          sourceSessionId: session.id,
          targetSessionId: target.sessionId,
          outcome: decision.outcome,
          targetEffect: decision.targetEffect,
          scopeKey: spatialScopeKey(session),
          aiNarrationFinal: true,
          characterInteraction: true,
        });
      });
      saveState(latest);
      window.dispatchEvent?.(new CustomEvent("baekji-character-interaction-resolved", {
        detail: { eventId, actorId: uid, targetId: target.id, outcome: decision.outcome, targetEffect: decision.targetEffect },
      }));
      return true;
    } finally {
      resolving = false;
      setPending(false);
    }
  }

  function synchronousTarget() {
    const snapshot = readState();
    const uid = currentUserId();
    const input = document.querySelector("[data-chat-input]");
    const raw = String(input?.value || "").trim();
    if (!snapshot || !uid || !raw.startsWith("/")) return null;
    const session = sessionForUser(snapshot, uid);
    if (!session || session.movement) return null;
    const action = raw.replace(/^\/+\s*/, "").trim();
    const target = targetForAction(snapshot, session, uid, action);
    if (!target || shouldDeferToHazard(session, action)) return null;
    return target;
  }

  function interceptClick(event) {
    if (replaying || resolving || !event.target?.closest?.("[data-send-chat]")) return;
    if (!synchronousTarget()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void handleInteraction();
  }

  function interceptKeydown(event) {
    if (replaying || resolving || event.key !== "Enter" || event.shiftKey || event.isComposing || !event.target?.matches?.("[data-chat-input]")) return;
    if (!synchronousTarget()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void handleInteraction();
  }

  const TEST_API = Object.freeze({
    normalize,
    aliasesForName,
    spatialScopeKey,
    presentCharacters,
    targetForAction,
    finalSoundInfo,
    particleFor,
    withParticle,
    fixNameParticles,
    stripTargetAgencyNarration,
    fallbackDecision,
    shouldDeferToHazard,
    visibilityForAction,
  });
  if (typeof window !== "undefined") window.__BAEKJI_CHARACTER_INTERACTION_TEST__ = TEST_API;
  if (typeof document === "undefined" || typeof localStorage === "undefined" || typeof sessionStorage === "undefined") return;

  document.addEventListener("click", interceptClick, true);
  document.addEventListener("keydown", interceptKeydown, true);
  loadAccountDirectory();
  window.__BAEKJI_CHARACTER_INTERACTION__ = Object.freeze({ version: VERSION, targetForAction, resolveWithAI });
})();
