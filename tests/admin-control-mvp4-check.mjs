import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applyOperation } from "../api/admin-control.mjs";
import { makeInitialStateForAdminReset, worldSummary } from "../api/admin-session-ops.mjs";

const base = {
  version: 3,
  storyDay: 1,
  loopId: "LOOP-001",
  adminControlSeq: 0,
  adminControlPatches: [],
  characters: {
    c1: {
      id: "c1",
      contamination: 3,
      symptom: "안정",
      inventory: {},
      currentPartyId: "p1",
      currentSessionId: "s1",
    },
  },
  parties: {
    p1: { id: "p1", name: "1조", sessionId: "s1", memberIds: ["c1"] },
  },
  sessions: {
    s1: {
      id: "s1",
      partyId: "p1",
      memberIds: ["c1"],
      status: "ACTIVE",
      variant: "a",
      currentNode: "E_G_PLAZA",
      currentDetailId: "E_G_INFO",
      movement: { fromNode: "E_G_PLAZA", targetNode: "E_G_WEST" },
      activeEncounter: { fromNode: "E_G_PLAZA", targetNode: "E_G_WEST", hazards: ["HZ_STRUCT_01"], currentIndex: 0 },
      choiceReveal: null,
      logs: [],
      inspectedObjectIds: [],
      takenItemKeys: [],
    },
  },
  itemClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
};

const status = applyOperation(base, {
  operation: "CHARACTER_STATUS",
  characterId: "c1",
  contamination: 44,
}, "req-status");
assert.equal(base.characters.c1.contamination, 3, "source state must stay immutable");
assert.equal(status.state.characters.c1.contamination, 44);
assert.equal(status.state.characters.c1.symptom, "안정");
assert.deepEqual(status.patch.data, { contamination: 44 }, "admin patch must only replay fields explicitly changed by admin");
assert.equal(status.patch.seq, 1);
assert.equal(status.state.adminControlSeq, 1);
assert.equal(status.state.adminControlPatches.length, 1);

const item = applyOperation(status.state, {
  operation: "INVENTORY_SET",
  characterId: "c1",
  itemId: "ITEM_FLASH",
  name: "손전등",
  category: "도구",
  quantity: 2,
  state: "CLEAN",
}, "req-item");
assert.deepEqual(item.state.characters.c1.inventory.ITEM_FLASH, {
  itemId: "ITEM_FLASH",
  name: "손전등",
  category: "도구",
  quantity: 2,
  state: "CLEAN",
});
assert.equal(item.patch.seq, 2);
assert.equal(item.patch.data.item.quantity, 2);

const session = applyOperation(item.state, {
  operation: "SESSION_CONTROL",
  sessionId: "s1",
  nodeId: "E_B1_GATE",
  variant: "d",
  status: "COMPLETED",
}, "req-session");
assert.equal(session.state.sessions.s1.currentNode, "E_B1_GATE");
assert.equal(session.state.sessions.s1.currentDetailId, null);
assert.equal(session.state.sessions.s1.variant, "d");
assert.equal(session.state.sessions.s1.status, "COMPLETED");
assert.equal(session.state.sessions.s1.movement, null);
assert.equal(session.state.sessions.s1.activeEncounter, null);
assert.equal(session.patch.data.clearTransient, true, "teleporting a session must clear transient movement/hazard state");
assert.equal(session.patch.seq, 3);

const resetState = makeInitialStateForAdminReset();
assert.deepEqual(Object.keys(resetState.characters).sort(), ["test_a", "test_b", "test_c"], "admin reset must match the player demo reset character baseline");
assert.equal(resetState.storyDay, 1);
assert.equal(resetState.loopId, "LOOP-001");
assert.equal(resetState.eventSeq, 0);
assert.equal(resetState.sessionSeq, 0);
assert.deepEqual(resetState.parties, {});
assert.deepEqual(resetState.sessions, {});
assert.deepEqual(resetState.itemClaimsByVariant, { a: {}, b: {}, c: {}, d: {} });
for (const character of Object.values(resetState.characters)) {
  assert.equal(character.contamination, 0);
  assert.equal(character.symptom, "안정");
  assert.deepEqual(character.inventory, {});
  assert.equal(character.currentPartyId, null);
  assert.equal(character.currentSessionId, null);
}
assert.deepEqual(worldSummary(resetState), {
  storyDay: 1,
  loopId: "LOOP-001",
  characterCount: 3,
  partyCount: 0,
  sessionCount: 0,
  claimedItemCount: 0,
});

