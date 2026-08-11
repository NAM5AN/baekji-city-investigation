import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sourcePath = new URL("./authenticated-home-dom-storm-diagnostic.mjs", import.meta.url);
const tempPath = new URL("./.tmp-authenticated-home-dom-prefix.mjs", import.meta.url);
const repoDir = fileURLToPath(new URL("../", import.meta.url));
let source = fs.readFileSync(sourcePath, "utf8");
source = source.replace(
  "if (skip.has(file) || !fs.existsSync(file)) continue;",
  "if (skip.has(file) || !fs.existsSync(file)) continue;\n  __loaded += 1;\n  if (__loaded > Number(process.env.MAX_SCRIPT || 9999)) break;\n  console.log(`PREFIX_LOAD ${__loaded} ${file}`);",
);
source = source.replace(
  "const runtimeErrors = [];",
  "let __loaded = 0;\nconst runtimeErrors = [];",
);
const dispatchNeedle = 'window.dispatchEvent(new window.StorageEvent("storage", { key: GLOBAL_KEY, oldValue: before, newValue: after, storageArea: window.localStorage, url: window.location.href }));';
source = source.replace(
  dispatchNeedle,
  `if (process.env.PREFIX_ONLY === "1") {\n  setTimeout(() => {\n    console.log(\`PREFIX_SETTLED_AFTER_STORAGE ${'${__loaded}'}\`);\n    window.close();\n    process.exit(0);\n  }, 250);\n}\n${dispatchNeedle}`,
);
fs.writeFileSync(tempPath, source);

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const all = [...index.matchAll(/<script\s+src="([^"]+\.js)(?:\?[^\"]*)?"/g)].map((m) => m[1]);
const skip = new Set(["cloud-state-sync.js", "retro-sound.js", "retro-sound-boost.js"]);
const scripts = all.filter((file) => !skip.has(file) && fs.existsSync(new URL(`../${file}`, import.meta.url)));

console.log(`SCRIPT_ENUM total=${all.length} runnable=${scripts.length}`);
console.log(scripts.map((file, index) => `${index + 1}:${file}`).join("\n"));
if (!scripts.length) throw new Error("index.html script enumeration returned no runnable scripts");

let firstTimeout = null;
try {
  for (let i = 1; i <= scripts.length; i += 1) {
    const result = spawnSync(process.execPath, [fileURLToPath(tempPath)], {
      cwd: repoDir,
      env: { ...process.env, PREFIX_ONLY: "1", MAX_SCRIPT: String(i) },
      encoding: "utf8",
      timeout: 1800,
      killSignal: "SIGKILL",
    });
    const timedOut = result.error?.code === "ETIMEDOUT";
    const status = timedOut ? "TIMEOUT" : `exit=${result.status}`;
    console.log(`prefix ${i}/${scripts.length} ${scripts[i - 1]} -> ${status}`);
    if (result.stderr?.trim()) console.log(result.stderr.trim().slice(-1200));
    if (timedOut) {
      firstTimeout = { index: i, file: scripts[i - 1], previous: scripts[i - 2] || null, stdout: result.stdout || "" };
      console.log("FIRST_TIMEOUT", JSON.stringify(firstTimeout));
      console.log(String(result.stdout || "").slice(-6000));
      break;
    }
    if (result.status !== 0) {
      console.log(String(result.stdout || "").slice(-6000));
      throw new Error(`prefix ${i} failed before timeout at ${scripts[i - 1]}`);
    }
  }
} finally {
  try { fs.unlinkSync(tempPath); } catch {}
}

if (!firstTimeout) throw new Error("No authenticated DOM starvation prefix found after storage update");
process.exitCode = 1;
