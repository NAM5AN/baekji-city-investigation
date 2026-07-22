(() => {
  "use strict";

  const SUPABASE_URL = "https://zstgpnwnwmeifgmyeqtz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_g-cXysHfl260KTtSRLABTw_4wnaaxDY";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const users = new Map();
  const nativeValues = Object.values.bind(Object);
  let busy = false;

  const normalize = (value) => String(value || "").replace(/\s+/g, "").toLowerCase();
  const toUser = (row) => ({
    id: String(row.id), loginId: String(row.character_name), name: String(row.character_name),
    initial: Array.from(String(row.character_name || "?"))[0] || "?", note: "초대 테스터 계정",
    profilePhoto: String(row.profile_photo || ""), isTestOnly: true,
  });

  function install(user) {
    if (!user?.id) return user;
    users.set(user.id, user);
    Object.defineProperty(Object.prototype, user.id, {
      configurable: true, enumerable: false, writable: true, value: user,
    });
    return user;
  }

  Object.values = function patchedValues(target) {
    const output = nativeValues(target);
    return target?.test_a && target?.test_b && target?.test_c
      ? output.concat(Array.from(users.values())) : output;
  };

  async function rpc(name, body) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body), cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.message || `RPC_${response.status}`);
      error.code = payload?.message || "UNKNOWN";
      throw error;
    }
    return payload;
  }

  function ensureCharacter(userId) {
    let state;
    try { state = JSON.parse(localStorage.getItem(GLOBAL_KEY) || "null"); } catch { state = null; }
    if (!state || state.version !== 3) state = {
      version: 3, storyDay: 1, loopId: "LOOP-001", eventSeq: 0, sessionSeq: 0,
      characters: {}, parties: {}, sessions: {}, itemClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
    };
    state.characters ||= {};
    state.characters[userId] ||= {
      id: userId, contamination: 0, symptom: "안정", inventory: {},
      currentPartyId: null, currentSessionId: null, onlineAt: null,
    };
    state.characters[userId].onlineAt = Date.now();
    localStorage.setItem(GLOBAL_KEY, JSON.stringify(state));
  }

  function finishLogin(user) {
    install(user);
    ensureCharacter(user.id);
    sessionStorage.setItem(USER_KEY, user.id);
    location.hash = "#/home";
    window.dispatchEvent(new HashChangeEvent("hashchange"));
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
        <form data-tester-form>
          <div class="tester-photo-field">
            <label class="tester-photo-picker" for="tester-photo"><img data-tester-preview alt="프로필 사진 미리보기" hidden><span>사진 선택</span></label>
            <input id="tester-photo" name="photo" type="file" accept="image/png,image/jpeg,image/webp" required>
            <p>정사각형 256px로 자동 압축됩니다.</p>
          </div>
          <div class="field"><label for="tester-name">캐릭터 이름</label><input id="tester-name" name="name" maxlength="20" autocomplete="nickname" required></div>
          <div class="field"><label for="tester-pin">비밀번호</label><input id="tester-pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" autocomplete="new-password" placeholder="숫자 4자리" required></div>
          <p class="tester-account-note">비밀번호는 암호화 해시로 저장되며 계정과 사진은 테스트 기간에만 보관됩니다.</p>
          <p class="login-error" data-tester-message aria-live="polite"></p>
          <button class="button primary block" type="submit">가입하고 접속</button>
        </form>
      </section>`;
  }

  function enhanceLogin() {
    const login = document.querySelector("[data-login-form]");
    if (!login || login.dataset.testerEnhanced) return;
    login.dataset.testerEnhanced = "true";
    const password = login.querySelector("[data-login-password]");
    if (password) { password.inputMode = "numeric"; password.maxLength = 4; password.pattern = "[0-9]{4}"; password.placeholder = "숫자 4자리"; }
    login.querySelector(".login-demo-note")?.insertAdjacentHTML("beforebegin", markup());
    const toggle = login.querySelector("[data-tester-toggle]");
    const card = login.querySelector("[data-tester-card]");
    toggle?.addEventListener("click", () => { card.hidden = !card.hidden; });

    login.addEventListener("submit", async (event) => {
      const name = login.querySelector("[data-login-id]")?.value || "";
      if (!Array.from(users.values()).some((user) => normalize(user.name) === normalize(name))) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (busy) return; busy = true;
      const message = login.querySelector("[data-login-error]");
      if (message) message.textContent = "계정을 확인하고 있습니다…";
      try {
        const rows = await rpc("baekji_tester_login", { p_character_name: name, p_pin: login.querySelector("[data-login-password]")?.value || "" });
        if (!rows?.[0]) throw new Error("LOGIN_FAILED");
        finishLogin(toUser(rows[0]));
      } catch { if (message) message.textContent = "캐릭터 이름 또는 비밀번호가 일치하지 않습니다."; }
      finally { busy = false; }
    }, true);

    const form = login.querySelector("[data-tester-form]");
    const file = form?.querySelector('input[name="photo"]');
    file?.addEventListener("change", () => {
      const preview = form.querySelector("[data-tester-preview]");
      if (!file.files?.[0] || !preview) return;
      const url = URL.createObjectURL(file.files[0]); preview.src = url; preview.hidden = false; preview.onload = () => URL.revokeObjectURL(url);
    });
    form?.addEventListener("input", (event) => { if (event.target?.name === "pin") event.target.value = event.target.value.replace(/\D/g, "").slice(0, 4); });
    form?.addEventListener("submit", async (event) => {
      event.preventDefault(); if (busy) return; busy = true;
      const message = form.querySelector("[data-tester-message]");
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      if (message) message.textContent = "계정을 저장하고 있습니다…";
      try {
        const data = new FormData(form); const pin = String(data.get("pin") || "");
        if (!/^\d{4}$/.test(pin)) throw Object.assign(new Error("INVALID_PIN"), { code: "INVALID_PIN" });
        const rows = await rpc("baekji_tester_signup", { p_character_name: String(data.get("name") || "").trim(), p_pin: pin, p_profile_photo: await compress(data.get("photo")) });
        if (!rows?.[0]) throw new Error("SIGNUP_FAILED");
        finishLogin(toUser(rows[0]));
      } catch (error) { if (message) message.textContent = errorText(error.code || error.message); }
      finally { busy = false; if (button) button.disabled = false; }
    });
  }

  function decorate() {
    const user = users.get(sessionStorage.getItem(USER_KEY));
    if (!user?.profilePhoto) return;
    document.querySelectorAll(".topbar-meta .badge").forEach((badge) => {
      if (badge.querySelector(".tester-profile-avatar")) return;
      const img = document.createElement("img"); img.className = "tester-profile-avatar"; img.src = user.profilePhoto; img.alt = ""; badge.prepend(img);
    });
  }

  new MutationObserver(() => { enhanceLogin(); decorate(); }).observe(document.documentElement, { childList: true, subtree: true });
  rpc("baekji_tester_list_accounts", {}).then((rows) => { (rows || []).forEach((row) => install(toUser(row))); }).catch((error) => console.warn("[tester-auth]", error));
})();
