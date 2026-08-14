import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEST_DIR = path.join(ROOT, "tests");
const CODE_EXTENSIONS = new Set([".js", ".mjs", ".cjs"]);
const SKIP_DIRS = new Set([".git", "node_modules"]);

const GROUPS = Object.freeze({
  core: [
    "data-check.mjs",
    "runtime-utils-check.mjs",
    "runtime-domain-rules-check.mjs",
    "runtime-caller-adoption-check.mjs",
    "ux-flow-check.mjs",
    "v037-behavior-check.mjs",
    "v0331-ambient-risk-check.mjs",
  ],
  player: [
    "party-flow-check.mjs",
    "party-confirmed-ready-collapse-check.mjs",
    "party-departure-guard-modal-check.mjs",
    "party-departure-capture-order-check.mjs",
    "result-party-disband-check.mjs",
    "pending-party-invites-check.mjs",
    "party-leadership-flow-check.mjs",
    "party-leadership-runtime-check.mjs",
    "party-roster-modal-check.mjs",
    "party-flow-ux-fix-check.mjs",
    "party-membership-ux-fix-check.mjs",
    "tester-login-stable-contract-check.mjs",
    "choice-chat-feedback-check.mjs",
    "cross-party-hazard-interaction-check.mjs",
    "party-transfer-flow-check.mjs",
    "party-transfer-runtime-fix-check.mjs",
    "flexible-hazard-resolution-check.mjs",
    "item-transfer-lifecycle-check.mjs",
    "item-transfer-timeout-stability-check.mjs",
    "item-transfer-check.mjs",
    "tester-profile-briefing-check.mjs",
    "stage2-foundation-ui-render-check.mjs",
    "stage2-briefing-direct-render-check.mjs",
    "stage2-party-direct-render-check.mjs",
    "stage2-home-briefing-party-direct-render-check.mjs",
    "tester-auth-registry-check.mjs",
    "party-member-home-roster-check.mjs",
  ],
  sync: [
    "action-log-sync-check.mjs",
    "cloud-state-sync-check.mjs",
    "cloud-auth-race-check.mjs",
    "investigation-external-sync-render-check.mjs",
    "multi-tab-movement-completion-check.mjs",
    "movement-cloud-sync-check.mjs",
    "observation-ai-check.mjs",
    "sound-event-sync-check.mjs",
    "runtime-baseline-stability-check.mjs",
  ],
  admin: [
    "admin-dashboard-mvp-check.mjs",
    "admin-zone-map-check.mjs",
    "admin-transfer-log-fix-check.mjs",
    "admin-observation-mvp2-check.mjs",
    "admin-modal-reopen-guard-check.mjs",
    "admin-communications-mvp3-check.mjs",
    "admin-chat-mobile-mvp3-check.mjs",
    "admin-control-mvp4-check.mjs",
    "admin-item-transfer-check.mjs",
    "admin-control-cloud-conflict-check.mjs",
    "admin-session-ops-mvp5-check.mjs",
  ],
  ui: [
    "media-ui-check.mjs",
    "font-ui-check.mjs",
    "all-screen-retro-check.mjs",
    "map-ui-check.mjs",
    "readability-ui-check.mjs",
    "mobile-investigation-ui-check.mjs",
    "mobile-investigation-viewport-frame-check.mjs",
    "mobile-route-scope-guard-check.mjs",
    "mobile-panel-layout-fix-check.mjs",
    "mobile-bidirectional-swipe-check.mjs",
    "retro-motion-check.mjs",
    "render-motion-stability-check.mjs",
    "investigation-feedback-ui-check.mjs",
    "investigation-visual-polish-check.mjs",
    "party-invite-grid-stability-check.mjs",
    "retro-motion-contract-check.mjs",
    "retro-sound-check.mjs",
    "retro-sound-boost-check.mjs",
    "tester-party-mobile-topbar-check.mjs",
    "topbar-profile-scope-fix-check.mjs",
    "tester-profile-photo-editor-check.mjs",
  ],
  server: [
    "ai-server-check.mjs",
    "vercel-deploy-check.mjs",
    "github-pages-test-environment-check.mjs",
    "supabase-direct-endpoint-check.mjs",
    "recovered-production-migrations-check.mjs",
  ],
});

const GROUP_ORDER = Object.freeze(["core", "player", "sync", "admin", "ui", "server"]);

function relative(file) {
  return path.relative(ROOT, file).split(path.sep).join("/");
}

function collectCodeFiles(directory, output = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectCodeFiles(absolute, output);
      continue;
    }
    if (CODE_EXTENSIONS.has(path.extname(entry.name))) output.push(absolute);
  }
  return output;
}

function actionError(label) {
  if (!process.env.GITHUB_ACTIONS) return;
  const safe = String(label).replace(/[%\r\n]/g, " ");
  console.error(`::error title=check-suite failure::${safe}`);
}

function runNode(args, label) {
  console.log(`[check-suite] RUN: ${label}`);
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    actionError(label);
    console.error(`\n[check-suite] FAIL: ${label}`);
    process.exit(result.status || 1);
  }
}

function validateManifest() {
  const seen = new Map();
  for (const [group, files] of Object.entries(GROUPS)) {
    for (const file of files) {
      const absolute = path.join(TEST_DIR, file);
      if (!fs.existsSync(absolute)) throw new Error(`Missing ${group} test: tests/${file}`);
      if (seen.has(file)) throw new Error(`Duplicate test assignment: ${file} (${seen.get(file)}, ${group})`);
      seen.set(file, group);
    }
  }
  return seen.size;
}

function runSyntax() {
  const files = collectCodeFiles(ROOT).sort((a, b) => relative(a).localeCompare(relative(b)));
  console.log(`\n[check-suite] syntax · ${files.length} files`);
  for (const file of files) runNode(["--check", relative(file)], `syntax ${relative(file)}`);
}

function runGroup(group) {
  const files = GROUPS[group];
  if (!files) throw new Error(`Unknown check group: ${group}`);
  console.log(`\n[check-suite] ${group} · ${files.length} tests`);
  for (const file of files) runNode([`tests/${file}`], `${group} tests/${file}`);
}

const assignedCount = validateManifest();
const requested = String(process.argv[2] || "all").toLowerCase();

if (requested === "syntax") {
  runSyntax();
} else if (requested === "all") {
  runSyntax();
  GROUP_ORDER.forEach(runGroup);
} else if (GROUPS[requested]) {
  runGroup(requested);
} else {
  console.error(`[check-suite] unknown group: ${requested}`);
  console.error(`[check-suite] use one of: syntax, ${GROUP_ORDER.join(", ")}, all`);
  process.exit(2);
}

console.log(`\n[check-suite] PASS · ${requested} (${assignedCount} grouped regression tests tracked)`);
