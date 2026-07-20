(() => {
  "use strict";

  const KEY = "baekji_city_mvp_state_v3";
  const TIMEOUT = 15000;
  const STALE = 25000;
  const NAMES = { test_a: "테스트 캐릭터 A", test_b: "테스트 캐릭터 B", test_c: "테스트 캐릭터 C" };

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
    const privateSpeech = /(혼잣말|중얼|웅얼|속삭|나지막|작은\s*목소리|입안에서)/.test(text);
    const publicSpeech = /(소리\s*(?:를\s*)?(?:지르|지른|질러)|소리치|외치|고함|고성|큰\s*소리|목청|고래고래|비명|호통|함성|크게\s*(?:말|부르))/.test(text);
    if (privateSpeech && !publicSpeech) return { mode: "PRIVATE", quote };
    if (publicSpeech) return { mode: quote ? "PUBLIC_QUOTE" : "PUBLIC", quote };
    return { mode: "NONE", quote };
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

  function collectJobs(state, now = Date.now()) {
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
      const fallback = targets.find((entry) => entry.text)?.text || "";
      const speech = speechVisibility(source.text);
      source.fieldObservationAiStatus = "pending";
      source.fieldObservationAiRequestedAt = now;
      source.fieldObservationSpeechMode = speech.mode;
      targets.forEach((entry) => {
        entry.observationFallbackText ||= entry.text || fallback;
        entry.observationAiPending = true;
        entry.observationAiFinal = false;
      });
      jobs.push({ actionId, actorName: NAMES[source.actorId] || "다른 조사자", actionText: clean(source.text), fallback, speechMode: speech.mode, quotedSpeech: speech.quote });
    });
    return jobs;
  }

  const API = Object.freeze({ extractQuote, speechVisibility, collectJobs });
  if (typeof window !== "undefined") window.__BAEKJI_OBSERVATION_AI_TEST__ = API;
  if (typeof window === "undefined" || typeof document === "undefined" || typeof Storage === "undefined" || typeof localStorage === "undefined") return;

  const previousSet = Storage.prototype.setItem;
  const previousGet = Storage.prototype.getItem;
  const running = new Set();

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
    const oldValue = previousGet.call(localStorage, KEY);
    const newValue = JSON.stringify(state);
    localStorage.setItem(KEY, newValue);
    notify(oldValue, newValue);
  }

  function finish(job, observation, status, error = "") {
    const state = parse(previousGet.call(localStorage, KEY));
    if (!state) return;
    const source = actionsOf(state).get(job.actionId)?.entry;
    if (!source) return;
    Object.values(state.sessions || {}).forEach((session) => (session.logs || []).forEach((entry) => {
      if (entry?.type !== "field-action" || entry.sourceActionLogId !== job.actionId) return;
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
        jobs = collectJobs(state);
        nextValue = JSON.stringify(state);
      }
    }
    const result = previousSet.call(this, key, nextValue);
    jobs.forEach((job) => queueMicrotask(() => request(job)));
    queueMicrotask(applyPending);
    return result;
  };

  function applyPending() {
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    const session = parse(previousGet.call(localStorage, KEY))?.sessions?.[parts[0] === "investigate" ? parts[1] : ""];
    const lines = [...document.querySelectorAll(".retro-system-scroll .retro-system-line")];
    lines.forEach((line) => line.classList.remove("retro-observation-result-pending"));
    if (!session) return;
    visibleEntries(session).forEach((entry, index) => { if (entry?.observationAiPending) lines[index]?.classList.add("retro-observation-result-pending"); });
  }

  const style = document.createElement("style");
  style.textContent = ".retro-system-line.retro-observation-result-pending{display:none!important}";
  document.head?.appendChild(style);
  new MutationObserver(applyPending).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", applyPending);
  window.addEventListener("storage", (event) => { if (event.key === KEY) applyPending(); });
  window.addEventListener("pageshow", applyPending);
  applyPending();
})();
