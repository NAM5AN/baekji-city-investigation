(() => {
  "use strict";
  const { clone, uniqueArray: unique } = window.__BAEKJI_RUNTIME_UTILS__;
  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const VERSION = "0.3.68";

  function currentParty(snapshot, userId) {
    const partyId = snapshot?.characters?.[userId]?.currentPartyId;
    return partyId ? snapshot.parties?.[partyId] || null : null;
  }

  function isPartyLeader(snapshot, userId, partyId = null) {
    const party = partyId ? snapshot?.parties?.[partyId] : currentParty(snapshot, userId);
    return Boolean(party && party.creatorId === userId);
  }

  function createLeaderPartyState(snapshot, userId, partyId, createdAt = Date.now()) {
    const draft = clone(snapshot);
    const character = draft.characters?.[userId];
    if (!character || character.currentPartyId) return draft;
    draft.parties ||= {};
    draft.parties[partyId] = {
      id: partyId,
      name: `해오름역 조사조 ${Object.keys(draft.parties).length + 1}`,
      creatorId: userId,
      destination: "E",
      status: "RECRUITING",
      memberIds: [userId],
      invitedIds: [],
      declinedIds: [],
      confirmedBy: [],
      readyBy: [],
      sessionId: null,
      createdAt,
    };
    character.currentPartyId = partyId;
    return draft;
  }

  function acceptInviteAsMemberState(snapshot, partyId, userId) {
    const draft = clone(snapshot);
    const party = draft.parties?.[partyId];
    const character = draft.characters?.[userId];
    if (!party || !character || !["RECRUITING", "COMPOSITION_CONFIRMED", "READY_CHECK"].includes(party.status) || character.currentPartyId) return draft;
    if (!unique(party.invitedIds).includes(userId)) return draft;
    party.memberIds = unique([...(party.memberIds || []), userId]);
    party.invitedIds = unique(party.invitedIds).filter((id) => id !== userId);
    party.declinedIds = unique(party.declinedIds).filter((id) => id !== userId);
    party.readyBy = unique(party.readyBy).filter((id) => id !== userId && party.memberIds.includes(id));
    party.confirmedBy = unique(party.confirmedBy).filter((id) => party.memberIds.includes(id));
    if (["COMPOSITION_CONFIRMED", "READY_CHECK"].includes(party.status)) {
      party.status = "COMPOSITION_CONFIRMED";
      party.confirmedBy = unique([...party.confirmedBy, userId]);
      party.readyStateBy = party.readyStateBy && typeof party.readyStateBy === "object" ? { ...party.readyStateBy } : {};
      party.readyStateBy[userId] = { ready: false, at: Date.now() };
    }
    character.currentPartyId = partyId;
    return draft;
  }

  function confirmCompositionAsMemberState(snapshot, partyId, userId) {
    const draft = clone(snapshot);
    const party = draft.parties?.[partyId];
    if (!party || party.creatorId === userId || party.status !== "RECRUITING" || !unique(party.memberIds).includes(userId)) return draft;
    party.confirmedBy = unique([...(party.confirmedBy || []), userId]);
    if (unique(party.memberIds).every((id) => party.confirmedBy.includes(id))) party.status = "COMPOSITION_CONFIRMED";
    return draft;
  }

  function setReadyAsMemberState(snapshot, partyId, userId) {
    const draft = clone(snapshot);
    const party = draft.parties?.[partyId];
    if (!party || party.creatorId === userId || !["COMPOSITION_CONFIRMED", "READY_CHECK"].includes(party.status) || !unique(party.memberIds).includes(userId)) return draft;
    if (party.status === "READY_CHECK") party.status = "COMPOSITION_CONFIRMED";
    party.readyBy = unique([...(party.readyBy || []), userId]);
    return draft;
  }

  function memberControlState(snapshot, userId) {
    const party = currentParty(snapshot, userId);
    if (!party || party.creatorId === userId) return null;
    return {
      partyId: party.id,
      status: party.status,
      confirmed: unique(party.confirmedBy).includes(userId),
      ready: unique(party.readyBy).includes(userId),
      canConfirm: party.status === "RECRUITING" && !unique(party.confirmedBy).includes(userId),
      canReady: ["COMPOSITION_CONFIRMED", "READY_CHECK"].includes(party.status) && !unique(party.readyBy).includes(userId),
    };
  }

  function partyRoute(partyId) {
    return `#/party/${partyId}`;
  }

  const TEST_API = Object.freeze({
    currentParty,
    isPartyLeader,
    createLeaderPartyState,
    acceptInviteAsMemberState,
    confirmCompositionAsMemberState,
    setReadyAsMemberState,
    memberControlState,
    partyRoute,
  });
  window.__BAEKJI_PARTY_LEADERSHIP_TEST__ = TEST_API;

  if (typeof document === "undefined" || typeof localStorage === "undefined" || typeof sessionStorage === "undefined") return;
  const persistence = window.__BAEKJI_WORLD_PERSISTENCE__;
  if (!persistence) return;

  let refreshQueued = false;
  let navigationTimer = 0;

  function readState() {
    try {
      const parsed = JSON.parse(persistence.readRaw() || "null");
      return parsed?.version === 3 ? parsed : null;
    } catch {
      return null;
    }
  }

  function currentUserId() {
    return sessionStorage.getItem(USER_KEY) || "";
  }

  function routeParts() {
    const raw = location.hash.replace(/^#\/?/, "") || "login";
    return raw.split("/").filter(Boolean);
  }

  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      refresh();
    });
  }

  function clearLeadershipModal() {
    const root = document.getElementById("modal-root");
    const warning = root?.querySelector?.("[data-party-leadership-warning]") || document.querySelector("[data-party-leadership-warning]");
    if (warning && root?.contains?.(warning)) root.replaceChildren();
    else warning?.remove?.();
    document.querySelectorAll?.("[data-party-leadership-warning]")?.forEach?.((node) => node.remove?.());
  }

  function showLeadershipWarning() {
    const root = document.getElementById("modal-root");
    if (!root || root.querySelector("[data-party-leadership-warning]")) return;
    if (root.children.length) return;
    root.innerHTML = `
      <div class="retro-invite-backdrop" data-party-leadership-warning>
        <section class="retro-invite-modal" role="dialog" aria-modal="true" aria-labelledby="party-leader-warning-title">
          <div class="retro-invite-emblem" aria-hidden="true">!</div>
          <div class="retro-invite-kicker">PARTY LEADER CONFIRMATION</div>
          <h2 id="party-leader-warning-title">새 조사조를 구성하시겠습니까?</h2>
          <p><strong>조사조를 생성하면 이번 조사조의 조장이 됩니다.</strong></p>
          <p style="margin-top:10px">조사조에 참여하는 동안에는 다른 참가자가 보내는 조사조 초대를 받을 수 없습니다. 조원으로 참여하려는 경우 이 창을 닫고 초대를 기다려 주세요.</p>
          <div class="retro-invite-actions" style="grid-template-columns:1fr 1.2fr">
            <button type="button" class="button" data-party-leadership-cancel>취소</button>
            <button type="button" class="button primary" data-party-leadership-confirm>조사조 만들기</button>
          </div>
        </section>
      </div>`;
    requestAnimationFrame(() => root.querySelector("[data-party-leadership-confirm]")?.focus());
  }

  function showLeadershipNotice(message) {
    const warning = document.querySelector("[data-party-leadership-warning]");
    const modal = warning?.querySelector?.(".retro-invite-modal");
    if (!modal) return;
    let notice = modal.querySelector("[data-party-leadership-notice]");
    if (!notice) {
      notice = document.createElement("p");
      notice.className = "faint small";
      notice.dataset.partyLeadershipNotice = "";
      notice.setAttribute("aria-live", "polite");
      modal.append(notice);
    }
    notice.textContent = message;
  }

  function navigateToParty(partyId) {
    const target = partyRoute(partyId);
    clearLeadershipModal();
    if (location.hash !== target) location.hash = target;
    clearTimeout(navigationTimer);
    navigationTimer = setTimeout(() => {
      clearLeadershipModal();
      if (location.hash !== target) location.hash = target;
      scheduleRefresh();
    }, 40);
  }

  const createPartyInFlight = new Set();

  async function createPartyAfterWarning() {
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !userId) {
      showLeadershipNotice("현재 상태를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    const existingPartyId = String(snapshot?.characters?.[userId]?.currentPartyId || "");
    if (existingPartyId) {
      navigateToParty(existingPartyId);
      return;
    }
    if (createPartyInFlight.has(userId)) return;
    createPartyInFlight.add(userId);
    try {
      const result = await window.__BAEKJI_PLAYER_WORLD_COMMANDS__.dispatch("CREATE_PARTY_V1", {});
      if (["APPLIED", "REPLAY"].includes(result?.status)) {
        const partyId = String(readState()?.characters?.[userId]?.currentPartyId || "");
        if (partyId) navigateToParty(partyId);
        else showLeadershipNotice("조사조 생성 결과를 동기화하는 중입니다. 잠시 후 다시 시도해 주세요.");
      } else if (result?.status === "REVISION_CONFLICT") {
        showLeadershipNotice("조사조 상태가 변경되었습니다. 최신 상태를 확인한 뒤 다시 시도해 주세요.");
      } else {
        showLeadershipNotice("현재 상태에서는 조사조를 만들 수 없습니다.");
      }
    } catch (error) {
      if (error?.message === "WORLD_COMMAND_SYNC_NOT_READY") showLeadershipNotice("동기화 중입니다. 잠시 후 다시 시도해 주세요.");
      else showLeadershipNotice("조사조 생성을 저장하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.");
    } finally {
      createPartyInFlight.delete(userId);
    }
  }

  function confirmMemberComposition() { return false; }

  function hideBusyInviteCandidates(snapshot) {
    const [page] = routeParts();
    if (page !== "party") return;
    document.querySelectorAll(".retro-invite-card, section.card .list-item").forEach((card) => {
      const button = card.querySelector("[data-invite]");
      if (!button) return;
      const targetId = button.dataset.invite;
      if (snapshot.characters?.[targetId]?.currentPartyId) card.remove();
    });
  }

  function decorateLeaderPage(snapshot, userId) {
    const [page, partyId] = routeParts();
    if (page !== "party" || !partyId) return;
    const party = snapshot.parties?.[partyId];
    if (!party) return;
    if (party.creatorId !== userId) {
      clearLeadershipModal();
      if (location.hash !== "#/home") location.hash = "#/home";
      return;
    }
    const lead = document.querySelector("main.container.narrow .hero .lead");
    const leadCopy = "이 조사조를 생성한 캐릭터가 이번 조사조의 조장 역할을 맡습니다. 조장은 조원 초대와 세션 시작을 담당합니다.";
    if (lead && lead.textContent !== leadCopy) lead.textContent = leadCopy;
    const participantHelp = [...document.querySelectorAll("section.card .card-header .muted.small")].find((node) => String(node.textContent || "").includes("각 캐릭터가 자신의 탭"));
    const helpCopy = "조원은 자신의 홈 화면에서 구성 확인과 준비 완료를 진행합니다.";
    if (participantHelp && participantHelp.textContent !== helpCopy) participantHelp.textContent = helpCopy;
  }

  function refresh() {
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !userId) return;
    hideBusyInviteCandidates(snapshot);
    decorateLeaderPage(snapshot, userId);
    document.documentElement.dataset.partyLeadershipVersion = VERSION;
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const createButton = target.closest("[data-create-party]");
    if (createButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const snapshot = readState();
      const userId = currentUserId();
      if (!snapshot || !userId) return;
      const existing = currentParty(snapshot, userId);
      if (existing && existing.creatorId === userId) {
        navigateToParty(existing.id);
        return;
      }
      if (existing) return;
      showLeadershipWarning();
      return;
    }

    if (target.closest("[data-party-leadership-cancel]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      clearLeadershipModal();
      return;
    }

    if (target.closest("[data-party-leadership-confirm]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      createPartyAfterWarning();
      return;
    }

    const confirmButton = target.closest("[data-member-confirm-composition]");
    if (confirmButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      confirmMemberComposition(confirmButton.dataset.memberConfirmComposition);
      return;
    }

    const openButton = target.closest("[data-open-party]");
    if (openButton) {
      const snapshot = readState();
      const userId = currentUserId();
      if (snapshot && userId && !isPartyLeader(snapshot, userId, openButton.dataset.openParty)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        scheduleRefresh();
      }
    }
  }, true);

  window.addEventListener("hashchange", () => {
    clearLeadershipModal();
    scheduleRefresh();
  });
  window.addEventListener("storage", (event) => { if (event.key === GLOBAL_KEY) scheduleRefresh(); });
  window.addEventListener("baekji-cloud-sync", scheduleRefresh);
  window.addEventListener("pageshow", () => {
    clearLeadershipModal();
    scheduleRefresh();
  });

  requestAnimationFrame(() => requestAnimationFrame(scheduleRefresh));
})();
