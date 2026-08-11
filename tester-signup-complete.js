(() => {
  "use strict";

  if (window.__BAEKJI_TESTER_SIGNUP_COMPLETE__) return;

  const SUPABASE_URL = "https://kfgtvifupumjuewwxzmz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  let busy = false;
  let modal = null;
  let refreshQueued = false;

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

  async function signup(name, pin, photoData) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/baekji_tester_signup`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        p_character_name: name,
        p_pin: pin,
        p_profile_photo: photoData,
      }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const error = new Error(payload?.message || `RPC_${response.status}`);
      error.code = payload?.message || "UNKNOWN";
      throw error;
    }
    if (!payload?.[0]) throw Object.assign(new Error("SIGNUP_FAILED"), { code: "SIGNUP_FAILED" });
    return payload[0];
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(Object.assign(new Error("INVALID_PROFILE_PHOTO"), { code: "INVALID_PROFILE_PHOTO" }));
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(Object.assign(new Error("INVALID_PROFILE_PHOTO"), { code: "INVALID_PROFILE_PHOTO" }));
      reader.readAsDataURL(file);
    });
  }

  async function photoDataFromForm(form) {
    const preview = form.querySelector("[data-tester-preview]");
    const previewSrc = String(preview?.getAttribute("src") || "");
    if (previewSrc.startsWith("data:image/")) return previewSrc;
    const file = form.querySelector('input[name="photo"]')?.files?.[0];
    const data = await fileToDataUrl(file);
    if (!data.startsWith("data:image/")) throw Object.assign(new Error("INVALID_PROFILE_PHOTO"), { code: "INVALID_PROFILE_PHOTO" });
    return data;
  }

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "tester-signup-complete";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="tester-signup-complete__backdrop"></div>
      <section class="tester-signup-complete__dialog" role="dialog" aria-modal="true" aria-labelledby="tester-signup-complete-title">
        <div class="tester-signup-complete__eyebrow">ACCOUNT CREATED</div>
        <h2 id="tester-signup-complete-title">가입 완료</h2>
        <p class="tester-signup-complete__lead">아래 캐릭터 정보로 계정이 생성되었습니다.</p>
        <div class="tester-signup-complete__profile">
          <img data-signup-complete-photo alt="가입한 캐릭터 프로필 사진">
          <div>
            <span>캐릭터 이름</span>
            <strong data-signup-complete-name></strong>
          </div>
        </div>
        <p class="tester-signup-complete__notice">등록한 캐릭터 이름과 비밀번호로 로그인해 주세요.</p>
        <button type="button" class="button primary block" data-signup-complete-login>확인</button>
      </section>`;
    (document.querySelector("#modal-root") || document.body).append(modal);
    modal.querySelector("[data-signup-complete-login]")?.addEventListener("click", finishCompletion);
    return modal;
  }

  function resetSignupForm() {
    const form = document.querySelector("[data-tester-form]");
    if (!form) return;
    const file = form.querySelector('input[name="photo"]');
    const name = form.querySelector('input[name="name"]');
    const pin = form.querySelector('input[name="pin"]');
    const preview = form.querySelector("[data-tester-preview]");
    const message = form.querySelector("[data-tester-message]");
    if (file) file.value = "";
    if (name) name.value = "";
    if (pin) pin.value = "";
    if (preview) {
      preview.hidden = true;
      preview.removeAttribute("src");
    }
    if (message) message.textContent = "";
  }

  function finishCompletion() {
    if (!modal || modal.hidden) return;
    const name = String(modal.dataset.characterName || "");
    modal.hidden = true;
    document.body.classList.remove("tester-signup-complete-open");
    const card = document.querySelector("[data-tester-card]");
    if (card) card.hidden = true;
    resetSignupForm();

    const loginId = document.querySelector("[data-login-id]");
    const loginPassword = document.querySelector("[data-login-password]");
    const loginError = document.querySelector("[data-login-error]");
    if (loginId) loginId.value = name;
    if (loginPassword) loginPassword.value = "";
    if (loginError) loginError.textContent = "";
    loginPassword?.focus?.();
    document.querySelector("[data-login-form]")?.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }

  function showCompletion({ name, photo }) {
    const root = ensureModal();
    root.dataset.characterName = name;
    const image = root.querySelector("[data-signup-complete-photo]");
    const label = root.querySelector("[data-signup-complete-name]");
    if (image) image.src = photo;
    if (label) label.textContent = name;
    root.hidden = false;
    document.body.classList.add("tester-signup-complete-open");
    root.querySelector("[data-signup-complete-login]")?.focus?.();
  }

  function decorateSignupUi() {
    document.querySelectorAll("[data-tester-submit]").forEach((button) => {
      if (button.textContent.trim() !== "가입하기") button.textContent = "가입하기";
    });
  }

  function scheduleDecorate() {
    if (refreshQueued) return;
    refreshQueued = true;
    requestAnimationFrame(() => {
      refreshQueued = false;
      decorateSignupUi();
    });
  }

  async function handleSignupClick(event) {
    const button = event.target?.closest?.("[data-tester-submit]");
    if (!button) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (busy) return;

    const form = button.closest("[data-tester-form]");
    if (!form) return;
    const message = form.querySelector("[data-tester-message]");
    const name = form.querySelector('input[name="name"]')?.value.trim() || "";
    const pin = form.querySelector('input[name="pin"]')?.value || "";

    busy = true;
    button.disabled = true;
    if (message) message.textContent = "계정을 저장하고 있습니다…";
    try {
      if (!name) throw Object.assign(new Error("INVALID_CHARACTER_NAME"), { code: "INVALID_CHARACTER_NAME" });
      if (!/^\d{4}$/.test(pin)) throw Object.assign(new Error("INVALID_PIN"), { code: "INVALID_PIN" });
      const photoData = await photoDataFromForm(form);
      const row = await signup(name, pin, photoData);
      const finalName = String(row?.character_name || name);
      const finalPhoto = String(row?.profile_photo || photoData);

      sessionStorage.removeItem(USER_KEY);
      if (location.hash === "#/home") location.hash = "#/login";
      if (message) message.textContent = "";
      window.dispatchEvent(new Event("baekji-tester-directory-refresh"));
      showCompletion({ name: finalName, photo: finalPhoto });
    } catch (error) {
      if (message) message.textContent = errorText(error?.code || error?.message);
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  document.addEventListener("click", handleSignupClick, true);
  new MutationObserver(scheduleDecorate).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("baekji-tester-directory-ready", scheduleDecorate);
  scheduleDecorate();

  window.__BAEKJI_TESTER_SIGNUP_COMPLETE__ = Object.freeze({ showCompletion });
})();