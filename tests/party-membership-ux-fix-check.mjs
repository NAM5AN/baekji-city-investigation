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

const selfLeft = api.removeMemberState(world(), "p1", "member_b", "member_b", 1000, "캐릭터 B");
assert.deepEqual(plain(selfLeft.parties.p1.memberIds), ["leader", "member_c"], "member can leave their own party");
assert.equal(selfLeft.characters.member_b.currentPartyId, null);
assert.equal(selfLeft.parties.p1.status, "RECRUITING", "membership changes reopen composition");
assert.deepEqual(plain(selfLeft.parties.p1.confirmedBy), [], "composition confirmation resets after membership changes");
assert.deepEqual(plain(selfLeft.parties.p1.readyBy), [], "ready state resets after membership changes");
assert.equal(selfLeft.partyMembershipRemovals["p1:member_b"].kind, "SELF_LEAVE");
assert.equal(selfLeft.partyMembershipRemovals["p1:member_b"].active, true);
const selfNotice = Object.values(selfLeft.partyMembershipNotices)[0];
assert.equal(selfNotice.memberName, "캐릭터 B", "leave notice stores the visible character name");
assert.equal(selfNotice.leaderId, "leader", "leave notice targets the party leader too");

const kicked = api.removeMemberState(world(), "p1", "member_c", "leader", 1100, "캐릭터 C");
assert.deepEqual(plain(kicked.parties.p1.memberIds), ["leader", "member_b"], "leader can remove another member");
assert.equal(kicked.characters.member_c.currentPartyId, null);
assert.equal(kicked.partyMembershipRemovals["p1:member_c"].kind, "LEADER_KICK");
assert.equal(Object.values(kicked.partyMembershipNotices)[0].memberName, "캐릭터 C");

const cannotKickLeader = api.removeMemberState(world(), "p1", "leader", "leader", 1200);
assert.deepEqual(plain(cannotKickLeader.parties.p1.memberIds), ["leader", "member_b", "member_c"], "leader cannot remove themselves with the kick action");

const cannotLeaveAfterSession = api.removeMemberState(sessionWorld, "p1", "member_b", "member_b", 1300);
assert.deepEqual(plain(cannotLeaveAfterSession.parties.p1.memberIds), ["leader", "member_b", "member_c"], "party membership is not mutated after session creation");

const staleMerge = structuredClone(selfLeft);
staleMerge.parties.p1.memberIds.push("member_b");
staleMerge.parties.p1.invitedIds.push("member_b");
staleMerge.parties.p1.confirmedBy.push("member_b");
staleMerge.parties.p1.readyBy.push("member_b");
staleMerge.characters.member_b.currentPartyId = "p1";
const repaired = api.repairMembershipRemovals(staleMerge);
assert.equal(repaired.changed, true, "removal tombstone must repair stale cloud array unions");
assert.equal(repaired.snapshot.parties.p1.memberIds.includes("member_b"), false);
assert.equal(repaired.snapshot.parties.p1.invitedIds.includes("member_b"), false, "an old pre-removal invite must not come back through a stale merge");
assert.equal(repaired.snapshot.characters.member_b.currentPartyId, null);

const reinvited = structuredClone(selfLeft);
reinvited.parties.p1.invitedIds.push("member_b");
const stamped = api.markReinviteState(reinvited, "p1", "member_b", 1500);
assert.equal(stamped.parties.p1.membershipReinvitedAtBy.member_b, 1500, "a new invitation after removal gets a fresh timestamp");
const repairedReinvite = api.repairMembershipRemovals(stamped);
assert.equal(repairedReinvite.snapshot.parties.p1.invitedIds.includes("member_b"), true, "a genuine later reinvite must survive tombstone repair");
assert.equal(repairedReinvite.snapshot.parties.p1.memberIds.includes("member_b"), false, "reinvite alone must not silently rejoin the member");
assert.equal(repairedReinvite.snapshot.partyMembershipRemovals["p1:member_b"].active, true, "tombstone remains active until the invitation is accepted");

