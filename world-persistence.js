(() => {
  "use strict";

  const KEY = "baekji_city_mvp_state_v3";

  function readRaw() {
    return localStorage.getItem(KEY);
  }

  function writeRaw(value) {
    return localStorage.setItem(KEY, value);
  }

  window.__BAEKJI_WORLD_PERSISTENCE__ = Object.freeze({
    key: KEY,
    readRaw,
    writeRaw,
  });
})();
