import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../party-member-home-roster.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../party-member-home-roster.css", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const sandbox = { window: {}, console, structuredClone };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "party-member-home-roster.js" });
const api = sandbox.window.__BAEKJI_MEMBER_HOME_ROSTER_TEST__;
assert.ok(api, "member home roster test API must be exposed");

const party = {
  id: "p1",
  creatorId: "leader",
  createdAt: 1000,
  status: "RECRUITING",
  memberIds: ["leader", "member"],
  readyBy: ["leader"],
  readyStateBy: { member: { ready: false, at: 1100 } },
  flowRevision: 2,
  sessionId: null,
};
assert.equal(api.effectiveReady(party, "leader"), true);
assert.equal(api.effectiveReady(party, "member"), false);
assert.equal(api.isFreshlyCreatedParty(party, "leader", 5000), true);
assert.equal(api.isFreshlyCreatedParty(party, "member", 5000), false);
assert.match(api.rosterSignature(party), /leader:1\|member:0/);
assert.match(app, /data-party-member-roster/);
assert.match(app, /party-member-home-row/);
assert.match(source, /window\.scrollTo/);
assert.match(app, /참가 캐릭터와 준비 상태를 이 화면에서 바로 확인합니다/);
assert.doesNotMatch(source, /function decorateMemberHome|new MutationObserver/, "home roster must not be rebuilt after paint");
assert.match(source, /requestAnimationFrame\(scrollTop\)/);
assert.match(css, /party-member-home-row/);
assert.match(css, /party-member-inline-ready/);
assert.match(index, /party-member-home-roster\.css\?v=0\.3\.92/);
assert.match(index, /party-member-home-roster\.js\?v=0\.3\.98/);
console.log("PASS: member home roster stays inline without MutationObserver feedback loops and newly created leader party starts at the top");
