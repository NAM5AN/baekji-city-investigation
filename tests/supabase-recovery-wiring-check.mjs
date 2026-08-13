import fs from "node:fs";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const recovery = fs.readFileSync(new URL("../supabase-endpoint-recovery.js", import.meta.url), "utf8");
const vercel = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
const server = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");

const canonicalUrl = "https://kfgtvifupumjuewwxzmz.supabase.co";
const canonicalKey = "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";
const legacyUrl = "https://zstgpnwnwmeifgmyeqtz.supabase.co";
const directRuntimeFiles = [
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

new Function(recovery);

const pagesIndex = index.indexOf("github-pages-test-environment.js");
const recoveryIndex = index.indexOf("supabase-endpoint-recovery.js");
const authIndex = index.indexOf("tester-auth.js");
const cloudIndex = index.indexOf("cloud-state-sync.js");

if (pagesIndex < 0 || recoveryIndex < 0 || authIndex < 0 || cloudIndex < 0) {
  throw new Error("required Supabase recovery scripts are not all wired in index.html");
}
if (!(pagesIndex < recoveryIndex && recoveryIndex < authIndex && recoveryIndex < cloudIndex)) {
  throw new Error("Supabase recovery adapter must load after GitHub Pages isolation and before auth/cloud sync");
}

if (!recovery.includes(legacyUrl)) {
  throw new Error("recovery adapter no longer recognizes the legacy Supabase endpoint");
}
if (!recovery.includes(canonicalUrl)) {
  throw new Error("recovery adapter does not target the recovered Supabase endpoint");
}
if (!recovery.includes(canonicalKey)) {
  throw new Error("recovery adapter is missing the recovered publishable key");
}

for (const file of directRuntimeFiles) {
  const source = fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  if (!source.includes(canonicalUrl) || !source.includes(canonicalKey)) {
    throw new Error(`${file} does not directly target the recovered Supabase backend`);
  }
  if (source.includes(legacyUrl)) {
    throw new Error(`${file} still depends on the legacy Supabase endpoint`);
  }
}

const csp = vercel.headers?.flatMap((entry) => entry.headers || []).find((header) => header.key === "Content-Security-Policy")?.value || "";
if (!csp.includes("https://kfgtvifupumjuewwxzmz.supabase.co")) {
  throw new Error("Vercel CSP does not allow the recovered Supabase endpoint");
}
if (!server.includes(`connect-src 'self' ${canonicalUrl}`)) {
  throw new Error("local server CSP does not allow the recovered Supabase endpoint");
}

console.log("PASS: player runtimes target the recovered Supabase backend directly, with recovery fallback and CSP coverage");
