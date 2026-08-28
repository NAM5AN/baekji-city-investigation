(() => {
  "use strict";

  const DATA = window.DAY1_DATA;
  if (!DATA || window.__BAEKJI_FLEX_HAZARD__) return;
  const persistence = window.__BAEKJI_WORLD_PERSISTENCE__;

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
  let resolving = false;

  function readState() {
    try { return JSON.parse(persistence?.readRaw?.() || "null"); }
    catch { return null; }
  }

  function currentUserId() {
    try { return String(sessionStorage.getItem(USER_KEY) || ""); }
    catch { return ""; }
  }

  function normalizeName(value) {
    return String(value || "").replace(/\s+/g, "").toLowerCase();
  }

  function currentSessionProfile() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_PROFILE_KEY) || "null"); }
    catch { return null; }
  }

  function nameForId(id) {
    const key = String(id || "");
    if (accountNames.has(key)) return accountNames.get(key);
    const profile = currentSessionProfile();
    if (profile?.id === key && profile?.name) return String(profile.name);
    return key;
  }

  function loadAccountDirectory() {
    return fetch(`${SUPABASE_URL}/rest/v1/rpc/baekji_tester_list_accounts`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json", Accept: "application/json" },
      body: "{}",
      cache: "no-store",
    }).then((response) => response.ok ? response.json() : []).then((rows) => {
      (rows || []).forEach((row) => {
        if (row?.id && row?.character_name) accountNames.set(String(row.id), String(row.character_name));
      });
    }).catch(() => {});
  }

  function sessionForUser(snapshot, uid) {
    const character = snapshot?.characters?.[uid];
    if (character?.currentSessionId && snapshot.sessions?.[character.currentSessionId]) return snapshot.sessions[character.currentSessionId];
    const route = location.hash.replace(/^#\/?/, "").split("/");
    if (route[0] === "investigate" && route[1] && snapshot?.sessions?.[route[1]]) return snapshot.sessions[route[1]];
    return Object.values(snapshot?.sessions || {}).find((session) => session?.status === "ACTIVE" && session?.memberIds?.includes(uid)) || null;
  }

  function hazardContext(snapshot, session, uid, action) {
    const encounter = session.activeEncounter;
    const currentHazardId = encounter.hazards[encounter.currentIndex];
    const remaining = encounter.hazards.slice(encounter.currentIndex).map((id) => ({
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
      currentHazard: remaining[0],
      remainingHazards: remaining,
      observations: Array.isArray(encounter.flexInsights) ? encounter.flexInsights.slice(-6) : [],
      partyMembers: (session.memberIds || []).map((id) => ({ id, name: nameForId(id) })),
      inventory,
      contamination: Number(actor.contamination) || 0,
    };
  }

  function fallbackTargetName(action, session, uid) {
    if (!/(밀|떠밀|앞세|방패|내세)/.test(action)) return "";
    return (session.memberIds || [])
      .filter((id) => id !== uid)
      .map((id) => nameForId(id))
      .find((name) => name && action.includes(name)) || "";
  }

  function resolvePartyTargetId(session, uid, targetName) {
    const needle = normalizeName(targetName);
    if (!needle) return "";
    return (session.memberIds || []).find((id) => id !== uid && normalizeName(nameForId(id)) === needle) || "";
  }

  function fallbackDecision(action, remainingCount = 1, session = { memberIds: [] }, uid = "") {
    const clean = String(action || "").replace(/^\/+/, "").trim();
    const observeOnly = /(살펴|관찰|확인|지켜|듣|패턴|주변을\s*본)/.test(clean)
      && !/(통과|빠져나|벗어나|건너|돌파|달려|뛰어|이동|간다|나간다)/.test(clean);
    if (observeOnly) {
      return {
        outcome: "INFO", progress: "NONE", selfExposure: "NONE",
        targetName: "", targetExposure: "NONE",
        observationNote: "위험의 반복과 안전한 틈을 살펴 다음 행동에 이용할 수 있다.",
        usedItemId: "", usedItemContaminated: false,
        narration: `${nameForId(uid)}는 서두르지 않고 눈앞의 위험이 반복되는 양상을 살핀다. 움직임 사이에 짧게 비는 틈과 위험한 경계가 전보다 또렷하게 보인다.`,
      };
    }

    const targetName = fallbackTargetName(clean, session, uid);
    const all = remainingCount <= 1 || /(끝까지|빠져나|벗어나|정면돌파|통과|돌파|계속\s*(?:달|뛰|간))/.test(clean);
    const careful = /(틈|타이밍|피해|우회|기다렸다|천천히|몸을\s*낮|피하면서)/.test(clean);
    const forceful = /(달려|뛰어|무시|정면돌파|밀치|돌진)/.test(clean);
    const outcome = careful ? "SUCCESS" : "PARTIAL";
    const selfExposure = careful ? "NONE" : forceful ? "MEDIUM" : "LOW";
    const progress = all ? "ALL" : "CURRENT";
    return {
      outcome,
      progress,
      selfExposure: targetName ? "LOW" : selfExposure,
      targetName,
      targetExposure: targetName ? "MEDIUM" : "NONE",
      observationNote: "",
      usedItemId: "",
      usedItemContaminated: false,
      narration: targetName
        ? `${nameForId(uid)}는 ${targetName}를 앞쪽으로 밀어내며 그 틈을 따라 몸을 움직인다. 위험의 방향이 흐트러진 사이 앞으로 나아가지만, 밀려난 쪽이 더 가까이 노출된다.`
        : `${nameForId(uid)}는 망설이지 않고 선언한 방식대로 위험 구간을 파고든다. 완전히 안전한 선택은 아니지만 움직임은 끊기지 않고 앞쪽으로 이어진다.`,
    };
  }

  function normalizeDecision(value, fallback) {
    const allowedOutcome = new Set(["SUCCESS", "PARTIAL", "FAIL", "INFO"]);
    const allowedProgress = new Set(["NONE", "CURRENT", "ALL"]);
    const allowedExposure = new Set(["NONE", "LOW", "MEDIUM", "HIGH"]);
    if (!value || typeof value !== "object") return fallback;
    return {
      outcome: allowedOutcome.has(value.outcome) ? value.outcome : fallback.outcome,
      progress: allowedProgress.has(value.progress) ? value.progress : fallback.progress,
      selfExposure: allowedExposure.has(value.selfExposure) ? value.selfExposure : fallback.selfExposure,
      targetName: String(value.targetName || "").trim(),
      targetExposure: allowedExposure.has(value.targetExposure) ? value.targetExposure : "NONE",
      observationNote: String(value.observationNote || "").trim().slice(0, 280),
      usedItemId: String(value.usedItemId || "").trim(),
      usedItemContaminated: Boolean(value.usedItemContaminated),
      narration: String(value.narration || fallback.narration).trim(),
    };
  }

  async function resolveWithAI(payload) {
    const commands = window.__BAEKJI_PLAYER_WORLD_COMMANDS__;
    if (!commands?.dispatch) throw new Error("PLAYER_WORLD_COMMANDS_UNAVAILABLE");
    return commands.dispatch("RESOLVE_FLEXIBLE_HAZARD_V1", payload);
  }

  function clearComposer() {
    const input = document.querySelector("[data-chat-input]");
    if (!input) return;
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
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

  function shouldHandle(action, snapshot, uid) {
    const text = String(action || "").trim();
    if (!text.startsWith("/")) return false;
    if (/^\/(?:지도|맵|map)(?:\s|$)/i.test(text)) return false;
    return Boolean(sessionForUser(snapshot, uid)?.activeEncounter);
  }

  async function handleFlexibleSubmit() {
    if (resolving) return true;
    const input = document.querySelector("[data-chat-input]");
    const action = String(input?.value || "").trim();
    const snapshot = readState();
    const uid = currentUserId();
    if (!snapshot || !uid || !shouldHandle(action, snapshot, uid)) return false;
    const session = sessionForUser(snapshot, uid);
    const sessionId = session?.id;
    if (!sessionId) return false;
    const encounter = session.activeEncounter;
    const movementToken = session.lastMovementTransition?.kind === "ENCOUNTER"
      && session.lastMovementTransition.routeId === encounter.routeId
      ? String(session.lastMovementTransition.token || "")
      : "";
    const hazardIndex = encounter.currentIndex;
    const hazardId = encounter.hazards[hazardIndex];
    if (!movementToken) return false;

    resolving = true;
    setPending(true);
    try {
      const cleanAction = action.replace(/^\/+/, "").trim();
      const result = await resolveWithAI({
        sessionId,
        movementToken,
        hazardId,
        hazardIndex,
        actionText: cleanAction,
      });
      if (result?.status !== "APPLIED" && result?.status !== "REPLAY") return true;
      clearComposer();
      window.dispatchEvent(new CustomEvent("baekji-flex-hazard-resolved", { detail: { sessionId } }));
      return true;
    } finally {
      resolving = false;
      setPending(false);
    }
  }

  function interceptClick(event) {
    if (!event.target?.closest?.("[data-send-chat]")) return;
    const snapshot = readState();
    const uid = currentUserId();
    const action = document.querySelector("[data-chat-input]")?.value || "";
    if (!snapshot || !shouldHandle(action, snapshot, uid)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void handleFlexibleSubmit();
  }

  function interceptKeydown(event) {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    if (!event.target?.matches?.("[data-chat-input]")) return;
    const snapshot = readState();
    const uid = currentUserId();
    if (!snapshot || !shouldHandle(event.target.value, snapshot, uid)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    void handleFlexibleSubmit();
  }

  document.addEventListener("click", interceptClick, true);
  document.addEventListener("keydown", interceptKeydown, true);
  loadAccountDirectory();

  window.__BAEKJI_FLEX_HAZARD__ = Object.freeze({
    fallbackDecision,
    normalizeDecision,
    shouldHandle,
    hazardContext,
  });
})();
