(() => {
  "use strict";

  const SUPABASE_URL = "https://kfgtvifupumjuewwxzmz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const LEGACY_DEMO_IDS = ["test_a", "test_b", "test_c"];
  const users = new Map();
  let busy = false;
  let repairingState = false;
  let refreshQueued = false;
  let directorySignature = "";

  const normalize = (value) => String(value || "").replace(/\s+/g, "").toLowerCase();
  const hasOwn = (target, key) => Object.prototype.hasOwnProperty.call(target, key);
  const toUser = (row) => ({
    id: String(row?.id || ""),
    loginId: String(row?.character_name || ""),
    name: String(row?.character_name || ""),
    password: "",
    initial: Array.from(String(row?.character_name || "?"))[0] || "?",
    note: "초대 테스터 계정",
    profilePhoto: String(row?.profile_photo || ""),
    isTestOnly: true,
  });

  function install(user) {
    if (!user?.id) return user;
    users.set(user.id, user);
    window.__BAEKJI_TESTER_REGISTRY_GUARD__?.registerTester?.(user);
    return user;
  }

  function blankCharacter(userId) {
    return {
      id: userId,
      contamination: 0,
      symptom: "안정",
      inventory: {},
      currentPartyId: null,
      currentSessionId: null,
      onlineAt: null,
    };
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

  async function rpc(name, body) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.message || `RPC_${response.status}`);
      error.code = payload?.message || "UNKNOWN";
      throw error;
    }
    return payload;
  }

  function repairCharacter(character, userId) {
    const next = character && typeof character === "object" && !Array.isArray(character)
      ? character : blankCharacter(userId);
    let changed = next !== character;
    if (next.id !== userId) { next.id = userId; changed = true; }
    const contamination = Number(next.contamination);
    const normalizedContamination = Number.isFinite(contamination) ? Math.min(100, Math.max(0, contamination)) : 0;
    if (next.contamination !== normalizedContamination) { next.contamination = normalizedContamination; changed = true; }
    if (typeof next.symptom !== "string" || !next.symptom.trim()) { next.symptom = "안정"; changed = true; }
    if (!next.inventory || typeof next.inventory !== "object" || Array.isArray(next.inventory)) { next.inventory = {}; changed = true; }
    if (!("currentPartyId" in next)) { next.currentPartyId = null; changed = true; }
    if (!("currentSessionId" in next)) { next.currentSessionId = null; changed = true; }
    if (!("onlineAt" in next)) { next.onlineAt = null; changed = true; }
    return { character: next, changed };
  }

  function legacyIdReferenced(state, legacyId) {
    if (sessionStorage.getItem(USER_KEY) === legacyId) return true;
    const inParty = Object.values(state.parties || {}).some((party) =>
      party?.creatorId === legacyId ||
      (party?.memberIds || []).includes(legacyId) ||
      (party?.invitedIds || []).includes(legacyId)
    );
    if (inParty) return true;
    return Object.values(state.sessions || {}).some((session) => (session?.memberIds || []).includes(legacyId));
  }

  function dispatchWorldUpdate(oldRaw, newRaw) {
    if (oldRaw === newRaw) return;
    try {
      window.dispatchEvent(new StorageEvent("storage", {
        key: GLOBAL_KEY,
        oldValue: oldRaw,
        newValue: newRaw,
        storageArea: localStorage,
        url: location.href,
      }));
    } catch {
      const event = new Event("storage");
      Object.defineProperty(event, "key", { value: GLOBAL_KEY });
      window.dispatchEvent(event);
    }
  }

  function repairTesterCharacters({ touchCurrent = false } = {}) {
    if (repairingState) return false;
    const oldRaw = localStorage.getItem(GLOBAL_KEY);
    let state;
    try { state = JSON.parse(oldRaw || "null"); } catch { state = null; }
    if (!state || state.version !== 3) state = blankWorld();
    state.characters ||= {};
    state.parties ||= {};
    state.sessions ||= {};
    state.itemClaimsByVariant ||= { a: {}, b: {}, c: {}, d: {} };
    let changed = !oldRaw;

    users.forEach((user, userId) => {
      const current = hasOwn(state.characters, userId) ? state.characters[userId] : null;
      const repaired = repairCharacter(current, userId);
      state.characters[userId] = repaired.character;
      changed ||= repaired.changed;
    });

    LEGACY_DEMO_IDS.forEach((legacyId) => {
      if (!hasOwn(state.characters, legacyId) || legacyIdReferenced(state, legacyId)) return;
      delete state.characters[legacyId];
      changed = true;
    });

    const currentId = sessionStorage.getItem(USER_KEY);
    if (touchCurrent && currentId && users.has(currentId)) {
      const character = state.characters[currentId];
      const now = Date.now();
      if (!Number.isFinite(Number(character.onlineAt)) || now - Number(character.onlineAt || 0) > 30000) {
        character.onlineAt = now;
        changed = true;
      }
    }
    if (!changed) return false;

    const newRaw = JSON.stringify(state);
    repairingState = true;
    try { localStorage.setItem(GLOBAL_KEY, newRaw); }
    finally { repairingState = false; }
    dispatchWorldUpdate(oldRaw, newRaw);
    return true;
  }

  function ensureCharacter(userId) {
    repairTesterCharacters();
    const oldRaw = localStorage.getItem(GLOBAL_KEY);
    let state;
    try { state = JSON.parse(oldRaw || "null"); } catch { state = null; }
    if (!state || state.version !== 3) state = blankWorld();
    state.characters ||= {};
    const current = hasOwn(state.characters, userId) ? state.characters[userId] : null;
    const repaired = repairCharacter(current, userId);
    state.characters[userId] = repaired.character;
    state.characters[userId].onlineAt = Date.now();
    const newRaw = JSON.stringify(state);
    localStorage.setItem(GLOBAL_KEY, newRaw);
    dispatchWorldUpdate(oldRaw, newRaw);
  }

  function finishLogin(user) {
    install(user);
    ensureCharacter(user.id);
    sessionStorage.setItem(USER_KEY, user.id);
    window.__BAEKJI_TESTER_REGISTRY_GUARD__?.rememberCurrentTester?.();
    location.hash = "#/home";
  }

  async function compress(file) {
    if (!file?.type?.startsWith("image/")) throw Object.assign(new Error("INVALID_PROFILE_PHOTO"), { code: "INVALID_PROFILE_PHOTO" });
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#f6f6f2";
    ctx.fillRect(0, 0, 256, 256);
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
    bitmap.close?.();
    return canvas.toDataURL("image/jpeg", 0.78);
  }

  function errorText(code) {
    return ({
      CHARACTER_NAME_TAKEN: "이미 사용 중인 캐릭터 이름입니다.",
      INVALID_CHARACTER_NAME: "캐릭터 이름은 1~20자로 입력해 주세요.",
      INVALID_PIN: "비밀번호는 숫자 4자리로 입력해 주세요.",
      INVALID_PROFILE_PHOTO: "프로필 사진을 다시 선택해 주세요.",
      PROFILE_PHOTO_TOO_LARGE: "사진 용량이 너무 큽니다.",
      SIGNUP_LIMIT_REACHED: "테스터 가입 가능 인원이 모두 찼습니다.",
    })[code] || "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.";
  }

  function markup() {
    return `<button class="button ghost block tester-signup-toggle" type="button" data-tester-toggle>테스터 계정 가입</button>
      <section class="tester-signup-card card pad" data-tester-card hidden>
        <div class="login-form-heading"><span class="brand-mark">초</span><div><strong>테스터 계정 가입</strong><small>TEST_ONLY · 정식 배포 전 삭제</small></div></div>
        <div data-tester-form>
          <div class="tester-photo-field">
            <label class="tester-photo-picker" for="tester-photo"><img data-tester-preview alt="프로필 사진 미리보기" hidden><span>사진 선택</span></label>
            <input id="tester-photo" name="photo" type="file" accept="image/png,image/jpeg,image/webp">
            <p>정사각형 256px로 자동 압축됩니다.</p>
          </div>
          <div class="field"><label for="tester-name">캐릭터 이름</label><input id="tester-name" name="name" maxlength="20" autocomplete="nickname"></div>
          <div class="field"><label for="tester-pin">비밀번호</label><input id="tester-pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password" placeholder="숫자 4자리"></div>
          <p class="tester-account-note">비밀번호는 암호화 해시로 저장되며 계정과 사진은 테스트 기간에만 보관됩니다.</p>
          <p class="login-error" data-tester-message aria-live="polite"></p>
          <button class="button primary block" type="button" data-tester-submit>가입하고 접속</button>
        </div>
      </section>`;
  }

  function enhanceLogin() {
    const login = document.querySelector("[data-login-form]");
    if (!login || login.dataset.testerEnhanced) return;
    login.dataset.testerEnhanced = "true";
    const password = login.querySelector("[data-login-password]");
    if (password) {
      password.inputMode = "numeric";
      password.maxLength = 4;
      password.pattern = "[0-9]{4}";
      password.placeholder = "숫자 4자리";
    }
    login.querySelector(".login-demo-note")?.insertAdjacentHTML("beforebegin", markup());
    const toggle = login.querySelector("[data-tester-toggle]");
    const card = login.querySelector("[data-tester-card]");
    toggle?.addEventListener("click", () => { card.hidden = !card.hidden; });

    login.addEventListener("submit", async (event) => {
      const name = login.querySelector("[data-login-id]")?.value || "";
      if (!Array.from(users.values()).some((user) => normalize(user.name) === normalize(name))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (busy) return;
      busy = true;
      const message = login.querySelector("[data-login-error]");
      if (message) message.textContent = "계정을 확인하고 있습니다…";
      try {
        const rows = await rpc("baekji_tester_login", {
          p_character_name: name,
          p_pin: login.querySelector("[data-login-password]")?.value || "",
        });
        if (!rows?.[0]) throw new Error("LOGIN_FAILED");
        finishLogin(toUser(rows[0]));
      } catch {
        if (message) message.textContent = "캐릭터 이름 또는 비밀번호가 일치하지 않습니다.";
      } finally {
        busy = false;
      }
    }, true);

    const form = login.querySelector("[data-tester-form]");
    const file = form?.querySelector('input[name="photo"]');
    let selectedFile = null;
    let selectedPhotoData = "";
    file?.addEventListener("change", async () => {
      const preview = form.querySelector("[data-tester-preview]");
      const message = form.querySelector("[data-tester-message]");
      selectedFile = file.files?.[0] || null;
      selectedPhotoData = "";
      if (!selectedFile || !preview) {
        if (preview) { preview.hidden = true; preview.removeAttribute("src"); }
        return;
      }
      try {
        selectedPhotoData = await compress(selectedFile);
        preview.src = selectedPhotoData;
        preview.hidden = false;
        if (message) message.textContent = "";
      } catch (error) {
        preview.hidden = true;
        preview.removeAttribute("src");
        if (message) message.textContent = errorText(error.code || error.message);
      }
    });
    form?.addEventListener("input", (event) => {
      if (event.target?.name === "pin") event.target.value = event.target.value.replace(/\D/g, "").slice(0, 4);
    });
    form?.querySelector("[data-tester-submit]")?.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      const message = form.querySelector("[data-tester-message]");
      const button = form.querySelector("[data-tester-submit]");
      if (button) button.disabled = true;
      if (message) message.textContent = "계정을 저장하고 있습니다…";
      try {
        const name = form.querySelector('input[name="name"]')?.value.trim() || "";
        const pin = form.querySelector('input[name="pin"]')?.value || "";
        const photo = file?.files?.[0];
        if (!name) throw Object.assign(new Error("INVALID_CHARACTER_NAME"), { code: "INVALID_CHARACTER_NAME" });
        if (!/^\d{4}$/.test(pin)) throw Object.assign(new Error("INVALID_PIN"), { code: "INVALID_PIN" });
        const photoData = photo && photo === selectedFile && selectedPhotoData ? selectedPhotoData : await compress(photo);
        const rows = await rpc("baekji_tester_signup", {
          p_character_name: name,
          p_pin: pin,
          p_profile_photo: photoData,
        });
        if (!rows?.[0]) throw new Error("SIGNUP_FAILED");
        finishLogin(toUser(rows[0]));
        loadDirectory(true).catch(() => {});
      } catch (error) {
        if (message) message.textContent = errorText(error.code || error.message);
      } finally {
        busy = false;
        if (button) button.disabled = false;
      }
    });
  }

  function testerUserByName(name) {
    const normalizedName = normalize(name);
    return Array.from(users.values()).find((user) => normalize(user.name) === normalizedName) || null;
  }

  function profileImage(user, className) {
    const img = document.createElement("img");
    img.className = className;
    img.src = user.profilePhoto;
    img.alt = `${user.name} 프로필 사진`;
    return img;
  }

  function decorateTopbar(user) {
    document.querySelectorAll(".topbar-meta .badge").forEach((badge) => {
      let img = badge.querySelector(".tester-profile-avatar");
      if (!img) {
        img = profileImage(user, "tester-profile-avatar");
        badge.prepend(img);
      } else if (img.src !== user.profilePhoto) {
        img.src = user.profilePhoto;
      }
    });
  }

  function decorateMembers() {
    document.querySelectorAll(".member").forEach((member) => {
      const user = testerUserByName(member.querySelector(".list-title")?.textContent || "");
      const avatar = member.querySelector(".member-avatar");
      if (!user?.profilePhoto || !avatar) return;
      let img = avatar.querySelector(".tester-member-avatar");
      if (!img) {
        avatar.textContent = "";
        avatar.classList.add("has-profile-photo");
        img = profileImage(user, "tester-member-avatar");
        avatar.append(img);
      } else if (img.src !== user.profilePhoto) {
        img.src = user.profilePhoto;
      }
    });
  }

  function decorateContamination() {
    const userId = sessionStorage.getItem(USER_KEY);
    if (!userId || !users.has(userId)) return;
    let state;
    try { state = JSON.parse(localStorage.getItem(GLOBAL_KEY) || "null"); } catch { state = null; }
    const value = Number(state?.characters?.[userId]?.contamination);
    const contamination = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
    const contaminationText = `${contamination}%`;
    document.querySelectorAll(".card.kpi").forEach((card) => {
      if (!card.querySelector(".muted.small")?.textContent?.includes("개인 오염도")) return;
      const number = card.querySelector(".kpi-value");
      const bar = card.querySelector(".progress > span");
      if (number && number.textContent !== contaminationText) number.textContent = contaminationText;
      if (bar && bar.style.width !== contaminationText) bar.style.width = contaminationText;
    });
  }

  function refresh() {
    refreshQueued = false;
    enhanceLogin();
    repairTesterCharacters();
    decorate();
  }

  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    setTimeout(refresh, 16);
  }

  async function loadDirectory(forceRender = false) {
    const rows = await rpc("baekji_tester_list_accounts", {});
    const nextUsers = (rows || []).map(toUser).filter((user) => user.id && user.name);
    const nextSignature = nextUsers
      .map((user) => `${user.id}:${user.name}:${user.profilePhoto.length}`)
      .sort()
      .join("|");
    nextUsers.forEach(install);
    const changed = nextSignature !== directorySignature;
    directorySignature = nextSignature;
    repairTesterCharacters({ touchCurrent: true });
    scheduleRefresh();
    if (changed || forceRender) {
      window.dispatchEvent(new CustomEvent("baekji-tester-directory-ready", {
        detail: { count: nextUsers.length },
      }));
      try { window.dispatchEvent(new HashChangeEvent("hashchange")); }
      catch { window.dispatchEvent(new Event("hashchange")); }
    }
    return nextUsers;
  }

  window.__BAEKJI_TESTER_AUTH_TEST__ = Object.freeze({
    toUser,
    repairCharacter,
    legacyIdReferenced,
    directoryUsers: () => Array.from(users.values()),
  });

  new MutationObserver(scheduleRefresh).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("storage", (event) => { if (event.key === GLOBAL_KEY) scheduleRefresh(); });
  window.addEventListener("baekji-cloud-sync", scheduleRefresh);
  window.addEventListener("baekji-tester-directory-refresh", () => loadDirectory(true).catch((error) => console.warn("[tester-auth]", error)));

  loadDirectory(true).catch((error) => console.warn("[tester-auth]", error));
  setInterval(() => loadDirectory(false).catch(() => {}), 12000);
})();