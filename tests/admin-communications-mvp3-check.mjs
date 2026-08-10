import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { adminCommunicationsHandler, resolveSystemRecipients } from "../api/admin-communications.mjs";
import { playerAdminSystemHandler } from "../api/player-admin-system.mjs";

function responseCollector() {
  return {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = value; },
    end(value = "") { this.body += String(value); },
  };
}

function request(method, body = null, { url = "/api/admin-communications", cookie = "baekji_admin_session=test-token" } = {}) {
  const bytes = Buffer.from(body == null ? "" : JSON.stringify(body));
  return {
    method,
    url,
    headers: { cookie },
    async *[Symbol.asyncIterator]() { if (bytes.length) yield bytes; },
  };
}

function okJson(value) {
  return { ok: true, status: 200, json: async () => value, text: async () => JSON.stringify(value) };
}

const worldState = {
  version: 3,
  characters: {
    a: { id: "a", currentSessionId: "s1", currentPartyId: "p1" },
    b: { id: "b", currentSessionId: "s1", currentPartyId: "p1" },
    c: { id: "c", currentSessionId: "s2", currentPartyId: "p2" },
    d: { id: "d", currentSessionId: "s3", currentPartyId: "p3" },
    e: { id: "e", currentSessionId: "s5", currentPartyId: "p5" },
  },
  parties: {
    p1: { id: "p1", name: "1조", memberIds: ["a", "b"], sessionId: "s1" },
    p2: { id: "p2", name: "2조", memberIds: ["c"], sessionId: "s2" },
    p3: { id: "p3", name: "3조", memberIds: ["d"], sessionId: "s3" },
    p5: { id: "p5", name: "5조", memberIds: ["e"], sessionId: "s5" },
  },
  sessions: {
    s1: { id: "s1", partyId: "p1", status: "ACTIVE", memberIds: ["a", "b"], currentNode: "E_G_PLAZA" },
    s2: { id: "s2", partyId: "p2", status: "ACTIVE", memberIds: ["c"], currentNode: "E_G_PLAZA", currentDetailId: "E_G_INFO" },
    s3: { id: "s3", partyId: "p3", status: "ACTIVE", memberIds: ["d"], currentNode: "E_B1_CONCOURSE" },
    s4: { id: "s4", partyId: "p4", status: "ENDED", memberIds: ["z"], currentNode: "E_G_PLAZA" },
    s5: { id: "s5", partyId: "p5", status: "ACTIVE", memberIds: ["e"], currentNode: "E_ENTRY" },
  },
};

assert.deepEqual(resolveSystemRecipients(worldState, "ZONE", "node:E_G_PLAZA").characterIds.sort(), ["a", "b", "c"]);
assert.deepEqual(resolveSystemRecipients(worldState, "ZONE", "node:E_G_PLAZA").sessionIds.sort(), ["s1", "s2"]);
assert.deepEqual(resolveSystemRecipients(worldState, "ZONE", "node:E_ENTRY").characterIds, ["e"], "entry zone must remain a valid directed SYSTEM scope");
assert.deepEqual(resolveSystemRecipients(worldState, "PARTY", "p1").characterIds.sort(), ["a", "b"]);
assert.deepEqual(resolveSystemRecipients(worldState, "CHARACTER", "b"), {
  characterIds: ["b"],
  sessionIds: ["s1"],
  scopes: [{ sessionId: "s1", partyId: "p1", scopeKey: "node:E_G_PLAZA", memberIds: ["a", "b"] }],
});
assert.deepEqual(resolveSystemRecipients(worldState, "ALL", "").characterIds.sort(), ["a", "b", "c", "d", "e"]);

const chatGet = responseCollector();
await adminCommunicationsHandler(request("GET", null, { url: "/api/admin-communications?afterChat=4&afterSystem=8" }), chatGet, {
  env: {},
  fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.includes("baekji_admin_session_verify")) return okJson([{ login_id: "AD1", display_name: "관리자 AD1" }]);
    if (url.includes("baekji_admin_chat_list")) {
      assert.equal(body.p_after_id, 4);
      return okJson([{ id: 5, login_id: "AD1", display_name: "관리자 AD1", message: "확인", created_at: "2026-08-10T00:00:00Z" }]);
    }
    if (url.includes("baekji_admin_system_list")) {
      assert.equal(body.p_after_id, 8);
      return okJson([{ id: 9, login_id: "AD1", display_name: "관리자 AD1", sender_label: "SYSTEM", target_kind: "ALL", target_label: "전체 참가자", message: "공지", recipient_count: 5, session_count: 4, created_at: "2026-08-10T00:00:01Z" }]);
    }
    throw new Error(`unexpected ${url}`);
  },
});
assert.equal(chatGet.statusCode, 200);
assert.equal(JSON.parse(chatGet.body).chatMessages[0].message, "확인");
assert.equal(JSON.parse(chatGet.body).systemEvents[0].sender_label, "SYSTEM");

