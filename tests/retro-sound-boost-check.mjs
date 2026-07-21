import assert from "node:assert/strict";
import fs from "node:fs";

const sound = fs.readFileSync(new URL("../retro-sound-boost.js", import.meta.url), "utf8");
const visual = fs.readFileSync(new URL("../investigation-visual-polish.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.match(sound, /out\.gain\.value = 0\.95/);
assert.match(sound, /volume = 0\.075/);
assert.match(sound, /PRE_INVESTIGATION_ROUTES/);
assert.match(sound, /"home", "party", "briefing"/);
assert.match(sound, /function staticBurst/);
assert.match(sound, /lowpass\.frequency\.value = 1250/);
assert.match(sound, /function transitionStatic/);
assert.match(sound, /function channelStatic/);
assert.match(sound, /staticBurst\(0\.34, 0\.18\)/);
assert.match(sound, /name === "channel"/);
assert.match(visual, /play\?\.\("channel"\)/);
assert.match(sound, /window\.addEventListener\("hashchange", handleRouteTransition\)/);
assert.match(sound, /play\("transition"\)/);
assert.match(sound, /\[data-send-chat\]/);
assert.match(sound, /\[data-move-route\], \[data-enter-investigation\]/);
assert.match(sound, /data-transfer-accept/);
assert.match(sound, /MutationObserver/);
assert.match(index, /retro-sound-boost\.js\?v=0\.3\.50/);

console.log("retro sound boost checks passed");