import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const appSource = fs.readFileSync("app.js", "utf8");
const entrySource = fs.readFileSync("entry-presence-fix.js", "utf8");

// Diagnostic 1: the base app rebuilds the login DOM for every sibling world-state
// storage event, even when this tab has no authenticated user. This is the exact
// mechanism that clears a typed login ID and restarts button hover animations.
const storageListenerIndex = appSource.indexOf('window.addEventListener("storage"');
assert.ok(storageListenerIndex >= 0, "app storage listener must exist for the diagnostic");
const storageListenerSnippet = appSource.slice(storageListenerIndex, storageListenerIndex + 260);
const guestRenderUnsafe = storageListenerSnippet.includes("GLOBAL_KEY")
  && storageListenerSnippet.includes("renderExternalUpdate")
  && !/currentUser|currentUserId|sessionStorage|USER_KEY/.test(storageListenerSnippet);
console.log("diagnostic: guest login storage event forces base render =", guestRenderUnsafe);
console.log("diagnostic: storage listener =", JSON.stringify(storageListenerSnippet));

// Diagnostic 2: reproduce a real guest-tab shared-world write from a globally
// loaded reconciler. The tab has deliberately NO sessionStorage/login context.
const sourceSession = {
  id: "session_source",
  partyId: "party_source",
  status: "ACTIVE",
  variant: "a",
  currentNode: "E_ENTRY",
  currentDetailId: null,
  movement: null,
  activeEncounter: null,
  logs: [],
};
const witnessSession = {
  id: "session_witness",
  partyId: "party_witness",
  status: "ACTIVE",
  variant: "a",
  currentNode: "E_ENTRY",
  currentDetailId: null,
  movement: null,
  activeEncounter: null,
  logs: [],
};
const world = {
  version: 3,
  characters: {},
  parties: {
    party_source: { id: "party_source", name: "A조" },
    party_witness: { id: "party_witness", name: "관찰조" },
  },
  sessions: {
    [sourceSession.id]: sourceSession,
    [witnessSession.id]: witnessSession,
  },
};

let storedRaw = JSON.stringify(world);
let guestWorldWrites = 0;
let nextTimer = null;
const localStorage = {
  getItem(key) { return key === GLOBAL_KEY ? storedRaw : null; },
  setItem(key, value) {
    if (key === GLOBAL_KEY) {
      guestWorldWrites += 1;
      storedRaw = String(value);
    }
  },
};
class BasicEvent { constructor(type, init = {}) { this.type = type; Object.assign(this, init); } }
const windowObject = {
  DAY1_DATA: { places: { E_ENTRY: { name: "입구" }, E_NEXT: { name: "다음" } } },
  dispatchEvent() { return true; },
};
const context = vm.createContext({
  console,
  window: windowObject,
  globalThis: windowObject,
  localStorage,
  StorageEvent: BasicEvent,
  Event: BasicEvent,
  Date,
  clearTimeout() {},
  setTimeout(callback) { nextTimer = callback; return 1; },
});
windowObject.window = windowObject;
vm.runInContext(entrySource, context, { filename: "entry-presence-fix.js" });
assert.equal(guestWorldWrites, 0, "initial static entry scan should not write");
assert.equal(typeof nextTimer, "function", "entry reconciler should schedule its global poll");

// Simulate a legitimate world transition created by the already logged-in A tab.
const externallyChanged = JSON.parse(storedRaw);
externallyChanged.sessions.session_source.movement = {
  token: "move_1",
  fromNode: "E_ENTRY",
  targetNode: "E_NEXT",
  startedAt: Date.now(),
};
storedRaw = JSON.stringify(externallyChanged); // sibling-browser write; not B's code
const reconcileOnce = nextTimer;
nextTimer = null;
reconcileOnce();
console.log("diagnostic: unauthenticated entry-presence shared writes =", guestWorldWrites);

// Inventory every root browser module that can write/patch the shared world so the
// regression test is not limited to cloud-state-sync + tester-auth again.
const candidates = fs.readdirSync(".")
  .filter((name) => name.endsWith(".js"))
  .flatMap((name) => {
    const source = fs.readFileSync(name, "utf8");
    if (!source.includes(GLOBAL_KEY)) return [];
    const writes = /localStorage\.setItem\s*\(|nativeSetItem\.call\s*\(localStorage|rawSet\.call\s*\(localStorage|Storage\.prototype\.setItem\s*=/.test(source);
    if (!writes) return [];
    return [{
      name,
      hasUserKey: source.includes("baekji_city_mvp_current_user_v034"),
      hasTimer: /setInterval\s*\(|setTimeout\s*\(/.test(source),
      patchesStorage: /Storage\.prototype\.setItem\s*=/.test(source),
    }];
  });
console.log("diagnostic: shared-world writer/patcher modules =", JSON.stringify(candidates));

assert.equal(guestRenderUnsafe, false,
  "REPRO: logged-out B rebuilds its login DOM on A world writes, clearing input and restarting animations");
assert.equal(guestWorldWrites, 0,
  "REPRO: a globally loaded unauthenticated reconciler can write the shared world back from B");
