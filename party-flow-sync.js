(() => {
  "use strict";
  const { clone, uniqueArray: unique, escapeHtml } = window.__BAEKJI_RUNTIME_UTILS__;

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const DEFER_KEY_PREFIX = "baekji_city_mvp_deferred_invites_v1:";
  const ENHANCEMENT_VERSION = "0.3.67";
  const USER_LABELS = {
    test_a: { name: "테스트 캐릭터 A", initial: "A" },
    test_b: { name: "테스트 캐릭터 B", initial: "B" },
    test_c: { name: "테스트 캐릭터 C", initial: "C" },
  };

  function registeredUserLabel(userId) {
    const id = String(userId || "");
    const legacy = USER_LABELS[id];
    if (legacy) return { id, ...legacy, profilePhoto: "" };
    const tester = window.__BAEKJI_TESTER_REGISTRY_GUARD__?.values?.()
      ?.find((candidate) => String(candidate?.id || "") === id);
    const name = String(tester?.name || tester?.loginId || "").trim();
    if (!name) return null;
    return {
      id,
      name,
      initial: String(tester?.initial || Array.from(name)[0] || "?"),
      profilePhoto: String(tester?.profilePhoto || ""),
    };
  }

  function pendingInvitationsFor(snapshot, userId) {
    if (!snapshot || !userId || snapshot.characters?.[userId]?.currentPartyId) return [];
    return Object.values(snapshot.parties || {}).filter((party) =>
      ["RECRUITING", "COMPOSITION_CONFIRMED"].includes(party?.status) &&
      Array.isArray(party.invitedIds) && party.invitedIds.includes(userId) &&
      !unique(party.memberIds).includes(userId) &&
      !unique(party.declinedIds).includes(userId)
    );
  }

  function invitationPopupAllowed(snapshot, userId, page) {
    if (!snapshot || !userId || ["login", "investigate", "result"].includes(page)) return false;
    const sessionId = snapshot.characters?.[userId]?.currentSessionId;
    const session = sessionId ? snapshot.sessions?.[sessionId] : null;
    if (!session) return true;
    return session.status === "BRIEFING";
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
    if (!party || !character || !["RECRUITING", "COMPOSITION_CONFIRMED"].includes(party.status) || character.currentPartyId) return draft;
    if (!unique(party.invitedIds).includes(userId)) return draft;
    party.memberIds = unique([...(party.memberIds || []), userId]);
    party.invitedIds = unique(party.invitedIds).filter((id) => id !== userId);
    party.declinedIds = unique(party.declinedIds).filter((id) => id !== userId);
    party.readyBy = unique(party.readyBy).filter((id) => id !== userId && party.memberIds.includes(id));
    party.confirmedBy = unique(party.confirmedBy).filter((id) => party.memberIds.includes(id));
    if (party.status === "COMPOSITION_CONFIRMED") {
      party.confirmedBy = unique([...party.confirmedBy, userId]);
      party.readyStateBy = party.readyStateBy && typeof party.readyStateBy === "object" ? { ...party.readyStateBy } : {};
      party.readyStateBy[userId] = { ready: false, at: Date.now() };
    }
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
    invitationPopupAllowed,
    briefingRequiredMemberIds,
    allBriefingMembersConfirmed,
    routeSyncTarget,
    acceptInviteState,
    declineInviteState,
    confirmBriefingState,
    registeredUserLabel,
  });
  window.__BAEKJI_PARTY_FLOW_TEST__ = TEST_API;

  if (typeof document === "undefined" || typeof localStorage === "undefined" || typeof sessionStorage === "undefined") return;
  const persistence = window.__BAEKJI_WORLD_PERSISTENCE__;
  if (!persistence) return;

  let enhancementQueued = false;
  let routeSyncing = false;
  const declineInvitationInFlight = new Set();
  const acceptInvitationInFlight = new Set();

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

  function userLabel(userId) {
    return registeredUserLabel(userId) || { name: userId || "알 수 없는 조사자", initial: "?" };
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

  function showInvitationCommandNotice(message) {
    const modal = document.querySelector(".retro-invite-backdrop[data-party-flow-modal] .retro-invite-modal");
    if (!modal) return;
    modal.querySelector("[data-party-flow-command-notice]")?.remove();
    const notice = document.createElement("p");
    notice.dataset.partyFlowCommandNotice = "";
    notice.className = "muted small";
    notice.textContent = message;
    modal.append(notice);
  }

  function showInvitationModal(snapshot, userId) {
    const [page] = routeParts();
    if (!invitationPopupAllowed(snapshot, userId, page)) {
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
    document.documentElement.dataset.partyFlowVersion = ENHANCEMENT_VERSION;
  }

  function scheduleEnhancement() {
    if (enhancementQueued) return;
    enhancementQueued = true;
    queueMicrotask(enhance);
  }

  async function acceptInvitation(partyId) {
    const userId = currentUserId();
    if (!userId || acceptInvitationInFlight.has(partyId)) return;
    acceptInvitationInFlight.add(partyId);
    try {
      const result = await window.__BAEKJI_PLAYER_WORLD_COMMANDS__.dispatch("ACCEPT_PARTY_INVITE_V1", { partyId });
      if (["APPLIED", "NOOP", "REPLAY"].includes(result?.status)) {
        clearDeferredInvite(userId, partyId);
        clearInvitationModal();
        location.hash = `#/party/${partyId}`;
      } else if (result?.status === "REVISION_CONFLICT") {
        showInvitationCommandNotice("초대 상태가 변경되었습니다. 최신 상태를 확인한 뒤 다시 시도해 주세요.");
      } else {
        showInvitationCommandNotice("초대 상태가 이미 변경되었을 수 있습니다. 최신 상태를 확인해 주세요.");
      }
    } catch (error) {
      if (error?.message === "WORLD_COMMAND_SYNC_NOT_READY") showInvitationCommandNotice("최신 상태를 확인하는 중입니다. 잠시 후 다시 시도해 주세요.");
      else {
        console.warn("[party-flow] invitation accept unavailable", error?.message || error);
        showInvitationCommandNotice("초대 수락을 저장하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.");
      }
    } finally { acceptInvitationInFlight.delete(partyId); }
  }

  async function declineInvitation(partyId) {
    const userId = currentUserId();
    const snapshot = readState();
    if (!snapshot || !userId) return;
    if (declineInvitationInFlight.has(partyId)) return;
    declineInvitationInFlight.add(partyId);
    try {
      const result = await window.__BAEKJI_PLAYER_WORLD_COMMANDS__.dispatch("DECLINE_PARTY_INVITE_V1", { partyId });
      if (["APPLIED", "NOOP", "REPLAY"].includes(result?.status)) {
        clearDeferredInvite(userId, partyId);
        clearInvitationModal();
      } else if (result?.status === "REVISION_CONFLICT") {
        console.warn("[party-flow] invitation changed; authoritative refresh requested");
        showInvitationCommandNotice("초대 상태가 변경되었습니다. 최신 상태를 확인한 뒤 다시 시도해 주세요.");
      } else {
        console.warn("[party-flow] invitation decline out of scope");
        showInvitationCommandNotice("초대 상태가 이미 변경되었을 수 있습니다. 최신 상태를 확인해 주세요.");
      }
    } catch (error) {
      if (error?.message === "WORLD_COMMAND_SYNC_NOT_READY") {
        showInvitationCommandNotice("최신 상태를 확인하는 중입니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      console.warn("[party-flow] invitation decline unavailable", error?.message || error);
    } finally {
      declineInvitationInFlight.delete(partyId);
    }
  }

  async function confirmBriefing(sessionId) {
    const userId = currentUserId();
    const snapshot = readState();
    if (!snapshot || !userId) return;
    const session = snapshot.sessions?.[sessionId];
    if (!session || session.status !== "BRIEFING" || !unique(session.memberIds).includes(userId)) return;
    try {
      await window.__BAEKJI_PLAYER_WORLD_COMMANDS__.dispatch("CONFIRM_BRIEFING_V1", {});
    } catch (error) {
      console.warn("[party-flow] briefing confirmation unavailable", error?.message || error);
    }
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

    const acceptButton = target.closest("[data-party-flow-accept]");
    if (acceptButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void acceptInvitation(acceptButton.dataset.partyFlowAccept);
      return;
    }

    const declineButton = target.closest("[data-party-flow-decline]");
    if (declineButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void declineInvitation(declineButton.dataset.partyFlowDecline);
      return;
    }

    const confirmButton = target.closest("[data-party-flow-confirm-briefing]");
    if (confirmButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      void confirmBriefing(confirmButton.dataset.partyFlowConfirmBriefing);
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
  window.addEventListener("baekji-cloud-sync", scheduleEnhancement);
  window.addEventListener("pageshow", scheduleEnhancement);

  const observer = new MutationObserver(scheduleEnhancement);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scheduleEnhancement();
})();
