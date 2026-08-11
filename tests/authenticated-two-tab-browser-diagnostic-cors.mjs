import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sourceUrl = new URL("./authenticated-two-tab-browser-diagnostic.mjs", import.meta.url);
const tempUrl = new URL("./.tmp-authenticated-two-tab-browser-diagnostic.mjs", import.meta.url);
let source = fs.readFileSync(sourceUrl, "utf8");

source = source.replace(
  'args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-background-timer-throttling", "--disable-renderer-backgrounding"],',
  'args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-background-timer-throttling", "--disable-renderer-backgrounding", "--disable-web-security"],',
);
source = source.replace(
  'const normalized = String(body.loginId || "").replace(/\\s+/g, "").toLowerCase();',
  'const normalized = String(body.characterName || body.loginId || "").replace(/\\s+/g, "").toLowerCase();',
);
source = source.replace(
  'return json(request, user ? { ok: true, user } : { ok: false, code: "INVALID_LOGIN" }, user ? 200 : 401);',
  'return json(request, user ? { ok: true, user: { id: user.id, characterName: user.character_name, profilePhoto: user.profile_photo || "" } } : { ok: false, code: "INVALID_LOGIN" }, user ? 200 : 401);',
);

const worldStart = source.indexOf('const initialWorld = {');
const remoteStart = source.indexOf('\n\nconst remote = {', worldStart);
if (worldStart < 0 || remoteStart < 0) throw new Error("initialWorld block not found");
const liveBootstrap = `const __recoverySource = fs.readFileSync("supabase-endpoint-recovery.js", "utf8");\nconst __supabaseUrl = __recoverySource.match(/const SUPABASE_URL = \"([^\"]+)\"/)?.[1];\nconst __supabaseKey = __recoverySource.match(/const SUPABASE_KEY = \"([^\"]+)\"/)?.[1];\nif (!__supabaseUrl || !__supabaseKey) throw new Error("Supabase config missing");\nconst __liveResponse = await fetch(\`${'${__supabaseUrl}'}/rest/v1/rpc/baekji_mvp_get_state\`, { method: "POST", headers: { apikey: __supabaseKey, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify({ p_state_key: "day1_world" }) });\nif (!__liveResponse.ok) throw new Error(\`live world read failed ${'${__liveResponse.status}'}\`);\nconst __liveRows = await __liveResponse.json();\nif (!__liveRows?.[0]?.state) throw new Error("live world state missing");\nconst initialWorld = structuredClone(__liveRows[0].state);\nconst __liveRevision = Number(__liveRows[0].revision || 0);\nconsole.log("LIVE_WORLD_SEED", JSON.stringify({ revision: __liveRevision, characters: Object.keys(initialWorld.characters || {}).length, parties: Object.keys(initialWorld.parties || {}).length, sessions: Object.keys(initialWorld.sessions || {}).length }));`;
source = source.slice(0, worldStart) + liveBootstrap + source.slice(remoteStart);
source = source.replace('  revision: 1,', '  revision: __liveRevision,');

source = source.replace('  await instrument(pageA, "A", directory[0]);', '  await instrument(pageA, "A", directory[0], initialWorld);');
source = source.replace('async function instrument(page, label, profileRow) {', 'async function instrument(page, label, profileRow, seedWorld = null) {');
source = source.replace('  await page.evaluateOnNewDocument(({ GLOBAL_KEY, USER_KEY, PROFILE_KEY, label, profileRow }) => {', '  await page.evaluateOnNewDocument(({ GLOBAL_KEY, USER_KEY, PROFILE_KEY, label, profileRow, seedWorld }) => {');
source = source.replace('    if (profileRow) {', '    if (seedWorld) localStorage.setItem(GLOBAL_KEY, JSON.stringify(seedWorld));\n\n    if (profileRow) {');
source = source.replace('  }, { GLOBAL_KEY, USER_KEY, PROFILE_KEY, label, profileRow });', '  }, { GLOBAL_KEY, USER_KEY, PROFILE_KEY, label, profileRow, seedWorld });');

