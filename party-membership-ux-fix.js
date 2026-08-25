(() => {
  "use strict";
  const { clone, uniqueArray: unique, escapeHtml } = window.__BAEKJI_RUNTIME_UTILS__;
  const {
    storedPartyReady: effectiveReady,
    partyMembershipChangeAllowed: membershipChangeAllowed,
    partyMembershipRemovalKey: removalKey,
  } = window.__BAEKJI_DOMAIN_RULES__;

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const JOIN_INTENT_KEY = "baekji_city_party_join_intent_v1";
  const NOTICE_SEEN_KEY_PREFIX = "baekji_city_party_membership_notice_seen_v1:";
  const STYLE_ID = "baekji-party-membership-ux-style";
  const VERSION = "0.3.87";
  const DEMO_NAMES = {
    test_a: "테스트 캐릭터 A",
    test_b: "테스트 캐릭터 B",
    test_c: "테스트 캐릭터 C",
  };

  function resetCompositionAfterMembershipChange(party, at = Date.now()) {
    if (!party) return;
    const stayConfirmed = ["COMPOSITION_CONFIRMED", "READY_CHECK"].includes(String(party.status || ""));
    const memberIds = unique(party.memberIds);
    const retainedReadyIds = stayConfirmed
      ? memberIds.filter((memberId) => memberId === party.creatorId || effectiveReady(party, memberId))
      : [];
    party.status = stayConfirmed ? "COMPOSITION_CONFIRMED" : "RECRUITING";
    party.confirmedBy = stayConfirmed ? memberIds : [];
    party.readyBy = retainedReadyIds;
    party.readyStateBy = stayConfirmed
      ? Object.fromEntries(memberIds.map((memberId) => [memberId, { ready: retainedReadyIds.includes(memberId), at }]))
      : {};
    if (!stayConfirmed) party.compositionLockedAt = null;
    party.flowRevision = Math.max(0, Number(party.flowRevision || 0)) + 1;
    party.membershipChangedAt = at;
  }

  function appendMembershipNotice(draft, { party, memberId, actorId, kind, memberName, at }) {
    draft.partyMembershipNotices ||= {};
    const noticeId = `membership_${Number(at || Date.now())}_${String(memberId || "")}_${String(kind || "")}`;
    draft.partyMembershipNotices[noticeId] = {
      id: noticeId,
      partyId: String(party?.id || ""),
      partyName: String(party?.name || "조사조"),
      memberId: String(memberId || ""),
      memberName: String(memberName || DEMO_NAMES[memberId] || "조원"),
      leaderId: String(party?.creatorId || ""),
      actorId: String(actorId || ""),
      kind: String(kind || ""),
      at: Number(at || Date.now()),
    };
    const entries = Object.values(draft.partyMembershipNotices)
      .filter(Boolean)
      .sort((a, b) => Number(b?.at || 0) - Number(a?.at || 0));
    entries.slice(100).forEach((notice) => { if (notice?.id) delete draft.partyMembershipNotices[notice.id]; });
  }

  function removeMemberState(snapshot, partyId, memberId, actorId, at = Date.now(), memberName = "") {
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
    if (party.membershipReinvitedAtBy && typeof party.membershipReinvitedAtBy === "object") delete party.membershipReinvitedAtBy[memberId];
    if (character.currentPartyId === partyId) character.currentPartyId = null;
    if (!party.sessionId) character.currentSessionId = null;

    resetCompositionAfterMembershipChange(party, at);
    draft.partyMembershipRemovals ||= {};
    const kind = selfLeave ? "SELF_LEAVE" : "LEADER_KICK";
    draft.partyMembershipRemovals[removalKey(partyId, memberId)] = {
      partyId,
      memberId,
      actorId,
      kind,
      active: true,
      at,
    };
    appendMembershipNotice(draft, { party, memberId, actorId, kind, memberName, at });
    return draft;
  }

  function markReinviteState(snapshot, partyId, memberId, at = Date.now()) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    if (!party || !membershipChangeAllowed(party)) return draft;
    if (!unique(party.invitedIds).includes(memberId)) return draft;
    const removal = draft.partyMembershipRemovals?.[removalKey(partyId, memberId)];
    if (!removal?.active || Number(at) <= Number(removal.at || 0)) return draft;
    party.membershipReinvitedAtBy = party.membershipReinvitedAtBy && typeof party.membershipReinvitedAtBy === "object"
      ? { ...party.membershipReinvitedAtBy }
      : {};
    party.membershipReinvitedAtBy[memberId] = Math.max(Number(party.membershipReinvitedAtBy[memberId] || 0), Number(at));
    party.declinedIds = unique(party.declinedIds).filter((id) => id !== memberId);
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
    if (party.membershipReinvitedAtBy && typeof party.membershipReinvitedAtBy === "object") delete party.membershipReinvitedAtBy[memberId];
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
      const reinvitedAt = Number(party.membershipReinvitedAtBy?.[removal.memberId] || 0);
      const preserveFreshInvite = reinvitedAt > Number(removal.at || 0);
      const before = JSON.stringify({
        members: party.memberIds,
        invited: party.invitedIds,
        declined: party.declinedIds,
        confirmed: party.confirmedBy,
        ready: party.readyBy,
        readyState: party.readyStateBy?.[removal.memberId],
        partyId: character?.currentPartyId,
        sessionId: character?.currentSessionId,
      });
      party.memberIds = unique(party.memberIds).filter((id) => id !== removal.memberId);
      if (!preserveFreshInvite) party.invitedIds = unique(party.invitedIds).filter((id) => id !== removal.memberId);
      else party.invitedIds = unique(party.invitedIds);
      party.declinedIds = unique(party.declinedIds).filter((id) => id !== removal.memberId);
      party.confirmedBy = unique(party.confirmedBy).filter((id) => id !== removal.memberId);
      party.readyBy = unique(party.readyBy).filter((id) => id !== removal.memberId);
      if (party.readyStateBy && typeof party.readyStateBy === "object") delete party.readyStateBy[removal.memberId];
      if (character?.currentPartyId === party.id) character.currentPartyId = null;
      if (character && !party.sessionId && character.currentPartyId == null) character.currentSessionId = null;
      const after = JSON.stringify({
        members: party.memberIds,
        invited: party.invitedIds,
        declined: party.declinedIds,
        confirmed: party.confirmedBy,
        ready: party.readyBy,
        readyState: party.readyStateBy?.[removal.memberId],
        partyId: character?.currentPartyId,
        sessionId: character?.currentSessionId,
      });
      if (before !== after) {
        if (membershipChangeAllowed(party)) resetCompositionAfterMembershipChange(party, Number(removal.at || Date.now()));
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
    markReinviteState,
    markMemberJoinedState,
    repairMembershipRemovals,
    readyStateText,
  });
  if (typeof window !== "undefined") window.__BAEKJI_PARTY_MEMBERSHIP_UX_TEST__ = TEST_API;
  if (typeof document === "undefined" || typeof localStorage === "undefined" || typeof sessionStorage === "undefined") return;
  const persistence = window.__BAEKJI_WORLD_PERSISTENCE__;
  if (!persistence) return;

  let refreshQueued = false;
  let repairing = false;
  let pendingConfirmation = null;

  function readState(raw = null) {
    try {
      const parsed = JSON.parse(raw == null ? persistence.readRaw() || "null" : raw);
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
    const oldRaw = persistence.readRaw();
    const newRaw = JSON.stringify(snapshot);
    if (oldRaw === newRaw) return false;
    persistence.writeRaw(newRaw);
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
      .party-membership-ready-only{display:inline-flex;align-items:center;white-space:nowrap;order:2}
      .party-member-kick{order:1}.party-member-kick,.party-roster-self-leave{white-space:nowrap}
      .party-roster-member[data-party-membership-row]{grid-template-columns:56px minmax(0,1fr) auto}
      .party-roster-member[data-party-membership-row] .party-roster-self-leave{align-self:center}
      .party-membership-backdrop{position:fixed;inset:0;z-index:520;display:grid;place-items:center;padding:20px;background:rgba(12,12,12,.72)}
      .party-membership-modal{width:min(500px,100%);background:var(--paper,#f6f6f2);color:#111;border:4px double #111;box-shadow:8px 8px 0 #111;padding:24px}
      .party-membership-kicker{display:inline-block;border:2px solid #111;padding:3px 7px;margin-bottom:12px;font-size:11px;font-weight:900;letter-spacing:.08em}
      .party-membership-modal h2{margin:0;font-size:28px;line-height:1.15}.party-membership-modal p{margin:14px 0 0;line-height:1.6;white-space:pre-line}
      .party-membership-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:22px}.party-membership-actions .button{min-width:110px}
      @media(max-width:520px){.party-roster-member[data-party-membership-row]{grid-template-columns:50px minmax(0,1fr);}.party-roster-member[data-party-membership-row] .party-roster-self-leave{grid-column:1/-1;width:100%}.party-membership-backdrop{padding:14px}.party-membership-modal{padding:18px}.party-membership-actions{display:grid;grid-template-columns:1fr 1fr}.party-membership-actions .button{min-width:0}}
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
        ? `<button type="button" class="button danger small party-member-kick" data-party-member-kick="${escapeHtml(partyId)}" data-party-member-id="${escapeHtml(memberId)}">탈퇴</button>`
        : "";
      const readyMarkup = `<span class="party-ready-state party-membership-ready-only ${ready ? "is-ready" : "is-waiting"}">${ready ? "● 준비 완료" : "○ 준비 대기"}</span>`;
      const markup = `${kick}${readyMarkup}`;
      if (pills.innerHTML !== markup) pills.innerHTML = markup;
    });

    const section = document.querySelector(".member-grid")?.closest("section.card");
    const help = section?.querySelector(".card-header .muted.small");
    const helpCopy = canEdit
      ? "조원별 준비 상태만 표시합니다. 세션 생성 전에는 조장이 특정 조원을 탈퇴시킬 수 있습니다."
      : "조원별 준비 상태만 표시합니다.";
    if (help && help.textContent !== helpCopy) help.textContent = helpCopy;
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
      const buttons = [...row.querySelectorAll("[data-party-self-leave]")];
      const shouldShow = memberId === userId && party.creatorId !== userId && membershipChangeAllowed(party);
      if (!shouldShow) {
        buttons.forEach((button) => button.remove());
        return;
      }
      let button = buttons[0] || null;
      buttons.slice(1).forEach((extra) => extra.remove());
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "button danger small party-roster-self-leave";
        button.dataset.partySelfLeave = partyId;
        button.textContent = "탈퇴";
        row.appendChild(button);
      } else {
        button.dataset.partySelfLeave = partyId;
        if (button.textContent !== "탈퇴") button.textContent = "탈퇴";
      }
    });
  }

  function resolveMemberName(partyId, memberId, sourceElement = null) {
    const sourceRow = sourceElement?.closest?.(".party-roster-member, .member");
    const sourceName = String(sourceRow?.querySelector?.(".party-roster-name, .list-title")?.textContent || "").trim();
    if (sourceName) return sourceName;
    const snapshot = readState();
    const party = snapshot?.parties?.[partyId];
    const index = unique(party?.memberIds).indexOf(memberId);
    if (index >= 0) {
      const row = document.querySelectorAll(".member-grid .member")[index];
      const rowName = String(row?.querySelector(".list-title")?.textContent || "").trim();
      if (rowName) return rowName;
    }
    try {
      const profile = JSON.parse(sessionStorage.getItem("baekji_city_tester_session_profile_v1") || "null");
      if (String(profile?.id || "") === memberId) {
        const profileName = String(profile?.name || profile?.characterName || profile?.loginId || "").trim();
        if (profileName) return profileName;
      }
    } catch {
      // Optional profile cache.
    }
    return DEMO_NAMES[memberId] || "조원";
  }

  function modalRoot() {
    return document.getElementById("modal-root");
  }

  function clearMembershipModal() {
    const root = modalRoot();
    if (root?.querySelector("[data-party-membership-modal]")) root.replaceChildren();
  }

  function openConfirmationModal({ title, copy, confirmLabel = "탈퇴", onConfirm }) {
    const root = modalRoot();
    if (!root) return false;
    pendingConfirmation = typeof onConfirm === "function" ? onConfirm : null;
    root.innerHTML = `
      <div class="party-membership-backdrop" data-party-membership-modal data-party-membership-confirm>
        <section class="party-membership-modal" role="dialog" aria-modal="true" aria-labelledby="party-membership-confirm-title">
          <div class="party-membership-kicker">PARTY MEMBERSHIP</div>
          <h2 id="party-membership-confirm-title">${escapeHtml(title)}</h2>
          <p>${escapeHtml(copy)}</p>
          <div class="party-membership-actions">
            <button type="button" class="button" data-party-membership-confirm-cancel>취소</button>
            <button type="button" class="button danger" data-party-membership-confirm-ok>${escapeHtml(confirmLabel)}</button>
          </div>
        </section>
      </div>`;
    return true;
  }

  function seenNoticeIds(userId) {
    try {
      return unique(JSON.parse(localStorage.getItem(`${NOTICE_SEEN_KEY_PREFIX}${userId}`) || "[]")).map(String);
    } catch {
      return [];
    }
  }

  function markNoticeSeen(userId, noticeId) {
    const values = unique([...seenNoticeIds(userId), String(noticeId || "")]).filter(Boolean).slice(-200);
    localStorage.setItem(`${NOTICE_SEEN_KEY_PREFIX}${userId}`, JSON.stringify(values));
  }

  function pendingMembershipNotice(snapshot, userId) {
    const seen = new Set(seenNoticeIds(userId));
    return Object.values(snapshot?.partyMembershipNotices || {})
      .filter((notice) => notice && !seen.has(String(notice.id || "")) && [notice.memberId, notice.leaderId].includes(userId))
      .sort((a, b) => Number(a?.at || 0) - Number(b?.at || 0))[0] || null;
  }

  function showPendingMembershipNotice(snapshot, userId) {
    const root = modalRoot();
    if (!root || root.children.length) return;
    const notice = pendingMembershipNotice(snapshot, userId);
    if (!notice?.id) return;
    markNoticeSeen(userId, notice.id);
    const isMember = userId === notice.memberId;
    const title = isMember ? "조사조 탈퇴" : "조원 변동";
    const copy = isMember
      ? `${notice.partyName || "조사조"}에서 탈퇴되었습니다.`
      : notice.kind === "SELF_LEAVE"
        ? `${notice.memberName || "조원"} 님이 ${notice.partyName || "조사조"}에서 탈퇴했습니다.`
        : `${notice.memberName || "조원"} 님이 ${notice.partyName || "조사조"}에서 탈퇴 처리되었습니다.`;
    root.innerHTML = `
      <div class="party-membership-backdrop" data-party-membership-modal data-party-membership-notice>
        <section class="party-membership-modal" role="dialog" aria-modal="true" aria-labelledby="party-membership-notice-title">
          <div class="party-membership-kicker">PARTY UPDATE</div>
          <h2 id="party-membership-notice-title">${escapeHtml(title)}</h2>
          <p>${escapeHtml(copy)}</p>
          <div class="party-membership-actions">
            <button type="button" class="button primary" data-party-membership-notice-close>확인</button>
          </div>
        </section>
      </div>`;
  }

  function performRemoval(partyId, memberId, mode, memberName = "") {
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !userId) return false;
    const party = snapshot.parties?.[partyId];
    if (!party || !membershipChangeAllowed(party)) return false;
    const isSelf = mode === "self" && userId === memberId && party.creatorId !== memberId;
    const isKick = mode === "kick" && party.creatorId === userId && party.creatorId !== memberId;
    if (!isSelf && !isKick) return false;

    const next = removeMemberState(snapshot, partyId, memberId, userId, Date.now(), memberName);
    if (JSON.stringify(next) === JSON.stringify(snapshot)) return false;
    clearMembershipModal();
    document.querySelector("[data-party-roster-modal]")?.remove();
    writeState(next, isSelf ? "self-leave" : "leader-kick");
    forceRouteRefresh();
    setTimeout(scheduleRefresh, 32);
    return true;
  }

  function stampReinvite(memberId) {
    const [page, partyId] = routeParts();
    if (page !== "party" || !partyId || !memberId) return false;
    const snapshot = readState();
    const party = snapshot?.parties?.[partyId];
    if (!party || !unique(party.invitedIds).includes(memberId)) return false;
    const next = markReinviteState(snapshot, partyId, memberId, Date.now());
    if (JSON.stringify(next) === JSON.stringify(snapshot)) return false;
    return writeState(next, "reinvite-stamp");
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
    decorateLeaderParticipants(snapshot, userId);
    decorateRosterModal(snapshot, userId);
    showPendingMembershipNotice(snapshot, userId);
    document.documentElement.dataset.partyMembershipUxVersion = VERSION;
  }

  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    setTimeout(refresh, 16);
  }

  window.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const accept = target.closest("[data-party-flow-accept], [data-accept]");
    if (accept) rememberJoinIntent(accept.dataset.partyFlowAccept || accept.dataset.accept);
    const invite = target.closest("[data-invite]");
    if (invite) setTimeout(() => stampReinvite(invite.dataset.invite), 0);
  }, true);

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const cancel = target.closest("[data-party-membership-confirm-cancel]");
    if (cancel) {
      event.preventDefault();
      event.stopImmediatePropagation();
      pendingConfirmation = null;
      clearMembershipModal();
      return;
    }

    const confirm = target.closest("[data-party-membership-confirm-ok]");
    if (confirm) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const action = pendingConfirmation;
      pendingConfirmation = null;
      clearMembershipModal();
      action?.();
      return;
    }

    const noticeClose = target.closest("[data-party-membership-notice-close]");
    if (noticeClose) {
      event.preventDefault();
      event.stopImmediatePropagation();
      clearMembershipModal();
      setTimeout(scheduleRefresh, 32);
      return;
    }

    const selfLeave = target.closest("[data-party-self-leave]");
    if (selfLeave) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const partyId = selfLeave.dataset.partySelfLeave;
      const snapshot = readState();
      const party = snapshot?.parties?.[partyId];
      const memberId = currentUserId();
      const memberName = resolveMemberName(partyId, memberId, selfLeave);
      openConfirmationModal({
        title: "조사조 탈퇴",
        copy: `${party?.name || "조사조"}에서 탈퇴할까요?\n탈퇴하면 다른 조사조의 초대를 다시 받을 수 있습니다.`,
        confirmLabel: "탈퇴",
        onConfirm: () => performRemoval(partyId, memberId, "self", memberName),
      });
      return;
    }

    const kick = target.closest("[data-party-member-kick][data-party-member-id]");
    if (kick) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const partyId = kick.dataset.partyMemberKick;
      const memberId = kick.dataset.partyMemberId;
      const snapshot = readState();
      const party = snapshot?.parties?.[partyId];
      const memberName = resolveMemberName(partyId, memberId, kick);
      openConfirmationModal({
        title: "조원 탈퇴 처리",
        copy: `${memberName} 님을 ${party?.name || "조사조"}에서 탈퇴시킬까요?\n조 구성이 변경되어 전원의 준비 상태가 초기화됩니다.`,
        confirmLabel: "탈퇴",
        onConfirm: () => performRemoval(partyId, memberId, "kick", memberName),
      });
    }
  }, true);

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!document.querySelector("[data-party-membership-confirm]")) return;
    pendingConfirmation = null;
    clearMembershipModal();
  });

  const app = document.getElementById("app");
  if (app && typeof MutationObserver === "function") {
    new MutationObserver(scheduleRefresh).observe(app, { childList: true, subtree: true });
  }
  const modal = document.getElementById("modal-root");
  if (modal && typeof MutationObserver === "function") {
    new MutationObserver(scheduleRefresh).observe(modal, { childList: true, subtree: true });
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
