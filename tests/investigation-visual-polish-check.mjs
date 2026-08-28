import assert from "node:assert/strict";
import fs from "node:fs";

const js = fs.readFileSync(new URL("../investigation-visual-polish.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../investigation-visual-polish.css", import.meta.url), "utf8");
const testerAuth = fs.readFileSync(new URL("../tester-auth.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.match(js, /function sceneSignature/);
assert.match(js, /is-channel-switching/);
assert.match(js, /BAEKJI_RETRO_SOUND_BOOST\?\.play\?\.\("channel"\)/);
assert.match(js, /\.retro-tab/);
assert.match(js, /retro-choice-no-enter/);
assert.match(js, /data-choice-motion-suppressed/);
assert.match(js, /observer\.observe\(app, \{ childList: true \}\)/);
assert.doesNotMatch(js, /retro-invite-grid|retro-invite-card|profileDataUri|decorateInviteGrid/, "visual polish must not build or decorate party invitation DOM after paint");

assert.match(css, /retro-channel-static/);
assert.match(css, /retro-channel-picture/);
assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
assert.match(css, /grid-auto-rows: 104px/);
assert.match(css, /max-height: calc\(104px \* 4 \+ 14px \* 3\)/);
assert.match(css, /overflow-y: auto/);
assert.match(css, /retro-invite-profile/);
assert.match(css, /retro-choice-no-enter/);
assert.match(css, /body\[data-choice-motion-suppressed\] \.retro-choice-launch/);

assert.doesNotMatch(testerAuth, /repairTesterCharacters\(\{ touchCurrent: true \}\)/, "directory polling must not write onlineAt into shared world state");
assert.match(testerAuth, /Character creation is performed by baekji_player_character_bootstrap_v1/, "character bootstrap belongs to the authenticated server path");
assert.match(testerAuth, /function repairTesterCharacters\([\s\S]*?return false;/, "directory refresh has no browser repair writer");
assert.doesNotMatch(testerAuth, /(?:writeRaw|replaceRemoteRaw|baekji_mvp_put_state)\s*\(/, "logged-out or authenticated directory polling cannot mutate a world snapshot");
assert.match(testerAuth, /setInterval\(\(\) => loadDirectory\(false\)/);

assert.match(index, /investigation-visual-polish\.css\?v=0\.3\.52/);
assert.match(index, /investigation-visual-polish\.js\?v=0\.3\.53/);
assert.match(index, /tester-auth\.js\?v=0\.3\.90&stage6b=1&stage8b=1/);
assert.ok(index.indexOf("retro-sound-boost.js?v=0.3.50") < index.indexOf("investigation-visual-polish.js?v=0.3.53"));

console.log("investigation visual polish checks passed with stable invite rendering and guest-safe directory polling");
