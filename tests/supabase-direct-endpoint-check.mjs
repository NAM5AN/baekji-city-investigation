import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), "utf8");

const index = read("index.html");
const vercel = JSON.parse(read("vercel.json"));
const server = read("server.mjs");
const canonicalUrl = "https://kfgtvifupumjuewwxzmz.supabase.co";
const canonicalKey = "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";
const legacyProjectRef = "zstgpnwnwmeifgmyeqtz";
const legacyUrl = `https://${legacyProjectRef}.supabase.co`;
const playerDirectRuntimeFiles = [
  "character-interaction-ai.js",
  "cloud-state-sync.js",
  "cross-party-hazard-interaction.js",
  "flexible-hazard-resolution.js",
  "party-roster-modal.js",
  "party-transfer-flow.js",
  "party-transfer-runtime-fix.js",
  "tester-auth.js",
  "tester-party-profile-sync.js",
  "tester-signup-complete.js",
];
const apiRuntimeFiles = [
  "api/admin-audit.mjs",
  "api/admin-communications.mjs",
  "api/admin-control.mjs",
  "api/admin-login.mjs",
  "api/admin-session-ops.mjs",
  "api/admin-snapshot.mjs",
  "api/index.mjs",
  "api/player-admin-system.mjs",
  "api/player-presence.mjs",
];
const legacyAuditFiles = [
  "index.html",
  ".env.example",
  "server.mjs",
  "vercel.json",
  ".github/workflows/ci.yml",
  ...playerDirectRuntimeFiles,
  ...apiRuntimeFiles,
];

function collectLegacyAuditFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "node_modules", "tests", "scripts"].includes(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(ROOT, absolute);
    if (entry.isDirectory()) {
      if (relative === path.join("supabase", "recovered-production-migrations")) continue;
      collectLegacyAuditFiles(absolute, files);
      continue;
    }
    if ([".js", ".mjs", ".cjs", ".html", ".json", ".yml", ".yaml"].includes(path.extname(entry.name)) || entry.name === ".env.example") {
      files.push(relative);
    }
  }
  return files;
}

if (index.includes("supabase-endpoint-recovery.js")) {
  throw new Error("index.html still loads the Supabase endpoint recovery adapter");
}
if (fs.existsSync(path.join(ROOT, "supabase-endpoint-recovery.js"))) {
  throw new Error("Supabase endpoint recovery adapter file still exists");
}

const runtimeAndConfigFiles = [...new Set([...legacyAuditFiles, ...collectLegacyAuditFiles(ROOT)])];
for (const file of runtimeAndConfigFiles) {
  if (read(file).includes(legacyUrl)) {
    throw new Error(`${file} still contains the legacy Supabase endpoint`);
  }
  if (read(file).includes(legacyProjectRef)) {
    throw new Error(`${file} still contains the legacy Supabase project reference`);
  }
  if (read(file).includes("baekjiSupabaseRecoveryFetch")) {
    throw new Error(`${file} still contains the global Supabase endpoint fetch rewrite adapter`);
  }
}

for (const file of playerDirectRuntimeFiles) {
  const source = read(file);
  if (!source.includes(canonicalUrl) || !source.includes(canonicalKey)) {
    throw new Error(`${file} does not directly target the canonical Supabase backend`);
  }
}

for (const file of apiRuntimeFiles) {
  if (!read(file).includes(canonicalUrl)) {
    throw new Error(`${file} does not directly target the canonical Supabase backend`);
  }
}

const csp = vercel.headers?.flatMap((entry) => entry.headers || [])
  .find((header) => header.key === "Content-Security-Policy")?.value || "";
if (!csp.includes(canonicalUrl)) {
  throw new Error("Vercel CSP does not allow the canonical Supabase endpoint");
}
if (!server.includes(`connect-src 'self' ${canonicalUrl}`)) {
  throw new Error("local server CSP does not allow the canonical Supabase endpoint");
}

const pagesIndex = index.indexOf("github-pages-test-environment.js");
const authIndex = index.indexOf("tester-auth.js");
const cloudIndex = index.indexOf("cloud-state-sync.js");
if (pagesIndex < 0 || authIndex < 0 || cloudIndex < 0) {
  throw new Error("GitHub Pages isolation, auth, and cloud sync scripts must remain wired in index.html");
}
if (!(pagesIndex < authIndex && pagesIndex < cloudIndex)) {
  throw new Error("GitHub Pages test isolation must load before auth and cloud sync");
}

console.log("PASS: runtime uses the canonical Supabase endpoint directly with CSP and GitHub Pages isolation coverage");
