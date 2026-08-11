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

const listenerNeedle = '    const nativeSet = Storage.prototype.setItem;';
const listenerPatch = `    const nativeAddEventListener = EventTarget.prototype.addEventListener;\n    EventTarget.prototype.addEventListener = function diagnosticAddEventListener(type, listener, options) {\n      if (type === "click" && this instanceof Element) {\n        const source = sourceKey(new Error().stack);\n        if (!Array.isArray(this.__diagClickSources)) Object.defineProperty(this, "__diagClickSources", { configurable: true, value: [] });\n        this.__diagClickSources.push(source);\n      }\n      return nativeAddEventListener.call(this, type, listener, options);\n    };\n\n${listenerNeedle}`;
source = source.replace(listenerNeedle, listenerPatch);

source = source.replace(
  '  await pageB.waitForFunction((key, id) => sessionStorage.getItem(key) === id && location.hash === "#/home", { timeout: 8_000 }, USER_KEY, B);',
  '  await pageB.waitForFunction((key, id) => sessionStorage.getItem(key) === id && location.hash === "#/home", { timeout: 8_000 }, USER_KEY, B);',
);

const clickBlock = `  const clickA = await clickAndObserve(pageA, "[data-create-party]", 800);\n  const clickB = await clickAndObserve(pageB, "[data-resume-session]", 800);`;
const clickReplacement = `  const directClick = async (page, selector, label) => {\n    const before = await page.evaluate(() => location.hash);\n    const info = await page.evaluate(({ selector, globalKey, userKey }) => {\n      const el = document.querySelector(selector);\n      if (!el) return { exists: false };\n      const snapshot = JSON.parse(localStorage.getItem(globalKey) || "null");\n      const uid = sessionStorage.getItem(userKey) || "";\n      const currentPartyId = snapshot?.characters?.[uid]?.currentPartyId || null;\n      const currentSessionId = snapshot?.characters?.[uid]?.currentSessionId || null;\n      const clickSources = Array.isArray(el.__diagClickSources) ? [...el.__diagClickSources] : [];\n      const result = { exists: true, connected: el.isConnected, disabled: Boolean(el.disabled), clickSources, clickListenerCount: clickSources.length, uid, currentPartyId, currentSessionId, partyExists: Boolean(currentPartyId && snapshot?.parties?.[currentPartyId]), outer: el.outerHTML.slice(0, 500) };\n      el.click();\n      return result;\n    }, { selector, globalKey: GLOBAL_KEY, userKey: USER_KEY });\n    await sleep(400);\n    const after = await page.evaluate(() => location.hash);\n    const post = await page.evaluate(({ globalKey, userKey }) => {\n      const snapshot = JSON.parse(localStorage.getItem(globalKey) || "null");\n      const uid = sessionStorage.getItem(userKey) || "";\n      return { currentPartyId: snapshot?.characters?.[uid]?.currentPartyId || null, toast: document.querySelector("#toast-root")?.textContent?.trim() || "" };\n    }, { globalKey: GLOBAL_KEY, userKey: USER_KEY });\n    return { label, clicked: Boolean(info.exists), before, after, changed: before !== after, info, post };\n  };\n  const clickA = await directClick(pageA, "[data-create-party]", "A-direct");\n  const clickB = await directClick(pageB, "[data-resume-session]", "B-direct");`;
if (!source.includes(clickBlock)) throw new Error("click block not found");
source = source.replace(clickBlock, clickReplacement);
source = source.replace('  assert.equal(clickA.changed || clickA.clicked === false, true, "A click should navigate when its control exists");', '  if (!clickA.changed && clickA.clicked) console.log("A_CREATE_REJECTED", JSON.stringify(clickA));');
source = source.replace('  assert.equal(clickB.changed, true, "B resume click should navigate");', '  if (!clickB.changed) console.log("B_RESUME_REJECTED", JSON.stringify(clickB));');
source = source.replace('  assert.ok(remote.puts < 25, `cloud writes ran away: ${remote.puts}`);', '  assert.ok(remote.puts < 25, `cloud writes ran away: ${remote.puts}`);\n  assert.ok(clickA.changed && clickB.changed, "both authenticated controls must execute");');

fs.writeFileSync(tempUrl, source);
try {
  const result = spawnSync(process.execPath, [fileURLToPath(tempUrl)], { cwd: fileURLToPath(new URL("../", import.meta.url)), env: process.env, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024 });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { try { fs.unlinkSync(tempUrl); } catch {} }
