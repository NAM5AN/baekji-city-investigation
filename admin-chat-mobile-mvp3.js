(() => {
  "use strict";

  const rail = document.querySelector(".admin-chat-rail");
  if (!rail || window.__BAEKJI_ADMIN_CHAT_MOBILE_MVP3__) return;

  const MOBILE_QUERY = "(max-width: 760px)";
  const mq = window.matchMedia?.(MOBILE_QUERY);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "admin-chat-mobile-toggle";
  button.dataset.adminChatMobileToggle = "";
  button.setAttribute("aria-controls", "admin-chat-rail");
  rail.id ||= "admin-chat-rail";

  function isOpen() {
    return document.body.classList.contains("admin-chat-mobile-open");
  }

  function sync() {
    const open = isOpen();
    button.textContent = open ? "채팅 닫기" : "관리자 채팅";
    button.setAttribute("aria-expanded", String(open));
    rail.setAttribute("aria-hidden", String(Boolean(mq?.matches) && !open));
  }

  function close() {
    document.body.classList.remove("admin-chat-mobile-open");
    sync();
  }

  button.addEventListener("click", () => {
    document.body.classList.toggle("admin-chat-mobile-open");
    sync();
    if (isOpen()) requestAnimationFrame(() => rail.querySelector("[data-admin-chat-input]")?.focus({ preventScroll: true }));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isOpen()) return;
    if (document.querySelector("#admin-communications-modal-root:not(:empty), #admin-modal-root:not(:empty)")) return;
    close();
    button.focus({ preventScroll: true });
  });

  const handleMediaChange = () => {
    if (!mq?.matches) document.body.classList.remove("admin-chat-mobile-open");
    sync();
  };
  mq?.addEventListener?.("change", handleMediaChange);

  document.body.append(button);
  sync();

  window.__BAEKJI_ADMIN_CHAT_MOBILE_MVP3__ = Object.freeze({
    MOBILE_QUERY,
    isOpen,
    close,
    sync,
  });
})();
