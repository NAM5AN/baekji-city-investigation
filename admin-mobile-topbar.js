(() => {
  "use strict";

  const VERSION = "0.6.2";
  const mq = window.matchMedia("(max-width: 760px)");
  const topbar = document.querySelector(".admin-topbar");
  if (!topbar || window.__BAEKJI_ADMIN_MOBILE_TOPBAR__) return;

  let toggle = null;
  let menu = null;

  function ensureUi() {
    if (!toggle?.isConnected) {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "admin-mobile-ops-toggle";
      toggle.dataset.adminMobileOpsToggle = "";
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-controls", "admin-mobile-ops-menu");
      toggle.textContent = "운영";
      topbar.append(toggle);
    }

    if (!menu?.isConnected) {
      menu = document.createElement("div");
      menu.id = "admin-mobile-ops-menu";
      menu.className = "admin-mobile-ops-menu";
      menu.dataset.adminMobileOpsMenu = "";
      menu.innerHTML = `
        <button type="button" data-admin-mobile-proxy="mvp5">세션 운영·복구<small>일시정지·재개·오류 복구·접속 상태</small></button>
        <button type="button" data-admin-mobile-proxy="audit">감사 로그<small>관리자 직접 조작 기록 확인</small></button>
        <button type="button" class="danger" data-admin-mobile-proxy="reset">조사 상태 초기화<small>전체 조사 진행 상태를 초기화</small></button>
      `;
      document.body.append(menu);
    }
  }

  function positionMenu() {
    if (!menu?.classList.contains("open") || !toggle?.isConnected) return;
    const rect = toggle.getBoundingClientRect();
    const top = Math.min(window.innerHeight - 170, rect.bottom + 7);
    menu.style.top = `${Math.max(8, top)}px`;
  }

  function closeMenu() {
    if (!menu || !toggle) return;
    menu.classList.remove("open");
    toggle.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    ensureUi();
    menu.classList.add("open");
    toggle.setAttribute("aria-expanded", "true");
    positionMenu();
  }

  function proxyClick(kind) {
    const selector = kind === "mvp5"
      ? "[data-mvp5-open]"
      : kind === "audit"
        ? "[data-admin-audit-open]"
        : "[data-admin-world-reset-open]";
    const original = document.querySelector(`.admin-topbar-meta ${selector}`) || document.querySelector(selector);
    if (original instanceof HTMLElement) original.click();
  }

  function syncMode() {
    ensureUi();
    document.documentElement.dataset.adminMobileTopbarVersion = VERSION;
    if (!mq.matches) closeMenu();
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    if (target.closest("[data-admin-mobile-ops-toggle]")) {
      event.preventDefault();
      menu?.classList.contains("open") ? closeMenu() : openMenu();
      return;
    }

    const proxy = target.closest("[data-admin-mobile-proxy]");
    if (proxy) {
      const kind = String(proxy.dataset.adminMobileProxy || "");
      closeMenu();
      proxyClick(kind);
      return;
    }

    if (menu?.classList.contains("open") && !target.closest("[data-admin-mobile-ops-menu]")) closeMenu();
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });

  window.addEventListener("resize", () => {
    syncMode();
    positionMenu();
  });
  window.addEventListener("orientationchange", () => setTimeout(positionMenu, 80));
  mq.addEventListener?.("change", syncMode);

  const observer = new MutationObserver(() => {
    if (mq.matches) ensureUi();
  });
  observer.observe(topbar, { childList: true, subtree: true });

  syncMode();
  window.__BAEKJI_ADMIN_MOBILE_TOPBAR__ = Object.freeze({ closeMenu, openMenu, syncMode });
})();
