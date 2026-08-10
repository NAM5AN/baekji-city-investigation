(() => {
  "use strict";

  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const ADMIN_ID_PATTERN = /^AD\d+$/i;
  const LEGACY_LOGIN_ALIASES = new Map([
    [normalize("캐릭터A"), "테스트 캐릭터 A"],
    [normalize("캐릭터B"), "테스트 캐릭터 B"],
    [normalize("캐릭터C"), "테스트 캐릭터 C"],
  ]);
  const busyForms = new WeakSet();
  const nativeFetch = typeof window.fetch === "function" ? window.fetch.bind(window) : null;

  function normalize(value) {
    return String(value || "").replace(/\s+/g, "").toLowerCase();
  }

  function loginQueryName(value) {
    const raw = String(value || "").trim();
    return LEGACY_LOGIN_ALIASES.get(normalize(raw)) || raw;
  }

  function shouldHandleLoginName(value) {
    const raw = String(value || "").trim();
    return Boolean(raw) && !ADMIN_ID_PATTERN.test(raw);
  }

  function blankWorld() {
    return {
      version: 3,
      storyDay: 1,
      loopId: "LOOP-001",
      eventSeq: 0,
      sessionSeq: 0,
      characters: {},
      parties: {},
      sessions: {},
      itemClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
    };
  }

  function ensureCharacter(userId) {
    let snapshot;
    try { snapshot = JSON.parse(localStorage.getItem(GLOBAL_KEY) || "null"); }
    catch { snapshot = null; }
    if (!snapshot || snapshot.version !== 3) snapshot = blankWorld();
    snapshot.characters ||= {};
    snapshot.parties ||= {};
    snapshot.sessions ||= {};
    snapshot.itemClaimsByVariant ||= { a: {}, b: {}, c: {}, d: {} };

    const current = snapshot.characters[userId];
    if (current && typeof current === "object" && !Array.isArray(current)) {
      let changed = false;
      if (current.id !== userId) { current.id = userId; changed = true; }
      if (!Number.isFinite(Number(current.contamination))) { current.contamination = 0; changed = true; }
      if (!String(current.symptom || "").trim()) { current.symptom = "안정"; changed = true; }
      if (!current.inventory || typeof current.inventory !== "object" || Array.isArray(current.inventory)) { current.inventory = {}; changed = true; }
      if (!("currentPartyId" in current)) { current.currentPartyId = null; changed = true; }
      if (!("currentSessionId" in current)) { current.currentSessionId = null; changed = true; }
      if (!("onlineAt" in current)) { current.onlineAt = null; changed = true; }
      if (changed) localStorage.setItem(GLOBAL_KEY, JSON.stringify(snapshot));
      return;
    }

    snapshot.characters[userId] = {
      id: userId,
      contamination: 0,
      symptom: "안정",
      inventory: {},
      currentPartyId: null,
      currentSessionId: null,
      onlineAt: null,
    };
    localStorage.setItem(GLOBAL_KEY, JSON.stringify(snapshot));
  }

  function toUser(payload, pin) {
    const name = String(payload?.characterName || "").trim();
    return {
      id: String(payload?.id || ""),
      loginId: name,
      name,
      password: String(pin || ""),
      initial: Array.from(name || "?")[0] || "?",
      note: "초대 테스터 계정",
      profilePhoto: String(payload?.profilePhoto || ""),
      isTestOnly: true,
    };
  }

  async function verifyLogin(characterName, pin) {
    if (!nativeFetch) throw new Error("FETCH_UNAVAILABLE");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7500);
    try {
      const response = await nativeFetch("/api/tester-login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ characterName: loginQueryName(characterName), pin }),
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok || !payload?.user?.id) {
        const error = new Error(response.status === 401 ? "LOGIN_FAILED" : "LOGIN_SERVER_FAILED");
        error.status = response.status;
        throw error;
      }
      return payload.user;
    } finally {
      clearTimeout(timeout);
    }
  }

  function navigateHome() {
    if (location.hash === "#/home") {
      try { window.dispatchEvent(new HashChangeEvent("hashchange")); }
      catch { window.dispatchEvent(new Event("hashchange")); }
      return;
    }
    location.hash = "#/home";
  }

  function completeVerifiedLogin(user, pin) {
    const guard = window.__BAEKJI_TESTER_REGISTRY_GUARD__;
    const userId = String(user?.id || "");
    if (!userId || !guard?.registerTester?.(user)) throw new Error("TESTER_REGISTRY_UNAVAILABLE");

    const previousUserId = sessionStorage.getItem(USER_KEY);
    sessionStorage.setItem(USER_KEY, userId);
    try {
      guard.rememberCurrentTester?.();
      ensureCharacter(userId);
      if (sessionStorage.getItem(USER_KEY) !== userId) throw new Error("LOGIN_SESSION_FAILED");
      navigateHome();
      window.dispatchEvent(new CustomEvent("baekji-tester-stable-login", { detail: { userId } }));
      window.dispatchEvent(new CustomEvent("baekji-tester-fast-login", { detail: { userId } }));
    } catch (error) {
      if (previousUserId) sessionStorage.setItem(USER_KEY, previousUserId);
      else sessionStorage.removeItem(USER_KEY);
      throw error;
    }
  }

  function errorMessage(error) {
    if (error?.name === "AbortError") return "로그인 서버 응답이 지연되고 있습니다. 다시 시도해 주세요.";
    if (["LOGIN_SERVER_FAILED", "FETCH_UNAVAILABLE"].includes(String(error?.message || ""))) return "로그인 서버에 연결하지 못했습니다. 다시 시도해 주세요.";
    if (["LOGIN_SESSION_FAILED", "TESTER_REGISTRY_UNAVAILABLE"].includes(String(error?.message || ""))) return "로그인 연결을 완료하지 못했습니다. 새로고침 후 다시 시도해 주세요.";
    return "캐릭터 이름 또는 비밀번호가 일치하지 않습니다.";
  }

  async function handleSubmit(event) {
    const form = event.target;
    if (!form?.matches?.("[data-login-form]")) return;

    const nameInput = form.querySelector("[data-login-id]");
    const passwordInput = form.querySelector("[data-login-password]");
    const name = String(nameInput?.value || "").trim();
    if (!shouldHandleLoginName(name)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (busyForms.has(form)) return;
    busyForms.add(form);

    const pin = String(passwordInput?.value || "");
    const message = form.querySelector("[data-login-error]");
    const submit = form.querySelector('button[type="submit"], input[type="submit"]');
    if (submit) submit.disabled = true;
    if (message) message.textContent = "계정을 확인하고 있습니다…";

    try {
      const payload = await verifyLogin(name, pin);
      const user = toUser(payload, pin);
      completeVerifiedLogin(user, pin);
      if (message?.isConnected !== false) message.textContent = "";
    } catch (error) {
      if (message?.isConnected !== false) message.textContent = errorMessage(error);
    } finally {
      busyForms.delete(form);
      if (submit?.isConnected !== false) submit.disabled = false;
    }
  }

  window.__BAEKJI_TESTER_LOGIN_STABLE_TEST__ = Object.freeze({
    normalize,
    loginQueryName,
    shouldHandleLoginName,
    toUser,
    ensureCharacter,
    verifyLogin,
    completeVerifiedLogin,
    navigateHome,
  });

  document.addEventListener("submit", handleSubmit, true);
})();
