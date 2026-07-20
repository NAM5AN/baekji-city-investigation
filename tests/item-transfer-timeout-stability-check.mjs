import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../item-transfer-timeout.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");

assert.match(source, /buttons\.find\(\(node\) => node\.dataset\.transferReopen === offer\.id\)/);
assert.match(source, /button\.parentElement !== choice\.parentElement \|\| button\.nextElementSibling !== choice/);
assert.match(source, /button\.dataset\.transferReopen = offer\.id/);
assert.match(source, /let syncQueued = false/);
assert.match(source, /new MutationObserver\(queueSync\)/);
assert.doesNotMatch(source, /querySelectorAll\("\[data-transfer-reopen\]"\)\.forEach\(\(node\) => node\.remove\(\)\)/);
assert.match(index, /item-transfer-timeout\.js\?v=0\.3\.43/);

console.log("item transfer timeout stability checks passed");