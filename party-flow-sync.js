(() => {
  "use strict";

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const DEFER_KEY_PREFIX = "baekji_city_mvp_deferred_invites_v1:";
  const ENHANCEMENT_VERSION = "0.3.19";
  const USER_LABELS = {
    test_a: { name: "테스트 캐릭터 A", initial: "A" },
    test_b: { name: "테스트 캐릭터 B", initial: "B" },
    test_c: { name: "테스트 캐릭터 C", initial: "C" },
  };

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function unique(values) {
    return [...new Set(Array.isArray(values) ? values : [])];
  }

  function pendingInvitationsFor(snapshot, userId) {
    if (!snapshot || !userId || snapshot.characters?.[userId]?.currentPartyId) return [];
    return Object.values(snapshot.parties || {}).filter((party) =>
      party?.status === "RECRUITING" &&
      Array.isArray(party.invitedIds) && party.invitedIds.includes(userId) &&
      !unique(party.memberIds).includes(userId) &&
      !unique(party.declinedIds).includes(userId)
    );
  }

  function briefingRequiredMemberIds(session, party) {
    if (!session) return [];
    const leaderId = party?.creatorId || null;
    return unique(session.memberIds).filter((memberId) => memberId !== leaderId);
  }

  function allBriefingMembersConfirmed(session, party) {
    const required = briefingRequiredMemberIds(session, party);
    const confirmed = unique(session?.briefingConfirmedBy);
    return required.every((memberId) => confirmed.includes(memberId));
  }

  function routeSyncTarget(snapshot, userId, currentPage, currentId = "") {
    const sessionId = snapshot?.characters?.[userId]?.currentSessionId;
    const session = sessionId ? snapshot.sessions?.[sessionId] : null;
    if (!session || !unique(session.memberIds).includes(userId)) return null;
    if (session.status === "BRIEFING" && !(currentPage === "briefing" && currentId === session.id)) {
      return `briefing/${session.id}`;
    }
    if (session.status === "ACTIVE" && !(currentPage === "investigate" && currentId === session.id)) {
      if (["party", "briefing"].includes(currentPage)) return `investigate/${session.id}`;
    }
    return null;
  }

  function acceptInviteState(snapshot, partyId, userId) {
    const draft = clone(snapshot);
    const party = draft.parties?.[partyId];
    const character = draft.characters?.[userId];
    if (!party || !character || party.status !== "RECRUITING" || character.currentPartyId) return draft;
    party.memberIds = unique([...(party.memberIds || []), userId]);
    party.invitedIds = unique(party.invitedIds).filter((id) => id !== userId);
    party.declinedIds = unique(party.declinedIds).filter((id) => id !== userId);
    character.currentPartyId = partyId;
    return draft;
  }

  function declineInviteState(snapshot, partyId, userId) {
    const draft = clone(snapshot);
    const party = draft.parties?.[partyId];
    if (!party) return draft;
    party.invitedIds = unique(party.invitedIds).filter((id) => id !== userId);
    party.declinedIds = unique([...(party.declinedIds || []), userId]);
    return draft;
  }

  function confirmBriefingState(snapshot, sessionId, userId) {
    const draft = clone(snapshot);
    const session = draft.sessions?.[sessionId];
    const party = session ? draft.parties?.[session.partyId] : null;
    if (!session || session.status !== "BRIEFING" || !unique(session.memberIds).includes(userId)) return draft;
    if (party?.creatorId === userId) return draft;
    session.briefingConfirmedBy = unique([...(session.briefingConfirmedBy || []), userId]);
    return draft;
  }

  const TEST_API = Object.freeze({
    pendingInvitationsFor,
    briefingRequiredMemberIds,
    allBriefingMembersConfirmed,
    routeSyncTarget,
    acceptInviteState,
    declineInviteState,
    confirmBriefingState,
  });
  window.__BAEKJI_PARTY_FLOW_TEST__ = TEST_API;

  if (typeof document === "undefined" || typeof localStorage === "undefined" || typeof sessionStorage === "undefined") return;

  let enhancementQueued = false;
  let routeSyncing = false;

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
    return sessionStorage.getItem(USER_KEY) || "";
  }

  function routeParts() {
    const raw = location.hash.replace(/^#\/?/, "") || "login";
    return raw.split("/").filter(Boolean);
  }

  function userLabel(userId) {
    return USER_LABELS[userId] || { name: userId || "알 수 없는 조사자", initial: "?" };
  }

  function writeState(snapshot) {
    localStorage.setItem(GLOBAL_KEY, JSON.stringify(snapshot));
    try {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    } catch {
      window.dispatchEvent(new Event("hashchange"));
    }
    scheduleEnhancement();
  }

  function deferredKey(userId) {
    return `${DEFER_KEY_PREFIX}${userId}`;
  }

  function readDeferredInvites(userId) {
    try {
      return unique(JSON.parse(sessionStorage.getItem(deferredKey(userId)) || "[]"));
    } catch {
      return [];
    }
  }

  function deferInvite(userId, partyId) {
    sessionStorage.setItem(deferredKey(userId), JSON.stringify(unique([...readDeferredInvites(userId), partyId])));
  }

  function clearDeferredInvite(userId, partyId) {
    const next = readDeferredInvites(userId).filter((id) => id !== partyId);
    sessionStorage.setItem(deferredKey(userId), JSON.stringify(next));
  }

  function clearInvitationModal() {
    document.querySelector(".retro-invite-backdrop[data-party-flow-modal]")?.remove();
  }

  function showInvitationModal(snapshot, userId) {
    const [page] = routeParts();
    if (page !== "home") {
      clearInvitationModal();
      return;
    }
    const root = document.getElementById("modal-root");
    if (!root || (root.children.length && !root.querySelector("[data-party-flow-modal]"))) return;

    const pending = pendingInvitationsFor(snapshot, userId);
    const pendingIds = new Set(pending.map((party) => party.id));
    const deferred = readDeferredInvites(userId).filter((partyId) => pendingIds.has(partyId));
    sessionStorage.setItem(deferredKey(userId), JSON.stringify(deferred));
    const invitation = pending.find((party) => !deferred.includes(party.id));

    if (!invitation) {
      clearInvitationModal();
      return;
    }
    const existingModal = root.querySelector("[data-party-flow-modal]");
    if (existingModal?.dataset.partyId === invitation.id) return;

    const inviter = userLabel(invitation.creatorId);
    root.innerHTML = `
      <div class="retro-invite-backdrop" data-party-flow-modal data-party-id="${escapeHtml(invitation.id)}">
        <section class="retro-invite-modal" role="dialog" aria-modal="true" aria-labelledby="party-invite-title" aria-describedby="party-invite-copy">
          <div class="retro-invite-emblem" aria-hidden="true">!</div>
          <div class="retro-invite-kicker">INVESTIGATION PARTY INVITATION</div>
          <h2 id="party-invite-title">조사조 초대가 도착했습니다</h2>
          <p id="party-invite-copy"><strong>${escapeHtml(inviter.name)}</strong>님이 <strong>${escapeHtml(invitation.name)}</strong>에 초대했습니다.</p>
          <div class="retro-invite-meta"><span>목적지</span><strong>E · 해오름역</strong></div>
          <div class="retro-invite-actions">
            <button type="button" class="button" data-party-flow-defer="${escapeHtml(invitation.id)}">보류</button>
            <button type="button" class="button danger" data-party-flow-decline="${escapeHtml(invitation.id)}">거절</button>
            <button type="button" class="button primary" data-party-flow-accept="${escapeHtml(invitation.id)}">수락</button>
          </div>
        </section>
      </div>`;
    requestAnimationFrame(() => root.querySelector("[data-party-flow-accept]")?.focus());
  }

  function syncRoute(snapshot, userId) {
    if (routeSyncing || !snapshot || !userId) return false;
    const [page, currentId = ""] = routeParts();
    if (page === "login") return false;
    const target = routeSyncTarget(snapshot, userId, page, currentId);
    if (!target) return false;
    routeSyncing = true;
    location.hash = `#/${target}`;
    queueMicrotask(() => { routeSyncing = false; });
    return true;
  }

  function enhanceReadyWaiting(snapshot, userId) {
    const [page, partyId] = routeParts();
    if (page !== "party" || !partyId) return;
    const party = snapshot.parties?.[partyId];
    if (!party || party.creatorId === userId || party.status !== "READY_CHECK" || party.sessionId) return;
    const allReady = unique(party.memberIds).every((memberId) => unique(party.readyBy).includes(memberId));
    if (!allReady) return;

    const readyButton = document.querySelector("[data-ready]");
    if (readyButton) {
      readyButton.disabled = true;
      if (readyButton.textContent !== "준비 완료됨") readyButton.textContent = "준비 완료됨";
    }
    const section = readyButton?.closest("section") || document.querySelector("main.container.narrow section:last-of-type");
    if (!section || section.querySelector("[data-party-flow-ready-wait]")) return;
    const notice = document.createElement("div");
    notice.className = "retro-flow-notice";
    notice.dataset.partyFlowReadyWait = "";
    notice.innerHTML = `
      <strong>전원 준비가 완료되었습니다.</strong>
      <span>조장이 <b>조사 세션 시작</b>을 누르면 모든 조원의 화면에 브리핑이 동시에 열립니다.</span>
      <button type="button" class="button" disabled>조장의 세션 시작을 기다리는 중</button>`;
    section.prepend(notice);
  }

  function briefingMemberMarkup(memberId, leaderId, confirmedIds) {
    const member = userLabel(memberId);
    const isLeader = memberId === leaderId;
    const confirmed = confirmedIds.includes(memberId);
    const stateText = isLeader ? "전원 확인 후 구역 진입" : confirmed ? "확인 완료" : "확인 대기";
    const stateClass = !isLeader && confirmed ? " complete" : "";
    return `<div class="briefing-member${stateClass}">
      <span class="briefing-member-icon" aria-hidden="true">${escapeHtml(member.initial)}</span>
      <span class="briefing-member-main"><strong>${escapeHtml(member.name)}</strong><small>${isLeader ? "조장" : "조원"}</small></span>
      <span class="briefing-member-state">${stateText}</span>
    </div>`;
  }

  function enhanceBriefing(snapshot, userId) {
    const [page, sessionId] = routeParts();
    if (page !== "briefing" || !sessionId) return;
    const session = snapshot.sessions?.[sessionId];
    const party = session ? snapshot.parties?.[session.partyId] : null;
    if (!session || !party || session.status !== "BRIEFING" || !unique(session.memberIds).includes(userId)) return;

    const leaderId = party.creatorId;
    const isLeader = leaderId === userId;
    const confirmedIds = unique(session.briefingConfirmedBy);
    const requiredIds = briefingRequiredMemberIds(session, party);
    const allConfirmed = allBriefingMembersConfirmed(session, party);
    const ownConfirmed = confirmedIds.includes(userId);
    const enterButton = document.querySelector("[data-enter-investigation]");
    const briefing = enterButton?.closest(".briefing") || document.querySelector(".briefing.card");
    if (!briefing) return;

    if (enterButton) {
      enterButton.disabled = !isLeader || !allConfirmed;
      enterButton.setAttribute("aria-disabled", String(enterButton.disabled));
      enterButton.title = isLeader
        ? allConfirmed ? "전원 확인 완료 · 구역에 진입합니다." : "조원들의 브리핑 확인을 기다리고 있습니다."
        : "구역 진입은 조장이 진행합니다.";
      const enterText = isLeader ? "구역 진입" : "조장 진입 대기";
      if (enterButton.textContent !== enterText) enterButton.textContent = enterText;
    }

    if (briefing.querySelector("[data-party-flow-briefing-confirmation]")) return;
    const pendingNames = requiredIds.filter((memberId) => !confirmedIds.includes(memberId)).map((memberId) => userLabel(memberId).name);
    const panel = document.createElement("section");
    panel.className = "briefing-confirmation";
    panel.dataset.partyFlowBriefingConfirmation = "";
    panel.innerHTML = `
      <div class="briefing-confirmation-header">
        <div><span class="retro-invite-kicker">PARTY SYNC</span><h3>브리핑 확인</h3></div>
        <span class="badge ${allConfirmed ? "green" : ""}">${confirmedIds.filter((id) => requiredIds.includes(id)).length}/${requiredIds.length}명 확인</span>
      </div>
      <p class="muted small">조원 전원이 내용을 확인하면 조장의 구역 진입 버튼이 활성화됩니다. 조장이 진입하면 모든 조원의 조사가 동시에 시작됩니다.</p>
      <div class="briefing-member-list">${unique(session.memberIds).map((memberId) => briefingMemberMarkup(memberId, leaderId, confirmedIds)).join("")}</div>
      ${isLeader ? `
        <div class="retro-flow-notice${allConfirmed ? " complete" : ""}">
          <strong>${allConfirmed ? "전원 브리핑 확인 완료" : "조원들의 브리핑 확인 중"}</strong>
          <span>${allConfirmed ? "구역 진입 버튼이 활성화되었습니다." : `${escapeHtml(pendingNames.join(", ") || "조원")}의 확인을 기다리고 있습니다.`}</span>
        </div>` : `
        <button type="button" class="button primary block" data-party-flow-confirm-briefing="${escapeHtml(sessionId)}" ${ownConfirmed ? "disabled" : ""}>${ownConfirmed ? "브리핑 확인 완료됨" : "브리핑 확인 완료"}</button>
        <p class="muted small briefing-member-help">확인 후 조장이 구역에 진입할 때까지 이 화면에서 기다려 주세요.</p>`}`;
    const buttonRow = enterButton?.closest(".button-row");
    if (buttonRow) briefing.insertBefore(panel, buttonRow);
    else briefing.append(panel);
  }

  function enhance() {
    enhancementQueued = false;
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !userId) {
      clearInvitationModal();
      return;
    }
    if (syncRoute(snapshot, userId)) return;
    showInvitationModal(snapshot, userId);
    enhanceReadyWaiting(snapshot, userId);
    enhanceBriefing(snapshot, userId);
    document.documentElement.dataset.partyFlowVersion = ENHANCEMENT_VERSION;
  }

  function scheduleEnhancement() {
    if (enhancementQueued) return;
    enhancementQueued = true;
    queueMicrotask(enhance);
  }

  function acceptInvitation(partyId) {
    const userId = currentUserId();
    const snapshot = readState();
    if (!snapshot || !userId) return;
    const next = acceptInviteState(snapshot, partyId, userId);
    if (next.characters?.[userId]?.currentPartyId !== partyId) return;
    clearDeferredInvite(userId, partyId);
    clearInvitationModal();
    localStorage.setItem(GLOBAL_KEY, JSON.stringify(next));
    location.hash = `#/party/${partyId}`;
  }

  function declineInvitation(partyId) {
    const userId = currentUserId();
    const snapshot = readState();
    if (!snapshot || !userId) return;
    clearDeferredInvite(userId, partyId);
    clearInvitationModal();
    writeState(declineInviteState(snapshot, partyId, userId));
  }

  function confirmBriefing(sessionId) {
    const userId = currentUserId();
    const snapshot = readState();
    if (!snapshot || !userId) return;
    writeState(confirmBriefingState(snapshot, sessionId, userId));
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const deferButton = target.closest("[data-party-flow-defer]");
    if (deferButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const userId = currentUserId();
      deferInvite(userId, deferButton.dataset.partyFlowDefer);
      clearInvitationModal();
      scheduleEnhancement();
      return;
    }

    const acceptButton = target.closest("[data-party-flow-accept], [data-accept]");
    if (acceptButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      acceptInvitation(acceptButton.dataset.partyFlowAccept || acceptButton.dataset.accept);
      return;
    }

    const declineButton = target.closest("[data-party-flow-decline], [data-decline]");
    if (declineButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      declineInvitation(declineButton.dataset.partyFlowDecline || declineButton.dataset.decline);
      return;
    }

    const confirmButton = target.closest("[data-party-flow-confirm-briefing]");
    if (confirmButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      confirmBriefing(confirmButton.dataset.partyFlowConfirmBriefing);
      return;
    }

    const enterButton = target.closest("[data-enter-investigation]");
    if (enterButton) {
      const snapshot = readState();
      const userId = currentUserId();
      const [, sessionId] = routeParts();
      const session = snapshot?.sessions?.[sessionId];
      const party = session ? snapshot.parties?.[session.partyId] : null;
      const allowed = Boolean(session && party && party.creatorId === userId && allBriefingMembersConfirmed(session, party));
      if (!allowed) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }
  }, true);

  window.addEventListener("hashchange", scheduleEnhancement);
  window.addEventListener("storage", (event) => {
    if (event.key !== GLOBAL_KEY) return;
    const snapshot = readState();
    const userId = currentUserId();
    if (!syncRoute(snapshot, userId)) scheduleEnhancement();
  });
  window.addEventListener("pageshow", scheduleEnhancement);

  const observer = new MutationObserver(scheduleEnhancement);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scheduleEnhancement();
})();
