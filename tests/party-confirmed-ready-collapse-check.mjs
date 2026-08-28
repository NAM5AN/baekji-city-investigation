import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("app.js", "utf8");
const ux = fs.readFileSync("party-flow-ux-fix.js", "utf8");
const preflight = fs.readFileSync("party-preflight-flow-fix.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");

const renderStart = app.indexOf("  function renderParty(partyId)");
const renderEnd = app.indexOf("  async function inviteUser(", renderStart);
assert.ok(renderStart >= 0 && renderEnd > renderStart, "party renderer must remain discoverable");
const renderParty = app.slice(renderStart, renderEnd);
assert.match(renderParty, /\["조원 구성", "구성 확정", "세션 생성"\]/, "the collapsed flow shows exactly three stages");
assert.match(renderParty, /isCreator && readyStage[\s\S]*?data-start-session/, "the leader keeps the command-backed departure control");
assert.match(renderParty, /readyStage && !isCreator[\s\S]*?data-ready/, "members retain the collapsed ready action");
assert.match(renderParty, /pendingInviteIds\.map\(\(memberId\) => pendingInviteRow/, "pending invitations stay visible until server settlement");

const start = app.slice(app.indexOf("  async function startSession("), app.indexOf("  async function commitForcedDeparture(", app.indexOf("  async function startSession(")));
assert.match(start, /dispatch\("START_PARTY_SESSION_V1", \{ partyId \}\)/, "normal departure uses one authoritative command");
assert.match(start, /result\?\.metadata\?\.requiresConfirmation/, "the server's explicit confirmation metadata opens the in-site guard");
assert.match(start, /showDepartureModal\(partyId, result\.metadata\)/, "the guard consumes server metadata, not a stale local snapshot");
assert.doesNotMatch(start, /(?:startSessionState|writeRaw|saveState|localStorage\.setItem)\s*\(/, "normal departure cannot locally create a session");

const forced = app.slice(app.indexOf("  async function commitForcedDeparture("), app.indexOf("  function renderBriefing(", app.indexOf("  async function commitForcedDeparture(")));
assert.match(forced, /dispatch\("FORCE_START_PARTY_SESSION_V1", \{ partyId \}\)/, "confirmed departure uses the explicit force command");
assert.doesNotMatch(forced, /(?:forcedDepartureState|writeRaw|saveState|localStorage\.setItem)\s*\(/, "confirmation cannot locally cancel invitations or write the world");

assert.doesNotMatch(ux, /party\.status = "READY_CHECK"/);
assert.doesNotMatch(preflight, /party\.status = "READY_CHECK"/);
assert.doesNotMatch(ux, /window\.alert/);
assert.match(index, /stage8b-b5=1/, "the active app bundle identifies the command-boundary revision");

console.log("PASS: confirmed-ready party UI renders a three-stage flow and delegates both departure paths to server commands");
