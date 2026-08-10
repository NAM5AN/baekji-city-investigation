(() => {
  "use strict";

  const COMM_PATH = "/api/admin-communications";
  const DEFAULT_LABEL = "SYSTEM";
  const PRESETS = ["SYSTEM", "운영 SYSTEM", "안내방송", "역내 방송", "관제실"];
  const nativeFetch = window.fetch.bind(window);
  let senderLabel = DEFAULT_LABEL;
  let historyLabels = new Map();
  let historyLoading = false;

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function cleanLabel(value) {
    return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || DEFAULT_LABEL;
  }

  function requestUrl(input) {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.href;
    return String(input?.url || "");
  }

  window.fetch = async function baekjiAdminSenderFetch(input, options = {}) {
    const url = requestUrl(input);
    const method = String(options?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (url.includes(COMM_PATH) && method === "POST" && typeof options?.body === "string") {
      try {
        const body = JSON.parse(options.body);
        if (String(body?.kind || "").toLowerCase() === "system") {
          body.senderLabel = cleanLabel(senderLabel);
          options = { ...options, body: JSON.stringify(body) };
        }
      } catch {
        // 원래 요청 본문이 JSON이 아니면 그대로 전달합니다.
      }
    }
    return nativeFetch(input, options);
  };

  function ensureSenderField(root = document) {
    const message = root.querySelector?.("[data-admin-system-message]");
    if (!message) return;
    const body = message.closest(".admin-comm-modal-body");
    if (!body || body.querySelector("[data-admin-system-sender-field]")) return;
    const messageField = message.closest(".admin-comm-field");
    const listId = "admin-system-sender-presets";
    messageField?.insertAdjacentHTML("beforebegin", `<label class="admin-comm-field" data-admin-system-sender-field>
      <span>발신인명</span>
      <input type="text" maxlength="40" list="${listId}" data-admin-system-sender value="${esc(senderLabel)}" placeholder="SYSTEM" />
      <datalist id="${listId}">${PRESETS.map((label) => `<option value="${esc(label)}"></option>`).join("")}</datalist>
    </label>`);
    const input = body.querySelector("[data-admin-system-sender]");
    input?.addEventListener("input", () => { senderLabel = cleanLabel(input.value); });
    input?.addEventListener("change", () => { senderLabel = cleanLabel(input.value); input.value = senderLabel; });
  }

  function ensureConfirmLabel(root = document) {
    const confirm = root.querySelector?.(".admin-system-confirm");
    if (!confirm || confirm.querySelector("[data-admin-system-sender-confirm]")) return;
    confirm.insertAdjacentHTML("afterbegin", `<span data-admin-system-sender-confirm>발신</span><strong data-admin-system-sender-confirm>${esc(cleanLabel(senderLabel))}</strong>`);
  }

  function historyKey(message, time) {
    return `${String(message || "").trim()}\u0000${String(time || "").trim()}`;
  }

  function applyHistoryLabels(root = document) {
    root.querySelectorAll?.(".admin-system-history-row").forEach((row) => {
      const message = row.querySelector("p")?.textContent || "";
      const time = row.querySelector("header span")?.textContent || "";
      const label = historyLabels.get(historyKey(message, time));
      if (label) {
        const strong = row.querySelector("header strong");
        if (strong) strong.textContent = label;
      }
    });
  }

  async function refreshHistoryLabels() {
    if (historyLoading) return;
    historyLoading = true;
    try {
      const response = await nativeFetch(`${COMM_PATH}?afterChat=999999999&afterSystem=0`, { credentials: "same-origin", cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) return;
      const map = new Map();
      (data.systemEvents || []).forEach((event) => {
        const date = new Date(event.created_at || Date.now());
        const time = Number.isNaN(date.getTime()) ? "--:--" : date.toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit" });
        map.set(historyKey(event.message, time), cleanLabel(event.sender_label));
      });
      historyLabels = map;
      applyHistoryLabels();
    } finally {
      historyLoading = false;
    }
  }

  function enhance() {
    const root = document.getElementById("admin-communications-modal-root");
    if (!root) return;
    ensureSenderField(root);
    ensureConfirmLabel(root);
    applyHistoryLabels(root);
    if (root.querySelector(".admin-system-history-list")) refreshHistoryLabels();
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest("[data-admin-system-open]")) senderLabel = DEFAULT_LABEL;
    const sender = document.querySelector("[data-admin-system-sender]");
    if (sender) senderLabel = cleanLabel(sender.value);
    if (target.closest("[data-admin-system-history]")) setTimeout(refreshHistoryLabels, 0);
  }, true);

  const observer = new MutationObserver(enhance);
  observer.observe(document.body, { childList: true, subtree: true });

  window.__BAEKJI_ADMIN_SYSTEM_SENDER_UI_TEST__ = Object.freeze({ cleanLabel, historyKey });
  enhance();
})();
