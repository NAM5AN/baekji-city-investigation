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
assert(auth.includes("function isDemoUserRegistry"), "dynamic tester accounts must be limited to the demo user registry");
assert(auth.includes("typeof candidate.password === \"string\""), "demo user registry detection must distinguish account records from character state");
assert(auth.includes("if (!isDemoUserRegistry(target)) return output;"), "Object.values must not append tester accounts to ordinary state objects");
assert(!auth.includes("writable: true, value: user"), "tester account records must not be inherited by every object");
assert(briefing.includes("SAFE_LIGHT_NAMES"), "briefing headline should expose only a neutral light label");
assert(briefing.includes("붉은빛"), "red-light briefing label is required");
assert(briefing.includes("해오름역은 지상 환승광장과 지하 대합실, 승강장으로 이어진다."), "briefing headline needs a neutral zone description");
for (const spoiler of ["다른 시간", "시간대", "어긋", "사라지고", "백화", "재난", "변주"]) {
  assert(!briefing.includes(spoiler), `briefing headline module must not reveal or imply ${spoiler}`);
}
assert(briefing.includes("‘/지도’"), "briefing tutorial should explain map guidance");
assert(briefing.includes("한 메시지에는 한 가지 행동만"), "briefing tutorial should explain one-action input");
assert(index.includes("briefing-tutorial.js?v=0.3.54"), "briefing tutorial cache key must remain current");
assert(index.includes("tester-auth.js?v=0.3.55"), "tester auth cache key must be refreshed");

console.log("PASS: tester profiles, isolated login bridge, and spoiler-free briefing tutorial");
