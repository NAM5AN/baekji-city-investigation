import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../cloud-state-sync.js", import.meta.url), "utf8");
const persistence = fs.readFileSync(new URL("../world-persistence.js", import.meta.url), "utf8");

assert.doesNotMatch(source, /baekji_mvp_(?:get|put)_state|baekji_mvp_get_revision|p_state_key|p_expected_revision/, "browser cloud runtime must have zero generic world RPCs");
assert.doesNotMatch(source, /Storage\.prototype\.(?:setItem|removeItem|getItem)\s*=|storageProto\.(?:setItem|removeItem|getItem)\s*=/, "projection runtime must not patch Storage.prototype");
assert.doesNotMatch(source, /rebaseUnsynced|mergeValues|reconcileMovement|pendingRaw|pushInFlight|unsynced/i, "snapshot rebase and unsynced-state ownership are gone");
assert.match(source, /fetch\("\/api\/player-world-projection", \{[\s\S]*?method: "GET"[\s\S]*?credentials: "same-origin"[\s\S]*?cache: "no-store"/);
assert.match(source, /projection\.actorId !== expectedActorId/);
assert.match(source, /new BroadcastChannel\("baekji-player-world-v1"\)/);
assert.match(source, /postMessage\?\.\(\{ type: "revision", revision, actorId \}\)/, "cross-tab messages must carry revision metadata only");
assert.doesNotMatch(source, /localStorage\.(?:setItem|removeItem)\([^\n]*projection|localStorage\.(?:setItem|removeItem)\([^\n]*state/i, "private projections must not be persisted in localStorage");
assert.match(persistence, /replaceRemoteRaw/);
assert.match(persistence, /AUTHORITATIVE_PLAYER_STATE_READ_ONLY/);

console.log("PASS: cloud sync is projection-only, actor-bound, and storage-patch-free");
