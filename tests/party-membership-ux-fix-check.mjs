import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../party-membership-ux-fix.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const sandbox = { window: {}, console, structuredClone };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "party-membership-ux-fix.js" });
const api = sandbox.window.__BAEKJI_PARTY_MEMBERSHIP_UX_TEST__;
assert.ok(api, "party membership UX test API must exist");
const plain = (value) => JSON.parse(JSON.stringify(value));

function world() {
  return {
    version: 3,
    characters: {
      leader: { id: "leader", currentPartyId: "p1", currentSessionId: null },
      member_b: { id: "member_b", currentPartyId: "p1", currentSessionId: null },
      member_c: { id: "member_c", currentPartyId: "p1", currentSessionId: null },
    },
    parties: {
      p1: {
        id: "p1",
        name: "해오름역 조사조 1",
        creatorId: "leader",
        status: "READY_CHECK",
        sessionId: null,
        memberIds: ["leader", "member_b", "member_c"],
        invitedIds: [],
        declinedIds: [],
        confirmedBy: ["leader", "member_b", "member_c"],
        readyBy: ["leader", "member_b"],
        readyStateBy: {
          leader: { ready: true, at: 10 },
          member_b: { ready: true, at: 11 },
          member_c: { ready: false, at: 12 },
        },
      },
    },
    sessions: {},
  };
}

assert.equal(api.membershipChangeAllowed(world().parties.p1), true, "membership can change before session creation");
const sessionWorld = world();
sessionWorld.parties.p1.sessionId = "s1";
assert.equal(api.membershipChangeAllowed(sessionWorld.parties.p1), false, "membership is locked after a session exists");

const selfLeft = api.removeMemberState(world(), "p1", "member_b", "member_b", 1000);
assert.deepEqual(plain(selfLeft.parties.p1.memberIds), ["leader", "member_c"], "member can leave their own party");
assert.equal(selfLeft.characters.member_b.currentPartyId, null);
assert.equal(selfLeft.parties.p1.status, "RECRUITING", "membership changes reopen composition");
assert.deepEqual(plain(selfLeft.parties.p1.confirmedBy), [], "composition confirmation resets after membership changes");
assert.deepEqual(plain(selfLeft.parties.p1.readyBy), [], "ready state resets after membership changes");
assert.equal(selfLeft.partyMembershipRemovals["p1:member_b"].kind, "SELF_LEAVE");
assert.equal(selfLeft.partyMembershipRemovals["p1:member_b"].active, true);

const kicked = api.removeMemberState(world(), "p1", "member_c", "leader", 1100);
assert.deepEqual(plain(kicked.parties.p1.memberIds), ["leader", "member_b"], "leader can remove another member");
assert.equal(kicked.characters.member_c.currentPartyId, null);
assert.equal(kicked.partyMembershipRemovals["p1:member_c"].kind, "LEADER_KICK");

const cannotKickLeader = api.removeMemberState(world(), "p1", "leader", "leader", 1200);
assert.deepEqual(plain(cannotKickLeader.parties.p1.memberIds), ["leader", "member_b", "member_c"], "leader cannot remove themselves with the kick action");

const cannotLeaveAfterSession = api.removeMemberState(sessionWorld, "p1", "member_b", "member_b", 1300);
assert.deepEqual(plain(cannotLeaveAfterSession.parties.p1.memberIds), ["leader", "member_b", "member_c"], "party membership is not mutated after session creation");

const staleMerge = structuredClone(selfLeft);
staleMerge.parties.p1.memberIds.push("member_b");
staleMerge.parties.p1.confirmedBy.push("member_b");
staleMerge.parties.p1.readyBy.push("member_b");
staleMerge.characters.member_b.currentPartyId = "p1";
const repaired = api.repairMembershipRemovals(staleMerge);
assert.equal(repaired.changed, true, "removal tombstone must repair stale cloud array unions");
assert.equal(repaired.snapshot.parties.p1.memberIds.includes("member_b"), false);
assert.equal(repaired.snapshot.characters.member_b.currentPartyId, null);

const explicitRejoin = structuredClone(selfLeft);
explicitRejoin.parties.p1.memberIds.push("member_b");
explicitRejoin.characters.member_b.currentPartyId = "p1";
const joined = api.markMemberJoinedState(explicitRejoin, "p1", "member_b", 2000);
assert.equal(joined.partyMembershipRemovals["p1:member_b"].active, false, "a later explicit rejoin clears the old removal tombstone");
assert.equal(joined.parties.p1.membershipJoinedAtBy.member_b, 2000);
const rejoinRepair = api.repairMembershipRemovals(joined);
assert.equal(rejoinRepair.snapshot.parties.p1.memberIds.includes("member_b"), true, "cleared tombstone must not remove a later rejoin");

assert.equal(api.readyStateText(world().parties.p1, "member_b"), "● 준비 완료");
assert.equal(api.readyStateText(world().parties.p1, "member_c"), "○ 준비 대기");
assert.match(source, /data-party-member-kick/, "leader participant rows need a remove-member action");
assert.match(source, /data-party-self-leave/, "roster modal needs a self-leave action");
assert.match(source, /card\.hidden = Boolean\(party\)/, "received invitations must hide while the user belongs to a party");
assert.match(source, /rosterButtons\.forEach/, "member home must deduplicate roster buttons");
assert.match(source, /party-membership-ready-only/, "leader participant status must be reduced to readiness only");
assert.match(source, /if \(keep\.textContent !== "조원 보기"\) keep\.textContent = "조원 보기";/, "member-home decoration must not rewrite identical text on every MutationObserver pass");
assert.match(source, /if \(help && help\.textContent !== helpCopy\) help\.textContent = helpCopy;/, "leader decoration must only mutate help text when it actually changes");
assert.doesNotMatch(source, /queueMicrotask\(refresh\)/, "membership observer refresh must yield to the browser instead of creating an unbounded microtask chain");
assert.match(source, /setTimeout\(refresh, 16\)/, "membership observer refresh should be frame-throttled");
assert.match(index, /party-membership-ux-fix\.js\?v=0\.3\.84/, "membership UX fix must be cache-bumped after the observer-loop repair");

console.log("PASS: readiness-only roster, self leave, leader kick, invite hiding, roster dedupe, cloud removal repair, and observer-loop guard");
