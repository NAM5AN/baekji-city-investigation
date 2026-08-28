import assert from "node:assert/strict";
import fs from "node:fs";
import { assertExactScriptOrder, createBrowserContext, createControlledClock, createStorage, loadScripts } from "./helpers/browser-harness.mjs";

const source = fs.readFileSync(new URL("../world-persistence.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");

assert.doesNotMatch(source, /\b(?:JSON|parse|normalize|dispatchEvent|StorageEvent|addEventListener|setTimeout|setInterval|cloud|__BAEKJI_WORLD_STORE__|fetch|document)\b/i, "WorldPersistence must only forward raw world bytes and same-tab raw ingress through dynamic storage access");
const appUrl = "app.js?v=0.4.18&fix=0b1&local-chat=1&movement-terminal=1&flex-hazard-terminal=1&topbar=1&stage2-foundation-ui=1&stage2-briefing-ui=1&stage2-party-ui=1&stage2-home-briefing-party-ui=1&pending-party-invites=1&party-member-readiness-ux=1&party-invite-grid-stability=1&party-confirmed-ready-collapse=1&pending-departure-set-guard=1&result-party-disband=1&departure-guards=1&stage3a=1&stage3b=1&stage3c=1&transfer-privacy=1&movement-departure-presence=1&item-disposition=1&stage5-world-store=1&stage6a=1&stage6b=1&stage8b=1&stage8b-b5=1&toggle-party-ready-command=1&lock-party-composition-command=1";
assertExactScriptOrder(index, ["world-persistence.js?v=0.1.2&stage8b-projection=1", "world-store.js?v=0.1.0&stage5=1", appUrl], "persistence must load before the store and all world consumers");
assert.match(app, /__BAEKJI_WORLD_PERSISTENCE__/);
assert.doesNotMatch(app, /localStorage\.(?:getItem|setItem)\(GLOBAL_KEY/, "app world storage must use persistence adapter only");
assert.match(app, /localStorage\.getItem\(LAYOUT_KEY/, "layout storage must remain nonworld direct storage");
assert.match(app, /sessionStorage\.getItem\(USER_KEY/, "session identity storage must remain nonworld direct storage");

const first = createStorage({ baekji_city_mvp_state_v3: '{"raw":"first"}' });
const browser = createBrowserContext({ localStorage: first, clock: createControlledClock() });
loadScripts(browser.context, [{ source, filename: "world-persistence.js" }]);
const api = browser.context.__BAEKJI_WORLD_PERSISTENCE__;
assert.equal(Object.isFrozen(api), true);
assert.deepEqual(Object.keys(api).sort(), ["clearRemoteRaw", "isRemoteActive", "key", "readRaw", "replaceRemoteRaw", "subscribe", "writeRaw"]);
assert.equal(api.key, "baekji_city_mvp_state_v3");
assert.equal(api.readRaw(), '{"raw":"first"}');
assert.deepEqual(first.counts(), { reads: 1, writes: 0 }, "readRaw must make exactly one physical read");
const late = createStorage({ baekji_city_mvp_state_v3: '{"raw":"late"}' });
browser.context.localStorage = late;
browser.context.window.localStorage = late;
assert.equal(api.readRaw(), '{"raw":"late"}', "late localStorage wrappers must be traversed dynamically");
const raw = '{"version":3,"payload":"  exact bytes  "}';
api.writeRaw(raw);
assert.equal(late.value(api.key), raw, "writeRaw must preserve raw bytes without parsing or normalization");
assert.deepEqual(late.counts(), { reads: 3, writes: 1 }, "writeRaw must late-read before and after its one physical late-wrapper write");

const guestStorage = createStorage({ baekji_city_mvp_state_v3: "legacy-authenticated" });
const guestSession = createStorage();
const guest = createBrowserContext({ localStorage: guestStorage, sessionStorage: guestSession, clock: createControlledClock() });
loadScripts(guest.context, [{ source, filename: "world-persistence.js" }]);
const guestApi = guest.context.__BAEKJI_WORLD_PERSISTENCE__;
guestApi.writeRaw("guest-only");
assert.equal(guestStorage.value("baekji_city_mvp_guest_state_v3"), "guest-only", "anonymous world bytes use the isolated guest key");
assert.equal(guestStorage.value("baekji_city_mvp_state_v3"), "legacy-authenticated", "guest writes cannot overwrite the legacy authenticated key");
guestApi.replaceRemoteRaw("projection-only");
assert.equal(guestApi.readRaw(), "projection-only", "projection is readable only from memory");
assert.throws(() => guestApi.writeRaw("must-not-persist"), /AUTHORITATIVE_PLAYER_STATE_READ_ONLY/);
assert.equal(guestStorage.value("baekji_city_mvp_guest_state_v3"), "guest-only", "an active projection never writes localStorage");

console.log("PASS: WorldPersistence forwards exact raw world bytes through late-bound localStorage only");
