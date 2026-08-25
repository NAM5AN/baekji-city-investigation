(() => {
  "use strict";

  const shell = window.__BAEKJI_ADMIN_SHELL__;
  if (!shell || window.__BAEKJI_ADMIN_SESSION_OPS_MVP5__) return;
  const OPS_API = "/api/admin-session-ops";
  const DATA = window.DAY1_DATA || { places: {} };
  let root = null;
  let currentFilter = "";
  let currentPayload = null;
  let currentSnapshot = null;
  let refreshTimer = 0;
  let summaryTimer = 0;
  let busy = false;

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;").replaceAll("'", "&#039;");
  const values = (object) => Object.values(object && typeof object === "object" ? object : {});

  function ensureRoot() {
    if (root?.isConnected) return root;
    root = document.createElement("div");
    root.id = "admin-session-ops-mvp5-root";
    document.body.append(root);
    return root;
  }

  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) throw Object.assign(new Error(data?.code || `HTTP_${response.status}`), { status: response.status, data });
    return data;
  }

  function readSnapshot(options = {}) {
    return shell.snapshot.refresh(options);
  }

  function requestId() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return `mvp5_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function nodeName(id) {
    if (id === "E_ENTRY") return "해오름역 구역 입구";
    return DATA.places?.[id]?.name || id || "위치 미상";
  }

  function statusLabel(status) {
    return ({ BRIEFING: "브리핑", ACTIVE: "진행", PAUSED: "일시정지", COMPLETED: "종료" })[status] || status || "미상";
  }

  function profile(id) {
    return (currentSnapshot?.directory || []).find((entry) => String(entry.id) === String(id)) || { id, name: String(id), profilePhoto: "" };
  }

  function partyFor(session) {
    return currentSnapshot?.state?.parties?.[session.partyId] || null;
  }

  function presenceState(lastSeenAt, serverTime) {
    if (!lastSeenAt) return { key: "offline", label: "연결 끊김", age: "기록 없음" };
    const seen = new Date(lastSeenAt).getTime();
    const ageMs = Math.max(0, Number(serverTime || Date.now()) - seen);
    if (ageMs <= 45_000) return { key: "online", label: "온라인", age: `${Math.round(ageMs / 1000)}초 전` };
    if (ageMs <= 180_000) return { key: "afk", label: "AFK", age: `${Math.round(ageMs / 1000)}초 전` };
    return { key: "offline", label: "연결 끊김", age: `${Math.round(ageMs / 60000)}분 전` };
  }

  function issueRank(issue) {
    return ({ critical: 3, warning: 2, info: 1 })[issue?.level] || 0;
  }

  function sessionSeverity(session) {
    return (session.issues || []).reduce((max, issue) => Math.max(max, issueRank(issue)), 0);
  }

  function severityLabel(rank) {
    return rank >= 3 ? "오류" : rank >= 2 ? "주의" : rank >= 1 ? "확인" : "정상";
  }

  function memberRows(session) {
    if (!session.memberIds?.length) return `<div class="mvp5-empty compact">조원이 없습니다.</div>`;
    const presenceMap = new Map((session.presence || []).map((entry) => [String(entry.characterId), entry.lastSeenAt]));
    return session.memberIds.map((id) => {
      const person = profile(id);
      const p = presenceState(presenceMap.get(String(id)), currentPayload?.serverTime);
      return `<div class="mvp5-member"><div class="mvp5-avatar">${person.profilePhoto ? `<img src="${esc(person.profilePhoto)}" alt="">` : esc(Array.from(person.name || "?")[0] || "?")}</div><div><strong>${esc(person.name)}</strong><small>${esc(id)}</small></div><span class="mvp5-presence ${p.key}">${p.label}<small>${p.age}</small></span></div>`;
    }).join("");
  }

  function issueRows(session) {
    const issues = session.issues || [];
    if (!issues.length) return `<div class="mvp5-ok">검출된 세션 오류가 없습니다.</div>`;
    return issues.map((issue) => `<div class="mvp5-issue ${esc(issue.level)}"><strong>${esc(issue.code)}</strong><span>${esc(issue.text)}</span></div>`).join("");
  }

  function actionButtons(session) {
    const buttons = [];
    if (session.status === "ACTIVE") {
      buttons.push(`<button type="button" data-mvp5-op="SESSION_PAUSE" data-session-id="${esc(session.id)}" ${session.movement ? "disabled" : ""}>${session.movement ? "이동 복구 후 정지" : "일시정지"}</button>`);
    } else if (session.status === "PAUSED") {
      buttons.push(`<button type="button" class="primary" data-mvp5-op="SESSION_RESUME" data-session-id="${esc(session.id)}">조사 재개</button>`);
    }
    if (session.movement || session.activeEncounter) {
      buttons.push(`<button type="button" class="warning" data-mvp5-op="SESSION_RECOVER" data-session-id="${esc(session.id)}">이동·돌발상황 복구</button>`);
    }
    if (session.currentDetailId || session.movement || session.activeEncounter) {
      buttons.push(`<button type="button" data-mvp5-op="SESSION_RECOVER" data-reset-field="true" data-session-id="${esc(session.id)}">현재 구역 화면으로 복구</button>`);
    }
    if (session.status !== "COMPLETED") {
      buttons.push(`<button type="button" class="danger" data-mvp5-op="SESSION_FORCE_END" data-session-id="${esc(session.id)}">강제 종료</button>`);
    }
    return buttons.join("") || `<span class="mvp5-no-actions">조작할 운영 상태가 없습니다.</span>`;
  }

  function sessionCard(session) {
    const party = partyFor(session);
    const severity = sessionSeverity(session);
    const movement = session.movement ? `${nodeName(session.movement.fromNode)} → ${nodeName(session.movement.targetNode)}` : "없음";
    const hazard = session.activeEncounter ? `진행 중 · ${(session.activeEncounter.hazards || []).length || 0}개` : "없음";
    return `<article class="mvp5-session-card severity-${severity}">
      <header><div><span class="mvp5-severity">${severityLabel(severity)}</span><strong>${esc(party?.name || party?.id || session.partyId || "조사조 미상")}</strong><small>${esc(session.id)}</small></div><span class="mvp5-session-status ${esc(session.status.toLowerCase())}">${statusLabel(session.status)}</span></header>
      <div class="mvp5-session-facts"><span><b>위치</b>${esc(nodeName(session.currentNode))}${session.currentDetailId ? ` · ${esc(session.currentDetailId)}` : ""}</span><span><b>시간 변주</b>${esc(String(session.variant || "-").toUpperCase())}</span><span><b>이동</b>${esc(movement)}</span><span><b>돌발</b>${esc(hazard)}</span></div>
      <details class="mvp5-block" ${severity >= 2 ? "open" : ""}><summary>상태 점검 ${(session.issues || []).length ? `· ${(session.issues || []).length}건` : ""}</summary>${issueRows(session)}</details>
      <details class="mvp5-block"><summary>조원 접속 상태 · ${session.memberIds?.length || 0}명</summary><div class="mvp5-members">${memberRows(session)}</div></details>
      <div class="mvp5-actions">${actionButtons(session)}</div>
    </article>`;
  }

  function render(payload, snapshot, filter = currentFilter) {
    currentPayload = payload;
    currentSnapshot = snapshot;
    currentFilter = filter || "";
    const sessions = (payload.sessions || []).filter((session) => !currentFilter || session.id === currentFilter);
    const problemCount = (payload.sessions || []).filter((session) => sessionSeverity(session) >= 2).length;
    ensureRoot().innerHTML = `<div class="mvp5-backdrop" data-mvp5-close-backdrop><section class="mvp5-modal" role="dialog" aria-modal="true" aria-labelledby="mvp5-title">
      <header class="mvp5-head"><div><strong id="mvp5-title">세션 운영·복구</strong><small>실시간 상태 점검 · r${Number(payload.revision || 0)} · 오류/주의 ${problemCount}개 세션</small></div><div><button type="button" data-mvp5-refresh>새로고침</button><button type="button" data-mvp5-close aria-label="닫기">×</button></div></header>
      <div class="mvp5-toolbar"><button type="button" class="${!currentFilter ? "active" : ""}" data-mvp5-filter="">전체 세션</button>${currentFilter ? `<button type="button" class="active" disabled>선택 세션만 보기</button>` : ""}<span>ONLINE ≤45초 · AFK ≤3분 · 이후 연결 끊김</span></div>
      <div class="mvp5-list">${sessions.length ? sessions.sort((a, b) => sessionSeverity(b) - sessionSeverity(a)).map(sessionCard).join("") : `<div class="mvp5-empty">표시할 조사 세션이 없습니다.</div>`}</div>
    </section></div>`;
    scheduleRefresh();
  }

  function renderConfirm(operation, sessionId, resetField) {
    const session = currentPayload?.sessions?.find((entry) => entry.id === sessionId);
    if (!session) return;
    const party = partyFor(session);
    const copy = operation === "SESSION_FORCE_END"
      ? "조사 세션을 즉시 종료하고 진행 중 이동·돌발상황을 제거합니다. 조원 화면은 결과 화면으로 전환됩니다."
      : resetField
        ? "현재 구역은 유지하고 세부 조사 위치·이동·돌발상황을 제거해 구역 기본 화면으로 복구합니다."
        : "진행 중 이동과 돌발상황 상태를 제거하고 현재 구역에서 다시 행동할 수 있게 복구합니다.";
    ensureRoot().insertAdjacentHTML("beforeend", `<div class="mvp5-confirm-backdrop" data-mvp5-confirm-backdrop><section class="mvp5-confirm"><strong>${esc(party?.name || session.partyId || sessionId)} · ${operation === "SESSION_FORCE_END" ? "강제 종료" : "복구 확인"}</strong><p>${esc(copy)}</p><div><button type="button" data-mvp5-confirm-cancel>취소</button><button type="button" class="danger" data-mvp5-confirm-apply="${esc(operation)}" data-session-id="${esc(sessionId)}" ${resetField ? 'data-reset-field="true"' : ""}>적용</button></div></section></div>`);
  }

  function toast(message, error = false) {
    document.querySelector(".mvp5-toast")?.remove();
    const node = document.createElement("div");
    node.className = `mvp5-toast ${error ? "error" : ""}`;
    node.textContent = message;
    document.body.append(node);
    setTimeout(() => node.remove(), 2800);
  }

  async function load(filter = currentFilter, snapshotOptions = {}) {
    const [payload, snapshot] = await Promise.all([request(OPS_API), readSnapshot(snapshotOptions)]);
    render(payload, snapshot, filter);
  }

  async function open(filter = "") {
    currentFilter = filter;
    ensureRoot().innerHTML = `<div class="mvp5-backdrop"><section class="mvp5-modal"><div class="mvp5-loading">세션 운영 상태를 불러오고 있습니다...</div></section></div>`;
    try { await load(filter); }
    catch (error) { ensureRoot().innerHTML = `<div class="mvp5-backdrop" data-mvp5-close-backdrop><section class="mvp5-modal"><div class="mvp5-empty">${esc(error?.data?.code || error?.message || "운영 상태를 불러올 수 없습니다.")}</div><button type="button" data-mvp5-close>닫기</button></section></div>`; }
  }

  function close() {
    clearTimeout(refreshTimer);
    ensureRoot().replaceChildren();
    currentPayload = null;
    currentSnapshot = null;
    currentFilter = "";
  }

  function scheduleRefresh() {
    clearTimeout(refreshTimer);
    if (!ensureRoot().childElementCount) return;
    refreshTimer = setTimeout(async () => {
      try {
        const payload = await request(OPS_API);
        const latest = shell.snapshot.latest();
        const snapshot = latest?.state ? latest : currentSnapshot;
        if (!ensureRoot().querySelector(".mvp5-confirm-backdrop")) render(payload, snapshot, currentFilter);
      } catch {}
    }, 5000);
  }

  async function apply(operation, sessionId, resetField = false) {
    if (busy) return;
    busy = true;
    ensureRoot().querySelectorAll("button").forEach((button) => { button.disabled = true; });
    try {
      const result = await request(OPS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: requestId(), operation, sessionId, resetField }),
      });
      toast(result.summary || "관리자 운영 조작 완료");
      const freshSnapshot = await shell.snapshot.refresh({ force: true });
      render(await request(OPS_API), freshSnapshot, currentFilter);
      refreshSummary();
    } catch (error) {
      const code = error?.data?.code || error?.message || "ADMIN_SESSION_OPS_UNAVAILABLE";
      const text = ({
        SESSION_MOVEMENT_MUST_RECOVER_FIRST: "이동 중인 세션은 먼저 이동 상태를 복구해야 일시정지할 수 있습니다.",
        SESSION_NOT_ACTIVE: "현재 진행 중인 세션이 아닙니다.",
        SESSION_NOT_PAUSED: "현재 일시정지된 세션이 아닙니다.",
        SESSION_NOTHING_TO_RECOVER: "복구할 이동·돌발상황 상태가 없습니다.",
        SESSION_ALREADY_COMPLETED: "이미 종료된 세션입니다.",
      })[code] || code;
      toast(text, true);
      try { await load(currentFilter); } catch {}
    } finally { busy = false; }
  }

  function ensureButton() {
    const meta = document.querySelector(".admin-topbar-meta");
    if (!meta || meta.querySelector("[data-mvp5-open]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "mvp5-open";
    button.dataset.mvp5Open = "";
    button.innerHTML = `운영 점검 <span data-mvp5-problem-count>…</span>`;
    const audit = meta.querySelector("[data-admin-audit-open]");
    meta.insertBefore(button, audit || meta.querySelector("[data-admin-connection]") || null);
  }

  async function refreshSummary() {
    clearTimeout(summaryTimer);
    ensureButton();
    try {
      const payload = await request(OPS_API);
      const count = (payload.sessions || []).filter((session) => sessionSeverity(session) >= 2).length;
      const badge = document.querySelector("[data-mvp5-problem-count]");
      if (badge) { badge.textContent = String(count); badge.classList.toggle("alert", count > 0); }
    } catch {}
    summaryTimer = setTimeout(refreshSummary, 12_000);
  }

  function augmentPartyDetail(partyId) {
    const body = shell.modal.root()?.querySelector(".admin-modal-body");
    if (!body || body.querySelector("[data-mvp5-party-entry]")) return;
    const party = currentSnapshot?.state?.parties?.[partyId];
    const session = party?.sessionId ? currentSnapshot?.state?.sessions?.[party.sessionId] : values(currentSnapshot?.state?.sessions).find((entry) => entry?.partyId === partyId);
    if (!session) return;
    const section = document.createElement("section");
    section.className = "mvp5-party-entry";
    section.dataset.mvp5PartyEntry = "";
    section.innerHTML = `<div><strong>세션 운영·복구</strong><small>일시정지·재개·오류 상태 복구·접속 상태 확인</small></div><button type="button" data-mvp5-open-session="${esc(session.id)}">운영 점검</button>`;
    body.append(section);
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const detail = target.closest('[data-admin-detail="party"]');
    if (detail) {
      Promise.all([request(OPS_API).catch(() => null), readSnapshot().catch(() => null)]).then(([payload, snapshot]) => {
        if (payload) currentPayload = payload;
        if (snapshot) currentSnapshot = snapshot;
        setTimeout(() => augmentPartyDetail(detail.dataset.adminId), 0);
      });
    }
    if (target.closest("[data-mvp5-open]")) return void open("");
    const openSession = target.closest("[data-mvp5-open-session]");
    if (openSession) return void open(openSession.dataset.mvp5OpenSession);
    if (target.closest("[data-mvp5-close]") || target.matches("[data-mvp5-close-backdrop]")) return close();
    if (target.closest("[data-mvp5-refresh]")) return void load(currentFilter);
    const filter = target.closest("[data-mvp5-filter]");
    if (filter) return void load(filter.dataset.mvp5Filter || "");
    if (target.closest("[data-mvp5-confirm-cancel]") || target.matches("[data-mvp5-confirm-backdrop]")) return target.closest(".mvp5-confirm-backdrop")?.remove();
    const confirmApply = target.closest("[data-mvp5-confirm-apply]");
    if (confirmApply) {
      const operation = confirmApply.dataset.mvp5ConfirmApply;
      const sessionId = confirmApply.dataset.sessionId;
      const resetField = confirmApply.dataset.resetField === "true";
      target.closest(".mvp5-confirm-backdrop")?.remove();
      return void apply(operation, sessionId, resetField);
    }
    const op = target.closest("[data-mvp5-op]");
    if (op) {
      const operation = op.dataset.mvp5Op;
      const sessionId = op.dataset.sessionId;
      const resetField = op.dataset.resetField === "true";
      if (operation === "SESSION_FORCE_END" || operation === "SESSION_RECOVER") return renderConfirm(operation, sessionId, resetField);
      return void apply(operation, sessionId, resetField);
    }
  }, true);

  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && ensureRoot().childElementCount) close(); });
  const observer = new MutationObserver(ensureButton);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  ensureButton();
  refreshSummary();

  window.__BAEKJI_ADMIN_SESSION_OPS_MVP5__ = Object.freeze({ open, close, presenceState, sessionSeverity, statusLabel, nodeName });
})();
