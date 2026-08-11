import fs from "node:fs";
import path from "node:path";

const html = fs.readFileSync("index.html", "utf8");
const scripts = [...html.matchAll(/<script\s+src="([^"]+\.js)(?:\?[^\"]*)?"/g)]
  .map((match) => match[1])
  .filter((file) => fs.existsSync(file));

const needles = [
  ["storage-dispatch", /(?:new\s+StorageEvent\s*\(\s*["']storage["']|new\s+Event\s*\(\s*["']storage["'])/g],
  ["storage-listener", /addEventListener\s*\(\s*["']storage["']/g],
  ["cloud-listener", /addEventListener\s*\(\s*["']baekji-cloud-sync["']/g],
  ["global-write", /localStorage\.setItem\s*\(\s*GLOBAL_KEY/g],
  ["interval", /setInterval\s*\(/g],
  ["observer", /new\s+MutationObserver/g],
];

function lineOf(source, index) {
  return source.slice(0, index).split("\n").length;
}

const inventory = [];
for (const file of scripts) {
  const source = fs.readFileSync(file, "utf8");
  const hits = [];
  for (const [kind, regex] of needles) {
    regex.lastIndex = 0;
    for (const match of source.matchAll(regex)) hits.push({ kind, line: lineOf(source, match.index) });
  }
  if (hits.length) inventory.push({ file, hits });
}

console.log("=== AUTHENTICATED RUNTIME SOURCE INVENTORY ===");
for (const item of inventory) {
  console.log(item.file, item.hits.map((hit) => `${hit.kind}@${hit.line}`).join(", "));
}

console.log("\n=== PERIODIC CLOUD EVENT FANOUT ===");
const cloud = fs.readFileSync("cloud-state-sync.js", "utf8");
console.log("cloud poll emits synced on unchanged revision:", /remoteRevision\s*<=\s*revision[\s\S]*?notifyStatus\(\"synced\"\)/.test(cloud));
for (const item of inventory.filter((item) => item.hits.some((hit) => hit.kind === "cloud-listener"))) {
  console.log("cloud listener:", item.file);
}

console.log("\n=== SYNTHETIC STORAGE EVENT SOURCES ===");
for (const item of inventory.filter((item) => item.hits.some((hit) => hit.kind === "storage-dispatch"))) {
  const source = fs.readFileSync(item.file, "utf8");
  const dispatchLines = item.hits.filter((hit) => hit.kind === "storage-dispatch").map((hit) => hit.line);
  console.log(`${item.file}: ${dispatchLines.join(", ")}`);
  for (const line of dispatchLines) {
    const rows = source.split("\n");
    const from = Math.max(0, line - 9);
    const to = Math.min(rows.length, line + 11);
    console.log(rows.slice(from, to).map((row, offset) => `${from + offset + 1}: ${row}`).join("\n"));
    console.log("---");
  }
}

console.log("\n=== SUBTREE OBSERVERS + PERIODIC REFRESH ===");
for (const item of inventory.filter((item) => item.hits.some((hit) => hit.kind === "observer"))) {
  const source = fs.readFileSync(item.file, "utf8");
  if (/subtree\s*:\s*true/.test(source) || /setInterval\s*\(/.test(source)) {
    console.log(item.file, {
      subtree: /subtree\s*:\s*true/.test(source),
      interval: /setInterval\s*\(/.test(source),
      replaceChildren: /replaceChildren\s*\(/.test(source),
      innerHTML: /\.innerHTML\s*=/.test(source),
      textContent: /\.textContent\s*=/.test(source),
    });
  }
}

// Diagnostic-only branch: fail intentionally so the inventory is preserved in CI logs.
process.exitCode = 1;
