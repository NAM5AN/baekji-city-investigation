import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const index = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const activeScripts = [...index.matchAll(/<script\s+[^>]*\bsrc=["']([^"']+\.js)(?:\?[^"']*)?["'][^>]*><\/script>/g)]
  .map((match) => match[1]);
const activeSources = new Map(activeScripts.map((file) => [file, fs.readFileSync(path.join(ROOT, file), "utf8")]));

const RETIRED_SEMANTIC_LAYERS = [
  "action-log-sync.js",
  "character-interaction-result-visibility-fix.js",
  "final-observation-write-canonicalizer.js",
  "foundation-rule-fixes.js",
  "gameplay-variance.js",
  "observation-ai-sync.js",
  "observation-final-guard.js",
  "sound-event-inflection-fix.js",
  "sound-event-sync.js",
  "storage-sync-bridge.js",
  "guest-world-isolation.js",
  "entry-presence-fix.js",
  "entry-presence-party-label-fix.js",
];
for (const file of RETIRED_SEMANTIC_LAYERS) {
  assert.ok(!activeSources.has(file), `${file} must remain retired from the production boot path`);
}

for (const [file, source] of activeSources) {
  assert.doesNotMatch(
    source,
    /(?:Storage\.prototype|storageProto)\.(?:setItem|removeItem|getItem)\s*=/,
    `${file} must not install a Storage.prototype interceptor in the Stage 8B projection runtime`,
  );
  assert.doesNotMatch(
    source,
    /\bbaekji_mvp_(?:get_state|get_revision|put_state)\b/,
    `${file} must not call a browser generic whole-world RPC`,
  );
  if (file !== "world-persistence.js") {
    assert.doesNotMatch(
      source,
      /(?:__BAEKJI_WORLD_PERSISTENCE__|\bpersistence)\??\.writeRaw\s*\(/,
      `${file} must not write a player-world snapshot in the Stage 8B runtime`,
    );
  }
}

const worldPersistence = activeSources.get("world-persistence.js");
assert.ok(worldPersistence, "world persistence must remain the single raw ingress adapter");
assert.match(worldPersistence, /replaceRemoteRaw/);
assert.match(worldPersistence, /AUTHORITATIVE_PLAYER_STATE_READ_ONLY/);
assert.match(worldPersistence, /baekji_city_mvp_guest_state_v3/);
assert.doesNotMatch(worldPersistence, /Storage\.prototype/);

for (const file of ["investigation-feedback-ui.js", "investigation-log-render-flush.js"]) {
  const source = activeSources.get(file);
  assert.ok(source, `${file} remains an active render-only helper`);
  assert.match(source, /persistence\?\.subscribe\?\./, `${file} refreshes from persistence notifications`);
  assert.doesNotMatch(source, /Storage\.prototype\.(?:setItem|removeItem|getItem)\s*=/);
}

console.log(`PASS: Stage 8B active runtime has ${activeScripts.length} scripts, zero browser world writers/interceptors, and no generic whole-world RPC client`);
