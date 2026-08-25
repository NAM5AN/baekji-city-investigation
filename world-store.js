(() => {
  "use strict";

  const { clone } = window.__BAEKJI_RUNTIME_UTILS__ || {};
  if (typeof clone !== "function") throw new Error("runtime-utils.js를 먼저 불러와야 합니다.");

  let current;
  let active = false;
  const subscribers = new Set();
  const queue = [];

  function copy(value) {
    return value === undefined ? undefined : clone(value);
  }

  function freezeDeep(value, seen = new Set()) {
    if (!value || typeof value !== "object" || seen.has(value)) return value;
    seen.add(value);
    Object.getOwnPropertyNames(value).forEach((key) => freezeDeep(value[key], seen));
    return Object.freeze(value);
  }

  function commit(next, reason) {
    const previous = current;
    current = freezeDeep(copy(next));
    [...subscribers].forEach((subscriber) => {
      if (!subscribers.has(subscriber)) return;
      try { subscriber(current, { reason, previous }); } catch { /* Subscribers cannot roll back a committed world snapshot. */ }
    });
    return current;
  }

  function runTransaction(reason, recipe) {
    const queueStart = queue.length;
    active = true;
    try {
      const draft = copy(current);
      const replacement = recipe(draft);
      return commit(replacement === undefined ? draft : replacement, reason);
    } catch (error) {
      queue.splice(queueStart);
      throw error;
    } finally {
      active = false;
    }
  }

  function drainQueue() {
    while (queue.length) {
      const next = queue.shift();
      try {
        runTransaction(next.reason, next.recipe);
      } catch {
        // A queued child is isolated: its rollback must not rethrow through an
        // already committed parent or prevent its FIFO siblings from running.
      }
    }
  }

  function get() {
    return current;
  }

  function transact(reason, recipe) {
    if (typeof recipe !== "function") throw new TypeError("WorldStore transact에는 recipe 함수가 필요합니다.");
    if (active) {
      queue.push({ reason, recipe });
      return current;
    }
    const result = runTransaction(reason, recipe);
    drainQueue();
    return result;
  }

  function subscribe(subscriber) {
    if (typeof subscriber !== "function") throw new TypeError("WorldStore subscribe에는 함수가 필요합니다.");
    let subscribed = true;
    subscribers.add(subscriber);
    return () => {
      if (!subscribed) return;
      subscribed = false;
      subscribers.delete(subscriber);
    };
  }

  window.__BAEKJI_WORLD_STORE__ = Object.freeze({ get, transact, subscribe });
})();
