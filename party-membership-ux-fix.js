(() => {
  "use strict";

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const JOIN_INTENT_KEY = "baekji_city_party_join_intent_v1";
  const STYLE_ID = "baekji-party-membership-ux-style";
  const VERSION = "0.3.83";

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

  function membershipChangeAllowed(party) {
    if (!party || party.sessionId) return false;
    return !["SESSION_CREATED", "LOCKED", "CLOSED"].includes(String(party.status || ""));
  }

  function removalKey(partyId, memberId) {
    return `${String(partyId || "")}:${String(memberId || "")}`;
  }

  function resetCompositionAfterMembershipChange(party, at = Date.now()) {
    if (!party) return;
    party.status = "RECRUITING";
    party.confirmedBy = [];
    party.readyBy = [];
    party.readyStateBy = {};
    party.compositionLockedAt = null;
    party.flowRevision = Math.max(0, Number(party.flowRevision || 0)) + 1;
    party.membershipChangedAt = at;
  }

  function removeMemberState(snapshot, partyId, memberId, actorId, at = Date.now()) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    const character = draft?.characters?.[memberId];
    if (!party || !character || !membershipChangeAllowed(party)) return draft;
    if (!unique(party.memberIds).includes(memberId)) return draft;

    const selfLeave = actorId === memberId && memberId !== party.creatorId;
    const leaderKick = actorId === party.creatorId && memberId !== party.creatorId;
    if (!selfLeave && !leaderKick) return draft;

    party.memberIds = unique(party.memberIds).filter((id) => id !== memberId);
    party.invitedIds = unique(party.invitedIds).filter((id) => id !== memberId);
    party.declinedIds = unique(party.declinedIds).filter((id) => id !== memberId);
    party.confirmedBy = unique(party.confirmedBy).filter((id) => id !== memberId);
    party.readyBy = unique(party.readyBy).filter((id) => id !== memberId);
    if (party.readyStateBy && typeof party.readyStateBy === "object") delete party.readyStateBy[memberId];
    if (character.currentPartyId === partyId) character.currentPartyId = null;
    if (!party.sessionId) character.currentSessionId = null;

    resetCompositionAfterMembershipChange(party, at);
    draft.partyMembershipRemovals ||= {};
    draft.partyMembershipRemovals[removalKey(partyId, memberId)] = {
      partyId,
      memberId,
      actorId,
      kind: selfLeave ? "SELF_LEAVE" : "LEADER_KICK",
      active: true,
      at,
    };
    return draft;
  }

  function markMemberJoinedState(snapshot, partyId, memberId, at = Date.now()) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    const character = draft?.characters?.[memberId];
    if (!party || !character || !unique(party.memberIds).includes(memberId) || character.currentPartyId !== partyId) return draft;
    party.membershipJoinedAtBy = party.membershipJoinedAtBy && typeof party.membershipJoinedAtBy === "object"
      ? { ...party.membershipJoinedAtBy }
      : {};
    const previous = Number(party.membershipJoinedAtBy[memberId] || 0);
    if (at > previous) party.membershipJoinedAtBy[memberId] = at;
    const removal = draft.partyMembershipRemovals?.[removalKey(partyId, memberId)];
    if (removal && Number(at) > Number(removal.at || 0)) {
      removal.active = false;
      removal.clearedAt = at;
    }
    return draft;
  }

  function repairMembershipRemovals(snapshot) {
    const draft = clone(snapshot);
    let changed = false;
    Object.values(draft?.partyMembershipRemovals || {}).forEach((removal) => {
      if (!removal?.active) return;
      const party = draft.parties?.[removal.partyId];
      const character = draft.characters?.[removal.memberId];
      if (!party) return;
      const joinedAt = Number(party.membershipJoinedAtBy?.[removal.memberId] || 0);
      if (joinedAt > Number(removal.at || 0)) {
        removal.active = false;
        removal.clearedAt = joinedAt;
        changed = true;
        return;
      }
      const before = JSON.stringify({
        members: party.memberIds,
        invited: party.invitedIds,
        confirmed: party.confirmedBy,
        ready: party.readyBy,
        readyState: party.readyStateBy?.[removal.memberId],
        partyId: character?.currentPartyId,
        sessionId: character?.currentSessionId,
      });
      party.memberIds = unique(party.memberIds).filter((id) => id !== removal.memberId);
      party.invitedIds = unique(party.invitedIds).filter((id) => id !== removal.memberId);
      party.confirmedBy = unique(party.confirmedBy).filter((id) => id !== removal.memberId);
      party.readyBy = unique(party.readyBy).filter((id) => id !== removal.memberId);
      if (party.readyStateBy && typeof party.readyStateBy === "object") delete party.readyStateBy[removal.memberId];
      if (character?.currentPartyId === party.id) character.currentPartyId = null;
      if (character && !party.sessionId && character.currentPartyId == null) character.currentSessionId = null;
      const after = JSON.stringify({
        members: party.memberIds,
        invited: party.invitedIds,
        confirmed: party.confirmedBy,
        ready: party.readyBy,
        readyState: party.readyStateBy?.[removal.memberId],
        partyId: character?.currentPartyId,
        sessionId: character?.currentSessionId,
      });
      if (before !== after) {
        resetCompositionAfterMembershipChange(party, Number(removal.at || Date.now()));
        changed = true;
      }
    });
    return { snapshot: draft, changed };
  }

  function readyStateText(party, memberId) {
    return effectiveReady(party, memberId) ? "● 준비 완료" : "○ 준비 대기";
  }

  const TEST_API = Object.freeze({
    effectiveReady,
    membershipChangeAllowed,
    removeMemberState,
    markMemberJoinedState,
    repairMembershipRemovals,
    readyStateText,
  });
  if (typeof window !== "undefined") window.__BAEKJI_PARTY_MEMBERSHIP_UX_TEST__ = TEST_API;
  if (typeof document === "undefined" || typeof localStorage === "undefined" || typeof sessionStorage === "undefined") return;

  let refreshQueued = false;
  let repairing = false;

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
    window.dispatchEvent(new CustomEvent("baekji-party-membership", { detail: { reason, version: VERSION } }));
  }

  function writeState(snapshot, reason = "party-membership") {
    if (!snapshot?.version) return false;
    const oldRaw = localStorage.getItem(GLOBAL_KEY);
    const newRaw = JSON.stringify(snapshot);
    if (oldRaw === newRaw) return false;
    localStorage.setItem(GLOBAL_KEY, newRaw);
    dispatchStateUpdate(oldRaw, newRaw, reason);
    scheduleRefresh();
    return true;
  }

  function forceRouteRefresh() {
    try { window.dispatchEvent(new HashChangeEvent("hashchange")); }
    catch { window.dispatchEvent(new Event("hashchange")); }
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .party-membership-ready-only{display:inline-flex;align-items:center;white-space:nowrap}
      .party-member-kick,.party-roster-self-leave{white-space:nowrap}
      .party-roster-member[data-party-membership-row]{grid-template-columns:56px minmax(0,1fr) auto}
      .party-roster-member[data-party-membership-row] .party-roster-self-leave{align-self:center}
      @media(max-width:520px){.party-roster-member[data-party-membership-row]{grid-template-columns:50px minmax(0,1fr);}.party-roster-member[data-party-membership-row] .party-roster-self-leave{grid-column:1/-1;width:100%}}
    `;
    document.head.appendChild(style);
  }

  function rememberJoinIntent(partyId) {
    const userId = currentUserId();
    if (!partyId || !userId) return;
    sessionStorage.setItem(JOIN_INTENT_KEY, JSON.stringify({ partyId, userId, at: Date.now() }));
  }

  function readJoinIntent() {
    try {
      const value = JSON.parse(sessionStorage.getItem(JOIN_INTENT_KEY) || "null");
      if (!value?.partyId || !value?.userId || Date.now() - Number(value.at || 0) > 15000) return null;
      return value;
    } catch {
      return null;
    }
  }

  function applyJoinIntent(snapshot, userId) {
    const intent = readJoinIntent();
    if (!intent || intent.userId !== userId) return snapshot;
    const party = snapshot?.parties?.[intent.partyId];
    const joined = party && unique(party.memberIds).includes(userId) && snapshot.characters?.[userId]?.currentPartyId === intent.partyId;
    if (!joined) return snapshot;
    const next = markMemberJoinedState(snapshot, intent.partyId, userId, Math.max(Number(intent.at || 0), Date.now()));
    sessionStorage.removeItem(JOIN_INTENT_KEY);
    if (JSON.stringify(next) !== JSON.stringify(snapshot)) writeState(next, "join-stamp");
    return next;
  }

  function invitationCard() {
    return [...document.querySelectorAll("article.card")].find((card) =>
      String(card.querySelector(".card-title")?.textContent || "").trim() === "받은 초대"
    ) || null;
  }

  function decorateInviteVisibility(snapshot, userId) {
    const [page] = routeParts();
    if (page !== "home") return;
    const partyId = snapshot.characters?.[userId]?.currentPartyId;
    const party = partyId ? snapshot.parties?.[partyId] : null;
    const card = invitationCard();
    if (!card) return;
    const grid = card.closest("section.grid.two");
    card.hidden = Boolean(party);
    if (grid) {
      if (party) {
        grid.dataset.partyMembershipSingle = "true";
        grid.style.gridTemplateColumns = "1fr";
      } else if (grid.dataset.partyMembershipSingle === "true") {
        delete grid.dataset.partyMembershipSingle;
        grid.style.removeProperty("grid-template-columns");
      }
    }
    if (party) document.querySelector(".retro-invite-backdrop[data-party-flow-modal]")?.remove();
  }

  function normalizeMemberHomeButtons(snapshot, userId) {
    const [page] = routeParts();
    if (page !== "home") return;
    const partyId = snapshot.characters?.[userId]?.currentPartyId;
    const party = partyId ? snapshot.parties?.[partyId] : null;
    if (!party || party.creatorId === userId || !unique(party.memberIds).includes(userId)) return;

    const escaped = CSS.escape(partyId);
    const controls = document.querySelector(`[data-member-party-controls="${escaped}"]`);
    const anyRoster = document.querySelector(`[data-party-roster-open="${escaped}"]`);
    const legacy = document.querySelector(`[data-open-party="${escaped}"]`);
    const item = controls?.closest(".list-item") || anyRoster?.closest(".list-item") || legacy?.closest(".list-item");
    if (!item) return;

    item.querySelectorAll(`[data-open-party="${escaped}"]`).forEach((button) => button.remove());
    let actionRoot = controls;
    if (!actionRoot) {
      actionRoot = document.createElement("div");
      actionRoot.className = "button-row";
      actionRoot.dataset.memberPartyControls = partyId;
      item.appendChild(actionRoot);
    }

    const rosterButtons = [...item.querySelectorAll(`[data-party-roster-open="${escaped}"]`)];
    let keep = rosterButtons.find((button) => actionRoot.contains(button)) || rosterButtons[0] || null;
    rosterButtons.forEach((button) => { if (button !== keep) button.remove(); });
    if (!keep) {
      keep = document.createElement("button");
      keep.type = "button";
      keep.className = "button small";
      keep.dataset.partyRosterOpen = partyId;
      keep.textContent = "조원 보기";
      actionRoot.prepend(keep);
    } else if (!actionRoot.contains(keep)) {
      actionRoot.prepend(keep);
    }
    keep.textContent = "조원 보기";
  }

  function decorateLeaderParticipants(snapshot, userId) {
    const [page, partyId] = routeParts();
    if (page !== "party" || !partyId) return;
    const party = snapshot.parties?.[partyId];
    if (!party || party.creatorId !== userId) return;
    const members = unique(party.memberIds);
    const canEdit = membershipChangeAllowed(party);
    const rows = [...document.querySelectorAll(".member-grid .member")];
    rows.forEach((row, index) => {
      const memberId = members[index];
      if (!memberId) return;
      const pills = row.querySelector(".status-pills");
      if (!pills) return;
      const ready = effectiveReady(party, memberId);
      const kick = canEdit && memberId !== party.creatorId
        ? `<button type="button" class="button danger small party-member-kick" data-party-member-kick="${escapeHtml(partyId)}" data-party-member-id="${escapeHtml(memberId)}">탈퇴시키기</button>`
        : "";
      const markup = `<span class="party-ready-state party-membership-ready-only ${ready ? "is-ready" : "is-waiting"}">${ready ? "● 준비 완료" : "○ 준비 대기"}</span>${kick}`;
      if (pills.innerHTML !== markup) pills.innerHTML = markup;
    });

    const section = document.querySelector(".member-grid")?.closest("section.card");
    const help = section?.querySelector(".card-header .muted.small");
    if (help) help.textContent = canEdit
      ? "조원별 준비 상태만 표시합니다. 세션 생성 전에는 조장이 특정 조원을 탈퇴시킬 수 있습니다."
      : "조원별 준비 상태만 표시합니다.";
  }

  function decorateRosterModal(snapshot, userId) {
    const backdrop = document.querySelector("[data-party-roster-modal][data-party-id]");
    if (!backdrop) return;
    const partyId = backdrop.dataset.partyId;
    const party = snapshot.parties?.[partyId];
    if (!party || !unique(party.memberIds).includes(userId)) return;
    const members = unique(party.memberIds);
    const rows = [...backdrop.querySelectorAll(".party-roster-member")];
    rows.forEach((row, index) => {
      const memberId = members[index];
      if (!memberId) return;
      row.dataset.partyMembershipRow = memberId;
      row.querySelectorAll("[data-party-self-leave]").forEach((button) => button.remove());
      if (memberId !== userId || party.creatorId === userId || !membershipChangeAllowed(party)) return;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button danger small party-roster-self-leave";
      button.dataset.partySelfLeave = partyId;
      button.textContent = "조 탈퇴";
      row.appendChild(button);
    });
  }

  function performRemoval(partyId, memberId, mode) {
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !userId) return false;
    const party = snapshot.parties?.[partyId];
    if (!party || !membershipChangeAllowed(party)) return false;
    const isSelf = mode === "self" && userId === memberId && party.creatorId !== memberId;
    const isKick = mode === "kick" && party.creatorId === userId && party.creatorId !== memberId;
    if (!isSelf && !isKick) return false;

    const message = isSelf
      ? `${party.name || "조사조"}에서 탈퇴할까요?\n탈퇴하면 다른 조사조의 초대를 다시 받을 수 있습니다.`
      : `선택한 캐릭터를 ${party.name || "조사조"}에서 탈퇴시킬까요?\n조 구성이 변경되어 전원의 준비 상태가 초기화됩니다.`;
    if (typeof window.confirm === "function" && !window.confirm(message)) return false;

    const next = removeMemberState(snapshot, partyId, memberId, userId, Date.now());
    if (JSON.stringify(next) === JSON.stringify(snapshot)) return false;
    document.getElementById("modal-root")?.replaceChildren();
    writeState(next, isSelf ? "self-leave" : "leader-kick");
    forceRouteRefresh();
    return true;
  }

  function refresh() {
    refreshQueued = false;
    if (repairing) return;
    let snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !userId) return;

    snapshot = applyJoinIntent(snapshot, userId);
    const repaired = repairMembershipRemovals(snapshot);
    if (repaired.changed) {
      repairing = true;
      try { writeState(repaired.snapshot, "membership-repair"); }
      finally { repairing = false; }
      snapshot = repaired.snapshot;
    }

    ensureStyle();
    decorateInviteVisibility(snapshot, userId);
    normalizeMemberHomeButtons(snapshot, userId);
    decorateLeaderParticipants(snapshot, userId);
    decorateRosterModal(snapshot, userId);
    document.documentElement.dataset.partyMembershipUxVersion = VERSION;
  }

  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(refresh);
  }

  window.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const accept = target.closest("[data-party-flow-accept], [data-accept]");
    if (accept) rememberJoinIntent(accept.dataset.partyFlowAccept || accept.dataset.accept);
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const selfLeave = target.closest("[data-party-self-leave]");
    if (selfLeave) {
      event.preventDefault();
      event.stopImmediatePropagation();
      performRemoval(selfLeave.dataset.partySelfLeave, currentUserId(), "self");
      return;
    }

    const kick = target.closest("[data-party-member-kick][data-party-member-id]");
    if (kick) {
      event.preventDefault();
      event.stopImmediatePropagation();
      performRemoval(kick.dataset.partyMemberKick, kick.dataset.partyMemberId, "kick");
    }
  }, true);

  const app = document.getElementById("app");
  if (app && typeof MutationObserver === "function") {
    new MutationObserver(scheduleRefresh).observe(app, { childList: true, subtree: true });
  }
  const modalRoot = document.getElementById("modal-root");
  if (modalRoot && typeof MutationObserver === "function") {
    new MutationObserver(scheduleRefresh).observe(modalRoot, { childList: true, subtree: true });
  }
  window.addEventListener("hashchange", scheduleRefresh);
  window.addEventListener("storage", (event) => { if (!event.key || event.key === GLOBAL_KEY) scheduleRefresh(); });
  window.addEventListener("baekji-cloud-sync", scheduleRefresh);
  window.addEventListener("baekji-party-flow-ux", scheduleRefresh);
  window.addEventListener("baekji-party-leadership", scheduleRefresh);
  window.addEventListener("baekji-party-membership", scheduleRefresh);
  setInterval(scheduleRefresh, 1200);
  scheduleRefresh();
})();