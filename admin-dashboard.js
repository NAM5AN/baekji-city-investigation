(() => {
  "use strict";

  const shell = window.__BAEKJI_ADMIN_SHELL__;
  if (!shell) return;
  const panel = document.querySelector("[data-admin-panel]");
  const connection = document.querySelector("[data-admin-connection]");
  const worldMeta = document.querySelector("[data-admin-world-meta]");
  const DATA = window.DAY1_DATA || { places: {}, variants: {}, meta: {} };

  let currentTab = shell.tabs.get();
  let payload = shell.snapshot.latest();

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const unique = (values) => [...new Set(Array.isArray(values) ? values : [])];
  const values = (object) => Object.values(object && typeof object === "object" ? object : {});

  function profileMap(directory = []) {
    return new Map((Array.isArray(directory) ? directory : []).map((entry) => [String(entry.id), entry]));
  }

  function profileFor(directory, id) {
    const entry = profileMap(directory).get(String(id));
    return entry || { id: String(id || ""), name: String(id || "알 수 없음"), profilePhoto: "" };
  }

  function placeFor(nodeId) {
    return DATA.places?.[nodeId] || null;
  }

  function detailFor(nodeId, detailId) {
    return placeFor(nodeId)?.details?.find?.((detail) => detail.id === detailId) || null;
  }

  function nodeName(nodeId) {
    if (!nodeId) return "위치 미상";
    if (nodeId === "E_ENTRY") return "해오름역 구역 입구";
    return placeFor(nodeId)?.name || nodeId;
  }

  function sessionScope(session) {
    if (!session) return { key: "none", title: "세션 없음", kind: "none" };
    if (session.movement) {
      const from = session.movement.fromNode || session.currentNode;
      const to = session.movement.targetNode;
      return { key: `route:${from}:${to}`, title: `${nodeName(from)} → ${nodeName(to)} 이동 중`, kind: "route" };
    }
    if (session.activeEncounter) {
      const from = session.activeEncounter.fromNode || session.currentNode;
      const to = session.activeEncounter.targetNode;
      return { key: `route:${from}:${to}`, title: `${nodeName(from)} → ${nodeName(to)} 위험 구간`, kind: "route" };
    }
    if (session.currentDetailId) {
      const detail = detailFor(session.currentNode, session.currentDetailId);
      return { key: `detail:${session.currentNode}:${session.currentDetailId}`, title: `${nodeName(session.currentNode)} · ${detail?.name || session.currentDetailId}`, kind: "detail" };
    }
    return { key: `node:${session.currentNode}`, title: nodeName(session.currentNode), kind: "node" };
  }

  function activeSessions(state) {
    return values(state?.sessions).filter((session) => ["ACTIVE", "BRIEFING"].includes(session?.status));
  }

  function partyForSession(state, session) {
    return session?.partyId ? state?.parties?.[session.partyId] || null : values(state?.parties).find((party) => party?.sessionId === session?.id) || null;
  }

  function sessionForCharacter(state, character) {
    if (character?.currentSessionId && state?.sessions?.[character.currentSessionId]) return state.sessions[character.currentSessionId];
    return activeSessions(state).find((session) => session?.memberIds?.includes(character?.id)) || null;
  }

  function partyForCharacter(state, character) {
    if (character?.currentPartyId && state?.parties?.[character.currentPartyId]) return state.parties[character.currentPartyId];
    return values(state?.parties).find((party) => party?.memberIds?.includes(character?.id)) || null;
  }

  function contaminationClass(value) {
    const amount = Number(value || 0);
    if (amount >= 60) return "high";
    if (amount >= 25) return "mid";
    return "";
  }

  function locationGroups(state) {
    const groups = new Map();
    activeSessions(state).forEach((session) => {
      const scope = sessionScope(session);
      if (!groups.has(scope.key)) groups.set(scope.key, { ...scope, sessions: [], memberIds: [] });
      const group = groups.get(scope.key);
      group.sessions.push(session);
      group.memberIds.push(...(session.memberIds || []));
    });
    return [...groups.values()].map((group) => ({ ...group, memberIds: unique(group.memberIds) }));
  }

  function flattenLogs(state) {
    const output = [];
    values(state?.sessions).forEach((session) => {
      const party = partyForSession(state, session);
      const scope = sessionScope(session);
      (session.logs || []).forEach((entry) => output.push({
        ...entry,
        sessionId: session.id,
        partyId: party?.id || session.partyId || "",
        partyName: party?.name || "조사조",
        scopeTitle: scope.title,
        variant: session.variant || "",
      }));
    });
    return output.sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
  }

  function snapshotStats(state) {
    const sessions = activeSessions(state);
    const partyIds = unique(sessions.map((session) => session.partyId).filter(Boolean));
    const activeCharacterIds = unique(sessions.flatMap((session) => session.memberIds || []));
    const contaminated = values(state?.characters).filter((character) => Number(character?.contamination || 0) > 0).length;
    return {
      sessions: sessions.length,
      parties: partyIds.length || sessions.length,
      characters: activeCharacterIds.length,
      occupiedScopes: locationGroups(state).length,
      contaminated,
    };
  }

  function avatar(directory, id) {
    const profile = profileFor(directory, id);
    const initial = Array.from(profile.name || "?")[0] || "?";
    return profile.profilePhoto
      ? `<span class="admin-avatar"><img src="${esc(profile.profilePhoto)}" alt="" /></span>`
      : `<span class="admin-avatar">${esc(initial)}</span>`;
  }

  function sectionHead(title, copy = "") {
    return `<div class="admin-section-head"><div><h1>${esc(title)}</h1>${copy ? `<p>${esc(copy)}</p>` : ""}</div><button type="button" class="admin-refresh" data-admin-refresh>새로고침</button></div>`;
  }

  function kpis(state) {
    const stats = snapshotStats(state);
    return `<div class="admin-kpis">
      <div class="admin-kpi"><span>활성 조사조</span><strong>${stats.parties}</strong><small>진행/브리핑 세션 기준</small></div>
      <div class="admin-kpi"><span>활동 캐릭터</span><strong>${stats.characters}</strong><small>활성 세션 참여 인원</small></div>
      <div class="admin-kpi"><span>점유 현장</span><strong>${stats.occupiedScopes}</strong><small>구역·세부장소·이동구간</small></div>
      <div class="admin-kpi"><span>오염 감지</span><strong>${stats.contaminated}</strong><small>오염도 1% 이상 캐릭터</small></div>
    </div>`;
  }

  function renderOverview(state, directory) {
    const groups = locationGroups(state);
    const sessions = activeSessions(state);
    const locations = groups.slice(0, 12).map((group) => `<div class="admin-mini-row" data-admin-detail="zone" data-admin-id="${esc(group.key)}"><div class="admin-mini-main"><strong>${esc(group.title)}</strong><small>${group.sessions.length}개 조사조</small></div><span class="admin-mini-value">${group.memberIds.length}명</span></div>`).join("") || `<div class="admin-empty"><p>현재 점유 중인 현장이 없습니다.</p></div>`;
    const parties = sessions.slice(0, 12).map((session) => {
      const party = partyForSession(state, session);
      return `<div class="admin-mini-row" data-admin-detail="party" data-admin-id="${esc(party?.id || session.partyId || session.id)}"><div class="admin-mini-main"><strong>${esc(party?.name || "조사조")}</strong><small>${esc(sessionScope(session).title)}</small></div><span class="admin-mini-value">${session.memberIds?.length || 0}명</span></div>`;
    }).join("") || `<div class="admin-empty"><p>활성 조사조가 없습니다.</p></div>`;
    return `${sectionHead("전체 현황", "현재 세계 상태를 요약합니다. 세부 정보는 항목을 클릭해 팝업으로 확인합니다.")}${kpis(state)}<div class="admin-overview-grid"><section class="admin-overview-block"><header><strong>현재 점유 현장</strong><span>클릭하여 상세 보기</span></header><div class="admin-mini-list">${locations}</div></section><section class="admin-overview-block"><header><strong>진행 중 조사조</strong><span>클릭하여 상세 보기</span></header><div class="admin-mini-list">${parties}</div></section></div>`;
  }

  function renderZones(state) {
    const occupied = new Map(locationGroups(state).map((group) => [group.key, group]));
    const placeCards = values(DATA.places).sort((a, b) => Number(a.order || 0) - Number(b.order || 0)).map((place) => {
      const group = occupied.get(`node:${place.id}`);
      return `<article class="admin-card" data-admin-detail="zone" data-admin-id="node:${esc(place.id)}"><div class="admin-card-top"><h3>${esc(place.name)}</h3><span class="admin-pill ${group ? "good" : ""}">${group ? `${group.memberIds.length}명` : "비어 있음"}</span></div><p>${esc(place.floor || place.floorId || "해오름역")}</p><div class="admin-card-meta"><span class="admin-pill">${group?.sessions.length || 0}개 조</span><span class="admin-pill blue">${esc(place.id)}</span></div></article>`;
    }).join("");
    const special = [...occupied.values()].filter((group) => group.kind !== "node").map((group) => `<article class="admin-card" data-admin-detail="zone" data-admin-id="${esc(group.key)}"><div class="admin-card-top"><h3>${esc(group.title)}</h3><span class="admin-pill warn">${group.memberIds.length}명</span></div><p>현재 구역 내부의 세부 현장 또는 이동 구간입니다.</p><div class="admin-card-meta"><span class="admin-pill">${group.sessions.length}개 조</span><span class="admin-pill warn">${group.kind === "route" ? "이동/위험" : "세부 장소"}</span></div></article>`).join("");
    return `${sectionHead("구역", "전체 구역을 빠르게 훑고, 점유 중인 곳을 팝업으로 확인합니다.")}<div class="admin-panel-scroll"><div class="admin-grid">${special}${placeCards}</div></div>`;
  }

  function renderParties(state) {
    const cards = values(state?.parties).filter((party) => party?.memberIds?.length || party?.sessionId).map((party) => {
      const session = party.sessionId ? state.sessions?.[party.sessionId] : null;
      const scope = sessionScope(session);
      return `<article class="admin-card" data-admin-detail="party" data-admin-id="${esc(party.id)}"><div class="admin-card-top"><h3>${esc(party.name || party.id)}</h3><span class="admin-pill ${session?.status === "ACTIVE" ? "good" : ""}">${esc(session?.status || party.status || "대기")}</span></div><p>${esc(scope.title)}</p><div class="admin-card-meta"><span class="admin-pill">${party.memberIds?.length || 0}명</span>${session?.activeEncounter ? `<span class="admin-pill danger">돌발 상황</span>` : ""}${session?.movement ? `<span class="admin-pill warn">이동 중</span>` : ""}</div></article>`;
    }).join("") || `<div class="admin-empty"><p>표시할 조사조가 없습니다.</p></div>`;
    return `${sectionHead("조사조", "조별 현재 위치와 진행 상태를 확인합니다.")}<div class="admin-panel-scroll"><div class="admin-grid">${cards}</div></div>`;
  }

  function renderCharacters(state, directory) {
    const cards = values(state?.characters).map((character) => {
      const profile = profileFor(directory, character.id);
      const session = sessionForCharacter(state, character);
      const party = partyForCharacter(state, character);
      return `<article class="admin-card" data-admin-detail="character" data-admin-id="${esc(character.id)}"><div class="admin-character-row">${avatar(directory, character.id)}<div class="admin-mini-main"><strong>${esc(profile.name)}</strong><small>${esc(party?.name || "조사조 없음")} · ${esc(sessionScope(session).title)}</small></div><span class="admin-contamination ${contaminationClass(character.contamination)}">${Number(character.contamination || 0)}%</span></div><div class="admin-card-meta"><span class="admin-pill">${esc(character.symptom || "안정")}</span><span class="admin-pill">소지품 ${values(character.inventory).reduce((sum, item) => sum + Number(item?.quantity || 0), 0)}개</span></div></article>`;
    }).join("") || `<div class="admin-empty"><p>표시할 캐릭터가 없습니다.</p></div>`;
    return `${sectionHead("캐릭터", "핵심 상태만 목록에 표시하고, 소지품과 세부 상태는 팝업에서 확인합니다.")}<div class="admin-panel-scroll"><div class="admin-grid">${cards}</div></div>`;
  }

  function renderLogs(state, directory) {
    const logs = flattenLogs(state);
    const partyOptions = unique(logs.map((entry) => entry.partyId).filter(Boolean)).map((id) => `<option value="${esc(id)}">${esc(logs.find((entry) => entry.partyId === id)?.partyName || id)}</option>`).join("");
    const typeOptions = unique(logs.map((entry) => entry.type).filter(Boolean)).sort().map((type) => `<option value="${esc(type)}">${esc(type)}</option>`).join("");
    return `${sectionHead("로그", "조사 세션에 남은 채팅·행동·SYSTEM 기록을 한곳에서 조회합니다.")}<div class="admin-log-tools"><select data-log-party><option value="">전체 조사조</option>${partyOptions}</select><select data-log-type><option value="">전체 종류</option>${typeOptions}</select><input data-log-search placeholder="로그 내용 검색" /></div><div class="admin-log-list" data-admin-log-list>${logRows(logs, directory)}</div>`;
  }

  function logRows(logs, directory) {
    return logs.map((entry) => {
      const actor = entry.actorId ? profileFor(directory, entry.actorId).name : "SYSTEM";
      const time = Number(entry.at) ? new Date(entry.at).toLocaleString("ko-KR", { hour12: false }) : "시간 없음";
      return `<article class="admin-log-row" data-log-party-id="${esc(entry.partyId)}" data-log-type-id="${esc(entry.type)}" data-log-search-text="${esc(`${entry.text || ""} ${actor} ${entry.partyName || ""} ${entry.scopeTitle || ""}`.toLowerCase())}"><header><span class="admin-log-type">${esc(entry.type || "log")}</span><span>${esc(time)}</span><span>${esc(entry.partyName)}</span><span>${esc(entry.scopeTitle)}</span></header><p><strong>${esc(actor)}</strong> · ${esc(entry.text || "")}</p></article>`;
    }).join("") || `<div class="admin-empty"><p>저장된 로그가 없습니다.</p></div>`;
  }

  function renderLocked(code) {
    const messages = {
      ADMIN_AUTH_NOT_CONFIGURED: "관리자 인증 환경이 아직 연결되지 않았습니다. MVP 1 화면과 읽기 API는 만들어졌지만 실제 세계 데이터는 관리자 인증이 완성될 때까지 차단됩니다.",
      ADMIN_SESSION_REQUIRED: "관리자 세션이 필요합니다. 다음 MVP에서 기존 조사 로그인과 관리자 계정을 연결합니다.",
      ADMIN_SESSION_INVALID: "관리자 세션을 확인할 수 없습니다.",
      ADMIN_SESSION_EXPIRED: "관리자 세션이 만료되었습니다.",
    };
    if (connection) {
      const setup = Number(payload?.status || 0) === 503 || code === "HTTP_503" || code === "ADMIN_AUTH_NOT_CONFIGURED";
      connection.textContent = code === "ADMIN_SNAPSHOT_OFFLINE" ? "OFFLINE" : setup ? "SETUP" : "LOCKED";
      connection.style.color = "";
    }
    panel.innerHTML = `<div class="admin-locked"><div class="admin-locked-inner"><div class="admin-lock-icon">⌁</div><h2>관리자 데이터 잠금</h2><p>${esc(messages[code] || "관리자 관제 데이터를 불러올 수 없습니다.")}</p><code>${esc(code || "LOCKED")}</code></div></div>`;
  }

  function render() {
    if (!payload?.state) return renderLocked(payload?.code || "ADMIN_SESSION_REQUIRED");
    const state = payload.state;
    const directory = payload.directory || [];
    const view = currentTab === "zones" ? renderZones(state)
      : currentTab === "parties" ? renderParties(state)
      : currentTab === "characters" ? renderCharacters(state, directory)
      : currentTab === "logs" ? renderLogs(state, directory)
      : renderOverview(state, directory);
    panel.innerHTML = view;
    updateMeta();
  }

  function updateMeta() {
    if (!payload?.state) return;
    const stats = snapshotStats(payload.state);
    worldMeta.textContent = `DAY ${String(payload.state.storyDay || 1).padStart(2, "0")} · ${payload.state.loopId || "LOOP"} · ${stats.characters}명 활동`;
    connection.textContent = "READ ONLY";
    connection.style.color = "var(--green)";
  }

  function modal(title, subtitle, body) {
    shell.modal.render("dashboard", `<div class="admin-modal-backdrop" data-admin-modal-backdrop><section class="admin-modal" role="dialog" aria-modal="true"><header class="admin-modal-head"><div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div><button type="button" class="admin-modal-close" data-admin-modal-close aria-label="닫기">×</button></header><div class="admin-modal-body">${body}</div></section></div>`);
  }

  function openZoneDetail(key) {
    const state = payload.state;
    const group = locationGroups(state).find((entry) => entry.key === key);
    const nodeId = key.startsWith("node:") ? key.slice(5) : "";
    const place = nodeId ? placeFor(nodeId) : null;
    if (!group && !place) return;
    const sessions = group?.sessions || [];
    const parties = sessions.map((session) => {
      const party = partyForSession(state, session);
      return `<div class="admin-inventory-item" data-admin-detail="party" data-admin-id="${esc(party?.id || session.partyId || session.id)}"><span><strong>${esc(party?.name || "조사조")}</strong><br><small>${session.memberIds?.length || 0}명 · ${esc(session.status || "")}</small></span><small>상세 보기 ›</small></div>`;
    }).join("") || `<p style="color:var(--muted);font-size:10px">현재 이곳에 조사조가 없습니다.</p>`;
    const characters = unique(sessions.flatMap((session) => session.memberIds || [])).map((id) => {
      const character = state.characters?.[id] || { id, contamination: 0 };
      const profile = profileFor(payload.directory, id);
      return `<div class="admin-inventory-item" data-admin-detail="character" data-admin-id="${esc(id)}"><span>${esc(profile.name)}</span><small>오염 ${Number(character.contamination || 0)}%</small></div>`;
    }).join("");
    modal(group?.title || place?.name || key, place?.floor || (group?.kind === "route" ? "이동/위험 구간" : "현재 현장"), `<div class="admin-detail-grid"><div class="admin-detail"><span>조사조</span><strong>${sessions.length}개</strong></div><div class="admin-detail"><span>현재 인원</span><strong>${group?.memberIds.length || 0}명</strong></div>${place ? `<div class="admin-detail full"><span>구역 ID</span><strong>${esc(place.id)}</strong></div>` : ""}</div><h3 class="admin-subtitle">조사조</h3><div class="admin-inventory">${parties}</div>${characters ? `<h3 class="admin-subtitle">캐릭터</h3><div class="admin-inventory">${characters}</div>` : ""}`);
  }

  function openPartyDetail(partyId) {
    const state = payload.state;
    const party = state.parties?.[partyId] || values(state.parties).find((candidate) => candidate.sessionId === partyId);
    if (!party) return;
    const session = party.sessionId ? state.sessions?.[party.sessionId] : null;
    const members = (party.memberIds || []).map((id) => {
      const profile = profileFor(payload.directory, id);
      const character = state.characters?.[id] || {};
      return `<div class="admin-inventory-item" data-admin-detail="character" data-admin-id="${esc(id)}"><span>${esc(profile.name)}${party.creatorId === id ? " · 조장" : ""}</span><small>오염 ${Number(character.contamination || 0)}% ›</small></div>`;
    }).join("") || `<p style="color:var(--muted);font-size:10px">조원이 없습니다.</p>`;
    modal(party.name || party.id, sessionScope(session).title, `<div class="admin-detail-grid"><div class="admin-detail"><span>조 상태</span><strong>${esc(party.status || "")}</strong></div><div class="admin-detail"><span>세션 상태</span><strong>${esc(session?.status || "세션 없음")}</strong></div><div class="admin-detail"><span>인원</span><strong>${party.memberIds?.length || 0}명</strong></div><div class="admin-detail"><span>시간 변주</span><strong>${esc(session?.variant || "-")}</strong></div><div class="admin-detail"><span>이동</span><strong>${session?.movement ? "이동 중" : "정지"}</strong></div><div class="admin-detail"><span>돌발 상황</span><strong>${session?.activeEncounter ? "진행 중" : "없음"}</strong></div></div><h3 class="admin-subtitle">조원</h3><div class="admin-inventory">${members}</div>`);
  }

  function openCharacterDetail(id) {
    const state = payload.state;
    const character = state.characters?.[id];
    if (!character) return;
    const profile = profileFor(payload.directory, id);
    const party = partyForCharacter(state, character);
    const session = sessionForCharacter(state, character);
    const items = values(character.inventory).map((item) => `<div class="admin-inventory-item"><span><strong>${esc(item?.name || item?.id || "소지품")}</strong><br><small>${esc(item?.state || "상태 정보 없음")}</small></span><small>×${Number(item?.quantity || 0)}</small></div>`).join("") || `<p style="color:var(--muted);font-size:10px">소지품 없음</p>`;
    modal(profile.name, `${party?.name || "조사조 없음"} · ${sessionScope(session).title}`, `<div class="admin-detail-grid"><div class="admin-detail"><span>오염도</span><strong>${Number(character.contamination || 0)}%</strong></div><div class="admin-detail"><span>증상</span><strong>${esc(character.symptom || "안정")}</strong></div><div class="admin-detail"><span>조사조</span><strong>${esc(party?.name || "없음")}</strong></div><div class="admin-detail"><span>세션</span><strong>${esc(session?.status || "없음")}</strong></div><div class="admin-detail full"><span>현재 위치</span><strong>${esc(sessionScope(session).title)}</strong></div></div><h3 class="admin-subtitle">소지품</h3><div class="admin-inventory">${items}</div>`);
  }

  function openDetail(kind, id) {
    if (!payload?.state) return;
    if (kind === "zone") return openZoneDetail(id);
    if (kind === "party") return openPartyDetail(id);
    if (kind === "character") return openCharacterDetail(id);
  }

  function applyLogFilters() {
    const party = document.querySelector("[data-log-party]")?.value || "";
    const type = document.querySelector("[data-log-type]")?.value || "";
    const query = String(document.querySelector("[data-log-search]")?.value || "").trim().toLowerCase();
    document.querySelectorAll(".admin-log-row").forEach((row) => {
      const matchParty = !party || row.dataset.logPartyId === party;
      const matchType = !type || row.dataset.logTypeId === type;
      const matchQuery = !query || String(row.dataset.logSearchText || "").includes(query);
      row.hidden = !(matchParty && matchType && matchQuery);
    });
  }

  async function loadSnapshot() {
    connection.textContent = "SYNC";
    payload = await shell.snapshot.refresh();
  }

  shell.onCaptureClick((event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const tab = target.closest("[data-admin-tab]");
    if (tab && shell.tabs.set(tab.dataset.adminTab)) return;
    if (target.closest("[data-admin-refresh]")) return void loadSnapshot();
    const detail = target.closest("[data-admin-detail]");
    if (detail) return openDetail(detail.dataset.adminDetail, detail.dataset.adminId);
  });

  document.addEventListener("input", (event) => {
    if (event.target?.matches?.("[data-log-search]")) applyLogFilters();
  });
  document.addEventListener("change", (event) => {
    if (event.target?.matches?.("[data-log-party], [data-log-type]")) applyLogFilters();
  });
  shell.tabs.subscribe((tab) => { currentTab = tab; render(); });
  shell.snapshot.subscribe((next) => { payload = next; render(); });

  window.__BAEKJI_ADMIN_DASHBOARD_TEST__ = Object.freeze({
    sessionScope,
    activeSessions,
    locationGroups,
    flattenLogs,
    snapshotStats,
    contaminationClass,
  });

  renderLocked("ADMIN_SESSION_REQUIRED");
  loadSnapshot();
})();
