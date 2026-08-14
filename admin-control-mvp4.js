(() => {
  "use strict";

  const CONTROL_API = "/api/admin-control";
  const AUDIT_API = "/api/admin-audit";
  const SNAPSHOT_API = "/api/admin-snapshot";
  const DATA = window.DAY1_DATA || { places: {}, variants: {}, itemCatalog: {} };
  const dashboardModalRoot = () => document.getElementById("admin-modal-root");
  if (window.__BAEKJI_ADMIN_CONTROL_MVP4__) return;

  let controlRoot = null;
  let currentControl = null;
  let lastDetailContext = null;
  let busy = false;

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const values = (object) => Object.values(object && typeof object === "object" ? object : {});

  function ensureRoot() {
    if (controlRoot?.isConnected) return controlRoot;
    controlRoot = document.createElement("div");
    controlRoot.id = "admin-control-mvp4-root";
    document.body.append(controlRoot);
    return controlRoot;
  }

  function requestId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `mvp4_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) throw Object.assign(new Error(data?.code || `HTTP_${response.status}`), { status: response.status, data });
    return data;
  }

  async function snapshot() {
    return request(SNAPSHOT_API);
  }

  function profileFor(payload, id) {
    return (payload?.directory || []).find((entry) => String(entry.id) === String(id)) || { id: String(id || ""), name: String(id || "알 수 없음") };
  }

  function nodeName(id) {
    if (id === "E_ENTRY") return "해오름역 구역 입구";
    return DATA.places?.[id]?.name || id || "위치 미상";
  }

  function sessionForParty(state, party) {
    if (!party) return null;
    if (party.sessionId && state?.sessions?.[party.sessionId]) return state.sessions[party.sessionId];
    return values(state?.sessions).find((session) => session?.partyId === party.id) || null;
  }

  function itemCatalogEntries() {
    return Object.entries(DATA.itemCatalog || {}).map(([id, item]) => ({
      id: String(item?.itemId || id),
      name: String(item?.name || id),
      category: String(item?.category || "일반"),
    })).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }

  function inventoryEntries(character) {
    return Object.entries(character?.inventory || {}).filter(([, item]) => Number(item?.quantity || 0) > 0)
      .map(([inventoryKey, item]) => ({ inventoryKey, item }));
  }

  function worldItemEntries(payload, variant) {
    const claims = payload?.state?.itemClaimsByVariant?.[variant] || {};
    const objectNameForId = (objectId) => String(Object.values(DATA.objectsByDetail || {}).flat().find((entry) => String(entry?.id || "") === String(objectId))?.name || "조사 오브젝트");
    return Object.entries(DATA.objectItems || {}).flatMap(([objectId, mappings]) => (mappings || [])
      .filter((mapping) => !claims[`${objectId}:${mapping?.itemId}`])
      .map((mapping) => ({ objectId, objectName: objectNameForId(objectId), itemId: String(mapping?.itemId || ""), name: String(mapping?.name || mapping?.itemId || ""), quantity: Number(mapping?.default || 1) })))
      .filter((entry) => entry.itemId).sort((a, b) => a.name.localeCompare(b.name, "ko"));
  }

  function characterItemOptions(payload, targetCharacterId, mode) {
    const includeTarget = mode === "CHARACTER_COPY";
    return Object.entries(payload?.state?.characters || {}).flatMap(([characterId, character]) => !includeTarget && String(characterId) === String(targetCharacterId) ? []
      : inventoryEntries(character).map(({ inventoryKey, item }) => ({ characterId, inventoryKey, name: String(item?.name || inventoryKey), state: String(item?.state || "CLEAN"), quantity: Number(item?.quantity || 0), owner: profileFor(payload, characterId).name })))
      .sort((a, b) => `${a.owner}:${a.name}`.localeCompare(`${b.owner}:${b.name}`, "ko"));
  }

  function transferMarkup(payload, characterId, worldVariant) {
    const world = worldItemEntries(payload, worldVariant);
    const moveSources = characterItemOptions(payload, characterId, "CHARACTER_MOVE");
    const copySources = characterItemOptions(payload, characterId, "CHARACTER_COPY");
    const worldOptions = world.map((entry) => `<option value="${esc(entry.itemId)}" data-object-id="${esc(entry.objectId)}" data-catalog-item-id="${esc(entry.itemId)}">${esc(entry.name)} · ${esc(entry.objectName)} · ${entry.quantity}개</option>`).join("");
    const optionMarkup = (sources) => sources.map((entry) => `<option value="${esc(entry.inventoryKey)}" data-source-character-id="${esc(entry.characterId)}" data-source-inventory-key="${esc(entry.inventoryKey)}">${esc(entry.owner)} · ${esc(entry.name)} · ${esc(entry.state)} · ${entry.quantity}개</option>`).join("");
    const moveOptions = optionMarkup(moveSources);
    const copyOptions = optionMarkup(copySources);
    return `<section class="admin-control-section admin-control-transfer"><div class="admin-control-section-head"><div><strong>아이템 이동·복제</strong><small>서버가 최신 상태를 다시 검증해 한 번에 기록합니다.</small></div></div><div class="admin-control-transfer-grid">
      <article class="admin-control-transfer-card"><strong>미습득 아이템 지급</strong><small>선택한 시간 변주의 월드 획득권을 대상에게 옮깁니다.</small><label><span>시간 변주</span><select data-control-world-variant>${variantOptions(worldVariant)}</select></label><label><span>미습득 아이템</span><select data-control-world-source ${world.length ? "" : "disabled"}><option value="">${world.length ? "목록에서 선택" : "남은 미습득 아이템 없음"}</option>${worldOptions}</select></label><button type="button" data-control-inventory-transfer="WORLD_CLAIM" ${world.length ? "" : "disabled"}>대상에게 지급</button></article>
      <article class="admin-control-transfer-card"><strong>다른 캐릭터 소지품 이동</strong><small>출처의 전체 소지품 entry를 제거하고 상태 그대로 옮깁니다.</small><label><span>출처 소지품</span><select data-control-character-move-source ${moveSources.length ? "" : "disabled"}><option value="">${moveSources.length ? "출처 소지품 선택" : "이동 가능한 소지품 없음"}</option>${moveOptions}</select></label><button type="button" class="danger" data-control-inventory-transfer="CHARACTER_MOVE" ${moveSources.length ? "" : "disabled"}>대상에게 이동</button></article>
      <article class="admin-control-transfer-card"><strong>기존 소지품 복제 지급</strong><small>출처는 유지하고 상태가 같은 새 instance를 대상에게 지급합니다.</small><label><span>복제할 소지품</span><select data-control-character-copy-source ${copySources.length ? "" : "disabled"}><option value="">${copySources.length ? "출처 소지품 선택" : "복제 가능한 소지품 없음"}</option>${copyOptions}</select></label><button type="button" data-control-inventory-transfer="CHARACTER_COPY" ${copySources.length ? "" : "disabled"}>대상에게 복제 지급</button></article>
    </div></section>`;
  }

  function placeOptions(currentNode) {
    const options = [{ id: "E_ENTRY", name: "해오름역 구역 입구", floor: "구역 경계" }, ...values(DATA.places)
      .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      .map((place) => ({ id: place.id, name: place.name, floor: place.floor || "해오름역" }))];
    return options.map((place) => `<option value="${esc(place.id)}" ${place.id === currentNode ? "selected" : ""}>${esc(place.floor)} · ${esc(place.name)}</option>`).join("");
  }

  function variantOptions(current) {
    return ["a", "b", "c", "d"].map((variant) => `<option value="${variant}" ${variant === current ? "selected" : ""}>${variant.toUpperCase()} · ${esc(DATA.variants?.[variant]?.light || "시간 변주")}</option>`).join("");
  }

  function statusOptions(current) {
    return [["BRIEFING", "브리핑"], ["ACTIVE", "조사 진행"], ["COMPLETED", "조사 완료"]]
      .map(([value, label]) => `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`).join("");
  }

  function closeControl() {
    ensureRoot().replaceChildren();
    currentControl = null;
  }

  function toast(message, kind = "success") {
    const existing = document.querySelector(".admin-control-toast");
    existing?.remove();
    const node = document.createElement("div");
    node.className = `admin-control-toast ${kind}`;
    node.textContent = message;
    document.body.append(node);
    setTimeout(() => node.remove(), 2600);
  }

  function shell(title, subtitle, body, extraClass = "") {
    ensureRoot().innerHTML = `<div class="admin-control-backdrop" data-admin-control-backdrop>
      <section class="admin-control-modal ${esc(extraClass)}" role="dialog" aria-modal="true" aria-labelledby="admin-control-title">
        <header class="admin-control-head"><div><strong id="admin-control-title">${esc(title)}</strong>${subtitle ? `<small>${esc(subtitle)}</small>` : ""}</div><button type="button" data-admin-control-close aria-label="닫기">×</button></header>
        <div class="admin-control-body">${body}</div>
      </section>
    </div>`;
  }

  function renderCharacterControl(payload, characterId, worldVariant = "a") {
    const character = payload.state?.characters?.[characterId];
    if (!character) return shell("캐릭터 제어", "대상을 찾을 수 없음", `<div class="admin-control-empty">현재 세계 상태에 이 캐릭터가 없습니다.</div>`);
    const profile = profileFor(payload, characterId);
    const inventory = inventoryEntries(character).sort((a, b) => String(a.item?.name || "").localeCompare(String(b.item?.name || ""), "ko"));
    const itemRows = inventory.length ? inventory.map(({ inventoryKey, item }) => `<div class="admin-control-item-row" data-control-item-row="${esc(inventoryKey)}">
      <div><strong>${esc(item.name || inventoryKey)}</strong><small>${esc(item.category || "일반")} · ID ${esc(inventoryKey)}</small></div>
      <label><span>수량</span><input type="number" min="0" max="99" value="${Number(item.quantity || 0)}" data-control-item-qty /></label>
      <label><span>상태</span><input maxlength="40" value="${esc(item.state || "CLEAN")}" data-control-item-state /></label>
      <button type="button" data-control-item-save="${esc(inventoryKey)}">적용</button>
      <button type="button" class="danger ghost" data-control-item-remove="${esc(inventoryKey)}">제거</button>
    </div>`).join("") : `<div class="admin-control-empty compact">현재 소지품이 없습니다.</div>`;
    const catalog = itemCatalogEntries();

    shell(`${profile.name} · 직접 제어`, `캐릭터 ${characterId}`, `<section class="admin-control-section">
      <div class="admin-control-section-head"><div><strong>상태·오염도</strong><small>0~100% 범위의 객관적 상태값</small></div><span class="admin-control-revision">r${Number(payload.revision || 0)}</span></div>
      <div class="admin-control-form-grid">
        <label><span>오염도</span><input type="number" min="0" max="100" value="${Number(character.contamination || 0)}" data-control-contamination /></label>
        <label><span>증상</span><input maxlength="120" value="${esc(character.symptom || "안정")}" data-control-symptom /></label>
      </div>
      <div class="admin-control-actions"><button type="button" class="primary" data-control-character-status="${esc(characterId)}">상태 저장</button></div>
    </section>
    <section class="admin-control-section">
      <div class="admin-control-section-head"><div><strong>소지품</strong><small>수량 0은 제거와 동일하며 조사 오브젝트의 획득권은 변경하지 않습니다.</small></div></div>
      <div class="admin-control-items">${itemRows}</div>
      <div class="admin-control-add-item">
        <label><span>소지품 추가</span><select data-control-add-item-id><option value="">목록에서 선택</option>${catalog.map((item) => `<option value="${esc(item.id)}" data-name="${esc(item.name)}" data-category="${esc(item.category)}">${esc(item.name)} · ${esc(item.category)}</option>`).join("")}</select></label>
        <label><span>수량</span><input type="number" min="1" max="99" value="1" data-control-add-item-qty /></label>
        <label><span>상태</span><input maxlength="40" value="CLEAN" data-control-add-item-state /></label>
        <button type="button" data-control-add-item="${esc(characterId)}">추가/설정</button>
      </div>
    </section>${transferMarkup(payload, characterId, worldVariant)}
    <div class="admin-control-footnote">모든 변경은 관리자 계정·변경 전/후 값·세계 revision과 함께 감사 로그에 영구 기록됩니다.</div>`, "character-control");
    currentControl = { type: "character", id: characterId, payload, worldVariant };
  }

  function renderPartyControl(payload, partyId, confirmDraft = null) {
    const party = payload.state?.parties?.[partyId];
    const session = sessionForParty(payload.state, party);
    if (!party || !session) return shell("조사 세션 제어", "대상을 찾을 수 없음", `<div class="admin-control-empty">현재 연결된 조사 세션이 없습니다.</div>`);
    const hazard = session.activeEncounter ? "돌발 상황 진행 중" : "돌발 상황 없음";
    const movement = session.movement ? `${nodeName(session.movement.fromNode)} → ${nodeName(session.movement.targetNode)} 이동 중` : "이동 없음";

    if (confirmDraft) {
      const changes = [];
      if (confirmDraft.nodeId !== session.currentNode) changes.push(`위치: ${nodeName(session.currentNode)} → ${nodeName(confirmDraft.nodeId)}`);
      if (confirmDraft.variant !== session.variant) changes.push(`시간 변주: ${String(session.variant || "").toUpperCase()} → ${String(confirmDraft.variant || "").toUpperCase()}`);
      if (confirmDraft.status !== session.status) changes.push(`세션 상태: ${session.status} → ${confirmDraft.status}`);
      if (confirmDraft.clearTransient) changes.push("현재 이동/돌발 상황 강제 해제");
      shell(`${party.name || party.id} · 변경 확인`, `세션 ${session.id}`, `<div class="admin-control-confirm">
        <strong>다음 변경을 즉시 세계 상태에 적용합니다.</strong>
        <ul>${changes.length ? changes.map((text) => `<li>${esc(text)}</li>`).join("") : `<li>선택값이 현재 상태와 같습니다.</li>`}</ul>
        <p>위치 변경은 조사조 전체에 적용됩니다. 운영 SYSTEM 안내는 자동으로 발송되지 않습니다.</p>
      </div><div class="admin-control-actions split"><button type="button" data-control-party-back="${esc(partyId)}">수정</button><button type="button" class="danger" data-control-party-confirm="${esc(partyId)}">조사 세션 변경</button></div>`);
      currentControl = { type: "party-confirm", id: partyId, payload, draft: confirmDraft };
      return;
    }

    shell(`${party.name || party.id} · 조사 제어`, `세션 ${session.id} · r${Number(payload.revision || 0)}`, `<section class="admin-control-section">
      <div class="admin-control-live-state"><span>${esc(movement)}</span><span class="${session.activeEncounter ? "danger" : ""}">${esc(hazard)}</span></div>
      <div class="admin-control-form-grid three">
        <label><span>현재 구역</span><select data-control-session-node>${placeOptions(session.currentNode)}</select></label>
        <label><span>시간 변주</span><select data-control-session-variant>${variantOptions(session.variant)}</select></label>
        <label><span>세션 상태</span><select data-control-session-status>${statusOptions(session.status)}</select></label>
      </div>
      <label class="admin-control-checkbox"><input type="checkbox" data-control-session-clear ${session.movement || session.activeEncounter ? "checked" : ""}/><span>현재 이동 및 돌발 상황을 강제로 종료</span></label>
      <div class="admin-control-warning">구역을 변경하면 이동/돌발 상황은 자동 해제되고 세부 조사 지점은 구역 기본 화면으로 돌아갑니다.</div>
      <div class="admin-control-actions"><button type="button" class="primary" data-control-party-review="${esc(partyId)}">변경 내용 확인</button></div>
    </section>`, "party-control");
    currentControl = { type: "party", id: partyId, payload };
  }

  function auditActionLabel(action) {
    return ({ CHARACTER_STATUS: "캐릭터 상태", INVENTORY_SET: "소지품", INVENTORY_TRANSFER: "소지품 이동·복제", SESSION_CONTROL: "조사 세션" })[action] || action || "관리 조작";
  }

  function jsonCompact(value) {
    try { return JSON.stringify(value ?? {}, null, 2); }
    catch { return "{}"; }
  }

  function renderAudit(entries) {
    const rows = [...(entries || [])].reverse();
    shell("관리자 감사 로그", "모든 직접 세계 상태 조작 기록", `<div class="admin-audit-tools"><input placeholder="관리자·대상·변경 내용 검색" data-admin-audit-search/><button type="button" data-admin-audit-refresh>새로고침</button></div>
      <div class="admin-audit-list" data-admin-audit-list>${rows.length ? rows.map((entry) => `<article class="admin-audit-row" data-admin-audit-search-text="${esc(`${entry.admin_display_name || ""} ${entry.admin_login_id || ""} ${entry.target_id || ""} ${entry.summary || ""} ${entry.action || ""}`.toLowerCase())}">
        <header><span class="admin-audit-action">${esc(auditActionLabel(entry.action))}</span><strong>${esc(entry.admin_display_name || entry.admin_login_id || "관리자")}</strong><time>${esc(new Date(entry.created_at).toLocaleString("ko-KR", { hour12: false }))}</time></header>
        <p>${esc(entry.summary || "")}</p>
        <footer><span>${esc(entry.target_kind || "")}:${esc(entry.target_id || "-")}</span><span>r${Number(entry.world_revision_before || 0)} → r${Number(entry.world_revision_after || 0)}</span><span>#${Number(entry.id || 0)}</span></footer>
        <details><summary>변경 전/후 값</summary><div class="admin-audit-diff"><div><strong>BEFORE</strong><pre>${esc(jsonCompact(entry.before_state))}</pre></div><div><strong>AFTER</strong><pre>${esc(jsonCompact(entry.after_state))}</pre></div></div></details>
      </article>`).join("") : `<div class="admin-control-empty">아직 직접 조작 기록이 없습니다.</div>`}</div>`, "audit-control");
    currentControl = { type: "audit" };
  }

  async function openAudit() {
    shell("관리자 감사 로그", "불러오는 중", `<div class="admin-control-loading">감사 로그를 불러오고 있습니다...</div>`);
    try {
      const data = await request(`${AUDIT_API}?limit=160`);
      renderAudit(data.entries || []);
    } catch (error) {
      shell("관리자 감사 로그", "불러오기 실패", `<div class="admin-control-empty">${esc(error?.data?.code || error?.message || "감사 로그를 불러올 수 없습니다.")}</div>`);
    }
  }

  async function sendControl(body, reopen) {
    if (busy) return;
    busy = true;
    ensureRoot().querySelectorAll("button,input,select,textarea").forEach((node) => { node.disabled = true; });
    try {
      const result = await request(CONTROL_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: requestId(), ...body }),
      });
      toast(`${result.summary || "관리자 변경 완료"} · r${Number(result.revision || 0)}`);
      document.querySelector("[data-admin-refresh]")?.click();
      const fresh = await snapshot();
      if (typeof reopen === "function") reopen(fresh);
      window.dispatchEvent(new CustomEvent("baekji-admin-control-applied", { detail: result }));
    } catch (error) {
      toast(error?.data?.code || error?.message || "관리자 변경에 실패했습니다.", "error");
      ensureRoot().querySelectorAll("button,input,select,textarea").forEach((node) => { node.disabled = false; });
    } finally {
      busy = false;
    }
  }

  async function openCharacter(characterId) {
    shell("캐릭터 직접 제어", "현재 상태를 불러오는 중", `<div class="admin-control-loading">세계 상태 동기화 중...</div>`);
    try { renderCharacterControl(await snapshot(), characterId); }
    catch { shell("캐릭터 직접 제어", "불러오기 실패", `<div class="admin-control-empty">현재 상태를 불러올 수 없습니다.</div>`); }
  }

  async function openParty(partyId) {
    shell("조사 세션 직접 제어", "현재 상태를 불러오는 중", `<div class="admin-control-loading">세계 상태 동기화 중...</div>`);
    try { renderPartyControl(await snapshot(), partyId); }
    catch { shell("조사 세션 직접 제어", "불러오기 실패", `<div class="admin-control-empty">현재 상태를 불러올 수 없습니다.</div>`); }
  }

  function augmentDetail(kind, id) {
    const body = dashboardModalRoot()?.querySelector(".admin-modal-body");
    if (!body || !kind || !id) return;
    body.querySelector("[data-admin-control-entry]")?.remove();
    if (!new Set(["character", "party"]).has(kind)) return;
    const wrap = document.createElement("section");
    wrap.className = "admin-control-entry";
    wrap.dataset.adminControlEntry = "";
    wrap.innerHTML = kind === "character"
      ? `<div><strong>관리자 직접 제어</strong><small>오염도·증상·소지품을 수정합니다.</small></div><button type="button" data-admin-control-open="character" data-admin-control-id="${esc(id)}">상태·소지품 조작</button>`
      : `<div><strong>관리자 직접 제어</strong><small>조사 위치·시간 변주·세션 상태를 수정합니다.</small></div><button type="button" data-admin-control-open="party" data-admin-control-id="${esc(id)}">조사 세션 조작</button>`;
    body.append(wrap);
  }

  function restoreDetailEntry() {
    const body = dashboardModalRoot()?.querySelector(".admin-modal-body");
    if (!lastDetailContext || !body || body.querySelector("[data-admin-control-entry]")) return;
    augmentDetail(lastDetailContext.kind, lastDetailContext.id);
  }

  function clearDetailContext() {
    lastDetailContext = null;
  }

  function ensureAuditButton() {
    const meta = document.querySelector(".admin-topbar-meta");
    if (!meta || meta.querySelector("[data-admin-audit-open]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-audit-open";
    button.dataset.adminAuditOpen = "";
    button.textContent = "감사 로그";
    const connection = meta.querySelector("[data-admin-connection]");
    meta.insertBefore(button, connection || null);
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const detail = target.closest("[data-admin-detail]");
    if (detail) {
      lastDetailContext = { kind: detail.dataset.adminDetail, id: detail.dataset.adminId };
      queueMicrotask(restoreDetailEntry);
    }

    if (target.closest("[data-admin-modal-close]") || target.matches("[data-admin-modal-backdrop]")) clearDetailContext();

    const open = target.closest("[data-admin-control-open]");
    if (open) {
      event.preventDefault();
      event.stopPropagation();
      if (open.dataset.adminControlOpen === "character") return void openCharacter(open.dataset.adminControlId);
      if (open.dataset.adminControlOpen === "party") return void openParty(open.dataset.adminControlId);
    }

    if (target.closest("[data-admin-audit-open]")) return void openAudit();
    if (target.closest("[data-admin-control-close]") || target.matches("[data-admin-control-backdrop]")) return closeControl();

    const statusButton = target.closest("[data-control-character-status]");
    if (statusButton) {
      const characterId = statusButton.dataset.controlCharacterStatus;
      const contamination = Number(ensureRoot().querySelector("[data-control-contamination]")?.value || 0);
      const symptom = String(ensureRoot().querySelector("[data-control-symptom]")?.value || "안정").trim();
      return void sendControl({ operation: "CHARACTER_STATUS", characterId, contamination, symptom }, (fresh) => renderCharacterControl(fresh, characterId));
    }

    const saveItem = target.closest("[data-control-item-save]");
    if (saveItem) {
      const characterId = currentControl?.id;
      const itemId = saveItem.dataset.controlItemSave;
      const row = saveItem.closest("[data-control-item-row]");
      const quantity = Number(row?.querySelector("[data-control-item-qty]")?.value || 0);
      const state = String(row?.querySelector("[data-control-item-state]")?.value || "CLEAN").trim();
      const currentName = row?.querySelector("strong")?.textContent || itemId;
      return void sendControl({ operation: "INVENTORY_SET", characterId, itemId, quantity, state, name: currentName }, (fresh) => renderCharacterControl(fresh, characterId));
    }

    const removeItem = target.closest("[data-control-item-remove]");
    if (removeItem) {
      const characterId = currentControl?.id;
      const itemId = removeItem.dataset.controlItemRemove;
      const row = removeItem.closest("[data-control-item-row]");
      const currentName = row?.querySelector("strong")?.textContent || itemId;
      return void sendControl({ operation: "INVENTORY_SET", characterId, itemId, quantity: 0, name: currentName }, (fresh) => renderCharacterControl(fresh, characterId));
    }

    const addItem = target.closest("[data-control-add-item]");
    if (addItem) {
      const characterId = addItem.dataset.controlAddItem;
      const select = ensureRoot().querySelector("[data-control-add-item-id]");
      const itemId = String(select?.value || "");
      if (!itemId) return toast("추가할 소지품을 선택해 주세요.", "error");
      const option = select.selectedOptions?.[0];
      const name = option?.dataset.name || option?.textContent || itemId;
      const category = option?.dataset.category || "일반";
      const quantity = Number(ensureRoot().querySelector("[data-control-add-item-qty]")?.value || 1);
      const state = String(ensureRoot().querySelector("[data-control-add-item-state]")?.value || "CLEAN").trim();
      return void sendControl({ operation: "INVENTORY_SET", characterId, itemId, quantity, state, name, category }, (fresh) => renderCharacterControl(fresh, characterId));
    }

    const transfer = target.closest("[data-control-inventory-transfer]");
    if (transfer) {
      const targetCharacterId = currentControl?.id;
      const mode = transfer.dataset.controlInventoryTransfer;
      if (!targetCharacterId || !mode) return;
      const body = { operation: "INVENTORY_TRANSFER", mode, targetCharacterId };
      if (mode === "WORLD_CLAIM") {
        const variant = String(ensureRoot().querySelector("[data-control-world-variant]")?.value || "");
        const option = ensureRoot().querySelector("[data-control-world-source]")?.selectedOptions?.[0];
        if (!option?.dataset.objectId || !option?.dataset.catalogItemId) return toast("지급할 미습득 아이템을 선택해 주세요.", "error");
        Object.assign(body, { variant, objectId: option.dataset.objectId, catalogItemId: option.dataset.catalogItemId });
      } else {
        const selector = mode === "CHARACTER_MOVE" ? "[data-control-character-move-source]" : "[data-control-character-copy-source]";
        const option = ensureRoot().querySelector(selector)?.selectedOptions?.[0];
        if (!option?.dataset.sourceCharacterId || !option?.dataset.sourceInventoryKey) return toast("출처 소지품을 선택해 주세요.", "error");
        Object.assign(body, { sourceCharacterId: option.dataset.sourceCharacterId, sourceInventoryKey: option.dataset.sourceInventoryKey });
      }
      return void sendControl(body, (fresh) => renderCharacterControl(fresh, targetCharacterId, String(body.variant || currentControl?.worldVariant || "a")));
    }

    const reviewParty = target.closest("[data-control-party-review]");
    if (reviewParty) {
      const partyId = reviewParty.dataset.controlPartyReview;
      const draft = {
        nodeId: String(ensureRoot().querySelector("[data-control-session-node]")?.value || ""),
        variant: String(ensureRoot().querySelector("[data-control-session-variant]")?.value || ""),
        status: String(ensureRoot().querySelector("[data-control-session-status]")?.value || ""),
        clearTransient: Boolean(ensureRoot().querySelector("[data-control-session-clear]")?.checked),
      };
      return renderPartyControl(currentControl.payload, partyId, draft);
    }

    const partyBack = target.closest("[data-control-party-back]");
    if (partyBack) return renderPartyControl(currentControl.payload, partyBack.dataset.controlPartyBack);

    const confirmParty = target.closest("[data-control-party-confirm]");
    if (confirmParty) {
      const partyId = confirmParty.dataset.controlPartyConfirm;
      const payload = currentControl?.payload;
      const party = payload?.state?.parties?.[partyId];
      const session = sessionForParty(payload?.state, party);
      if (!session) return toast("조사 세션을 찾을 수 없습니다.", "error");
      const draft = currentControl?.draft || {};
      const body = { operation: "SESSION_CONTROL", sessionId: session.id };
      if (draft.nodeId && draft.nodeId !== session.currentNode) body.nodeId = draft.nodeId;
      if (draft.variant && draft.variant !== session.variant) body.variant = draft.variant;
      if (draft.status && draft.status !== session.status) body.status = draft.status;
      if (draft.clearTransient) body.clearTransient = true;
      return void sendControl(body, (fresh) => renderPartyControl(fresh, partyId));
    }

    if (target.closest("[data-admin-audit-refresh]")) return void openAudit();
  }, true);

  document.addEventListener("input", (event) => {
    if (!event.target?.matches?.("[data-admin-audit-search]")) return;
    const query = String(event.target.value || "").trim().toLowerCase();
    ensureRoot().querySelectorAll(".admin-audit-row").forEach((row) => {
      row.hidden = Boolean(query) && !String(row.dataset.adminAuditSearchText || "").includes(query);
    });
  });

  document.addEventListener("change", (event) => {
    if (!event.target?.matches?.("[data-control-world-variant]") || currentControl?.type !== "character") return;
    renderCharacterControl(currentControl.payload, currentControl.id, String(event.target.value || "a"));
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && ensureRoot().childElementCount) closeControl();
  });

  ensureAuditButton();
  const topbarObserver = new MutationObserver(ensureAuditButton);
  const topbar = document.querySelector(".admin-topbar");
  if (topbar) topbarObserver.observe(topbar, { childList: true, subtree: true });
  const modalRoot = dashboardModalRoot();
  if (modalRoot) {
    const detailObserver = new MutationObserver(restoreDetailEntry);
    detailObserver.observe(modalRoot, { childList: true, subtree: true });
  }

  window.__BAEKJI_ADMIN_CONTROL_MVP4__ = Object.freeze({
    requestId,
    itemCatalogEntries,
    nodeName,
    sessionForParty,
    augmentDetail,
    restoreDetailEntry,
    clearDetailContext,
    openAudit,
  });
})();
