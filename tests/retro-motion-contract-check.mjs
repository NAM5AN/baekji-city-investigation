import assert from "node:assert/strict";
import fs from "node:fs";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const motion = fs.readFileSync(new URL("../retro-motion.js", import.meta.url), "utf8");

assert.doesNotMatch(index, /retro-motion-replay-guard\.js/, "removed legacy replay guard must remain absent from page script loading");
assert.match(index, /retro-motion\.js\?v=0\.3\.46/, "the active retro motion module must remain loaded");
assert.match(motion, /motion-stable-new/, "only newly rendered entries should receive motion treatment");
assert.match(motion, /data-motion-animated/, "motion must mark entries it has already processed");
assert.doesNotMatch(motion, /function typeText/, "retro motion must not reintroduce legacy typing replay");
assert.doesNotMatch(motion, /typingTimers/, "retro motion must not keep legacy typing timers");
assert.doesNotMatch(motion, /target\.textContent = ""/, "retro motion must not clear existing text before replay");

console.log("retro motion contract checks passed");
