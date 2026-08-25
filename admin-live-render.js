(() => {
  "use strict";

  const VERSION = "0.6.4";
  const panel = document.querySelector("[data-admin-panel]");
  const topology = window.__BAEKJI_ADMIN_ZONE_TOPOLOGY__;
  if (!panel || !topology || window.__BAEKJI_ADMIN_LIVE_RENDER__) return;

  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML")
    || Object.getOwnPropertyDescriptor(HTMLElement.prototype, "innerHTML");
  if (!descriptor?.get || !descriptor?.set) return;

  const nativeGet = descriptor.get;
  const nativeSet = descriptor.set;
  let bypass = false;

  function fragmentFrom(html) {
    const template = document.createElement("template");
    template.innerHTML = String(html ?? "");
    return template.content;
  }

  function shouldPreserveControl(element) {
    if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement)) return false;
    return document.activeElement === element || element.matches("[data-log-party], [data-log-type], [data-log-search]");
  }

  function syncAttributes(current, next) {
    const preserveControl = shouldPreserveControl(current);
    const preservedValue = preserveControl ? current.value : null;
    const preservedSelection = preserveControl && current instanceof HTMLInputElement
      ? [current.selectionStart, current.selectionEnd]
      : null;
    const preservedOpen = current instanceof HTMLDetailsElement ? current.open : null;

    [...current.attributes].forEach((attr) => {
      if (!next.hasAttribute(attr.name)) current.removeAttribute(attr.name);
    });
    [...next.attributes].forEach((attr) => {
      if (current.getAttribute(attr.name) !== attr.value) current.setAttribute(attr.name, attr.value);
    });

    if (preserveControl) {
      current.value = preservedValue;
      if (preservedSelection && document.activeElement === current) {
        try { current.setSelectionRange(preservedSelection[0], preservedSelection[1]); } catch {}
      }
    }
    if (current instanceof HTMLDetailsElement && preservedOpen !== null) current.open = preservedOpen;
  }

  function syncNode(current, next) {
    if (!current || !next) return;
    if (current.nodeType !== next.nodeType) {
      current.replaceWith(next.cloneNode(true));
      return;
    }
    if (current.nodeType === Node.TEXT_NODE || current.nodeType === Node.COMMENT_NODE) {
      if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
      return;
    }
    if (!(current instanceof Element) || !(next instanceof Element) || current.tagName !== next.tagName) {
      current.replaceWith(next.cloneNode(true));
      return;
    }

    syncAttributes(current, next);
    syncChildren(current, next);
  }

  function syncChildren(currentParent, nextParent) {
    const nextChildren = [...nextParent.childNodes];
    let index = 0;
    while (index < nextChildren.length) {
      const next = nextChildren[index];
      const current = currentParent.childNodes[index];
      if (!current) {
        currentParent.append(next.cloneNode(true));
      } else {
        syncNode(current, next);
      }
      index += 1;
    }
    while (currentParent.childNodes.length > nextChildren.length) {
      currentParent.lastChild?.remove();
    }
  }

  function isZoneSource(fragment) {
    return Boolean(fragment.querySelector('.admin-panel-scroll > .admin-grid .admin-card[data-admin-detail="zone"]'));
  }

  function updatePanel(html) {
    const fragment = fragmentFrom(html);
    const enhancedZone = panel.querySelector("[data-admin-zone-map]");
    if (enhancedZone && isZoneSource(fragment)) {
      panel.dispatchEvent(new CustomEvent("baekji-admin-zone-live-source", { detail: { html: String(html ?? "") } }));
      return;
    }
    syncChildren(panel, fragment);
  }

  try {
    Object.defineProperty(panel, "innerHTML", {
      configurable: true,
      enumerable: false,
      get() { return nativeGet.call(panel); },
      set(value) {
        if (bypass) return nativeSet.call(panel, value);
        const html = String(value ?? "");
        if (nativeGet.call(panel) === html) return;
        updatePanel(html);
      },
    });
  } catch {
    return;
  }

  function syncZoneMap(records) {
    const svg = panel.querySelector("[data-admin-zone-map-viewport] svg");
    if (!svg) return;
    const nodeRecords = records.filter((record) => record.id.startsWith("node:"));
    const specialRecords = records.filter((record) => !record.id.startsWith("node:"));
    const nodeMap = new Map(nodeRecords.map((record) => [record.id.replace(/^node:/, ""), record]));
    const routeMap = topology.routeRecordMap(specialRecords);

    svg.querySelectorAll("[data-node]").forEach((node) => {
      const record = nodeMap.get(String(node.dataset.node || ""));
      if (!record) return;
      node.classList.toggle("is-occupied", record.members > 0);
      node.dataset.adminDetail = "zone";
      node.dataset.adminId = record.id;
      node.setAttribute("role", "button");
      node.setAttribute("tabindex", "0");
      node.setAttribute("aria-label", `${record.title}, 현재 ${record.members}명, ${record.sessions}개 조사조`);
      topology.syncOccupancyBadge(node, record.members);
    });

    svg.querySelectorAll("path.route[data-from][data-to]").forEach((route) => {
      const wasLive = route.classList.contains("is-occupied-route");
      route.classList.remove("is-occupied-route");
      if (wasLive) {
        delete route.dataset.adminDetail;
        delete route.dataset.adminId;
        route.removeAttribute("role");
        route.removeAttribute("tabindex");
        route.removeAttribute("aria-label");
      }
      const record = routeMap.get(`${String(route.dataset.from || "")}→${String(route.dataset.to || "")}`);
      if (!record) return;
      route.classList.add("is-occupied-route");
      route.dataset.adminDetail = "zone";
      route.dataset.adminId = record.id;
      route.setAttribute("role", "button");
      route.setAttribute("tabindex", "0");
      route.setAttribute("aria-label", `${record.title}, 현재 ${record.members}명`);
    });

    syncZoneLists(nodeRecords, specialRecords);
  }

  function cardsFragment(records) {
    const fragment = document.createDocumentFragment();
    records.forEach((record) => fragment.append(record.card.cloneNode(true)));
    return fragment;
  }

  function syncZoneLists(nodeRecords, specialRecords) {
    const fallback = panel.querySelector(".admin-zone-list-fallback");
    const fallbackGrid = fallback?.querySelector(".admin-zone-list-grid");
    if (fallbackGrid) syncChildren(fallbackGrid, cardsFragment(nodeRecords));

    let special = panel.querySelector(".admin-zone-live-scopes");
    if (!specialRecords.length) {
      special?.remove();
      return;
    }

    if (!special) {
      special = document.createElement("section");
      special.className = "admin-zone-live-scopes";
      special.innerHTML = `<header><div><strong>현재 세부 현장 · 이동 구간</strong><small>구역 내부 세부 장소와 이동 중인 조사조만 표시합니다.</small></div><span>0</span></header><div class="admin-grid admin-zone-special-grid"></div>`;
      const scroll = panel.querySelector(".admin-panel-scroll");
      if (scroll && fallback) scroll.insertBefore(special, fallback);
      else scroll?.append(special);
    }
    const count = special.querySelector("header > span");
    if (count) count.textContent = String(specialRecords.length);
    const grid = special.querySelector(".admin-zone-special-grid");
    if (grid) syncChildren(grid, cardsFragment(specialRecords));
  }

  panel.addEventListener("baekji-admin-zone-live-source", (event) => {
    const html = String(event.detail?.html || "");
    const fragment = fragmentFrom(html);
    const incomingHead = fragment.querySelector(".admin-section-head");
    const currentHead = panel.querySelector(":scope > .admin-section-head");
    if (incomingHead && currentHead) syncNode(currentHead, incomingHead);

    const records = [...fragment.querySelectorAll('.admin-card[data-admin-detail="zone"]')]
      .map(topology.recordFromCard)
      .filter(Boolean);
    if (records.length) syncZoneMap(records);
  });

  document.documentElement.dataset.adminLiveRenderVersion = VERSION;
  window.__BAEKJI_ADMIN_LIVE_RENDER__ = Object.freeze({ version: VERSION, syncChildren });
})();