// Keep caller attribution past the global Storage wrapper and record compact semantic diffs.
source = source.replace(
  'const useful = lines.find((line) => /\\.js(?:\\?|:)/.test(line) && !/authenticated-two-tab-browser-diagnostic/.test(line));',
  'const useful = lines.find((line) => /\\.js(?:\\?|:)/.test(line) && !/authenticated-two-tab-browser-diagnostic|guest-world-isolation\\.js/.test(line));',
);
source = source.replace(
  '      maxLongTask: 0,',
  '      maxLongTask: 0,\n      writeHistory: [],',
);
const nativeSetNeedle = `    const nativeSet = Storage.prototype.setItem;\n    Storage.prototype.setItem = function diagnosticSetItem(key, value) {\n      if (this === localStorage && String(key) === GLOBAL_KEY) {\n        diag.worldWrites += 1;\n        const source = sourceKey(new Error().stack);\n        diag.writeSources[source] = (diag.writeSources[source] || 0) + 1;\n      }\n      return nativeSet.call(this, key, value);\n    };`;
const nativeSetReplacement = `    const nativeSet = Storage.prototype.setItem;\n    const nativeGet = Storage.prototype.getItem;\n    function compactWorldDiff(beforeRaw, afterRaw) {\n      try {\n        const before = JSON.parse(beforeRaw || "null") || {};\n        const after = JSON.parse(String(afterRaw || "null")) || {};\n        const top = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));\n        const detail = {};\n        for (const root of ["characters", "parties", "sessions"]) {\n          if (!top.includes(root)) continue;\n          const a = before[root] || {}, b = after[root] || {};\n          detail[root] = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((id) => JSON.stringify(a[id]) !== JSON.stringify(b[id])).slice(0, 8);\n        }\n        for (const key of top.filter((key) => !["characters","parties","sessions"].includes(key)).slice(0, 8)) {\n          const av = before[key], bv = after[key];\n          detail[key] = { before: typeof av === "object" ? JSON.stringify(av).slice(0, 180) : av, after: typeof bv === "object" ? JSON.stringify(bv).slice(0, 180) : bv };\n        }\n        return { top: top.slice(0, 12), detail };\n      } catch (error) { return { error: String(error) }; }\n    }\n    Storage.prototype.setItem = function diagnosticSetItem(key, value) {\n      if (this === localStorage && String(key) === GLOBAL_KEY) {\n        diag.worldWrites += 1;\n        const stack = new Error().stack;\n        const source = sourceKey(stack);\n        diag.writeSources[source] = (diag.writeSources[source] || 0) + 1;\n        if (diag.writeHistory.length < 40) {\n          const beforeRaw = nativeGet.call(this, key);\n          diag.writeHistory.push({ n: diag.worldWrites, source, diff: compactWorldDiff(beforeRaw, value), stack: String(stack || "").split("\\n").slice(1, 7) });\n        }\n      }\n      return nativeSet.call(this, key, value);\n    };`;
if (!source.includes(nativeSetNeedle)) throw new Error("native set instrumentation not found");
source = source.replace(nativeSetNeedle, nativeSetReplacement);

// Avoid interaction after the storm; dump evidence as soon as A/B snapshots are obtained.
const clickStart = source.indexOf('  const clickA = await clickAndObserve');
const assertStart = source.indexOf('  assert.equal(a.avatar', clickStart);
if (clickStart < 0 || assertStart < 0) throw new Error("click/assert block not found");
source = source.slice(0, clickStart) + `  console.log("A_WRITE_HISTORY", JSON.stringify(a.diag.writeHistory));\n  console.log("B_WRITE_HISTORY", JSON.stringify(b.diag.writeHistory));\n  assert.equal(a.avatar, true, "A avatar must remain after B login");\n  assert.equal(b.avatar, true, "B avatar must remain after login");\n  assert.ok(a.diag.worldWrites < 30, \`A world writes ran away: ${'${a.diag.worldWrites}'}\`);\n  assert.ok(b.diag.worldWrites < 30, \`B world writes ran away: ${'${b.diag.worldWrites}'}\`);\n` + source.slice(source.indexOf('  await context.close();', assertStart));

fs.writeFileSync(tempUrl, source);
try {
  const result = spawnSync(process.execPath, [fileURLToPath(tempUrl)], { cwd: fileURLToPath(new URL("../", import.meta.url)), env: process.env, encoding: "utf8", timeout: 120_000, maxBuffer: 32 * 1024 * 1024 });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { try { fs.unlinkSync(tempUrl); } catch {} }
