import assert from "node:assert/strict";
import fs from "node:fs";

const js = fs.readFileSync(new URL("../investigation-feedback-ui.js", import.meta.url), "utf8");
const flush = fs.readFileSync(new URL("../investigation-log-render-flush.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../investigation-feedback-ui.css", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.match(js, /data-investigation-toast-suppressed/);
assert.match(js, /toastRoot\.replaceChildren/);
assert.match(js, /대화나 행동을 입력해 주세요/);
assert.match(js, /한 번에 한 가지 행동만 입력해 주세요/);
assert.match(js, /retro-action-processing-spinner/);
assert.match(js, /처리 중\.\.\./);
assert.match(js, /aiNarrationFinal/);
assert.match(js, /narrationInFlight/);
assert.match(js, /narrate-action/);
assert.match(js, /session\.movement/);
assert.match(js, /Storage\.prototype\.setItem/);
assert.match(js, /stopImmediatePropagation/);

assert.match(flush, /data-action-processing/);
assert.match(flush, /Storage\.prototype\.setItem/);
assert.match(flush, /new Event\("pageshow"\)/);
assert.match(flush, /queueMicrotask\(dispatchRefresh\)/);

assert.match(css, /body\[data-investigation-toast-suppressed\] #toast-root/);
assert.match(css, /retro-input-alert/);
assert.match(css, /retro-processing-spin/);
assert.match(css, /is-action-processing/);

assert.match(index, /investigation-feedback-ui\.css\?v=0\.3\.49/);
assert.match(index, /investigation-feedback-ui\.js\?v=0\.3\.49/);
assert.match(index, /investigation-log-render-flush\.js\?v=0\.3\.49/);
assert.ok(index.indexOf("app.js?v=0.3.18") < index.indexOf("investigation-feedback-ui.js?v=0.3.49"));
assert.ok(index.indexOf("investigation-feedback-ui.js?v=0.3.49") < index.indexOf("investigation-log-render-flush.js?v=0.3.49"));

console.log("investigation feedback UI checks passed");