const html = await readFile(new URL("../admin-dashboard.html", import.meta.url), "utf8");
const ui = await readFile(new URL("../admin-control-mvp4.js", import.meta.url), "utf8");
const statusUi = await readFile(new URL("../admin-control-status-mvp4.js", import.meta.url), "utf8");
const resetUi = await readFile(new URL("../admin-world-reset.js", import.meta.url), "utf8");
const css = await readFile(new URL("../admin-control-mvp4.css", import.meta.url), "utf8");
const api = await readFile(new URL("../api/admin-control.mjs", import.meta.url), "utf8");
const opsApi = await readFile(new URL("../api/admin-session-ops.mjs", import.meta.url), "utf8");
const auditApi = await readFile(new URL("../api/admin-audit.mjs", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/0002_admin_control_mvp4.sql", import.meta.url), "utf8");
const vercelRaw = await readFile(new URL("../vercel.json", import.meta.url), "utf8");
const vercel = JSON.parse(vercelRaw);
const cloud = await readFile(new URL("../cloud-state-sync.js", import.meta.url), "utf8");

assert.match(html, /OBSERVE · COMMUNICATION · CONTROL/);
assert.match(html, /admin-control-mvp4\.css\?v=0\.4\.1&stage4-item-transfer=1/);
assert.match(html, /admin-control-mvp4\.js\?v=0\.4\.3&stage4-item-transfer=1&lazy-entry=1&async-entry=1/);
assert.match(html, /admin-control-status-mvp4\.js\?v=0\.4\.0/);
assert.match(html, /admin-world-reset\.js\?v=0\.5\.1/);
assert.match(ui, /감사 로그/);
assert.match(ui, /상태·소지품 조작/);
assert.match(ui, /조사 세션 조작/);
assert.match(ui, /operation: "CHARACTER_STATUS"/);
assert.match(ui, /operation: "INVENTORY_SET"/);
assert.match(ui, /operation: "SESSION_CONTROL"/);
assert.match(statusUi, /동기화 중…/);
assert.match(statusUi, /document\.body\.append\(node\)/);
assert.match(statusUi, /data-admin-sync-visible/);
assert.doesNotMatch(statusUi, /node\.textContent = "CONTROL"/);
assert.match(statusUi, /new MutationObserver\(sync\)/);
assert.match(css, /#admin-control-mvp4-root/);
assert.match(css, /@media\(max-width:760px\)/);

assert.match(resetUi, /조사 상태 초기화/);
assert.match(resetUi, /API_URL = "\/api\/admin-session-ops"/);
assert.match(resetUi, /operation: "WORLD_RESET"/);
assert.match(resetUi, /confirmation: "초기화"/);
assert.match(resetUi, /테스터 계정, 관리자 계정, 관리자 채팅과 감사 로그는 삭제하지 않습니다/);
assert.match(opsApi, /makeInitialStateForAdminReset/);
assert.match(opsApi, /operation === "WORLD_RESET"/);
assert.match(opsApi, /action: "WORLD_RESET"/);
assert.match(opsApi, /SAME_AS_PLAYER_DEMO_RESET/);
assert.match(opsApi, /RESET_CONFIRMATION_REQUIRED/);

assert.match(api, /baekji_admin_state_apply/);
assert.match(api, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
assert.doesNotMatch(api, /baekji_mvp_put_state/);
assert.match(auditApi, /baekji_admin_audit_list/);
assert.doesNotMatch(auditApi, /baekji_admin_state_apply|baekji_mvp_put_state/);
assert.match(migration, /create table if not exists public\.baekji_admin_audit_logs/);
assert.match(migration, /create or replace function public\.baekji_admin_state_apply/);
assert.match(migration, /for update/);
assert.match(migration, /world_revision_before/);
assert.match(migration, /request_id text not null unique/);
assert.ok(vercel.rewrites.some((rule) => rule.source === "/api/admin-control" && rule.destination === "/api/admin-control.mjs"));
assert.ok(vercel.rewrites.some((rule) => rule.source === "/api/admin-audit" && rule.destination === "/api/admin-audit.mjs"));
assert.ok(vercel.rewrites.some((rule) => rule.source === "/api/admin-session-ops" && rule.destination === "/api/admin-session-ops.mjs"));
assert.ok(vercel.functions["api/admin-control.mjs"]);
assert.ok(vercel.functions["api/admin-audit.mjs"]);
assert.ok(vercel.functions["api/admin-session-ops.mjs"]);
assert.equal(vercel.functions["api/admin-reset.mjs"], undefined, "world reset must reuse an existing serverless function on Hobby");
assert.ok(Object.keys(vercel.functions).length <= 12, "Hobby deployment must stay at or below the 12-function limit");
assert.match(cloud, /reconcileAdminControl/);
assert.match(cloud, /applyAdminControlPatch/);
assert.match(cloud, /Number\(patch\.seq \|\| 0\) > localSeq/);

console.log("PASS: MVP4 admin control plus authenticated demo-equivalent world reset through the existing operations API, audit history, atomic writes, and non-shifting sync status");
