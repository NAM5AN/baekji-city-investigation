import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

const A = "cbdba7e3-3175-4d5d-b62b-9a942f9c1089";
const B = "853bb8fa-4dae-42c0-9d6a-5e5de4a84e82";
const C = "3c840f3b-700e-42fe-9483-2228daad257f";
const D = "6554b60a-be87-4c08-b8b5-8abda89faf5b";
const GLOBAL_KEY = "baekji_city_mvp_state_v3";
const USER_KEY = "baekji_city_mvp_current_user_v034";
const PROFILE_KEY = "baekji_city_tester_session_profile_v1";

const users = [
  { id: A, character_name: "테스트A", profile_photo: "data:image/jpeg;base64,QQ==" },
  { id: B, character_name: "테스트B", profile_photo: "data:image/jpeg;base64,Qg==" },
  { id: C, character_name: "테스트C", profile_photo: "" },
  { id: D, character_name: "테스트D", profile_photo: "" },
];

function character(id, party = null, session = null) {
  return { id, contamination: 0, symptom: "안정", inventory: {}, currentPartyId: party, currentSessionId: session, onlineAt: null };
}

const world = {
  version: 3,
  storyDay: 1,
  loopId: "LOOP-001",
  eventSeq: 0,
  sessionSeq: 3,
  characters: {
    [A]: character(A),
    [B]: character(B, "party_b", "session_b"),
    [C]: character(C, "party_cd", "session_cd"),
    [D]: character(D, "party_cd", "session_cd"),
  },
  parties: {
    party_b: { id: "party_b", name: "해오름역 조사조 3", status: "SESSION_CREATED", readyBy: [B], creatorId: B, memberIds: [B], sessionId: "session_b", invitedIds: [], confirmedBy: [B], declinedIds: [], destination: "E", flowRevision: 2, readyStateBy: { [B]: { at: 1, ready: true } }, compositionLockedAt: 1 },
    party_cd: { id: "party_cd", name: "해오름역 조사조 1", status: "SESSION_CREATED", readyBy: [C,D], creatorId: C, memberIds: [C,D], sessionId: "session_cd", invitedIds: [], confirmedBy: [C,D], declinedIds: [], destination: "E", flowRevision: 2, readyStateBy: { [C]: { at: 1, ready: true }, [D]: { at: 1, ready: true } }, compositionLockedAt: 1 },
  },
  sessions: {
    session_b: { id: "session_b", logs: [], status: "ACTIVE", endedAt: null, partyId: "party_b", variant: "c", movement: null, memberIds: [B], startedAt: 1, currentNode: "E_ENTRY", choiceReveal: { at: 1, type: "persistent-menu" }, takenItemKeys: [], activeEncounter: null, currentDetailId: null, inspectedObjectIds: [] },
    session_cd: { id: "session_cd", logs: [], status: "ACTIVE", endedAt: null, partyId: "party_cd", variant: "c", movement: null, memberIds: [C,D], startedAt: 1, currentNode: "E_ENTRY", choiceReveal: { at: 1, type: "persistent-menu" }, takenItemKeys: [], activeEncounter: null, currentDetailId: null, inspectedObjectIds: [] },
  },
  itemClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
  soundEvents: [],
};

const html = `<!doctype html><html><head></head><body class="retro-mode"><div id="app"></div><div id="toast-root"></div><div id="modal-root"></div></body></html>`;
const dom = new JSDOM(html, {
  url: "https://example.test/#/home",
  pretendToBeVisual: true,
  runScripts: "outside-only",
});
const { window } = dom;

