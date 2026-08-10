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
assert.match(js, /조원 초대/);
assert.match(js, /retro-invite-grid/);
assert.match(js, /document\.createElement\("img"\)/);
assert.match(js, /profileDataUri/);
assert.match(js, /observer\.observe\(app, \{ childList: true \}\)/);
assert.match(js, /function queueSync\(\) \{[\s\S]*?decorateInviteGrid\(\);[\s\S]*?if \(syncFrame\) return;/, "invite cards must be decorated synchronously before the delayed visual pass");

assert.match(css, /retro-channel-static/);
assert.match(css, /retro-channel-picture/);
assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(css, /retro-invite-profile/);
assert.match(css, /retro-choice-no-enter/);
assert.match(css, /body\[data-choice-motion-suppressed\] \.retro-choice-launch/);

assert.doesNotMatch(testerAuth, /repairTesterCharacters\(\{ touchCurrent: true \}\)/, "directory polling must not write onlineAt into shared world state");
assert.match(testerAuth, /Online\/AFK state is handled by the isolated player-presence heartbeat/);
assert.match(testerAuth, /setInterval\(\(\) => loadDirectory\(false\)/);

assert.match(index, /investigation-visual-polish\.css\?v=0\.3\.51/);
assert.match(index, /investigation-visual-polish\.js\?v=0\.3\.52/);
assert.match(index, /tester-auth\.js\?v=0\.3\.87/);
assert.ok(index.indexOf("retro-sound-boost.js?v=0.3.50") < index.indexOf("investigation-visual-polish.js?v=0.3.52"));

console.log("investigation visual polish checks passed with stable invite rendering and isolated presence polling");