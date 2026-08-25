(() => {
  "use strict";

  const shell = window.__BAEKJI_ADMIN_SHELL__;
  const DATA = window.DAY1_DATA || { places: {}, variants: {}, meta: {} };
  const modalRoot = shell?.modal.root();
  const tabs = document.querySelector(".admin-tabs");
  if (!modalRoot || !tabs || window.__BAEKJI_ADMIN_OBSERVATION_MVP2__) return;

  let payload = null;
  let unsubscribeSnapshot = null;
  let currentView = null;
  let historyStack = [];

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const values = (object) => Object.values(object && typeof object === "object" ? object : {});
  const unique = (items) => [...new Set(Array.isArray(items) ? items : [])];

  function profileMap(directory = []) {
    return new Map((Array.isArray(directory) ? directory : []).map((entry) => [String(entry.id), entry]));
  }

  function profileFor(directory, id) {
    return profileMap(directory).get(String(id)) || {
      id: String(id || ""),
      name: String(id || "알 수 없음"),
      profilePhoto: "",
    };
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
    if (!session) return { key: "none", title: "세션 없음", kind: "none", nodeId: "" };
    if (session.movement) {
      const from = session.movement.fromNode || session.currentNode;
      const to = session.movement.targetNode;
      return { key: `route:${from}:${to}`, title: `${nodeName(from)} → ${nodeName(to)} 이동 중`, kind: "route", nodeId: from, targetNodeId: to };
    }
    if (session.activeEncounter) {
      const from = session.activeEncounter.fromNode || session.currentNode;
      const to = session.activeEncounter.targetNode;
      return { key: `route:${from}:${to}`, title: `${nodeName(from)} → ${nodeName(to)} 위험 구간`, kind: "route", nodeId: from, targetNodeId: to };
    }
    if (session.currentDetailId) {
      const detail = detailFor(session.currentNode, session.currentDetailId);
      return { key: `detail:${session.currentNode}:${session.currentDetailId}`, title: `${nodeName(session.currentNode)} · ${detail?.name || session.currentDetailId}`, kind: "detail", nodeId: session.currentNode, detailId: session.currentDetailId };
    }
    return { key: `node:${session.currentNode}`, title: nodeName(session.currentNode), kind: "node", nodeId: session.currentNode };
  }

  function activeSessions(state) {
    return values(state?.sessions).filter((session) => ["ACTIVE", "BRIEFING"].includes(session?.status));
  }

  function partyForSession(state, session) {
    return session?.partyId ? state?.parties?.[session.partyId] || null
      : values(state?.parties).find((party) => party?.sessionId === session?.id) || null;
  }

  function partyForCharacter(state, character) {
    if (character?.currentPartyId && state?.parties?.[character.currentPartyId]) return state.parties[character.currentPartyId];
    return values(state?.parties).find((party) => party?.memberIds?.includes(character?.id)) || null;
  }

  function sessionForCharacter(state, character) {
    if (character?.currentSessionId && state?.sessions?.[character.currentSessionId]) return state.sessions[character.currentSessionId];
    return activeSessions(state).find((session) => session?.memberIds?.includes(character?.id)) || null;
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

  function floors() {
    const map = new Map();
    values(DATA.places).forEach((place) => {
      const id = String(place.floorId || "ETC");
      if (!map.has(id)) map.set(id, { id, name: String(place.floor || id), places: [] });
      map.get(id).places.push(place);
    });
    return [...map.values()].map((floor) => ({
      ...floor,
      places: floor.places.sort((a, b) => Number(a.order || 0) - Number(b.order || 0)),
    }));
  }

  function allLogs(state) {
    const result = [];
    values(state?.sessions).forEach((session) => {
      const party = partyForSession(state, session);
      (session.logs || []).forEach((entry) => result.push({
        ...entry,
        sessionId: session.id,
        partyId: party?.id || session.partyId || "",
        partyName: party?.name || "조사조",
      }));
    });
    return result.sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
  }

  function avatar(directory, id, size = "normal") {
    const profile = profileFor(directory, id);
    const initial = Array.from(profile.name || "?")[0] || "?";
    return profile.profilePhoto
      ? `<span class="admin-observe-avatar ${size}"><img src="${esc(profile.profilePhoto)}" alt="" /></span>`
      : `<span class="admin-observe-avatar ${size}">${esc(initial)}</span>`;
  }

  function contaminationClass(value) {
    const amount = Number(value || 0);
    if (amount >= 60) return "high";
    if (amount >= 25) return "mid";
    return "";
  }

  function inventoryItems(character) {
    return values(character?.inventory).filter((item) => Number(item?.quantity || 0) > 0);
  }

  function hazardSummary(session) {
    const encounter = session?.activeEncounter;
    if (!encounter) return null;
    const hazards = Array.isArray(encounter.hazards) ? encounter.hazards : [];
    const index = Math.max(0, Number(encounter.currentIndex || 0));
    const current = hazards[index] || "";
    return {
      overview: String(encounter.overview || "돌발 위험 진행 중"),
      current,
      currentName: DATA.hazardTemplates?.[current]?.name || current || "위험",
      remaining: Math.max(0, hazards.length - index),
      total: hazards.length,
      observations: Array.isArray(encounter.flexInsights) ? encounter.flexInsights.slice(-6) : [],
      fromNode: encounter.fromNode || session.currentNode,
      targetNode: encounter.targetNode || "",
    };
  }

  function recentLogRows(logs, directory, limit = 24) {
    const list = (Array.isArray(logs) ? logs : []).slice(0, limit);
    if (!list.length) return `<div class="admin-observe-empty">표시할 로그가 없습니다.</div>`;
    return `<div class="admin-observe-log-list">${list.map((entry) => {
      const actor = entry.actorId ? profileFor(directory, entry.actorId).name : "SYSTEM";
      const time = Number(entry.at) ? new Date(entry.at).toLocaleTimeString("ko-KR", { hour12: false }) : "--:--";
      return `<article class="admin-observe-log"><header><span>${esc(time)}</span><strong>${esc(entry.type || "log")}</strong>${entry.partyName ? `<span>${esc(entry.partyName)}</span>` : ""}</header><p><b>${esc(actor)}</b> · ${esc(entry.text || "")}</p></article>`;
    }).join("")}</div>`;
  }

  function viewLabel(view) {
    const state = payload?.state;
    if (!state || !view) return "관찰";
    if (view.kind === "navigator") return "전체 구역";
    if (view.kind === "zone") {
      const group = locationGroups(state).find((entry) => entry.key === view.id);
      const nodeId = String(view.id || "").startsWith("node:") ? String(view.id).slice(5) : "";
      return group?.title || placeFor(nodeId)?.name || view.id;
    }
    if (view.kind === "party") return state.parties?.[view.id]?.name || view.id;
    if (view.kind === "character") return profileFor(payload.directory, view.id).name;
    return view.id || "관찰";
  }

  function crumbs() {
    const views = [...historyStack, currentView].filter(Boolean);
    return `<div class="admin-observe-breadcrumbs">${views.map((view, index) => `<button type="button" data-observe-crumb-index="${index}">${esc(viewLabel(view))}</button>${index < views.length - 1 ? `<span>›</span>` : ""}`).join("")}</div>`;
  }

  function modalFrame(title, subtitle, tabsMarkup, body) {
    shell.modal.render("observation", `<div class="admin-modal-backdrop admin-observe-backdrop" data-admin-modal-backdrop>
      <section class="admin-modal admin-observe-modal" role="dialog" aria-modal="true">
        <header class="admin-modal-head admin-observe-head">
          <div class="admin-observe-head-main">
            <div class="admin-observe-head-row">${historyStack.length ? `<button type="button" class="admin-observe-back" data-observe-back>← 뒤로</button>` : ""}<div><h2>${esc(title)}</h2>${subtitle ? `<p>${esc(subtitle)}</p>` : ""}</div></div>
            ${crumbs()}
          </div>
          <button type="button" class="admin-modal-close" data-admin-modal-close aria-label="닫기">×</button>
        </header>
        ${tabsMarkup || ""}
        <div class="admin-modal-body admin-observe-body">${body}</div>
      </section>
    </div>`);
  }

  function modalTabs(active, items) {
    return `<nav class="admin-observe-modal-tabs">${items.map(([id, label]) => `<button type="button" class="${active === id ? "active" : ""}" data-observe-modal-tab="${id}">${esc(label)}</button>`).join("")}</nav>`;
  }

  function navigate(kind, id, { replace = false, reset = false, tab = "summary" } = {}) {
    if (reset) historyStack = [];
    if (currentView && !replace && !reset) historyStack.push({ ...currentView });
    currentView = { kind, id: String(id || ""), tab };
    renderCurrentView();
  }

  function goBack() {
    const previous = historyStack.pop();
    if (!previous) return;
    currentView = previous;
    renderCurrentView();
  }

  function renderNavigator() {
    const state = payload?.state;
    if (!state) return modalFrame("관찰 이동", "관리자 데이터 연결 대기", "", `<div class="admin-observe-empty">관제 데이터를 불러오는 중입니다.</div>`);
    const groups = locationGroups(state);
    const occupied = new Map(groups.map((group) => [group.key, group]));
    const floorSections = floors().map((floor) => `<section class="admin-observe-floor">
      <header><div><strong>${esc(floor.name)}</strong><small>${floor.places.length}개 구역</small></div><span>${floor.places.reduce((sum, place) => sum + (occupied.get(`node:${place.id}`)?.memberIds.length || 0), 0)}명</span></header>
      <div class="admin-observe-place-grid">${floor.places.map((place) => {
        const group = occupied.get(`node:${place.id}`);
        return `<button type="button" class="admin-observe-place ${group ? "occupied" : ""}" data-observe-jump="zone" data-observe-id="node:${esc(place.id)}"><span><strong>${esc(place.name)}</strong><small>${esc(place.id)}</small></span><b>${group ? `${group.sessions.length}조 · ${group.memberIds.length}명` : "비어 있음"}</b></button>`;
      }).join("")}</div>
    </section>`).join("");
    const specialGroups = groups.filter((group) => group.kind !== "node");
    const special = specialGroups.length ? `<section class="admin-observe-floor"><header><div><strong>이동·세부 현장</strong><small>현재 조사조가 실제로 머무는 분기</small></div><span>${specialGroups.length}곳</span></header><div class="admin-observe-place-grid">${specialGroups.map((group) => `<button type="button" class="admin-observe-place occupied special" data-observe-jump="zone" data-observe-id="${esc(group.key)}"><span><strong>${esc(group.title)}</strong><small>${esc(group.kind === "route" ? "이동/위험 구간" : "세부 조사 위치")}</small></span><b>${group.sessions.length}조 · ${group.memberIds.length}명</b></button>`).join("")}</div></section>` : "";
    modalFrame("전체 구역 · 분기 관찰", `DAY ${state.storyDay || 1} · ${state.loopId || "LOOP"}`, "", `<div class="admin-observe-navigator">${special}${floorSections}</div>`);
  }

  function zoneContext(key) {
    const state = payload.state;
    const group = locationGroups(state).find((entry) => entry.key === key) || null;
    const nodeId = key.startsWith("node:") ? key.slice(5) : (group?.nodeId || "");
    const place = nodeId ? placeFor(nodeId) : null;
    return { state, group, nodeId, place, sessions: group?.sessions || [] };
  }

  function zoneLogs(sessions) {
    const ids = new Set((sessions || []).map((session) => String(session.id)));
    return allLogs(payload.state).filter((entry) => ids.has(String(entry.sessionId)));
  }

  function renderZone() {
    const { group, place, sessions } = zoneContext(currentView.id);
    if (!group && !place) return renderNavigator();
    const tab = currentView.tab || "summary";
    const title = group?.title || place?.name || currentView.id;
    const subtitle = place?.floor || (group?.kind === "route" ? "이동/위험 구간" : "현재 현장");
    let body = "";
    if (tab === "people") {
      const partyRows = sessions.map((session) => {
        const party = partyForSession(payload.state, session);
        return `<button type="button" class="admin-observe-row" data-observe-jump="party" data-observe-id="${esc(party?.id || session.partyId || session.id)}"><span><strong>${esc(party?.name || "조사조")}</strong><small>${esc(sessionScope(session).title)} · ${esc(session.status || "")}</small></span><b>${session.memberIds?.length || 0}명 ›</b></button>`;
      }).join("") || `<div class="admin-observe-empty">현재 조사조가 없습니다.</div>`;
      const characterIds = unique(sessions.flatMap((session) => session.memberIds || []));
      const characters = characterIds.map((id) => {
        const character = payload.state.characters?.[id] || {};
        const profile = profileFor(payload.directory, id);
        return `<button type="button" class="admin-observe-person" data-observe-jump="character" data-observe-id="${esc(id)}">${avatar(payload.directory, id)}<span><strong>${esc(profile.name)}</strong><small>${esc(partyForCharacter(payload.state, character)?.name || "조사조 없음")}</small></span><b class="${contaminationClass(character.contamination)}">${Number(character.contamination || 0)}%</b></button>`;
      }).join("") || `<div class="admin-observe-empty">현재 캐릭터가 없습니다.</div>`;
      body = `<div class="admin-observe-section"><h3>현재 조사조</h3>${partyRows}</div><div class="admin-observe-section"><h3>현재 캐릭터</h3><div class="admin-observe-people">${characters}</div></div>`;
    } else if (tab === "logs") {
      body = recentLogRows(zoneLogs(sessions), payload.directory, 30);
    } else {
      const hazards = sessions.filter((session) => session.activeEncounter);
      const moving = sessions.filter((session) => session.movement);
      const details = place?.details || [];
      body = `<div class="admin-observe-summary-grid">
        <div><span>조사조</span><strong>${sessions.length}개</strong></div>
        <div><span>현재 인원</span><strong>${group?.memberIds.length || 0}명</strong></div>
        <div><span>이동 중</span><strong>${moving.length}개 조</strong></div>
        <div><span>돌발 상황</span><strong class="${hazards.length ? "danger" : ""}">${hazards.length ? `${hazards.length}개 조` : "없음"}</strong></div>
      </div>
      ${place ? `<div class="admin-observe-description"><strong>${esc(place.name)}</strong><p>${esc(place.environment || `${place.floor || "해오름역"}의 조사 구역입니다.`)}</p></div>` : ""}
      ${hazards.length ? `<div class="admin-observe-alert"><strong>돌발 상황 감지</strong>${hazards.map((session) => { const hz = hazardSummary(session); const party = partyForSession(payload.state, session); return `<button type="button" data-observe-jump="party" data-observe-id="${esc(party?.id || session.partyId || session.id)}"><span>${esc(party?.name || "조사조")}</span><b>${esc(hz?.currentName || "위험")} · ${hz?.remaining || 0}단계 남음 ›</b></button>`; }).join("")}</div>` : ""}
      ${details.length ? `<div class="admin-observe-section"><h3>세부 조사 포인트</h3><div class="admin-observe-detail-points">${details.map((detail) => `<div><strong>${esc(detail.name)}</strong><small>${esc(detail.environment || detail.prompt || "")}</small></div>`).join("")}</div></div>` : ""}
      <div class="admin-observe-actions"><button type="button" data-observe-open-navigator>다른 구역 바로 관찰</button></div>`;
    }
    modalFrame(title, subtitle, modalTabs(tab, [["summary", "현황"], ["people", "조사조·인원"], ["logs", "최근 로그"]]), body);
  }

  function partyContext(id) {
    const state = payload.state;
    const party = state.parties?.[id] || values(state.parties).find((candidate) => candidate.sessionId === id) || null;
    const session = party?.sessionId ? state.sessions?.[party.sessionId] : values(state.sessions).find((candidate) => candidate.partyId === party?.id) || null;
    return { state, party, session };
  }

  function renderParty() {
    const { party, session } = partyContext(currentView.id);
    if (!party) return renderNavigator();
    const tab = currentView.tab || "summary";
    const scope = sessionScope(session);
    let body = "";
    if (tab === "people") {
      const members = (party.memberIds || []).map((id) => {
        const profile = profileFor(payload.directory, id);
        const character = payload.state.characters?.[id] || {};
        return `<button type="button" class="admin-observe-person" data-observe-jump="character" data-observe-id="${esc(id)}">${avatar(payload.directory, id)}<span><strong>${esc(profile.name)}${party.creatorId === id ? " · 조장" : ""}</strong><small>${esc(character.symptom || "안정")} · 소지품 ${inventoryItems(character).reduce((sum, item) => sum + Number(item.quantity || 0), 0)}개</small></span><b class="${contaminationClass(character.contamination)}">${Number(character.contamination || 0)}%</b></button>`;
      }).join("") || `<div class="admin-observe-empty">조원이 없습니다.</div>`;
      body = `<div class="admin-observe-people">${members}</div>`;
    } else if (tab === "logs") {
      const logs = (session?.logs || []).map((entry) => ({ ...entry, partyName: party.name || party.id })).sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
      body = recentLogRows(logs, payload.directory, 40);
    } else {
      const hazard = hazardSummary(session);
      body = `<div class="admin-observe-summary-grid">
        <div><span>조 상태</span><strong>${esc(party.status || "-")}</strong></div>
        <div><span>세션 상태</span><strong>${esc(session?.status || "세션 없음")}</strong></div>
        <div><span>조원</span><strong>${party.memberIds?.length || 0}명</strong></div>
        <div><span>시간 변주</span><strong>${esc(String(session?.variant || "-").toUpperCase())}</strong></div>
        <div class="wide"><span>현재 위치</span><strong>${esc(scope.title)}</strong></div>
        <div><span>이동</span><strong>${session?.movement ? "이동 중" : "정지"}</strong></div>
        <div><span>돌발 상황</span><strong class="${session?.activeEncounter ? "danger" : ""}">${session?.activeEncounter ? "진행 중" : "없음"}</strong></div>
      </div>
      ${hazard ? `<div class="admin-observe-alert"><strong>${esc(hazard.currentName)}</strong><p>${esc(hazard.overview)}</p><small>${hazard.remaining}/${hazard.total} 단계 남음 · ${esc(nodeName(hazard.fromNode))} → ${esc(nodeName(hazard.targetNode))}</small>${hazard.observations.length ? `<div class="admin-observe-insights">${hazard.observations.map((note) => `<span>${esc(typeof note === "string" ? note : note?.text || note?.note || JSON.stringify(note))}</span>`).join("")}</div>` : ""}</div>` : ""}
      <div class="admin-observe-actions">${scope.key !== "none" ? `<button type="button" data-observe-jump="zone" data-observe-id="${esc(scope.key)}">현재 현장 보기</button>` : ""}<button type="button" data-observe-open-navigator>다른 구역 바로 관찰</button></div>`;
    }
    modalFrame(party.name || party.id, scope.title, modalTabs(tab, [["summary", "상황"], ["people", "조원"], ["logs", "조 로그"]]), body);
  }

  function renderCharacter() {
    const state = payload.state;
    const character = state.characters?.[currentView.id];
    if (!character) return renderNavigator();
    const profile = profileFor(payload.directory, currentView.id);
    const party = partyForCharacter(state, character);
    const session = sessionForCharacter(state, character);
    const scope = sessionScope(session);
    const tab = currentView.tab || "summary";
    let body = "";
    if (tab === "items") {
      const items = inventoryItems(character);
      body = items.length ? `<div class="admin-observe-items">${items.map((item) => `<article><div><strong>${esc(item?.name || item?.itemId || item?.id || "소지품")}</strong><small>${esc(item?.state || "상태 정보 없음")}</small></div><b>×${Number(item?.quantity || 0)}</b></article>`).join("")}</div>` : `<div class="admin-observe-empty">소지품이 없습니다.</div>`;
    } else if (tab === "logs") {
      const logs = allLogs(state).filter((entry) => String(entry.actorId || "") === String(character.id));
      body = recentLogRows(logs, payload.directory, 40);
    } else {
      body = `<div class="admin-observe-character-head">${avatar(payload.directory, character.id, "large")}<div><strong>${esc(profile.name)}</strong><small>${esc(party?.name || "조사조 없음")}</small></div><b class="${contaminationClass(character.contamination)}">오염 ${Number(character.contamination || 0)}%</b></div>
      <div class="admin-observe-summary-grid">
        <div><span>오염도</span><strong class="${contaminationClass(character.contamination)}">${Number(character.contamination || 0)}%</strong></div>
        <div><span>증상</span><strong>${esc(character.symptom || "안정")}</strong></div>
        <div><span>조사조</span><strong>${esc(party?.name || "없음")}</strong></div>
        <div><span>세션</span><strong>${esc(session?.status || "없음")}</strong></div>
        <div class="wide"><span>현재 위치</span><strong>${esc(scope.title)}</strong></div>
        <div><span>소지품 종류</span><strong>${inventoryItems(character).length}</strong></div>
        <div><span>총 소지 수량</span><strong>${inventoryItems(character).reduce((sum, item) => sum + Number(item.quantity || 0), 0)}</strong></div>
      </div>
      <div class="admin-observe-actions">${party ? `<button type="button" data-observe-jump="party" data-observe-id="${esc(party.id)}">${esc(party.name || "조사조")} 보기</button>` : ""}${scope.key !== "none" ? `<button type="button" data-observe-jump="zone" data-observe-id="${esc(scope.key)}">현재 현장 보기</button>` : ""}</div>`;
    }
    modalFrame(profile.name, `${party?.name || "조사조 없음"} · ${scope.title}`, modalTabs(tab, [["summary", "상태"], ["items", "소지품"], ["logs", "개인 행동 로그"]]), body);
  }

  function renderCurrentView() {
    if (!currentView) return;
    if (!payload?.state) return modalFrame("관찰", "관리자 데이터 연결 대기", "", `<div class="admin-observe-empty">관제 데이터를 불러오는 중입니다.</div>`);
    if (currentView.kind === "navigator") return renderNavigator();
    if (currentView.kind === "zone") return renderZone();
    if (currentView.kind === "party") return renderParty();
    if (currentView.kind === "character") return renderCharacter();
  }

  function installLaunchButton() {
    if (tabs.querySelector("[data-admin-observe-launch]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-observe-launch";
    button.dataset.adminObserveLaunch = "";
    button.textContent = "관찰 이동";
    tabs.append(button);
  }

  shell.onCaptureClick((event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const launch = target.closest("[data-admin-observe-launch]");
    if (launch) {
      event.preventDefault();
      event.stopImmediatePropagation();
      currentView = { kind: "navigator", id: "all", tab: "summary" };
      historyStack = [];
      renderCurrentView();
      return;
    }

    const jump = target.closest("[data-observe-jump]");
    if (jump) {
      event.preventDefault();
      event.stopImmediatePropagation();
      navigate(jump.dataset.observeJump, jump.dataset.observeId || "");
      return;
    }

    if (target.closest("[data-observe-open-navigator]")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      navigate("navigator", "all");
      return;
    }

    const back = target.closest("[data-observe-back]");
    if (back) {
      event.preventDefault();
      event.stopImmediatePropagation();
      goBack();
      return;
    }

    const crumb = target.closest("[data-observe-crumb-index]");
    if (crumb) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const index = Number(crumb.dataset.observeCrumbIndex);
      const views = [...historyStack, currentView];
      if (!Number.isInteger(index) || index < 0 || index >= views.length) return;
      currentView = { ...views[index] };
      historyStack = views.slice(0, index).map((view) => ({ ...view }));
      renderCurrentView();
      return;
    }

    const modalTab = target.closest("[data-observe-modal-tab]");
    if (modalTab && currentView) {
      event.preventDefault();
      event.stopImmediatePropagation();
      currentView = { ...currentView, tab: modalTab.dataset.observeModalTab };
      renderCurrentView();
      return;
    }

    // Replace MVP 1's shallow detail modal with the navigable MVP 2 observer.
    const legacyDetail = target.closest("[data-admin-detail]");
    if (legacyDetail && !target.closest(".admin-observe-modal")) {
      event.preventDefault();
      event.stopImmediatePropagation();
      currentView = {
        kind: legacyDetail.dataset.adminDetail === "zone" ? "zone" : legacyDetail.dataset.adminDetail,
        id: legacyDetail.dataset.adminId || "",
        tab: "summary",
      };
      historyStack = [];
      renderCurrentView();
    }
  });

  window.__BAEKJI_ADMIN_OBSERVATION_MVP2__ = Object.freeze({
    sessionScope,
    activeSessions,
    locationGroups,
    floors,
    hazardSummary,
    inventoryItems,
  });

  installLaunchButton();
  unsubscribeSnapshot = shell.snapshot.subscribe((next) => {
    payload = next?.state ? next : null;
    if (currentView && shell.modal.getOwner() === "observation") renderCurrentView();
  });
  shell.modal.subscribe((state) => {
    if (!state.open && !state.owner) {
      currentView = null;
      historyStack = [];
    }
  });
})();
