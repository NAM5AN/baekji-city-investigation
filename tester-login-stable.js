(() => {
  "use strict";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const SESSION_PROFILE_KEY = "baekji_city_tester_session_profile_v1";
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
    // Login succeeds only after the server-side bootstrap RPC has created a
    // missing actor. The browser keeps this hook for flow compatibility only.
    return Boolean(userId);
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

  function sessionSafeUser(user) {
    const name = String(user?.name || user?.loginId || "").trim();
    return {
      id: String(user?.id || ""),
      loginId: String(user?.loginId || name),
      name,
      password: "",
      initial: String(user?.initial || Array.from(name || "?")[0] || "?"),
      note: String(user?.note || "초대 테스터 계정"),
      profilePhoto: String(user?.profilePhoto || ""),
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

  function reloadHome() {
    const homeUrl = `${location.pathname || "/"}${location.search || ""}#/home`;
    try {
      history.replaceState(null, "", homeUrl);
    } catch {
      location.hash = "#/home";
    }
    location.reload();
  }

  function completeVerifiedLogin(user) {
    const userId = String(user?.id || "");
    const name = String(user?.name || user?.loginId || "").trim();
    if (!userId || !name) throw new Error("LOGIN_SESSION_FAILED");

    const previousUserId = sessionStorage.getItem(USER_KEY);
    const previousProfile = sessionStorage.getItem(SESSION_PROFILE_KEY);
    try {
      sessionStorage.setItem(USER_KEY, userId);
      sessionStorage.setItem(SESSION_PROFILE_KEY, JSON.stringify(sessionSafeUser(user)));
      ensureCharacter(userId);
      if (sessionStorage.getItem(USER_KEY) !== userId) throw new Error("LOGIN_SESSION_FAILED");
      reloadHome();
    } catch (error) {
      if (previousUserId) sessionStorage.setItem(USER_KEY, previousUserId);
      else sessionStorage.removeItem(USER_KEY);
      if (previousProfile) sessionStorage.setItem(SESSION_PROFILE_KEY, previousProfile);
      else sessionStorage.removeItem(SESSION_PROFILE_KEY);
      throw error;
    }
  }

  function errorMessage(error) {
    if (error?.name === "AbortError") return "로그인 서버 응답이 지연되고 있습니다. 다시 시도해 주세요.";
    if (["LOGIN_SERVER_FAILED", "FETCH_UNAVAILABLE"].includes(String(error?.message || ""))) return "로그인 서버에 연결하지 못했습니다. 다시 시도해 주세요.";
    if (String(error?.message || "") === "LOGIN_SESSION_FAILED") return "로그인 연결을 완료하지 못했습니다. 새로고침 후 다시 시도해 주세요.";
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
      if (message?.isConnected !== false) message.textContent = "접속 중입니다…";
      completeVerifiedLogin(user);
    } catch (error) {
      if (message?.isConnected !== false) message.textContent = errorMessage(error);
      busyForms.delete(form);
      if (submit?.isConnected !== false) submit.disabled = false;
    }
  }

  window.__BAEKJI_TESTER_LOGIN_STABLE_TEST__ = Object.freeze({
    normalize,
    loginQueryName,
    shouldHandleLoginName,
    toUser,
    sessionSafeUser,
    ensureCharacter,
    verifyLogin,
    completeVerifiedLogin,
    reloadHome,
  });
  const persistence = window.__BAEKJI_WORLD_PERSISTENCE__;
  if (!persistence) return;

  document.addEventListener("submit", handleSubmit, true);
})();
