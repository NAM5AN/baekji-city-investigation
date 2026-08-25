(() => {
  "use strict";

  const VERSION = "0.6.1";
  const MAP_URL = "assets/maps/haeoreum-day1-map.svg?v=0.6.0";
  const panel = document.querySelector("[data-admin-panel]");
  const topology = window.__BAEKJI_ADMIN_ZONE_TOPOLOGY__;
  if (!panel || !topology) return;

  let refreshQueued = false;
  let mapMarkupPromise = null;

  function mapMarkup() {
    if (!mapMarkupPromise) {
      mapMarkupPromise = fetch(MAP_URL, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) throw new Error(`ADMIN_ZONE_MAP_HTTP_${response.status}`);
          return response.text();
        });
    }
    return mapMarkupPromise;
  }

  function activateMap(svg, nodeRecords, specialRecords) {
    const nodeMap = new Map(nodeRecords.map((record) => [record.id.replace(/^node:/, ""), record]));
    const routeMap = topology.routeRecordMap(specialRecords);

    svg.classList.add("admin-zone-topology-svg");
    svg.setAttribute("aria-label", "해오름역 관리자 구역 연결 지도");

    svg.querySelectorAll("[data-node]").forEach((node) => {
      const nodeId = String(node.dataset.node || "");
      const record = nodeMap.get(nodeId);
      if (!record) return;
      node.classList.add("admin-zone-node");
      node.classList.toggle("is-occupied", record.members > 0);
      node.dataset.adminDetail = "zone";
      node.dataset.adminId = record.id;
      node.setAttribute("role", "button");
      node.setAttribute("tabindex", "0");
      node.setAttribute("aria-label", `${record.title}, 현재 ${record.members}명, ${record.sessions}개 조사조`);
      topology.syncOccupancyBadge(node, record.members);
    });

    svg.querySelectorAll("path.route[data-from][data-to]").forEach((route) => {
      const from = String(route.dataset.from || "");
      const to = String(route.dataset.to || "");
      const record = routeMap.get(`${from}→${to}`);
      if (!record) return;
      route.classList.add("is-occupied-route");
      route.dataset.adminDetail = "zone";
      route.dataset.adminId = record.id;
      route.setAttribute("role", "button");
      route.setAttribute("tabindex", "0");
      route.setAttribute("aria-label", `${record.title}, 현재 ${record.members}명`);
    });
  }

  function nodeListMarkup(records) {
    if (!records.length) return "";
    return `<details class="admin-zone-list-fallback"><summary>구역 목록으로 보기</summary><div class="admin-grid admin-zone-list-grid">${records.map((record) => record.card.outerHTML).join("")}</div></details>`;
  }

  function specialMarkup(records) {
    if (!records.length) return "";
    return `<section class="admin-zone-live-scopes"><header><div><strong>현재 세부 현장 · 이동 구간</strong><small>구역 내부 세부 장소와 이동 중인 조사조만 표시합니다.</small></div><span>${records.length}</span></header><div class="admin-grid admin-zone-special-grid">${records.map((record) => record.card.outerHTML).join("")}</div></section>`;
  }

  function enhanceZones() {
    refreshQueued = false;
    const activeTab = document.querySelector('[data-admin-tab="zones"].active');
    if (!activeTab) return;
    const scroll = panel.querySelector(".admin-panel-scroll");
    const grid = scroll?.querySelector(":scope > .admin-grid");
    if (!scroll || !grid || scroll.dataset.adminZoneMapEnhanced === VERSION) return;

    const records = [...grid.querySelectorAll('.admin-card[data-admin-detail="zone"]')]
      .map(topology.recordFromCard)
      .filter(Boolean);
    const nodeRecords = records.filter((record) => record.id.startsWith("node:"));
    const specialRecords = records.filter((record) => !record.id.startsWith("node:"));
    if (!nodeRecords.length) return;

    scroll.dataset.adminZoneMapEnhanced = VERSION;
    scroll.classList.add("admin-zone-map-scroll");
    scroll.innerHTML = `
      <section class="admin-zone-map-shell" data-admin-zone-map="${VERSION}">
        <header class="admin-zone-map-head">
          <div><strong>구역 연결 지도</strong><small>플레이어 조사 지도와 동일한 이동 연결 구조입니다. 구역을 누르면 상세 상태가 열립니다.</small></div>
          <div class="admin-zone-map-legend" aria-label="지도 범례">
            <span><i class="node"></i>구역</span>
            <span><i class="occupied"></i>현재 점유</span>
            <span><i class="route"></i>이동 경로</span>
          </div>
        </header>
        <div class="admin-zone-map-viewport" data-admin-zone-map-viewport>
          <div class="admin-zone-map-loading">구역 연결 지도를 불러오는 중...</div>
        </div>
      </section>
      ${specialMarkup(specialRecords)}
      ${nodeListMarkup(nodeRecords)}
    `;

    const viewport = scroll.querySelector("[data-admin-zone-map-viewport]");
    mapMarkup()
      .then((markup) => {
        if (!viewport?.isConnected || scroll.dataset.adminZoneMapEnhanced !== VERSION) return;
        viewport.innerHTML = markup;
        const svg = viewport.querySelector("svg");
        if (!svg) throw new Error("ADMIN_ZONE_MAP_SVG_MISSING");
        activateMap(svg, nodeRecords, specialRecords);
      })
      .catch(() => {
        if (!viewport?.isConnected) return;
        viewport.innerHTML = `<div class="admin-zone-map-error"><strong>연결 지도를 불러오지 못했습니다.</strong><span>아래 ‘구역 목록으로 보기’를 이용해 주세요.</span></div>`;
        const fallback = scroll.querySelector(".admin-zone-list-fallback");
        if (fallback) fallback.open = true;
      });
  }

  function scheduleEnhance() {
    if (refreshQueued) return;
    refreshQueued = true;
    setTimeout(enhanceZones, 20);
  }

  document.addEventListener("keydown", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-admin-zone-map] [role='button']") : null;
    if (!target || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  new MutationObserver(scheduleEnhance).observe(panel, { childList: true, subtree: true });
  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest('[data-admin-tab="zones"]')) scheduleEnhance();
  });
  window.addEventListener("resize", scheduleEnhance);
  scheduleEnhance();
})();
