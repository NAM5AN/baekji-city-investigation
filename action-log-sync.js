(() => {
  "use strict";

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const NARRATION_PENDING_KEY = "actionNarrationPending";
  const NARRATION_PENDING_AT_KEY = "actionNarrationPendingAt";
  const NARRATION_ABORT_MS = 15_000;
  const NARRATION_STALE_MS = 17_000;
  const USER_LABELS = {
    test_a: "테스트 캐릭터 A",
    test_b: "테스트 캐릭터 B",
    test_c: "테스트 캐릭터 C",
  };

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function unique(values) {
    return [...new Set(Array.isArray(values) ? values : [])];
  }

  function parseState(value) {
    try {
      const parsed = typeof value === "string" ? JSON.parse(value) : value;
      return parsed?.version === 3 ? parsed : null;
    } catch {
      return null;
    }
  }

  function spatialScopeKey(session) {
    if (!session) return "";
    if (session.movement) return `route:${session.movement.fromNode}:${session.movement.targetNode}`;
    if (session.activeEncounter) return `route:${session.activeEncounter.fromNode}:${session.activeEncounter.targetNode}`;
    if (session.currentDetailId) return `detail:${session.currentNode}:${session.currentDetailId}`;
    return `node:${session.currentNode}`;
  }

  function normalizedActionText(rawText) {
    return String(rawText || "")
      .trim()
      .replace(/^\/+\s*/, "")
      .replace(/[\[\](){}]/g, " ")
      .replace(/\s+/g, " ");
  }

  function observationalActionText(actorId, rawText) {
    const actorName = USER_LABELS[actorId] || "다른 조사자";
    const text = normalizedActionText(rawText);

    if (/(소리\s*(?:를\s*)?(?:지르|지른|질러)|소리치|고함|외치|고래고래|비명|목청|큰\s*소리|크게\s*(?:말|부르)|부르짖|호통|고성|함성)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 입을 크게 벌리고 몸을 앞으로 내밀며 주변을 향해 큰 소리로 외치는 모습이 보인다.`;
    }
    if (/(속삭|중얼|말하|말을\s*건|대답|질문|묻(?:는|는다|고|기)|이름을\s*부르|대화)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 누군가를 향해 입을 움직이며 말을 건네는 모습이 보인다.`;
    }
    if (/(지도|약도|구역도)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 접힌 지도를 펼쳐 주변 구조와 번갈아 대조하는 모습이 보인다.`;
    }
    if (/(귀를\s*기울|경청|듣(?:는|는다|고|기|자)|방송을\s*듣|잡음에\s*집중|발소리.*듣|기계음.*듣|소리가\s*나는\s*쪽)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 움직임을 줄이고 고개를 기울여 주변 소리에 귀를 기울이는 모습이 보인다.`;
    }
    if (/(내\s*(?:몸|피부|옷)|자기\s*(?:몸|상태)|상태\s*(?:확인|살펴)|오염도|상처|피가|통증)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 자신의 피부와 옷자락을 차례로 살피며 몸 상태를 확인하는 모습이 보인다.`;
    }
    if (/(숨(?:는|는다|기)|몸을\s*숨|웅크|엎드|몸을\s*낮)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 몸을 낮추고 주변 구조물 뒤로 조심스럽게 몸을 숨기는 모습이 보인다.`;
    }
    if (/(기다|멈춰|가만히|움직이지|정지)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 움직임을 멈춘 채 주변을 경계하며 기다리는 모습이 보인다.`;
    }
    if (/(손가락으로\s*가리|가리킨|지목|손짓|신호|고개짓)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 한쪽 방향을 가리키며 손짓으로 신호를 보내는 모습이 보인다.`;
    }
    if (/(열(?:어|고|기)|문을\s*연|닫(?:아|고|기)|문을\s*닫|손잡이)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 손잡이와 문틈을 살핀 뒤 문을 조심스럽게 움직이는 모습이 보인다.`;
    }
    if (/(밀(?:어|고|기)|당기|끌어|잡아당)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 두 손에 힘을 주어 눈앞의 물체를 밀거나 당기는 모습이 보인다.`;
    }
    if (/(줍|집어|들어\s*올|꺼내|가져|사용|도구|장갑|천|로프|손전등|점검봉)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 손을 뻗어 물건을 집거나 소지품을 꺼내 사용하는 모습이 보인다.`;
    }
    if (/(뛰|달려|전력|급히\s*가|서둘러)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 몸을 앞으로 기울인 채 빠른 걸음으로 현장을 가로지르는 모습이 보인다.`;
    }
    if (/(이동|간다|가자|걷|통과|건너|올라|내려|들어|나가|떠나)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 통로와 표지를 확인하며 한쪽 방향으로 이동하는 모습이 보인다.`;
    }
    if (/(본다|보다|봐|살펴|관찰|확인|조사|훑어|들여다|찾아|수색)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 시선을 천천히 옮기며 주변 구조와 흔적을 자세히 살피는 모습이 보인다.`;
    }
    if (/(피해|막아|잡아|닦아|건드|누르|밟아|만져|접촉)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 눈앞의 대상에 손을 뻗어 조심스럽게 대응하는 모습이 보인다.`;
    }
    return `가까운 곳에서 ${actorName}가 주변을 향해 손과 몸을 움직이며 무언가를 시도하는 모습이 보인다.`;
  }

  function makeObservationId(actionLogId, witnessSessionId) {
    return `field_action_${String(actionLogId || "unknown")}_${String(witnessSessionId || "unknown")}`;
  }

  function repairObservedActionTexts(state) {
    if (!state?.sessions) return state;
    const actions = new Map();
    Object.values(state.sessions).forEach((session) => {
      (session?.logs || []).forEach((entry) => {
        if (entry?.id && entry.type === "action-input" && entry.actorId) actions.set(entry.id, entry);
      });
    });
    Object.values(state.sessions).forEach((session) => {
      (session?.logs || []).forEach((entry) => {
        if (entry?.type !== "field-action" || !entry.sourceActionLogId) return;
        const source = actions.get(entry.sourceActionLogId);
        if (!source) return;
        entry.text = observationalActionText(source.actorId || entry.observedActorId, source.text);
        entry.observedActorId = source.actorId || entry.observedActorId || null;
        entry.observationTextVersion = 2;
      });
    });
    return state;
  }

  function enrichObservedActions(nextState, previousState) {
    const next = nextState;
    if (!next?.sessions) return next;
    const sessions = Object.values(next.sessions);

    sessions.forEach((sourceSession) => {
      if (!Array.isArray(sourceSession.logs)) sourceSession.logs = [];
      const previousLogs = previousState?.sessions?.[sourceSession.id]?.logs || [];
      const previousIds = new Set(previousLogs.map((entry) => entry?.id).filter(Boolean));

      sourceSession.logs.forEach((entry) => {
        if (entry?.type !== "action-input" || !entry.actorId) return;
        const isNewAction = Boolean(previousState && entry.id && !previousIds.has(entry.id));
        if (!entry.fieldObservationBroadcasted && isNewAction && sourceSession.status === "ACTIVE") {
          const sourceScope = spatialScopeKey(sourceSession);
          sessions
            .filter((candidate) =>
              candidate.id !== sourceSession.id &&
              candidate.status === "ACTIVE" &&
              candidate.variant === sourceSession.variant &&
              spatialScopeKey(candidate) === sourceScope
            )
            .forEach((witnessSession) => {
              if (!Array.isArray(witnessSession.logs)) witnessSession.logs = [];
              const observationId = makeObservationId(entry.id, witnessSession.id);
              if (witnessSession.logs.some((log) => log?.id === observationId || log?.sourceActionLogId === entry.id)) return;
              witnessSession.logs.push({
                id: observationId,
                type: "field-action",
                text: observationalActionText(entry.actorId, entry.text),
                actorId: null,
                at: Number(entry.at) || Date.now(),
                scopeKey: sourceScope,
                observedActorId: entry.actorId,
                observedSessionId: sourceSession.id,
                sourceActionLogId: entry.id,
                observationTextVersion: 2,
              });
            });
        }
        entry.fieldObservationBroadcasted = true;
      });
    });
    repairObservedActionTexts(next);
    return next;
  }

  function stripCompletedNarrationMarkers(state) {
    Object.values(state?.sessions || {}).forEach((session) => {
      (session.logs || []).forEach((entry) => {
        if (!entry?.aiNarrationFinal) return;
        delete entry[NARRATION_PENDING_KEY];
        delete entry[NARRATION_PENDING_AT_KEY];
      });
    });
    return state;
  }

  function visibleSystemEntries(session) {
    return (session?.logs || []).filter((entry) =>
      entry?.type === "action-input" ||
      (!entry?.actorId && entry?.type !== "interaction" && entry?.type !== "chat-divider")
    );
  }

  const TEST_API = Object.freeze({
    spatialScopeKey,
    normalizedActionText,
    observationalActionText,
    repairObservedActionTexts,
    enrichObservedActions,
    stripCompletedNarrationMarkers,
    visibleSystemEntries,
  });
  if (typeof window !== "undefined") window.__BAEKJI_ACTION_LOG_SYNC_TEST__ = TEST_API;

  if (
    typeof window === "undefined" ||
    typeof document === "undefined" ||
    typeof Storage === "undefined" ||
    typeof localStorage === "undefined"
  ) return;

  const nativeSetItem = Storage.prototype.setItem;
  const nativeGetItem = Storage.prototype.getItem;
  const markerTimers = new Map();
  const provisionalTimers = new Map();
  const confirmedNarrationLogIds = new Set();

  function readLiveState() {
    return parseState(nativeGetItem.call(localStorage, GLOBAL_KEY));
  }

  function aiNarrationLikely() {
    return Boolean(document.querySelector("[data-ai-status].is-ai-ready"));
  }

  function markProvisionalNarrationResults(nextState, previousState) {
    const markedIds = [];
    if (!aiNarrationLikely()) return markedIds;
    Object.values(nextState?.sessions || {}).forEach((session) => {
      const previousIds = new Set((previousState?.sessions?.[session.id]?.logs || []).map((entry) => entry?.id).filter(Boolean));
      const latestAction = [...(session.logs || [])].reverse().find((entry) => entry?.type === "action-input" && entry.actorId);
      if (!latestAction || Date.now() - Number(latestAction.at || 0) > 20_000) return;
      (session.logs || []).forEach((entry) => {
        if (!entry?.id || previousIds.has(entry.id) || !["scene", "fail", "success"].includes(entry.type) || entry.aiNarrationFinal) return;
        if (Number(entry.at || 0) < Number(latestAction.at || 0)) return;
        entry[NARRATION_PENDING_KEY] = true;
        entry[NARRATION_PENDING_AT_KEY] = Date.now();
        markedIds.push(entry.id);
      });
    });
    return markedIds;
  }

  function currentInvestigationSessionId() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    return parts[0] === "investigate" ? parts[1] || "" : "";
  }

  function markerEntries(state) {
    const entries = [];
    Object.values(state?.sessions || {}).forEach((session) => {
      (session.logs || []).forEach((entry) => {
        if (entry?.[NARRATION_PENDING_KEY]) entries.push({ sessionId: session.id, entry });
      });
    });
    return entries;
  }

  function applyPendingLineVisibility() {
    const sessionId = currentInvestigationSessionId();
    const state = readLiveState();
    const session = state?.sessions?.[sessionId];
    const lines = [...document.querySelectorAll(".retro-system-scroll .retro-system-line")];
    lines.forEach((line) => line.classList.remove("retro-action-result-pending"));
    if (!session) return;
    const entries = visibleSystemEntries(session);
    entries.forEach((entry, index) => {
      if (entry?.[NARRATION_PENDING_KEY]) lines[index]?.classList.add("retro-action-result-pending");
    });
  }

  function writeMarkerState(state) {
    nativeSetItem.call(localStorage, GLOBAL_KEY, JSON.stringify(state));
    queueMicrotask(applyPendingLineVisibility);
  }

  function clearNarrationMarker(logId) {
    const state = readLiveState();
    let changed = false;
    Object.values(state?.sessions || {}).forEach((session) => {
      const entry = (session.logs || []).find((candidate) => candidate?.id === logId);
      if (!entry?.[NARRATION_PENDING_KEY]) return;
      delete entry[NARRATION_PENDING_KEY];
      delete entry[NARRATION_PENDING_AT_KEY];
      changed = true;
    });
    if (changed) writeMarkerState(state);
    const timer = markerTimers.get(logId);
    if (timer) clearTimeout(timer);
    markerTimers.delete(logId);
    const provisionalTimer = provisionalTimers.get(logId);
    if (provisionalTimer) clearTimeout(provisionalTimer);
    provisionalTimers.delete(logId);
    confirmedNarrationLogIds.delete(logId);
    applyPendingLineVisibility();
  }

  function scheduleMarkerExpiry(logId, pendingAt) {
    const existing = markerTimers.get(logId);
    if (existing) clearTimeout(existing);
    const wait = Math.max(0, NARRATION_STALE_MS - (Date.now() - Number(pendingAt || Date.now())));
    markerTimers.set(logId, setTimeout(() => clearNarrationMarker(logId), wait));
  }

  function reconcileNarrationMarkers(state) {
    const active = new Set();
    markerEntries(state).forEach(({ entry }) => {
      active.add(entry.id);
      if (!markerTimers.has(entry.id)) scheduleMarkerExpiry(entry.id, entry[NARRATION_PENDING_AT_KEY]);
    });
    [...markerTimers.keys()].forEach((logId) => {
      if (active.has(logId)) return;
      clearTimeout(markerTimers.get(logId));
      markerTimers.delete(logId);
    });
    queueMicrotask(applyPendingLineVisibility);
  }

  function scheduleProvisionalClear(logId) {
    const existing = provisionalTimers.get(logId);
    if (existing) clearTimeout(existing);
    provisionalTimers.set(logId, setTimeout(() => {
      provisionalTimers.delete(logId);
      if (!confirmedNarrationLogIds.has(logId)) clearNarrationMarker(logId);
    }, 400));
  }

  function markNarrationPending(job) {
    confirmedNarrationLogIds.add(job.logId);
    const provisionalTimer = provisionalTimers.get(job.logId);
    if (provisionalTimer) clearTimeout(provisionalTimer);
    provisionalTimers.delete(job.logId);
    const state = readLiveState();
    const entry = state?.sessions?.[job.sessionId]?.logs?.find((candidate) => candidate?.id === job.logId);
    if (!entry) return;
    entry[NARRATION_PENDING_KEY] = true;
    entry[NARRATION_PENDING_AT_KEY] = Date.now();
    writeMarkerState(state);
    scheduleMarkerExpiry(entry.id, entry[NARRATION_PENDING_AT_KEY]);
    applyPendingLineVisibility();
  }

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    let nextValue = value;
    let parsedNext = null;
    let provisionalIds = [];
    if (this === localStorage && key === GLOBAL_KEY) {
      const previous = parseState(nativeGetItem.call(this, key));
      parsedNext = parseState(value);
      if (parsedNext) {
        enrichObservedActions(parsedNext, previous);
        provisionalIds = markProvisionalNarrationResults(parsedNext, previous);
        stripCompletedNarrationMarkers(parsedNext);
        repairObservedActionTexts(parsedNext);
        nextValue = JSON.stringify(parsedNext);
      }
    }
    const result = nativeSetItem.call(this, key, nextValue);
    if (this === localStorage && key === GLOBAL_KEY && parsedNext) {
      provisionalIds.forEach(scheduleProvisionalClear);
      reconcileNarrationMarkers(parsedNext);
    }
    return result;
  };

  if (typeof window.fetch === "function") {
    const nativeFetch = window.fetch.bind(window);
    window.fetch = async function patchedFetch(input, init = {}) {
      const url = typeof input === "string" ? input : input?.url || "";
      if (!String(url).includes("/api/narrate-action")) return nativeFetch(input, init);

      let job = null;
      try { job = JSON.parse(String(init?.body || "{}")); } catch { job = null; }
      if (!job?.sessionId || !job?.logId) return nativeFetch(input, init);

      markNarrationPending(job);
      const controller = typeof AbortController === "function" ? new AbortController() : null;
      const abortTimer = controller ? setTimeout(() => controller.abort(), NARRATION_ABORT_MS) : null;
      try {
        const response = await nativeFetch(input, { ...init, signal: controller?.signal || init?.signal });
        if (abortTimer) clearTimeout(abortTimer);
        if (!response.ok) clearNarrationMarker(job.logId);
        else setTimeout(() => {
          const state = readLiveState();
          const entry = state?.sessions?.[job.sessionId]?.logs?.find((candidate) => candidate?.id === job.logId);
          if (entry?.[NARRATION_PENDING_KEY]) clearNarrationMarker(job.logId);
        }, 3_000);
        return response;
      } catch (error) {
        if (abortTimer) clearTimeout(abortTimer);
        clearNarrationMarker(job.logId);
        throw error;
      }
    };
  }

  const style = document.createElement("style");
  style.textContent = ".retro-system-line.retro-action-result-pending{display:none!important}";
  document.head?.appendChild(style);

  const observer = new MutationObserver(applyPendingLineVisibility);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", applyPendingLineVisibility);
  window.addEventListener("storage", (event) => {
    if (event.key !== GLOBAL_KEY) return;
    const state = parseState(event.newValue) || readLiveState();
    reconcileNarrationMarkers(state);
  });
  window.addEventListener("pageshow", () => reconcileNarrationMarkers(readLiveState()));
  reconcileNarrationMarkers(readLiveState());
})();
