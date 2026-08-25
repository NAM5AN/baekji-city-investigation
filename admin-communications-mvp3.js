(() => {
  "use strict";

  const COMM_API = "/api/admin-communications";
  const SNAPSHOT_API = "/api/admin-snapshot";
  const POLL_MS = 1200;
  const DEFAULT_SENDER_LABEL = "SYSTEM";
  const SENDER_PRESETS = ["SYSTEM", "운영 SYSTEM", "안내방송", "역내 방송", "관제실"];
  const rail = document.querySelector(".admin-chat-rail");
  const DATA = window.DAY1_DATA || { places: {} };
  if (!rail || window.__BAEKJI_ADMIN_COMMUNICATIONS_MVP3__) return;

  let admin = null;
  let chatMessages = [];
  let systemEvents = [];
  let lastChatId = 0;
  let lastSystemId = 0;
  let pollTimer = 0;
  let loading = false;
  let initialLoaded = false;
  let modalRoot = null;
  let systemSending = false;

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
  const values = (object) => Object.values(object && typeof object === "object" ? object : {});
  const unique = (items) => [...new Set((Array.isArray(items) ? items : []).map((item) => String(item || "")).filter(Boolean))];
  const cleanLabel = (value) => String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40) || DEFAULT_SENDER_LABEL;

  function ensureModalRoot() {
    if (modalRoot?.isConnected) return modalRoot;
    modalRoot = document.createElement("div");
    modalRoot.id = "admin-communications-modal-root";
    document.body.append(modalRoot);
    return modalRoot;
  }

  function currentRefs() {
    return {
      history: rail.querySelector("[data-admin-chat-history]"),
      input: rail.querySelector("[data-admin-chat-input]"),
      send: rail.querySelector("[data-admin-chat-send]"),
      system: rail.querySelector("[data-admin-system-open]"),
      historyButton: rail.querySelector("[data-admin-system-history]"),
      status: rail.querySelector("[data-admin-chat-status]"),
    };
  }

  function mountRail() {
    rail.innerHTML = `<div class="admin-chat-head">
      <div><strong>관리자 채팅</strong><small>관제판을 보면서 운영진끼리 실시간 대화</small></div>
      <span class="admin-chat-badge live" data-admin-chat-status>연결 중</span>
    </div>
    <div class="admin-chat-toolbar"><button type="button" data-admin-system-history>SYSTEM 기록</button><span data-admin-chat-identity>관리자 확인 중</span></div>
    <div class="admin-chat-history" data-admin-chat-history aria-live="polite"></div>
    <div class="admin-chat-compose">
      <textarea data-admin-chat-input maxlength="1200" placeholder="관리자끼리만 보이는 메시지"></textarea>
      <div><button type="button" class="admin-system-send-button" data-admin-system-open>운영 SYSTEM</button><button type="button" data-admin-chat-send>보내기</button></div>
    </div>`;
  }

  function timeText(value) {
    const date = new Date(value || Date.now());
    return Number.isNaN(date.getTime()) ? "--:--" : date.toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit" });
  }

  function mergeRows(current, incoming) {
    const map = new Map(current.map((row) => [Number(row.id), row]));
    (Array.isArray(incoming) ? incoming : []).forEach((row) => {
      const id = Number(row?.id || 0);
      if (id) map.set(id, row);
    });
    return [...map.values()].sort((a, b) => Number(a.id) - Number(b.id)).slice(-120);
  }

  function isNearBottom(element, threshold = 60) {
    if (!element) return true;
    return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
  }

  function renderChat({ forceLatest = false } = {}) {
    const { history } = currentRefs();
    if (!history) return;
    const keepLatest = forceLatest || isNearBottom(history);
    history.innerHTML = chatMessages.length ? chatMessages.map((row) => {
      const mine = admin?.id && String(row.login_id || "") === String(admin.id);
      return `<article class="admin-chat-message ${mine ? "mine" : ""}" data-admin-chat-id="${Number(row.id || 0)}">
        <header><strong>${esc(row.display_name || row.login_id || "관리자")}</strong><span>${esc(timeText(row.created_at))}</span></header>
        <p>${esc(row.message || "")}</p>
      </article>`;
    }).join("") : `<div class="admin-chat-empty"><strong>운영진 채팅 시작</strong><span>이 채팅은 플레이어에게 표시되지 않습니다.</span></div>`;
    if (keepLatest) history.scrollTop = history.scrollHeight;
  }

  function setStatus(text, kind = "") {
    const { status } = currentRefs();
    if (!status) return;
    status.textContent = text;
    status.dataset.kind = kind;
  }

  function setIdentity() {
    const node = rail.querySelector("[data-admin-chat-identity]");
    if (node) node.textContent = admin ? `${admin.name} (${admin.id})` : "관리자 확인 중";
  }

  async function request(url, options = {}) {
    const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...options });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data?.ok) throw Object.assign(new Error(data?.code || `HTTP_${response.status}`), { status: response.status, data });
    return data;
  }

  async function poll() {
    if (loading) return;
    loading = true;
    try {
      const query = new URLSearchParams({ afterChat: String(initialLoaded ? lastChatId : 0), afterSystem: String(initialLoaded ? lastSystemId : 0) });
      const data = await request(`${COMM_API}?${query}`);
      admin = data.admin || admin;
      const incomingChat = data.chatMessages || [];
      const incomingSystem = data.systemEvents || [];
      const hadNewChat = initialLoaded && incomingChat.some((row) => Number(row.id || 0) > lastChatId);
      chatMessages = mergeRows(chatMessages, incomingChat);
      systemEvents = mergeRows(systemEvents, incomingSystem);
      lastChatId = Math.max(lastChatId, ...chatMessages.map((row) => Number(row.id || 0)), 0);
      lastSystemId = Math.max(lastSystemId, ...systemEvents.map((row) => Number(row.id || 0)), 0);
      setIdentity();
      renderChat({ forceLatest: !initialLoaded || hadNewChat });
      setStatus("LIVE", "live");
      initialLoaded = true;
    } catch (error) {
      if (error?.status === 401) {
        setStatus("세션 만료", "error");
        currentRefs().input?.setAttribute("disabled", "");
        currentRefs().send?.setAttribute("disabled", "");
        currentRefs().system?.setAttribute("disabled", "");
      } else {
        setStatus("재연결", "warn");
      }
    } finally {
      loading = false;
      clearTimeout(pollTimer);
      pollTimer = setTimeout(poll, POLL_MS);
    }
  }

  async function sendChat() {
    const { input, send } = currentRefs();
    const message = String(input?.value || "").trim();
    if (!message || !send) return;
    send.disabled = true;
    try {
      const data = await request(COMM_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "chat", message }),
      });
      if (data.message) {
        chatMessages = mergeRows(chatMessages, [data.message]);
        lastChatId = Math.max(lastChatId, Number(data.message.id || 0));
      }
      input.value = "";
      renderChat({ forceLatest: true });
      input.focus();
      setStatus("LIVE", "live");
    } catch {
      setStatus("전송 실패", "error");
    } finally {
      send.disabled = false;
    }
  }

  function sessionScopeKey(session) {
    if (!session) return "";
    if (session.movement) return `route:${session.movement.fromNode || session.currentNode}:${session.movement.targetNode || ""}`;
    if (session.activeEncounter) return `route:${session.activeEncounter.fromNode || session.currentNode}:${session.activeEncounter.targetNode || ""}`;
    if (session.currentDetailId) return `detail:${session.currentNode}:${session.currentDetailId}`;
    return `node:${session.currentNode || ""}`;
  }

  function scopeLabel(scopeKey) {
    if (scopeKey.startsWith("node:")) {
      const id = scopeKey.slice(5);
      return DATA.places?.[id]?.name || id;
    }
    if (scopeKey.startsWith("detail:")) {
      const [, nodeId, detailId] = scopeKey.split(":");
      const detail = DATA.places?.[nodeId]?.details?.find?.((item) => item.id === detailId);
      return `${DATA.places?.[nodeId]?.name || nodeId} · ${detail?.name || detailId}`;
    }
    if (scopeKey.startsWith("route:")) {
      const [, from, to] = scopeKey.split(":");
      return `${DATA.places?.[from]?.name || from} → ${DATA.places?.[to]?.name || to} 이동/위험 구간`;
    }
    return scopeKey;
  }

  function activeSessions(state) {
    return values(state?.sessions).filter((session) => session?.status === "ACTIVE");
  }

  function targetOptions(snapshot, kind) {
    const state = snapshot?.state || {};
    const directory = snapshot?.directory || [];
    const sessions = activeSessions(state);
    if (kind === "ZONE") {
      const map = new Map();
      values(DATA.places).forEach((place) => map.set(`node:${place.id}`, place.name || place.id));
      sessions.forEach((session) => {
        const key = sessionScopeKey(session);
        if (key && !map.has(key)) map.set(key, scopeLabel(key));
      });
      return [...map.entries()].map(([id, label]) => ({ id, label }));
    }
    if (kind === "PARTY") {
      return values(state.parties).filter((party) => party?.memberIds?.length).map((party) => ({ id: String(party.id), label: `${party.name || party.id} · ${party.memberIds.length}명` }));
    }
    if (kind === "CHARACTER") {
      const activeIds = new Set(sessions.flatMap((session) => session.memberIds || []));
      return directory.filter((entry) => activeIds.has(String(entry.id))).map((entry) => ({ id: String(entry.id), label: String(entry.name || entry.id) }));
    }
    return [];
  }

  function previewRecipients(snapshot, kind, targetId) {
    const state = snapshot?.state || {};
    const sessions = activeSessions(state);
    let selected = [];
    let characters = [];
    if (kind === "ALL") selected = sessions;
    if (kind === "ZONE") {
      selected = sessions.filter((session) => {
        const key = sessionScopeKey(session);
        if (key === targetId) return true;
        return targetId.startsWith("node:") && key.startsWith(`detail:${targetId.slice(5)}:`);
      });
    }
    if (kind === "PARTY") {
      const party = state.parties?.[targetId];
      selected = sessions.filter((session) => session.partyId === targetId || party?.sessionId === session.id);
    }
    if (kind === "CHARACTER") {
      const character = state.characters?.[targetId];
      const session = character?.currentSessionId ? state.sessions?.[character.currentSessionId] : sessions.find((item) => item.memberIds?.includes(targetId));
      if (session?.status === "ACTIVE") selected = [session];
      characters = selected.length ? [targetId] : [];
    }
    if (kind !== "CHARACTER") characters = unique(selected.flatMap((session) => session.memberIds || []));
    return { characters, sessions: unique(selected.map((session) => session.id)) };
  }

  function closeModal() {
    ensureModalRoot().replaceChildren();
  }

  function systemHistoryMarkup() {
    const rows = [...systemEvents].reverse();
    return rows.length ? rows.map((row) => `<article class="admin-system-history-row">
      <header><strong>${esc(cleanLabel(row.sender_label))}</strong><span>${esc(timeText(row.created_at))}</span></header>
      <p>${esc(row.message || "")}</p>
      <footer><span>${esc(row.target_label || row.target_kind || "대상")}</span><span>${Number(row.recipient_count || 0)}명 · ${Number(row.session_count || 0)}세션</span><span>${esc(row.display_name || row.login_id || "관리자")}</span></footer>
    </article>`).join("") : `<div class="admin-chat-empty"><strong>전송 기록 없음</strong><span>운영 SYSTEM 전송 기록이 여기에 누적됩니다.</span></div>`;
  }

  function openSystemHistory() {
    const root = ensureModalRoot();
    root.innerHTML = `<div class="admin-comm-backdrop" data-admin-comm-close><section class="admin-comm-modal" role="dialog" aria-modal="true">
      <header><div><strong>운영 SYSTEM 기록</strong><small>관리자가 직접 전송한 메시지만 표시</small></div><button type="button" data-admin-comm-close>×</button></header>
      <div class="admin-comm-modal-body admin-system-history-list">${systemHistoryMarkup()}</div>
    </section></div>`;
  }

  async function openSystemComposer() {
    const root = ensureModalRoot();
    root.innerHTML = `<div class="admin-comm-backdrop" data-admin-comm-close><section class="admin-comm-modal" role="dialog" aria-modal="true"><header><div><strong>운영 SYSTEM 전송</strong><small>플레이어 조사 화면에 강조 표시됩니다.</small></div><button type="button" data-admin-comm-close>×</button></header><div class="admin-comm-loading">현재 조사 상태를 불러오는 중...</div></section></div>`;
    try {
      const snapshot = await request(SNAPSHOT_API);
      renderSystemComposer(snapshot, { kind: "ALL", targetId: "", message: "", senderLabel: DEFAULT_SENDER_LABEL, confirm: false });
    } catch {
      root.querySelector(".admin-comm-loading").textContent = "현재 조사 상태를 불러오지 못했습니다.";
    }
  }

  function renderSystemComposer(snapshot, draft) {
    const root = ensureModalRoot();
    const kind = draft.kind || "ALL";
    const options = targetOptions(snapshot, kind);
    const targetId = kind === "ALL" ? "" : (options.some((item) => item.id === draft.targetId) ? draft.targetId : options[0]?.id || "");
    const preview = previewRecipients(snapshot, kind, targetId);
    const selected = options.find((item) => item.id === targetId);
    const targetLabel = kind === "ALL" ? "전체 참가자" : selected?.label || targetId;
    const senderLabel = cleanLabel(draft.senderLabel);
    const labels = { ALL: "전체", ZONE: "구역", PARTY: "조사조", CHARACTER: "캐릭터" };

    if (draft.confirm) {
      root.innerHTML = `<div class="admin-comm-backdrop" data-admin-comm-close><section class="admin-comm-modal" role="dialog" aria-modal="true">
        <header><div><strong>운영 SYSTEM 전송 확인</strong><small>플레이어에게 즉시 전달됩니다.</small></div><button type="button" data-admin-comm-close>×</button></header>
        <div class="admin-comm-modal-body"><div class="admin-system-confirm">
          <span>발신</span><strong>${esc(senderLabel)}</strong>
          <span>대상</span><strong>${esc(targetLabel)}</strong>
          <span>수신</span><strong>${preview.characters.length}명 · ${preview.sessions.length}개 조사세션</strong>
          <span>메시지</span><p>${esc(draft.message)}</p>
        </div><div class="admin-comm-actions"><button type="button" data-admin-system-back>수정</button><button type="button" class="danger" data-admin-system-confirm-send>운영 SYSTEM 전송</button></div></div>
      </section></div>`;
      root.querySelector("[data-admin-system-back]")?.addEventListener("click", () => renderSystemComposer(snapshot, { ...draft, confirm: false, targetId }));
      root.querySelector("[data-admin-system-confirm-send]")?.addEventListener("click", async (event) => {
        if (systemSending) return;
        systemSending = true;
        event.currentTarget.disabled = true;
        try {
          const data = await request(COMM_API, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ kind: "system", targetKind: kind, targetId, targetLabel, senderLabel, message: draft.message }),
          });
          if (data.event) {
            systemEvents = mergeRows(systemEvents, [data.event]);
            lastSystemId = Math.max(lastSystemId, Number(data.event.id || 0));
          }
          closeModal();
          setStatus("SYSTEM 전송", "system");
          setTimeout(() => setStatus("LIVE", "live"), 1600);
        } catch (error) {
          event.currentTarget.disabled = false;
          const code = error?.data?.code || error?.message || "전송 실패";
          event.currentTarget.textContent = code === "ADMIN_SYSTEM_NO_RECIPIENTS" ? "수신 대상 없음" : "전송 실패 · 다시 시도";
        } finally {
          systemSending = false;
        }
      });
      return;
    }

    root.innerHTML = `<div class="admin-comm-backdrop" data-admin-comm-close><section class="admin-comm-modal" role="dialog" aria-modal="true">
      <header><div><strong>운영 SYSTEM 전송</strong><small>자동 SYSTEM 로그와 구분되는 운영진 직접 메시지</small></div><button type="button" data-admin-comm-close>×</button></header>
      <div class="admin-comm-modal-body">
        <div class="admin-system-target-tabs">${Object.entries(labels).map(([id, label]) => `<button type="button" class="${kind === id ? "active" : ""}" data-admin-system-kind="${id}">${label}</button>`).join("")}</div>
        ${kind === "ALL" ? `<div class="admin-system-target-all">현재 활성 조사세션 전체</div>` : `<label class="admin-comm-field"><span>전송 대상</span><select data-admin-system-target>${options.map((item) => `<option value="${esc(item.id)}" ${item.id === targetId ? "selected" : ""}>${esc(item.label)}</option>`).join("")}</select></label>`}
        <div class="admin-system-recipient-preview">현재 기준 <strong>${preview.characters.length}명</strong> · <strong>${preview.sessions.length}개 조사세션</strong>에 전달</div>
        <label class="admin-comm-field"><span>발신인명</span><input type="text" maxlength="40" list="admin-system-sender-presets" data-admin-system-sender value="${esc(senderLabel)}" placeholder="SYSTEM" /><datalist id="admin-system-sender-presets">${SENDER_PRESETS.map((label) => `<option value="${esc(label)}"></option>`).join("")}</datalist></label>
        <label class="admin-comm-field"><span>메시지</span><textarea data-admin-system-message maxlength="1600" placeholder="플레이어에게 전달할 운영 SYSTEM 메시지">${esc(draft.message || "")}</textarea></label>
        <div class="admin-system-warning">조사 화면의 SYSTEM 영역과 조사 채팅에 동시에 강조 표시됩니다. 관리자 채팅과 혼동하지 않도록 전송 전 한 번 더 확인합니다.</div>
        <div class="admin-comm-actions"><button type="button" data-admin-comm-close>취소</button><button type="button" class="primary" data-admin-system-review ${preview.characters.length ? "" : "disabled"}>전송 내용 확인</button></div>
      </div>
    </section></div>`;

    const composerDraft = () => ({ message: root.querySelector("[data-admin-system-message]")?.value || "", senderLabel: cleanLabel(root.querySelector("[data-admin-system-sender]")?.value) });
    root.querySelectorAll("[data-admin-system-kind]").forEach((button) => button.addEventListener("click", () => renderSystemComposer(snapshot, { kind: button.dataset.adminSystemKind, targetId: "", ...composerDraft(), confirm: false })));
    root.querySelector("[data-admin-system-target]")?.addEventListener("change", (event) => renderSystemComposer(snapshot, { kind, targetId: event.target.value, ...composerDraft(), confirm: false }));
    root.querySelector("[data-admin-system-sender]")?.addEventListener("change", (event) => { event.currentTarget.value = cleanLabel(event.currentTarget.value); });
    root.querySelector("[data-admin-system-review]")?.addEventListener("click", () => {
      const message = String(root.querySelector("[data-admin-system-message]")?.value || "").trim();
      if (!message) {
        root.querySelector("[data-admin-system-message]")?.focus();
        return;
      }
      renderSystemComposer(snapshot, { kind, targetId, message, senderLabel: cleanLabel(root.querySelector("[data-admin-system-sender]")?.value), confirm: true });
    });
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest("[data-admin-chat-send]")) return void sendChat();
    if (target.closest("[data-admin-system-open]")) return void openSystemComposer();
    if (target.closest("[data-admin-system-history]")) return openSystemHistory();
    if (target.matches("[data-admin-comm-close]") || target.closest("[data-admin-comm-close]") && !target.closest(".admin-comm-modal-body")) closeModal();
  });

  rail.addEventListener("keydown", (event) => {
    if (!event.target?.matches?.("[data-admin-chat-input]")) return;
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      sendChat();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && ensureModalRoot().childElementCount) closeModal();
  });

  window.__BAEKJI_ADMIN_COMMUNICATIONS_MVP3__ = Object.freeze({
    sessionScopeKey,
    targetOptions,
    previewRecipients,
    mergeRows,
  });

  mountRail();
  poll();
})();
