import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync(new URL("../topbar-profile-scope-fix.css", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const auth = fs.readFileSync(new URL("../tester-auth.js", import.meta.url), "utf8");

assert.match(app, /<span class="badge" data-current-user-badge>/);
assert.match(app, /return `<span class="badge">DAY 01<\/span><button[^`]+data-open-map=/);
assert.doesNotMatch(app.match(/function investigationHeaderMarkup[\s\S]+?\n  }/)?.[0] || "", /investigationDisplayNodeName/);
assert.match(auth, /querySelectorAll\("\.topbar-meta \[data-current-user-badge\]"\)/);
assert.doesNotMatch(auth, /querySelectorAll\("\.topbar-meta \.badge"\)/);
assert.match(css, /\.topbar-meta \.tester-profile-avatar\{display:none!important\}/);
assert.match(css, /\.topbar-meta \[data-current-user-badge\]>\.tester-profile-avatar\{display:inline-block!important\}/);
assert.match(index, /topbar-profile-scope-fix\.css\?v=0\.3\.83/);
assert.match(index, /tester-auth\.js\?v=0\.3\.90&stage6b=1&stage8b=1/);
assert.match(index, /app\.js[^"\n]+topbar=1/);

console.log("PASS: investigation topbar keeps only day and map controls, with profile photos scoped to the current user");
