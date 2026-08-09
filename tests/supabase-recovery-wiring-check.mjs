import fs from "node:fs";

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const recovery = fs.readFileSync(new URL("../supabase-endpoint-recovery.js", import.meta.url), "utf8");
const vercel = JSON.parse(fs.readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));

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

if (!recovery.includes("https://zstgpnwnwmeifgmyeqtz.supabase.co")) {
  throw new Error("recovery adapter no longer recognizes the legacy Supabase endpoint");
}
if (!recovery.includes("https://kfgtvifupumjuewwxzmz.supabase.co")) {
  throw new Error("recovery adapter does not target the recovered Supabase endpoint");
}
if (!recovery.includes("sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM")) {
  throw new Error("recovery adapter is missing the recovered publishable key");
}

const csp = vercel.headers?.flatMap((entry) => entry.headers || []).find((header) => header.key === "Content-Security-Policy")?.value || "";
if (!csp.includes("https://kfgtvifupumjuewwxzmz.supabase.co")) {
  throw new Error("Vercel CSP does not allow the recovered Supabase endpoint");
}

console.log("PASS: recovered Supabase endpoint is wired before tester auth/cloud sync and allowed by CSP");
