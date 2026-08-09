import fs from "node:fs";
import assert from "node:assert/strict";

const css = fs.readFileSync("mobile-investigation-viewport-frame.css", "utf8");
const index = fs.readFileSync("index.html", "utf8");

assert(css.includes("position: fixed !important"), "investigation viewport should be fixed below the shared topbar");
assert(css.includes("inset: var(--mobile-investigation-topbar, 50px) 0 0 0 !important"), "desktop-mobile breakpoint should start exactly below the measured topbar");
assert(css.includes("inset: var(--mobile-investigation-topbar, 46px) 0 0 0 !important"), "phone breakpoint should keep the measured topbar offset");
assert(css.includes("grid-template-rows: minmax(0, 62fr) minmax(0, 38fr)"), "field rows should use fr units so the grid gap cannot clip the bottom panel");
assert(css.includes("grid-template-rows: minmax(0, 64fr) minmax(0, 36fr)"), "phone field rows should use fr units so the SYSTEM panel fits cleanly");
assert(css.includes(".retro-map-button .tester-profile-avatar"), "map button must explicitly suppress tester profile images");
assert(css.includes('content: "지도"'), "map button should visibly identify itself as the map action");
assert(index.includes("mobile-investigation-viewport-frame.css?v=0.3.72"), "viewport frame fix must be loaded after the existing mobile slide styles");

const slideIndex = index.indexOf("mobile-investigation-slide.css");
const frameIndex = index.indexOf("mobile-investigation-viewport-frame.css");
assert(slideIndex >= 0 && frameIndex > slideIndex, "viewport framing override must load after slide CSS");

console.log("PASS: mobile field/chat panes stay below topbar, fit the viewport, and keep a visible map action");
