(() => {
  "use strict";
  const { clone, uniqueArray: unique, escapeHtml } = window.__BAEKJI_RUNTIME_UTILS__;
  const { spatialScopeKey } = window.__BAEKJI_DOMAIN_RULES__;

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const SESSION_PROFILE_KEY = "baekji_city_tester_session_profile_v1";
  const SEEN_KEY = "baekji_city_party_transfer_seen_v1";
  const VERSION = "0.3.77";
  const SUPABASE_URL = "https://kfgtvifupumjuewwxzmz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";
  const accountProfiles = new Map([
    ["test_a", { name: "테스트 캐릭터 A", photo: "" }],
    ["test_b", { name: "테스트 캐릭터 B", photo: "" }],
    ["test_c", { name: "테스트 캐릭터 C", photo: "" }],
  ]);

  function sessionForUser(snapshot, userId) {
    const sessionId = snapshot?.characters?.[userId]?.currentSessionId;
    if (sessionId && snapshot.sessions?.[sessionId]) return snapshot.sessions[sessionId];
    return Object.values(snapshot?.sessions || {}).find((session) => session?.status === "ACTIVE" && session?.memberIds?.includes(userId)) || null;
  }

  function fieldSessions(snapshot, session) {
    const scopeKey = spatialScopeKey(session);
    if (!scopeKey) return [];
    return Object.values(snapshot?.sessions || {}).filter((candidate) =>
      candidate?.id !== session.id &&
      candidate?.status === "ACTIVE" &&
      candidate?.variant === session.variant &&
      spatialScopeKey(candidate) === scopeKey
    );
  }

  function presentSessions(snapshot, session) {
    if (!session) return [];
    return [session, ...fieldSessions(snapshot, session)];
  }

  function presentCharacterIds(snapshot, session) {
    return unique(presentSessions(snapshot, session).flatMap((candidate) => candidate.memberIds || []));
  }

  function transferRequests(snapshot) {
    return snapshot?.partyTransferRequests && typeof snapshot.partyTransferRequests === "object"
      ? snapshot.partyTransferRequests
      : {};
  }

  function pendingRequestForUser(snapshot, requesterId) {
    return Object.values(transferRequests(snapshot)).find((request) => request?.requesterId === requesterId && request?.status === "PENDING") || null;
  }

  function pendingRequestsForLeader(snapshot, leaderId) {
    return Object.values(transferRequests(snapshot))
      .filter((request) => request?.status === "PENDING" && snapshot?.parties?.[request.targetPartyId]?.creatorId === leaderId)
      .sort((a, b) => Number(a.requestedAt || 0) - Number(b.requestedAt || 0));
  }

  function transferContext(snapshot, requesterId, targetPartyId, options = {}) {
    const character = snapshot?.characters?.[requesterId];
    const sourceParty = character?.currentPartyId ? snapshot?.parties?.[character.currentPartyId] : null;
    const sourceSession = character?.currentSessionId ? snapshot?.sessions?.[character.currentSessionId] : null;
    const targetParty = snapshot?.parties?.[targetPartyId];
    const targetSession = targetParty?.sessionId ? snapshot?.sessions?.[targetParty.sessionId] : null;
    if (!character || !sourceParty || !sourceSession) return { ok: false, code: "NO_SOURCE" };
    if (!targetParty || !targetSession) return { ok: false, code: "NO_TARGET" };
    if (sourceParty.id === targetParty.id || sourceSession.id === targetSession.id) return { ok: false, code: "SAME_PARTY" };
    if (sourceSession.status !== "ACTIVE" || targetSession.status !== "ACTIVE") return { ok: false, code: "INACTIVE" };
    if (sourceSession.variant !== targetSession.variant) return { ok: false, code: "OTHER_VARIANT" };
    if (spatialScopeKey(sourceSession) !== spatialScopeKey(targetSession)) return { ok: false, code: "NOT_SAME_FIELD" };
    if (sourceSession.movement || targetSession.movement || sourceSession.activeEncounter || targetSession.activeEncounter) {
      return { ok: false, code: "BUSY" };
    }
    if (!options.ignorePending && pendingRequestForUser(snapshot, requesterId)) return { ok: false, code: "PENDING_EXISTS" };
    return { ok: true, character, sourceParty, sourceSession, targetParty, targetSession, scopeKey: spatialScopeKey(sourceSession) };
  }

  function createTransferRequestState(snapshot, requesterId, targetPartyId, requestId, now = Date.now()) {
    const draft = clone(snapshot);
    const context = transferContext(draft, requesterId, targetPartyId);
    if (!context.ok || !requestId) return draft;
    draft.partyTransferRequests ||= {};
    draft.partyTransferRequests[requestId] = {
      id: requestId,
      requesterId,
      sourcePartyId: context.sourceParty.id,
      sourceSessionId: context.sourceSession.id,
      targetPartyId: context.targetParty.id,
      targetSessionId: context.targetSession.id,
      scopeKey: context.scopeKey,
      status: "PENDING",
      requestedAt: now,
      resolvedAt: null,
      resolvedBy: null,
    };
    return draft;
  }

  function appendTransferLog(session, text, meta = {}) {
    if (!session) return;
    session.logs ||= [];
    session.logs.push({
      id: `log_transfer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      type: "presence",
      text,
      actorId: null,
      at: Date.now(),
      ...meta,
    });
  }

  function applyApprovedMembership(draft, request) {
    const requesterId = request.requesterId;
    const targetParty = draft.parties?.[request.targetPartyId];
    const targetSession = draft.sessions?.[request.targetSessionId || targetParty?.sessionId];
    const sourceParty = draft.parties?.[request.sourcePartyId];
    const sourceSession = draft.sessions?.[request.sourceSessionId];
    const character = draft.characters?.[requesterId];
    if (!targetParty || !targetSession || !character) return false;

    Object.values(draft.parties || {}).forEach((party) => {
      party.memberIds = unique(party.memberIds).filter((id) => id !== requesterId || party.id === targetParty.id);
      party.confirmedBy = unique(party.confirmedBy).filter((id) => id !== requesterId || party.id === targetParty.id);
      party.readyBy = unique(party.readyBy).filter((id) => id !== requesterId || party.id === targetParty.id);
      party.invitedIds = unique(party.invitedIds).filter((id) => id !== requesterId);
    });
    Object.values(draft.sessions || {}).forEach((session) => {
      session.memberIds = unique(session.memberIds).filter((id) => id !== requesterId || session.id === targetSession.id);
    });

    targetParty.memberIds = unique([...(targetParty.memberIds || []), requesterId]);
    targetParty.confirmedBy = unique([...(targetParty.confirmedBy || []), requesterId]);
    targetParty.readyBy = unique([...(targetParty.readyBy || []), requesterId]);
    targetSession.memberIds = unique([...(targetSession.memberIds || []), requesterId]);
    character.currentPartyId = targetParty.id;
    character.currentSessionId = targetSession.id;

    if (sourceParty) {
      sourceParty.memberIds = unique(sourceParty.memberIds).filter((id) => id !== requesterId);
      sourceParty.confirmedBy = unique(sourceParty.confirmedBy).filter((id) => id !== requesterId);
      sourceParty.readyBy = unique(sourceParty.readyBy).filter((id) => id !== requesterId);
      if (sourceParty.creatorId === requesterId) {
        sourceParty.creatorId = sourceParty.memberIds[0] || null;
      }
      if (!sourceParty.memberIds.length) {
        sourceParty.status = "CLOSED";
        sourceParty.creatorId = null;
      }
    }
    if (sourceSession) {
      sourceSession.memberIds = unique(sourceSession.memberIds).filter((id) => id !== requesterId);
      if (!sourceSession.memberIds.length) sourceSession.status = "CLOSED";
    }
    return true;
  }

  function approveTransferState(snapshot, requestId, leaderId, now = Date.now()) {
    const draft = clone(snapshot);
    const request = draft.partyTransferRequests?.[requestId];
    if (!request || request.status !== "PENDING") return draft;
    const targetParty = draft.parties?.[request.targetPartyId];
    if (!targetParty || targetParty.creatorId !== leaderId) return draft;
    const context = transferContext(draft, request.requesterId, request.targetPartyId, { ignorePending: true });
    if (!context.ok) return draft;
    if (context.sourceParty.id !== request.sourcePartyId || context.sourceSession.id !== request.sourceSessionId || context.targetSession.id !== request.targetSessionId) return draft;

    request.status = "APPROVED";
    request.resolvedAt = now;
    request.resolvedBy = leaderId;
    if (!applyApprovedMembership(draft, request)) return clone(snapshot);

    appendTransferLog(context.sourceSession, `${request.requesterId}의 조사조 소속이 다른 조사조로 이동되었다.`, {
      kind: "PARTY_TRANSFER_OUT",
      requesterId: request.requesterId,
      targetPartyId: request.targetPartyId,
      requestId,
    });
    appendTransferLog(context.targetSession, `${request.requesterId}의 조사조 소속이 이 조사조로 이동되었다.`, {
      kind: "PARTY_TRANSFER_IN",
      requesterId: request.requesterId,
      sourcePartyId: request.sourcePartyId,
      requestId,
    });
    return draft;
  }

  function rejectTransferState(snapshot, requestId, leaderId, now = Date.now()) {
    const draft = clone(snapshot);
    const request = draft.partyTransferRequests?.[requestId];
    if (!request || request.status !== "PENDING") return draft;
    const targetParty = draft.parties?.[request.targetPartyId];
    if (!targetParty || targetParty.creatorId !== leaderId) return draft;
    request.status = "REJECTED";
    request.resolvedAt = now;
    request.resolvedBy = leaderId;
    return draft;
  }

  function repairApprovedTransfers(snapshot) {
    const draft = clone(snapshot);
    let changed = false;
    Object.values(transferRequests(draft)).forEach((request) => {
      if (request?.status !== "APPROVED") return;
      const before = JSON.stringify({
        character: draft.characters?.[request.requesterId],
        parties: Object.values(draft.parties || {}).map((party) => [party.id, party.creatorId, party.status, party.memberIds, party.confirmedBy, party.readyBy]),
        sessions: Object.values(draft.sessions || {}).map((session) => [session.id, session.status, session.memberIds]),
      });
      applyApprovedMembership(draft, request);
      const after = JSON.stringify({
        character: draft.characters?.[request.requesterId],
        parties: Object.values(draft.parties || {}).map((party) => [party.id, party.creatorId, party.status, party.memberIds, party.confirmedBy, party.readyBy]),
        sessions: Object.values(draft.sessions || {}).map((session) => [session.id, session.status, session.memberIds]),
      });
      if (before !== after) changed = true;
    });
    return { snapshot: draft, changed };
  }

  const TEST_API = Object.freeze({
    spatialScopeKey,
    sessionForUser,
    fieldSessions,
    presentSessions,
    presentCharacterIds,
    transferContext,
    createTransferRequestState,
    pendingRequestsForLeader,
    approveTransferState,
    rejectTransferState,
    repairApprovedTransfers,
  });
  if (typeof window !== "undefined") window.__BAEKJI_PARTY_TRANSFER_TEST__ = TEST_API;
  if (typeof document === "undefined" || typeof localStorage === "undefined" || typeof sessionStorage === "undefined") return;

  let directoryPromise = null;
  let refreshQueued = false;
  let refreshing = false;
  const autoShown = new Set();

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

  function currentSessionProfile() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_PROFILE_KEY) || "null"); }
    catch { return null; }
  }

  function profileForId(userId) {
    if (accountProfiles.has(userId)) return accountProfiles.get(userId);
    const self = currentSessionProfile();
    if (self?.id === userId) return { name: String(self.name || userId), photo: String(self.profilePhoto || self.profile_photo || "") };
    return { name: userId, photo: "" };
  }

  function loadDirectory() {
    if (directoryPromise) return directoryPromise;
    directoryPromise = fetch(`${SUPABASE_URL}/rest/v1/rpc/baekji_tester_list_accounts`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json", Accept: "application/json" },
      body: "{}",
      cache: "no-store",
    }).then((response) => response.ok ? response.json() : []).then((rows) => {
      (rows || []).forEach((row) => {
        if (!row?.id || !row?.character_name) return;
        accountProfiles.set(String(row.id), {
          name: String(row.character_name),
          photo: String(row.profile_photo || ""),
        });
      });
    }).catch(() => {});
    return directoryPromise;
  }

  function requestId() {
    return `transfer_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  function dispatchStateUpdate(oldRaw, newRaw) {
    try {
      window.dispatchEvent(new StorageEvent("storage", { key: GLOBAL_KEY, oldValue: oldRaw, newValue: newRaw, storageArea: localStorage, url: location.href }));
    } catch {
      const event = new Event("storage");
      Object.defineProperty(event, "key", { value: GLOBAL_KEY });
      window.dispatchEvent(event);
    }
  }

  function writeState(snapshot, reason = "party-transfer") {
    const oldRaw = localStorage.getItem(GLOBAL_KEY);
    const newRaw = JSON.stringify(snapshot);
    if (oldRaw === newRaw) return false;
    localStorage.setItem(GLOBAL_KEY, newRaw);
    dispatchStateUpdate(oldRaw, newRaw);
    window.dispatchEvent(new CustomEvent("baekji-party-transfer", { detail: { reason, version: VERSION } }));
    scheduleRefresh();
    return true;
  }

  function root() {
    let node = document.getElementById("party-transfer-root");
    if (!node) {
      node = document.createElement("div");
      node.id = "party-transfer-root";
      document.body.appendChild(node);
    }
    return node;
  }

  function closeModal() {
    root().replaceChildren();
  }

  function avatarMarkup(userId) {
    const profile = profileForId(userId);
    const initial = Array.from(profile.name || "?")[0] || "?";
    return profile.photo
      ? `<span class="party-transfer-avatar"><img src="${escapeHtml(profile.photo)}" alt="" /></span>`
      : `<span class="party-transfer-avatar">${escapeHtml(initial)}</span>`;
  }

  function toast(message) {
    let node = document.getElementById("party-transfer-toast");
    if (!node) {
      node = document.createElement("div");
      node.id = "party-transfer-toast";
      document.body.appendChild(node);
    }
    node.textContent = message;
    node.classList.remove("show");
    void node.offsetWidth;
    node.classList.add("show");
    clearTimeout(node.__hideTimer);
    node.__hideTimer = setTimeout(() => node.classList.remove("show"), 2600);
  }

  function partyName(snapshot, partyId) {
    return snapshot.parties?.[partyId]?.name || "조사조";
  }

  function locationTitle(session) {
    if (!session) return "현재 현장";
    if (session.movement || session.activeEncounter) return "현재 이동 구간";
    if (session.currentDetailId) return "현재 세부 장소";
    return "현재 구역";
  }

  function renderPresenceModal(snapshot, userId) {
    const session = sessionForUser(snapshot, userId);
    if (!session) return;
    const ownParty = snapshot.parties?.[snapshot.characters?.[userId]?.currentPartyId];
    const pending = pendingRequestForUser(snapshot, userId);
    const sessions = presentSessions(snapshot, session);
    const leaderPending = pendingRequestsForLeader(snapshot, userId);

    const groups = sessions.map((candidate) => {
      const party = snapshot.parties?.[candidate.partyId];
      if (!party) return "";
      const isOwn = party.id === ownParty?.id;
      const context = isOwn ? null : transferContext(snapshot, userId, party.id);
      const isPendingTarget = pending?.targetPartyId === party.id;
      const button = isOwn
        ? `<span class="party-transfer-own">현재 소속</span>`
        : isPendingTarget
          ? `<button type="button" class="party-transfer-btn" disabled>승인 대기 중</button>`
          : `<button type="button" class="party-transfer-btn primary" data-party-transfer-select="${escapeHtml(party.id)}" ${context?.ok ? "" : "disabled"}>${context?.code === "BUSY" ? "위험 종료 후 이동" : "이동"}</button>`;
      return `<section class="party-transfer-group">
        <div class="party-transfer-group-head">
          <div><strong>${escapeHtml(party.name || "조사조")}</strong><small>${candidate.memberIds?.length || 0}명</small></div>
          ${button}
        </div>
        <div class="party-transfer-members">
          ${(candidate.memberIds || []).map((memberId) => {
            const profile = profileForId(memberId);
            return `<div class="party-transfer-member">${avatarMarkup(memberId)}<span>${escapeHtml(profile.name)}</span>${party.creatorId === memberId ? `<em>조장</em>` : ""}</div>`;
          }).join("")}
        </div>
      </section>`;
    }).join("");

    root().innerHTML = `<div class="party-transfer-backdrop" data-party-transfer-close-backdrop>
      <section class="party-transfer-modal" role="dialog" aria-modal="true" aria-labelledby="party-transfer-presence-title">
        <div class="party-transfer-kicker">FIELD PRESENCE</div>
        <div class="party-transfer-title-row"><div><h2 id="party-transfer-presence-title">${escapeHtml(locationTitle(session))} 인원</h2><p>현재 같은 현장에 실제로 있는 조사조와 캐릭터만 표시됩니다.</p></div><button type="button" class="party-transfer-close" data-party-transfer-close aria-label="닫기">×</button></div>
        <div class="party-transfer-summary"><strong>${presentCharacterIds(snapshot, session).length}명</strong><span>${sessions.length}개 조사조</span></div>
        ${leaderPending.length ? `<button type="button" class="party-transfer-approval-banner" data-party-transfer-open-approvals>이동 승인 요청 ${leaderPending.length}건 확인</button>` : ""}
        <div class="party-transfer-groups">${groups}</div>
        ${pending ? `<p class="party-transfer-note">${escapeHtml(partyName(snapshot, pending.targetPartyId))}로 이동 승인을 기다리고 있습니다.</p>` : `<p class="party-transfer-note">‘합류’는 같은 현장에 함께 있는 상태이며, ‘이동’은 조사조 소속 자체를 변경합니다.</p>`}
      </section>
    </div>`;
  }

  function renderConfirmModal(snapshot, userId, targetPartyId) {
    const context = transferContext(snapshot, userId, targetPartyId);
    if (!context.ok) {
      toast(context.code === "BUSY" ? "위험 상황이나 이동 중에는 조사조를 이동할 수 없습니다." : "현재는 해당 조사조로 이동할 수 없습니다.");
      return renderPresenceModal(snapshot, userId);
    }
    const isLeader = context.sourceParty.creatorId === userId;
    const sourceRemaining = context.sourceParty.memberIds.filter((id) => id !== userId).length;
    root().innerHTML = `<div class="party-transfer-backdrop">
      <section class="party-transfer-modal compact" role="dialog" aria-modal="true" aria-labelledby="party-transfer-confirm-title">
        <div class="party-transfer-kicker">PARTY TRANSFER</div>
        <h2 id="party-transfer-confirm-title">${escapeHtml(context.targetParty.name)}로 이동할까요?</h2>
        <p><strong>${escapeHtml(context.sourceParty.name)}</strong>에서 나와 <strong>${escapeHtml(context.targetParty.name)}</strong> 소속으로 변경합니다.</p>
        <p>요청을 보내면 상대 조사조의 조장이 승인해야 이동이 완료됩니다.</p>
        ${isLeader ? `<p class="party-transfer-warning">현재 조사조의 조장입니다. ${sourceRemaining ? "승인 후 남은 조원 중 한 명이 조장을 이어받습니다." : "승인되면 현재 조사조는 인원이 없어 종료됩니다."}</p>` : ""}
        <div class="party-transfer-actions"><button type="button" class="party-transfer-btn" data-party-transfer-back>취소</button><button type="button" class="party-transfer-btn primary" data-party-transfer-confirm="${escapeHtml(targetPartyId)}">이동 요청</button></div>
      </section>
    </div>`;
  }

  function renderApprovalModal(snapshot, leaderId) {
    const requests = pendingRequestsForLeader(snapshot, leaderId);
    if (!requests.length) {
      closeModal();
      return;
    }
    root().innerHTML = `<div class="party-transfer-backdrop">
      <section class="party-transfer-modal" role="dialog" aria-modal="true" aria-labelledby="party-transfer-approval-title">
        <div class="party-transfer-kicker">TRANSFER APPROVAL</div>
        <div class="party-transfer-title-row"><div><h2 id="party-transfer-approval-title">조사조 이동 승인</h2><p>여러 요청이 동시에 들어와도 각각 따로 승인하거나 거절할 수 있습니다.</p></div><button type="button" class="party-transfer-close" data-party-transfer-close aria-label="닫기">×</button></div>
        <div class="party-transfer-request-list">
          ${requests.map((request) => {
            const profile = profileForId(request.requesterId);
            const sourceName = partyName(snapshot, request.sourcePartyId);
            const context = transferContext(snapshot, request.requesterId, request.targetPartyId, { ignorePending: true });
            const disabled = !context.ok;
            return `<article class="party-transfer-request">
              <div class="party-transfer-request-person">${avatarMarkup(request.requesterId)}<div><strong>${escapeHtml(profile.name)}</strong><small>${escapeHtml(sourceName)} → ${escapeHtml(partyName(snapshot, request.targetPartyId))}</small></div></div>
              ${disabled ? `<p class="party-transfer-request-state">${context.code === "BUSY" ? "현재 위험/이동이 끝난 뒤 승인할 수 있습니다." : "현재 같은 장소가 아니어서 승인할 수 없습니다."}</p>` : ""}
              <div class="party-transfer-actions"><button type="button" class="party-transfer-btn danger" data-party-transfer-reject="${escapeHtml(request.id)}">거절</button><button type="button" class="party-transfer-btn primary" data-party-transfer-approve="${escapeHtml(request.id)}" ${disabled ? "disabled" : ""}>허용</button></div>
            </article>`;
          }).join("")}
        </div>
      </section>
    </div>`;
  }

  function submitRequest(targetPartyId) {
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !userId) return;
    const next = createTransferRequestState(snapshot, userId, targetPartyId, requestId());
    if (!pendingRequestForUser(next, userId) || pendingRequestForUser(snapshot, userId)) {
      toast("이동 요청을 만들 수 없습니다.");
      return;
    }
    writeState(next, "request");
    closeModal();
    toast(`${partyName(next, targetPartyId)} 조장에게 이동 승인을 요청했습니다.`);
  }

  function seenStatuses() {
    try { return new Set(JSON.parse(sessionStorage.getItem(SEEN_KEY) || "[]")); }
    catch { return new Set(); }
  }

  function saveSeen(set) {
    sessionStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-80)));
  }

  function handleRequesterResolution(snapshot, userId) {
    const seen = seenStatuses();
    let changed = false;
    Object.values(transferRequests(snapshot)).forEach((request) => {
      if (request?.requesterId !== userId || !["APPROVED", "REJECTED"].includes(request.status)) return;
      const marker = `${request.id}:${request.status}`;
      if (seen.has(marker)) return;
      seen.add(marker);
      changed = true;
      if (request.status === "APPROVED") {
        toast(`${partyName(snapshot, request.targetPartyId)}로 조사조 이동이 승인되었습니다.`);
        const route = location.hash.replace(/^#\/?/, "").split("/");
        if (route[0] === "investigate" && request.targetSessionId && route[1] !== request.targetSessionId) {
          location.hash = `#/investigate/${request.targetSessionId}`;
        }
      } else {
        toast(`${partyName(snapshot, request.targetPartyId)} 이동 요청이 거절되었습니다.`);
      }
    });
    if (changed) saveSeen(seen);
  }

  function decorateFieldCard(snapshot, userId) {
    const route = location.hash.replace(/^#\/?/, "").split("/");
    if (route[0] !== "investigate") return;
    const session = sessionForUser(snapshot, userId);
    const frame = document.querySelector(".retro-scene-frame");
    if (!session || !frame) return;
    let card = frame.querySelector(".retro-field-card");
    if (!card) {
      card = document.createElement("div");
      card.className = "retro-field-card";
      frame.appendChild(card);
    }
    const count = presentCharacterIds(snapshot, session).length || 1;
    const approvals = pendingRequestsForLeader(snapshot, userId).length;
    const signature = `${count}:${approvals}:${spatialScopeKey(session)}`;
    card.dataset.partyTransferPresence = "true";
    card.dataset.openFieldPresence = "true";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", `현재 현장 ${count}명. 인원 목록 열기`);
    if (card.dataset.partyTransferSignature !== signature) {
      card.dataset.partyTransferSignature = signature;
      card.innerHTML = `<span>현재 현장</span><strong>${count}명</strong><small>인원 보기${approvals ? ` · 승인 ${approvals}` : ""}</small>`;
    }
  }

  function maybeAutoOpenApprovals(snapshot, userId) {
    const requests = pendingRequestsForLeader(snapshot, userId);
    const unseen = requests.filter((request) => !autoShown.has(request.id));
    if (!unseen.length || root().children.length) return;
    const sharedModalRoot = document.getElementById("modal-root");
    if (sharedModalRoot?.children?.length) return;
    unseen.forEach((request) => autoShown.add(request.id));
    renderApprovalModal(snapshot, userId);
  }

  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      refresh();
    });
  }

  function refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      let snapshot = readState();
      const userId = currentUserId();
      if (!snapshot || !userId) return;
      const repaired = repairApprovedTransfers(snapshot);
      if (repaired.changed) {
        writeState(repaired.snapshot, "repair-approved-transfer");
        snapshot = repaired.snapshot;
      }
      decorateFieldCard(snapshot, userId);
      handleRequesterResolution(snapshot, userId);
      maybeAutoOpenApprovals(snapshot, userId);
      document.documentElement.dataset.partyTransferVersion = VERSION;
    } finally {
      refreshing = false;
    }
  }

  document.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest("[data-open-field-presence]")) {
      event.preventDefault();
      await loadDirectory();
      const snapshot = readState();
      const userId = currentUserId();
      if (snapshot && userId) renderPresenceModal(snapshot, userId);
      return;
    }
    if (target.closest("[data-party-transfer-close]")) return closeModal();
    if (target.matches("[data-party-transfer-close-backdrop]")) return closeModal();
    if (target.closest("[data-party-transfer-back]")) {
      const snapshot = readState();
      const userId = currentUserId();
      if (snapshot && userId) renderPresenceModal(snapshot, userId);
      return;
    }
    const select = target.closest("[data-party-transfer-select]");
    if (select) {
      const snapshot = readState();
      const userId = currentUserId();
      if (snapshot && userId) renderConfirmModal(snapshot, userId, select.dataset.partyTransferSelect);
      return;
    }
    const confirm = target.closest("[data-party-transfer-confirm]");
    if (confirm) return submitRequest(confirm.dataset.partyTransferConfirm);
    if (target.closest("[data-party-transfer-open-approvals]")) {
      const snapshot = readState();
      const userId = currentUserId();
      if (snapshot && userId) renderApprovalModal(snapshot, userId);
      return;
    }
    const approve = target.closest("[data-party-transfer-approve]");
    if (approve) {
      const snapshot = readState();
      const userId = currentUserId();
      if (!snapshot || !userId) return;
      const next = approveTransferState(snapshot, approve.dataset.partyTransferApprove, userId);
      const request = next.partyTransferRequests?.[approve.dataset.partyTransferApprove];
      if (request?.status !== "APPROVED") {
        toast("현재 위치나 위험 상태가 바뀌어 아직 승인할 수 없습니다.");
        return renderApprovalModal(snapshot, userId);
      }
      writeState(next, "approve");
      toast("조사조 이동을 승인했습니다.");
      return renderApprovalModal(next, userId);
    }
    const reject = target.closest("[data-party-transfer-reject]");
    if (reject) {
      const snapshot = readState();
      const userId = currentUserId();
      if (!snapshot || !userId) return;
      const next = rejectTransferState(snapshot, reject.dataset.partyTransferReject, userId);
      writeState(next, "reject");
      toast("조사조 이동 요청을 거절했습니다.");
      return renderApprovalModal(next, userId);
    }
  }, true);

  document.addEventListener("keydown", (event) => {
    const card = event.target instanceof Element ? event.target.closest("[data-open-field-presence]") : null;
    if (!card || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    card.click();
  });

  const app = document.getElementById("app");
  if (app && typeof MutationObserver === "function") {
    new MutationObserver(scheduleRefresh).observe(app, { childList: true, subtree: true });
  }
  window.addEventListener("hashchange", scheduleRefresh);
  window.addEventListener("storage", (event) => { if (!event.key || event.key === GLOBAL_KEY) scheduleRefresh(); });
  window.addEventListener("baekji-cloud-sync", scheduleRefresh);
  window.addEventListener("baekji-party-transfer", scheduleRefresh);
  loadDirectory().finally(scheduleRefresh);
  setInterval(scheduleRefresh, 1200);
  scheduleRefresh();
})();