window.console = console;
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};
window.CSS ||= {};
window.CSS.escape ||= (value) => String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
window.matchMedia ||= () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
window.ResizeObserver ||= class { observe() {} unobserve() {} disconnect() {} };
window.IntersectionObserver ||= class { observe() {} unobserve() {} disconnect() {} };
window.Audio ||= class { play() { return Promise.resolve(); } pause() {} };
window.fetch = async (input) => {
  const url = String(typeof input === "string" ? input : input?.url || "");
  if (url.includes("baekji_tester_list_accounts")) return fakeResponse(users);
  if (url.includes("baekji_mvp_get_revision")) return fakeResponse(1);
  if (url.includes("baekji_mvp_get_state")) return fakeResponse([{ state: JSON.parse(window.localStorage.getItem(GLOBAL_KEY)), revision: 1, writer_id: "fixture" }]);
  if (url.includes("/api/ai/status")) return fakeResponse({ available: false });
  if (url.includes("/api/player-presence")) return fakeResponse({ ok: true });
  if (url.includes("/api/player-admin-system")) return fakeResponse({ events: [] });
  return fakeResponse({ ok: true });
};
function fakeResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => structuredClone(payload), text: async () => JSON.stringify(payload) };
}

window.sessionStorage.setItem(USER_KEY, A);
window.sessionStorage.setItem(PROFILE_KEY, JSON.stringify({ id: A, loginId: "테스트A", name: "테스트A", password: "", initial: "테", note: "초대 테스터 계정", profilePhoto: users[0].profile_photo, isTestOnly: true }));
window.localStorage.setItem(GLOBAL_KEY, JSON.stringify(world));

const index = fs.readFileSync("index.html", "utf8");
const scripts = [...index.matchAll(/<script\s+src="([^"]+\.js)(?:\?[^\"]*)?"/g)].map((m) => m[1]);
const skip = new Set([
  "cloud-state-sync.js",
  "retro-sound.js",
  "retro-sound-boost.js",
]);

const runtimeErrors = [];
window.addEventListener("error", (event) => runtimeErrors.push(String(event.error?.stack || event.message || event.error || "error")));
for (const file of scripts) {
  if (skip.has(file) || !fs.existsSync(file)) continue;
  try {
    window.eval(`${fs.readFileSync(file, "utf8")}\n//# sourceURL=${file}`);
  } catch (error) {
    runtimeErrors.push(`${file}: ${error?.stack || error}`);
  }
}

await sleep(120);
let mutations = 0;
let appReplacements = 0;
const counter = new window.MutationObserver((records) => {
  mutations += records.length;
  for (const record of records) if (record.target === window.document.getElementById("app")) appReplacements += 1;
});
counter.observe(window.document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true });

const before = window.localStorage.getItem(GLOBAL_KEY);
const next = JSON.parse(before);
next.characters[B].onlineAt = Date.now();
const after = JSON.stringify(next);
window.localStorage.setItem(GLOBAL_KEY, after);
window.dispatchEvent(new window.StorageEvent("storage", { key: GLOBAL_KEY, oldValue: before, newValue: after, storageArea: window.localStorage, url: window.location.href }));

const checkpoints = [];
for (let i = 0; i < 10; i += 1) {
  await sleep(100);
  checkpoints.push({ t: (i + 1) * 100, mutations, appReplacements, avatar: Boolean(window.document.querySelector(".topbar-meta .tester-profile-avatar")), htmlLength: window.document.getElementById("app")?.innerHTML.length || 0 });
}
counter.disconnect();

console.log("runtime errors:", runtimeErrors.slice(0, 12));
console.log("mutation checkpoints:", checkpoints);
console.log("final route:", window.location.hash);
console.log("final topbar avatar:", Boolean(window.document.querySelector(".topbar-meta .tester-profile-avatar")));

const tailGrowth = checkpoints.at(-1).mutations - checkpoints.at(-4).mutations;
try {
  assert.equal(runtimeErrors.length, 0, `runtime should load without errors: ${runtimeErrors.join("\n")}`);
  assert.ok(tailGrowth < 20, `DOM mutations failed to settle; +${tailGrowth} mutations in final 300ms`);
  assert.ok(checkpoints.at(-1).appReplacements <= 3, `app root was repeatedly rebuilt ${checkpoints.at(-1).appReplacements} times`);
  assert.equal(checkpoints.at(-1).avatar, true, "profile avatar must be restored after the external render");
} finally {
  window.close();
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
