(() => {
  "use strict";

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const SESSION_PROFILE_KEY = "baekji_city_tester_session_profile_v1";
  const LEGACY_SUPABASE_URL = "https://zstgpnwnwmeifgmyeqtz.supabase.co";
  const LEGACY_SUPABASE_KEY = "sb_publishable_g-cXysHfl260KTtSRLABTw_4wnaaxDY";
  const STYLE_ID = "baekji-party-roster-style";
  const DEMO_USERS = new Map([
    ["test_a", { id: "test_a", name: "테스트 캐릭터 A", profilePhoto: "" }],
    ["test_b", { id: "test_b", name: "테스트 캐릭터 B", profilePhoto: "" }],
    ["test_c", { id: "test_c", name: "테스트 캐릭터 C", profilePhoto: "" }],
  ]);
  const directory = new Map(DEMO_USERS);
  let directoryPromise = null;
  let refreshQueued = false;

  function unique(values) {
    return [...new Set(Array.isArray(values) ? values.map((value) => String(value || "")) : [])].filter(Boolean);
  }

  function accountFromRow(row) {
    return {
      id: String(row?.id || ""),
      name: String(row?.character_name || "").trim(),
      profilePhoto: String(row?.profile_photo || ""),
    };
  }

  function toDirectoryMap(value) {
    if (value instanceof Map) return value;
    const map = new Map();
    Object.entries(value || {}).forEach(([id, account]) => map.set(String(id), account));
    return map;
  }

  function buildRoster(snapshot, partyId, sourceDirectory = directory) {
    const party = snapshot?.parties?.[partyId];
    if (!party) return [];
    const lookup = toDirectoryMap(sourceDirectory);
    return unique(party.memberIds).map((memberId) => {
      const account = lookup.get(memberId) || DEMO_USERS.get(memberId) || null;
      const name = String(account?.name || "조원").trim() || "조원";
      return {
        id: memberId,
        name,
        profilePhoto: String(account?.profilePhoto || ""),
      };
    });
  }

  const TEST_API = Object.freeze({ accountFromRow, buildRoster });
  if (typeof window !== "undefined") window.__BAEKJI_PARTY_ROSTER_TEST__ = TEST_API;
  if (typeof document === "undefined" || typeof localStorage === "undefined" || typeof sessionStorage === "undefined") return;

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function readState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(GLOBAL_KEY) || "null");
      return parsed?.version === 3 ? parsed : null;
    } catch {
      return null;
    }
  }

  function currentUserId() {
    return String(sessionStorage.getItem(USER_KEY) || "");
  }

  function routePage() {
    return (location.hash.replace(/^#\/?/, "") || "login").split("/").filter(Boolean)[0] || "login";
  }

  function restoreSessionAccount() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_PROFILE_KEY) || "null");
      const account = {
        id: String(saved?.id || ""),
        name: String(saved?.name || saved?.loginId || "").trim(),
        profilePhoto: String(saved?.profilePhoto || ""),
      };
      if (account.id && account.name) directory.set(account.id, account);
    } catch {
      // Session profile is optional.
    }
  }

  async function loadDirectory() {
    const response = await fetch(`${LEGACY_SUPABASE_URL}/rest/v1/rpc/baekji_tester_list_accounts`, {
      method: "POST",
      headers: {
        apikey: LEGACY_SUPABASE_KEY,
        Authorization: `Bearer ${LEGACY_SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: "{}",
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`PARTY_ROSTER_DIRECTORY_${response.status}`);
    const rows = await response.json();
    (rows || []).map(accountFromRow).filter((account) => account.id && account.name).forEach((account) => directory.set(account.id, account));
    return directory;
  }

  function ensureDirectory() {
    if (!directoryPromise) {
      directoryPromise = loadDirectory().catch((error) => {
        console.warn("[party-roster-modal]", error);
        directoryPromise = null;
        return directory;
      });
    }
    return directoryPromise;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .party-roster-backdrop{position:fixed;inset:0;z-index:420;display:grid;place-items:center;padding:20px;background:rgba(12,12,12,.72)}
      .party-roster-modal{position:relative;width:min(520px,100%);max-height:min(76dvh,680px);overflow:auto;background:var(--paper,#f6f6f2);color:#111;border:4px double #111;box-shadow:8px 8px 0 #111;padding:24px}
      .party-roster-kicker{display:inline-block;border:2px solid #111;padding:3px 7px;margin-bottom:12px;font-size:11px;font-weight:900;letter-spacing:.08em}
      .party-roster-modal h2{margin:0;font-size:28px;line-height:1.15}.party-roster-party-name{margin:7px 0 0;color:var(--muted,#666)}
      .party-roster-rule{height:4px;border-top:1px solid #111;border-bottom:1px solid #111;margin:18px 0}
      .party-roster-list{display:grid;gap:10px}.party-roster-member{display:grid;grid-template-columns:56px minmax(0,1fr);align-items:center;gap:13px;border:2px solid #111;padding:10px;background:rgba(255,255,255,.28)}
      .party-roster-avatar{width:56px;height:56px;border:2px solid #111;background:#deded8;display:grid;place-items:center;overflow:hidden;font-size:22px;font-weight:900;box-shadow:3px 3px 0 #111}
      .party-roster-avatar img{display:block;width:100%;height:100%;object-fit:cover}.party-roster-name{font-size:17px;font-weight:900;overflow-wrap:anywhere}
      .party-roster-privacy{margin:16px 0 0;padding-top:13px;border-top:2px dashed #111;font-size:12px;color:var(--muted,#666);line-height:1.55}
      .party-roster-close{width:100%;margin-top:16px}.party-roster-loading{text-align:center;padding:28px 10px;border:2px dashed #111;color:var(--muted,#666)}
      @media(max-width:520px){.party-roster-backdrop{padding:14px}.party-roster-modal{padding:18px;max-height:82dvh}.party-roster-modal h2{font-size:24px}.party-roster-member{grid-template-columns:50px minmax(0,1fr);gap:11px}.party-roster-avatar{width:50px;height:50px}}
    `;
    document.head.appendChild(style);
  }

  function fallbackInitial(name) {
    return Array.from(String(name || "?").trim())[0] || "?";
  }

  function rosterMarkup(snapshot, partyId) {
    const party = snapshot?.parties?.[partyId];
    if (!party) return "";
    const roster = buildRoster(snapshot, partyId, directory);
    return `
      <section class="party-roster-modal" role="dialog" aria-modal="true" aria-labelledby="party-roster-title">
        <div class="party-roster-kicker">INVESTIGATION PARTY</div>
        <h2 id="party-roster-title">조사조 조원</h2>
        <p class="party-roster-party-name">${escapeHtml(party.name || "조사조")} · ${roster.length}명</p>
        <div class="party-roster-rule" aria-hidden="true"></div>
        <div class="party-roster-list">
          ${roster.map((member) => `
            <div class="party-roster-member">
              <div class="party-roster-avatar">${member.profilePhoto
                ? `<img src="${escapeHtml(member.profilePhoto)}" alt="${escapeHtml(member.name)} 프로필 사진">`
                : `<span aria-hidden="true">${escapeHtml(fallbackInitial(member.name))}</span>`}</div>
              <div class="party-roster-name">${escapeHtml(member.name)}</div>
            </div>`).join("") || `<div class="party-roster-loading">표시할 조원이 없습니다.</div>`}
        </div>
        <p class="party-roster-privacy">이 창에서는 조원의 프로필 사진과 이름만 확인할 수 있습니다. 현재 위치, 오염도, 소지품, 행동 기록과 준비 상태는 공개하지 않습니다.</p>
        <button type="button" class="button primary party-roster-close" data-party-roster-close>닫기</button>
      </section>`;
  }

  function closeModal() {
    const root = document.getElementById("modal-root");
    if (root?.querySelector("[data-party-roster-modal]")) root.replaceChildren();
  }

  function renderModal(partyId, loading = false) {
    const root = document.getElementById("modal-root");
    const snapshot = readState();
    const userId = currentUserId();
    const party = snapshot?.parties?.[partyId];
    if (!root || !snapshot || !party || !userId || !unique(party.memberIds).includes(userId)) return false;
    ensureStyle();
    root.innerHTML = `<div class="party-roster-backdrop" data-party-roster-modal data-party-id="${escapeHtml(partyId)}">
      ${loading ? `<section class="party-roster-modal" role="dialog" aria-modal="true"><div class="party-roster-loading">조원 명단을 불러오는 중입니다...</div></section>` : rosterMarkup(snapshot, partyId)}
    </div>`;
    return true;
  }

  async function openModal(partyId) {
    if (!renderModal(partyId, true)) return;
    await ensureDirectory();
    const active = document.querySelector(`[data-party-roster-modal][data-party-id="${CSS.escape(partyId)}"]`);
    if (active) renderModal(partyId, false);
  }

  function decorateHome() {
    if (routePage() !== "home") return;
    const snapshot = readState();
    const userId = currentUserId();
    const partyId = snapshot?.characters?.[userId]?.currentPartyId;
    const party = partyId ? snapshot?.parties?.[partyId] : null;
    if (!party || !unique(party.memberIds).includes(userId)) return;

    const sessionCreated = Boolean(party.sessionId || party.status === "SESSION_CREATED");
    const isLeader = party.creatorId === userId;
    if (isLeader && !sessionCreated) return;

    const escapedId = CSS.escape(partyId);
    const existingRosterButton = document.querySelector(`[data-party-roster-open="${escapedId}"]`);
    const legacyOpenButton = document.querySelector(`[data-open-party="${escapedId}"]`);
    const memberControls = document.querySelector(`[data-member-party-controls="${escapedId}"]`);
    const item = existingRosterButton?.closest(".list-item") || memberControls?.closest(".list-item") || legacyOpenButton?.closest(".list-item");
    if (!item) return;

    if (sessionCreated) legacyOpenButton?.remove();
    if (existingRosterButton) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "button small";
    button.dataset.partyRosterOpen = partyId;
    button.textContent = "조원 보기";

    if (memberControls) memberControls.appendChild(button);
    else item.appendChild(button);
  }

  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      decorateHome();
    });
  }

  restoreSessionAccount();
  ensureDirectory().then(scheduleRefresh);
  ensureStyle();

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const rosterButton = target.closest("[data-party-roster-open]");
    if (rosterButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openModal(rosterButton.dataset.partyRosterOpen);
      return;
    }

    const legacyOpenButton = target.closest("[data-open-party]");
    if (legacyOpenButton && routePage() === "home") {
      const snapshot = readState();
      const userId = currentUserId();
      const party = snapshot?.parties?.[legacyOpenButton.dataset.openParty];
      const sessionCreated = Boolean(party?.sessionId || party?.status === "SESSION_CREATED");
      if (party && sessionCreated && unique(party.memberIds).includes(userId)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        openModal(party.id);
        return;
      }
    }

    if (target.closest("[data-party-roster-close]")) {
      event.preventDefault();
      closeModal();
      return;
    }

    const backdrop = target.closest("[data-party-roster-modal]");
    if (backdrop && target === backdrop) closeModal();
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && document.querySelector("[data-party-roster-modal]")) closeModal();
  });

  const appRoot = document.getElementById("app");
  if (appRoot && typeof MutationObserver === "function") {
    const observer = new MutationObserver(scheduleRefresh);
    observer.observe(appRoot, { childList: true, subtree: true });
  }
  window.addEventListener("hashchange", scheduleRefresh);
  window.addEventListener("baekji-cloud-sync", scheduleRefresh);
  window.addEventListener("baekji-party-leadership", scheduleRefresh);
  requestAnimationFrame(() => requestAnimationFrame(scheduleRefresh));
})();
