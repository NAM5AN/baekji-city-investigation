import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../cloud-state-sync.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.match(source, /baekji_mvp_get_state/);
assert.match(source, /baekji_mvp_get_revision/);
assert.match(source, /baekji_mvp_put_state/);
assert.match(source, /p_expected_revision/);
assert.match(source, /reconcileAdminControl\(result\.state, localState, mergeValues\(result\.state, localState\)\)/);
assert.match(source, /applyAdminControlPatch/);
assert.match(source, /adminControlSeq/);
assert.match(source, /adminControlPatches/);
assert.match(source, /new StorageEvent\("storage"/);
assert.match(source, /ACTIVE_POLL_MS = 1500/);
assert.match(source, /document\.hidden \? HIDDEN_POLL_MS : ACTIVE_POLL_MS/);
assert.match(source, /Storage\.prototype|storageProto\.setItem/);
assert.match(source, /this === localStorage && key === GLOBAL_KEY/);
assert.match(source, /window\.addEventListener\("online"/);
assert.match(source, /document\.addEventListener\("visibilitychange"/);

const cloudIndex = index.indexOf("cloud-state-sync.js?v=0.4.3&fix=0b1&movement-terminal=1&result-party-disband=1&stage4-item-transfer=1&item-disposition=1");
const appIndex = index.indexOf("app.js?v=0.4.12&fix=0b1&local-chat=1&movement-terminal=1&flex-hazard-terminal=1&topbar=1&stage2-foundation-ui=1&stage2-briefing-ui=1&stage2-party-ui=1&stage2-home-briefing-party-ui=1&pending-party-invites=1&party-member-readiness-ux=1&party-invite-grid-stability=1&party-confirmed-ready-collapse=1&pending-departure-set-guard=1&result-party-disband=1&departure-guards=1&stage3a=1&stage3b=1&stage3c=1&transfer-privacy=1&movement-departure-presence=1&item-disposition=1");
assert.match(index, /app\.js\?v=0\.4\.12[^"']*stage3a=1[^"']*stage3b=1[^"']*stage3c=1[^"']*transfer-privacy=1[^"']*movement-departure-presence=1[^"']*item-disposition=1/, "app cache key must carry the current combined release markers");
assert.ok(cloudIndex >= 0, "cloud sync script must be loaded");
assert.ok(cloudIndex < appIndex, "cloud sync must patch storage before the app starts");

console.log("cloud state sync checks passed with admin control conflict reconciliation");
