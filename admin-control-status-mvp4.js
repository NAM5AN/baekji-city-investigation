(() => {
  "use strict";

  const node = document.querySelector("[data-admin-connection]");
  if (!node || window.__BAEKJI_ADMIN_CONTROL_STATUS_MVP4__) return;

  function sync() {
    if (node.textContent === "READ ONLY") node.textContent = "CONTROL";
    if (node.textContent === "CONTROL") node.style.color = "var(--green)";
  }

  const observer = new MutationObserver(sync);
  observer.observe(node, { childList: true, characterData: true, subtree: true });
  sync();

  window.__BAEKJI_ADMIN_CONTROL_STATUS_MVP4__ = Object.freeze({ sync });
})();