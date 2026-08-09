(() => {
  "use strict";

  const ADMIN_ID_PATTERN = /^AD\d+$/i;
  const busyForms = new WeakSet();

  function isAdminLoginId(value) {
    return ADMIN_ID_PATTERN.test(String(value || "").trim());
  }

  async function handleSubmit(event) {
    const form = event.target;
    if (!form?.matches?.("[data-login-form]")) return;
    const loginId = String(form.querySelector("[data-login-id]")?.value || "").trim();
    if (!isAdminLoginId(loginId)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    if (busyForms.has(form)) return;
    busyForms.add(form);

    const password = String(form.querySelector("[data-login-password]")?.value || "");
    const message = form.querySelector("[data-login-error]");
    const submit = form.querySelector('button[type="submit"], input[type="submit"]');
    if (submit) submit.disabled = true;
    if (message) message.textContent = "관리자 계정을 확인하고 있습니다…";

    try {
      const response = await fetch("/api/admin-login", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ loginId, password }),
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        if (message) message.textContent = response.status === 401
          ? "관리자 아이디 또는 비밀번호가 일치하지 않습니다."
          : "관리자 로그인 서버에 연결하지 못했습니다. 다시 시도해 주세요.";
        return;
      }
      location.assign(payload.redirect || "/admin-dashboard.html");
    } catch {
      if (message) message.textContent = "관리자 로그인 서버에 연결하지 못했습니다. 다시 시도해 주세요.";
    } finally {
      busyForms.delete(form);
      if (submit?.isConnected !== false) submit.disabled = false;
    }
  }

  window.__BAEKJI_ADMIN_LOGIN_TEST__ = Object.freeze({ isAdminLoginId });
  document.addEventListener("submit", handleSubmit, true);
})();
