import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

function storage() {
  const values = new Map();
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

const localStorage = storage();
const sessionStorage = storage();
const selectorValues = new Map();
const fakeNode = () => ({
  innerHTML: '', className: '', value: '', dataset: {},
  appendChild() {}, remove() {}, addEventListener() {}, select() {}, focus() {},
});
const document = {
  body: { classList: { add() {}, remove() {} } },
  activeElement: null,
  getElementById: () => fakeNode(),
  createElement: () => fakeNode(),
  querySelector: (selector) => selectorValues.get(selector) || null,
  querySelectorAll: () => [],
};
const window = {};
const context = vm.createContext({
  window, document, localStorage, sessionStorage,
  location: { hash: '#/login' },
  Intl, Date, Math, JSON, String, Object, Array, Set, Map,
  setTimeout, clearTimeout, setInterval: () => 0,
  requestAnimationFrame: (fn) => fn(), console,
});

vm.runInContext(fs.readFileSync(new URL('../data/day1-data.js', import.meta.url), 'utf8'), context);
let appSource = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
appSource = appSource.replace('saveState(reason);\n    render();', 'saveState(reason);');
const footerIndex = appSource.indexOf('  window.addEventListener("hashchange", render);');
assert.ok(footerIndex > 0, '테스트 훅을 삽입할 footer 위치가 필요합니다.');
appSource = appSource.slice(0, footerIndex) + `
  window.__TEST__ = {
    makeInitialState, combinedHazardOverview, actionResolutionText,
    spatialScopeKey, fieldSessions, fieldCharacterIds, applyArrival, notifyDeparture, announceRouteEncounter,
    completeMovement, transferFieldItem,
    isHintLike, isNavigationHintRequest, isObservationAction, isMovementAction,
    routeMatch, detailMatch, objectMatch, systemLogEntries, chatScopeKey, chatLogEntries,
    sceneObservationText, hazardObservationText, hintResponseText, ambiguousMovementText,
    handleChatInput, authenticateDemoUser,
    setState(value) { state = value; saveState("test"); },
    getState() { state = loadState(); return state; },
  };
})();`;
vm.runInContext(appSource, context);
const api = window.__TEST__;

assert.equal(api.authenticateDemoUser('캐릭터A', '1234')?.id, 'test_a');
assert.equal(api.authenticateDemoUser('캐릭터 B', '1234')?.id, 'test_b');
assert.equal(api.authenticateDemoUser('캐릭터C', 'wrong'), null);

const state = api.makeInitialState();
state.sessions.sA = {
  id: 'sA', partyId: 'pA', memberIds: ['test_a'], status: 'ACTIVE', variant: 'c',
  currentNode: 'E_G_PLAZA', currentDetailId: null, activeEncounter: null, movement: null,
  inspectedObjectIds: [], takenItemKeys: [], choiceReveal: null, logs: [],
};
state.sessions.sBC = {
  id: 'sBC', partyId: 'pBC', memberIds: ['test_b', 'test_c'], status: 'ACTIVE', variant: 'c',
  currentNode: 'E_G_PLAZA', currentDetailId: null, activeEncounter: null, movement: null,
  inspectedObjectIds: [], takenItemKeys: [], choiceReveal: null, logs: [],
};
state.characters.test_a.inventory.I_TOOL = { itemId: 'I_TOOL', name: '긴 점검봉', category: '도구', quantity: 2, state: 'CLEAN' };
sessionStorage.setItem('baekji_city_mvp_current_user_v034', 'test_a');
api.setState(state);

const merged = api.combinedHazardOverview(['HZ_TEMP_04', 'HZ_CONT_01']);
assert.ok(!merged.includes('/'));
assert.ok(!merged.includes('...'));
assert.match(merged, /잔상/);
assert.match(merged, /흰 선/);

const natural = api.actionResolutionText('테스트 캐릭터 A', '지나간다', 'PARTIAL', 'HZ_TEMP_04', 1);
assert.ok(!natural.includes('지나가며 지나갔다'));
assert.ok(!natural.includes('현재 장면'));
assert.ok(!natural.includes('시도'));
assert.match(natural, /통로는 건넜지만/);
assert.match(natural, /오염도가 1% 상승/);

assert.equal(api.isObservationAction('관찰한다'), true);
assert.equal(api.isMovementAction('지나간다'), true);
assert.equal(api.isNavigationHintRequest('어디로 가야 하지?'), true);
assert.equal(api.isNavigationHintRequest('누구 있어?'), false);

let current = api.getState();
const route = window.DAY1_DATA.routes.find((item) => item.id === 'E_R002');
api.notifyDeparture(current, current.sessions.sA, route);
assert.match(current.sessions.sBC.logs.at(-1).text, /환승광장을 떠나 동부 출입구 방향으로 이동을 시작했다/);
api.setState(current);

current = api.getState();
current.sessions.sA.currentNode = 'E_G_EAST';
current.sessions.sBC.currentNode = 'E_G_EAST';
current.sessions.sBC.logs = [];
current.sessions.sA.currentNode = 'E_G_PLAZA';
const arrivalText = api.applyArrival(current, current.sessions.sA, 'E_G_EAST', 'EXP_CONTACT_NONE');
assert.match(arrivalText, /먼저 도착해 있던 테스트 캐릭터 B와 테스트 캐릭터 C와 마주쳤다/);
assert.ok(current.sessions.sA.logs.some((entry) => entry.type === 'chat-divider' && entry.scopeKey === 'node:E_G_EAST'));
assert.match(current.sessions.sBC.logs.at(-1).text, /도착해 현장에 합류했다/);
api.setState(current);

// 채팅 기록은 장소를 옮겨도 유지되고, 범위가 바뀔 때 구분선이 들어간다.
current = api.getState();
current.sessions.sA.logs = [
  { id: 'c1', type: 'interaction', text: '입구가 조용해.', actorId: 'test_a', at: 1, scopeKey: 'node:E_ENTRY' },
  { id: 'c2', type: 'interaction', text: '환승광장까지 왔어.', actorId: 'test_a', at: 2, scopeKey: 'node:E_G_PLAZA' },
];
current.sessions.sA.currentNode = 'E_G_EAST';
api.setState(current);
const timeline = api.chatLogEntries(current.sessions.sA);
assert.ok(timeline.some((entry) => entry.text === '입구가 조용해.'));
assert.ok(timeline.some((entry) => entry.text === '환승광장까지 왔어.'));
assert.ok(timeline.filter((entry) => entry.type === 'chat-divider').length >= 3);
assert.ok(!api.systemLogEntries(current.sessions.sA).some((entry) => entry.type === 'chat-divider'));

// 일반 채팅은 같은 위치의 다른 조사조에만 전달한다.
current = api.getState();
current.sessions.sA.currentNode = 'E_G_PLAZA';
current.sessions.sBC.currentNode = 'E_G_PLAZA';
current.sessions.sA.logs = [];
current.sessions.sBC.logs = [];
api.setState(current);
const normalInput = { value: '누구 있어?' };
selectorValues.set('[data-chat-input]', normalInput);
api.handleChatInput('sA');
current = api.getState();
assert.equal(current.sessions.sA.logs.at(-1).text, '누구 있어?');
assert.equal(current.sessions.sBC.logs.at(-1).text, '누구 있어?');
assert.equal(current.sessions.sA.choiceReveal, null);
assert.equal(normalInput.value, '');

current.sessions.sBC.currentNode = 'E_G_EAST';
current.sessions.sA.logs = [];
current.sessions.sBC.logs = [];
api.setState(current);
selectorValues.set('[data-chat-input]', { value: '여기 들려?' });
api.handleChatInput('sA');
current = api.getState();
assert.equal(current.sessions.sA.logs.length, 1);
assert.equal(current.sessions.sBC.logs.length, 0);

// 방향을 잃은 일반 대화는 행동 판정 없이 힌트 선택지만 연다.
current.sessions.sA.logs = [];
current.sessions.sA.choiceReveal = null;
api.setState(current);
selectorValues.set('[data-chat-input]', { value: '우리 지금 어디로 가야 하지?' });
api.handleChatInput('sA');
current = api.getState();
assert.equal(current.sessions.sA.movement, null);
assert.equal(current.sessions.sA.choiceReveal?.type, 'context');
assert.ok(current.sessions.sA.logs.some((entry) => entry.type === 'interaction'));
assert.ok(current.sessions.sA.logs.some((entry) => entry.type === 'scene' && /바닥선|통로/.test(entry.text)));

// 위험 중 /관찰한다는 위험을 해결하거나 이동시키지 않고 보이는 내용만 출력한다.
current.sessions.sA.logs = [];
current.sessions.sA.choiceReveal = null;
current.sessions.sA.currentNode = 'E_G_PLAZA';
current.sessions.sA.activeEncounter = {
  fromNode: 'E_G_PLAZA', targetNode: 'E_G_EAST', routeId: 'E_R002', overview: merged,
  hazards: ['HZ_TEMP_04'], currentIndex: 0, resolutions: [], ambientRuleId: 'EXP_CONTACT_NONE',
};
api.setState(current);
const observeInput = { value: '/관찰한다' };
selectorValues.set('[data-chat-input]', observeInput);
api.handleChatInput('sA');
current = api.getState();
assert.ok(current.sessions.sA.activeEncounter);
assert.equal(current.sessions.sA.currentNode, 'E_G_PLAZA');
assert.match(current.sessions.sA.logs.at(-1).text, /움직이지 않은 채 통로의 변화를 살핀다/);
assert.equal(observeInput.value, '');

// /지나간다는 자연스러운 위험 통과 문장으로 처리한다.
const passInput = { value: '/지나간다' };
selectorValues.set('[data-chat-input]', passInput);
api.handleChatInput('sA');
current = api.getState();
assert.equal(current.sessions.sA.activeEncounter, null);
assert.equal(current.sessions.sA.currentNode, 'E_G_EAST');
const resultLine = current.sessions.sA.logs.findLast((entry) => entry.type === 'success' || entry.type === 'fail');
assert.ok(resultLine);
assert.ok(!resultLine.text.includes('지나가며 지나갔다'));
assert.ok(!resultLine.text.includes('현재 장면'));

// 대상 없는 /이동한다는 갈림길에서 멋대로 움직이지 않고 선택지를 연다.
current.sessions.sA.currentNode = 'E_G_PLAZA';
current.sessions.sA.activeEncounter = null;
current.sessions.sA.movement = null;
current.sessions.sA.choiceReveal = null;
current.sessions.sA.logs = [];
api.setState(current);
const moveInput = { value: '/이동한다' };
selectorValues.set('[data-chat-input]', moveInput);
api.handleChatInput('sA');
current = api.getState();
assert.equal(current.sessions.sA.movement, null);
assert.equal(current.sessions.sA.choiceReveal?.type, 'context');
assert.ok(!current.sessions.sA.logs.at(-1).text.includes('현재 장면'));
assert.ok(!current.sessions.sA.logs.at(-1).text.includes('대상을'));

// 구체적인 목적지를 말하면 실제 route 이동을 시작한다.
const specificMove = { value: '/동부 출입구로 이동한다' };
selectorValues.set('[data-chat-input]', specificMove);
api.handleChatInput('sA');
current = api.getState();
assert.equal(current.sessions.sA.movement?.targetNode, 'E_G_EAST');
assert.equal(specificMove.value, '');


// 서로 다른 조사조가 같은 이동 경로 위험 장면에 들어오면 같은 현장으로 판정한다.
current = api.getState();
current.sessions.sA.currentNode = 'E_G_PLAZA';
current.sessions.sBC.currentNode = 'E_G_PLAZA';
current.sessions.sA.movement = null;
current.sessions.sBC.movement = null;
current.sessions.sA.activeEncounter = {
  fromNode: 'E_G_PLAZA', targetNode: 'E_G_EAST', routeId: 'E_R002', overview: merged,
  hazards: ['HZ_TEMP_04'], currentIndex: 0, resolutions: [], ambientRuleId: 'EXP_CONTACT_NONE',
};
current.sessions.sBC.activeEncounter = {
  fromNode: 'E_G_PLAZA', targetNode: 'E_G_EAST', routeId: 'E_R002', overview: merged,
  hazards: ['HZ_TEMP_04'], currentIndex: 0, resolutions: [], ambientRuleId: 'EXP_CONTACT_NONE',
};
current.sessions.sA.logs = [];
current.sessions.sBC.logs = [];
assert.equal(api.spatialScopeKey(current.sessions.sA), 'route:E_G_PLAZA:E_G_EAST');
assert.equal(api.fieldSessions(current, current.sessions.sA).length, 1);
assert.deepEqual(Array.from(api.fieldCharacterIds(current, current.sessions.sA)).sort(), ['test_a', 'test_b', 'test_c']);
api.announceRouteEncounter(current, current.sessions.sA, route);
assert.match(current.sessions.sA.logs.at(-1).text, /테스트 캐릭터 B와 테스트 캐릭터 C의 발소리와 인기척/);
assert.match(current.sessions.sBC.logs.at(-1).text, /테스트 캐릭터 A도 같은 통로에 들어섰다/);
api.setState(current);
selectorValues.set('[data-chat-input]', { value: '내 목소리 들려?' });
api.handleChatInput('sA');
current = api.getState();
assert.equal(current.sessions.sBC.logs.at(-1).text, '내 목소리 들려?');

// 선택지는 채팅 영역을 밀지 않고 장면 오버레이로 렌더링하며, 알 수 없는 느낌표 표시는 제거한다.
assert.ok(appSource.includes('function sceneChoiceOverlay'));
assert.ok(appSource.includes('data-close-choice-panel'));
assert.ok(!appSource.includes('<div class="retro-hazard-mark">!</div>'));
const chatPanelSource = appSource.slice(appSource.indexOf('function chatPanel'), appSource.indexOf('function chatBubble'));
assert.ok(!chatPanelSource.includes('suggestionPanel(session, hazard)'));

// 소지품 전달
current.sessions.sA.movement = null;
current.sessions.sA.currentNode = 'E_G_PLAZA';
current.sessions.sBC.currentNode = 'E_G_PLAZA';
api.setState(current);
selectorValues.set('[data-transfer-target]', { value: 'test_b' });
selectorValues.set('[data-transfer-item]', { value: 'I_TOOL' });
api.transferFieldItem('sA');
current = api.getState();
assert.equal(current.characters.test_a.inventory.I_TOOL.quantity, 1);
assert.equal(current.characters.test_b.inventory.I_TOOL.quantity, 1);

const productionSource = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
assert.ok(productionSource.includes('data-login-form'), '캐릭터 선택 카드가 아닌 로그인 폼이 필요합니다.');
assert.ok(productionSource.includes('캐릭터A / 1234'));
assert.ok(productionSource.includes('entry.type === "interaction" || entry.type === "chat-divider"'));
assert.ok(productionSource.includes('retro-chat-divider'));
assert.ok(productionSource.includes('isObservationAction(text)'));
assert.ok(productionSource.includes('isNavigationHintRequest(text)'));
assert.ok(productionSource.includes('일반 대화는 행동 판정을 발생시키지 않는다'));
assert.ok(!productionSource.includes('현재 장면은 그 시도를 받아들였지만'));
assert.ok(!productionSource.includes('더 구체적인 대상이나 방법을 지정할 수 있다'));
assert.ok(productionSource.includes('captureInvestigationViewState'));
assert.ok(productionSource.includes('compositionstart'));

console.log('PASS: 로그인·누적 장소 채팅·관찰/이동 의도 분리·힌트 요청·몰입형 판정 문장');
