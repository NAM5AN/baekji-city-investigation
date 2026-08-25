import assert from "node:assert/strict";
import fs from "node:fs";

const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const html = read("admin-dashboard.html");
const shell = read("admin-shell-runtime.js");
const dashboard = read("admin-dashboard.js");
const topology = read("admin-zone-topology.js");
const map = read("admin-zone-map.js");
const live = read("admin-live-render.js");
const observation = read("admin-observation-mvp2.js");
const communications = read("admin-communications-mvp3.js");
const control = read("admin-control-mvp4.js");
const sessionOps = read("admin-session-ops-mvp5.js");

const orderedScripts = [
  "admin-canonical-zones.js?v=0.5.4",
  "admin-shell-runtime.js?v=0.1.0",
  "admin-dashboard.js?v=0.1.1&shell-runtime=1",
  "admin-zone-topology.js?v=0.1.0&stage4b=1",
  "admin-zone-map.js?v=0.6.1&stage4b=1",
  "admin-live-render.js?v=0.6.4&stage4b=1",
  "admin-observation-mvp2.js?v=0.2.2&shell-runtime=1&stage4c=1",
  "admin-communications-mvp3.js?v=0.3.0",
  "admin-control-mvp4.js?v=0.4.7&stage4-item-transfer=1&lazy-entry=1&async-entry=1&shell-capture=1&item-disposition=1&field-item-management=1",
  "admin-session-ops-mvp5.js?v=0.5.1&shell-runtime=1",
];
const scriptIndexes = new Map();
for (const script of orderedScripts) {
  assert.match(html, new RegExp(script.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `dashboard loads ${script}`);
  const index = html.indexOf(script);
  assert.ok(index >= 0, `${script} must exist before load order is checked`);
  scriptIndexes.set(script, index);
}
for (let index = 1; index < orderedScripts.length; index += 1) {
  assert.ok(scriptIndexes.get(orderedScripts[index - 1]) < scriptIndexes.get(orderedScripts[index]), `${orderedScripts[index - 1]} loads before ${orderedScripts[index]}`);
}
assert.doesNotMatch(html, /admin-modal-reopen-guard\.js/, "legacy modal guard cannot reintroduce a second modal owner");

assert.match(shell, /\/api\/admin-snapshot/, "shell remains the snapshot owner");
for (const [lane, source] of [["dashboard", dashboard], ["map", map], ["live", live], ["observation", observation]]) {
  assert.doesNotMatch(source, /\/api\/admin-snapshot/, `${lane} consumes shell state rather than fetching snapshots`);
  assert.doesNotMatch(source, /setInterval\s*\(/, `${lane} does not create a competing snapshot interval`);
}
assert.match(dashboard, /__BAEKJI_ADMIN_SHELL__/);
assert.match(observation, /__BAEKJI_ADMIN_SHELL__/);
assert.match(control, /__BAEKJI_ADMIN_SHELL__/);
assert.match(sessionOps, /__BAEKJI_ADMIN_SHELL__/);
assert.match(map, /__BAEKJI_ADMIN_ZONE_TOPOLOGY__/);
assert.match(live, /__BAEKJI_ADMIN_ZONE_TOPOLOGY__/);
assert.doesNotMatch(topology, /fetch\s*\(|addEventListener\s*\(|setTimeout\s*\(|setInterval\s*\(/, "topology stays a dependency-free helper lane");
assert.match(communications, /__BAEKJI_ADMIN_COMMUNICATIONS_MVP3__/, "communications retains its one bootstrap guard");

console.log("PASS: admin feature lanes retain one shell owner, ordered module loading, and isolated topology consumers");
