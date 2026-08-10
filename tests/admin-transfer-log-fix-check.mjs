import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../admin-transfer-log-fix.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("../admin-dashboard.html", import.meta.url), "utf8");
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: "admin-transfer-log-fix.js" });
const api = sandbox.window.__BAEKJI_ADMIN_TRANSFER_LOG_FIX_TEST__;
assert.ok(api, "admin transfer log fix API must exist");

assert.deepEqual(
  JSON.parse(JSON.stringify(api.parseTransferText("SYSTEM · test_c의 조사조 소속이 다른 조사조로 이동되었다."))),
  { moverId: "test_c", direction: "out" }
);
assert.deepEqual(
  JSON.parse(JSON.stringify(api.parseTransferText("SYSTEM · test_c의 조사조 소속이 이 조사조로 이동되었다."))),
  { moverId: "test_c", direction: "in" }
);

const records = [
  { text: "SYSTEM · test_c의 조사조 소속이 이 조사조로 이동되었다.", partyName: "해오름역 조사조 3", row: "in" },
  { text: "SYSTEM · test_c의 조사조 소속이 다른 조사조로 이동되었다.", partyName: "해오름역 조사조 2", row: "out" },
  { text: "SYSTEM · 다른 로그", partyName: "해오름역 조사조 3", row: "other" },
];
const lookup = new Map([["test_c", "테스트 캐릭터 C"]]);
const output = api.pairTransferRecords(records, lookup);
assert.equal(output.length, 2, "paired transfer logs must collapse from two rows to one");
assert.equal(output[0].row, "in");
assert.equal(output[0].text, "테스트 캐릭터 C가 해오름역 조사조 2에서 해오름역 조사조 3로 이동했다.");
assert.equal(output[0].sourceParty, "해오름역 조사조 2");
assert.equal(output[0].targetParty, "해오름역 조사조 3");
assert.equal(output[1].row, "other");
assert.match(source, /data\.directory/);
assert.match(source, /partyTransferCanonical/);
assert.match(html, /admin-transfer-log-fix\.js\?v=0\.5\.1/);

console.log("PASS: admin transfer log shows a character name and one canonical source-to-target movement row");
