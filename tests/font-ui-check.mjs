import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const expectedFonts = [
  ["01-Ycomputer.otf", "OTTO"],
  ["02-DenkiChipHangul.woff2", "wOF2"],
  ["03-DOSPilgi.ttf", "\u0000\u0001\u0000\u0000"],
  ["04-Suhgung16.woff2", "wOF2"],
  ["05-Ramche.ttf", "\u0000\u0001\u0000\u0000"],
  ["06-MonaS12TextKR.woff2", "wOF2"],
  ["07-Cafe24PROUP.woff2", "wOF2"],
];

for (const [name, signature] of expectedFonts) {
  const fontPath = path.join(root, "assets", "fonts", name);
  const bytes = fs.readFileSync(fontPath);
  assert.ok(bytes.length > 10_000, `${name} 폰트 파일이 비어 있지 않아야 합니다.`);
  assert.equal(bytes.subarray(0, 4).toString("latin1"), signature, `${name} 형식을 확인합니다.`);
  assert.ok(css.includes(`assets/fonts/${name}`), `${name}이 CSS에 연결되어야 합니다.`);
  assert.ok(css.includes(`assets/fonts/${name}?v=0.3.18`), `${name}에 캐시 갱신 버전이 필요합니다.`);
}

for (const family of ["Baekji Body", "Baekji Title", "Baekji Hand 3", "Baekji Hand 4", "Baekji Hand 5", "Baekji Hand 6", "Baekji Point"]) {
  assert.ok(css.includes(`font-family: "${family}"`), `${family} @font-face가 필요합니다.`);
}

assert.ok(css.includes("font-family: var(--font-body)"));
assert.ok(css.includes("font-family: var(--font-title)"));
assert.ok(css.includes("font-family: var(--font-point)"));
assert.match(css, /\.retro-system-line\s*\{[^}]*font-family:\s*var\(--font-body\)/s);
assert.ok(!css.includes(".retro-system-line:nth-child"), "시스템 출력문은 필기체를 순환하지 않아야 합니다.");
assert.ok(!css.includes("strong,\nb,"), "strong/b 전체에 포인트 폰트를 강제하지 않아야 합니다.");
assert.match(css, /\.retro-map-note\s*\{\s*font-family:\s*var\(--font-body\)/);

assert.ok(!css.includes('font-family: "Baekji Body";\n  src: url("assets/fonts/01-DungGeunMo.woff2'), "이전 본문 폰트가 Baekji Body에 남으면 안 됩니다.");
assert.ok(fs.existsSync(path.join(root, "assets", "fonts", "licenses", "font01-Ycomputer-Typeface-Guideline-License.pdf")), "Y콤퓨타체 라이선스 안내 PDF를 포함해야 합니다.");

console.log("PASS: v0.3.18 Y콤퓨타체 본문·SYSTEM 고정·제한된 강조·화면별 폰트 연결");
