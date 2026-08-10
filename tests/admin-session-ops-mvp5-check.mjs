import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applySessionOperation, diagnosticIssues, buildDiagnostics } from "../api/admin-session-ops.mjs";

const base = {
  version: 3,
  adminControlSeq: 7,
  adminControlPatches: [],
  characters: {
    c1: { id: "c1", currentSessionId: "s1" },
    c2: { id: "c2", currentSessionId: "s1" },
  },
  parties: { p1: { id: "p1", name: "1조", sessionId: "s1", memberIds: ["c1", "c2"] } },
  sessions: {
    s1: {
      id: "s1", partyId: "p1", memberIds: ["c1", "c2"], status: "ACTIVE", variant: "c",
      currentNode: "E_G_PLAZA", currentDetailId: "E_G_INFO", movement: null,
      activeEncounter: { hazards: ["HZ_STRUCT_01"], currentIndex: 0 }, choiceReveal: null, endedAt: null,
    },
  },
};

const paused = applySessionOperation(base, { operation: "SESSION_PAUSE", sessionId: "s1" }, "req-pause", 1000);
assert.equal(paused.state.sessions.s1.status, "PAUSED");
assert.equal(paused.patch.action, "SESSION_CONTROL");
assert.deepEqual(paused.patch.data, { status: "PAUSED" });
assert.equal(paused.patch.seq, 8);
assert.equal(base.sessions.s1.status, "ACTIVE", "source world state must stay immutable");

const resumed = applySessionOperation(paused.state, { operation: "SESSION_RESUME", sessionId: "s1" }, "req-resume", 2000);
assert.equal(resumed.state.sessions.s1.status, "ACTIVE");
assert.deepEqual(resumed.patch.data, { status: "ACTIVE" });

const moving = structuredClone(base);
moving.sessions.s1.movement = { fromNode: "E_G_PLAZA", targetNode: "E_G_WEST", resolveAt: 1 };
assert.throws(() => applySessionOperation(moving, { operation: "SESSION_PAUSE", sessionId: "s1" }, "req-bad"), /SESSION_MOVEMENT_MUST_RECOVER_FIRST/);

const recovered = applySessionOperation(moving, { operation: "SESSION_RECOVER", sessionId: "s1" }, "req-recover", 3000);
assert.equal(recovered.state.sessions.s1.movement, null);
assert.equal(recovered.state.sessions.s1.activeEncounter, null);
assert.equal(recovered.state.sessions.s1.currentDetailId, "E_G_INFO");
assert.equal(recovered.patch.data.clearTransient, true);

const resetField = applySessionOperation(moving, { operation: "SESSION_RECOVER", sessionId: "s1", resetField: true }, "req-field", 4000);
assert.equal(resetField.state.sessions.s1.currentDetailId, null);
assert.equal(resetField.patch.data.nodeId, "E_G_PLAZA");
assert.equal(resetField.patch.data.clearTransient, true);

const ended = applySessionOperation(base, { operation: "SESSION_FORCE_END", sessionId: "s1" }, "req-end", 5000);
assert.equal(ended.state.sessions.s1.status, "COMPLETED");
assert.equal(ended.state.sessions.s1.activeEncounter, null);
assert.equal(ended.state.sessions.s1.endedAt, 5000);
assert.deepEqual(ended.patch.data, { status: "COMPLETED", clearTransient: true });

const issues = diagnosticIssues(moving, moving.sessions.s1, 20_000);
assert.ok(issues.some((issue) => issue.code === "STUCK_MOVEMENT"), "expired movement must be flagged as stuck");
const diagnostics = buildDiagnostics(base, [{ character_id: "c1", last_seen_at: "2026-08-10T00:00:00Z" }], Date.parse("2026-08-10T00:00:20Z"));
assert.equal(diagnostics[0].presence.find((entry) => entry.characterId === "c1").lastSeenAt, "2026-08-10T00:00:00Z");
assert.equal(diagnostics[0].presence.find((entry) => entry.characterId === "c2").lastSeenAt, null);

const adminHtml = await readFile(new URL("../admin-dashboard.html", import.meta.url), "utf8");
const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
const adminUi = await readFile(new URL("../admin-session-ops-mvp5.js", import.meta.url), "utf8");
const adminCss = await readFile(new URL("../admin-session-ops-mvp5.css", import.meta.url), "utf8");
const playerUi = await readFile(new URL("../player-admin-ops-mvp5.js", import.meta.url), "utf8");
const playerCss = await readFile(new URL("../player-admin-ops-mvp5.css", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/0003_admin_operations_mvp5.sql", import.meta.url), "utf8");
const cloud = await readFile(new URL("../cloud-state-sync.js", import.meta.url), "utf8");
const vercel = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));

assert.match(adminHtml, /OPERATIONS · MVP 5/);
assert.match(adminHtml, /admin-session-ops-mvp5\.css\?v=0\.5\.0/);
assert.match(adminHtml, /admin-session-ops-mvp5\.js\?v=0\.5\.0/);
assert.match(indexHtml, /player-admin-ops-mvp5\.css\?v=0\.5\.0/);
assert.match(indexHtml, /player-admin-ops-mvp5\.js\?v=0\.5\.0/);
assert.match(adminUi, /운영 점검/);
assert.match(adminUi, /SESSION_PAUSE/);
assert.match(adminUi, /SESSION_RESUME/);
assert.match(adminUi, /SESSION_FORCE_END/);
assert.match(adminUi, /SESSION_RECOVER/);
assert.match(adminUi, /ONLINE ≤45초/);
assert.match(adminCss, /#admin-session-ops-mvp5-root/);
assert.match(adminCss, /@media\(max-width:760px\)/);
assert.match(playerUi, /\/api\/player-presence/);
assert.match(playerUi, /status === "PAUSED"/);
assert.match(playerUi, /HEARTBEAT_MS = 20_000/);
assert.match(playerCss, /조사|pause|admin-session-paused-mvp5/);
assert.match(migration, /create table if not exists public\.baekji_player_presence/);
assert.match(migration, /baekji_player_presence_ping/);
assert.match(migration, /baekji_admin_presence_list/);
assert.match(cloud, /if \(hasOwn\(data, "status"\)\)/, "existing admin control conflict replay must preserve PAUSED/ACTIVE/COMPLETED status writes");
assert.ok(vercel.rewrites.some((row) => row.source === "/api/admin-session-ops" && row.destination === "/api/admin-session-ops.mjs"));
assert.ok(vercel.rewrites.some((row) => row.source === "/api/player-presence" && row.destination === "/api/player-presence.mjs"));

console.log("PASS: MVP5 admin operations pause/resume, force end, recovery, anomaly diagnostics, and isolated presence heartbeat");
