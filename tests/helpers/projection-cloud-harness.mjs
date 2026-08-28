import fs from "node:fs";
import vm from "node:vm";

const cloudSource = fs.readFileSync(new URL("../../cloud-state-sync.js", import.meta.url), "utf8");
const persistenceSource = fs.readFileSync(new URL("../../world-persistence.js", import.meta.url), "utf8");
const USER_KEY = "baekji_city_mvp_current_user_v034";

export function projectionState(actorId, revision = 1, extra = {}) {
  return {
    version: 3,
    storyDay: 1,
    loopId: "LOOP-001",
    eventSeq: revision,
    sessionSeq: 0,
    characters: { [actorId]: { id: actorId, inventory: {}, currentPartyId: null, currentSessionId: null } },
    parties: {}, sessions: {},
    ...extra,
  };
}

export function createProjectionCloudHarness({ actorId = "actor-a", revision = 1, state = projectionState(actorId, revision), payloadActorId = actorId, responseStatus = 200 } = {}) {
  class Storage {
    constructor(values = new Map()) { this.values = values; this.writes = []; }
    getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; }
    setItem(key, value) { this.writes.push([String(key), String(value)]); this.values.set(String(key), String(value)); }
    removeItem(key) { this.writes.push([String(key), null]); this.values.delete(String(key)); }
  }
  // Keep the storage implementation deliberately small: the cloud runtime
  // must not patch it, so each test can inspect direct writes exactly.
  Storage.prototype.getItem = function getItem(key) { return this.values.has(String(key)) ? this.values.get(String(key)) : null; };

  const localStorage = new Storage();
  const sessionStorage = new Storage(new Map(actorId ? [[USER_KEY, actorId]] : []));
  const listeners = new Map();
  const timers = new Map(); let timerId = 0;
  const fetchCalls = [];
  const channels = [];
  class Event { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } }
  class CustomEvent extends Event { constructor(type, init = {}) { super(type, init); this.detail = init.detail; } }
  class BroadcastChannel {
    constructor(name) { this.name = name; this.listeners = new Map(); this.messages = []; channels.push(this); }
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    postMessage(message) { this.messages.push(structuredClone(message)); }
    receive(message) { this.listeners.get("message")?.({ data: message }); }
  }
  let currentState = structuredClone(state), currentRevision = revision, currentActor = payloadActorId, currentStatus = responseStatus;
  const context = vm.createContext({
    console, structuredClone, Storage, localStorage, sessionStorage, BroadcastChannel,
    Event, CustomEvent, AbortController,
    navigator: { onLine: true },
    document: { hidden: false, addEventListener() {} },
    setTimeout(callback, delay = 0) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    queueMicrotask,
    fetch: async (url, options = {}) => {
      fetchCalls.push({ url: String(url), options: structuredClone(options) });
      return {
        ok: currentStatus >= 200 && currentStatus < 300,
        status: currentStatus,
        json: async () => currentStatus >= 200 && currentStatus < 300
          ? { ok: true, actorId: currentActor, revision: currentRevision, state: structuredClone(currentState) }
          : { ok: false, code: "PLAYER_WORLD_UNAVAILABLE" },
      };
    },
  });
  context.window = context;
  context.addEventListener = (type, listener) => { const values = listeners.get(type) || []; values.push(listener); listeners.set(type, values); };
  context.dispatchEvent = (event) => { for (const listener of listeners.get(event.type) || []) listener(event); return true; };
  vm.runInContext(persistenceSource, context, { filename: "world-persistence.js" });
  vm.runInContext(cloudSource, context, { filename: "cloud-state-sync.js" });
  return {
    context, localStorage, sessionStorage, fetchCalls, channels, timers,
    cloud: context.__BAEKJI_CLOUD_SYNC__, persistence: context.__BAEKJI_WORLD_PERSISTENCE__,
    async settle() { for (let step = 0; step < 8; step += 1) await Promise.resolve(); },
    setProjection({ actor = currentActor, nextRevision = currentRevision, nextState = currentState, status = currentStatus } = {}) { currentActor = actor; currentRevision = nextRevision; currentState = structuredClone(nextState); currentStatus = status; },
    emit(type, detail = {}) { context.dispatchEvent(new CustomEvent(type, { detail })); },
  };
}
