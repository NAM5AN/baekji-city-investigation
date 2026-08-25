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
assert.match(index, /app\.js\?v=0\.4\.14[^"']*stage3a=1[^"']*stage3b=1[^"']*stage3c=1[^"']*transfer-privacy=1[^"']*movement-departure-presence=1[^"']*item-disposition=1[^"']*stage5-world-store=1[^"']*stage6a=1/);
assert.ok(index.indexOf("app.js?v=0.4.14&fix=0b1&local-chat=1&movement-terminal=1&flex-hazard-terminal=1&topbar=1&stage2-foundation-ui=1&stage2-briefing-ui=1&stage2-party-ui=1&stage2-home-briefing-party-ui=1&pending-party-invites=1&party-member-readiness-ux=1&party-invite-grid-stability=1&party-confirmed-ready-collapse=1&pending-departure-set-guard=1&result-party-disband=1&departure-guards=1&stage3a=1&stage3b=1&stage3c=1&transfer-privacy=1&movement-departure-presence=1&item-disposition=1&stage5-world-store=1&stage6a=1") < index.indexOf("investigation-feedback-ui.js?v=0.3.49"));
assert.ok(index.indexOf("investigation-feedback-ui.js?v=0.3.49") < index.indexOf("investigation-log-render-flush.js?v=0.3.49"));

console.log("investigation feedback UI checks passed");
