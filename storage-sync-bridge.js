(() => {
  "use strict";
  if (typeof Storage === "undefined") return;
  window.__BAEKJI_SYNC_SET_ITEM__ = Storage.prototype.setItem;
  window.__BAEKJI_SYNC_GET_ITEM__ = Storage.prototype.getItem;
})();
