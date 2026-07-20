import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../cloud-state-sync.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.match(source, /baekji_mvp_get_state/);
assert.match(source, /baekji_mvp_get_revision/);
assert.match(source, /baekji_mvp_put_state/);
assert.match(source, /p_expected_revision/);
assert.match(source, /mergeValues\(result\.state, localState\)/);
assert.match(source, /new StorageEvent\("storage"/);
assert.match(source, /ACTIVE_POLL_MS = 1500/);
assert.match(source, /document\.hidden \? HIDDEN_POLL_MS : ACTIVE_POLL_MS/);
assert.match(source, /Storage\.prototype|storageProto\.setItem/);
assert.match(source, /this === localStorage && key === GLOBAL_KEY/);
assert.match(source, /window\.addEventListener\("online"/);
assert.match(source, /document\.addEventListener\("visibilitychange"/);

const cloudIndex = index.indexOf("cloud-state-sync.js?v=0.3.29");
const appIndex = index.indexOf("app.js?v=0.3.18");
assert.ok(cloudIndex >= 0, "cloud sync script must be loaded");
assert.ok(cloudIndex < appIndex, "cloud sync must patch storage before the app starts");

console.log("cloud state sync checks passed");
