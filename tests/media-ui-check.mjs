import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const context = vm.createContext({ window: {}, Object, String, Array });
vm.runInContext(fs.readFileSync(new URL("../data/day1-data.js", import.meta.url), "utf8"), context);
vm.runInContext(fs.readFileSync(new URL("../data/image-map.js", import.meta.url), "utf8"), context);

const data = context.window.DAY1_DATA;
const imageMap = context.window.BAEKJI_IMAGE_MAP;
const nodeIds = Object.keys(data.places).sort();
const detailIds = Object.values(data.places).flatMap((place) => place.details.map((detail) => detail.id)).sort();
const routeIds = data.routes.map((route) => route.id).sort();
const objectIds = Object.values(data.objectsByDetail).flatMap((objects) => objects.map((object) => object.id)).sort();

assert.equal(imageMap.version, "0.3.18");
assert.equal(Object.keys(imageMap.scene.byNode).sort().join("|"), nodeIds.join("|"));
assert.equal(Object.keys(imageMap.scene.byDetail).sort().join("|"), detailIds.join("|"));
assert.equal(Object.keys(imageMap.scene.byRoute).sort().join("|"), routeIds.join("|"));
assert.equal(Object.keys(imageMap.object.byId).sort().join("|"), objectIds.join("|"));
for (const entry of Object.values(imageMap.object.byId)) assert.equal(entry.src, "", "v0.3.18에는 실제 오브젝트 이미지를 넣지 않습니다.");

const appSource = fs.readFileSync(new URL("../app.js", import.meta.url), "utf8");
const cssSource = fs.readFileSync(new URL("../styles.css", import.meta.url), "utf8");
const indexSource = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const packageJson = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));

assert.equal(packageJson.version, "0.3.18");
assert.ok(indexSource.includes('id="modal-root"'));
assert.ok(indexSource.indexOf("data/day1-data.js") < indexSource.indexOf("data/image-map.js"));
assert.ok(indexSource.indexOf("data/image-map.js") < indexSource.indexOf("app.js"));
assert.ok(appSource.includes('const GLOBAL_KEY = "baekji_city_mvp_state_v3"'));
assert.ok(appSource.includes('const USER_KEY = "baekji_city_mvp_current_user_v034"'));
assert.ok(appSource.includes('const LAYOUT_KEY = "baekji_city_mvp_investigation_layout_v1"'));
assert.ok(appSource.includes('data-layout-resizer="rows"'));
assert.ok(appSource.includes('data-layout-resizer="columns"'));
assert.ok(appSource.includes('bindInvestigationResizers()'));
const chatPanelSource = appSource.slice(appSource.indexOf('function chatPanel'), appSource.indexOf('function chatBubble'));
assert.ok(!chatPanelSource.includes('retro-chat-head'), "채팅 탭 아래의 중복 조사조 요약창은 제거합니다.");
assert.ok(appSource.includes('document.body.classList.add("retro-mode", "retro-login-mode")'));
assert.ok(appSource.includes("scrollInvestigationStreamsToLatest"));
assert.ok(appSource.includes("forceLatest"));
assert.ok(appSource.includes("function showObjectModal"));
assert.ok(appSource.includes('mappedMediaMarkup(media, "object")'));
assert.ok(appSource.includes("showObjectModal(object.id)"));
assert.ok(cssSource.includes(".retro-image-placeholder"));
assert.ok(cssSource.includes(".retro-object-modal-grid"));
assert.ok(cssSource.includes("body.retro-login-mode"));
assert.ok(cssSource.includes("body.retro-home-mode"));
assert.ok(cssSource.includes("cursor: row-resize"));
assert.ok(cssSource.includes("cursor: col-resize"));
assert.ok(cssSource.includes("--layout-left"));

console.log("PASS: v0.3.18 이미지 매핑·흑백 대체 화면·로그인/홈 게임보이 UI·최신 스크롤 계약");
