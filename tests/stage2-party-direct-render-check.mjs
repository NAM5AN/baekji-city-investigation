import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("app.js", "utf8");
const domainRules = fs.readFileSync("runtime-domain-rules.js", "utf8");
const flowUx = fs.readFileSync("party-flow-ux-fix.js", "utf8");
const preflight = fs.readFileSync("party-preflight-flow-fix.js", "utf8");
const stability = fs.readFileSync("party-ui-stability.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");

const start = app.indexOf("  function renderParty(partyId)");
const end = app.indexOf("  function inviteUser(", start);
assert.ok(start >= 0 && end > start, "renderParty source must be discoverable");
const renderParty = app.slice(start, end);

assert.match(app, /BAEKJI_DOMAIN_RULES__/, "party readiness must use the shared Stage 3-B direct-render source of truth");
assert.match(domainRules, /party\?\.readyStateBy\?\.\[memberId\]/, "authoritative readiness markers must beat stale ready arrays");
assert.match(renderParty, /조원 구성을 확인한 뒤 조장이 구성을 확정합니다\./, "recruiting help must render directly");
assert.match(renderParty, /각 조원은 홈 화면에서 준비 상태를 바꿀 수 있습니다\./, "ready-stage help must render directly");
assert.match(renderParty, /party-ready-count/, "ready count badge must render directly");
assert.match(renderParty, /party-ready-state/, "member ready state must render directly");
assert.match(renderParty, /data-party-flow-back-recruiting/, "composition back action must render directly");
assert.match(renderParty, /\["COMPOSITION_CONFIRMED", "READY_CHECK"\]\.includes\(party\.status\)/, "the shared back action must cover current confirmation and legacy ready-check records");
assert.doesNotMatch(renderParty, /data-party-preflight-back-confirmed/, "the removed fourth ready-check step must not render a back action");
assert.match(renderParty, /data-party-name-edit/, "party name editor action must render directly");
assert.match(renderParty, /readyStage && !isCreator/, "only members must receive a readiness toggle in the collapsed confirmation stage");
assert.match(renderParty, /준비 완료 취소/, "member readiness-toggle copy must render directly");
assert.match(renderParty, /조사 출발/, "session start copy must render directly");
assert.match(renderParty, /isCreator && readyStage/, "the leader session start must remain available through the confirmed stage for the in-site departure guard");
assert.match(renderParty, /전원 준비가 완료되었습니다\./, "all-ready footer must render directly");
assert.match(renderParty, /\["조원 구성", "구성 확정", "세션 생성"\]/, "the party stepper must render exactly three stages");
assert.doesNotMatch(renderParty, /각 캐릭터가 자신의 탭에서 구성 확인과 준비 완료를 눌러야 합니다\./, "obsolete participant help must not flash before replacement");
assert.doesNotMatch(renderParty, /조사 세션 시작/, "obsolete start copy must not flash before replacement");

assert.doesNotMatch(flowUx, /function decorateLeaderParty/, "flow runtime must not post-process the party page");
assert.doesNotMatch(preflight, /function decorateLeaderParty/, "preflight runtime must not post-process the party page");
assert.doesNotMatch(stability, /function ensureReadyBackButton/, "paint guard must not recreate the back button");
assert.doesNotMatch(stability, /function ensurePartyNameControl/, "paint guard must not recreate the name control");
assert.match(index, /stage2-party-ui=1/, "direct party rendering must be cache-busted");
assert.match(index, /party-flow-ux-fix\.js\?v=0\.3\.87&departure-capture-guard=1/);
assert.match(index, /party-preflight-flow-fix\.js\?v=0\.3\.96/);
assert.match(index, /party-ui-stability\.js\?v=0\.3\.93/);

console.log("PASS: party composition and ready-state UI render directly without party-page DOM post-processing");
