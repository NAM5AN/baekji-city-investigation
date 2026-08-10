import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../admin-dashboard.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../admin-mobile-shell-polish.css", import.meta.url), "utf8");
const js = fs.readFileSync(new URL("../admin-mobile-topbar.js", import.meta.url), "utf8");

assert.match(html, /admin-mobile-shell-polish\.css\?v=0\.6\.2/, "admin dashboard must load mobile shell polish styles");
assert.match(html, /admin-mobile-topbar\.js\?v=0\.6\.2/, "admin dashboard must load mobile topbar runtime");
assert.ok(html.indexOf("admin-mobile-topbar.js?v=0.6.2") > html.indexOf("admin-world-reset.js?v=0.5.1"), "mobile topbar runtime must load after admin action buttons are installed");
assert.match(css, /grid-template-areas:"brand actions" "meta meta"/, "mobile topbar must use a compact two-row layout");
assert.match(css, /data-admin-world-reset-open/, "desktop action buttons must be hidden from the compact mobile header");
assert.match(css, /admin-mobile-ops-menu/, "mobile admin actions must move behind one operations menu");
assert.match(css, /padding:12px 12px calc\(56px \+ env\(safe-area-inset-bottom\)\)/, "mobile content must reserve visible bottom breathing room");
assert.match(css, /scroll-padding-bottom:calc\(56px \+ env\(safe-area-inset-bottom\)\)/, "nested scrollers must keep their final content clear of the bottom edge");
assert.match(js, /data-admin-mobile-proxy="mvp5"/, "operations menu must retain session operations access");
assert.match(js, /data-admin-mobile-proxy="audit"/, "operations menu must retain audit log access");
assert.match(js, /data-admin-mobile-proxy="reset"/, "operations menu must retain world reset access");
assert.match(js, /original\.click\(\)/, "mobile proxy actions must delegate to the existing admin controls");

console.log("PASS: admin mobile header is compact and all scrollable views retain bottom breathing room");
