(() => {
  "use strict";

  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const ACTIVE_POLL_MS = 1500;
  const HIDDEN_POLL_MS = 6000;
  const RETRY_MS = 1800;
  const persistence = window.__BAEKJI_WORLD_PERSISTENCE__;
  if (!persistence?.replaceRemoteRaw) return;

  let revision = 0;
  let actorId = "";
  let initialized = false;
  let refreshInFlight = null;
  let commandLease = null;
  let identityGeneration = 0;
  let pollTimer = 0;
  let leaseSequence = 0;
  const channel = typeof BroadcastChannel === "function" ? new BroadcastChannel("baekji-player-world-v1") : null;

  function currentUserId() {
    try { return String(sessionStorage.getItem(USER_KEY) || ""); }
    catch { return ""; }
  }

  function safeParse(raw) {
    try {
      const value = typeof raw === "string" ? JSON.parse(raw) : raw;
      return value && value.version === 3 && typeof value.characters === "object" && typeof value.parties === "object" && typeof value.sessions === "object" ? value : null;
    } catch { return null; }
  }

  function schedulePoll(delay = document.hidden ? HIDDEN_POLL_MS : ACTIVE_POLL_MS) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async () => {
      if (currentUserId()) await refreshProjection({ reason: "poll", quiet: true }).catch(() => {});
      schedulePoll();
    }, delay);
  }

  function emitSync(reason) {
    window.dispatchEvent(new CustomEvent("baekji-cloud-sync", {
      detail: Object.freeze({ revision, actorId, ready: initialized, reason }),
    }));
  }

  function resetIdentity({ clearRemote = true } = {}) {
    identityGeneration += 1;
    initialized = false;
    revision = 0;
    actorId = "";
    commandLease = null;
    if (clearRemote) persistence.clearRemoteRaw?.();
    emitSync("identity-reset");
  }

  function validProjection(payload) {
    const nextRevision = Number(payload?.revision);
    const nextActorId = String(payload?.actorId || "");
    const state = safeParse(payload?.state);
    return Number.isSafeInteger(nextRevision) && nextRevision >= 0 && nextActorId && state?.characters?.[nextActorId]
      ? { revision: nextRevision, actorId: nextActorId, state }
      : null;
  }

  function applyProjection(payload, reason = "refresh") {
    const projection = validProjection(payload);
    const expectedActorId = currentUserId();
    if (!projection || !expectedActorId || projection.actorId !== expectedActorId) return false;
    const beforeRevision = revision;
    persistence.replaceRemoteRaw(JSON.stringify(projection.state));
    revision = projection.revision;
    actorId = projection.actorId;
    initialized = true;
    emitSync(reason);
    if (revision > beforeRevision && reason !== "cross-tab") channel?.postMessage?.({ type: "revision", revision, actorId });
    return true;
  }

  async function requestProjection() {
    const response = await fetch("/api/player-world-projection", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) {
      const error = new Error(String(payload?.code || `PLAYER_WORLD_${response.status}`));
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function refreshProjection({ minRevision = 0, reason = "refresh", quiet = false } = {}) {
    const generation = identityGeneration;
    if (!currentUserId()) return false;
    if (!refreshInFlight) {
      refreshInFlight = (async () => {
        try {
          const payload = await requestProjection();
          if (generation !== identityGeneration) return false;
          if (!applyProjection(payload, reason)) throw new Error("PLAYER_WORLD_IDENTITY_MISMATCH");
          return true;
        } catch (error) {
          if (error?.status === 401 && generation === identityGeneration) resetIdentity();
          if (!quiet) emitSync("refresh-failed");
          throw error;
        } finally {
          refreshInFlight = null;
        }
      })();
    }
    const refreshed = await refreshInFlight;
    if (!refreshed || revision < Number(minRevision || 0)) {
      const error = new Error("PLAYER_WORLD_REVISION_PENDING");
      error.transient = true;
      throw error;
    }
    return true;
  }

  function canDispatchAuthoritativeCommand() {
    const current = currentUserId();
    return Boolean(initialized && current && actorId === current && !refreshInFlight && !commandLease && globalThis.navigator?.onLine !== false);
  }

  function beginCommand() {
    if (!canDispatchAuthoritativeCommand()) return Object.freeze({ ready: false, revision });
    commandLease = Object.freeze({ ready: true, id: ++leaseSequence, revision, actorId, generation: identityGeneration });
    return commandLease;
  }

  function ownsLease(lease) {
    return Boolean(lease?.ready && commandLease?.id === lease.id && lease.actorId === actorId && lease.generation === identityGeneration);
  }

  async function finishCommand(lease, status, minRevision = 0) {
    if (!ownsLease(lease)) return false;
    try {
      await refreshProjection({ minRevision, reason: `command-${String(status || "unknown").toLowerCase()}` });
      return ownsLease(lease);
    } finally {
      if (commandLease?.id === lease.id) commandLease = null;
    }
  }

  async function failCommand(lease) {
    if (commandLease?.id === lease?.id) commandLease = null;
    if (currentUserId()) refreshProjection({ reason: "command-failed", quiet: true }).catch(() => {});
    return true;
  }

  function adoptIdentity(event) {
    const nextId = String(event?.detail?.user?.id || currentUserId());
    if (!nextId) return;
    if (actorId && actorId !== nextId) resetIdentity();
    refreshProjection({ reason: "session-adopted" }).catch(() => setTimeout(() => refreshProjection({ reason: "session-retry", quiet: true }).catch(() => {}), RETRY_MS));
  }

  channel?.addEventListener?.("message", (event) => {
    const message = event?.data;
    if (message?.type !== "revision" || message.actorId !== currentUserId() || Number(message.revision) <= revision) return;
    refreshProjection({ minRevision: Number(message.revision), reason: "cross-tab", quiet: true }).catch(() => {});
  });
  window.addEventListener("baekji-player-session-adopted", adoptIdentity);
  window.addEventListener("baekji-player-session-ready", (event) => {
    if (event?.detail?.user) adoptIdentity(event);
    else resetIdentity();
  });
  window.addEventListener("baekji-player-session-logged-out", () => resetIdentity());
  window.addEventListener("online", () => refreshProjection({ reason: "online", quiet: true }).catch(() => {}));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && currentUserId()) refreshProjection({ reason: "visible", quiet: true }).catch(() => {});
    schedulePoll();
  });
  window.addEventListener("pageshow", () => { if (currentUserId()) refreshProjection({ reason: "pageshow", quiet: true }).catch(() => {}); });

  window.__BAEKJI_CLOUD_SYNC__ = Object.freeze({
    canDispatchAuthoritativeCommand,
    begin: beginCommand,
    complete: finishCommand,
    fail: failCommand,
    refresh: refreshProjection,
    revision: () => revision,
    actorId: () => actorId,
  });
  window.__BAEKJI_CLOUD_SYNC_TEST__ = Object.freeze({ safeParse, validProjection, applyProjection, refreshProjection, resetIdentity });

  if (currentUserId()) refreshProjection({ reason: "bootstrap", quiet: true }).catch(() => {});
  schedulePoll();
})();
