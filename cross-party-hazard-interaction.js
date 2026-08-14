(() => {
  "use strict";
  const { clamp, hashNumber } = window.__BAEKJI_RUNTIME_UTILS__;
  const { spatialScopeKey, contaminationStage } = window.__BAEKJI_DOMAIN_RULES__;

  const DATA = window.DAY1_DATA;
  if (!DATA || window.__BAEKJI_CROSS_PARTY_HAZARD__) return;

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const SESSION_PROFILE_KEY = "baekji_city_tester_session_profile_v1";
  const SUPABASE_URL = "https://kfgtvifupumjuewwxzmz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";
  const DEMO_NAMES = new Map([
    ["test_a", "테스트 캐릭터 A"],
    ["test_b", "테스트 캐릭터 B"],
    ["test_c", "테스트 캐릭터 C"],
  ]);
  const accountNames = new Map(DEMO_NAMES);
  let directoryReady = false;
  let directoryPromise = null;
  let resolving = false;
  let replaying = false;

  function readState() {
    try { return JSON.parse(localStorage.getItem(GLOBAL_KEY) || "null"); }
    catch { return null; }
  }

  function currentUserId() {
    try { return String(sessionStorage.getItem(USER_KEY) || ""); }
    catch { return ""; }
  }

  function currentSessionProfile() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_PROFILE_KEY) || "null"); }
    catch { return null; }
  }

  function normalizeName(value) {
    return String(value || "").replace(/\s+/g, "").toLowerCase();
  }

  function nameForId(id) {
    const key = String(id || "");
    if (accountNames.has(key)) return accountNames.get(key);
    const profile = currentSessionProfile();
    if (profile?.id === key && profile?.name) return String(profile.name);
    return key;
  }

  function loadAccountDirectory() {
    if (directoryPromise) return directoryPromise;
    directoryPromise = fetch(`${SUPABASE_URL}/rest/v1/rpc/baekji_tester_list_accounts`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json", Accept: "application/json" },
      body: "{}",
      cache: "no-store",
    }).then((response) => response.ok ? response.json() : []).then((rows) => {
      (rows || []).forEach((row) => {
        if (row?.id && row?.character_name) accountNames.set(String(row.id), String(row.character_name));
      });
    }).catch(() => {}).finally(() => { directoryReady = true; });
    return directoryPromise;
  }

  function sessionForUser(snapshot, uid) {
    const character = snapshot?.characters?.[uid];
    if (character?.currentSessionId && snapshot.sessions?.[character.currentSessionId]) return snapshot.sessions[character.currentSessionId];
    const route = location.hash.replace(/^#\/?/, "").split("/");
    if (route[0] === "investigate" && route[1] && snapshot?.sessions?.[route[1]]) return snapshot.sessions[route[1]];
    return Object.values(snapshot?.sessions || {}).find((session) => session?.status === "ACTIVE" && session?.memberIds?.includes(uid)) || null;
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

  function presentCharacters(snapshot, session) {
    const ownIds = new Set(session?.memberIds || []);
    const output = (session?.memberIds || []).map((id) => ({ id, name: nameForId(id), sessionId: session.id, ownParty: true }));
    fieldSessions(snapshot, session).forEach((candidate) => {
      (candidate.memberIds || []).forEach((id) => {
        if (ownIds.has(id) || output.some((entry) => entry.id === id)) return;
        output.push({ id, name: nameForId(id), sessionId: candidate.id, ownParty: false });
      });
    });
    return output;
  }

  function externalTargetForAction(snapshot, session, uid, action) {
    const clean = String(action || "");
    return presentCharacters(snapshot, session).find((entry) =>
      !entry.ownParty && entry.id !== uid && entry.name && entry.name !== entry.id && clean.includes(entry.name)
    ) || null;
  }

  function isHazardAction(action, snapshot, uid) {
    const text = String(action || "").trim();
    if (!text.startsWith("/") || /^\/(?:지도|맵|map)(?:\s|$)/i.test(text)) return false;
    return Boolean(sessionForUser(snapshot, uid)?.activeEncounter);
  }

  function hazardContext(snapshot, session, uid, action) {
    const encounter = session.activeEncounter;
    const currentHazardId = encounter.hazards[encounter.currentIndex];
    const remainingHazards = encounter.hazards.slice(encounter.currentIndex).map((id) => ({
      id,
      name: DATA.hazardTemplates?.[id]?.name || id,
      kind: DATA.hazardTemplates?.[id]?.kind || "위험",
    }));
    const actor = snapshot.characters?.[uid] || {};
    const inventory = Object.values(actor.inventory || {}).map((item) => ({
      id: String(item.itemId || item.id || ""),
      name: String(item.name || ""),
      state: String(item.state || "CLEAN"),
      quantity: Number(item.quantity) || 0,
    })).filter((item) => item.id && item.name && item.quantity > 0);
    return {
      action,
      actorName: nameForId(uid),
      currentLocation: DATA.places?.[encounter.fromNode]?.name || encounter.fromNode,
      targetLocation: DATA.places?.[encounter.targetNode]?.name || encounter.targetNode,
      encounterOverview: String(encounter.overview || ""),
      currentHazard: remainingHazards[0],
      remainingHazards,
      observations: Array.isArray(encounter.flexInsights) ? encounter.flexInsights.slice(-6) : [],
      // The existing API field is named partyMembers for backward compatibility,
      // but this list intentionally contains every interactable character sharing the field.
      partyMembers: presentCharacters(snapshot, session).map(({ id, name }) => ({ id, name })),
      inventory,
      contamination: Number(actor.contamination) || 0,
    };
  }

  function fallbackDecision(action, target, remainingCount) {
    const clean = String(action || "").trim();
    const actorName = nameForId(currentUserId());
    const movement = /(통과|빠져나|벗어나|건너|돌파|달려|뛰어|이동|나간|간다)/.test(clean);
    const all = movement && (remainingCount <= 1 || /(끝까지|빠져나|벗어나|정면돌파|통과|돌파|계속\s*(?:달|뛰|간))/.test(clean));
    const aggressive = /(밀|떠밀|앞세|방패|내세|던지|넘어뜨|밀치)/.test(clean);
    const cooperative = /(손을\s*잡|부축|도와|끌어주|함께|데리고|감싸)/.test(clean);
    const observeOnly = !movement && /(말|묻|확인|살펴|본다|지켜|듣)/.test(clean);
    if (observeOnly) {
      return {
        outcome: "INFO", progress: "NONE", selfExposure: "NONE",
        targetName: target.name, targetExposure: "NONE", observationNote: "",
        usedItemId: "", usedItemContaminated: false,
        narration: `${actorName}는 같은 현장에 있는 ${target.name}에게 시선을 돌려 행동한다. 두 사람의 위치는 아직 위험 구간 안에 그대로 남아 있다.`,
      };
    }
    return {
      outcome: aggressive ? "PARTIAL" : cooperative ? "SUCCESS" : "PARTIAL",
      progress: all ? "ALL" : movement ? "CURRENT" : "NONE",
      selfExposure: cooperative ? "LOW" : aggressive ? "LOW" : "NONE",
      targetName: target.name,
      targetExposure: aggressive ? "MEDIUM" : cooperative ? "LOW" : "NONE",
      observationNote: "",
      usedItemId: "",
      usedItemContaminated: false,
      narration: aggressive
        ? `${actorName}는 같은 현장에 있던 ${target.name}에게 직접 힘을 가하며 위험 속에서 자신의 행동을 이어간다. 그 영향은 ${target.name}에게도 그대로 닿는다.`
        : `${actorName}는 같은 현장에 있던 ${target.name}와 직접 맞물려 행동한다. 두 사람의 움직임이 위험 구간 안에서 서로의 결과에 영향을 준다.`,
    };
  }

  function normalizeDecision(value, fallback, target) {
    const outcomes = new Set(["SUCCESS", "PARTIAL", "FAIL", "INFO"]);
    const progress = new Set(["NONE", "CURRENT", "ALL"]);
    const exposure = new Set(["NONE", "LOW", "MEDIUM", "HIGH"]);
    const decision = value && typeof value === "object" ? value : {};
    return {
      outcome: outcomes.has(decision.outcome) ? decision.outcome : fallback.outcome,
      progress: progress.has(decision.progress) ? decision.progress : fallback.progress,
      selfExposure: exposure.has(decision.selfExposure) ? decision.selfExposure : fallback.selfExposure,
      // An explicitly named, present cross-party target stays bound to that real character.
      targetName: target.name,
      targetExposure: exposure.has(decision.targetExposure) ? decision.targetExposure : fallback.targetExposure,
      observationNote: String(decision.observationNote || fallback.observationNote || "").trim().slice(0, 280),
      usedItemId: String(decision.usedItemId || fallback.usedItemId || "").trim(),
      usedItemContaminated: Boolean(decision.usedItemContaminated),
      narration: String(decision.narration || fallback.narration).trim(),
    };
  }

  async function resolveWithAI(context, fallback, target) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 16000) : null;
    try {
      const response = await fetch("/api/resolve-hazard-flex", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(context),
        cache: "no-store",
        signal: controller?.signal,
      });
      if (!response.ok) throw new Error(`CROSS_PARTY_HAZARD_${response.status}`);
      return normalizeDecision(await response.json(), fallback, target);
    } catch {
      return fallback;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  function ruleForExposure(level) {
    if (level === "HIGH") return "EXP_CONTACT_HIGH";
    if (level === "MEDIUM") return "EXP_CONTACT_MEDIUM";
    if (level === "LOW") return "EXP_CONTACT_LOW";
    return "EXP_CONTACT_NONE";
  }

  function deterministicDelta(ruleId, seed) {
    const rule = DATA.contaminationRules?.[ruleId] || DATA.contaminationRules?.EXP_CONTACT_NONE;
    if (!rule || Number(rule.max) <= 0) return 0;
    const min = Number(rule.min) || 0;
    const max = Number(rule.max) || min;
    return min + (hashNumber(seed) % (max - min + 1));
  }

  function applyExposure(character, level, seed) {
    if (!character) return 0;
    const delta = deterministicDelta(ruleForExposure(level), seed);
    character.contamination = clamp((Number(character.contamination) || 0) + delta, 0, 100);
    character.symptom = contaminationStage(character.contamination);
    return delta;
  }

  function appendLog(session, type, text, actorId = null, meta = {}) {
    session.logs ||= [];
    const entry = { id: `log_cross_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`, type, text, actorId, at: Date.now(), ...meta };
    session.logs.push(entry);
    return entry;
  }

  function applyAmbientArrival(snapshot, session, encounter) {
    const changes = [];
    const ruleId = encounter.ambientRuleId || "EXP_AMBIENT_A";
    (session.memberIds || []).forEach((memberId) => {
      const character = snapshot.characters?.[memberId];
      if (!character) return;
      const delta = deterministicDelta(ruleId, `${session.id}:${encounter.targetNode}:${memberId}:cross`);
      if (!delta) return;
      character.contamination = clamp((Number(character.contamination) || 0) + delta, 0, 100);
      character.symptom = contaminationStage(character.contamination);
      changes.push({ memberId, delta });
    });
    session.currentNode = encounter.targetNode;
    session.currentDetailId = null;
    session.activeEncounter = null;
    return changes;
  }

  function stillPresent(snapshot, session, target) {
    return fieldSessions(snapshot, session).some((candidate) => candidate.id === target.sessionId && (candidate.memberIds || []).includes(target.id));
  }

  function applyDecision(snapshot, sessionId, uid, action, target, decision) {
    const session = snapshot?.sessions?.[sessionId];
    const encounter = session?.activeEncounter;
    const targetSession = snapshot?.sessions?.[target.sessionId];
    const actor = snapshot?.characters?.[uid];
    const targetCharacter = snapshot?.characters?.[target.id];
    if (!session || !encounter || !targetSession || !actor || !targetCharacter || !stillPresent(snapshot, session, target)) return { applied: false };

    const hazardId = encounter.hazards[encounter.currentIndex];
    encounter.flexInsights ||= [];
    encounter.resolutions ||= [];
    session.choiceReveal = null;
    if (decision.observationNote) {
      encounter.flexInsights.push(decision.observationNote);
      if (encounter.flexInsights.length > 6) encounter.flexInsights.splice(0, encounter.flexInsights.length - 6);
    }

    const selfDelta = applyExposure(actor, decision.selfExposure, `${sessionId}:${hazardId}:${action}:cross-self:${encounter.resolutions.length}`);
    const targetDelta = applyExposure(targetCharacter, decision.targetExposure, `${sessionId}:${hazardId}:${action}:cross-target:${target.id}:${encounter.resolutions.length}`);
    if (decision.usedItemId && decision.usedItemContaminated && actor.inventory?.[decision.usedItemId]) actor.inventory[decision.usedItemId].state = "CONTAMINATED";

    encounter.resolutions.push({
      hazardId, actorId: uid, text: action, outcome: decision.outcome, progress: decision.progress,
      selfExposure: decision.selfExposure, selfDelta, targetId: target.id,
      targetSessionId: target.sessionId, targetExposure: decision.targetExposure, targetDelta,
      flexible: true, crossParty: true,
    });

    if (decision.progress === "ALL") encounter.currentIndex = encounter.hazards.length;
    else if (decision.progress === "CURRENT") encounter.currentIndex += 1;

    let arrived = false;
    let narration = decision.narration;
    let ambientChanges = [];
    if (decision.progress !== "NONE" && encounter.currentIndex >= encounter.hazards.length) {
      const destination = DATA.places?.[encounter.targetNode]?.name || encounter.targetNode;
      ambientChanges = applyAmbientArrival(snapshot, session, encounter);
      narration = `${narration} ${nameForId(uid)} 일행은 ${destination} 쪽으로 이동을 마친다.`;
      arrived = true;
    } else if (decision.progress !== "NONE") {
      const nextHazardId = encounter.hazards[encounter.currentIndex];
      narration = `${narration} 그러나 이동 경로에는 아직 ${DATA.hazardTemplates?.[nextHazardId]?.name || nextHazardId}이 남아 있다.`;
    }

    const scopeKey = spatialScopeKey(targetSession);
    const logType = decision.outcome === "FAIL" ? "fail" : decision.outcome === "INFO" ? "scene" : "success";
    appendLog(session, logType, narration, null, {
      kind: "CROSS_PARTY_HAZARD_RESPONSE", actorId: uid, hazardId, outcome: decision.outcome,
      progress: decision.progress, contaminationDelta: selfDelta, targetId: target.id,
      targetSessionId: target.sessionId, targetContaminationDelta: targetDelta, arrived,
    });
    appendLog(targetSession, "interaction", `/${action}`, uid, { scopeKey, crossParty: true });
    appendLog(targetSession, logType, decision.narration, null, {
      kind: "CROSS_PARTY_HAZARD_IMPACT", actorId: uid, targetId: target.id,
      sourceSessionId: sessionId, hazardId, targetContaminationDelta: targetDelta,
    });
    return { applied: true, arrived, selfDelta, targetDelta, targetId: target.id, targetSessionId: target.sessionId, ambientChanges };
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

  function replayToNormalHazardHandler() {
    const button = document.querySelector("[data-send-chat]");
    if (!button) return false;
    replaying = true;
    try { button.click(); }
    finally { replaying = false; }
    return true;
  }

  async function handleCapturedHazardAction() {
    if (resolving) return true;
    const input = document.querySelector("[data-chat-input]");
    const rawAction = String(input?.value || "").trim();
    const uid = currentUserId();
    let snapshot = readState();
    if (!snapshot || !uid || !isHazardAction(rawAction, snapshot, uid)) return false;

    if (!directoryReady) await loadAccountDirectory();
    snapshot = readState();
    const session = sessionForUser(snapshot, uid);
    const cleanAction = rawAction.replace(/^\/+/, "").trim();
    const target = session ? externalTargetForAction(snapshot, session, uid, cleanAction) : null;
    if (!session?.activeEncounter || !target) return replayToNormalHazardHandler();

    resolving = true;
    setPending(true);
    try {
      const remainingCount = session.activeEncounter.hazards.length - session.activeEncounter.currentIndex;
      const fallback = fallbackDecision(cleanAction, target, remainingCount);
      const context = hazardContext(snapshot, session, uid, cleanAction);
      const expectedHazard = context.currentHazard?.id;
      const decision = await resolveWithAI(context, fallback, target);

      const latest = readState();
      const latestSession = latest?.sessions?.[session.id];
      if (!latestSession?.activeEncounter) return true;
      const actualHazard = latestSession.activeEncounter.hazards[latestSession.activeEncounter.currentIndex];
      if (actualHazard !== expectedHazard || !stillPresent(latest, latestSession, target)) return true;

      appendLog(latestSession, "interaction", rawAction, uid, { scopeKey: spatialScopeKey(latestSession), crossParty: true });
      applyDecision(latest, latestSession.id, uid, cleanAction, target, decision);
      clearComposer();
      localStorage.setItem(GLOBAL_KEY, JSON.stringify(latest));
      window.dispatchEvent(new Event("hashchange"));
      window.dispatchEvent(new CustomEvent("baekji-cross-party-hazard-resolved", { detail: { sessionId: latestSession.id, targetId: target.id, targetSessionId: target.sessionId, decision } }));
      return true;
    } finally {
      resolving = false;
      setPending(false);
    }
  }

  function interceptClick(event) {
    if (replaying || !event.target?.closest?.("[data-send-chat]")) return;
    const snapshot = readState();
    const uid = currentUserId();
    const action = document.querySelector("[data-chat-input]")?.value || "";
    if (!snapshot || !isHazardAction(action, snapshot, uid)) return;
    const session = sessionForUser(snapshot, uid);
    const target = directoryReady && session ? externalTargetForAction(snapshot, session, uid, action) : null;
    if (directoryReady && !target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void handleCapturedHazardAction();
  }

  function interceptKeydown(event) {
    if (replaying || event.key !== "Enter" || event.shiftKey || event.isComposing || !event.target?.matches?.("[data-chat-input]")) return;
    const snapshot = readState();
    const uid = currentUserId();
    if (!snapshot || !isHazardAction(event.target.value, snapshot, uid)) return;
    const session = sessionForUser(snapshot, uid);
    const target = directoryReady && session ? externalTargetForAction(snapshot, session, uid, event.target.value) : null;
    if (directoryReady && !target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void handleCapturedHazardAction();
  }

  document.addEventListener("click", interceptClick, true);
  document.addEventListener("keydown", interceptKeydown, true);
  loadAccountDirectory();

  window.__BAEKJI_CROSS_PARTY_HAZARD__ = Object.freeze({
    spatialScopeKey,
    fieldSessions,
    presentCharacters,
    externalTargetForAction,
    hazardContext,
    fallbackDecision,
    applyDecision,
    isHazardAction,
  });
})();
