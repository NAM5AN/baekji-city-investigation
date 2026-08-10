(() => {
  "use strict";

  const STYLE_ID = "baekji-party-invite-search-style";
  const queries = new Map();
  let refreshQueued = false;

  function normalize(value) {
    return String(value || "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  }

  function partyIdFromRoute() {
    const parts = (location.hash.replace(/^#\/?/, "") || "").split("/").filter(Boolean);
    return parts[0] === "party" ? String(parts[1] || "") : "";
  }

  function inviteSection() {
    return [...document.querySelectorAll("section.card")].find((section) =>
      String(section.querySelector(".card-title")?.textContent || "").trim() === "조원 초대"
    ) || null;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .party-invite-search-wrap{margin-left:auto;display:flex;align-items:center;min-width:min(260px,36vw)}
      .party-invite-search{width:100%;height:38px;border:2px solid #111;background:var(--paper,#f6f6f2);color:#111;padding:0 11px;font:inherit;box-shadow:2px 2px 0 #111}
      .party-invite-search:focus{outline:2px solid #111;outline-offset:2px}
      .party-invite-search-empty{padding:18px;border:2px dashed #111;text-align:center;color:var(--muted,#666)}
      @media(max-width:720px){.party-invite-search-wrap{width:100%;min-width:0;margin:10px 0 0}.party-invite-search{height:42px}.party-invite-search-header{align-items:flex-start;flex-wrap:wrap}}
    `;
    document.head.appendChild(style);
  }

  function applyFilter(section, query) {
    const normalized = normalize(query);
    const list = section.querySelector(":scope > .list, .list");
    if (!list) return;
    let visible = 0;
    [...list.querySelectorAll(":scope > .list-item")].forEach((item) => {
      const name = String(item.querySelector(".list-title")?.textContent || "");
      const show = !normalized || normalize(name).includes(normalized);
      item.hidden = !show;
      if (show) visible += 1;
    });

    let empty = list.querySelector("[data-party-invite-search-empty]");
    if (normalized && visible === 0) {
      if (!empty) {
        empty = document.createElement("div");
        empty.className = "party-invite-search-empty";
        empty.dataset.partyInviteSearchEmpty = "true";
        list.appendChild(empty);
      }
      const copy = `‘${query.trim()}’ 검색 결과가 없습니다.`;
      if (empty.textContent !== copy) empty.textContent = copy;
      empty.hidden = false;
    } else if (empty) {
      empty.hidden = true;
    }
  }

  function decorate() {
    refreshQueued = false;
    const partyId = partyIdFromRoute();
    if (!partyId) return;
    const section = inviteSection();
    if (!section) return;
    ensureStyle();

    const header = section.querySelector(".card-header");
    if (!header) return;
    header.classList.add("party-invite-search-header");

    let wrap = header.querySelector("[data-party-invite-search-wrap]");
    let input = wrap?.querySelector("[data-party-invite-search]") || null;
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "party-invite-search-wrap";
      wrap.dataset.partyInviteSearchWrap = "true";
      input = document.createElement("input");
      input.type = "search";
      input.className = "party-invite-search";
      input.dataset.partyInviteSearch = "true";
      input.autocomplete = "off";
      input.placeholder = "캐릭터 이름 검색";
      input.setAttribute("aria-label", "초대할 캐릭터 이름 검색");
      wrap.appendChild(input);
      header.appendChild(wrap);
    }

    const remembered = queries.get(partyId) || "";
    if (input.value !== remembered) input.value = remembered;
    applyFilter(section, remembered);
  }

  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    setTimeout(decorate, 16);
  }

  document.addEventListener("input", (event) => {
    const input = event.target instanceof Element ? event.target.closest("[data-party-invite-search]") : null;
    if (!input) return;
    const partyId = partyIdFromRoute();
    if (!partyId) return;
    queries.set(partyId, input.value);
    const section = inviteSection();
    if (section) applyFilter(section, input.value);
  });

  const app = document.getElementById("app");
  if (app && typeof MutationObserver === "function") {
    new MutationObserver(scheduleRefresh).observe(app, { childList: true, subtree: true });
  }
  window.addEventListener("hashchange", scheduleRefresh);
  window.addEventListener("baekji-tester-directory-ready", scheduleRefresh);
  scheduleRefresh();
})();