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

  function observationalActionText(actorId, rawText) {
    const actorName = USER_LABELS[actorId] || "다른 조사자";
    const text = String(rawText || "").trim().replace(/^\/+\s*/, "");
    if (/(지도|약도|구역도)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 접힌 지도를 펼쳐 주변 구조와 번갈아 대조하는 모습이 보인다.`;
    }
    if (/(듣|귀를|소리|방송|잡음|발소리|기계음)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 움직임을 줄이고 고개를 기울여 주변 소리에 귀를 기울이는 모습이 보인다.`;
    }
    if (/(내\s*(?:몸|피부|옷)|자기\s*(?:몸|상태)|상태\s*(?:확인|살펴)|오염도)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 자신의 피부와 옷자락을 차례로 살피며 상태를 확인하는 모습이 보인다.`;
    }
    if (/(기다|멈춰|가만히|움직이지)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 움직임을 멈춘 채 주변을 경계하며 기다리는 모습이 보인다.`;
    }
    if (/(본다|보다|봐|살펴|관찰|확인|조사|훑어)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 제자리에서 시선을 천천히 돌리며 주변 구조와 흔적을 살피는 모습이 보인다.`;
    }
    if (/(가져|꺼내|사용|도구|장갑|천|로프|손전등|점검봉)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 소지품을 꺼내 상태를 확인한 뒤 주변 상황에 맞춰 사용하는 모습이 보인다.`;
    }
    if (/(이동|간다|가자|걷|뛰|달려|통과|건너|올라|내려|들어)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 표지와 통로를 번갈아 살피며 이동할 방향을 가늠하는 모습이 보인다.`;
    }
    if (/(피해|막아|잡아|밀어|당겨|닦아|건드|누르|열어|닫아|밟아)/.test(text)) {
      return `가까운 곳에서 ${actorName}가 눈앞의 상황을 향해 몸을 낮추고 조심스럽게 대응하는 모습이 보인다.`;
    }
    return `가까운 곳에서 ${actorName}가 주변을 향해 손과 몸을 움직이며 무언가를 확인하는 모습이 보인다.`;
  }

  function makeObservationId(actionLogId, witnessSessionId) {
    return `field_action_${String(actionLogId || "unknown")}_${String(witnessSessionId || "unknown")}`;
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
              });
            });
        }
        entry.fieldObservationBroadcasted = true;
      });
    });
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
    observationalActionText,
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
