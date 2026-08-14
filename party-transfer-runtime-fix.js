(() => {
  "use strict";
  const { uniqueArray: unique } = window.__BAEKJI_RUNTIME_UTILS__;

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const SESSION_PROFILE_KEY = "baekji_city_tester_session_profile_v1";
  const LAST_INVESTIGATE_KEY = "baekji_city_party_transfer_last_investigate_v1";
  const HANDLED_KEY = "baekji_city_party_transfer_continuity_handled_v1";
  const VERSION = "0.3.82";
  const SUPABASE_URL = "https://kfgtvifupumjuewwxzmz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";
  const names = new Map([
    ["test_a", "테스트 캐릭터 A"],
    ["test_b", "테스트 캐릭터 B"],
    ["test_c", "테스트 캐릭터 C"],
  ]);

  function routeParts(hash = "") {
    return String(hash || "").replace(/^#\/?/, "").split("/").filter(Boolean);
  }

  function approvedTransfers(snapshot, userId) {
    return Object.values(snapshot?.partyTransferRequests || {})
      .filter((request) => request?.status === "APPROVED" && request?.requesterId === userId)
      .sort((a, b) => Number(b.resolvedAt || 0) - Number(a.resolvedAt || 0));
  }

  function continuationTarget(snapshot, userId, currentRoute = [], lastInvestigateSessionId = "", now = Date.now()) {
    const request = approvedTransfers(snapshot, userId)[0];
    if (!request) return "";
    const character = snapshot?.characters?.[userId];
    const targetSession = snapshot?.sessions?.[request.targetSessionId];
    if (!character || !targetSession || targetSession.status !== "ACTIVE") return "";
    if (character.currentSessionId !== request.targetSessionId || !unique(targetSession.memberIds).includes(userId)) return "";

    const page = currentRoute[0] || "home";
    const param = currentRoute[1] || "";
    if (page === "investigate" && param === request.sourceSessionId) return targetSession.id;
    if (page === "briefing" && param === request.targetSessionId) return targetSession.id;

    const justResolved = Number(request.resolvedAt || 0) > 0 && Math.abs(now - Number(request.resolvedAt || 0)) <= 15000;
    if ((page === "home" || page === "briefing") && justResolved && lastInvestigateSessionId === request.sourceSessionId) {
      return targetSession.id;
    }
    return "";
  }

  function replaceAccountIdsInText(text, lookup = names) {
    let output = String(text || "");
    lookup.forEach((name, id) => {
      if (id && name && output.includes(id)) output = output.split(id).join(name);
    });
    return output;
  }

  function isTransferLogText(text) {
    return /조사조 소속이 .*조사조로 이동되었다/.test(String(text || ""));
  }

  const TEST_API = Object.freeze({
    routeParts,
    approvedTransfers,
    continuationTarget,
    replaceAccountIdsInText,
    isTransferLogText,
  });
  if (typeof window !== "undefined") window.__BAEKJI_PARTY_TRANSFER_RUNTIME_FIX_TEST__ = TEST_API;
  if (typeof document === "undefined" || typeof localStorage === "undefined" || typeof sessionStorage === "undefined") return;

  let directoryPromise = null;
  let decorateQueued = false;

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

  function currentSessionProfile() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_PROFILE_KEY) || "null"); }
    catch { return null; }
  }

  function rememberSelfName() {
    const profile = currentSessionProfile();
    if (profile?.id && (profile.name || profile.loginId)) names.set(String(profile.id), String(profile.name || profile.loginId));
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
        if (row?.id && row?.character_name) names.set(String(row.id), String(row.character_name));
      });
      scheduleDecorate();
    }).catch(() => {});
    return directoryPromise;
  }

  function handledIds() {
    try { return new Set(JSON.parse(sessionStorage.getItem(HANDLED_KEY) || "[]")); }
    catch { return new Set(); }
  }

  function markHandled(requestId) {
    if (!requestId) return;
    const ids = handledIds();
    ids.add(requestId);
    sessionStorage.setItem(HANDLED_KEY, JSON.stringify([...ids].slice(-80)));
  }

  function latestRequest(snapshot, userId) {
    return approvedTransfers(snapshot, userId)[0] || null;
  }

  function rememberInvestigateRoute() {
    const route = routeParts(location.hash);
    if (route[0] === "investigate" && route[1]) sessionStorage.setItem(LAST_INVESTIGATE_KEY, route[1]);
  }

  function maybeContinue(snapshot) {
    const userId = currentUserId();
    if (!snapshot || !userId) return false;
    const request = latestRequest(snapshot, userId);
    if (!request || handledIds().has(request.id)) return false;
    const currentRoute = routeParts(location.hash);
    if (currentRoute[0] === "investigate" && currentRoute[1] === request.targetSessionId) {
      markHandled(request.id);
      sessionStorage.setItem(LAST_INVESTIGATE_KEY, request.targetSessionId);
      return false;
    }
    const lastInvestigate = String(sessionStorage.getItem(LAST_INVESTIGATE_KEY) || "");
    const target = continuationTarget(snapshot, userId, currentRoute, lastInvestigate, Date.now());
    if (!target) return false;
    markHandled(request.id);
    sessionStorage.setItem(LAST_INVESTIGATE_KEY, target);
    const nextHash = `#/investigate/${target}`;
    if (location.hash !== nextHash) location.hash = nextHash;
    return true;
  }

  function replaceTextNodes(root) {
    if (!root || !isTransferLogText(root.textContent)) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const next = replaceAccountIdsInText(node.nodeValue, names);
      if (next !== node.nodeValue) node.nodeValue = next;
    });
  }

  function decorateTransferLogs() {
    decorateQueued = false;
    rememberSelfName();
    document.querySelectorAll(".retro-system-line").forEach(replaceTextNodes);
  }

  function scheduleDecorate() {
    if (decorateQueued) return;
    decorateQueued = true;
    queueMicrotask(decorateTransferLogs);
  }

  rememberSelfName();
  rememberInvestigateRoute();
  loadDirectory();

  window.addEventListener("storage", (event) => {
    if (event.key && event.key !== GLOBAL_KEY) return;
    const snapshot = readState(event.newValue || null);
    maybeContinue(snapshot);
    scheduleDecorate();
  }, true);

  window.addEventListener("hashchange", () => {
    rememberInvestigateRoute();
    maybeContinue(readState());
    scheduleDecorate();
  });
  window.addEventListener("baekji-cloud-sync", () => { maybeContinue(readState()); scheduleDecorate(); });
  window.addEventListener("baekji-party-transfer", () => { maybeContinue(readState()); scheduleDecorate(); });

  const app = document.getElementById("app");
  if (app && typeof MutationObserver === "function") {
    new MutationObserver(scheduleDecorate).observe(app, { childList: true, subtree: true });
  }

  setInterval(() => { maybeContinue(readState()); scheduleDecorate(); }, 1000);
  scheduleDecorate();
})();
