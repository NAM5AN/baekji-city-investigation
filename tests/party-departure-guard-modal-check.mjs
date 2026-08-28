import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("app.js", "utf8");

const modalStart = app.indexOf("  function showDepartureModal(");
const modalEnd = app.indexOf("  async function commitForcedDeparture(", modalStart);
assert.ok(modalStart >= 0 && modalEnd > modalStart, "departure guard must remain available");
const modal = app.slice(modalStart, modalEnd);
assert.match(modal, /root\.childElementCount/, "one open dialog prevents duplicate modal construction");
assert.match(modal, /data-party-departure-cancel/);
assert.match(modal, /data-party-departure-confirm/);
assert.match(modal, /commitForcedDeparture\(targetPartyId\)/, "confirmation must continue through the command-backed owner");
assert.doesNotMatch(modal, /(?:forcedDepartureState|startSessionState|writeRaw|saveState|localStorage\.setItem)\s*\(/, "modal actions must never mutate a browser world snapshot");

const contentStart = app.indexOf("  function departureModalContent(");
const contentEnd = app.indexOf("  function showDepartureModal(", contentStart);
const content = app.slice(contentStart, contentEnd);
assert.match(content, /초대 중인 캐릭터가 있습니다/);
assert.match(content, /준비 중인 캐릭터가 있습니다/);
assert.match(content, /초대 및 준비 중인 캐릭터가 있습니다/);
assert.match(content, /탈퇴·초대 취소 후 조사 출발/);
console.log("PASS: departure guard is metadata-driven, duplicate-safe, and delegates force departure to the server command boundary");
