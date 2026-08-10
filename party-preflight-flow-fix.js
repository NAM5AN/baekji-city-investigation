(() => {
  "use strict";

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const VERSION = "0.3.90";

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

  function rebuildReadyBy(party) {
    party.readyBy = unique(party.memberIds).filter((memberId) => effectiveReady(party, memberId));
  }

  function togglePreflightReadyState(snapshot, partyId, userId, at = Date.now()) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    if (!party || party.sessionId || !["RECRUITING", "COMPOSITION_CONFIRMED", "READY_CHECK"].includes(party.status)) return draft;
    if (!unique(party.memberIds).includes(userId)) return draft;

    ensureReadyStateMap(party, at);
    const nextReady = !effectiveReady(party, userId);
    party.readyStateBy[userId] = { ready: nextReady, at };
    rebuildReadyBy(party);
    if (party.status === "COMPOSITION_CONFIRMED") party.status = "READY_CHECK";
    party.flowRevision = Math.max(0, Number(party.flowRevision || 0)) + 1;
    return draft;
  }

  function lockCompositionPreserveReadyState(snapshot, partyId, leaderId, at = Date.now()) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    if (!party || party.creatorId !== leaderId || party.status !== "RECRUITING" || party.sessionId) return draft;

    party.memberIds = unique(party.memberIds);
    ensureReadyStateMap(party, at);
    rebuildReadyBy(party);
    party.confirmedBy = [...party.memberIds];
    party.status = "COMPOSITION_CONFIRMED";
    party.compositionLockedAt = at;
    party.flowRevision = Math.max(0, Number(party.flowRevision || 0)) + 1;
    return draft;
  }

  function reopenRecruitingPreserveReadyState(snapshot, partyId, leaderId, at = Date.now()) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    if (!party || party.creatorId !== leaderId || party.status !== "COMPOSITION_CONFIRMED" || party.sessionId) return draft;

    ensureReadyStateMap(party, at);
    rebuildReadyBy(party);
    party.status = "RECRUITING";
    party.confirmedBy = [];
    party.compositionLockedAt = null;
    party.flowRevision = Math.max(0, Number(party.flowRevision || 0)) + 1;
    return draft;
  }

  function backToCompositionState(snapshot, partyId, leaderId, at = Date.now()) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    if (!party || party.creatorId !== leaderId || party.status !== "READY_CHECK" || party.sessionId) return draft;

    ensureReadyStateMap(party, at);
    party.readyStateBy[leaderId] = { ready: false, at };
    rebuildReadyBy(party);
    party.status = "COMPOSITION_CONFIRMED";
    party.flowRevision = Math.max(0, Number(party.flowRevision || 0)) + 1;
    return draft;
  }

  function rollbackBriefingState(snapshot, sessionId, leaderId, at = Date.now()) {
    const draft = clone(snapshot);
    const session = draft?.sessions?.[sessionId];
    const party = session ? draft?.parties?.[session.partyId] : null;
    if (!session || !party || party.creatorId !== leaderId || session.status !== "BRIEFING") return draft;
    if (party.sessionId !== sessionId) return draft;

    const memberIds = unique(session.memberIds || party.memberIds);
    delete draft.sessions[sessionId];
    party.sessionId = null;
    party.status = "READY_CHECK";
    party.flowRevision = Math.max(0, Number(party.flowRevision || 0)) + 1;
    memberIds.forEach((memberId) => {
      const character = draft.characters?.[memberId];
      if (character?.currentSessionId === sessionId) character.currentSessionId = null;
    });
    return draft;
  }

  const TEST_API = Object.freeze({
    effectiveReady,
    togglePreflightReadyState,
    lockCompositionPreserveReadyState,
    reopenRecruitingPreserveReadyState,
    backToCompositionState,
    rollbackBriefingState,
  });
  if (typeof window !== "undefined") window.__BAEKJI_PARTY_PREFLIGHT_FLOW_TEST__ = TEST_API;
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

  function setText(node, text) {
    if (node && node.textContent !== text) node.textContent = text;
  }

  function dispatchStateUpdate(oldRaw, newRaw, reason) {
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
    window.dispatchEvent(new CustomEvent("baekji-party-preflight-flow", { detail: { reason, version: VERSION } }));
  }

  function writeState(snapshot, reason) {
    if (!snapshot?.version) return false;
    const oldRaw = localStorage.getItem(GLOBAL_KEY);
    const newRaw = JSON.stringify(snapshot);
    if (oldRaw === newRaw) return false;
    localStorage.setItem(GLOBAL_KEY, newRaw);
    dispatchStateUpdate(oldRaw, newRaw, reason);
    scheduleRefresh();
    return true;
  }

  function togglePreflightReady(partyId) {
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !partyId || !userId) return false;
    const before = snapshot.parties?.[partyId];
    const next = togglePreflightReadyState(snapshot, partyId, userId, Date.now());
    const after = next.parties?.[partyId];
    if (!before || !after || effectiveReady(before, userId) === effectiveReady(after, userId)) return false;
    return writeState(next, "preflight-ready-toggle");
  }

  function lockComposition(partyId) {
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !partyId || !userId) return false;
    const next = lockCompositionPreserveReadyState(snapshot, partyId, userId, Date.now());
    if (next.parties?.[partyId]?.status !== "COMPOSITION_CONFIRMED") return false;
    return writeState(next, "composition-lock-preserve-ready");
  }

  function reopenRecruiting(partyId) {
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !partyId || !userId) return false;
    const next = reopenRecruitingPreserveReadyState(snapshot, partyId, userId, Date.now());
    if (next.parties?.[partyId]?.status !== "RECRUITING") return false;
    return writeState(next, "composition-back-recruiting-preserve-ready");
  }

  function backToComposition(partyId) {
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !partyId || !userId) return false;
    const next = backToCompositionState(snapshot, partyId, userId, Date.now());
    if (next.parties?.[partyId]?.status !== "COMPOSITION_CONFIRMED") return false;
    return writeState(next, "ready-back-composition");
  }

  function rollbackBriefing(sessionId) {
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !sessionId || !userId) return false;
    const session = snapshot.sessions?.[sessionId];
    const partyId = session?.partyId;
    const next = rollbackBriefingState(snapshot, sessionId, userId, Date.now());
    if (!partyId || next.sessions?.[sessionId] || next.parties?.[partyId]?.sessionId) return false;
    if (!writeState(next, "briefing-back-ready")) return false;
    location.hash = `#/party/${partyId}`;
    return true;
  }

  function decorateMemberHome(snapshot, userId) {
    const [page] = routeParts();
    if (page !== "home") return;
    const partyId = snapshot.characters?.[userId]?.currentPartyId;
    const party = partyId ? snapshot.parties?.[partyId] : null;
    if (!party || party.creatorId === userId || !unique(party.memberIds).includes(userId)) return;

    const controls = document.querySelector(`[data-member-party-controls="${CSS.escape(partyId)}"]`);
    if (!controls) return;
    const ready = effectiveReady(party, userId);
    const readyText = ready ? "● 준비 완료" : "○ 준비 대기";

    if (party.status === "RECRUITING") {
      controls.querySelectorAll("[data-member-ready]").forEach((button) => button.remove());
      let button = controls.querySelector("[data-preflight-member-ready]");
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "button small party-ready-toggle";
        button.dataset.preflightMemberReady = partyId;
        controls.appendChild(button);
      }
      button.classList.toggle("is-ready", ready);
      button.classList.toggle("is-waiting", !ready);
      setText(button, readyText);
      button.setAttribute("aria-pressed", String(ready));
      return;
    }

    controls.querySelector("[data-preflight-member-ready]")?.remove();
    const button = controls.querySelector("[data-member-ready]");
    if (button) {
      button.classList.add("party-ready-toggle");
      button.classList.toggle("is-ready", ready);
      button.classList.toggle("is-waiting", !ready);
      setText(button, readyText);
      button.setAttribute("aria-pressed", String(ready));
    }
  }

  function decorateLeaderParty(snapshot, userId) {
    const [page, partyId] = routeParts();
    if (page !== "party" || !partyId) return;
    const party = snapshot.parties?.[partyId];
    if (!party || party.creatorId !== userId) return;

    const startButton = document.querySelector("[data-start-session]");
    setText(startButton, "조사 출발");

    const actionRow = document.querySelector("[data-ready]")?.closest(".button-row")
      || document.querySelector("[data-start-session]")?.closest(".button-row")
      || document.querySelector("[data-confirm-composition]")?.closest(".button-row");
    if (!actionRow) return;

    let back = actionRow.querySelector("[data-party-preflight-back-confirmed]");
    if (party.status === "READY_CHECK") {
      if (!back) {
        back = document.createElement("button");
        back.type = "button";
        back.className = "button party-flow-back party-preflight-back";
        back.dataset.partyPreflightBackConfirmed = partyId;
        back.textContent = "← 이전 단계";
        actionRow.prepend(back);
      }
    } else {
      back?.remove();
    }
  }

  function decorateBriefing(snapshot, userId) {
    const [page, sessionId] = routeParts();
    if (page !== "briefing" || !sessionId) return;
    const session = snapshot.sessions?.[sessionId];
    const party = session ? snapshot.parties?.[session.partyId] : null;
    if (!session || !party || !unique(session.memberIds).includes(userId)) return;

    [...document.querySelectorAll("button")]
      .filter((button) => String(button.textContent || "").trim() === "조사조 확인")
      .forEach((button) => button.remove());

    const enterButton = document.querySelector("[data-enter-investigation]");
    const row = enterButton?.closest(".button-row");
    if (!row) return;

    let back = row.querySelector("[data-party-preflight-briefing-back]");
    if (party.creatorId === userId && session.status === "BRIEFING") {
      if (!back) {
        back = document.createElement("button");
        back.type = "button";
        back.className = "button party-flow-back party-preflight-back";
        back.dataset.partyPreflightBriefingBack = sessionId;
        back.textContent = "← 이전 단계";
        row.prepend(back);
      }
    } else {
      back?.remove();
    }
  }

  function refresh() {
    refreshQueued = false;
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !userId) return;
    decorateMemberHome(snapshot, userId);
    decorateLeaderParty(snapshot, userId);
    decorateBriefing(snapshot, userId);
    document.documentElement.dataset.partyPreflightFlowVersion = VERSION;
  }

  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    setTimeout(refresh, 16);
  }

  window.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const preflightReady = target.closest("[data-preflight-member-ready]");
    if (preflightReady) {
      event.preventDefault();
      event.stopImmediatePropagation();
      togglePreflightReady(preflightReady.dataset.preflightMemberReady);
      return;
    }

    const lock = target.closest("[data-confirm-composition]");
    if (lock) {
      const [, partyId] = routeParts();
      const snapshot = readState();
      const userId = currentUserId();
      if (partyId && snapshot?.parties?.[partyId]?.creatorId === userId && snapshot.parties[partyId].status === "RECRUITING") {
        event.preventDefault();
        event.stopImmediatePropagation();
        lockComposition(partyId);
        return;
      }
    }

    const backRecruiting = target.closest("[data-party-flow-back-recruiting]");
    if (backRecruiting) {
      event.preventDefault();
      event.stopImmediatePropagation();
      reopenRecruiting(backRecruiting.dataset.partyFlowBackRecruiting);
      return;
    }

    const backConfirmed = target.closest("[data-party-preflight-back-confirmed]");
    if (backConfirmed) {
      event.preventDefault();
      event.stopImmediatePropagation();
      backToComposition(backConfirmed.dataset.partyPreflightBackConfirmed);
      return;
    }

    const briefingBack = target.closest("[data-party-preflight-briefing-back]");
    if (briefingBack) {
      event.preventDefault();
      event.stopImmediatePropagation();
      rollbackBriefing(briefingBack.dataset.partyPreflightBriefingBack);
    }
  }, true);

  const app = document.getElementById("app");
  if (app && typeof MutationObserver === "function") {
    new MutationObserver(scheduleRefresh).observe(app, { childList: true, subtree: true, characterData: true });
  }
  window.addEventListener("hashchange", scheduleRefresh);
  window.addEventListener("storage", (event) => { if (!event.key || event.key === GLOBAL_KEY) scheduleRefresh(); });
  window.addEventListener("baekji-cloud-sync", scheduleRefresh);
  window.addEventListener("baekji-party-flow-ux", scheduleRefresh);
  window.addEventListener("baekji-party-membership", scheduleRefresh);
  window.addEventListener("baekji-party-preflight-flow", scheduleRefresh);
  setInterval(scheduleRefresh, 1200);
  scheduleRefresh();
})();
