(() => {
  "use strict";

  const node = document.querySelector("[data-admin-connection]");
  if (!node || window.__BAEKJI_ADMIN_CONTROL_STATUS_MVP4__) return;

  const style = document.createElement("style");
  style.textContent = `
    [data-admin-connection] {
      position: fixed;
      z-index: 480;
      top: 66px;
      right: 14px;
      display: none;
      align-items: center;
      gap: 6px;
      min-height: 30px;
      padding: 6px 10px;
      border: 1px solid var(--line2);
      border-radius: 999px;
      background: rgba(11,15,16,.94);
      color: var(--green);
      box-shadow: 0 8px 24px rgba(0,0,0,.28);
      font-size: 10px;
      font-weight: 800;
      letter-spacing: .02em;
      pointer-events: none;
      white-space: nowrap;
    }
    [data-admin-connection][data-admin-sync-visible="true"] { display: inline-flex; }
    [data-admin-connection][data-admin-sync-kind="error"] { color: var(--danger); }
    [data-admin-connection]::before {
      content: "";
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: currentColor;
      box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 16%, transparent);
    }
    @media(max-width:760px) {
      [data-admin-connection] { top: 62px; right: 8px; }
    }
  `;
  document.head.append(style);
  document.body.append(node);

  function show(text, kind = "sync") {
    if (node.textContent !== text) node.textContent = text;
    node.dataset.adminSyncKind = kind;
    node.dataset.adminSyncVisible = "true";
  }

  function hide() {
    delete node.dataset.adminSyncVisible;
    delete node.dataset.adminSyncKind;
  }

  function sync() {
    const status = String(node.textContent || "").trim();

    if (status === "SYNC" || status === "동기화 중…") {
      show("동기화 중…", "sync");
      return;
    }

    if (status === "OFFLINE" || status === "연결 끊김") {
      show("연결 끊김", "error");
      return;
    }

    if (status === "SETUP" || status === "설정 확인 필요") {
      show("설정 확인 필요", "error");
      return;
    }

    // READ ONLY / CONTROL / LOCKED are not useful transient UI states here.
    hide();
  }

  const observer = new MutationObserver(sync);
  observer.observe(node, { childList: true, characterData: true, subtree: true });
  sync();

  window.__BAEKJI_ADMIN_CONTROL_STATUS_MVP4__ = Object.freeze({ sync, show, hide });
})();