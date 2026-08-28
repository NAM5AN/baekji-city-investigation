import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("app.js", "utf8");
const ux = fs.readFileSync("party-flow-ux-fix.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");

assert.match(index, /party-flow-ux-fix\.js\?v=0\.3\.88&departure-capture-guard=1&stage3a=1&stage3b=1&stage6b=1/);
const start = app.slice(app.indexOf("  async function startSession("), app.indexOf("  function departureModalContent(", app.indexOf("  async function startSession(")));
assert.match(start, /dispatch\("START_PARTY_SESSION_V1", \{ partyId \}\)/);
assert.match(start, /requiresConfirmation[\s\S]*showDepartureModal/, "the app target listener owns the modal after server confirmation metadata");
assert.doesNotMatch(start, /(?:writeRaw|saveState|startSessionState|localStorage\.setItem)\s*\(/);
assert.doesNotMatch(ux, /(?:START_PARTY_SESSION_V1|FORCE_START_PARTY_SESSION_V1)/, "legacy capture UX must not compete with the app command owner");

console.log("PASS: capture sidecar leaves command-backed departure and metadata-driven modal ownership to app.js");
