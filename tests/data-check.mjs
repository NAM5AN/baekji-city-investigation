import fs from "node:fs";
import assert from "node:assert/strict";

const data = JSON.parse(fs.readFileSync(new URL("../data/day1.json", import.meta.url), "utf8"));
const allowed = new Set([data.meta.startNode, ...data.meta.allowedPlaceIds]);

assert.equal(data.meta.storyDay, 1);
assert.equal(Object.keys(data.places).length, 10);
assert.equal(data.meta.counts.details, 30);
assert.equal(data.meta.counts.objects, 35);
assert.equal(data.routes.length, 22);
assert.equal(data.meta.counts.itemMappings, 22);

for (const route of data.routes) {
  assert.ok(allowed.has(route.from), `허용 범위 밖 출발 노드: ${route.id}`);
  assert.ok(allowed.has(route.to), `허용 범위 밖 도착 노드: ${route.id}`);
  assert.notEqual(route.from, route.to, `자기 자신으로 이동하는 경로: ${route.id}`);
  assert.ok(route.narration, `이동 묘사 누락: ${route.id}`);
  for (const variant of ["a", "b", "c", "d"]) {
    const profile = data.riskProfiles[`${route.id}:${variant}`];
    assert.ok(profile, `위험 프로필 누락: ${route.id}:${variant}`);
    assert.equal(profile.hazards.length, profile.hazardCount, `위험 수 불일치: ${route.id}:${variant}`);
    assert.ok(data.contaminationRules[profile.ambientRuleId], `ambient 규칙 누락: ${profile.ambientRuleId}`);
    for (const hazardId of profile.hazards) assert.ok(data.hazardTemplates[hazardId], `위험 템플릿 누락: ${hazardId}`);
  }
}

for (const [objectId, mappings] of Object.entries(data.objectItems)) {
  for (const mapping of mappings) {
    assert.equal(mapping.autoTake, false, `자동 획득 금지 위반: ${objectId}:${mapping.itemId}`);
    assert.ok(data.itemCatalog[mapping.itemId], `아이템 카탈로그 누락: ${mapping.itemId}`);
  }
}

for (const rule of ["EXP_AMBIENT_A", "EXP_AMBIENT_B", "EXP_AMBIENT_C", "EXP_AMBIENT_D", "EXP_CONTACT_NONE", "EXP_ITEM_ONLY", "EXP_CONTACT_LOW", "EXP_CONTACT_MEDIUM", "EXP_CONTACT_HIGH", "EXP_CONTACT_SEVERE", "EXP_WATER_SPREAD_HIGH"]) {
  assert.ok(data.contaminationRules[rule], `오염 규칙 누락: ${rule}`);
}

console.log("PASS: 해오름역 1일차 데이터 계약 검증");
console.log(data.meta.counts);
console.log(`riskProfiles: ${Object.keys(data.riskProfiles).length}`);
