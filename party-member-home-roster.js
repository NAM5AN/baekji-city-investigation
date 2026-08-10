(() => {
  "use strict";

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const SESSION_PROFILE_KEY = "baekji_city_tester_session_profile_v1";
  const SCROLL_SEEN_PREFIX = "baekji_city_party_creation_top_seen_v1:";
  const VERSION = "0.3.97";
  const DEMO_USERS = {
    test_a: { name: "테스트 캐릭터 A", initial: "A", profilePhoto: "" },
    test_b: { name: "테스트 캐릭터 B", initial: "B", profilePhoto: "" },
    test_c: { name: "테스트 캐릭터 C", initial: "C", profilePhoto: "" },
  };

  function unique(values) {
    return [...new Set(Array.isArray(values) ? values : [])];
  }

  function effectiveReady(party, memberId) {
    const marker = party?.readyStateBy?.[memberId];
    if (marker && typeof marker === "object" && typeof marker.ready === "boolean") return marker.ready;
    if (typeof marker === "boolean") return marker;
    return unique(party?.readyBy).includes(memberId);
  }

  function isFreshlyCreatedParty(party, userId, now = Date.now()) {
    if (!party || party.creatorId !== userId || party.sessionId) return false;
    const createdAt = Number(party.createdAt || 0);
    return createdAt > 0 && Math.abs(Number(now) - createdAt) <= 12_000;
  }

  function rosterSignature(party) {
    if (!party) return "";
    return [
      String(party.name || ""),
      String(party.status || ""),
      unique(party.memberIds).map((memberId) => `${memberId}:${effectiveReady(party, memberId) ? 1 : 0}`).join("|"),
      String(party.flowRevision || 0),
    ].join("::");
  }

  const TEST_API = Object.freeze({ effectiveReady, isFreshlyCreatedParty, rosterSignature });
  if (typeof window !== "undefined") window.__BAEKJI_MEMBER_HOME_ROSTER_TEST__ = TEST_API;
  if (typeof document === "undefined" || typeof localStorage === "undefined" || typeof sessionStorage === "undefined") return;

  let refreshFrame = 0;
  let observer = null;

  function readState(raw = null) {
    try {
      const parsed = JSON.parse(raw == null ? localStorage.getItem(GLOBAL_KEY) || "null" : raw);
      return parsed?.version === 3 ? parsed : null;
    } catch {
      return null;
    }
  }

  function currentUserId() {
    return String(sessionStorage.getItem(USER_KEY) || "");
  }

  function routeParts() {
    return (location.hash.replace(/^#\/?/, "") || "login").split("/").filter(Boolean);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function accountFor(userId) {
    const id = String(userId || "");
    const registry = window.__BAEKJI_TESTER_REGISTRY_GUARD__?.values?.() || [];
    const registered = registry.find((user) => String(user?.id || "") === id);
    if (registered) {
      const name = String(registered.name || registered.loginId || id).trim();
      return {
        id,
        name: name || id,
        initial: String(registered.initial || Array.from(name || "?")[0] || "?"),
        profilePhoto: String(registered.profilePhoto || ""),
      };
    }
    if (DEMO_USERS[id]) return { id, ...DEMO_USERS[id] };
    try {
      const saved = JSON.parse(sessionStorage.getItem(SESSION_PROFILE_KEY) || "null");
      if (String(saved?.id || "") === id) {
        const name = String(saved?.name || saved?.loginId || id).trim();
        return {
          id,
          name: name || id,
          initial: String(saved?.initial || Array.from(name || "?")[0] || "?"),
          profilePhoto: String(saved?.profilePhoto || ""),
        };
      }
    } catch { /* ignore */ }
    return { id, name: id || "알 수 없는 조사자", initial: "?", profilePhoto: "" };
  }

  function displayPartyName(snapshot, party) {
    const external = window.__BAEKJI_PARTY_NAME_UI__?.displayName?.(snapshot, party);
    return String(external || party?.name || "조사조").trim() || "조사조";
  }

  function avatarMarkup(account) {
    if (account.profilePhoto) {
      return `<img class="party-member-home-avatar-image" src="${escapeHtml(account.profilePhoto)}" alt="${escapeHtml(account.name)} 프로필 사진" />`;
    }
    return escapeHtml(account.initial || "?");
  }

  function readyControlMarkup(party, memberId, currentId) {
    const ready = effectiveReady(party, memberId);
    const text = ready ? "● 준비 완료" : "○ 준비 대기";
    const stateClass = ready ? "is-ready" : "is-waiting";
    const isSelf = memberId === currentId;
    if (isSelf && party.status === "RECRUITING" && !party.sessionId) {
      return `<button type="button" class="party-member-inline-ready ${stateClass}" data-preflight-member-ready="${escapeHtml(party.id)}" aria-pressed="${ready}">${text}</button>`;
    }
    if (isSelf && ["COMPOSITION_CONFIRMED", "READY_CHECK"].includes(String(party.status || "")) && !party.sessionId) {
      return `<button type="button" class="party-member-inline-ready ${stateClass}" data-member-ready="${escapeHtml(party.id)}" aria-pressed="${ready}">${text}</button>`;
    }
    return `<span class="party-ready-state ${stateClass}">${text}</span>`;
  }

  function memberRowMarkup(party, memberId, currentId) {
    const account = accountFor(memberId);
    const role = memberId === party.creatorId ? "조장" : "참가 조원";
    return `<div class="member party-member-home-row" data-party-home-member="${escapeHtml(memberId)}">
      <div class="member-avatar">${avatarMarkup(account)}</div>
      <div class="party-member-home-main"><div class="list-title">${escapeHtml(account.name)}</div><div class="list-sub">${role}</div></div>
      <div class="status-pills">${readyControlMarkup(party, memberId, currentId)}</div>
    </div>`;
  }

  function findMemberPartyCard(partyId) {
    const markers = [...document.querySelectorAll("[data-member-party-controls], [data-open-party], [data-party-member-roster]")];
    const marker = markers.find((node) =>
      String(node.dataset.memberPartyControls || node.dataset.openParty || node.dataset.partyMemberRoster || "") === String(partyId)
    );
    return marker?.closest("article.card") || null;
  }

  function decorateMemberHome(snapshot, userId) {
    const [page] = routeParts();
    if (page !== "home") return;
    const partyId = snapshot?.characters?.[userId]?.currentPartyId;
    const party = partyId ? snapshot.parties?.[partyId] : null;
    if (!party || party.creatorId === userId || !unique(party.memberIds).includes(userId)) return;

    const card = findMemberPartyCard(partyId);
    if (!card) return;
    card.classList.add("party-member-home-card");

    const header = card.querySelector(".card-header");
    const title = header?.querySelector("h2.card-title, h2");
    const help = header?.querySelector(".muted.small");
    const badge = header?.querySelector(".badge");
    const desiredTitle = displayPartyName(snapshot, party);
    if (title && title.textContent !== desiredTitle) title.textContent = desiredTitle;
    if (help && help.textContent !== "참가 캐릭터와 준비 상태를 이 화면에서 바로 확인합니다.") {
      help.textContent = "참가 캐릭터와 준비 상태를 이 화면에서 바로 확인합니다.";
    }
    if (badge) {
      const memberCountText = `${unique(party.memberIds).length}명`;
      if (badge.textContent !== memberCountText) badge.textContent = memberCountText;
      if (badge.className !== "badge green") badge.className = "badge green";
    }

    let roster = card.querySelector("[data-party-member-roster]");
    if (!roster) {
      roster = document.createElement("div");
      roster.className = "member-grid party-member-home-grid";
      roster.dataset.partyMemberRoster = party.id;
      const legacyItem = card.querySelector(".list-item");
      const legacyList = legacyItem?.parentElement?.classList?.contains("list") ? legacyItem.parentElement : null;
      if (legacyList && legacyList.children.length === 1) legacyList.replaceWith(roster);
      else if (legacyItem) legacyItem.replaceWith(roster);
      else card.appendChild(roster);
    }

    const signature = rosterSignature(party);
    if (roster.dataset.partyMemberRosterSignature !== signature) {
      roster.innerHTML = unique(party.memberIds).map((memberId) => memberRowMarkup(party, memberId, userId)).join("");
      roster.dataset.partyMemberRosterSignature = signature;
    }

    card.querySelectorAll("[data-party-roster-open], [data-member-party-controls]").forEach((node) => node.remove());
  }

  function scrollFreshPartyToTop(snapshot, userId) {
    const [page, partyId] = routeParts();
    if (page !== "party" || !partyId) return;
    const party = snapshot?.parties?.[partyId];
    if (!isFreshlyCreatedParty(party, userId)) return;
    const seenKey = `${SCROLL_SEEN_PREFIX}${partyId}`;
    if (sessionStorage.getItem(seenKey) === "1") return;
    sessionStorage.setItem(seenKey, "1");

    const scrollTop = () => {
      try { window.scrollTo({ top: 0, left: 0, behavior: "auto" }); }
      catch { window.scrollTo(0, 0); }
      if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
      document.documentElement.scrollTop = 0;
      if (document.body) document.body.scrollTop = 0;
    };
    scrollTop();
    queueMicrotask(scrollTop);
  }

  function refresh(snapshot = readState(), userId = currentUserId()) {
    if (!snapshot || !userId) return;
    scrollFreshPartyToTop(snapshot, userId);
    decorateMemberHome(snapshot, userId);
    document.documentElement.dataset.partyMemberHomeRosterVersion = VERSION;
  }

  function scheduleRefresh() {
    if (refreshFrame) return;
    refreshFrame = requestAnimationFrame(() => {
      refreshFrame = 0;
      refresh();
    });
  }

  window.addEventListener("storage", (event) => {
    if (event.key && event.key !== GLOBAL_KEY) return;
    refresh(readState(event.newValue || null), currentUserId());
  });
  window.addEventListener("hashchange", scheduleRefresh);
  window.addEventListener("baekji-party-flow-ux", scheduleRefresh);
  window.addEventListener("baekji-party-preflight-flow", scheduleRefresh);
  window.addEventListener("baekji-party-membership", scheduleRefresh);
  window.addEventListener("baekji-party-name-change", scheduleRefresh);
  window.addEventListener("baekji-cloud-sync", scheduleRefresh);

  const app = document.getElementById("app");
  if (app) {
    observer = new MutationObserver(scheduleRefresh);
    // The base app replaces #app's direct shell on route/state renders. Watching
    // descendants made this decorator observe its own text/roster mutations and
    // could create an endless MutationObserver -> microtask feedback loop.
    observer.observe(app, { childList: true });
  }

  window.__BAEKJI_MEMBER_HOME_ROSTER__ = Object.freeze({ version: VERSION, refresh, decorateMemberHome });
  refresh();
})();
