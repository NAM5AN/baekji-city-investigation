(() => {
  "use strict";

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const VERSION = "0.3.91";
  const EDITABLE_STATUSES = new Set(["RECRUITING", "COMPOSITION_CONFIRMED", "READY_CHECK"]);
  const DEFAULT_NAME_RE = /^해오름역 조사조\s+\d+$/;
  const DEMO_NAMES = {
    test_a: "테스트 캐릭터 A",
    test_b: "테스트 캐릭터 B",
    test_c: "테스트 캐릭터 C",
  };

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function unique(values) {
    return [...new Set(Array.isArray(values) ? values : [])];
  }

  function isDefaultPartyName(name) {
    return DEFAULT_NAME_RE.test(String(name || "").trim());
  }

  function renamePartyState(snapshot, partyId, leaderId, nextName, at = Date.now()) {
    const draft = clone(snapshot);
    const party = draft?.parties?.[partyId];
    const clean = String(nextName || "").trim().replace(/\s+/g, " ");
    if (!party || party.creatorId !== leaderId || party.sessionId || !EDITABLE_STATUSES.has(String(party.status || ""))) return draft;
    if (!clean || clean.length > 24) return draft;
    party.name = clean;
    party.nameCustomized = true;
    party.nameCustomizedAt = Number(at || Date.now());
    party.flowRevision = Math.max(0, Number(party.flowRevision || 0)) + 1;
    return draft;
  }

  function partyDisplayName(snapshot, partyOrSession, nameResolver = () => "") {
    const party = partyOrSession?.memberIds && partyOrSession?.creatorId
      ? partyOrSession
      : snapshot?.parties?.[partyOrSession?.partyId || partyOrSession?.id || partyOrSession] || null;
    if (!party) return "다른 조사조";
    const raw = String(party.name || "").trim();
    if (party.nameCustomized === true || (raw && !isDefaultPartyName(raw))) return raw || "다른 조사조";
    const members = unique(party.memberIds);
    if (members.length === 1) {
      const memberName = String(nameResolver(members[0]) || "").trim();
      if (memberName) return memberName;
    }
    return raw || "다른 조사조";
  }

  const TEST_API = { isDefaultPartyName, renamePartyState, partyDisplayName };
  if (typeof window !== "undefined") window.__BAEKJI_PARTY_NAME_UI_TEST__ = TEST_API;
  if (typeof document === "undefined" || typeof localStorage === "undefined" || typeof sessionStorage === "undefined") return;

  let refreshQueued = false;
  let observer = null;
  let editingPartyId = "";

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

  function testerName(userId) {
    const id = String(userId || "");
    const tester = window.__BAEKJI_TESTER_REGISTRY_GUARD__?.values?.().find?.((user) => String(user?.id || "") === id);
    if (tester?.name) return String(tester.name);
    if (DEMO_NAMES[id]) return DEMO_NAMES[id];
    try {
      const saved = JSON.parse(sessionStorage.getItem("baekji_city_tester_session_profile_v1") || "null");
      if (String(saved?.id || "") === id && saved?.name) return String(saved.name);
    } catch { /* ignore */ }
    return "";
  }

  function dispatchStateUpdate(oldRaw, newRaw) {
    if (oldRaw === newRaw) return;
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
      Object.defineProperty(event, "oldValue", { value: oldRaw });
      Object.defineProperty(event, "newValue", { value: newRaw });
      window.dispatchEvent(event);
    }
    window.dispatchEvent(new CustomEvent("baekji-party-name-change", { detail: { version: VERSION } }));
  }

  function writeRenamedParty(partyId, name) {
    const snapshot = readState();
    const userId = currentUserId();
    if (!snapshot || !userId) return false;
    const before = snapshot.parties?.[partyId];
    const next = renamePartyState(snapshot, partyId, userId, name, Date.now());
    const after = next.parties?.[partyId];
    if (!before || !after || after.name === before.name && before.nameCustomized === true) return false;
    const oldRaw = localStorage.getItem(GLOBAL_KEY);
    const newRaw = JSON.stringify(next);
    localStorage.setItem(GLOBAL_KEY, newRaw);
    dispatchStateUpdate(oldRaw, newRaw);
    stabilizePaint(next, userId);
    return true;
  }

  function homeInviteCard() {
    return [...document.querySelectorAll("main section.card, main article.card")].find((card) =>
      String(card.querySelector("h2")?.textContent || "").trim() === "받은 초대"
    ) || null;
  }

  function hideImpossibleInviteCard(snapshot, userId) {
    const [page] = routeParts();
    if (page !== "home") return;
    const partyId = snapshot?.characters?.[userId]?.currentPartyId;
    const card = homeInviteCard();
    if (!card) return;
    if (partyId) {
      card.hidden = true;
      card.style.display = "none";
      card.dataset.partyUiHiddenInvite = "true";
    } else if (card.dataset.partyUiHiddenInvite === "true") {
      card.hidden = false;
      card.style.removeProperty("display");
      delete card.dataset.partyUiHiddenInvite;
    }
  }

  function ensureReadyBackButton(party) {
    if (party?.status !== "READY_CHECK" || party.sessionId) return;
    const actionRow = document.querySelector("[data-ready]")?.closest(".button-row")
      || document.querySelector("[data-start-session]")?.closest(".button-row");
    if (!actionRow || actionRow.querySelector("[data-party-preflight-back-confirmed]")) return;
    const back = document.createElement("button");
    back.type = "button";
    back.className = "button party-flow-back party-preflight-back";
    back.dataset.partyPreflightBackConfirmed = party.id;
    back.textContent = "← 이전 단계";
    actionRow.prepend(back);
  }

  function ensurePartyNameControl(party, userId) {
    const [page, partyId] = routeParts();
    if (page !== "party" || partyId !== party?.id || party.creatorId !== userId || party.sessionId || !EDITABLE_STATUSES.has(String(party.status || ""))) return;
    const hero = document.querySelector("main.container.narrow .hero");
    const heading = hero?.querySelector("h1");
    if (!hero || !heading) return;
    if (heading.textContent !== String(party.name || "")) heading.textContent = String(party.name || "");

    let row = hero.querySelector(".party-name-heading-row");
    if (!row) {
      row = document.createElement("div");
      row.className = "party-name-heading-row";
      heading.before(row);
      row.append(heading);
    }
    let button = row.querySelector("[data-party-name-edit]");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "party-name-edit-button";
      button.dataset.partyNameEdit = party.id;
      button.innerHTML = '<span class="party-name-pencil" aria-hidden="true">✎</span><span>조 이름 변경</span>';
      row.append(button);
    }
    button.dataset.partyNameEdit = party.id;
  }

  function stabilizePaint(snapshot = readState(), userId = currentUserId()) {
    if (!snapshot || !userId) return;
    hideImpossibleInviteCard(snapshot, userId);
    const [page, partyId] = routeParts();
    if (page === "party" && partyId) {
      const party = snapshot.parties?.[partyId];
      if (party?.creatorId === userId) {
        ensureReadyBackButton(party);
        ensurePartyNameControl(party, userId);
      }
    }
    document.documentElement.dataset.partyUiStabilityVersion = VERSION;
  }

  function schedulePaint() {
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      stabilizePaint();
    });
  }

  function closeEditor() {
    document.querySelector("[data-party-name-edit-backdrop]")?.remove();
    editingPartyId = "";
  }

  function openEditor(partyId) {
    const snapshot = readState();
    const userId = currentUserId();
    const party = snapshot?.parties?.[partyId];
    if (!party || party.creatorId !== userId || party.sessionId || !EDITABLE_STATUSES.has(String(party.status || ""))) return;
    closeEditor();
    editingPartyId = partyId;
    const backdrop = document.createElement("div");
    backdrop.className = "party-name-edit-backdrop";
    backdrop.dataset.partyNameEditBackdrop = "";
    backdrop.innerHTML = `
      <section class="party-name-edit-modal" role="dialog" aria-modal="true" aria-labelledby="party-name-edit-title">
        <h2 id="party-name-edit-title">조사조 이름 변경</h2>
        <p>조원 구성 · 구성 확정 · 전원 준비 단계에서 자유롭게 변경할 수 있습니다.</p>
        <input class="party-name-edit-input" data-party-name-input maxlength="24" autocomplete="off" aria-label="조사조 이름" />
        <div class="party-name-edit-error" data-party-name-error aria-live="polite"></div>
        <div class="party-name-edit-actions">
          <button type="button" class="button" data-party-name-cancel>취소</button>
          <button type="button" class="button primary" data-party-name-save>변경 저장</button>
        </div>
      </section>`;
    document.body.append(backdrop);
    const input = backdrop.querySelector("[data-party-name-input]");
    input.value = String(party.name || "");
    requestAnimationFrame(() => { input.focus(); input.select(); });
  }

  function saveEditor() {
    const input = document.querySelector("[data-party-name-input]");
    const error = document.querySelector("[data-party-name-error]");
    const clean = String(input?.value || "").trim().replace(/\s+/g, " ");
    if (!clean) {
      if (error) error.textContent = "조사조 이름을 1자 이상 입력해 주세요.";
      input?.focus();
      return;
    }
    if (clean.length > 24) {
      if (error) error.textContent = "조사조 이름은 24자 이내로 입력해 주세요.";
      input?.focus();
      return;
    }
    const partyId = editingPartyId;
    if (!partyId || !writeRenamedParty(partyId, clean)) {
      const snapshot = readState();
      if (snapshot?.parties?.[partyId]?.name === clean) closeEditor();
      else if (error) error.textContent = "현재 단계에서는 이름을 변경할 수 없습니다.";
      return;
    }
    closeEditor();
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const edit = target.closest("[data-party-name-edit]");
    if (edit) {
      event.preventDefault();
      event.stopPropagation();
      openEditor(String(edit.dataset.partyNameEdit || ""));
      return;
    }
    if (target.closest("[data-party-name-save]")) {
      event.preventDefault();
      saveEditor();
      return;
    }
    if (target.closest("[data-party-name-cancel]") || target.matches("[data-party-name-edit-backdrop]")) {
      event.preventDefault();
      closeEditor();
    }
  }, true);

  document.addEventListener("keydown", (event) => {
    if (!editingPartyId) return;
    if (event.key === "Escape") closeEditor();
    if (event.key === "Enter" && event.target?.matches?.("[data-party-name-input]")) {
      event.preventDefault();
      saveEditor();
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key && event.key !== GLOBAL_KEY) return;
    stabilizePaint(readState(event.newValue || null), currentUserId());
  });
  window.addEventListener("baekji-party-preflight-flow", schedulePaint);
  window.addEventListener("baekji-party-flow-ux", schedulePaint);
  window.addEventListener("baekji-party-membership", schedulePaint);
  window.addEventListener("hashchange", schedulePaint);

  const app = document.getElementById("app");
  if (app) {
    observer = new MutationObserver(schedulePaint);
    observer.observe(app, { childList: true, subtree: true });
  }

  window.__BAEKJI_PARTY_NAME_UI__ = Object.freeze({
    version: VERSION,
    displayName: (snapshot, partyOrSession) => partyDisplayName(snapshot, partyOrSession, testerName),
    testerName,
    stabilizePaint,
  });
  stabilizePaint();
})();
