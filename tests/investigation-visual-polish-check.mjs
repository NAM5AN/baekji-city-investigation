import assert from "node:assert/strict";
import fs from "node:fs";

const js = fs.readFileSync(new URL("../investigation-visual-polish.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../investigation-visual-polish.css", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.match(js, /function sceneSignature/);
assert.match(js, /is-channel-switching/);
assert.match(js, /BAEKJI_RETRO_SOUND_BOOST\?\.play\?\.\("channel"\)/);
assert.match(js, /\.retro-tab/);
assert.match(js, /retro-choice-no-enter/);
assert.match(js, /조원 초대/);
assert.match(js, /retro-invite-grid/);
assert.match(js, /document\.createElement\("img"\)/);
assert.match(js, /profileDataUri/);
assert.match(js, /observer\.observe\(app, \{ childList: true \}\)/);

assert.match(css, /retro-channel-static/);
assert.match(css, /retro-channel-picture/);
assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
assert.match(css, /retro-invite-profile/);
assert.match(css, /retro-choice-no-enter/);

assert.match(index, /investigation-visual-polish\.css\?v=0\.3\.50/);
assert.match(index, /investigation-visual-polish\.js\?v=0\.3\.50/);
assert.ok(index.indexOf("retro-sound-boost.js?v=0.3.50") < index.indexOf("investigation-visual-polish.js?v=0.3.50"));

console.log("investigation visual polish checks passed");