(() => {
  "use strict";

  if (window.__BAEKJI_ADMIN_SHELL__) return;

  const SNAPSHOT_API = "/api/admin-snapshot";
  const POLL_MS = 3000;
  const TABS = new Set(["overview", "zones", "parties", "characters", "logs"]);
  const tabListeners = new Set();
  const modalListeners = new Set();
  const snapshotListeners = new Set();
  const captureListeners = new Set();
  let activeTab = "overview";
  let modalOwner = "";
  let modalOpen = false;
  let latestSnapshot = null;
  let refreshPromise = null;
  let forcedRefreshPromise = null;
  let pollTimer = 0;

  const roots = Object.freeze({
    panel: () => document.querySelector("[data-admin-panel]"),
    connection: () => document.querySelector("[data-admin-connection]"),
    worldMeta: () => document.querySelector("[data-admin-world-meta]"),
    tabs: () => document.querySelector("[data-admin-tabs]"),
    modal: () => document.getElementById("admin-modal-root"),
  });

  function emit(list, value) {
    list.forEach((listener) => {
      try { listener(value); } catch (error) { console.error("[admin shell] subscriber failed", error); }
    });
  }

  function syncTabClasses() {
    document.querySelectorAll("[data-admin-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.adminTab === activeTab);
    });
  }

  function setActiveTab(tab) {
    if (!TABS.has(tab)) return false;
    if (activeTab === tab) return true;
    activeTab = tab;
    syncTabClasses();
    emit(tabListeners, activeTab);
    return true;
  }

  function subscribe(set, listener, initialValue) {
    if (typeof listener !== "function") return () => {};
    set.add(listener);
    if (initialValue !== undefined) listener(initialValue);
    return () => set.delete(listener);
  }

  function renderModal(owner, markup) {
    const root = roots.modal();
    if (!root || !owner) return false;
    modalOwner = String(owner);
    root.innerHTML = String(markup || "");
    modalOpen = Boolean(markup);
    emit(modalListeners, { owner: modalOwner, open: modalOpen });
    return true;
  }

  function clearModal(owner = "") {
    if (owner && modalOwner && owner !== modalOwner) return false;
    const root = roots.modal();
    if (root) root.replaceChildren();
    modalOwner = "";
    modalOpen = false;
    emit(modalListeners, { owner: "", open: false });
    return true;
  }

  function schedulePoll() {
    if (!pollTimer) pollTimer = setTimeout(() => {
      pollTimer = 0;
      refreshSnapshot().catch(() => {});
      schedulePoll();
    }, POLL_MS);
  }

  function refreshSnapshot(options = {}) {
    const force = Boolean(options?.force);
    if (refreshPromise) {
      if (!force) return refreshPromise;
      if (!forcedRefreshPromise) {
        const inFlight = refreshPromise;
        forcedRefreshPromise = inFlight.then(() => refreshSnapshot())
          .finally(() => { forcedRefreshPromise = null; });
      }
      return forcedRefreshPromise;
    }
    refreshPromise = fetch(SNAPSHOT_API, { method: "GET", credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        latestSnapshot = Object.freeze(response.ok && data?.ok ? data : { code: data?.code || `HTTP_${response.status}`, status: response.status });
        emit(snapshotListeners, latestSnapshot);
        return latestSnapshot;
      })
      .catch(() => {
        latestSnapshot = Object.freeze({ code: "ADMIN_SNAPSHOT_OFFLINE" });
        emit(snapshotListeners, latestSnapshot);
        return latestSnapshot;
      })
      .finally(() => {
        refreshPromise = null;
      });
    return refreshPromise;
  }

  window.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest("[data-admin-modal-close]") || target.matches("[data-admin-modal-backdrop]")) {
      clearModal();
      event.preventDefault();
      return;
    }
    [...captureListeners].forEach((listener) => {
      try { listener(event); } catch (error) { console.error("[admin shell] click handler failed", error); }
    });
  }, true);
  window.addEventListener("keydown", (event) => { if (event.key === "Escape") clearModal(); }, true);

  syncTabClasses();
  window.__BAEKJI_ADMIN_SHELL__ = Object.freeze({
    roots,
    tabs: Object.freeze({ get: () => activeTab, set: setActiveTab, subscribe: (listener) => subscribe(tabListeners, listener, activeTab) }),
    modal: Object.freeze({ root: roots.modal, getOwner: () => modalOwner, render: renderModal, clear: clearModal, subscribe: (listener) => subscribe(modalListeners, listener, { owner: modalOwner, open: modalOpen }) }),
    onCaptureClick(listener) { captureListeners.add(listener); return () => captureListeners.delete(listener); },
    snapshot: Object.freeze({ latest: () => latestSnapshot, refresh: refreshSnapshot, subscribe: (listener) => subscribe(snapshotListeners, listener, latestSnapshot) }),
  });
  schedulePoll();
  refreshSnapshot().catch(() => {});
})();