let sentSystemBody = null;
const systemPost = responseCollector();
await adminCommunicationsHandler(request("POST", {
  kind: "system",
  targetKind: "CHARACTER",
  targetId: "b",
  targetLabel: "캐릭터 B",
  senderLabel: "안내방송",
  message: "즉시 뒤를 확인하세요.",
}), systemPost, {
  env: {},
  fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.includes("baekji_admin_session_verify")) return okJson([{ login_id: "AD1", display_name: "관리자 AD1" }]);
    if (url.includes("baekji_mvp_get_state")) return okJson([{ state: worldState, revision: 12 }]);
    if (url.includes("baekji_admin_system_send")) {
      sentSystemBody = body;
      return okJson([{ id: 10, login_id: "AD1", display_name: "관리자 AD1", target_kind: "CHARACTER", target_id: "b", target_label: "캐릭터 B", message: body.p_message, recipient_count: 1, session_count: 1, created_at: "2026-08-10T00:00:02Z" }]);
    }
    throw new Error(`unexpected ${url}`);
  },
});
assert.equal(systemPost.statusCode, 200);
assert.deepEqual(sentSystemBody.p_recipient_character_ids, ["b"], "character-targeted operator SYSTEM must not leak to party members");
assert.deepEqual(sentSystemBody.p_recipient_session_ids, ["s1"]);
assert.equal(sentSystemBody.p_scope_snapshot.revision, 12);
assert.equal(sentSystemBody.p_scope_snapshot.senderLabel, "안내방송", "chosen sender label must be persisted in the immutable scope snapshot");
assert.equal(JSON.parse(systemPost.body).event.sender_label, "안내방송", "send response must immediately reflect the chosen label");

const defaultSenderPost = responseCollector();
await adminCommunicationsHandler(request("POST", {
  kind: "system",
  targetKind: "CHARACTER",
  targetId: "b",
  targetLabel: "캐릭터 B",
  message: "기본 발신 테스트",
}), defaultSenderPost, {
  env: {},
  fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body);
    if (url.includes("baekji_admin_session_verify")) return okJson([{ login_id: "AD1", display_name: "관리자 AD1" }]);
    if (url.includes("baekji_mvp_get_state")) return okJson([{ state: worldState, revision: 13 }]);
    if (url.includes("baekji_admin_system_send")) return okJson([{ id: 11, login_id: "AD1", display_name: "관리자 AD1", target_kind: "CHARACTER", target_id: "b", target_label: "캐릭터 B", message: body.p_message, recipient_count: 1, session_count: 1, created_at: "2026-08-10T00:00:03Z" }]);
    throw new Error(`unexpected ${url}`);
  },
});
assert.equal(JSON.parse(defaultSenderPost.body).event.sender_label, "SYSTEM", "administrator-directed messages default to SYSTEM");

const noRecipient = responseCollector();
await adminCommunicationsHandler(request("POST", { kind: "system", targetKind: "CHARACTER", targetId: "missing", targetLabel: "없음", message: "test" }), noRecipient, {
  env: {},
  fetchImpl: async (url) => {
    if (url.includes("baekji_admin_session_verify")) return okJson([{ login_id: "AD1", display_name: "관리자 AD1" }]);
    if (url.includes("baekji_mvp_get_state")) return okJson([{ state: worldState, revision: 12 }]);
    throw new Error(`unexpected ${url}`);
  },
});
assert.equal(noRecipient.statusCode, 409);
assert.equal(JSON.parse(noRecipient.body).code, "ADMIN_SYSTEM_NO_RECIPIENTS");

let playerRpcBody = null;
const playerFeed = responseCollector();
await playerAdminSystemHandler(request("GET", null, { url: "/api/player-admin-system?characterId=b&after=7", cookie: "" }), playerFeed, {
  env: {},
  fetchImpl: async (_url, options) => {
    playerRpcBody = JSON.parse(options.body);
    return okJson([{ id: 10, admin_name: "관리자 AD1", sender_label: "안내방송", target_kind: "CHARACTER", target_label: "캐릭터 B", message: "즉시 뒤를 확인하세요.", recipient_session_ids: ["s1"], created_at: "2026-08-10T00:00:02Z" }]);
  },
});
assert.equal(playerFeed.statusCode, 200);
assert.deepEqual(playerRpcBody, { p_character_id: "b", p_after_id: 7, p_limit: 100 });
assert.equal(JSON.parse(playerFeed.body).events[0].recipient_session_ids[0], "s1");
assert.equal(JSON.parse(playerFeed.body).events[0].sender_label, "안내방송");

