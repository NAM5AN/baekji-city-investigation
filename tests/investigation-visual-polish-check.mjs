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
assert.match(testerAuth, /function canRepairSharedWorld\(\) \{[\s\S]*?Boolean\(currentUserId\(\)\)/, "shared-world tester repair must require an authenticated tab");
assert.match(testerAuth, /if \(repairingState \|\| !canRepairSharedWorld\(\)\) return false;/, "logged-out tester directory polling must stay read-only against the shared world");
assert.match(testerAuth, /setInterval\(\(\) => loadDirectory\(false\)/);

assert.match(index, /investigation-visual-polish\.css\?v=0\.3\.52/);
assert.match(index, /investigation-visual-polish\.js\?v=0\.3\.53/);
assert.match(index, /tester-auth\.js\?v=0\.3\.89&stage6b=1/);
assert.ok(index.indexOf("retro-sound-boost.js?v=0.3.50") < index.indexOf("investigation-visual-polish.js?v=0.3.53"));

console.log("investigation visual polish checks passed with stable invite rendering and guest-safe directory polling");
