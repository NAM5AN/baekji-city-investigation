import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const fakeNode = () => ({
  innerHTML: "", value: "", dataset: {},
  appendChild() {}, remove() {}, addEventListener() {}, select() {}, focus() {},
});
const document = {
  body: { classList: { add() {}, remove() {} } },
  activeElement: null,
  getElementById: () => fakeNode(),
  createElement: () => fakeNode(),
  querySelector: () => null,
  querySelectorAll: () => [],
};
const window = { addEventListener() {} };
const context = vm.createContext({
  window,
  document,
  localStorage: storage(),
  sessionStorage: storage(),
  location: { hash: "#/login" },
  Intl, Date, Math, JSON, String, Object, Array, Set, Map,
  setTimeout, clearTimeout, setInterval: () => 0,
  requestAnimationFrame: (fn) => fn(),
  console,
});

vm.runInContext(fs.readFileSync(new URL("../data/day1-data.js", import.meta.url), "utf8"), context);
let appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const footerIndex = appSource.indexOf('  window.addEventListener("hashchange", render);');
assert.ok(footerIndex > 0, "테스트 훅을 삽입할 위치가 필요합니다.");
appSource = appSource.slice(0, footerIndex) + `
  window.__V037_TEST__ = {
    actionResolutionText, isInspectionAction, objectMatch,
    inspectionTarget, mundaneInspectionText, unknownActionText,
  };
` + appSource.slice(footerIndex);
vm.runInContext(appSource, context);

const api = window.__V037_TEST__;
const ticketSession = {
  id: "ticket-test",
  currentNode: "E_B1_TICKET",
  currentDetailId: null,
  activeEncounter: null,
  movement: null,
  variant: "c",
  logs: [],
};

assert.equal(api.isInspectionAction("교통카드 충전기 본다"), true);
assert.equal(api.objectMatch(ticketSession, "교통카드 충전기 본다")?.id, "E_OBJ_016");
assert.equal(api.inspectionTarget("광고판을 본다"), "광고판");

const mundane = api.mundaneInspectionText(ticketSession, "테스트 캐릭터 A", "광고판을 본다");
assert.match(mundane, /광고판/);
assert.match(mundane, /평범|아무것도|조사할 만한|특이한 흔적/);

const failureOne = api.unknownActionText(ticketSession, "테스트 캐릭터 A", "벽을 밀어본다");
ticketSession.logs.push({ type: "fail" });
const failureTwo = api.unknownActionText(ticketSession, "테스트 캐릭터 A", "벽을 밀어본다");
assert.match(failureOne, /벽을 밀어본다/);
assert.match(failureOne, /움직|고정|힘|이음새/);
assert.notEqual(failureOne, failureTwo);

const hazardFailure = api.actionResolutionText(
  "테스트 캐릭터 A",
  "난간을 강하게 잡고 버틴다",
  "FAIL",
  "HZ_STRUCT_01",
  3,
  "failure-seed",
);
assert.match(hazardFailure, /난간을 강하게 잡고 버틴다/);
assert.match(hazardFailure, /발판|진동|구조물|고정점/);
assert.match(hazardFailure, /오염도가 3% 상승/);

assert.ok(appSource.includes('document.body.classList.add("retro-mode", "retro-home-mode")'));
assert.ok(appSource.includes("mundaneInspectionText"));
assert.ok(appSource.includes("failureVariantIndex"));

console.log("PASS: v0.3.7 홈 UI·본다 조사·일반 대상 묘사·행동/원인 포함 실패 변주");