const explicitRejoin = structuredClone(repairedReinvite.snapshot);
explicitRejoin.parties.p1.memberIds.push("member_b");
explicitRejoin.parties.p1.invitedIds = explicitRejoin.parties.p1.invitedIds.filter((id) => id !== "member_b");
explicitRejoin.characters.member_b.currentPartyId = "p1";
const joined = api.markMemberJoinedState(explicitRejoin, "p1", "member_b", 2000);
assert.equal(joined.partyMembershipRemovals["p1:member_b"].active, false, "accepting the later reinvite clears the old removal tombstone");
assert.equal(joined.parties.p1.membershipJoinedAtBy.member_b, 2000);
const rejoinRepair = api.repairMembershipRemovals(joined);
assert.equal(rejoinRepair.snapshot.parties.p1.memberIds.includes("member_b"), true, "cleared tombstone must not remove a later rejoin");

assert.equal(api.readyStateText(world().parties.p1, "member_b"), "● 준비 완료");
assert.equal(api.readyStateText(world().parties.p1, "member_c"), "○ 준비 대기");
assert.match(source, /data-party-member-kick/, "leader participant rows need a remove-member action");
assert.match(source, /data-party-self-leave/, "roster modal needs a self-leave action");
assert.match(source, /data-party-membership-confirm/, "leave confirmation must use an in-site modal");
assert.match(source, /data-party-membership-notice/, "membership changes must surface an in-site notice popup");
assert.doesNotMatch(source, /window\.confirm/, "party leave must not use the browser confirm dialog");
assert.match(source, /data-party-member-id=.*>탈퇴<\/button>/, "leader remove-member action should be labeled simply as 탈퇴");
assert.match(source, /button\.textContent = "탈퇴"/, "roster self-leave action should be labeled simply as 탈퇴");
assert.match(source, /const markup = `\$\{kick\}\$\{readyMarkup\}`/, "leader row should place 탈퇴 before the readiness indicator");
assert.match(source, /membershipReinvitedAtBy/, "reinvites need a post-removal timestamp so tombstone repair can distinguish them from stale invites");
assert.match(source, /card\.hidden = Boolean\(party\)/, "received invitations must hide while the user belongs to a party");
assert.match(source, /rosterButtons\.forEach/, "member home must deduplicate roster buttons");
assert.match(source, /party-membership-ready-only/, "leader participant status must be reduced to readiness only");
assert.match(source, /if \(keep\.textContent !== "조원 보기"\) keep\.textContent = "조원 보기";/, "member-home decoration must not rewrite identical text on every MutationObserver pass");
assert.match(source, /if \(help && help\.textContent !== helpCopy\) help\.textContent = helpCopy;/, "leader decoration must only mutate help text when it actually changes");
assert.doesNotMatch(source, /queueMicrotask\(refresh\)/, "membership observer refresh must yield to the browser instead of creating an unbounded microtask chain");
assert.match(source, /setTimeout\(refresh, 16\)/, "membership observer refresh should be frame-throttled");
assert.match(index, /party-membership-ux-fix\.js\?v=0\.3\.85/, "membership UX fix must be cache-bumped after leave/reinvite repair");

const reinviteSource = fs.readFileSync(new URL("../party-reinvite-runtime-fix.js", import.meta.url), "utf8");
const reinviteSandbox = { window: {}, console, structuredClone };
vm.createContext(reinviteSandbox);
vm.runInContext(reinviteSource, reinviteSandbox, { filename: "party-reinvite-runtime-fix.js" });
const reinviteApi = reinviteSandbox.window.__BAEKJI_PARTY_REINVITE_RUNTIME_TEST__;
assert.ok(reinviteApi, "same-party reinvite runtime test API must exist");

const reinviteBase = structuredClone(selfLeft);
reinviteBase.parties.p1.status = "RECRUITING";
const atomicReinvite = reinviteApi.reinviteState(reinviteBase, "p1", "member_b", "leader", 1500);
assert.equal(atomicReinvite.parties.p1.invitedIds.includes("member_b"), true, "same-party reinvite must add the invitation atomically");
assert.equal(atomicReinvite.parties.p1.membershipReinvitedAtBy.member_b, 1500, "same-party reinvite must stamp the new invite in the same write");

