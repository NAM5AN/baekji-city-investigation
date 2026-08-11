(() => {
  "use strict";

  const KEY = "baekji_city_mvp_state_v3";
  const TIMEOUT = 15000;
  const STALE = 25000;
  const NAMES = { test_a: "테스트 캐릭터 A", test_b: "테스트 캐릭터 B", test_c: "테스트 캐릭터 C" };
  const EVENT_PREFIX = "world_event_";

  function actorNameForId(actorId) {
    const key = String(actorId || "");
    const registered = window.__BAEKJI_TESTER_REGISTRY_GUARD__?.values?.().find((entry) => String(entry?.id || "") === key);
    if (registered?.name || registered?.loginId) return String(registered.name || registered.loginId).trim();
    if (typeof sessionStorage !== "undefined") {
      try {
        const profile = JSON.parse(sessionStorage.getItem("baekji_city_tester_session_profile_v1") || "null");
        if (String(profile?.id || "") === key && (profile?.name || profile?.loginId)) return String(profile.name || profile.loginId).trim();
      } catch { /* ignore */ }
    }
    return NAMES[key] || "다른 조사자";
  }

  function parse(value) {
    try {
      const state = typeof value === "string" ? JSON.parse(value) : value;
      return state?.version === 3 ? state : null;
    } catch { return null; }
  }

  function clean(value) {
    return String(value || "").trim().replace(/^\/+\s*/, "").replace(/\s+/g, " ");
  }

  function extractQuote(raw) {
    const text = clean(raw);
    for (const pattern of [/“([^”]{1,240})”/, /"([^"]{1,240})"/, /‘([^’]{1,240})’/, /'([^']{1,240})'/]) {
      const match = text.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return "";
  }

  function speechVisibility(raw) {
    const text = clean(raw);
    const quote = extractQuote(text);
    const internal = /(마음속|머릿속|속으로\s*(?:생각|말)|생각(?:한|하|했|한다|한다는|하며)|떠올린|상상)/.test(text);
    const privateSpeech = /(혼잣말|중얼|웅얼|속삭|나지막|작은\s*목소리|입안에서|귓속말)/.test(text);
    const loudSpeech = /(소리\s*(?:를\s*)?(?:크게\s*)?(?:지르|지른|질러)|크게\s*소리(?:를)?\s*(?:지르|지른|질러)|소리치|외치|고함|고성|큰\s*소리|목청|고래고래|비명|호통|함성|부르짖|크게\s*(?:말|부르))/.test(text);
    const ordinarySpeech = /(말하|말해|말했|말을\s*(?:건네|걸|한다)|대답|질문|묻(?:는|는다|고|기)|부르(?:는|고|며)|발화|이야기)/.test(text);
    if (internal) return { mode: "INTERNAL", quote, volume: "NONE" };
    if (privateSpeech && !loudSpeech) return { mode: "PRIVATE", quote, volume: "LOW" };
    if (loudSpeech) return { mode: quote ? "PUBLIC_QUOTE" : "PUBLIC", quote, volume: "LOUD" };
    if (quote || ordinarySpeech) return { mode: quote ? "PUBLIC_QUOTE" : "PUBLIC", quote, volume: "NORMAL" };
    return { mode: "NONE", quote: "", volume: "NONE" };
  }

  function visualVisibility(raw) {
    const text = clean(raw);
    if (/(주머니|포켓).*(?:속|안)|(?:속|안).*?(?:주머니|포켓)/.test(text)) return { mode: "OCCLUDED", kind: "POCKET" };
    if (/(가방|배낭|파우치).*(?:속|안)|(?:속|안).*?(?:가방|배낭|파우치)/.test(text)) return { mode: "OCCLUDED", kind: "BAG" };
    if (/(책상|탁자|테이블).*(?:아래|밑)|(?:아래|밑).*?(?:책상|탁자|테이블)/.test(text)) return { mode: "OCCLUDED", kind: "UNDER_TABLE" };
    if (/(등\s*뒤|몸\s*뒤|뒤로\s*숨|등에\s*가려|몸에\s*가려)/.test(text)) return { mode: "OCCLUDED", kind: "BEHIND_BODY" };
    if (/(소매|옷|재킷|자켓|코트).*(?:속|안쪽)|(?:속|안쪽).*?(?:소매|옷|재킷|자켓|코트)/.test(text)) return { mode: "OCCLUDED", kind: "CLOTHING" };
    if (/(시야\s*밖|보이지\s*않(?:는|게)|가려진\s*(?:곳|채)|사각지대|완전히\s*가린)/.test(text)) return { mode: "OCCLUDED", kind: "GENERIC" };
    return { mode: "VISIBLE", kind: "VISIBLE" };
  }

  function occludedFallback(actorName, kind) {
    if (kind === "POCKET") return `가까운 곳에서 ${actorName}가 주머니에 한 손을 넣은 채 안쪽에서 손을 움직이는 모습이 보인다.`;
    if (kind === "BAG") return `가까운 곳에서 ${actorName}가 가방 안쪽으로 한 손을 넣고 보이지 않는 곳에서 손을 움직이는 모습이 보인다.`;
    if (kind === "UNDER_TABLE") return `가까운 곳에서 ${actorName}가 한 손을 책상 아래로 내린 채 보이지 않는 곳에서 손을 움직이는 모습이 보인다.`;
    if (kind === "BEHIND_BODY") return `가까운 곳에서 ${actorName}가 한 손을 등 뒤로 가져가 몸에 가린 채 손을 움직이는 모습이 보인다.`;
    if (kind === "CLOTHING") return `가까운 곳에서 ${actorName}가 옷 안쪽으로 손을 넣고 가려진 곳에서 손을 움직이는 모습이 보인다.`;
    return `가까운 곳에서 ${actorName}가 몸이나 주변 물체에 가려진 곳으로 손을 가져가 무언가를 움직이는 모습이 보인다.`;
  }

  function observerSafeFallback(actorId, raw, existingFallback = "") {
    const actorName = actorNameForId(actorId);
    const visual = visualVisibility(raw);
    const speech = speechVisibility(raw);
    const parts = [];
    if (visual.mode === "OCCLUDED") parts.push(occludedFallback(actorName, visual.kind));
    else if (speech.mode === "INTERNAL") parts.push(`가까운 곳에서 ${actorName}에게서 겉으로 드러나는 뚜렷한 발화는 들리지 않는다.`);
    else if (existingFallback) parts.push(String(existingFallback).trim());
    else parts.push(`가까운 곳에서 ${actorName}가 손과 몸을 움직이는 모습이 보인다.`);

    if (speech.mode === "PRIVATE") {
      parts.push(`${actorName}가 작은 목소리로 중얼거리지만 정확한 내용까지는 알아듣기 어렵다.`);
    } else if (speech.mode === "PUBLIC_QUOTE" && speech.quote) {
      const manner = speech.volume === "LOUD" ? "큰 목소리로" : "또렷한 목소리로";
      parts.push(`${actorName}의 ${manner} "${speech.quote}"라는 말이 들린다.`);
    } else if (speech.mode === "PUBLIC" && speech.volume !== "NONE") {
      parts.push(`${actorName}가 알아들을 수 있는 목소리로 말을 한다.`);
    }
    return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
  }

  function actionsOf(state) {
    const actions = new Map();
    Object.values(state?.sessions || {}).forEach((session) => (session.logs || []).forEach((entry) => {
      if (entry?.id && entry.type === "action-input" && entry.actorId) actions.set(entry.id, { entry, session });
    }));
    return actions;
  }

  function visibleEntries(session) {
    const shared = window.__BAEKJI_ACTION_LOG_SYNC_TEST__?.visibleSystemEntries;
    if (typeof shared === "function") return shared(session);
    return (session?.logs || []).filter((entry) => entry?.type === "action-input" || (!entry?.actorId && entry?.type !== "interaction" && entry?.type !== "chat-divider"));
  }

  function deterministicEventId(action) {
    if (!action?.id) return "";
    return String(action.eventId || action.interactionEventId || `${EVENT_PREFIX}${action.id}`);
  }

  function ensureEventIds(state) {
    if (!state?.sessions) return state;
    const actionMap = new Map();
    const interactionMap = new Map();
    Object.values(state.sessions).forEach((session) => (session.logs || []).forEach((entry) => {
      if (entry?.type !== "action-input" || !entry.id) return;
      entry.eventId = deterministicEventId(entry);
      actionMap.set(String(entry.id), entry);
      if (entry.interactionEventId) interactionMap.set(String(entry.interactionEventId), entry);
    }));

    Object.values(state.sessions).forEach((session) => {
      const actions = (session.logs || []).filter((entry) => entry?.type === "action-input" && entry.id);
      (session.logs || []).forEach((entry) => {
        if (!entry || entry.type === "action-input") return;
        const source = entry.sourceActionLogId ? actionMap.get(String(entry.sourceActionLogId)) : null;
        const interactionSource = entry.interactionEventId ? interactionMap.get(String(entry.interactionEventId)) : null;
        if (source) entry.eventId = source.eventId;
        else if (interactionSource) {
          entry.sourceActionLogId ||= interactionSource.id;
          entry.eventId = interactionSource.eventId;
        }
        if (!entry.eventId && ["scene", "success", "fail"].includes(entry.type) && (entry.actionNarrationPending || entry.aiNarrationFinal)) {
          const at = Number(entry.at || 0);
          const candidate = [...actions].reverse().find((action) => {
            const actionAt = Number(action.at || 0);
            return actionAt <= at && at - actionAt <= 30_000;
          });
          if (candidate) {
            entry.sourceActionLogId = candidate.id;
            entry.eventId = candidate.eventId;
          }
        }
      });
    });
    return state;
  }

  function eventKeyForEntry(entry) {
    if (!entry) return "";
    if (entry.eventId) return String(entry.eventId);
    if (entry.interactionEventId) return `interaction_${entry.interactionEventId}`;
    if (entry.sourceActionLogId) return `${EVENT_PREFIX}${entry.sourceActionLogId}`;
    if (entry.type === "action-input" && entry.id) return deterministicEventId(entry);
    return "";
  }

  function groupEventEntries(entries) {
    const groups = new Map();
    const standalone = [];
    (entries || []).forEach((entry, index) => {
      const key = eventKeyForEntry(entry);
      if (!key) {
        standalone.push({ key: `standalone_${entry?.id || index}`, anchorIndex: index, items: [{ entry, index }] });
        return;
      }
      if (!groups.has(key)) groups.set(key, { key, anchorIndex: index, items: [] });
      const group = groups.get(key);
      group.anchorIndex = Math.min(group.anchorIndex, index);
      group.items.push({ entry, index });
    });
    return [...groups.values(), ...standalone].sort((a, b) => a.anchorIndex - b.anchorIndex);
  }

  function collectJobs(state, now = Date.now()) {
    ensureEventIds(state);
    const jobs = [];
    const actions = actionsOf(state);
    const groups = new Map();
    Object.values(state?.sessions || {}).forEach((session) => (session.logs || []).forEach((entry) => {
      if (entry?.type !== "field-action" || !entry.sourceActionLogId) return;
      const list = groups.get(entry.sourceActionLogId) || [];
      list.push(entry);
      groups.set(entry.sourceActionLogId, list);
    }));

    groups.forEach((targets, actionId) => {
      const source = actions.get(actionId)?.entry;
      if (!source || source.fieldObservationAiStatus === "final") return;
      const fresh = source.fieldObservationAiStatus === "pending" && now - Number(source.fieldObservationAiRequestedAt || 0) < STALE;
      if (fresh) {
        targets.forEach((entry) => { if (!entry.observationAiFinal) entry.observationAiPending = true; });
        return;
      }
      const originalFallback = targets.find((entry) => entry.text)?.text || "";
      const fallback = observerSafeFallback(source.actorId, source.text, originalFallback);
      const speech = speechVisibility(source.text);
      const visual = visualVisibility(source.text);
      source.fieldObservationAiStatus = "pending";
      source.fieldObservationAiRequestedAt = now;
      source.fieldObservationSpeechMode = speech.mode;
      source.fieldObservationSpeechVolume = speech.volume;
      source.fieldObservationVisualMode = visual.mode;
      targets.forEach((entry) => {
        entry.eventId = source.eventId;
        entry.observationFallbackText = fallback;
        entry.observationAiPending = true;
        entry.observationAiFinal = false;
      });
      jobs.push({
        actionId,
        eventId: source.eventId,
        actorName: actorNameForId(source.actorId),
        actionText: clean(source.text),
        fallback,
        speechMode: speech.mode,
        speechVolume: speech.volume,
        quotedSpeech: speech.quote,
        visualMode: visual.mode,
        visualKind: visual.kind,
      });
    });
    return jobs;
  }

  const API = Object.freeze({
    extractQuote,
    speechVisibility,
    visualVisibility,
    observerSafeFallback,
    actorNameForId,
    deterministicEventId,
    ensureEventIds,
    eventKeyForEntry,
    groupEventEntries,
    collectJobs,
  });
  if (typeof window !== "undefined") window.__BAEKJI_OBSERVATION_AI_TEST__ = API;
  if (typeof window === "undefined" || typeof document === "undefined" || typeof Storage === "undefined" || typeof localStorage === "undefined") return;

  const previousSet = Storage.prototype.setItem;
  const previousGet = Storage.prototype.getItem;
  const running = new Set();
  let decorating = false;

  function notify(oldValue, newValue) {
    try {
      window.dispatchEvent(new StorageEvent("storage", { key: KEY, oldValue, newValue, storageArea: localStorage, url: location.href }));
    } catch {
      const event = new Event("storage");
      Object.defineProperty(event, "key", { value: KEY });
      window.dispatchEvent(event);
    }
  }

  function save(state) {
    ensureEventIds(state);
    const oldValue = previousGet.call(localStorage, KEY);
    const newValue = JSON.stringify(state);
    localStorage.setItem(KEY, newValue);
    notify(oldValue, newValue);
  }

  function finish(job, observation, status, error = "") {
    const state = parse(previousGet.call(localStorage, KEY));
    if (!state) return;
    ensureEventIds(state);
    const source = actionsOf(state).get(job.actionId)?.entry;
    if (!source) return;
    Object.values(state.sessions || {}).forEach((session) => (session.logs || []).forEach((entry) => {
      if (entry?.type !== "field-action" || entry.sourceActionLogId !== job.actionId) return;
      entry.eventId = source.eventId;
      entry.text = status === "final" && observation ? observation : (entry.observationFallbackText || entry.text || job.fallback);
      entry.observationAiPending = false;
      entry.observationAiFinal = status === "final";
      entry.observationSource = status === "final" ? "ai" : "fallback";
      entry.observationTextVersion = status === "final" ? 3 : 2;
      if (error) entry.observationAiError = error;
      else delete entry.observationAiError;
    }));
    source.fieldObservationAiStatus = status;
    source.fieldObservationAiCompletedAt = Date.now();
    if (status === "final") source.fieldObservationAiText = observation;
    if (error) source.fieldObservationAiError = error;
    save(state);
  }

  async function request(job) {
    if (running.has(job.actionId)) return;
    running.add(job.actionId);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const response = await fetch("/api/narrate-observation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(job), cache: "no-store", signal: controller.signal });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.observation) throw new Error(payload?.error || `OBSERVATION_${response.status}`);
      finish(job, String(payload.observation), "final");
    } catch (error) {
      const code = error?.name === "AbortError" ? "AI_TIMEOUT" : String(error?.message || "AI_FAILED").slice(0, 80);
      finish(job, "", "fallback", code);
    } finally {
      clearTimeout(timer);
      running.delete(job.actionId);
    }
  }

  Storage.prototype.setItem = function patchedSetItem(key, value) {
    let nextValue = value;
    let jobs = [];
    if (this === localStorage && key === KEY) {
      const state = parse(value);
      if (state) {
        ensureEventIds(state);
        jobs = collectJobs(state);
        nextValue = JSON.stringify(state);
      }
    }
    const result = previousSet.call(this, key, nextValue);
    jobs.forEach((job) => queueMicrotask(() => request(job)));
    queueMicrotask(applyPending);
    return result;
  };

  function currentSession() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    const sessionId = parts[0] === "investigate" ? parts[1] : "";
    return parse(previousGet.call(localStorage, KEY))?.sessions?.[sessionId] || null;
  }

  function pendingEntry(entry) {
    return Boolean(entry?.observationAiPending || entry?.actionNarrationPending);
  }

  function lineCopyText(entry) {
    return String(entry?.text || "").trim();
  }

  function decorateEventBlocks() {
    if (decorating) return;
    const session = currentSession();
    const container = document.querySelector(".retro-system-scroll");
    if (!session || !container) return;
    const entries = visibleEntries(session);
    const lines = [...container.querySelectorAll(".retro-system-line")];
    if (entries.length !== lines.length) return;
    const signature = entries.map((entry) => `${entry?.id || ""}:${eventKeyForEntry(entry)}:${entry?.observationAiPending ? 1 : 0}:${entry?.actionNarrationPending ? 1 : 0}:${String(entry?.text || "")}`).join("|");
    if (container.dataset.eventBlockSignature === signature) return;

    decorating = true;
    try {
      container.querySelectorAll(".retro-system-event-results,.retro-system-event-pending-copy").forEach((node) => node.remove());
      lines.forEach((line) => {
        line.classList.remove("retro-system-event-anchor", "retro-system-event-original-hidden");
        delete line.dataset.eventId;
      });

      groupEventEntries(entries).forEach((group) => {
        if (!group.key || group.key.startsWith("standalone_")) return;
        const sorted = [...group.items].sort((a, b) => {
          const priority = (item) => item.entry?.type === "action-input" ? 0 : ["field-action", "field-sound"].includes(item.entry?.type) ? 1 : 2;
          return priority(a) - priority(b) || a.index - b.index;
        });
        const anchor = sorted[0];
        const anchorLine = lines[anchor.index];
        if (!anchorLine) return;
        anchorLine.classList.add("retro-system-event-anchor");
        anchorLine.dataset.eventId = group.key;

        const results = sorted.slice(1);
        const pending = sorted.some(({ entry }) => pendingEntry(entry));
        if (!results.length && !pending) return;

        const resultBox = document.createElement("div");
        resultBox.className = "retro-system-event-results";
        resultBox.dataset.eventId = group.key;
        results.forEach(({ entry, index }) => {
          const original = lines[index];
          if (!original) return;
          original.classList.add("retro-system-event-original-hidden");
          if (pendingEntry(entry)) return;
          const text = lineCopyText(entry);
          if (!text) return;
          const copy = document.createElement("div");
          copy.className = "retro-system-event-result-copy";
          copy.textContent = text;
          resultBox.appendChild(copy);
        });
        if (pending) {
          const wait = document.createElement("div");
          wait.className = "retro-system-event-pending-copy";
          wait.textContent = sorted.some(({ entry }) => entry?.observationAiPending) ? "관찰 판정 중…" : "행동 결과 판정 중…";
          resultBox.appendChild(wait);
        }
        if (resultBox.childNodes.length) anchorLine.insertAdjacentElement("afterend", resultBox);
      });
      container.dataset.eventBlockSignature = signature;
    } finally {
      decorating = false;
    }
  }

  function applyPending() {
    const session = currentSession();
    const lines = [...document.querySelectorAll(".retro-system-scroll .retro-system-line")];
    lines.forEach((line) => line.classList.remove("retro-observation-result-pending"));
    if (session) {
      visibleEntries(session).forEach((entry, index) => { if (entry?.observationAiPending) lines[index]?.classList.add("retro-observation-result-pending"); });
    }
    decorateEventBlocks();
  }

  const style = document.createElement("style");
  style.textContent = `
    .retro-system-line.retro-observation-result-pending{display:none!important}
    .retro-system-line.retro-system-event-original-hidden{display:none!important}
    .retro-system-line.retro-system-event-anchor{border-left:3px solid #111;padding-left:8px;margin-top:5px;background:rgba(0,0,0,.025)}
    .retro-system-event-results{border-left:3px solid #111;margin:0 0 6px 0;padding:1px 8px 5px 18px;background:rgba(0,0,0,.025)}
    .retro-system-event-result-copy,.retro-system-event-pending-copy{position:relative;padding:3px 0 3px 12px;line-height:1.55}
    .retro-system-event-result-copy::before,.retro-system-event-pending-copy::before{content:"└";position:absolute;left:-6px;top:3px;font-weight:700}
    .retro-system-event-pending-copy{opacity:.62;font-size:.92em}
  `;
  document.head?.appendChild(style);
  new MutationObserver(applyPending).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", applyPending);
  window.addEventListener("storage", (event) => { if (event.key === KEY) applyPending(); });
  window.addEventListener("pageshow", applyPending);
  applyPending();
})();
