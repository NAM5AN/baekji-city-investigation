(() => {
  "use strict";

  const SUPABASE_URL = "https://kfgtvifupumjuewwxzmz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const DEMO_LOGIN_IDS = new Set(["캐릭터A", "캐릭터B", "캐릭터C"].map(normalize));
  const busyForms = new WeakSet();
  const passThroughForms = new WeakSet();

  function normalize(value) {
    return String(value || "").replace(/\s+/g, "").toLowerCase();
  }

  function shouldHandleLoginName(value) {
    const name = normalize(value);
    return Boolean(name) && !DEMO_LOGIN_IDS.has(name);
  }

  function toUser(row, password = "") {
    const name = String(row?.character_name || "").trim();
    return {
      id: String(row?.id || ""),
      loginId: name,
      name,
      password: String(password || ""),
      initial: Array.from(name || "?")[0] || "?",
      note: "초대 테스터 계정",
      profilePhoto: String(row?.profile_photo || ""),
      isTestOnly: true,
    };
  }

  function blankCharacter(userId) {
    return {
      id: userId,
      contamination: 0,
      symptom: "안정",
      inventory: {},
      currentPartyId: null,
      currentSessionId: null,
      onlineAt: Date.now(),
    };
  }

  function ensureCharacter(userId) {
    let snapshot;
    try {
      snapshot = JSON.parse(localStorage.getItem(GLOBAL_KEY) || "null");
    } catch {
      snapshot = null;
    }
    if (!snapshot || snapshot.version !== 3) {
      snapshot = {
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
    snapshot.characters ||= {};
    snapshot.parties ||= {};
    snapshot.sessions ||= {};
    snapshot.itemClaimsByVariant ||= { a: {}, b: {}, c: {}, d: {} };
    const character = snapshot.characters[userId] && typeof snapshot.characters[userId] === "object"
      ? snapshot.characters[userId]
      : blankCharacter(userId);
    character.id = userId;
    if (!Number.isFinite(Number(character.contamination))) character.contamination = 0;
    if (!character.symptom) character.symptom = "안정";
    if (!character.inventory || typeof character.inventory !== "object") character.inventory = {};
    if (!("currentPartyId" in character)) character.currentPartyId = null;
    if (!("currentSessionId" in character)) character.currentSessionId = null;
    snapshot.characters[userId] = character;
    localStorage.setItem(GLOBAL_KEY, JSON.stringify(snapshot));
  }

  async function rpcLogin(characterName, pin) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/baekji_tester_login`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ p_character_name: characterName, p_pin: pin }),
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`LOGIN_RPC_${response.status}`);
      const rows = await response.json();
      return Array.isArray(rows) ? rows[0] || null : null;
    } finally {
      clearTimeout(timeout);
    }
  }

  function replayIntoAppLogin(form, user) {
    const nameInput = form.querySelector("[data-login-id]");
    const originalName = String(nameInput?.value || "");
    const userId = String(user?.id || "");

    // tester-auth.js still owns legacy tester-name login interception. The core app,
    // however, also accepts user.id as a login alias. Use the UUID only for this
    // synchronous handoff so the legacy name interceptor cannot capture it again.
    if (nameInput) nameInput.value = userId;
    passThroughForms.add(form);
    try {
      const replay = new Event("submit", { bubbles: true, cancelable: true });
      form.dispatchEvent(replay);
    } finally {
      passThroughForms.delete(form);
    }

    if (sessionStorage.getItem(USER_KEY) !== userId) {
      if (nameInput?.isConnected !== false) nameInput.value = originalName;
      throw new Error("APP_LOGIN_HANDOFF_FAILED");
    }
  }

  async function handleSubmit(event) {
    const form = event.target;
    if (!form?.matches?.("[data-login-form]")) return;

    if (passThroughForms.has(form)) return;

    const nameInput = form.querySelector("[data-login-id]");
    const passwordInput = form.querySelector("[data-login-password]");
    const name = String(nameInput?.value || "").trim();
    if (!shouldHandleLoginName(name)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (busyForms.has(form)) return;
    busyForms.add(form);

    const message = form.querySelector("[data-login-error]");
    const submit = form.querySelector('button[type="submit"], input[type="submit"]');
    if (submit) submit.disabled = true;
    if (message) message.textContent = "계정을 확인하고 있습니다…";

    try {
      const pin = String(passwordInput?.value || "");
      const row = await rpcLogin(name, pin);
      if (!row?.id) throw new Error("LOGIN_FAILED");

      const user = toUser(row, pin);
      const guard = window.__BAEKJI_TESTER_REGISTRY_GUARD__;
      if (!guard?.registerTester?.(user)) throw new Error("TESTER_REGISTRY_UNAVAILABLE");

      ensureCharacter(user.id);
      replayIntoAppLogin(form, user);
      window.dispatchEvent(new CustomEvent("baekji-tester-fast-login", { detail: { userId: user.id } }));
    } catch (error) {
      if (message?.isConnected !== false) {
        if (message) {
          if (error?.name === "AbortError") {
            message.textContent = "로그인 서버 응답이 지연되고 있습니다. 다시 시도해 주세요.";
          } else if (String(error?.message || "") === "APP_LOGIN_HANDOFF_FAILED") {
            message.textContent = "로그인 연결을 완료하지 못했습니다. 다시 시도해 주세요.";
          } else {
            message.textContent = "캐릭터 이름 또는 비밀번호가 일치하지 않습니다.";
          }
        }
      }
    } finally {
      busyForms.delete(form);
      if (submit?.isConnected !== false) submit.disabled = false;
    }
  }

  window.__BAEKJI_TESTER_LOGIN_FASTPATH_TEST__ = Object.freeze({
    normalize,
    shouldHandleLoginName,
    toUser,
  });

  document.addEventListener("submit", handleSubmit, true);
})();
