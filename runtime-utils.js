(() => {
  "use strict";

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function uniqueArray(values) {
    return [...new Set(Array.isArray(values) ? values : [])];
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function clamp(raw, min, max) {
    return Math.min(max, Math.max(min, raw));
  }

  function hashNumber(value) {
    let hash = 2166136261;
    for (const ch of String(value)) {
      hash ^= ch.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0);
  }

  window.__BAEKJI_RUNTIME_UTILS__ = Object.freeze({ clone, uniqueArray, escapeHtml, clamp, hashNumber });
})();
