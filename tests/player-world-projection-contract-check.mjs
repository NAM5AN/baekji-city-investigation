import assert from "node:assert/strict";
import fs from "node:fs";

const migration = fs.readFileSync(new URL("../supabase/migrations/20260828055833_player_world_projection.sql", import.meta.url), "utf8");
const privacyCorrection = fs.readFileSync(new URL("../supabase/migrations/20260828062555_player_world_projection_variant_scope.sql", import.meta.url), "utf8");
const api = fs.readFileSync(new URL("../server/player-world-projection-handler.mjs", import.meta.url), "utf8");
const apiRouter = fs.readFileSync(new URL("../api/index.mjs", import.meta.url), "utf8");
const vercel = fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8");

assert.match(migration, /create or replace function public\.baekji_player_world_projection_v1\(p_session_token text\)/i);
assert.match(migration, /security invoker\s+set search_path = public, extensions/i, "projection must use caller privileges and a fixed search path");
assert.match(migration, /from public\.baekji_player_session_verify_v2\(p_session_token\)/i, "the database must derive the actor from its session token");
assert.match(migration, /from public\.baekji_mvp_state_store\s+where state_key = 'day1_world'/i, "projection must read only the canonical world row");
assert.match(migration, /revoke all on function public\.baekji_player_world_projection_v1\(text\) from public, anon, authenticated/i);
assert.match(migration, /grant execute on function public\.baekji_player_world_projection_v1\(text\) to service_role/i);
assert.doesNotMatch(migration, /grant execute on function public\.baekji_player_world_projection_v1\(text\) to (?:public|anon|authenticated)/i);

assert.match(privacyCorrection, /coalesce\(own_entry\.value ->> 'variant', ''\) = coalesce\(entry\.value ->> 'variant', ''\)/, "nearby visibility must compare the candidate and actor session variants directly");
assert.match(privacyCorrection, /from jsonb_each\(v_own_sessions\) own_entry[\s\S]*?when own_entry\.value -> 'movement'[\s\S]*?when entry\.value -> 'movement'/, "nearby visibility must match variant and spatial scope on the same actor-session pair");
const nearbyStart = privacyCorrection.indexOf("into v_nearby_sessions");
const nearbyObjectStart = privacyCorrection.lastIndexOf("jsonb_build_object(", nearbyStart);
const nearbyObject = privacyCorrection.slice(nearbyObjectStart, nearbyStart);
assert.match(nearbyObject, /'memberIds'/);
assert.doesNotMatch(nearbyObject, /'inventory'|'logs'|'activeEncounter'|'movement'|'choiceReveal'|'inspectedObjectIds'/, "nearby sessions must be presence-only");

const nonActorStart = privacyCorrection.indexOf("else jsonb_strip_nulls(jsonb_build_object(");
const nonActor = privacyCorrection.slice(nonActorStart, privacyCorrection.indexOf(")) end", nonActorStart));
assert.doesNotMatch(nonActor, /'inventory'/, "visible non-actors must not receive inventories");
assert.match(privacyCorrection, /v_own_sessions \|\| v_nearby_sessions/, "only own full sessions may be combined with nearby sparse sessions");
assert.match(privacyCorrection, /where entry\.key = any\(v_visible_variants\)/g, "field claims and placements must be limited to actor-active variants");
const claimStart = privacyCorrection.indexOf("into v_item_claims");
const claimAggregate = privacyCorrection.slice(privacyCorrection.lastIndexOf("select", claimStart), claimStart);
assert.match(claimAggregate, /jsonb_object_agg\(claim\.key, '\{\}'::jsonb\)/, "claim keys must remain while claim metadata cannot disclose a different actor's inventory key");
assert.match(privacyCorrection, /into v_item_transfer_offers[\s\S]*?giverId' = v_identity\.character_id[\s\S]*?receiverId' = v_identity\.character_id/, "offers must be limited to their giver or receiver");
assert.match(privacyCorrection, /into v_item_transfer_resolutions[\s\S]*?transferId/, "resolutions must be joined only to actor-visible offers");
assert.match(privacyCorrection, /into v_party_transfer_requests[\s\S]*?requesterId' = v_identity\.character_id[\s\S]*?targetPartyId/, "party transfers must be actionable by requester or target leader only");
assert.match(privacyCorrection, /into v_party_membership_notices[\s\S]*?memberId' = v_identity\.character_id/, "membership notices must remain actor-scoped");
const soundStart = privacyCorrection.indexOf("into v_sound_events");
const soundObject = privacyCorrection.slice(privacyCorrection.lastIndexOf("jsonb_build_object(", soundStart), soundStart);
assert.doesNotMatch(soundObject, /'actorId'|'sourceActionLogId'/, "sound projection must not reveal actor/action-log metadata");

assert.match(api, /verifyPlayerSession\(request/, "HTTP handler must verify the HttpOnly cookie before the projection RPC");
assert.match(api, /baekji_player_world_projection_v1/);
assert.doesNotMatch(api, /baekji_mvp_get_state|baekji_mvp_get_revision|baekji_mvp_put_state/, "player projection handler must not regain generic world RPC access");
assert.match(api, /Cache-Control", "no-store"/);
assert.match(api, /actorId: verified\.identity\.characterId/, "response must identify the server-verified actor for multitab validation");
assert.match(apiRouter, /import \{ playerWorldProjectionHandler \} from "\.\.\/server\/player-world-projection-handler\.mjs"/);
assert.match(apiRouter, /url\.pathname === "\/api\/player-world-projection"/, "the authenticated API router must own the projection route");
assert.match(vercel, /"source": "\/api\/player-world-projection", "destination": "\/api\/index\.mjs"/, "the deployed rewrite must preserve the authenticated router boundary");

console.log("PASS: player projection SQL is actor-bound, sparse, and service-role-only");
