(() => {
  "use strict";

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const DEFER_KEY_PREFIX = "baekji_city_mvp_deferred_invites_v1:";
  const VERSION = "0.3.81";

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function unique(values) {
    return [...new Set(Array.isArray(values) ? values : [])];
  }

  function effectiveReady(party, memberId) {
    const marker = party?.readyStateBy?.[memberId];
    if (marker && typeof marker === "object" && typeof marker.ready === "boolean") return marker.ready;
    if (typeof marker === "boolean") return marker;
    return unique(party?.readyBy).includes(memberId);
  }

  function readyIds(party) {
    return unique(party?.memberIds).filter((memberId) => effectiveReady(party, memberId));
  }

  function readyCount(party) {
    return readyIds(party).length;
  }

  function ensureReadyStateMap(party, at = Date.now()) {
    party.readyStateBy = party.readyStateBy && typeof party.readyStateBy === "object" && !Array.isArray(party.readyStateBy)
      ? { ...party.readyStateBy }
      : {};
    unique(party.memberIds).forEach((memberId) => {
      if (party.readyStateBy[memberId] === undefined) {
        party.readyStateBy[memberId] = { ready: unique(party.readyBy).includes(memberId), at };
      }
    });
    return party.readyStateBy;
  }

  function acceptInviteState(snapshot, partyId, userId) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    const character = draft?.characters?.[userId];
    if (!party || !character || party.status !== "RECRUITING" || character.currentPartyId) return draft;
    if (!unique(party.invitedIds).includes(userId)) return draft;
    party.memberIds = unique([...(party.memberIds || []), userId]);
    party.invitedIds = unique(party.invitedIds).filter((id) => id !== userId);
    party.declinedIds = unique(party.declinedIds).filter((id) => id !== userId);
    party.confirmedBy = unique(party.confirmedBy).filter((id) => party.memberIds.includes(id));
    party.readyBy = unique(party.readyBy).filter((id) => party.memberIds.includes(id));
    character.currentPartyId = partyId;
    return draft;
  }

  function lockCompositionState(snapshot, partyId, leaderId, at = Date.now()) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    if (!party || party.creatorId !== leaderId || party.status !== "RECRUITING") return draft;
    party.memberIds = unique(party.memberIds);
    party.confirmedBy = [...party.memberIds];
    party.readyBy = [];
    party.readyStateBy = {};
    party.memberIds.forEach((memberId) => { party.readyStateBy[memberId] = { ready: false, at }; });
    party.status = "COMPOSITION_CONFIRMED";
    party.compositionLockedAt = at;
    party.flowRevision = Math.max(0, Number(party.flowRevision || 0)) + 1;
    return draft;
  }

  function reopenCompositionState(snapshot, partyId, leaderId, at = Date.now()) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    if (!party || party.creatorId !== leaderId || party.status !== "COMPOSITION_CONFIRMED" || party.sessionId) return draft;
    party.status = "RECRUITING";
    party.confirmedBy = [];
    party.readyBy = [];
    party.readyStateBy = {};
    unique(party.memberIds).forEach((memberId) => { party.readyStateBy[memberId] = { ready: false, at }; });
    party.compositionLockedAt = null;
    party.flowRevision = Math.max(0, Number(party.flowRevision || 0)) + 1;
    return draft;
  }

  function toggleReadyState(snapshot, partyId, userId, at = Date.now()) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    if (!party || !["COMPOSITION_CONFIRMED", "READY_CHECK"].includes(party.status) || !unique(party.memberIds).includes(userId)) return draft;
    ensureReadyStateMap(party, at);
    const nextReady = !effectiveReady(party, userId);
    party.readyStateBy[userId] = { ready: nextReady, at };
    party.readyBy = unique(party.memberIds).filter((memberId) => effectiveReady(party, memberId));
    if (party.status === "COMPOSITION_CONFIRMED") party.status = "READY_CHECK";
    party.flowRevision = Math.max(0, Number(party.flowRevision || 0)) + 1;
    return draft;
  }

  const TEST_API = Object.freeze({
    effectiveReady,
    readyIds,
    readyCount,
    acceptInviteState,
    lockCompositionState,
    reopenCompositionState,
    toggleReadyState,
  });
  if (typeof window !== "undefined") window.__BAEKJI_PARTY_FLOW_UX_TEST__ = TEST_API;
  if (typeof document === "undefined" || typeof localStorage === "undefined" || typeof sessionStorage === "undefined") return;

  let refreshQueued = false;

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

  function dispatchStateUpdate(oldRaw, newRaw) {
    try {
      window.dispatchEvent(new StorageEvent("storage", {
        key: GLOBAL_KEY,
        oldValue: oldRaw,
        newValue: newRaw,
        storageArea: localStorage,
        url: location.href,
      }));
    } catch {
      const event = new Event("storage");
      Object.defineProperty(event, "key", { value: GLOBAL_KEY });
      window.dispatchEvent(event);
    }
    window.dispatchEvent(new CustomEvent("baekji-party-flow-ux", { detail: { version: VERSION } }));
  }

  function writeState(snapshot) {
    if (!snapshot?.version) return false;
    const oldRaw = localStorage.getItem(GLOBAL_KEY);
    const newRaw = JSON.stringify(snapshot);
    if (oldRaw === newRaw) return false;
    localStorage.setItem(GLOBAL_KEY, newRaw);
    dispatchStateUpdate(oldRaw, newRaw);
    scheduleRefresh();
    return true;
  }

  function clearDeferredInvite(userId, partyId) {
    const key = `${DEFER_KEY_PREFIX}${userId}`;
    try {
      const values = unique(JSON.parse(sessionStorage.getItem(key) || "[]")).filter((id) => id !== partyId);
      sessionStorage.setItem(key, JSON.stringify(values));
    } catch {
      sessionStorage.setItem(key, "[]");
    }
  }

  function closeInviteModal() {
    const root = document.getElementById("modal-root");
    if (root?.querySelector("[data-party-flow-modal]")) root.replaceChildren();
    document.querySelectorAll(".retro-invite-backdrop[data-party-flow-modal]").forEach((node) => node.remove());
  }

  function acceptInvite(partyId) {
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !userId) return false;
    const next = acceptInviteState(snapshot, partyId, userId);
    if (next.characters?.[userId]?.currentPartyId !== partyId) return false;
    closeInviteModal();
    clearDeferredInvite(userId, partyId);
    writeState(next);
    if (location.hash !== "#/home") location.hash = "#/home";
    else scheduleRefresh();
    return true;
  }

  function lockComposition(partyId) {
    const snapshot = readState();
    const userId = currentUserId();
    const next = lockCompositionState(snapshot, partyId, userId);
    if (next?.parties?.[partyId]?.status !== "COMPOSITION_CONFIRMED") return false;
    return writeState(next);
  }

  function reopenComposition(partyId) {
    const snapshot = readState();
    const userId = currentUserId();
    const next = reopenCompositionState(snapshot, partyId, userId);
    if (next?.parties?.[partyId]?.status !== "RECRUITING") return false;
    return writeState(next);
  }

  function toggleReady(partyId) {
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !userId) return false;
    const before = snapshot.parties?.[partyId];
    if (!before) return false;
    const next = toggleReadyState(snapshot, partyId, userId);
    const after = next.parties?.[partyId];
    if (!after || effectiveReady(after, userId) === effectiveReady(before, userId)) return false;
    return writeState(next);
  }

  function memberControlsMarkup(party, userId) {
    const partyId = escapeHtml(party.id);
    const roster = `<button type="button" class="button small" data-party-roster-open="${partyId}">조원 보기</button>`;
    if (["COMPOSITION_CONFIRMED", "READY_CHECK"].includes(party.status)) {
      const ready = effectiveReady(party, userId);
      return `${roster}<button type="button" class="button small party-ready-toggle ${ready ? "is-ready" : "is-waiting"}" data-member-ready="${partyId}">${ready ? "준비 완료" : "준비 대기"}</button>`;
    }
    if (party.sessionId || party.status === "SESSION_CREATED") return roster;
    return roster;
  }

  function decorateMemberHome(snapshot, userId) {
    const [page] = routeParts();
    if (page !== "home") return;
    const partyId = snapshot.characters?.[userId]?.currentPartyId;
    const party = partyId ? snapshot.parties?.[partyId] : null;
    if (!party || party.creatorId === userId || !unique(party.memberIds).includes(userId)) return;

    const controls = document.querySelector(`[data-member-party-controls="${CSS.escape(partyId)}"]`);
    if (!controls) return;
    const signature = `${party.status}:${effectiveReady(party, userId) ? 1 : 0}:${party.sessionId || ""}`;
    const desired = memberControlsMarkup(party, userId);
    const hasLegacyConfirm = Boolean(controls.querySelector("[data-member-confirm-composition]"));
    const rosterCount = controls.querySelectorAll("[data-party-roster-open]").length;
    const readyCountInControls = controls.querySelectorAll("[data-member-ready]").length;
    const expectedReadyCount = ["COMPOSITION_CONFIRMED", "READY_CHECK"].includes(party.status) ? 1 : 0;
    if (controls.dataset.partyFlowUxSignature !== signature || hasLegacyConfirm || rosterCount !== 1 || readyCountInControls !== expectedReadyCount) {
      controls.innerHTML = desired;
      controls.dataset.partyFlowUxSignature = signature;
    }

    const card = controls.closest("article.card");
    const help = card?.querySelector(".card-header .muted.small");
    if (help) help.textContent = party.status === "RECRUITING"
      ? "조원 명단을 확인하고 조장의 구성 확정을 기다립니다."
      : "조원 명단을 확인하고 자신의 준비 상태를 변경할 수 있습니다.";
  }

  function decorateLeaderParty(snapshot, userId) {
    const [page, partyId] = routeParts();
    if (page !== "party" || !partyId) return;
    const party = snapshot.parties?.[partyId];
    if (!party || party.creatorId !== userId) return;

    const members = unique(party.memberIds);
    const count = readyCount(party);
    const allReady = members.length > 0 && count === members.length;
    const participantSection = document.querySelector(".member-grid")?.closest("section.card");
    const help = participantSection?.querySelector(".card-header .muted.small");
    const headerBadge = participantSection?.querySelector(".card-header > .badge");

    if (help) help.textContent = party.status === "RECRUITING"
      ? "조원 구성을 확인한 뒤 조장이 구성을 확정합니다."
      : "각 조원은 홈 화면에서 준비 상태를 바꿀 수 있습니다. 전원 준비 완료 후 세션을 시작합니다.";

    if (headerBadge) {
      if (["COMPOSITION_CONFIRMED", "READY_CHECK"].includes(party.status)) {
        headerBadge.textContent = `${count}/${members.length}명 준비 완료`;
        headerBadge.className = `badge party-ready-count ${allReady ? "is-all-ready" : "is-waiting"}`;
      } else {
        headerBadge.textContent = `${members.length}명`;
        headerBadge.className = "badge green";
      }
    }

    const memberRows = [...document.querySelectorAll(".member-grid .member")];
    memberRows.forEach((row, index) => {
      const memberId = members[index];
      const pills = row.querySelector(".status-pills");
      if (!pills || !memberId) return;
      if (["COMPOSITION_CONFIRMED", "READY_CHECK"].includes(party.status)) {
        const ready = effectiveReady(party, memberId);
        const markup = `<span class="party-ready-state ${ready ? "is-ready" : "is-waiting"}">${ready ? "● 준비 완료" : "○ 준비 대기"}</span>`;
        if (pills.innerHTML !== markup) pills.innerHTML = markup;
      }
    });

    const readyButton = document.querySelector("[data-ready]");
    const actionRow = readyButton?.closest(".button-row") || document.querySelector("[data-confirm-composition]")?.closest(".button-row");
    document.querySelectorAll("[data-party-flow-back-recruiting]").forEach((button) => {
      if (party.status !== "COMPOSITION_CONFIRMED") button.remove();
    });
    if (party.status === "COMPOSITION_CONFIRMED" && actionRow && readyButton && !actionRow.querySelector("[data-party-flow-back-recruiting]")) {
      const back = document.createElement("button");
      back.type = "button";
      back.className = "button party-flow-back";
      back.dataset.partyFlowBackRecruiting = partyId;
      back.textContent = "← 이전 단계";
      actionRow.insertBefore(back, readyButton);
    }

    if (readyButton && ["COMPOSITION_CONFIRMED", "READY_CHECK"].includes(party.status)) {
      const ownReady = effectiveReady(party, userId);
      readyButton.textContent = ownReady ? "준비 완료 취소" : "조사 준비 완료";
      readyButton.classList.toggle("party-ready-button-active", ownReady);
    }

    const startButton = document.querySelector("[data-start-session]");
    if (startButton && !allReady) startButton.remove();

    const footer = actionRow?.closest("section.card")?.querySelector("p.muted.small");
    if (footer) {
      if (party.status === "RECRUITING") {
        footer.textContent = `현재 조원 ${members.length}명 · 조장이 구성을 확정하면 준비 단계로 이동합니다.`;
      } else if (["COMPOSITION_CONFIRMED", "READY_CHECK"].includes(party.status)) {
        footer.textContent = allReady
          ? `준비 완료 ${count}/${members.length}명 · 전원 준비가 완료되었습니다.`
          : `준비 완료 ${count}/${members.length}명 · ${members.length - count}명의 준비를 기다리는 중입니다.`;
      }
    }
  }

  function decorateBriefingRoster(snapshot, userId) {
    const [page, sessionId] = routeParts();
    if (page !== "briefing" || !sessionId) return;
    const session = snapshot.sessions?.[sessionId];
    if (!session || !unique(session.memberIds).includes(userId)) return;
    const button = [...document.querySelectorAll("button")].find((node) => String(node.textContent || "").trim() === "조사조 확인");
    if (!button) return;
    button.dataset.partyRosterOpen = session.partyId;
    button.removeAttribute("data-go");
    button.dataset.partyFlowBriefingRosterFixed = "true";
  }

  function refresh() {
    refreshQueued = false;
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !userId) return;
    decorateMemberHome(snapshot, userId);
    decorateLeaderParty(snapshot, userId);
    decorateBriefingRoster(snapshot, userId);
    document.documentElement.dataset.partyFlowUxVersion = VERSION;
  }

  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(refresh);
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const accept = target.closest("[data-party-flow-accept], [data-accept]");
    if (accept) {
      const partyId = accept.dataset.partyFlowAccept || accept.dataset.accept;
      const snapshot = readState();
      const userId = currentUserId();
      const party = snapshot?.parties?.[partyId];
      if (party?.status === "RECRUITING" && unique(party.invitedIds).includes(userId) && !snapshot?.characters?.[userId]?.currentPartyId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        acceptInvite(partyId);
        return;
      }
    }

    const legacyMemberConfirm = target.closest("[data-member-confirm-composition]");
    if (legacyMemberConfirm) {
      const partyId = legacyMemberConfirm.dataset.memberConfirmComposition;
      legacyMemberConfirm.removeAttribute("data-member-confirm-composition");
      legacyMemberConfirm.dataset.partyRosterOpen = partyId;
      legacyMemberConfirm.textContent = "조원 보기";
      return;
    }

    const lock = target.closest("[data-confirm-composition]");
    if (lock) {
      const [, partyId] = routeParts();
      const snapshot = readState();
      const userId = currentUserId();
      if (partyId && snapshot?.parties?.[partyId]?.creatorId === userId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        lockComposition(partyId);
        return;
      }
    }

    const back = target.closest("[data-party-flow-back-recruiting]");
    if (back) {
      event.preventDefault();
      event.stopImmediatePropagation();
      reopenComposition(back.dataset.partyFlowBackRecruiting);
      return;
    }

    const memberReady = target.closest("[data-member-ready]");
    if (memberReady) {
      event.preventDefault();
      event.stopImmediatePropagation();
      toggleReady(memberReady.dataset.memberReady);
      return;
    }

    const leaderReady = target.closest("[data-ready]");
    if (leaderReady) {
      const [, partyId] = routeParts();
      const snapshot = readState();
      const userId = currentUserId();
      if (partyId && snapshot?.parties?.[partyId]?.creatorId === userId) {
        event.preventDefault();
        event.stopImmediatePropagation();
        toggleReady(partyId);
        return;
      }
    }

    const start = target.closest("[data-start-session]");
    if (start) {
      const [, partyId] = routeParts();
      const party = readState()?.parties?.[partyId];
      if (party && readyCount(party) !== unique(party.memberIds).length) {
        event.preventDefault();
        event.stopImmediatePropagation();
        scheduleRefresh();
      }
    }
  }, true);

  const appRoot = document.getElementById("app");
  if (appRoot && typeof MutationObserver === "function") {
    new MutationObserver(scheduleRefresh).observe(appRoot, { childList: true, subtree: true });
  }
  window.addEventListener("hashchange", scheduleRefresh);
  window.addEventListener("storage", (event) => { if (event.key === GLOBAL_KEY) scheduleRefresh(); });
  window.addEventListener("baekji-cloud-sync", scheduleRefresh);
  window.addEventListener("baekji-party-leadership", scheduleRefresh);
  window.addEventListener("baekji-party-flow-ux", scheduleRefresh);
  requestAnimationFrame(() => requestAnimationFrame(scheduleRefresh));
})();
