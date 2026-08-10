(() => {
  "use strict";

  const VERSION = "0.6.0";
  const MAP_URL = "assets/maps/haeoreum-day1-map.svg?v=0.6.0";
  const panel = document.querySelector("[data-admin-panel]");
  if (!panel) return;

  let refreshQueued = false;
  let mapMarkupPromise = null;

  function parseNumber(text, pattern) {
    const match = String(text || "").match(pattern);
    return match ? Number(match[1] || 0) : 0;
  }

  function recordFromCard(card) {
    const id = String(card?.dataset?.adminId || "");
    if (!id) return null;
    const title = String(card.querySelector("h3")?.textContent || id).trim();
    const floor = String(card.querySelector("p")?.textContent || "").trim();
    const topPill = card.querySelector(".admin-card-top .admin-pill");
    const members = parseNumber(topPill?.textContent, /(\d+)\s*명/);
    const metaText = String(card.querySelector(".admin-card-meta")?.textContent || "");
    const sessions = parseNumber(metaText, /(\d+)\s*개\s*조/);
    return { id, title, floor, members, sessions, card };
  }

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

  function makeSvgElement(name, attrs = {}) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  }

  function addOccupancyBadge(node, members) {
    node.querySelectorAll(".admin-zone-occupancy-badge").forEach((badge) => badge.remove());
    const room = node.querySelector(".room");
    if (!room) return;
    const x = Number(room.getAttribute("x") || 0);
    const y = Number(room.getAttribute("y") || 0);
    const width = Number(room.getAttribute("width") || 0);
    if (!Number.isFinite(x + y + width) || width <= 0) return;

    const badgeWidth = members >= 10 ? 52 : 46;
    const group = makeSvgElement("g", { class: "admin-zone-occupancy-badge", "aria-hidden": "true" });
    const rect = makeSvgElement("rect", {
      x: Math.max(x + 6, x + width - badgeWidth - 7),
      y: y + 6,
      width: badgeWidth,
      height: 22,
      rx: 4,
      ry: 4,
    });
    const text = makeSvgElement("text", {
      x: Math.max(x + 6, x + width - badgeWidth - 7) + badgeWidth / 2,
      y: y + 21,
      "text-anchor": "middle",
    });
    text.textContent = `${members}명`;
    group.append(rect, text);
    node.appendChild(group);
  }

  function routeRecordMap(records) {
    const output = new Map();
    records.forEach((record) => {
      const match = record.id.match(/^route:([^:]+):([^:]+)$/);
      if (!match) return;
      output.set(`${match[1]}→${match[2]}`, record);
      output.set(`${match[2]}→${match[1]}`, record);
    });
    return output;
  }

  function activateMap(svg, nodeRecords, specialRecords) {
    const nodeMap = new Map(nodeRecords.map((record) => [record.id.replace(/^node:/, ""), record]));
    const routeMap = routeRecordMap(specialRecords);

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
      addOccupancyBadge(node, record.members);
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
      .map(recordFromCard)
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
