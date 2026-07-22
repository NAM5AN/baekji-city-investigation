import fs from "node:fs";
import assert from "node:assert/strict";

const auth = fs.readFileSync("tester-auth.js", "utf8");
const briefing = fs.readFileSync("briefing-tutorial.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const css = fs.readFileSync("tester-auth.css", "utf8");

assert(!auth.includes("URL.createObjectURL"), "profile preview must not rely on CSP-blocked blob URLs");
assert(auth.includes("selectedPhotoData = await compress(selectedFile)"), "selected photo should be compressed to a data URL before preview");
assert(auth.includes("normalizedContamination"), "tester character contamination must be normalized");
assert(auth.includes("contamination: 0"), "new tester characters need a zero contamination default");
assert(auth.includes("tester-member-avatar"), "party member cards should receive profile photos");
assert(css.includes(".tester-member-avatar"), "party profile photo styling is required");
assert(briefing.includes("DEFAULT_HEADLINES"), "briefing headline must vary by zone and variant");
assert(briefing.includes("‘/지도’"), "briefing tutorial should explain map guidance");
assert(briefing.includes("한 메시지에는 한 가지 행동만"), "briefing tutorial should explain one-action input");
assert(index.includes("briefing-tutorial.js?v=0.3.53"), "briefing tutorial module must be loaded");
assert(index.includes("tester-auth.js?v=0.3.53"), "tester auth cache key must be refreshed");

console.log("PASS: tester profile preview, contamination defaults, member photos, and briefing tutorial");