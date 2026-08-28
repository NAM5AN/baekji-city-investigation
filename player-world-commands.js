(() => {
  "use strict";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const OUTBOX_PREFIX = "baekji_player_command_outbox_v1:";
  let revision = 0;
  let flushing = false;

  function asRevision(value) {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
  }

  function newCommandId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    const bytes = globalThis.crypto?.getRandomValues?.(new Uint8Array(16));
    if (!bytes) throw new Error("COMMAND_ID_UNAVAILABLE");
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }

  function isTransient(status) {
    return status === 0 || status === 502 || status === 503 || status === 504;
  }

  function currentUserId() {
    try { return String(sessionStorage.getItem(USER_KEY) || ""); }
    catch { return ""; }
  }

  function outboxKey() {
    const userId = currentUserId();
    return userId ? `${OUTBOX_PREFIX}${userId}` : "";
  }

  function readOutbox() {
    const key = outboxKey();
    if (!key) return [];
    try {
      const rows = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(rows) ? rows.filter((row) => row?.body?.commandId && row?.body?.command) : [];
    } catch { return []; }
  }

  function writeOutbox(rows) {
    const key = outboxKey();
    if (!key) return;
    if (!rows.length) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(rows.slice(-100)));
  }

  function enqueue(body) {
    const rows = readOutbox();
    if (!rows.some((row) => row.body.commandId === body.commandId)) rows.push({ body, queuedAt: Date.now(), status: "PENDING" });
    writeOutbox(rows);
    window.dispatchEvent(new CustomEvent("baekji-world-command-queued", { detail: Object.freeze({ commandId: body.commandId, command: body.command }) }));
    return { ok: true, status: "QUEUED", revision: body.expectedRevision, commandId: body.commandId };
  }

  function removeQueued(commandId) {
    writeOutbox(readOutbox().filter((row) => row.body.commandId !== commandId));
  }

  function replaceQueued(commandId, update) {
    let changed = false;
    const rows = readOutbox().map((row) => {
      if (row.body.commandId !== commandId) return row;
      changed = true;
      return update(row);
    });
    if (changed) writeOutbox(rows);
    return changed;
  }

  function markQueuedConflict(commandId, result) {
    replaceQueued(commandId, (row) => ({
      ...row,
      status: "CONFLICT",
      conflictedAt: Date.now(),
      conflictRevision: asRevision(result?.revision),
    }));
  }

  function conflicts() {
    return readOutbox()
      .filter((row) => row.status === "CONFLICT")
      .map((row) => Object.freeze({
        commandId: row.body.commandId,
        command: row.body.command,
        payload: row.body.payload,
        queuedAt: row.queuedAt,
        conflictedAt: row.conflictedAt,
        revision: row.conflictRevision,
      }));
  }

  function discardConflict(commandId) {
    const row = readOutbox().find((candidate) => candidate.body.commandId === commandId && candidate.status === "CONFLICT");
    if (!row) return false;
    removeQueued(commandId);
    window.dispatchEvent(new CustomEvent("baekji-world-command-conflict-resolved", {
      detail: Object.freeze({ commandId, command: row.body.command, resolution: "DISCARDED" }),
    }));
    queueMicrotask(() => flushOutbox().catch(() => {}));
    return true;
  }

  async function retryConflict(commandId) {
    const gate = window.__BAEKJI_CLOUD_SYNC__;
    if (!gate?.canDispatchAuthoritativeCommand?.()) throw new Error("WORLD_COMMAND_SYNC_NOT_READY");
    const row = readOutbox().find((candidate) => candidate.body.commandId === commandId && candidate.status === "CONFLICT");
    if (!row) return false;
    replaceQueued(commandId, (current) => ({ ...current, status: "RETRY", retryRequestedAt: Date.now() }));
    return flushOutbox();
  }

  async function postCommand(body) {
    let response;
    try {
      response = await fetch("/api/player-world-command", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      });
    } catch (error) {
      error.transient = true;
      throw error;
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload?.ok) {
      const error = new Error(String(payload?.code || `WORLD_COMMAND_${response.status}`));
      error.status = response.status;
      error.transient = isTransient(response.status);
      throw error;
    }
    return payload;
  }

  async function dispatch(command, payload = {}) {
    const catalog = window.__BAEKJI_PLAYER_WORLD_COMMAND_CATALOG__;
    if (!catalog?.hasCommand?.(command)) throw new Error("WORLD_COMMAND_UNSUPPORTED");
    const canonicalPayload = catalog.canonicalizePayload(command, payload);
    if (!canonicalPayload) throw new Error("WORLD_COMMAND_INVALID_PAYLOAD");
    const gate = window.__BAEKJI_CLOUD_SYNC__;
    if (typeof gate?.canDispatchAuthoritativeCommand === "function" && !gate.canDispatchAuthoritativeCommand()) {
      if (globalThis.navigator?.onLine === false && currentUserId()) {
        return enqueue({ commandId: newCommandId(), expectedRevision: asRevision(gate?.revision?.() ?? revision), command, payload: canonicalPayload });
      }
      throw new Error("WORLD_COMMAND_SYNC_NOT_READY");
    }
    const lease = gate?.begin?.();
    if (!lease?.ready) throw new Error("WORLD_COMMAND_SYNC_NOT_READY");
    const body = {
      commandId: newCommandId(),
      expectedRevision: lease.revision,
      command,
      payload: canonicalPayload,
    };
    let attempts = 0;
    while (true) {
      try {
        const result = await postCommand(body);
        const eventName = result.status === "REVISION_CONFLICT" ? "baekji-world-command-conflict" : "baekji-world-command-applied";
        const settled = await gate.complete?.(lease, result.status, result.revision);
        // The server can commit while the follow-up refresh is offline. Do not
        // announce success until cloud has authoritatively settled that result.
        if (settled === false) {
          const error = new Error("WORLD_COMMAND_SYNC_NOT_READY");
          error.settlementPending = true;
          throw error;
        }
        revision = asRevision(result.revision);
        window.dispatchEvent(new CustomEvent(eventName, { detail: Object.freeze({ ...result }) }));
        return result;
      } catch (error) {
        // complete() retained its lease and scheduled authoritative recovery;
        // issuing another command id here could duplicate the server action.
        if (error?.settlementPending) throw error;
        if (!error?.transient || attempts >= 1) {
          await gate.fail?.(lease);
          if (error?.transient && currentUserId()) return enqueue(body);
          throw error;
        }
        attempts += 1;
      }
    }
  }

  async function flushOutbox() {
    if (flushing || globalThis.navigator?.onLine === false) return false;
    const gate = window.__BAEKJI_CLOUD_SYNC__;
    if (!gate?.canDispatchAuthoritativeCommand?.()) return false;
    flushing = true;
    try {
      for (const row of readOutbox()) {
        if (row.status === "CONFLICT") break;
        const lease = gate.begin?.();
        if (!lease?.ready) break;
        try {
          const body = row.status === "RETRY"
            ? { ...row.body, expectedRevision: asRevision(lease.revision) }
            : row.body;
          if (row.status === "RETRY") {
            replaceQueued(row.body.commandId, (current) => ({
              ...current,
              body,
              status: "PENDING",
              retriedAt: Date.now(),
            }));
          }
          const result = await postCommand(body);
          const settled = await gate.complete?.(lease, result.status, result.revision);
          if (settled === false) break;
          revision = asRevision(result.revision);
          const eventName = result.status === "REVISION_CONFLICT" ? "baekji-world-command-conflict" : "baekji-world-command-applied";
          if (result.status === "REVISION_CONFLICT") {
            markQueuedConflict(row.body.commandId, result);
            window.dispatchEvent(new CustomEvent(eventName, { detail: Object.freeze({ ...result, fromOutbox: true, retained: true }) }));
            break;
          }
          removeQueued(row.body.commandId);
          window.dispatchEvent(new CustomEvent(eventName, { detail: Object.freeze({ ...result, fromOutbox: true }) }));
        } catch (error) {
          await gate.fail?.(lease);
          if (!error?.transient) removeQueued(row.body.commandId);
          break;
        }
      }
      return true;
    } finally {
      flushing = false;
    }
  }

  window.addEventListener("baekji-cloud-sync", (event) => {
    revision = asRevision(event?.detail?.revision);
    if (event?.detail?.ready) queueMicrotask(() => flushOutbox().catch(() => {}));
  });
  window.addEventListener("online", () => flushOutbox().catch(() => {}));
  window.addEventListener("storage", (event) => { if (event.key === outboxKey()) flushOutbox().catch(() => {}); });

  window.__BAEKJI_PLAYER_WORLD_COMMANDS__ = Object.freeze({
    dispatch,
    conflicts,
    discardConflict,
    flushOutbox,
    queued: () => readOutbox().length,
    retryConflict,
    revision: () => revision,
  });
})();
