import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("app.js", "utf8");
const flow = fs.readFileSync("party-flow-sync.js", "utf8");
const flowUx = fs.readFileSync("party-flow-ux-fix.js", "utf8");
const leadership = fs.readFileSync("party-leadership-flow.js", "utf8");
const membership = fs.readFileSync("party-membership-ux-fix.js", "utf8");
const preflight = fs.readFileSync("party-preflight-flow-fix.js", "utf8");
const stability = fs.readFileSync("party-ui-stability.js", "utf8");
const roster = fs.readFileSync("party-member-home-roster.js", "utf8");
const profileSync = fs.readFileSync("tester-party-profile-sync.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");

const homeStart = app.indexOf("  function renderHome()");
const homeEnd = app.indexOf("  const acceptInviteInFlight", homeStart);
const briefingStart = app.indexOf("  function renderBriefing(sessionId)");
const briefingEnd = app.indexOf("  function appendLog(", briefingStart);
const projectionStart = app.indexOf("  function playerRouteProjection(");
const projectionEnd = app.indexOf("  function consumeUnrelatedExternalRouteUpdate", projectionStart);
assert.ok(homeStart >= 0 && homeEnd > homeStart, "home renderer must be discoverable");
assert.ok(briefingStart >= 0 && briefingEnd > briefingStart, "briefing renderer must be discoverable");
assert.ok(projectionStart >= 0 && projectionEnd > projectionStart, "route projection must be discoverable");
const renderHome = app.slice(homeStart, homeEnd);
const renderBriefing = app.slice(briefingStart, briefingEnd);
const routeProjection = app.slice(projectionStart, projectionEnd);

assert.match(app, /function partyAccount\(userId\)/, "party profiles need one direct-render resolver");
assert.match(app, /name: "참가 캐릭터", initial: "·"/, "loading profiles must never expose UUIDs or question-mark avatars");
assert.match(app, /party-member-home-avatar-image/, "member home photos must render in the initial markup");
assert.match(app, /tester-briefing-avatar/, "briefing photos must render in the initial markup");

assert.match(renderHome, /party-member-home-grid/, "member roster must render directly on home");
assert.match(renderHome, /data-party-member-roster/, "home roster needs a stable direct-render marker");
assert.match(app, /data-preflight-member-ready/, "recruiting readiness must render directly");
assert.match(app, /data-member-ready/, "confirmed-stage readiness must render directly");
assert.match(renderHome, /참가 캐릭터와 준비 상태를 이 화면에서 바로 확인합니다\./);
assert.match(renderHome, /!party \? `<article class="card pad">/, "received invitations must not render while already in a party");
assert.doesNotMatch(renderHome, /data-member-party-controls/, "home must not paint legacy controls before replacing them");

assert.match(renderBriefing, /data-party-flow-briefing-confirmation/, "briefing confirmation panel must render directly");
assert.match(renderBriefing, /briefing-member-list/, "briefing members must render directly");
assert.match(renderBriefing, /data-party-flow-confirm-briefing/, "member confirmation must render directly");
assert.match(renderBriefing, /data-party-preflight-briefing-back/, "leader back action must render directly");
assert.match(renderBriefing, /조장 진입 대기/, "member entry state must render directly");
assert.match(renderBriefing, /!isLeader \|\| !allConfirmed \? "disabled"/, "entry availability must be correct on first paint");
assert.doesNotMatch(renderBriefing, /조사조 확인/, "obsolete briefing roster button must not flash before removal");
assert.match(routeProjection, /briefingConfirmedBy/, "remote briefing confirmations must invalidate the direct render");
assert.match(routeProjection, /partyCreatorId/, "leader-sensitive briefing UI must invalidate when party leadership changes");

assert.doesNotMatch(flow, /function enhanceBriefing/, "flow sync must not append the briefing panel after paint");
assert.doesNotMatch(flowUx, /function decorateMemberHome|function decorateBriefingRoster/, "flow UX must not patch home or briefing");
assert.doesNotMatch(leadership, /function decorateMemberHome/, "leadership runtime must not patch member home");
assert.doesNotMatch(membership, /function decorateInviteVisibility|function normalizeMemberHomeButtons/, "membership runtime must not patch home layout");
assert.doesNotMatch(preflight, /function decorateMemberHome|function decorateBriefing/, "preflight runtime must not patch home or briefing");
assert.doesNotMatch(stability, /function hideImpossibleInviteCard|new MutationObserver/, "paint stability runtime must not hide home cards after paint");
assert.doesNotMatch(roster, /function decorateMemberHome|new MutationObserver/, "member roster helper must no longer rewrite home DOM");
assert.doesNotMatch(profileSync, /function decorateBriefingMembers/, "profile sync must not rewrite direct briefing members");

assert.match(index, /stage2-home-briefing-party-ui=1/);
assert.match(index, /party-flow-sync\.js\?v=0\.3\.69&stage3a=1&stage6b=1&stage8b-b5=1/);
assert.match(index, /party-flow-ux-fix\.js\?v=0\.3\.88&departure-capture-guard=1&stage3a=1&stage3b=1&stage6b=1/);
assert.match(index, /party-leadership-flow\.js\?v=0\.3\.69&stage3a=1&stage6b=1/);
assert.match(index, /party-membership-ux-fix\.js\?v=0\.3\.89&stage3a=1&stage3b=1&stage6b=1&stage8b-b5=1/);
assert.match(index, /party-preflight-flow-fix\.js\?v=0\.3\.97&stage3a=1&stage3b=1&stage6b=1/);
assert.match(index, /party-ui-stability\.js\?v=0\.3\.95&stage3a=1&stage6b=1&rename-party-command=1/);
assert.match(index, /party-member-home-roster\.js\?v=0\.3\.98/);

console.log("PASS: home and briefing party UI render directly without DOM post-processing");
