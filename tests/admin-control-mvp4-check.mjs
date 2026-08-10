import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applyOperation } from "../api/admin-control.mjs";

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

const html = await readFile(new URL("../admin-dashboard.html", import.meta.url), "utf8");
const ui = await readFile(new URL("../admin-control-mvp4.js", import.meta.url), "utf8");
const statusUi = await readFile(new URL("../admin-control-status-mvp4.js", import.meta.url), "utf8");
const css = await readFile(new URL("../admin-control-mvp4.css", import.meta.url), "utf8");
const api = await readFile(new URL("../api/admin-control.mjs", import.meta.url), "utf8");
const auditApi = await readFile(new URL("../api/admin-audit.mjs", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/0002_admin_control_mvp4.sql", import.meta.url), "utf8");
const vercelRaw = await readFile(new URL("../vercel.json", import.meta.url), "utf8");
const vercel = JSON.parse(vercelRaw);
const cloud = await readFile(new URL("../cloud-state-sync.js", import.meta.url), "utf8");

assert.match(html, /OBSERVE · COMMUNICATION · CONTROL/);
assert.match(html, /admin-control-mvp4\.css\?v=0\.4\.0/);
assert.match(html, /admin-control-mvp4\.js\?v=0\.4\.0/);
assert.match(html, /admin-control-status-mvp4\.js\?v=0\.4\.0/);
assert.match(ui, /감사 로그/);
assert.match(ui, /상태·소지품 조작/);
assert.match(ui, /조사 세션 조작/);
assert.match(ui, /operation: "CHARACTER_STATUS"/);
assert.match(ui, /operation: "INVENTORY_SET"/);
assert.match(ui, /operation: "SESSION_CONTROL"/);
assert.match(statusUi, /node\.textContent === "READ ONLY"/);
assert.match(statusUi, /node\.textContent = "CONTROL"/);
assert.match(statusUi, /new MutationObserver\(sync\)/);
assert.match(css, /#admin-control-mvp4-root/);
assert.match(css, /@media\(max-width:760px\)/);

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
assert.ok(vercel.functions["api/admin-control.mjs"]);
assert.ok(vercel.functions["api/admin-audit.mjs"]);
assert.match(cloud, /reconcileAdminControl/);
assert.match(cloud, /applyAdminControlPatch/);
assert.match(cloud, /Number\(patch\.seq \|\| 0\) > localSeq/);

console.log("PASS: MVP4 admin control mutates only validated targets, records replayable patches, exposes audit history, and keeps writes atomic");
