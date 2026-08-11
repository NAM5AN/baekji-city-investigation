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

// Replace the handcrafted world with a read-only snapshot of the real Production world.
const worldStart = source.indexOf('const initialWorld = {');
const remoteStart = source.indexOf('\n\nconst remote = {', worldStart);
if (worldStart < 0 || remoteStart < 0) throw new Error("initialWorld block not found");
const liveBootstrap = `const __recoverySource = fs.readFileSync("supabase-endpoint-recovery.js", "utf8");\nconst __supabaseUrl = __recoverySource.match(/const SUPABASE_URL = \"([^\"]+)\"/)?.[1];\nconst __supabaseKey = __recoverySource.match(/const SUPABASE_KEY = \"([^\"]+)\"/)?.[1];\nif (!__supabaseUrl || !__supabaseKey) throw new Error("Supabase config missing");\nconst __liveResponse = await fetch(\`${'${__supabaseUrl}'}/rest/v1/rpc/baekji_mvp_get_state\`, {\n  method: "POST",\n  headers: { apikey: __supabaseKey, "Content-Type": "application/json", Accept: "application/json" },\n  body: JSON.stringify({ p_state_key: "day1_world" }),\n});\nif (!__liveResponse.ok) throw new Error(\`live world read failed ${'${__liveResponse.status}'}\`);\nconst __liveRows = await __liveResponse.json();\nif (!__liveRows?.[0]?.state) throw new Error("live world state missing");\nconst initialWorld = structuredClone(__liveRows[0].state);\nconst __liveRevision = Number(__liveRows[0].revision || 0);\nconsole.log("LIVE_WORLD_SEED", JSON.stringify({ revision: __liveRevision, characters: Object.keys(initialWorld.characters || {}).length, parties: Object.keys(initialWorld.parties || {}).length, sessions: Object.keys(initialWorld.sessions || {}).length }));`;
source = source.slice(0, worldStart) + liveBootstrap + source.slice(remoteStart);
source = source.replace('  revision: 1,', '  revision: __liveRevision,');

// Seed A's localStorage before any application script executes, matching the real already-logged-in tab.
source = source.replace('  await instrument(pageA, "A", directory[0]);', '  await instrument(pageA, "A", directory[0], initialWorld);');
source = source.replace('async function instrument(page, label, profileRow) {', 'async function instrument(page, label, profileRow, seedWorld = null) {');
source = source.replace('  await page.evaluateOnNewDocument(({ GLOBAL_KEY, USER_KEY, PROFILE_KEY, label, profileRow }) => {', '  await page.evaluateOnNewDocument(({ GLOBAL_KEY, USER_KEY, PROFILE_KEY, label, profileRow, seedWorld }) => {');
source = source.replace('    if (profileRow) {', '    if (seedWorld) localStorage.setItem(GLOBAL_KEY, JSON.stringify(seedWorld));\n\n    if (profileRow) {');
source = source.replace('  }, { GLOBAL_KEY, USER_KEY, PROFILE_KEY, label, profileRow });', '  }, { GLOBAL_KEY, USER_KEY, PROFILE_KEY, label, profileRow, seedWorld });');

// Correct initial fake remote get responses to the live revision.
source = source.replace('if (url.includes("baekji_mvp_get_revision")) return json(request, remote.revision);', 'if (url.includes("baekji_mvp_get_revision")) return json(request, remote.revision);');

// Add event-listener ownership tracing.
const listenerNeedle = '    const nativeSet = Storage.prototype.setItem;';
const listenerPatch = `    const nativeAddEventListener = EventTarget.prototype.addEventListener;\n    EventTarget.prototype.addEventListener = function diagnosticAddEventListener(type, listener, options) {\n      if (type === "click" && this instanceof Element) {\n        const source = sourceKey(new Error().stack);\n        if (!Array.isArray(this.__diagClickSources)) Object.defineProperty(this, "__diagClickSources", { configurable: true, value: [] });\n        this.__diagClickSources.push(source);\n      }\n      return nativeAddEventListener.call(this, type, listener, options);\n    };\n\n${listenerNeedle}`;
source = source.replace(listenerNeedle, listenerPatch);

// Use direct element.click(), avoiding Puppeteer's scroll-to-target mechanics.
const clickBlock = `  const clickA = await clickAndObserve(pageA, "[data-create-party]", 800);\n  const clickB = await clickAndObserve(pageB, "[data-resume-session]", 800);`;
const clickReplacement = `  const directClick = async (page, selector, label) => {\n    const before = await page.evaluate(() => location.hash);\n    const info = await page.evaluate(({ selector, globalKey, userKey }) => {\n      const el = document.querySelector(selector);\n      if (!el) return { exists: false };\n      const snapshot = JSON.parse(localStorage.getItem(globalKey) || "null");\n      const uid = sessionStorage.getItem(userKey) || "";\n      const clickSources = Array.isArray(el.__diagClickSources) ? [...el.__diagClickSources] : [];\n      const result = { exists: true, connected: el.isConnected, disabled: Boolean(el.disabled), clickSources, uid, currentPartyId: snapshot?.characters?.[uid]?.currentPartyId || null, currentSessionId: snapshot?.characters?.[uid]?.currentSessionId || null };\n      el.click();\n      return result;\n    }, { selector, globalKey: GLOBAL_KEY, userKey: USER_KEY });\n    await sleep(600);\n    const after = await page.evaluate(() => location.hash);\n    return { label, clicked: Boolean(info.exists), before, after, changed: before !== after, info };\n  };\n  const clickA = await directClick(pageA, "[data-create-party]", "A-direct");\n  const clickB = await directClick(pageB, "[data-resume-session]", "B-direct");`;
if (!source.includes(clickBlock)) throw new Error("click block not found");
source = source.replace(clickBlock, clickReplacement);
source = source.replace('  assert.equal(clickA.changed || clickA.clicked === false, true, "A click should navigate when its control exists");', '  if (clickA.clicked) assert.equal(clickA.changed, true, "A create-party click must execute when available");');
source = source.replace('  assert.equal(clickB.changed, true, "B resume click should navigate");', '  assert.equal(clickB.changed, true, "B resume click must execute");');

fs.writeFileSync(tempUrl, source);
try {
  const result = spawnSync(process.execPath, [fileURLToPath(tempUrl)], { cwd: fileURLToPath(new URL("../", import.meta.url)), env: process.env, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { try { fs.unlinkSync(tempUrl); } catch {} }
