import assert from "node:assert/strict";
import fs from "node:fs";

const modal = fs.readFileSync(new URL("../item-transfer-modal.js", import.meta.url), "utf8");
const lifecycle = fs.readFileSync(new URL("../item-transfer-lifecycle.js", import.meta.url), "utf8");
const sender = fs.readFileSync(new URL("../item-transfer-sender.js", import.meta.url), "utf8");
const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../item-transfer-modal.css", import.meta.url), "utf8");

assert.match(modal, /baekji_transfer_held/);
assert.match(modal, /heldTransferId\(\) === offer\.id/);
assert.match(lifecycle, /decision:\s*"CANCELLED"/);
assert.match(lifecycle, /둘 중 한 명이 전달을 시작한 장소를 벗어났다/);
assert.match(lifecycle, /giverSession\.variant === receiverSession\.variant/);
assert.match(lifecycle, /T\.scope\(giverSession\) === T\.scope\(receiverSession\)/);
assert.match(sender, /상대방의 답변을 기다리는 중/);
assert.match(sender, /data-transfer-cancel/);
assert.match(sender, /data-transfer-sender-bar/);
assert.match(css, /retro-transfer-sender-actions/);
assert.match(index, /item-transfer-lifecycle\.js\?v=0\.3\.41/);
assert.match(index, /item-transfer-sender\.js\?v=0\.3\.41/);

console.log("item transfer lifecycle checks passed");
