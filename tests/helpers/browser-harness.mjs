import assert from "node:assert/strict";
import vm from "node:vm";

export function exactScriptPositions(html, urls) {
  const scripts = [];
  const pattern = /<script\b[^>]*\bsrc=(['"])(.*?)\1[^>]*>/gi;
  for (let match = pattern.exec(String(html)); match; match = pattern.exec(String(html))) {
    scripts.push({ src: match[2], index: match.index });
  }
  return urls.map((url) => {
    const matches = scripts.filter((script) => script.src === url);
    assert.equal(matches.length, 1, matches.length ? `duplicate exact script URL: ${url}` : `missing exact script URL: ${url}`);
    return matches[0].index;
  });
}

export function assertExactScriptOrder(html, urls, message = "exact script load order must be preserved") {
  const positions = exactScriptPositions(html, urls);
  positions.slice(1).forEach((position, index) => {
    assert.ok(positions[index] < position, `${message}: ${urls[index]} must precede ${urls[index + 1]}`);
  });
  return positions;
}

export function createStorage(seed = {}) {
  const values = new Map(Object.entries(seed));
  let reads = 0;
  let writes = 0;
  return {
    getItem(key) { reads += 1; return values.get(String(key)) ?? null; },
    setItem(key, value) { writes += 1; values.set(String(key), String(value)); },
    removeItem(key) { values.delete(String(key)); },
    value(key) { return values.get(String(key)) ?? null; },
    counts() { return { reads, writes }; },
  };
}

export function createEventHub() {
  const listeners = new Map();
  return {
    addEventListener(type, callback) {
      const entries = listeners.get(type) || [];
      entries.push(callback);
      listeners.set(type, entries);
    },
    removeEventListener(type, callback) {
      listeners.set(type, (listeners.get(type) || []).filter((entry) => entry !== callback));
    },
    dispatchEvent(event) {
      (listeners.get(event?.type) || []).slice().forEach((callback) => callback(event));
      return true;
    },
    count(type) { return (listeners.get(type) || []).length; },
  };
}

export function createControlledClock() {
  const timers = new Map();
  const microtasks = [];
  let nextId = 0;
  return {
    setTimeout(callback, delay = 0) { const id = ++nextId; timers.set(id, { callback, delay: Number(delay) || 0 }); return id; },
    clearTimeout(id) { timers.delete(id); },
    queueMicrotask(callback) { microtasks.push(callback); },
    flushMicrotasks() { while (microtasks.length) microtasks.shift()(); },
    runNextTimer() {
      const entry = timers.entries().next().value;
      if (!entry) return false;
      timers.delete(entry[0]);
      entry[1].callback();
      return true;
    },
    timerCount() { return timers.size; },
  };
}

// This creates only explicitly requested VM primitives. It intentionally does
// not model browser capture/once/stop propagation or due-time scheduling.
export function createBrowserContext({ localStorage, sessionStorage, events = null, clock = null, globals = {} } = {}) {
  const context = {
    console,
    ...globals,
  };
  if (typeof structuredClone === "function") context.structuredClone = structuredClone;
  if (localStorage !== undefined) context.localStorage = localStorage;
  if (sessionStorage !== undefined) context.sessionStorage = sessionStorage;
  if (clock) Object.assign(context, { queueMicrotask: clock.queueMicrotask, setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout });
  if (events) Object.assign(context, events);
  context.window = globals.window || context;
  return { context: vm.createContext(context), events, clock, localStorage, sessionStorage };
}

export function loadScripts(context, scripts) {
  scripts.forEach(({ source, filename }) => vm.runInContext(source, context, { filename }));
}
