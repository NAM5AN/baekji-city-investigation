import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../admin-dashboard.html", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../admin-zone-map.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../admin-zone-map.css", import.meta.url), "utf8");
const scrollSource = fs.readFileSync(new URL("../admin-scroll-stability.js", import.meta.url), "utf8");
const mobileCss = fs.readFileSync(new URL("../admin-mobile-shell-polish.css", import.meta.url), "utf8");
const mobileTopbar = fs.readFileSync(new URL("../admin-mobile-topbar.js", import.meta.url), "utf8");
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

assert.match(html, /admin-mobile-shell-polish\.css\?v=0\.6\.2/, "admin dashboard must load mobile shell polish styles");
assert.match(html, /admin-mobile-topbar\.js\?v=0\.6\.2/, "admin dashboard must load mobile topbar runtime");
assert.ok(html.indexOf("admin-mobile-topbar.js?v=0.6.2") > html.indexOf("admin-world-reset.js?v=0.5.1"), "mobile topbar runtime must load after admin action buttons are installed");
assert.doesNotThrow(() => new Function(mobileTopbar), "admin mobile topbar runtime must parse as JavaScript");
assert.match(mobileCss, /grid-template-areas:"brand actions" "meta meta"/, "mobile topbar must use a compact two-row layout");
assert.match(mobileCss, /data-admin-world-reset-open/, "topbar admin action buttons must be hidden behind the compact operations menu on mobile");
assert.match(mobileCss, /padding:12px 12px calc\(56px \+ env\(safe-area-inset-bottom\)\)/, "mobile panel must reserve bottom breathing room");
assert.match(mobileCss, /scroll-padding-bottom:calc\(56px \+ env\(safe-area-inset-bottom\)\)/, "nested mobile scrollers must retain visible bottom space");
assert.match(mobileTopbar, /data-admin-mobile-proxy="mvp5"/, "mobile operations menu must retain session operations access");
assert.match(mobileTopbar, /data-admin-mobile-proxy="audit"/, "mobile operations menu must retain audit log access");
assert.match(mobileTopbar, /data-admin-mobile-proxy="reset"/, "mobile operations menu must retain reset access");

console.log("PASS: admin zone map, scroll stability, compact mobile header, and mobile bottom spacing are wired");
