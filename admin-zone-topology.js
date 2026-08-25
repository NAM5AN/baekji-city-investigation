(() => {
  "use strict";

  if (window.__BAEKJI_ADMIN_ZONE_TOPOLOGY__) return;

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

  function makeSvgElement(name, attrs = {}) {
    const node = document.createElementNS("http://www.w3.org/2000/svg", name);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, String(value)));
    return node;
  }

  function syncOccupancyBadge(node, members) {
    node.querySelectorAll(".admin-zone-occupancy-badge").forEach((badge) => badge.remove());
    const room = node.querySelector(".room");
    if (!room) return;
    const x = Number(room.getAttribute("x") || 0);
    const y = Number(room.getAttribute("y") || 0);
    const width = Number(room.getAttribute("width") || 0);
    if (!Number.isFinite(x + y + width) || width <= 0) return;

    const badgeWidth = members >= 10 ? 52 : 46;
    const left = Math.max(x + 6, x + width - badgeWidth - 7);
    const group = makeSvgElement("g", { class: "admin-zone-occupancy-badge", "aria-hidden": "true" });
    const rect = makeSvgElement("rect", { x: left, y: y + 6, width: badgeWidth, height: 22, rx: 4, ry: 4 });
    const text = makeSvgElement("text", { x: left + badgeWidth / 2, y: y + 21, "text-anchor": "middle" });
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

  window.__BAEKJI_ADMIN_ZONE_TOPOLOGY__ = Object.freeze({
    recordFromCard,
    makeSvgElement,
    syncOccupancyBadge,
    routeRecordMap,
  });
})();
