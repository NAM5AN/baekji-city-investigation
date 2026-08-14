import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../party-member-home-roster.js", import.meta.url), "utf8");
const runtimeUtils = fs.readFileSync(new URL("../runtime-utils.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../party-member-home-roster.css", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const sandbox = { window: {}, console, structuredClone };
vm.createContext(sandbox);
vm.runInContext(runtimeUtils, sandbox, { filename: "runtime-utils.js" });
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
assert.match(css, /body\.retro-home-mode \.party-member-home-row \.member-avatar,body\.retro-page-mode \.party-member-home-row \.member-avatar\{border:1px solid currentColor;border-radius:0;box-sizing:border-box;overflow:hidden;aspect-ratio:1\/1\}/, "member roster avatars must use the exact scoped square, clipped border-box frame");
assert.match(css, /party-member-home-avatar-image\{[^}]*aspect-ratio:1\/1;object-fit:cover/, "member roster profile images must crop inside the scoped square avatar");
assert.match(app, /party-member-home-header-meta/, "member home must own its header layout directly");
assert.ok(app.includes("\uC900\uBE44 \uB300\uAE30 \uBC84\uD2BC\uC744 \uB20C\uB7EC\uC8FC\uC138\uC694"), "unready member home must use the exact readiness guidance");
assert.ok(app.includes("\uC900\uBE44\uB97C \uCDE8\uC18C\uD558\uACE0 \uC2F6\uC73C\uBA74 \uC900\uBE44 \uC644\uB8CC \uBC84\uD2BC\uC744 \uB20C\uB7EC\uC8FC\uC138\uC694"), "ready member home must use the exact cancellation guidance");
assert.match(app, /partyAccount\(p\.creatorId\)\.name\)\} · \uD604\uC7AC \uC870\uC6D0 \$\{unique\(p\.memberIds\)\.length\}\uBA85/, "received invitations must render the inviter account and current joined-member count");
assert.doesNotMatch(app, /\uCD08\uB300\uD55C \uCE90\uB9AD\uD130: \$\{escapeHtml\(p\.creatorId\)\}/, "received invitations must not expose the inviter UUID");
const partyHomeMarkupStart = app.indexOf("  function partyHomeReadyMarkup(");
const partyHomeMarkupEnd = app.indexOf("  function partyHomeMemberMarkup(", partyHomeMarkupStart);
assert.ok(partyHomeMarkupStart >= 0 && partyHomeMarkupEnd > partyHomeMarkupStart, "member home readiness markup must be discoverable");
const partyHomeMarkup = app.slice(partyHomeMarkupStart, partyHomeMarkupEnd);
assert.match(partyHomeMarkup, /data-party-self-leave/, "nonleader member home row must expose a self-leave action");
assert.match(partyHomeMarkup, /party-member-home-actions">\$\{leaveMarkup\}<button[^>]*data-(?:preflight-)?member-ready/, "self-leave must render to the left of the ready action");
assert.match(partyHomeMarkup, /memberId !== party\.creatorId[^\n]*!party\.sessionId/, "leader and session members must not receive the self-leave action");
assert.match(index, /party-member-home-roster\.css\?v=0\.3\.94/);
assert.match(index, /party-member-home-roster\.js\?v=0\.3\.98/);
console.log("PASS: member home roster stays inline without MutationObserver feedback loops and newly created leader party starts at the top");