const adminJs = await readFile(new URL("../admin-communications-mvp3.js", import.meta.url), "utf8");
const senderUi = await readFile(new URL("../admin-system-sender-ui.js", import.meta.url), "utf8");
const canonicalZones = await readFile(new URL("../admin-canonical-zones.js", import.meta.url), "utf8");
const entryPresence = await readFile(new URL("../entry-presence-fix.js", import.meta.url), "utf8");
const playerJs = await readFile(new URL("../admin-system-feed.js", import.meta.url), "utf8");
const playerCss = await readFile(new URL("../admin-system-feed.css", import.meta.url), "utf8");
const motionJs = await readFile(new URL("../render-motion-stability.js", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/migrations/0004_admin_system_sender_label.sql", import.meta.url), "utf8");
const adminHtml = await readFile(new URL("../admin-dashboard.html", import.meta.url), "utf8");
const index = await readFile(new URL("../index.html", import.meta.url), "utf8");
const vercel = await readFile(new URL("../vercel.json", import.meta.url), "utf8");

assert.match(adminJs, /POLL_MS = 1200/);
assert.match(adminJs, /운영 SYSTEM 전송 확인/);
assert.match(adminJs, /SYSTEM 기록/);
assert.match(adminJs, /previewRecipients/);
assert.doesNotMatch(adminJs, /localStorage\.setItem/);
assert.doesNotMatch(adminJs, /baekji_mvp_put_state/);

assert.match(canonicalZones, /data\.meta\.startNode/);
assert.match(canonicalZones, /data\.places\[startNode\]/);
assert.match(canonicalZones, /해오름역 구역 입구/);
assert.ok(adminHtml.indexOf("admin-canonical-zones.js?v=0.5.4") < adminHtml.indexOf("admin-dashboard.js?v=0.1.0"), "canonical E_ENTRY must exist before admin zone rendering starts");
assert.ok(adminHtml.indexOf("admin-canonical-zones.js?v=0.5.4") < adminHtml.indexOf("admin-communications-mvp3.js?v=0.3.0"), "canonical E_ENTRY must exist before SYSTEM target options are built");

assert.match(entryPresence, /ENTRY_NODE = "E_ENTRY"/);
assert.match(entryPresence, /entry_meet_/);
assert.match(entryPresence, /entry_depart_/);
assert.match(entryPresence, /hasRecentMeetingLog/);
assert.match(entryPresence, /hasRecentDepartureLog/);
assert.match(entryPresence, /a\.variant !== b\.variant/);
assert.match(index, /entry-presence-fix\.js\?v=0\.3\.88/);

assert.match(senderUi, /DEFAULT_LABEL = "SYSTEM"/);
assert.match(senderUi, /"안내방송"/);
assert.match(senderUi, /data-admin-system-sender/);
assert.match(senderUi, /body\.senderLabel/);
assert.match(adminHtml, /admin-system-sender-ui\.js\?v=0\.5\.4/);
assert.match(migration, /add column if not exists sender_label text not null default 'SYSTEM'/);
assert.match(migration, /p_scope_snapshot->>'senderLabel'/);
assert.match(migration, /baekji_player_admin_system_list/);

assert.match(playerJs, /\/api\/player-admin-system/);
assert.match(playerJs, /recipient_session_ids/);
assert.match(playerJs, /event\?\.sender_label \|\| "SYSTEM"/);
assert.match(playerJs, /data-timeline-at/);
assert.match(playerJs, /function annotateNativeTimelines/);
assert.match(playerJs, /function sortTimeline/);
assert.match(playerJs, /eventTime\(a\) - eventTime\(b\)/);
assert.doesNotMatch(playerJs, /<strong>운영 SYSTEM<\/strong>/);
assert.doesNotMatch(playerJs, /localStorage\.setItem/);
assert.match(motionJs, /\.retro-system-line:not\(\.retro-admin-system-line\)/);
assert.match(playerCss, /retro-admin-system-line/);
assert.match(playerCss, /retro-admin-system-chat/);
assert.match(index, /admin-system-feed\.js\?v=0\.3\.88/);
assert.match(index, /render-motion-stability\.js\?v=0\.3\.88/);

assert.match(adminHtml, /admin-communications-mvp3\.js\?v=0\.3\.0/);
assert.match(vercel, /\/api\/admin-communications/);
assert.match(vercel, /\/api\/player-admin-system/);

console.log("PASS: canonical E_ENTRY, entry presence, scoped directed SYSTEM sender labels, and chronological player timelines are wired");
