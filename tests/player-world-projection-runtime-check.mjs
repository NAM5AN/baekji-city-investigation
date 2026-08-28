import assert from "node:assert/strict";
import { playerWorldProjectionHandler } from "../server/player-world-projection-handler.mjs";

function response() {
  return { statusCode: 0, headers: {}, body: "", setHeader(key, value) { this.headers[String(key).toLowerCase()] = value; }, end(value = "") { this.body += String(value); }, json() { return JSON.parse(this.body); } };
}

function request(method, cookie = "") { return { method, headers: cookie ? { cookie } : {} }; }

const actorProjection = {
  version: 3,
  storyDay: 1,
  loopId: "LOOP-001",
  eventSeq: 12,
  sessionSeq: 3,
  characters: {
    actor: { id: "actor", inventory: { key: { quantity: 1 } }, currentPartyId: "party-own", currentSessionId: "session-own" },
    teammate: { id: "teammate", contamination: 2, currentPartyId: "party-own", currentSessionId: "session-own" },
    nearby: { id: "nearby", contamination: 0, currentSessionId: "session-nearby" },
  },
  parties: { "party-own": { id: "party-own", memberIds: ["actor", "teammate"], invitedIds: [], status: "ACTIVE", sessionId: "session-own" } },
  sessions: {
    "session-own": { id: "session-own", memberIds: ["actor", "teammate"], logs: [{ type: "chat", text: "own" }], movement: { fromNode: "a", targetNode: "b" }, activeEncounter: { id: "own" } },
    "session-nearby": { id: "session-nearby", memberIds: ["nearby"], status: "ACTIVE", variant: "a", currentNode: "station" },
  },
  itemClaimsByVariant: { a: { "visible:key": {} } },
  fieldItemPlacementsByVariant: { a: { "visible:key": { objectId: "visible" } } },
  fieldItemPlacementClaimsByVariant: { a: { "visible:key": { claimedAt: 1 } } },
  itemTransferOffers: [{ id: "offer-actor", giverId: "actor", receiverId: "nearby", sourceInventoryKey: "key", itemSnapshot: { name: "열쇠" } }],
  itemTransferResolutions: [{ id: "resolution-actor", transferId: "offer-actor", receiverId: "nearby", decision: "ACCEPT" }],
  partyTransferRequests: { "request-actor": { id: "request-actor", requesterId: "actor", targetPartyId: "party-own", status: "PENDING" } },
  partyMembershipNotices: { "notice-actor": { id: "notice-actor", partyId: "party-own", memberId: "actor" } },
  partyMembershipRemovals: { "party-own:actor": { partyId: "party-own", memberId: "actor", active: true } },
  soundEvents: [{ id: "sound-nearby", sourceSessionId: "session-nearby", sourceNode: "station", level: "LOUD", kind: "SHOUT", at: 1 }],
};

const calls = [];
async function fetchImpl(url, options = {}) {
  const name = String(url).split("/").at(-1);
  const body = JSON.parse(options.body || "{}");
  calls.push({ name, body });
  if (name === "baekji_player_session_verify_v2") {
    return { ok: true, status: 200, json: async () => body.p_session_token === "actor-token" ? [{ account_id: "account", character_id: "actor", session_id: "session-cookie" }] : [] };
  }
  if (name === "baekji_player_world_projection_v1") {
    return { ok: true, status: 200, json: async () => [{ state: actorProjection, revision: 13 }] };
  }
  throw new Error(`unexpected RPC ${name}`);
}

const env = { SUPABASE_SECRET_KEY: "test-secret" };
const denied = response();
await playerWorldProjectionHandler(request("GET"), denied, { env, fetchImpl });
assert.equal(denied.statusCode, 401);
assert.equal(calls.length, 0, "missing session must not invoke any Supabase RPC");

const method = response();
await playerWorldProjectionHandler(request("POST", "baekji_player_session=actor-token"), method, { env, fetchImpl });
assert.equal(method.statusCode, 405);
assert.equal(calls.length, 0);

const ok = response();
await playerWorldProjectionHandler(request("GET", "baekji_player_session=actor-token"), ok, { env, fetchImpl });
assert.equal(ok.statusCode, 200);
assert.equal(ok.headers["cache-control"], "no-store");
assert.deepEqual(calls.map((call) => call.name), ["baekji_player_session_verify_v2", "baekji_player_world_projection_v1"]);
assert.deepEqual(calls.at(-1).body, { p_session_token: "actor-token" }, "client never supplies actor identity or a state key");
const payload = ok.json();
assert.equal(payload.revision, 13);
assert.equal(payload.actorId, "actor", "actor identity is derived from the verified session, never from the query");
assert.deepEqual(payload.state.sessions["session-own"].logs, [{ type: "chat", text: "own" }], "own session remains readable");
const nearby = payload.state.sessions["session-nearby"];
assert.equal(nearby.activeEncounter, undefined);
assert.equal(nearby.movement, undefined);
assert.equal(nearby.logs, undefined);
assert.equal(payload.state.characters.nearby.inventory, undefined);
assert.equal(payload.state.parties["party-foreign"], undefined);
assert.deepEqual(payload.state.itemClaimsByVariant.a, { "visible:key": {} }, "claim availability keys survive while claim metadata stays scrubbed");
assert.equal(payload.state.itemTransferOffers[0].giverId, "actor");
assert.equal(payload.state.itemTransferOffers.find((entry) => entry.id === "offer-foreign"), undefined);
assert.equal(payload.state.itemTransferResolutions[0].transferId, "offer-actor");
assert.equal(payload.state.partyTransferRequests["request-actor"].requesterId, "actor");
assert.equal(payload.state.partyTransferRequests["request-foreign"], undefined);
assert.ok(payload.state.partyMembershipNotices["notice-actor"]);
assert.equal(payload.state.partyMembershipNotices["notice-foreign"], undefined);
assert.ok(payload.state.partyMembershipRemovals["party-own:actor"]);
assert.equal(payload.state.soundEvents[0].sourceSessionId, "session-nearby");
assert.equal(payload.state.soundEvents[0].actorId, undefined);
assert.equal(payload.state.soundEvents[0].sourceActionLogId, undefined);

const malformed = response();
await playerWorldProjectionHandler(request("GET", "baekji_player_session=actor-token"), malformed, {
  env,
  fetchImpl: async (url, options) => {
    const name = String(url).split("/").at(-1);
    if (name === "baekji_player_session_verify_v2") return { ok: true, status: 200, json: async () => [{ account_id: "account", character_id: "actor", session_id: "session-cookie" }] };
    return { ok: true, status: 200, json: async () => [{ state: { version: 2 }, revision: 13 }] };
  },
});
assert.equal(malformed.statusCode, 503, "invalid database projection shapes must never be served");

console.log("PASS: player projection API is cookie-bound and serves sparse database projections only");
