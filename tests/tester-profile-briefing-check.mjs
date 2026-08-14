import fs from "node:fs";
import assert from "node:assert/strict";
import vm from "node:vm";

const auth = fs.readFileSync("tester-auth.js", "utf8");
const guard = fs.readFileSync("tester-registry-guard.js", "utf8");
const inviteSearch = fs.readFileSync("party-invite-search.js", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const foundation = fs.readFileSync("foundation-rule-fixes.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("tester-auth.css", "utf8");

assert(!auth.includes("URL.createObjectURL"), "profile preview must not rely on CSP-blocked blob URLs");
assert(auth.includes("selectedPhotoData = await compress(selectedFile)"), "selected photo should be compressed to a data URL before preview");
assert(auth.includes("normalizedContamination"), "tester character contamination must be normalized");
assert(auth.includes("contamination: 0"), "new tester characters need a zero contamination default");
assert(auth.includes("tester-member-avatar"), "party member cards should receive profile photos");
assert(css.includes(".tester-member-avatar"), "party profile photo styling is required");
assert(auth.includes("baekji_tester_list_accounts"), "all tester identities must come from the Supabase tester directory");
assert(auth.includes("LEGACY_DEMO_IDS"), "legacy A/B/C state IDs should only remain as migration cleanup markers");
assert(!auth.includes("const DEMO_USER_IDS = [\"test_a\", \"test_b\", \"test_c\"]"), "A/B/C must not be force-created as a separate tester category");
assert(guard.includes("suppressLegacyDemoUsers"), "matching Supabase A/B/C rows must replace legacy built-in demo registry entries");
assert(guard.includes("registerTester"), "Supabase directory users must enter the same app user registry");
assert(inviteSearch.includes("캐릭터 이름 검색"), "party invite view needs character-name search");
assert(inviteSearch.includes("data-party-invite-search"), "party invite search must use a stable control hook");
assert(app.includes("SAFE_BRIEFING_LIGHT_NAMES"), "briefing headline should expose only a neutral light label");
assert(app.includes("붉은빛"), "red-light briefing label is required");
assert(app.includes("해오름역은 지상 환승광장과 지하 대합실, 승강장으로 이어진다."), "briefing headline needs a neutral zone description");
assert(app.includes("‘/지도’"), "briefing tutorial should explain map guidance");
assert(app.includes("한 메시지에는 한 가지 행동만"), "briefing tutorial should explain one-action input");
assert(app.includes("한 행동이 여러 위험에 영향을 줄 수 있는지는 현재 상황과 행동 내용에 따라 시스템이 판정합니다."), "briefing must match flexible multi-hazard resolution");
assert(!app.includes("위험이 두 개라면 서로 다른 행동으로 하나씩 해결해야 합니다."), "obsolete sequential-hazard wording must be removed");
assert(app.includes("오염도 100%의 완전 용해 상태에서는 이동할 수 없습니다."), "briefing must explain the movement hard stop");

const foundationSandbox = { window: {}, Date, JSON, Object, String, Number, Math, Array, Set, Map, console };
vm.createContext(foundationSandbox);
vm.runInContext(foundation, foundationSandbox, { filename: "foundation-rule-fixes.js" });
const movement = foundationSandbox.window.__BAEKJI_MOVEMENT_IMPAIRMENT_TEST__;
assert.ok(movement, "movement impairment foundation test API must exist");
assert.equal(movement.mobilityProfile(39).delayMultiplier, 1);
assert.deepEqual({ ...movement.mobilityProfile(40) }, { contamination: 40, stage: "유화", delayMultiplier: 1.5, failureChance: 0, blocked: false });
assert.equal(movement.mobilityProfile(60).delayMultiplier, 2);
assert.equal(movement.mobilityProfile(60).failureChance, 15);
assert.equal(movement.mobilityProfile(80).delayMultiplier, 3);
assert.equal(movement.mobilityProfile(80).failureChance, 35);
assert.equal(movement.mobilityProfile(100).blocked, true);

const slowed = {
  version: 3,
  characters: { a: { id: "a", name: "테스터 A", contamination: 40 } },
  sessions: { s1: { id: "s1", memberIds: ["a"], movement: { token: "move-1", startedAt: 1000, resolveAt: 2000 }, logs: [] } },
};
movement.applyMovementImpairment(slowed, null, 1000);
assert.equal(slowed.sessions.s1.movement.resolveAt, 2500, "유화 단계부터 이동 시간이 늘어나야 합니다.");
assert.equal(slowed.sessions.s1.movement.mobilityPenalty.stage, "유화");
assert.ok(slowed.sessions.s1.logs.some((entry) => entry.mobilitySlowed === true));

const blocked = {
  version: 3,
  characters: { a: { id: "a", name: "테스터 A", contamination: 100 } },
  sessions: { s1: { id: "s1", memberIds: ["a"], movement: { token: "move-2", startedAt: 1000, resolveAt: 2000 }, logs: [] } },
};
movement.applyMovementImpairment(blocked, null, 1000);
assert.equal(blocked.sessions.s1.movement, null, "완전 용해 상태에서는 이동을 시작할 수 없어야 합니다.");
assert.ok(blocked.sessions.s1.logs.some((entry) => entry.mobilityBlocked === true));

assert(!foundation.includes("MutationObserver"), "foundation movement rules must no longer patch rendered UI with an observer");
assert(!foundation.includes("[data-reset-demo]"), "foundation movement rules must no longer remove player UI after render");
assert(!index.includes("briefing-tutorial.js"), "absorbed briefing UI must not load a DOM post-processor");
assert(index.includes("foundation-rule-fixes.js?v=0.4.3"), "foundation movement rules must use the stage 2 cache key");
assert.match(index, /app\.js\?v=0\.4\.9[^"']*stage3a=1[^"']*stage3b=1[^"']*stage3c=1/);
assert(index.indexOf("foundation-rule-fixes.js?v=0.4.3") < index.indexOf("app.js?v=0.4.9"), "movement storage guard must install before app.js starts");
assert(index.includes("tester-auth.js?v=0.3.88"), "tester auth cache key must be refreshed");
assert(index.includes("tester-login-stable.js?v=0.3.95"), "stable tester login owner must be loaded");
assert(!index.includes("tester-login-fastpath.js"), "legacy tester login fastpath must not compete with the stable login owner");
assert(index.indexOf("admin-login-bridge.js") < index.indexOf("tester-login-stable.js"), "admin login bridge must retain first ownership of AD accounts");
assert(index.indexOf("tester-login-stable.js") < index.indexOf("tester-auth.js"), "stable tester login must intercept player logins before legacy tester auth enhancement");
assert(index.includes("party-invite-search.js?v=0.3.86"), "party invite search must be loaded");

console.log("PASS: unified Supabase tester profiles, aligned briefing rules, leader copy, movement impairment, and hidden demo reset");
