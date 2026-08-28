import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const commandClient = fs.readFileSync(new URL("../player-world-commands.js", import.meta.url), "utf8");

const actionStart = app.indexOf("function applyActionInterpretation(");
const actionEnd = app.indexOf("  async function handleChatInput(", actionStart);
assert.ok(actionStart >= 0 && actionEnd > actionStart, "command-based investigation action owner must exist");
const actionOwner = app.slice(actionStart, actionEnd);
assert.match(actionOwner, /dispatch\("INVESTIGATION_ACTION_V1"/, "non-movement investigation actions use the command boundary");
assert.match(actionOwner, /resolveHazard\(sessionId, text/, "relevant hazards continue through the dedicated authoritative resolver");
assert.doesNotMatch(actionOwner, /(?:writeRaw|saveState|legacyMutate|mutateInvestigationChat|localStorage\.setItem)\s*\(/, "action interpretation cannot revive a browser world writer");

const chatStart = app.indexOf("async function handleChatInput(");
const chatEnd = app.indexOf("  function bindInvestigationScene(", chatStart);
assert.ok(chatStart >= 0 && chatEnd > chatStart, "chat input command owner must exist");
const chatOwner = app.slice(chatStart, chatEnd);
assert.match(chatOwner, /dispatch\("SEND_FIELD_CHAT_V1"/, "ordinary field chat is server committed");
assert.match(chatOwner, /\["APPLIED", "REPLAY"\]\.includes\(result\?\.status\)/, "composer clearance is gated on an authoritative result");
assert.match(chatOwner, /clearChatComposer\(input\)/, "only the settled command path clears the composer");
assert.doesNotMatch(chatOwner, /(?:writeRaw|saveState|legacyMutate|mutateInvestigationChat|localStorage\.setItem)\s*\(/, "chat input cannot locally persist the player world");

assert.doesNotMatch(app, /(?:function|const)\s+(?:saveState|legacyMutate|mutateInvestigationChat|commitFlexibleHazardDecision|takeItemNow|withLocalItemClaimLock)\b/, "Stage 8B removes obsolete local world writer helpers from app.js");
assert.doesNotMatch(app, /__BAEKJI_FLEX_HAZARD_RUNTIME__|persistence\.writeRaw/, "app.js exposes neither flexible-hazard local writer runtime nor whole-world persistence writes");
assert.match(commandClient, /status: "QUEUED"/, "offline behavior retains command envelopes instead of snapshots");

console.log("PASS: investigation UX delegates to commands, clears only after settlement, and has no app-level world writer");
