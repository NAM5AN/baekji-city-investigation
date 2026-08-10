import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync(new URL("../topbar-profile-scope-fix.css", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.match(css, /\.topbar-meta > \.badge \.tester-profile-avatar\{display:none!important\}/);
assert.match(css, /\.topbar-meta > \.badge:nth-last-child\(2\) \.tester-profile-avatar\{display:inline-block!important\}/);
assert.match(index, /topbar-profile-scope-fix\.css\?v=0\.3\.82/);

console.log("PASS: topbar profile photo is visible only in the current-character badge immediately before logout");
