import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("app.js", "utf8");
const reducer = fs.readFileSync("server/player-world-party-reducer.mjs", "utf8");

const ownerStart = app.indexOf("  async function disbandCompletedPartyAndGoHome(");
const ownerEnd = app.indexOf("  function renderBriefing(", ownerStart);
assert.ok(ownerStart >= 0 && ownerEnd > ownerStart, "result disband command owner must exist");
const owner = app.slice(ownerStart, ownerEnd);
assert.match(owner, /dispatch\("DISBAND_COMPLETED_PARTY_V1", \{ sessionId \}\)/);
assert.match(owner, /\["APPLIED", "REPLAY"\]\.includes\(result\?\.status\)[\s\S]*?go\("home"\)/, "navigation occurs only after authoritative settlement");
assert.doesNotMatch(owner, /(?:disbandCompletedPartyState|writeRaw|saveState|localStorage\.setItem)\s*\(/, "result action cannot locally mutate a completed session");

const renderStart = app.indexOf("  function renderResult(");
const renderEnd = app.indexOf("  function render(reload", renderStart);
const render = app.slice(renderStart, renderEnd);
assert.match(render, /data-result-disband-home/);
assert.match(render, /disbandCompletedPartyAndGoHome\(event\.currentTarget\.dataset\.resultDisbandHome\)/);
assert.match(reducer, /command === "DISBAND_COMPLETED_PARTY_V1"/);
assert.match(reducer, /session\.status !== "COMPLETED"[\s\S]*?partyDisbandedAt/, "the server reducer preserves completed-result authorization and idempotency");

console.log("PASS: completed-result disband is a server command and routes home only after APPLIED/REPLAY");
