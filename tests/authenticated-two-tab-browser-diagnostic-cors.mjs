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

const waitLine = '  await pageB.waitForFunction((key, id) => sessionStorage.getItem(key) === id && location.hash === "#/home", { timeout: 8_000 }, USER_KEY, B);';
const waitReplacement = `  let __loginWaitError = null;\n  try {\n    await pageB.waitForFunction((key, id) => sessionStorage.getItem(key) === id && location.hash === "#/home", { timeout: 8_000 }, USER_KEY, B);\n  } catch (error) {\n    __loginWaitError = error;\n    console.log("B_LOGIN_WAIT_TIMEOUT", String(error?.stack || error));\n    await sleep(1200);\n    const __safe = async (page, label) => {\n      try {\n        return await Promise.race([snapshot(page, label), sleep(3000).then(() => ({ label, timeout: true }))]);\n      } catch (inner) { return { label, error: String(inner?.stack || inner) }; }\n    };\n    const [__a, __b] = await Promise.all([__safe(pageA, "A-at-B-login-timeout"), __safe(pageB, "B-at-login-timeout")]);\n    console.log("REMOTE_AT_TIMEOUT", JSON.stringify({ revision: remote.revision, puts: remote.puts, conflicts: remote.conflicts, putLog: remote.putLog.slice(-50) }));\n    console.log("A_AT_TIMEOUT", JSON.stringify(__a));\n    console.log("B_AT_TIMEOUT", JSON.stringify(__b));\n  }`;
if (!source.includes(waitLine)) throw new Error("login wait line not found for diagnostic transform");
source = source.replace(waitLine, waitReplacement);

const afterSleep = '  await sleep(3500);';
source = source.replace(afterSleep, `${afterSleep}\n  if (__loginWaitError) throw __loginWaitError;`);

const clickBlock = `  const clickA = await clickAndObserve(pageA, "[data-create-party]", 800);\n  const clickB = await clickAndObserve(pageB, "[data-resume-session]", 800);`;
const clickReplacement = `  let clickA;\n  try {\n    clickA = await clickAndObserve(pageA, "[data-create-party]", 800);\n  } catch (error) {\n    console.log("CLICK_A_TIMEOUT", String(error?.stack || error));\n    await sleep(1200);\n    const __safe = async (page, label) => {\n      try { return await Promise.race([snapshot(page, label), sleep(3000).then(() => ({ label, timeout: true }))]); }\n      catch (inner) { return { label, error: String(inner?.stack || inner) }; }\n    };\n    const [__aClick, __bClick] = await Promise.all([__safe(pageA, "A-after-click-timeout"), __safe(pageB, "B-after-A-click-timeout")]);\n    console.log("REMOTE_AFTER_CLICK_A_TIMEOUT", JSON.stringify({ revision: remote.revision, puts: remote.puts, conflicts: remote.conflicts, putLog: remote.putLog.slice(-100) }));\n    console.log("A_AFTER_CLICK_TIMEOUT", JSON.stringify(__aClick));\n    console.log("B_AFTER_A_CLICK_TIMEOUT", JSON.stringify(__bClick));\n    throw error;\n  }\n  let clickB;\n  try {\n    clickB = await clickAndObserve(pageB, "[data-resume-session]", 800);\n  } catch (error) {\n    console.log("CLICK_B_TIMEOUT", String(error?.stack || error));\n    console.log("REMOTE_AFTER_CLICK_B_TIMEOUT", JSON.stringify({ revision: remote.revision, puts: remote.puts, conflicts: remote.conflicts, putLog: remote.putLog.slice(-100) }));\n    throw error;\n  }`;
if (!source.includes(clickBlock)) throw new Error("click block not found for diagnostic transform");
source = source.replace(clickBlock, clickReplacement);

fs.writeFileSync(tempUrl, source);

try {
  const result = spawnSync(process.execPath, [fileURLToPath(tempUrl)], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: process.env,
    encoding: "utf8",
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  process.stdout.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  try { fs.unlinkSync(tempUrl); } catch {}
}
