import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../admin-zone-topology.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../admin-dashboard.html", import.meta.url), "utf8");
const mapSource = fs.readFileSync(new URL("../admin-zone-map.js", import.meta.url), "utf8");
const liveSource = fs.readFileSync(new URL("../admin-live-render.js", import.meta.url), "utf8");

const API_KEYS = ["recordFromCard", "makeSvgElement", "syncOccupancyBadge", "routeRecordMap"];
assert.match(html, /admin-zone-topology\.js\?v=0\.1\.0&stage4b=1/);
assert.match(html, /admin-zone-map\.js\?v=0\.6\.1&stage4b=1/);
assert.match(html, /admin-live-render\.js\?v=0\.6\.4&stage4b=1/);
assert.ok(html.indexOf("admin-zone-topology.js?v=0.1.0&stage4b=1") < html.indexOf("admin-zone-map.js?v=0.6.1&stage4b=1"), "topology loads before map consumer");
assert.ok(html.indexOf("admin-zone-map.js?v=0.6.1&stage4b=1") < html.indexOf("admin-live-render.js?v=0.6.4&stage4b=1"), "map consumer loads before live consumer");

for (const [name, consumer] of [["map", mapSource], ["live", liveSource]]) {
  assert.match(consumer, /__BAEKJI_ADMIN_ZONE_TOPOLOGY__/, `${name} consumes the shared topology module`);
  assert.doesNotMatch(consumer, /function\s+recordFromCard\s*\(/, `${name} must not retain a local record parser`);
  assert.doesNotMatch(consumer, /function\s+makeSvgElement\s*\(/, `${name} must not retain a local SVG helper`);
  assert.doesNotMatch(consumer, /function\s+(?:add|update|sync)OccupancyBadge\s*\(/, `${name} must not retain a local occupancy badge helper`);
  assert.doesNotMatch(consumer, /function\s+routeRecordMap\s*\(/, `${name} must not retain a local route map helper`);
}
for (const forbidden of [/fetch\s*\(/, /setTimeout\s*\(/, /setInterval\s*\(/, /addEventListener\s*\(/, /localStorage|sessionStorage/, /__BAEKJI_ADMIN_SHELL__/, /DAY1_DATA/]) {
  assert.doesNotMatch(source, forbidden, `topology is a pure DOM helper and must not own ${forbidden}`);
}

class Node {
  constructor(name = "g") {
    this.name = name;
    this.attributes = new Map();
    this.children = [];
    this.textContent = "";
    this.removed = false;
  }
  setAttribute(name, value) { this.attributes.set(String(name), String(value)); }
  getAttribute(name) { return this.attributes.get(String(name)) ?? null; }
  append(...nodes) { this.children.push(...nodes); nodes.forEach((node) => { node.parentNode = this; }); }
  appendChild(node) { this.append(node); return node; }
  remove() { this.removed = true; this.parentNode && (this.parentNode.children = this.parentNode.children.filter((child) => child !== this)); }
  querySelector(selector) {
    if (selector === ".room") return this.room || null;
    if (selector === "text") return this.children.find((child) => child.name === "text") || null;
    return null;
  }
  querySelectorAll(selector) {
    if (selector !== ".admin-zone-occupancy-badge") return [];
    return this.children.filter((child) => child.attributes.get("class") === "admin-zone-occupancy-badge");
  }
}

const svgCalls = [];
const context = {
  window: {}, document: { createElementNS(namespace, name) { svgCalls.push({ namespace, name }); return new Node(name); } },
  Object, Array, String, Number, Boolean, Map, Set, JSON, console,
};
context.globalThis = context;
context.window.window = context.window;
vm.createContext(context);
vm.runInContext(source, context, { filename: "admin-zone-topology.js" });
const topology = context.window.__BAEKJI_ADMIN_ZONE_TOPOLOGY__;
assert.ok(topology, "topology module publishes its shared API");
assert.ok(Object.isFrozen(topology), "topology API is frozen");
assert.deepEqual(Object.keys(topology).sort(), [...API_KEYS].sort(), "topology public API is exact");

const card = {
  dataset: { adminId: "node:E_G_PLAZA" },
  querySelector(selector) {
    const values = {
      h3: { textContent: "환승광장" },
      p: { textContent: "지상 환승광장" },
      ".admin-card-top .admin-pill": { textContent: "12명" },
      ".admin-card-meta": { textContent: "3개 조 · ACTIVE" },
    };
    return values[selector] || null;
  },
};
const record = topology.recordFromCard(card);
assert.equal(record.id, "node:E_G_PLAZA");
assert.equal(record.title, "환승광장");
assert.equal(record.floor, "지상 환승광장");
assert.equal(record.members, 12);
assert.equal(record.sessions, 3);
assert.strictEqual(record.card, card);
assert.equal(topology.recordFromCard({ dataset: {} }), null, "cards without a detail id are ignored");

const svg = topology.makeSvgElement("rect", { x: 4, "aria-hidden": true });
assert.deepEqual(svgCalls[0], { namespace: "http://www.w3.org/2000/svg", name: "rect" });
assert.equal(svg.getAttribute("x"), "4");
assert.equal(svg.getAttribute("aria-hidden"), "true");

const zone = new Node("g");
zone.room = new Node("rect");
zone.room.setAttribute("x", "10");
zone.room.setAttribute("y", "20");
zone.room.setAttribute("width", "90");
const stale = new Node("g");
stale.setAttribute("class", "admin-zone-occupancy-badge");
zone.append(stale);
topology.syncOccupancyBadge(zone, 0);
assert.equal(stale.removed, true, "badge sync replaces stale content");
assert.equal(zone.querySelectorAll(".admin-zone-occupancy-badge").length, 1);
let badge = zone.querySelectorAll(".admin-zone-occupancy-badge")[0];
assert.equal(badge.querySelector("text").textContent, "0명");
topology.syncOccupancyBadge(zone, 12);
assert.equal(zone.querySelectorAll(".admin-zone-occupancy-badge").length, 1, "badge remains singular after replacement");
badge = zone.querySelectorAll(".admin-zone-occupancy-badge")[0];
assert.equal(badge.querySelector("text").textContent, "12명");

const route = { id: "route:E_G_PLAZA:E_G_EAST", title: "환승광장 → 동부", members: 2 };
const routes = topology.routeRecordMap([route]);
assert.strictEqual(routes.get("E_G_PLAZA→E_G_EAST"), route);
assert.strictEqual(routes.get("E_G_EAST→E_G_PLAZA"), route, "route map supports reverse SVG topology direction");
assert.equal(routes.size, 2);

console.log("PASS: shared admin zone topology owns pure card/SVG/badge/route helpers while map and live consumers stay behavior-only");
