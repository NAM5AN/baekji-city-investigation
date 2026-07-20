(() => {
  "use strict";

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const STATE_KEY = "day1_world";
  const WRITER_KEY = "baekji_city_cloud_writer_v1";
  const SUPABASE_URL = "https://zstgpnwnwmeifgmyeqtz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_g-cXysHfl260KTtSRLABTw_4wnaaxDY";
  const ACTIVE_POLL_MS = 1500;
  const HIDDEN_POLL_MS = 5000;
  const PUSH_DEBOUNCE_MS = 120;

  const storageProto = typeof Storage !== "undefined" ? Storage.prototype : null;
  const nativeSetItem = storageProto?.setItem;
  const nativeRemoveItem = storageProto?.removeItem;
  const nativeGetItem = storageProto?.getItem;

  let initialized = false;
  let applyingRemote = false;
  let revision = 0;
  let pendingRaw = null;
  let pushTimer = 0;
  let pushInFlight = false;
  let pollTimer = 0;

  function safeParse(raw) {
    try {
      const value = JSON.parse(raw || "null");
      return value?.version === 3 ? value : null;
    } catch {
      return null;
    }
  }

  function stableArrayKey(value) {
    if (value == null || typeof value !== "object") return `p:${JSON.stringify(value)}`;
    const direct = value.id ?? value.key ?? value.token ?? value.sequenceNo ?? value.sequence_no;
    if (direct != null) return `i:${String(direct)}`;
    return `o:${JSON.stringify([
      value.type ?? value.kind ?? value.eventType ?? "",
      value.at ?? value.createdAt ?? value.startedAt ?? "",
      value.actorId ?? value.actor_character_id ?? "",
      value.text ?? value.publicText ?? value.public_text ?? "",
      value.scopeKey ?? value.routeId ?? value.objectId ?? "",
    ])}`;
  }

  function mergeArrays(remote, local) {
    const output = [];
    const seen = new Map();
    [...(Array.isArray(remote) ? remote : []), ...(Array.isArray(local) ? local : [])].forEach((value) => {
      const key = stableArrayKey(value);
      if (!seen.has(key)) {
        seen.set(key, output.length);
        output.push(value);
        return;
      }
      const index = seen.get(key);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        output[index] = mergeValues(output[index], value);
      }
    });
    return output;
  }

  function mergeValues(remote, local) {
    if (Array.isArray(remote) || Array.isArray(local)) return mergeArrays(remote, local);
    if (remote && local && typeof remote === "object" && typeof local === "object") {
      const result = { ...remote };
      Object.keys(local).forEach((key) => {
        result[key] = key in remote ? mergeValues(remote[key], local[key]) : local[key];
      });
      return result;
    }
    return local === undefined ? remote : local;
  }

  function writerId() {
    let value = nativeGetItem?.call(localStorage, WRITER_KEY) || "";
    if (!value) {
      value = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      nativeSetItem?.call(localStorage, WRITER_KEY, value);
    }
    const userId = sessionStorage.getItem("baekji_city_mvp_current_user_v034") || "guest";
    return `${userId}:${value}`;
  }

  async function rpc(name, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`SYNC_RPC_${name}_${response.status}`);
      if (response.status === 204) return null;
      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function readRemoteState() {
    const rows = await rpc("baekji_mvp_get_state", { p_state_key: STATE_KEY });
    return Array.isArray(rows) ? rows[0] || null : rows || null;
  }

  async function readRemoteRevision() {
    const value = await rpc("baekji_mvp_get_revision", { p_state_key: STATE_KEY });
    return Number(value || 0);
  }

  async function putRemoteState(state, expectedRevision) {
    const rows = await rpc("baekji_mvp_put_state", {
      p_state_key: STATE_KEY,
      p_state: state,
      p_writer_id: writerId(),
      p_expected_revision: expectedRevision || null,
    });
    return Array.isArray(rows) ? rows[0] || null : rows || null;
  }

  function notifyStatus(status, detail = {}) {
    document.documentElement.dataset.cloudSyncStatus = status;
    window.dispatchEvent(new CustomEvent("baekji-cloud-sync", { detail: { status, revision, ...detail } }));
  }

  function dispatchExternalUpdate(oldValue, newValue) {
    try {
      window.dispatchEvent(new StorageEvent("storage", {
        key: GLOBAL_KEY,
        oldValue,
        newValue,
        storageArea: localStorage,
        url: location.href,
      }));
    } catch {
      const event = new Event("storage");
      Object.defineProperty(event, "key", { value: GLOBAL_KEY });
      window.dispatchEvent(event);
    }
  }

  function applyRemoteState(row) {
    const remote = row?.state;
    if (!remote || remote.version !== 3) return false;
    const nextRaw = JSON.stringify(remote);
    const oldRaw = nativeGetItem.call(localStorage, GLOBAL_KEY);
    revision = Number(row.revision || 0);
    if (oldRaw === nextRaw) return false;
    applyingRemote = true;
    try {
      nativeSetItem.call(localStorage, GLOBAL_KEY, nextRaw);
    } finally {
      applyingRemote = false;
    }
    dispatchExternalUpdate(oldRaw, nextRaw);
    return true;
  }

  function schedulePush(raw) {
    if (!safeParse(raw)) return;
    pendingRaw = raw;
    if (!initialized || applyingRemote) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(flushPush, PUSH_DEBOUNCE_MS);
  }

  async function flushPush() {
    if (!initialized || pushInFlight || !pendingRaw) return;
    const raw = pendingRaw;
    pendingRaw = null;
    const localState = safeParse(raw);
    if (!localState) return;
    pushInFlight = true;
    notifyStatus("saving");
    try {
      let result = await putRemoteState(localState, revision);
      if (result?.accepted === false && result.state?.version === 3) {
        const merged = mergeValues(result.state, localState);
        result = await putRemoteState(merged, Number(result.revision || 0));
        if (result?.accepted) {
          applyingRemote = true;
          try { nativeSetItem.call(localStorage, GLOBAL_KEY, JSON.stringify(merged)); }
          finally { applyingRemote = false; }
        }
      }
      if (result?.accepted) {
        revision = Number(result.revision || revision);
        notifyStatus("synced");
      } else {
        if (result?.state) applyRemoteState(result);
        notifyStatus("conflict");
      }
    } catch (error) {
      pendingRaw = pendingRaw || raw;
      notifyStatus("offline", { message: String(error?.message || error) });
    } finally {
      pushInFlight = false;
      if (pendingRaw) {
        clearTimeout(pushTimer);
        pushTimer = setTimeout(flushPush, 350);
      }
    }
  }

  async function pollOnce(forceFull = false) {
    if (!initialized || pushInFlight || pendingRaw) return;
    try {
      const remoteRevision = forceFull ? revision + 1 : await readRemoteRevision();
      if (!forceFull && (!remoteRevision || remoteRevision <= revision)) {
        notifyStatus("synced");
        return;
      }
      const row = await readRemoteState();
      if (!row) return;
      if (Number(row.revision || 0) > revision || forceFull) applyRemoteState(row);
      notifyStatus("synced");
    } catch (error) {
      notifyStatus("offline", { message: String(error?.message || error) });
    }
  }

  function schedulePoll(delay = document.hidden ? HIDDEN_POLL_MS : ACTIVE_POLL_MS) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(async () => {
      await pollOnce(false);
      schedulePoll();
    }, delay);
  }

  async function bootstrap() {
    notifyStatus("connecting");
    try {
      const row = await readRemoteState();
      if (row?.state?.version === 3) {
        pendingRaw = null;
        applyRemoteState(row);
      } else {
        const localRaw = pendingRaw || nativeGetItem.call(localStorage, GLOBAL_KEY);
        const localState = safeParse(localRaw);
        if (localState) {
          const created = await putRemoteState(localState, null);
          if (created?.state?.version === 3) {
            revision = Number(created.revision || 0);
            if (created.accepted === false) applyRemoteState(created);
          }
        }
      }
      initialized = true;
      notifyStatus("synced");
      if (pendingRaw) flushPush();
    } catch (error) {
      initialized = true;
      notifyStatus("offline", { message: String(error?.message || error) });
    }
    schedulePoll(600);
  }

  if (storageProto && nativeSetItem && nativeRemoveItem && nativeGetItem) {
    storageProto.setItem = function patchedSetItem(key, value) {
      nativeSetItem.call(this, key, value);
      if (this === localStorage && key === GLOBAL_KEY && !applyingRemote) schedulePush(String(value));
    };
    storageProto.removeItem = function patchedRemoveItem(key) {
      nativeRemoveItem.call(this, key);
      if (this === localStorage && key === GLOBAL_KEY && !applyingRemote) pendingRaw = null;
    };
  }

  window.addEventListener("online", () => { pollOnce(true); schedulePoll(250); });
  window.addEventListener("focus", () => { pollOnce(false); schedulePoll(250); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) pollOnce(false); schedulePoll(250); });
  window.addEventListener("beforeunload", () => { if (pendingRaw) flushPush(); });

  window.__BAEKJI_CLOUD_SYNC_TEST__ = Object.freeze({
    mergeValues,
    mergeArrays,
    safeParse,
    stableArrayKey,
  });

  bootstrap();
})();
