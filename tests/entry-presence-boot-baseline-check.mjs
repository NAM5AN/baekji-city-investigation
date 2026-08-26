import assert from "node:assert/strict";
import fs from "node:fs";
import { createBrowserContext, createControlledClock, createStorage, loadScripts } from "./helpers/browser-harness.mjs";

const presenceSource = fs.readFileSync(new URL("../entry-presence-fix.js", import.meta.url), "utf8");
const persistenceSource = fs.readFileSync(new URL("../world-persistence.js", import.meta.url), "utf8");
const WORLD_KEY = "baekji_city_mvp_state_v3";
const USER_KEY = "baekji_city_mvp_current_user_v034";

function activeSession(id, partyId, node) {
  return { id, partyId, status: "ACTIVE", variant: "a", currentNode: node, memberIds: [id], logs: [] };
}

function world(secondNode = "E_ENTRY") {
  return {
    version: 3,
    characters: {},
    parties: { p1: { name: "1조" }, p2: { name: "2조" } },
    sessions: {
      s1: activeSession("s1", "p1", "E_ENTRY"),
      s2: activeSession("s2", "p2", secondNode),
    },
  };
}

function boot(initial) {
  const localStorage = createStorage({ [WORLD_KEY]: JSON.stringify(initial) });
  const sessionStorage = createStorage({ [USER_KEY]: "s1" });
  const clock = createControlledClock();
  let now = 10_000;
  const eventLog = [];
  const window = {
    DAY1_DATA: { places: { E_NEXT: { name: "다음" } } },
    addEventListener() {},
    dispatchEvent(event) { eventLog.push(event); return true; },
  };
  const { context } = createBrowserContext({
    localStorage,
    sessionStorage,
    clock,
    globals: {
      window,
      location: { href: "https://example.test/investigation" },
      Date: class extends Date { static now() { return now; } },
      StorageEvent: class { constructor(type, details) { this.type = type; Object.assign(this, details); } },
      Event: class { constructor(type) { this.type = type; } },
    },
  });
  context.window.window = context.window;
  loadScripts(context, [
    { source: persistenceSource, filename: "world-persistence.js" },
    { source: presenceSource, filename: "entry-presence-fix.js" },
  ]);
  return {
    localStorage,
    clock,
    eventLog,
    setNow(value) { now = value; },
    current() { return JSON.parse(localStorage.value(WORLD_KEY)); },
    replace(next) { localStorage.setItem(WORLD_KEY, JSON.stringify(next)); },
  };
}

function meetEntries(state) {
  return Object.values(state.sessions).flatMap((session) => session.logs.filter((entry) => String(entry.id).startsWith("entry_meet_")));
}

const baseline = boot(world("E_ENTRY"));
assert.equal(meetEntries(baseline.current()).length, 0, "already co-located ACTIVE E_ENTRY sessions must not gain boot-time meeting logs");
assert.equal(baseline.localStorage.counts().writes, 0, "baseline-only boot must not rewrite world state");

const later = boot(world("E_NEXT"));
const newlyColocated = later.current();
newlyColocated.sessions.s2.currentNode = "E_ENTRY";
later.replace(newlyColocated);
later.setNow(10_280);
assert.equal(later.clock.runNextTimer(), true, "first scheduled reconcile must run");
assert.equal(meetEntries(later.current()).length, 2, "a later same-variant E_ENTRY pair must receive one meeting entry per session");
assert.equal(later.eventLog.filter((event) => event.type === "storage").length, 1, "one actual pair transition must publish one storage update");
later.setNow(10_560);
assert.equal(later.clock.runNextTimer(), true, "second scheduled reconcile must run");
assert.equal(meetEntries(later.current()).length, 2, "an unchanged pair must not duplicate its meeting logs");

console.log("PASS: entry-presence boot baseline is silent while later co-location logs exactly once");
