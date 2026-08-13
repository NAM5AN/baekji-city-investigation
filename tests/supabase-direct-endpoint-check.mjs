import assert from "node:assert/strict";
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
const browserEntryPages = ["index.html", "admin-dashboard.html"];
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
const serverRuntimeFiles = [
  "server.mjs",
  ...fs.readdirSync(path.join(ROOT, "api"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && path.extname(entry.name) === ".mjs")
    .map((entry) => path.posix.join("api", entry.name))
    .sort(),
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

function browserRuntimeFiles() {
  const scripts = new Set();
  for (const page of browserEntryPages) {
    const source = read(page);
    for (const match of source.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)) {
      const script = match[1].split("?")[0];
      if (!script || /^(?:[a-z]+:)?\/\//i.test(script) || !/\.js$/i.test(script)) continue;
      const normalized = path.posix.normalize(script.replace(/^\.\//, ""));
      if (normalized.startsWith("../")) throw new Error(`${page} loads a script outside the browser runtime root: ${script}`);
      if (!fs.existsSync(path.join(ROOT, normalized))) throw new Error(`${page} loads a missing browser runtime script: ${script}`);
      scripts.add(normalized);
    }
  }

  for (const entry of fs.readdirSync(ROOT, { withFileTypes: true })) {
    if (entry.isFile() && path.extname(entry.name) === ".js") scripts.add(entry.name);
  }
  return [...scripts].sort();
}

function withoutComments(source) {
  let output = "";
  let quote = "";
  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    const next = source[index + 1];
    if (quote) {
      output += current;
      if (current === "\\") output += source[++index] || "";
      else if (current === quote) quote = "";
      continue;
    }
    if (current === "\"") { quote = current; output += current; continue; }
    if (current === "'") { quote = current; output += current; continue; }
    if (current === "`") { quote = current; output += current; continue; }
    if (current === "/" && next === "/") {
      while (index < source.length && source[index] !== "\n") index += 1;
      output += "\n";
      continue;
    }
    if (current === "/" && next === "*") {
      index += 2;
      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) index += 1;
      index += 1;
      output += " ";
      continue;
    }
    output += current;
  }
  return output;
}

function isSupabaseDirectBrowserClient(source) {
  const identifiesCanonicalBackend = source.includes(canonicalUrl) || source.includes(canonicalKey)
    || /\bSUPABASE_(?:URL|KEY)\b/.test(source);
  return identifiesCanonicalBackend && /\/rest\/v1\//.test(source) && /\bfetch\b/.test(source);
}

function hasAuthorizationHeaderToken(source) {
  return /\bauthorization\b/i.test(withoutComments(source));
}

function assertBrowserAuthorizationContract(label, source, expected) {
  assert.equal(isSupabaseDirectBrowserClient(source), true, `${label} must be a direct canonical Supabase browser client fixture`);
  assert.equal(hasAuthorizationHeaderToken(source), expected, label);
}

function isSupabaseDataApiServerClient(source) {
  const identifiesCanonicalBackend = source.includes(canonicalUrl)
    || /\bSUPABASE_(?:PUBLISHABLE_|ANON_)?KEY\b/.test(source);
  return identifiesCanonicalBackend && /\/rest\/v1\//.test(source) && /\bfetch\b/.test(source);
}

function hasPublishableSupabaseBearerHeader(source) {
  const publishableKey = String.raw`(?:SUPABASE_(?:PUBLISHABLE_|ANON_)?KEY|DEFAULT_SUPABASE_KEY|key)`;
  const bearerValue = "`Bearer\\s+\\$\\{\\s*" + publishableKey + "\\s*\\}`";
  const authorizationHeader = String.raw`(?:\bauthorization\b\s*:|\[\s*["']authorization["']\s*\]\s*=|\.set\(\s*["']authorization["']\s*,)`;
  return new RegExp(authorizationHeader + String.raw`\s*` + bearerValue, "i").test(withoutComments(source));
}

function directBrowserFixture(headerCode) {
  return [
    `const SUPABASE_URL = "${canonicalUrl}";`,
    `const SUPABASE_KEY = "${canonicalKey}";`,
    "fetch(`${SUPABASE_URL}/rest/v1/rpc/baekji_tester_list_accounts`, { headers: { apikey: SUPABASE_KEY } });",
    headerCode,
  ].join("\n");
}

function directServerFixture(headerCode) {
  return [
    `const SUPABASE_URL = "${canonicalUrl}";`,
    `const SUPABASE_KEY = "${canonicalKey}";`,
    "fetch(`${SUPABASE_URL}/rest/v1/rpc/baekji_tester_login`, { headers: { apikey: SUPABASE_KEY, " + headerCode + " } });",
  ].join("\n");
}

const removedPublishableBearerHeader = "Authorization: `Bearer ${SUPABASE_KEY}`,";
for (const file of [
  "tester-auth.js",
  "tester-signup-complete.js",
  "tester-party-profile-sync.js",
  "party-roster-modal.js",
  "character-interaction-ai.js",
]) {
  assertBrowserAuthorizationContract(`historical ${file} publishable Bearer header`, directBrowserFixture(removedPublishableBearerHeader), true);
}
assertBrowserAuthorizationContract("colon property", directBrowserFixture("const headers = { Authorization: token };"), true);
assertBrowserAuthorizationContract("headers.set", directBrowserFixture("headers.set(\"Authorization\", token);"), true);
assertBrowserAuthorizationContract("bracket property", directBrowserFixture("headers[\"Authorization\"] = token;"), true);
assertBrowserAuthorizationContract("alias property", directBrowserFixture("const headerName = \"Authorization\"; headers[headerName] = token;"), true);
assertBrowserAuthorizationContract("apikey-only request with an Authorization comment", directBrowserFixture("// Authorization examples belong in documentation, not the runtime."), false);

assert.equal(hasPublishableSupabaseBearerHeader(directServerFixture("Authorization: `Bearer ${SUPABASE_KEY}`")), true, "server-side Supabase Data API calls must reject a publishable Supabase Bearer header");
assert.equal(hasPublishableSupabaseBearerHeader(directServerFixture("Authorization: `Bearer ${userAccessToken}`")), false, "server-side Supabase Data API calls may use a user JWT");
assert.equal(hasPublishableSupabaseBearerHeader(directServerFixture("Authorization: `Bearer ${apiKey}`")), false, "server-side Supabase Data API calls must not flag unrelated API keys");
assert.equal(isSupabaseDataApiServerClient("fetch(\"https://api.openai.com/v1/responses\", { headers: { Authorization: `Bearer ${apiKey}` } });"), false, "OpenAI calls are not Supabase Data API calls");

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

const browserAuthorizationViolations = browserRuntimeFiles()
  .filter((file) => isSupabaseDirectBrowserClient(read(file)))
  .filter((file) => hasAuthorizationHeaderToken(read(file)));
if (browserAuthorizationViolations.length) {
  throw new Error(`direct canonical Supabase browser clients must not contain an Authorization header token (${browserAuthorizationViolations.join(", ")})`);
}

const serverAuthorizationViolations = serverRuntimeFiles
  .filter((file) => isSupabaseDataApiServerClient(read(file)))
  .filter((file) => hasPublishableSupabaseBearerHeader(read(file)));
if (serverAuthorizationViolations.length) {
  throw new Error(`server-side Supabase Data API calls must not send publishable keys as Authorization Bearer (${serverAuthorizationViolations.join(", ")})`);
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
