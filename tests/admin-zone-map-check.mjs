import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../admin-dashboard.html", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../admin-zone-map.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../admin-zone-map.css", import.meta.url), "utf8");
const scrollSource = fs.readFileSync(new URL("../admin-scroll-stability.js", import.meta.url), "utf8");
const playerMap = fs.readFileSync(new URL("../assets/maps/haeoreum-day1-map.svg", import.meta.url), "utf8");

assert.match(html, /admin-zone-map\.css\?v=0\.6\.0/, "admin dashboard must load zone-map styles with a fresh cache key");
assert.match(html, /admin-zone-map\.js\?v=0\.6\.0/, "admin dashboard must load zone-map runtime with a fresh cache key");
assert.match(html, /admin-scroll-stability\.js\?v=0\.6\.1/, "admin dashboard must load scroll-stability runtime after the zone map");
assert.ok(html.indexOf("admin-scroll-stability.js?v=0.6.1") > html.indexOf("admin-zone-map.js?v=0.6.0"), "scroll stability must observe the rendered zone-map lifecycle");
assert.doesNotThrow(() => new Function(scrollSource), "admin scroll stability runtime must parse as JavaScript");
assert.match(scrollSource, /document\.addEventListener\("scroll"/, "scroll positions must be captured while the operator scrolls");
assert.match(scrollSource, /new MutationObserver\(scheduleRestore\)/, "snapshot rerenders must trigger scroll restoration");
assert.match(scrollSource, /admin-panel-scroll/, "main tab scroll position must be preserved");
assert.match(scrollSource, /data-admin-zone-map-viewport/, "zone-map horizontal and vertical scroll must be preserved");
assert.match(scrollSource, /data-admin-log-list/, "log list scroll must be preserved");
assert.match(scrollSource, /admin-mini-list/, "overview list scroll must be preserved");
assert.match(source, /assets\/maps\/haeoreum-day1-map\.svg\?v=0\.6\.0/, "admin map must reuse the player investigation map topology asset");
assert.match(source, /data-admin-zone-map/, "zone tab must be replaced by an interactive topology map shell");
assert.match(source, /data-admin-detail/, "map nodes must keep the existing admin detail popup contract");
assert.match(source, /is-occupied-route/, "occupied movement routes must be highlighted on the topology map");
assert.match(source, /현재 세부 현장 · 이동 구간/, "detail and route occupancy must remain visible under the topology map");
assert.match(source, /구역 목록으로 보기/, "a compact list fallback must remain available");
assert.match(css, /admin-zone-map-viewport svg \[data-node\]\.admin-zone-node\.is-occupied/, "occupied nodes must have a distinct visual state");
assert.match(css, /path\.route\.is-occupied-route/, "occupied routes must have a distinct visual state");
assert.match(playerMap, /data-node="E_ENTRY"/, "player map must expose the canonical entry node");
assert.match(playerMap, /data-from="E_G_PLAZA" data-to="E_G_EAST"/, "player map must expose route topology through from/to attributes");

console.log("PASS: admin zone map stays interactive and polling rerenders preserve operator scroll positions");
