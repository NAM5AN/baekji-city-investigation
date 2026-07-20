import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const context = vm.createContext({ window: {}, Object, String, Array });
vm.runInContext(fs.readFileSync(new URL("../data/day1-data.js", import.meta.url), "utf8"), context);

const data = context.window.DAY1_DATA;
const app = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const css = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const svg = fs.readFileSync(new URL("../assets/maps/haeoreum-day1-map.svg", import.meta.url), "utf8");

const mappedNodes = [...svg.matchAll(/data-node="([^"]+)"/g)].map((match) => match[1]).sort();
const expectedNodes = ["E_ENTRY", ...Object.keys(data.places)].sort();
assert.deepEqual(mappedNodes, expectedNodes, "지도에는 모든 조사 노드가 한 번씩 있어야 합니다.");

const mappedRoutes = [...svg.matchAll(/data-route="([^"]+)"/g)]
  .flatMap((match) => match[1].split(/\s+/))
  .sort();
const expectedRoutes = Array.from(data.routes, (route) => String(route.id)).sort();
assert.deepEqual(mappedRoutes, expectedRoutes, "지도 경로는 실제 이동 경로 데이터와 일치해야 합니다.");

assert.ok(svg.includes("해오름역 1일차 조사 구역 안내도"));
assert.ok(svg.includes("GROUND") && svg.includes(">B1<") && svg.includes(">B2<"));
assert.ok(svg.includes("'Baekji Body'"), "지도 한글도 1번 본문 폰트를 사용해야 합니다.");
for (const architecturalClass of ["plan-outline", "corridor", "room", "stair", "door"]) {
  assert.ok(svg.includes(architecturalClass), `건물 안내도에 ${architecturalClass} 요소가 필요합니다.`);
}
assert.ok(svg.includes("current-location-marker"));
assert.ok(svg.includes("#c90000"), "현재 위치는 붉은 점으로 표시해야 합니다.");

assert.ok(app.includes("function isMapRequest"));
assert.ok(app.includes("function showMapModal"));
assert.ok(app.includes("function loadMapSvg"));
assert.ok(app.includes('node.classList.toggle("is-current", isCurrent)'));
assert.ok(app.includes("function hazardInputIntent"));
assert.ok(app.includes('interpretation.intent === "MAP"'));
assert.ok(app.includes('data-open-map="${escapeHtml(session.id)}"'));
assert.ok(app.includes("data-map-canvas"));
assert.ok(app.includes("assets/maps/haeoreum-day1-map.svg?v=0.3.18"));
for (const phrase of ["구역", "지도", "약도", "이동\\s*경로", "보여", "봄", "확인"]) {
  assert.ok(app.includes(phrase), `지도 요청 판정에 ${phrase} 표현이 필요합니다.`);
}

assert.ok(css.includes(".retro-map-modal"));
assert.ok(css.includes(".retro-map-viewport"));
assert.ok(css.includes(".retro-map-canvas svg"));
assert.ok(css.includes(".retro-map-current"));
assert.ok(css.includes(".retro-map-routes"));

console.log("PASS: v0.3.18 건물 평면도·붉은 현재 위치·실제 노드와 경로 기반 지도 계약");