const atomicAccept = reinviteApi.acceptReinviteState(atomicReinvite, "p1", "member_b", 2000);
assert.equal(atomicAccept.characters.member_b.currentPartyId, "p1", "accepting a same-party reinvite must restore membership immediately");
assert.equal(atomicAccept.parties.p1.memberIds.includes("member_b"), true);
assert.equal(atomicAccept.parties.p1.invitedIds.includes("member_b"), false, "accepted member must disappear from the invite list");
assert.equal(atomicAccept.partyMembershipRemovals["p1:member_b"].active, false, "accept and tombstone clear must be one atomic state change");
assert.equal(atomicAccept.parties.p1.membershipJoinedAtBy.member_b, 2000);

const visibleBrokenInvite = structuredClone(reinviteBase);
visibleBrokenInvite.parties.p1.invitedIds = ["member_b"];
const acceptedVisibleBrokenInvite = reinviteApi.acceptReinviteState(visibleBrokenInvite, "p1", "member_b", 2100);
assert.equal(acceptedVisibleBrokenInvite.characters.member_b.currentPartyId, "p1", "a reinvite popup already visible from the old broken build must still be accept-able");
assert.equal(acceptedVisibleBrokenInvite.partyMembershipRemovals["p1:member_b"].active, false);

const stalePostJoinUnion = structuredClone(atomicAccept);
stalePostJoinUnion.parties.p1.invitedIds.push("member_b");
stalePostJoinUnion.parties.p1.declinedIds.push("member_b");
stalePostJoinUnion.parties.p1.membershipReinvitedAtBy = { member_b: 1500 };
const postJoinRepair = reinviteApi.repairRejoinedState(stalePostJoinUnion);
assert.equal(postJoinRepair.changed, true, "cloud array union after a successful rejoin must be normalized");
assert.equal(postJoinRepair.snapshot.parties.p1.memberIds.includes("member_b"), true, "post-join repair must keep the member joined");
assert.equal(postJoinRepair.snapshot.characters.member_b.currentPartyId, "p1");
assert.equal(postJoinRepair.snapshot.parties.p1.invitedIds.includes("member_b"), false, "stale invite must not reappear after acceptance");
assert.equal(postJoinRepair.snapshot.parties.p1.declinedIds.includes("member_b"), false);

const staleActiveTombstone = structuredClone(atomicAccept);
staleActiveTombstone.partyMembershipRemovals["p1:member_b"].active = true;
staleActiveTombstone.parties.p1.invitedIds = ["member_b"];
const activeRepair = reinviteApi.repairRejoinedState(staleActiveTombstone);
assert.equal(activeRepair.snapshot.partyMembershipRemovals["p1:member_b"].active, false, "a later joinedAt must beat a stale active tombstone");
assert.equal(activeRepair.snapshot.parties.p1.memberIds.includes("member_b"), true);
assert.equal(activeRepair.snapshot.parties.p1.invitedIds.includes("member_b"), false);

const laterSecondLeave = structuredClone(atomicAccept);
laterSecondLeave.partyMembershipRemovals["p1:member_b"] = { partyId: "p1", memberId: "member_b", active: true, at: 3000 };
laterSecondLeave.parties.p1.memberIds = laterSecondLeave.parties.p1.memberIds.filter((id) => id !== "member_b");
laterSecondLeave.characters.member_b.currentPartyId = null;
const secondLeaveRepair = reinviteApi.repairRejoinedState(laterSecondLeave);
assert.equal(secondLeaveRepair.snapshot.partyMembershipRemovals["p1:member_b"].active, true, "an older joinedAt must never undo a later leave");
assert.equal(secondLeaveRepair.snapshot.parties.p1.memberIds.includes("member_b"), false);

assert.match(reinviteSource, /reinvite-atomic/, "same-party invite click must be owned by the atomic runtime path");
assert.match(reinviteSource, /reinvite-accept-atomic/, "same-party accept click must be owned by the atomic runtime path");
assert.match(reinviteSource, /rejoin-invariant-repair/, "post-join cloud merge repair must stay wired");
assert.match(index, /party-reinvite-runtime-fix\.js\?v=0\.3\.89/, "reinvite runtime fix must be loaded with a fresh cache key");
assert.ok(index.indexOf("party-reinvite-runtime-fix.js?v=0.3.89") < index.indexOf("party-membership-ux-fix.js?v=0.3.85"), "atomic reinvite capture must run before the legacy membership sidecar capture listener");

console.log("PASS: polished leave controls, in-site confirmation/notices, atomic same-party reinvite acceptance, stale merge repair, readiness layout, and observer-loop guard");
