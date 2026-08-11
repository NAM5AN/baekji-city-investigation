import fs from "node:fs";
import { spawnSync } from "node:child_process";

const sourcePath = new URL("./authenticated-home-dom-storm-diagnostic.mjs", import.meta.url);
const tempPath = new URL("./.tmp-authenticated-home-dom-prefix.mjs", import.meta.url);
let source = fs.readFileSync(sourcePath, "utf8");
source = source.replace(
  "for (const file of scripts) {",
  "let __loaded = 0;\nfor (const file of scripts) {\n  if (__loaded >= Number(process.env.MAX_SCRIPT || 9999)) break;\n  __loaded += 1;\n  console.log(`PREFIX_LOAD ${__loaded} ${file}`);",
);
source = source.replace(
  "await sleep(120);",
  "if (process.env.PREFIX_ONLY === '1') { await sleep(80); console.log(`PREFIX_SETTLED ${__loaded}`); window.close(); process.exit(0); }\n\nawait sleep(120);",
);
fs.writeFileSync(tempPath, source);

const index = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const all = [...index.matchAll(/<script\\s+src=\"([^\"]+\\.js)(?:\\?[^\\\"]*)?\"/g)].map((m) => m[1]);
const skip = new Set(["cloud-state-sync.js", "retro-sound.js", "retro-sound-boost.js"]);
const scripts = all.filter((file) => !skip.has(file) && fs.existsSync(new URL(`../${file}`, import.meta.url)));

let firstTimeout = null;
try {
  for (let i = 1; i <= scripts.length; i += 1) {
    const result = spawnSync(process.execPath, [tempPath.pathname], {
      cwd: new URL("..", import.meta.url),
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
      console.log(String(result.stdout || "").slice(-4000));
      break;
    }
    if (result.status !== 0) {
      console.log(String(result.stdout || "").slice(-4000));
      throw new Error(`prefix ${i} failed before timeout at ${scripts[i - 1]}`);
    }
  }
} finally {
  try { fs.unlinkSync(tempPath); } catch {}
}

if (!firstTimeout) throw new Error("No authenticated DOM starvation prefix found");
process.exitCode = 1;
