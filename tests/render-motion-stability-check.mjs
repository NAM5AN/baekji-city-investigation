import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../render-motion-stability.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../render-motion-stability.css", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.match(source, /initialChoiceClosed/);
assert.match(source, /\[data-close-choice-panel\]/);
assert.match(source, /motionEntryId/);
assert.match(source, /entry\?\.actionNarrationPending/);
assert.match(source, /pendingSystem/);
assert.match(source, /motion-stable-existing/);
assert.match(source, /visibleSystemEntries/);
assert.match(source, /visibleChatEntries/);
assert.match(source, /restoreTypingTarget/);
assert.match(source, /observer\.observe\(app, \{ childList: true \}\)/);
assert.doesNotMatch(source, /characterData:\s*true/);
assert.doesNotMatch(source, /subtree:\s*true/);
assert.doesNotMatch(source, /attributeFilter/);
assert.match(source, /setTimeout\(suppressExistingReplay, 420\)/);

assert.match(css, /motion-stable-existing\.motion-chat-new/);
assert.match(css, /motion-stable-existing\.motion-system-new/);
assert.match(css, /animation:\s*none\s*!important/);

const guardIndex = index.indexOf("render-motion-stability.js?v=0.3.44");
const motionIndex = index.indexOf("retro-motion.js?v=0.3.46");
assert.ok(guardIndex >= 0, "render stability guard must be loaded");
assert.ok(motionIndex >= 0, "retro motion script must be loaded");
assert.ok(guardIndex < motionIndex, "stability guard must observe renders before retro motion");
assert.match(index, /render-motion-stability\.css\?v=0\.3\.41/);

console.log("render motion stability checks passed");