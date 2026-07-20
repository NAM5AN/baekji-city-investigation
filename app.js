(() => {
  "use strict";

  const DATA = window.DAY1_DATA;
  if (!DATA) throw new Error("day1-data.js를 불러오지 못했습니다.");
  const IMAGE_MAP = window.BAEKJI_IMAGE_MAP || {
    version: "fallback",
    scene: { default: null, byNode: {}, byDetail: {}, byRoute: {} },
    object: { byId: {} },
  };

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const LAYOUT_KEY = "baekji_city_mvp_investigation_layout_v1";
  const DEFAULT_LAYOUT = { leftPercent: 68, scenePercent: 68 };
  const app = document.getElementById("app");

  function loadInvestigationLayout() {
    try {
      const saved = JSON.parse(localStorage.getItem(LAYOUT_KEY) || "null");
      return {
        leftPercent: clamp(Number(saved?.leftPercent) || DEFAULT_LAYOUT.leftPercent, 38, 78),
        scenePercent: clamp(Number(saved?.scenePercent) || DEFAULT_LAYOUT.scenePercent, 32, 82),
      };
    } catch {
      return { ...DEFAULT_LAYOUT };
    }
  }

  const ui = {
    tab: "chat",
    selectedDetailId: null,
    selectedItemId: "",
    actionText: "",
    fieldMessage: "",
    transferTargetId: "",
    transferItemId: "",
    isComposing: false,
    pendingExternalRender: false,
    choicePanelOpen: false,
    choiceRevealKey: "",
    aiAvailable: null,
    aiModel: "",
    aiPending: false,
    forceSystemLatest: false,
    forceChatLatest: false,
    layout: loadInvestigationLayout(),
  };
  const MOVE_DELAY_MS = 1800;
  const movementTimers = new Map();
  const pendingNarrationJobs = [];
  let narrationFlushActive = false;

  const HAZARD_PHENOMENA = {
    HZ_CONT_01: "바닥 틈을 따라 젖은 흰 선이 천천히 넓어지며 마른 발판 사이를 가른다.",
    HZ_CONT_03: "통로 한쪽에 사람 형체를 닮은 젖은 웅덩이가 남아 주변 경계를 흐린다.",
    HZ_CONT_04: "문손잡이와 난간 일부가 흰 유막처럼 젖어 있어 접촉할수록 표면이 번진다.",
    HZ_CONT_05: "앞쪽에서 시작된 흰 발자국이 이동 방향과 반대로 하나씩 생겨나며 안전한 진로를 흐린다.",
    HZ_ENV_01: "빛이 닿지 않아 발판과 벽면의 경계를 구분하기 어렵다.",
    HZ_ENV_04: "벽과 바닥이 일정하지 않은 간격으로 진동하고 먼 곳에서 금속이 울린다.",
    HZ_STATION_01: "멈춘 계단판 몇 장이 서로 다른 높이로 어긋나 발을 디딜 면이 일정하지 않다.",
    HZ_STATION_03: "승강장문과 실제 선로의 위치가 반 칸씩 어긋나 같은 문이 열렸다 닫히기를 반복한다.",
    HZ_STATION_04: "터널 안쪽에서 갑작스러운 바람이 밀려오며 종이와 작은 파편이 가장자리로 쏠린다.",
    HZ_STATION_05: "승강장 가장자리의 경고등이 불규칙하게 깜박이며 안전선의 위치를 흐린다.",
    HZ_STATION_06: "계단 유도등이 아래에서 위로 켜졌다가 반대로 꺼져 실제 단차가 보이는 순간이 짧다.",
    HZ_STATION_07: "발소리와 열차 소리가 실제 통로의 반대편에서 먼저 들려 방향 감각을 흐린다.",
    HZ_STATION_11: "방향 안내 방송이 서로 다른 승강장 번호를 번갈아 읽으며 이동 방향을 혼란스럽게 한다.",
    HZ_STATION_12: "승강장 번호와 방향 화살표가 눈을 돌릴 때마다 다른 위치로 바뀌지만 물리 흔적은 그대로 남아 있다.",
    HZ_STRUCT_01: "통로 한가운데 카트와 상자, 가구가 비스듬히 쌓여 발 디딜 폭이 좁다.",
    HZ_STRUCT_02: "계단 모서리가 깨지고 몇 단은 아래가 비어 있어 체중을 받으면 흔들린다.",
    HZ_STRUCT_03: "문틀이 비틀려 문이 반쯤 열린 채 걸려 있고 바닥에는 흰 액체 자국이 번져 있다.",
    HZ_STRUCT_04: "천장 마감재와 작은 파편이 간헐적으로 떨어져 통로의 안전 구간이 계속 달라진다.",
    HZ_STRUCT_05: "바닥에 깨진 유리와 젖은 흰 얼룩이 섞여 빛을 반사한다.",
    HZ_TEMP_01: "같은 복도가 반투명하게 두 겹 겹치며 문과 표지판의 위치가 조금씩 다르다.",
    HZ_TEMP_02: "계단참의 문과 층수 표기가 눈을 돌릴 때마다 한 칸씩 어긋난다.",
    HZ_TEMP_03: "열린 문 너머 풍경이 현재 구조와 맞지 않고 문턱의 그림자가 두 방향으로 갈라진다.",
    HZ_TEMP_04: "다른 시간의 사람과 운반물이 같은 통로를 반복해 가로지르며 실체와 잔상이 번갈아 선명해진다.",
    HZ_WATER_01: "파손된 배관에서 흐른 물이 흰 잔류물을 통로 전체로 넓게 번지게 한다.",
    HZ_WATER_02: "배수구에서 투명한 물과 흰 점액이 섞여 간헐적으로 밀려 나온다.",
  };

  const DEMO_USERS = {
    test_a: { id: "test_a", loginId: "캐릭터A", password: "1234", name: "테스트 캐릭터 A", initial: "A", note: "MVP 검증용 계정" },
    test_b: { id: "test_b", loginId: "캐릭터B", password: "1234", name: "테스트 캐릭터 B", initial: "B", note: "멀티탭 동기화 검증용" },
    test_c: { id: "test_c", loginId: "캐릭터C", password: "1234", name: "테스트 캐릭터 C", initial: "C", note: "추가 조원 검증용" },
  };

  function nowText() {
    return new Intl.DateTimeFormat("ko-KR", {
      timeZone: "Asia/Seoul",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    }).format(new Date());
  }

  function id(prefix) {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
  function unique(arr) { return [...new Set(arr)]; }
  function hashNumber(text) {
    let hash = 2166136261;
    for (const ch of String(text)) {
      hash ^= ch.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0);
  }


  function joinNames(ids) {
    const names = unique(ids).map((userId) => DEMO_USERS[userId]?.name).filter(Boolean);
    if (!names.length) return "누군가";
    if (names.length === 1) return names[0];
    if (names.length === 2) return `${names[0]}와 ${names[1]}`;
    return `${names.slice(0, -1).join(", ")}, ${names.at(-1)}`;
  }

  function spatialScopeKey(session) {
    if (!session) return "";
    if (session.movement) return `route:${session.movement.fromNode}:${session.movement.targetNode}`;
    if (session.activeEncounter) return `route:${session.activeEncounter.fromNode}:${session.activeEncounter.targetNode}`;
    if (session.currentDetailId) return `detail:${session.currentNode}:${session.currentDetailId}`;
    return `node:${session.currentNode}`;
  }

  function normalizeFieldScope(scopeOrNode, session) {
    if (!scopeOrNode) return spatialScopeKey(session);
    const value = String(scopeOrNode);
    if (/^(node|route|detail):/.test(value)) return value;
    return `node:${value}`;
  }

  function fieldSessions(snapshot, session, scopeOrNode = null) {
    const scopeKey = normalizeFieldScope(scopeOrNode, session);
    return Object.values(snapshot.sessions || {}).filter((candidate) =>
      candidate.id !== session.id &&
      candidate.status === "ACTIVE" &&
      candidate.variant === session.variant &&
      spatialScopeKey(candidate) === scopeKey
    );
  }

  function fieldCharacterIds(snapshot, session, includeOwnParty = true) {
    const ids = includeOwnParty ? [...session.memberIds] : [];
    fieldSessions(snapshot, session).forEach((candidate) => ids.push(...candidate.memberIds));
    return unique(ids);
  }

  function makeInitialState() {
    const characters = {};
    Object.values(DEMO_USERS).forEach((user) => {
      characters[user.id] = {
        id: user.id,
        contamination: 0,
        symptom: "안정",
        inventory: {},
        currentPartyId: null,
        currentSessionId: null,
        onlineAt: null,
      };
    });
    return {
      version: 3,
      storyDay: 1,
      loopId: "LOOP-001",
      eventSeq: 0,
      sessionSeq: 0,
      characters,
      parties: {},
      sessions: {},
      itemClaimsByVariant: { a: {}, b: {}, c: {}, d: {} },
    };
  }

  function normalizeStateShape(snapshot) {
    if (!snapshot || snapshot.version !== 3) return makeInitialState();
    if (!snapshot.itemClaimsByVariant) snapshot.itemClaimsByVariant = { a: {}, b: {}, c: {}, d: {} };
    for (const variant of ["a", "b", "c", "d"]) {
      if (!snapshot.itemClaimsByVariant[variant]) snapshot.itemClaimsByVariant[variant] = {};
    }
    Object.values(snapshot.sessions || {}).forEach((session) => {
      if (!Array.isArray(session.takenItemKeys)) session.takenItemKeys = [];
      const claims = snapshot.itemClaimsByVariant[session.variant] || (snapshot.itemClaimsByVariant[session.variant] = {});
      session.takenItemKeys.forEach((key) => {
        if (claims[key]) return;
        const separator = key.lastIndexOf(":");
        const objectId = separator >= 0 ? key.slice(0, separator) : key;
        const itemId = separator >= 0 ? key.slice(separator + 1) : "";
        const holderId = Object.values(snapshot.characters || {}).find((character) => character.inventory?.[itemId]?.quantity > 0)?.id || session.memberIds?.[0] || null;
        claims[key] = { objectId, itemId, characterId: holderId, sessionId: session.id, claimedAt: session.startedAt || 0 };
      });
    });
    return snapshot;
  }

  function loadState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(GLOBAL_KEY) || "null");
      return parsed?.version === 3 ? normalizeStateShape(parsed) : makeInitialState();
    } catch {
      return makeInitialState();
    }
  }

  let state = loadState();

  function saveState(reason = "update") {
    localStorage.setItem(GLOBAL_KEY, JSON.stringify(state));
  }

  function mutate(reason, callback) {
    state = loadState();
    callback(state);
    saveState(reason);
    render();
    flushPendingNarrations();
  }

  function currentUserId() { return sessionStorage.getItem(USER_KEY); }
  function currentUser() { return DEMO_USERS[currentUserId()] || null; }
  function currentCharacter() { return state.characters[currentUserId()] || null; }

  function setCurrentUser(userId) {
    sessionStorage.setItem(USER_KEY, userId);
    mutate("login", (draft) => { draft.characters[userId].onlineAt = Date.now(); });
    location.hash = "#/home";
  }

  function logout() {
    sessionStorage.removeItem(USER_KEY);
    location.hash = "#/login";
  }

  function toast(title, copy = "", type = "") {
    const root = document.getElementById("toast-root");
    const el = document.createElement("div");
    el.className = `toast ${type}`;
    el.innerHTML = `<div class="toast-title">${escapeHtml(title)}</div>${copy ? `<div class="toast-copy">${escapeHtml(copy)}</div>` : ""}`;
    root.appendChild(el);
    setTimeout(() => el.remove(), 3400);
  }

  function routeParts() {
    const raw = location.hash.replace(/^#\/?/, "") || "login";
    return raw.split("/").filter(Boolean);
  }

  function go(path) { location.hash = `#/${path.replace(/^\//, "")}`; }

  function header(extra = "") {
    const user = currentUser();
    return `
      <header class="topbar">
        <div class="brand" data-go="home" role="button" tabindex="0">
          <div class="brand-mark">백</div>
          <div>
            <div class="brand-title">백지도시</div>
            <div class="brand-sub">해오름역 조사 시스템 · 1일차 MVP</div>
          </div>
        </div>
        <div class="topbar-meta">
          ${extra}
          <span class="clock mono" data-clock>${nowText()}</span>
          ${user ? `<span class="badge"><span class="dot online"></span>${escapeHtml(user.name)}</span><button class="button ghost small" data-action="logout">로그아웃</button>` : ""}
        </div>
      </header>`;
  }

  function shell(content, opts = {}) {
    app.innerHTML = `<div class="shell">${header(opts.headerExtra || "")}${content}</div>`;
    bindCommon();
  }

  function bindCommon() {
    document.querySelectorAll("[data-go]").forEach((el) => {
      el.addEventListener("click", () => go(el.dataset.go));
      el.addEventListener("keydown", (e) => { if (e.key === "Enter") go(el.dataset.go); });
    });
    document.querySelectorAll('[data-action="logout"]').forEach((el) => el.addEventListener("click", logout));
  }

  function normalizeLoginId(value) {
    return String(value || "").replace(/\s+/g, "").toLowerCase();
  }

  function authenticateDemoUser(loginId, password) {
    const normalized = normalizeLoginId(loginId);
    return Object.values(DEMO_USERS).find((user) => {
      const aliases = [user.loginId, user.name, user.id].map(normalizeLoginId);
      return aliases.includes(normalized) && String(password) === user.password;
    }) || null;
  }

  function renderLogin() {
    document.body.classList.add("retro-mode", "retro-login-mode");
    document.body.classList.remove("retro-home-mode", "retro-page-mode");
    app.innerHTML = `
      <main class="login-wrap">
        <section class="login-panel login-panel-form">
          <div class="login-brand">
            <div class="eyebrow">Closed investigation access</div>
            <h1>해오름역<br>조사 시스템</h1>
            <p class="lead">운영진이 사전에 연결한 캐릭터 계정으로 로그인합니다. 캐릭터를 고르는 방식이 아니라, 각 유저가 자신의 아이디와 비밀번호를 입력합니다.</p>
          </div>
          <form class="card pad login-form-card" data-login-form>
            <div class="login-form-heading">
              <span class="brand-mark">백</span>
              <div><strong>백지도시 접속 인증</strong><small>TEST_ONLY · 로컬 MVP</small></div>
            </div>
            <div class="field">
              <label for="login-id">아이디</label>
              <input id="login-id" name="loginId" data-login-id autocomplete="username" placeholder="캐릭터 이름을 입력하세요" />
            </div>
            <div class="field">
              <label for="login-password">비밀번호</label>
              <input id="login-password" name="password" data-login-password type="password" autocomplete="current-password" placeholder="비밀번호를 입력하세요" />
            </div>
            <p class="login-error" data-login-error aria-live="polite"></p>
            <button class="button primary block" type="submit">로그인</button>
            <div class="login-demo-note">
              <strong>테스트 계정</strong>
              <span>캐릭터A / 1234</span>
              <span>캐릭터B / 1234</span>
              <span>캐릭터C / 1234</span>
            </div>
          </form>
          <div class="section card pad">
            <div class="card-title">멀티 유저 검증 방법</div>
            <p class="muted small" style="margin:9px 0 0;line-height:1.7">같은 주소를 여러 탭에서 열고 서로 다른 계정으로 로그인하세요. 로그인 정보는 탭별 sessionStorage, 조사 상태는 공용 localStorage로 분리됩니다.</p>
          </div>
        </section>
      </main>`;

    const form = document.querySelector("[data-login-form]");
    const idInput = document.querySelector("[data-login-id]");
    const passwordInput = document.querySelector("[data-login-password]");
    const error = document.querySelector("[data-login-error]");
    requestAnimationFrame(() => idInput?.focus());
    form?.addEventListener("submit", (event) => {
      event.preventDefault();
      const user = authenticateDemoUser(idInput?.value, passwordInput?.value);
      if (!user) {
        if (error) error.textContent = "아이디 또는 비밀번호가 일치하지 않습니다.";
        passwordInput?.select();
        return;
      }
      if (error) error.textContent = "";
      setCurrentUser(user.id);
    });
  }

  function ensureAuth() {
    if (!currentUser()) {
      go("login");
      return false;
    }
    state = loadState();
    return true;
  }

  function getUserParty(userId) {
    const character = state.characters[userId];
    return character?.currentPartyId ? state.parties[character.currentPartyId] : null;
  }

  function getUserSession(userId) {
    const character = state.characters[userId];
    return character?.currentSessionId ? state.sessions[character.currentSessionId] : null;
  }

  function renderHome() {
    if (!ensureAuth()) return;
    document.body.classList.add("retro-mode", "retro-home-mode");
    document.body.classList.remove("retro-login-mode", "retro-page-mode");
    const uid = currentUserId();
    const character = currentCharacter();
    const party = getUserParty(uid);
    const session = getUserSession(uid);
    const invitations = Object.values(state.parties).filter((p) => p.invitedIds.includes(uid) && !p.memberIds.includes(uid) && p.status !== "CLOSED");
    const inventoryCount = Object.values(character.inventory || {}).reduce((sum, item) => sum + item.quantity, 0);
    shell(`
      <main class="container">
        <section class="hero">
          <div class="eyebrow">Story day 01 · Tutorial</div>
          <h1>흰 경보</h1>
          <p class="lead">오늘 접근 가능한 조사 구역은 해오름역뿐입니다. 조원은 매일 자율적으로 구성하며 전원이 편성과 준비를 확인해야 조사 세션이 시작됩니다.</p>
        </section>
        <section class="grid three">
          <article class="card kpi"><span class="muted small">개인 오염도</span><div class="kpi-value">${character.contamination}%</div><div class="progress"><span style="width:${character.contamination}%"></span></div></article>
          <article class="card kpi"><span class="muted small">보유 물품</span><div class="kpi-value">${inventoryCount}</div><div class="faint small">현재 루프에서 별도 획득한 수량</div></article>
          <article class="card kpi"><span class="muted small">접근 가능 구역</span><div class="kpi-value">01</div><div class="faint small">해오름역 · ENTERABLE</div></article>
        </section>

        ${session ? `
          <section class="section card pad">
            <div class="card-header"><div><h2 class="card-title">진행 중 조사</h2><p class="muted small">현재 세션의 조사 기록과 위치로 복귀합니다.</p></div><span class="badge warn">${escapeHtml(session.status)}</span></div>
            <div class="list-item"><div class="list-main"><div class="list-title">해오름역 조사 세션</div><div class="list-sub">현재 위치: ${escapeHtml(nodeDisplayName(session.currentNode))}</div></div><button class="button primary" data-resume-session="${session.id}">조사 복귀</button></div>
          </section>` : ""}

        <section class="section grid two">
          <article class="card pad">
            <div class="card-header"><div><h2 class="card-title">조사조</h2><p class="muted small">고정 조장이나 직책은 없습니다.</p></div>${party ? `<span class="badge green">편성 중</span>` : ""}</div>
            ${party ? `<div class="list-item"><div class="list-main"><div class="list-title">${escapeHtml(party.name)}</div><div class="list-sub">${party.memberIds.length}명 참여 · ${escapeHtml(party.status)}</div></div><button class="button" data-open-party="${party.id}">열기</button></div>` : `<div class="empty">현재 참여 중인 조사조가 없습니다.</div><div style="height:12px"></div><button class="button primary block" data-create-party>새 조사조 구성</button>`}
          </article>
          <article class="card pad">
            <div class="card-header"><div><h2 class="card-title">받은 초대</h2><p class="muted small">초대를 수락한 뒤 직접 구성을 확인해야 합니다.</p></div><span class="badge">${invitations.length}</span></div>
            <div class="list">
              ${invitations.length ? invitations.map((p) => `<div class="list-item"><div class="list-main"><div class="list-title">${escapeHtml(p.name)}</div><div class="list-sub">초대한 캐릭터: ${escapeHtml(DEMO_USERS[p.creatorId].name)}</div></div><div class="button-row"><button class="button small" data-decline="${p.id}">거절</button><button class="button primary small" data-accept="${p.id}">수락</button></div></div>`).join("") : `<div class="empty">새로운 초대가 없습니다.</div>`}
            </div>
          </article>
        </section>

        <section class="section card pad">
          <div class="card-header"><div><h2 class="card-title">오늘의 조사 범위</h2><p class="muted small">내부 판정 코드는 숨기고 유저가 볼 수 있는 범위만 표시합니다.</p></div><span class="badge blue">해오름역</span></div>
          <div class="grid two">
            <div class="list-item"><div class="list-main"><div class="list-title">지상 환승광장</div><div class="list-sub">환승광장 · 동부 출입구 · 서부 출입구</div></div></div>
            <div class="list-item"><div class="list-main"><div class="list-title">지하 1~2층</div><div class="list-sub">중앙 대합실 · 발매 구역 · 개찰구 · 쉘터 입구 · 환승 통로 · 1·2번 승강장</div></div></div>
          </div>
        </section>
      </main>`);

    document.querySelector("[data-create-party]")?.addEventListener("click", createParty);
    document.querySelectorAll("[data-open-party]").forEach((el) => el.addEventListener("click", () => go(`party/${el.dataset.openParty}`)));
    document.querySelectorAll("[data-resume-session]").forEach((el) => el.addEventListener("click", () => {
      const s = state.sessions[el.dataset.resumeSession];
      go(s.status === "BRIEFING" ? `briefing/${s.id}` : s.status === "COMPLETED" ? `result/${s.id}` : `investigate/${s.id}`);
    }));
    document.querySelectorAll("[data-accept]").forEach((el) => el.addEventListener("click", () => acceptInvite(el.dataset.accept)));
    document.querySelectorAll("[data-decline]").forEach((el) => el.addEventListener("click", () => declineInvite(el.dataset.decline)));
  }

  function createParty() {
    const uid = currentUserId();
    if (getUserParty(uid)) return toast("이미 참여 중인 조사조가 있습니다.", "먼저 해당 조사조를 닫아 주세요.", "error");
    const partyId = id("party");
    mutate("create-party", (draft) => {
      draft.parties[partyId] = {
        id: partyId,
        name: `해오름역 조사조 ${Object.keys(draft.parties).length + 1}`,
        creatorId: uid,
        destination: "E",
        status: "RECRUITING",
        memberIds: [uid],
        invitedIds: [],
        declinedIds: [],
        confirmedBy: [],
        readyBy: [],
        sessionId: null,
        createdAt: Date.now(),
      };
      draft.characters[uid].currentPartyId = partyId;
    });
    go(`party/${partyId}`);
  }

  function acceptInvite(partyId) {
    const uid = currentUserId();
    mutate("accept-invite", (draft) => {
      const party = draft.parties[partyId];
      if (!party || party.status !== "RECRUITING") return;
      if (!party.memberIds.includes(uid)) party.memberIds.push(uid);
      draft.characters[uid].currentPartyId = partyId;
    });
    go(`party/${partyId}`);
  }

  function declineInvite(partyId) {
    const uid = currentUserId();
    mutate("decline-invite", (draft) => {
      const party = draft.parties[partyId];
      if (party && !party.declinedIds.includes(uid)) party.declinedIds.push(uid);
    });
    toast("초대를 거절했습니다.");
  }

  function partyStep(party) {
    if (party.status === "RECRUITING") return 1;
    if (party.status === "COMPOSITION_CONFIRMED") return 2;
    if (party.status === "READY_CHECK") return 3;
    if (party.status === "LOCKED" || party.status === "SESSION_CREATED") return 4;
    return 1;
  }

  function renderParty(partyId) {
    if (!ensureAuth()) return;
    document.body.classList.add("retro-mode", "retro-page-mode");
    document.body.classList.remove("retro-login-mode", "retro-home-mode");
    const party = state.parties[partyId];
    const uid = currentUserId();
    if (!party || (!party.memberIds.includes(uid) && !party.invitedIds.includes(uid))) return go("home");
    const isCreator = party.creatorId === uid;
    const allConfirmed = party.memberIds.every((id) => party.confirmedBy.includes(id));
    const allReady = party.memberIds.every((id) => party.readyBy.includes(id));
    const step = partyStep(party);
    const inviteCandidates = Object.values(DEMO_USERS).filter((u) => u.id !== uid && !party.memberIds.includes(u.id) && !party.invitedIds.includes(u.id));

    shell(`
      <main class="container narrow">
        <section class="hero">
          <div class="eyebrow">Party composition</div>
          <h1 style="font-size:48px">${escapeHtml(party.name)}</h1>
          <p class="lead">조사조는 매일 자율적으로 새로 편성합니다. 이 화면의 개설자는 편성 작업을 시작한 사람일 뿐 세계관상 조장이 아닙니다.</p>
        </section>
        <div class="stepper">
          ${["조원 구성", "구성 확정", "전원 준비", "세션 생성"].map((name, i) => `<div class="step ${i + 1 === step ? "active" : i + 1 < step ? "done" : ""}">${i + 1}. ${name}</div>`).join("")}
        </div>

        <section class="section card pad">
          <div class="card-header"><div><h2 class="card-title">참가 캐릭터</h2><p class="muted small">각 캐릭터가 자신의 탭에서 구성 확인과 준비 완료를 눌러야 합니다.</p></div><span class="badge green">${party.memberIds.length}명</span></div>
          <div class="member-grid">
            ${party.memberIds.map((memberId) => memberRow(party, memberId)).join("")}
          </div>
        </section>

        ${party.status === "RECRUITING" && isCreator ? `
          <section class="section card pad">
            <div class="card-header"><div><h2 class="card-title">조원 초대</h2><p class="muted small">현재 다른 조사조에 참여 중인 캐릭터는 초대할 수 없습니다.</p></div></div>
            <div class="list">
              ${inviteCandidates.length ? inviteCandidates.map((u) => `<div class="list-item"><div class="list-main"><div class="list-title">${escapeHtml(u.name)}</div><div class="list-sub">${escapeHtml(u.note)}</div></div><button class="button small" data-invite="${u.id}">초대</button></div>`).join("") : `<div class="empty">추가로 초대할 수 있는 캐릭터가 없습니다.</div>`}
            </div>
          </section>` : ""}

        <section class="section card pad">
          <div class="card-header"><div><h2 class="card-title">목적지</h2><p class="muted small">1일차에는 해오름역 외 구역을 목적지로 선택할 수 없습니다.</p></div><span class="badge blue">접근 가능</span></div>
          <div class="list-item"><div class="list-main"><div class="list-title">E · 해오름역</div><div class="list-sub">지상 환승광장 및 공개된 지하 구간</div></div><span class="badge">고정</span></div>
        </section>

        <section class="section card pad">
          <div class="button-row">
            ${party.status === "RECRUITING" ? `<button class="button primary" data-confirm-composition>${party.confirmedBy.includes(uid) ? "구성 확인 완료" : "이 구성으로 확정"}</button>` : ""}
            ${party.status === "COMPOSITION_CONFIRMED" || party.status === "READY_CHECK" ? `<button class="button primary" data-ready>${party.readyBy.includes(uid) ? "준비 완료됨" : "조사 준비 완료"}</button>` : ""}
            ${isCreator && allReady && party.status === "READY_CHECK" ? `<button class="button primary" data-start-session>조사 세션 시작</button>` : ""}
            ${party.sessionId ? `<button class="button primary" data-open-session>브리핑으로 이동</button>` : ""}
            ${party.status === "RECRUITING" ? `<button class="button danger" data-leave-party>${isCreator ? "조사조 해산" : "조사조 나가기"}</button>` : ""}
          </div>
          <p class="muted small" style="margin:12px 0 0">${allConfirmed ? "모든 조원이 구성을 확인했습니다." : "모든 조원의 구성 확인을 기다리는 중입니다."} ${allReady ? "전원 준비가 완료되었습니다." : "세션 생성 전 전원 준비 완료가 필요합니다."}</p>
        </section>
      </main>`);

    document.querySelectorAll("[data-invite]").forEach((el) => el.addEventListener("click", () => inviteUser(partyId, el.dataset.invite)));
    document.querySelector("[data-confirm-composition]")?.addEventListener("click", () => confirmComposition(partyId));
    document.querySelector("[data-ready]")?.addEventListener("click", () => setReady(partyId));
    document.querySelector("[data-start-session]")?.addEventListener("click", () => startSession(partyId));
    document.querySelector("[data-open-session]")?.addEventListener("click", () => go(`briefing/${party.sessionId}`));
    document.querySelector("[data-leave-party]")?.addEventListener("click", () => leaveParty(partyId));
  }

  function memberRow(party, memberId) {
    const u = DEMO_USERS[memberId];
    const confirmed = party.confirmedBy.includes(memberId);
    const ready = party.readyBy.includes(memberId);
    return `<div class="member"><div class="member-avatar">${u.initial}</div><div><div class="list-title">${escapeHtml(u.name)}</div><div class="list-sub">${memberId === party.creatorId ? "편성 개설자" : "참가 조원"}</div></div><div class="status-pills"><span class="badge ${confirmed ? "green" : ""}">${confirmed ? "구성 확인" : "확인 대기"}</span><span class="badge ${ready ? "blue" : ""}">${ready ? "준비 완료" : "준비 대기"}</span></div></div>`;
  }

  function inviteUser(partyId, userId) {
    if (state.characters[userId].currentPartyId) return toast("초대할 수 없습니다.", "이미 다른 조사조에 참여 중입니다.", "error");
    mutate("invite-user", (draft) => {
      const party = draft.parties[partyId];
      if (party && !party.invitedIds.includes(userId)) party.invitedIds.push(userId);
    });
    toast("초대를 전송했습니다.", DEMO_USERS[userId].name);
  }

  function confirmComposition(partyId) {
    const uid = currentUserId();
    mutate("confirm-composition", (draft) => {
      const party = draft.parties[partyId];
      if (!party.confirmedBy.includes(uid)) party.confirmedBy.push(uid);
      if (party.memberIds.every((id) => party.confirmedBy.includes(id))) party.status = "COMPOSITION_CONFIRMED";
    });
  }

  function setReady(partyId) {
    const uid = currentUserId();
    mutate("ready", (draft) => {
      const party = draft.parties[partyId];
      if (party.status === "COMPOSITION_CONFIRMED") party.status = "READY_CHECK";
      if (!party.readyBy.includes(uid)) party.readyBy.push(uid);
    });
  }

  function leaveParty(partyId) {
    const uid = currentUserId();
    mutate("leave-party", (draft) => {
      const party = draft.parties[partyId];
      if (!party) return;
      if (party.creatorId === uid) {
        party.memberIds.forEach((memberId) => { draft.characters[memberId].currentPartyId = null; });
        delete draft.parties[partyId];
      } else {
        party.memberIds = party.memberIds.filter((id) => id !== uid);
        party.confirmedBy = party.confirmedBy.filter((id) => id !== uid);
        party.readyBy = party.readyBy.filter((id) => id !== uid);
        draft.characters[uid].currentPartyId = null;
      }
    });
    go("home");
  }

  function startSession(partyId) {
    const uid = currentUserId();
    const party = state.parties[partyId];
    if (!party || party.creatorId !== uid) return;
    if (!party.memberIds.every((id) => party.readyBy.includes(id))) return toast("전원 준비가 필요합니다.", "한 명이라도 준비되지 않으면 현장을 생성하지 않습니다.", "error");
    const sessionId = id("session");
    mutate("start-session", (draft) => {
      const p = draft.parties[partyId];
      draft.sessionSeq += 1;
      const sharedTutorialSession = Object.values(draft.sessions).find((candidate) => ["BRIEFING", "ACTIVE"].includes(candidate.status));
      const variant = sharedTutorialSession?.variant || "c";
      draft.sessions[sessionId] = {
        id: sessionId,
        partyId,
        memberIds: [...p.memberIds],
        status: "BRIEFING",
        variant,
        currentNode: DATA.meta.startNode,
        currentDetailId: null,
        activeEncounter: null,
        movement: null,
        inspectedObjectIds: [],
        takenItemKeys: [],
        choiceReveal: null,
        logs: [{ id: id("log"), type: "scene", at: Date.now(), actorId: null, text: "조사조 전원의 준비가 끝나자 해오름역 출입 경계가 열렸다." }],
        startedAt: Date.now(),
        endedAt: null,
      };
      p.status = "SESSION_CREATED";
      p.sessionId = sessionId;
      p.memberIds.forEach((memberId) => {
        draft.characters[memberId].currentSessionId = sessionId;
      });
    });
    go(`briefing/${sessionId}`);
  }

  function renderBriefing(sessionId) {
    if (!ensureAuth()) return;
    document.body.classList.add("retro-mode", "retro-page-mode");
    document.body.classList.remove("retro-login-mode", "retro-home-mode");
    const session = state.sessions[sessionId];
    if (!session || !session.memberIds.includes(currentUserId())) return go("home");
    const v = DATA.variants[session.variant];
    shell(`
      <main class="container narrow">
        <section class="hero"><div class="eyebrow">Investigation briefing</div><h1 style="font-size:54px">해오름역</h1><p class="lead">도착한 시간 상태의 내부 코드는 공개되지 않습니다. 빛, 안내 설비의 어긋남, 공간의 흔적을 직접 보고 판단하세요.</p></section>
        <section class="briefing card">
          <div class="card-header"><div><span class="badge green">조사 가능</span><h2 style="margin:13px 0 0">${escapeHtml(v.light)}이 역 내부에서 희미하게 번진다.</h2></div><span class="badge">${session.memberIds.length}인 조사</span></div>
          <p class="lead" style="font-size:14px">${escapeHtml(v.situation)} ${escapeHtml(v.space)}</p>
          <div class="rule-list">
            <div class="rule">이동은 현재 위치와 직접 이어진 통로로만 이동할 수 있습니다. 같은 층이어도 연결 경로가 없다면 이동할 수 없습니다.</div>
            <div class="rule">한 메시지에는 한 가지 행동만 입력합니다. 복수 위험은 서로 다른 행동으로 순서대로 해결합니다.</div>
            <div class="rule">오브젝트를 조사해도 물품은 자동으로 들어오지 않습니다. 발견 후 별도의 ‘가져가기’ 행동이 필요합니다.</div>
            <div class="rule">성공·실패와 오염 변화는 조사 시스템이 현재 상황과 행동에 따라 확정합니다.</div>
          </div>
          <div class="button-row" style="margin-top:22px"><button class="button" data-go="party/${session.partyId}">조사조 확인</button><button class="button primary" data-enter-investigation>구역 진입</button></div>
        </section>
      </main>`);
    document.querySelector("[data-enter-investigation]").addEventListener("click", () => {
      mutate("activate-session", (draft) => {
        const s = draft.sessions[sessionId];
        if (s.status === "BRIEFING") {
          s.status = "ACTIVE";
          appendLog(s, "scene", `${v.light}이 번지는 해오름역 구역 입구에 도착했다. 지상 환승광장으로 이어지는 통로가 앞에 놓여 있다.`);
          appendChatDivider(s, "node:E_ENTRY", "해오름역 구역 입구");
        }
      });
      go(`investigate/${sessionId}`);
    });
  }

  function appendLog(session, type, text, actorId = null, meta = {}) {
    const entry = { id: id("log"), type, text, actorId, at: Date.now(), ...meta };
    session.logs.push(entry);
    return entry;
  }

  function appendActionInput(session, text, actorId) {
    appendLog(session, "action-input", String(text || "").trim(), actorId, { scopeKey: spatialScopeKey(session) });
  }

  function systemLogLineMarkup(entry) {
    const time = new Date(entry.at).toLocaleTimeString("ko-KR", { hour12: false });
    if (entry.type === "action-input" && entry.actorId) {
      const actor = DEMO_USERS[entry.actorId] || { name: "알 수 없는 조사자", initial: "?" };
      return `<div class="retro-system-line retro-character-action"><span class="retro-log-time">[${time}]</span><span class="retro-character-log-icon" aria-label="${escapeHtml(actor.name)} 아이콘">${escapeHtml(actor.initial || "?")}</span><strong class="retro-character-log-name">${escapeHtml(actor.name)}:</strong><span class="retro-character-log-text">(${escapeHtml(entry.text)})</span></div>`;
    }
    return `<div class="retro-system-line"><span class="retro-log-time">[${time}]</span> ${escapeHtml(entry.text)}</div>`;
  }

  function appendChatDivider(session, scopeKey, label) {
    const lastChatEntry = [...session.logs].reverse().find((entry) => entry.type === "interaction" || entry.type === "chat-divider");
    if (lastChatEntry?.type === "chat-divider" && lastChatEntry.scopeKey === scopeKey) return;
    appendLog(session, "chat-divider", label, null, { scopeKey });
  }


  function concurrentClause(sentence) {
    const clean = String(sentence || "").trim().replace(/\.\.\.$/, ".").replace(/\.$/, "");
    const replacements = [
      [/해진다$/, "해지는 사이"], [/번진다$/, "번지는 동안"], [/가른다$/, "가르는 가운데"],
      [/있다$/, "있는 가운데"], [/어렵다$/, "어려운 가운데"], [/흔들린다$/, "흔들리는 동안"],
      [/반사한다$/, "반사하는 가운데"], [/흐린다$/, "흐리는 사이"], [/반복한다$/, "반복하는 동안"],
      [/쏠린다$/, "쏠리는 가운데"], [/다르다$/, "다른 가운데"], [/나온다$/, "나오는 동안"],
    ];
    for (const [pattern, replacement] of replacements) if (pattern.test(clean)) return clean.replace(pattern, replacement);
    return `${clean} 이어지는 동안`;
  }

  function combinedHazardOverview(hazardIds) {
    const copies = (hazardIds || []).map((hazardId) => HAZARD_PHENOMENA[hazardId] || DATA.hazardTemplates[hazardId]?.name).filter(Boolean);
    if (!copies.length) return "이동 경로의 상태가 불안정하게 변한다.";
    if (copies.length === 1) return copies[0];
    return `${concurrentClause(copies[0])}, ${copies.slice(1).join(" ")}`;
  }

  function actionApproachText(actorName, actionText) {
    const text = String(actionText || "");
    if (/(주기|간격|잔상).*(확인|살펴|관찰)|잔상\s*주기/.test(text)) return `${actorName}는 걸음을 멈추고 잔상이 되풀이되는 간격을 끝까지 살핀다.`;
    if (/(관찰|살펴|확인|바라)/.test(text)) return `${actorName}는 눈앞의 변화가 반복되는 순서를 차분히 읽어 낸다.`;
    if (/(기다|멈춰|가만히)/.test(text)) return `${actorName}는 성급히 움직이지 않고 위험한 움직임이 잦아들 때를 기다린다.`;
    if (/(도구|점검봉|장갑|천|막대|로프|손전등)/.test(text)) return `${actorName}는 손에 든 도구로 바닥과 경계를 먼저 짚어 안전한 지점을 가려 낸다.`;
    if (/(피해|피한다|우회|돌아|마른|발판|경계)/.test(text)) return `${actorName}는 번지는 흔적과 불안정한 지점을 피해 몸을 낮춘 채 길을 고른다.`;
    if (/(뛰|달려|속도)/.test(text)) return `${actorName}는 숨을 짧게 들이켜고 통로를 단숨에 가로지르려 한다.`;
    if (/(지나|통과|건너|이동|간다|걷)/.test(text)) return `${actorName}는 앞을 가로막은 현상 사이로 조심스럽게 발을 옮긴다.`;
    return `${actorName}는 잠시 숨을 고르고 눈앞의 위험에 맞서 움직인다.`;
  }

  function hazardOutcomeCopy(hazardId, outcome, seed = "") {
    const temporal = hazardId.startsWith("HZ_TEMP");
    const contamination = hazardId.startsWith("HZ_CONT") || hazardId.startsWith("HZ_WATER");
    const structure = hazardId.startsWith("HZ_STRUCT") || hazardId.startsWith("HZ_STATION") || hazardId.startsWith("HZ_ENV");

    if (outcome === "SUCCESS") {
      if (temporal) return "잔상이 서로 엇갈리는 짧은 공백이 드러나고, 실체가 또렷해지는 순간에 맞춰 반대편까지 빠져나간다.";
      if (contamination) return "젖은 흰 막이 닿지 않는 마른 발판을 이어 밟아 통로 반대편에 선다.";
      if (structure) return "흔들림이 멎는 순간과 무너지지 않은 발판을 골라 안전하게 통과한다.";
      return "위험이 닿지 않는 틈을 찾아 통로 반대편까지 빠져나간다.";
    }
    if (outcome === "PARTIAL") {
      if (temporal) return "통로는 건넜지만, 뒤늦게 겹쳐 온 잔상이 몸의 가장자리를 스치고 지나간다.";
      if (contamination) return "마른 지점을 골라 건너는 데는 성공했지만, 신발 끝이 번지는 흰 잔류물에 닿는다.";
      if (structure) return "무너지는 구간을 벗어났지만, 흔들린 파편과 비틀린 구조물에 몸이 스친다.";
      return "통로를 빠져나왔지만 위험한 경계와의 접촉을 완전히 피하지는 못한다.";
    }
    let failures;
    if (temporal) {
      failures = [
        "잔상이 흐려지는 주기를 잘못 읽어 실체가 겹치는 순간 안으로 들어간다. 겹친 형체가 움직임을 덮치며 몸의 윤곽이 잠시 흐려진다.",
        "안전해 보인 틈은 실제 통로가 아니라 한 박자 늦게 남은 허상이었다. 발을 내딛자 겹친 형체가 닫히며 몸을 그대로 통과한다.",
        "실체가 또렷해지는 순간보다 먼저 움직인 탓에 잔상의 경계와 정면으로 겹친다. 흐려진 윤곽을 따라 차가운 감각이 번진다.",
      ];
    } else if (contamination) {
      failures = [
        "마른 발판으로 보였던 곳은 이미 얇은 흰 막에 잠겨 있었다. 발이 깊이 빠지며 차가운 잔류물이 피부를 타고 오른다.",
        "오염 경계가 번지는 속도를 충분히 확인하지 못한 채 안쪽으로 들어간다. 흰 잔류물이 신발과 옷자락을 빠르게 적신다.",
        "발을 옮기는 순간 우회하려던 흰 흐름이 예상보다 넓게 퍼진다. 피할 틈이 닫히며 차가운 감각이 몸을 타고 번진다.",
      ];
    } else if (structure) {
      failures = [
        "체중을 실은 지점은 겉보기와 달리 안쪽이 비어 있었다. 발판이 무너지며 파편과 충격이 한꺼번에 몸을 덮친다.",
        "진동이 잦아든 것으로 판단했지만 구조물의 흔들림은 아직 끝나지 않았다. 다음 충격이 발밑을 틀어 몸의 균형을 무너뜨린다.",
        "붙잡은 부분이 안전한 고정점이 아니었다. 힘을 주는 순간 구조물이 함께 꺾이며 파편이 몸 가까이 쏟아진다.",
      ];
    } else {
      failures = [
        "위험이 닿지 않을 것으로 본 경계가 예상보다 빠르게 닫힌다. 움직임이 안쪽에 갇히며 몸에 직접적인 흔적이 남는다.",
        "안전한 틈을 확보하기 전에 행동을 이어 간 탓에 위험한 경계와 정면으로 겹친다. 충격을 피하지 못하고 몸이 크게 흔들린다.",
        "선택한 방법은 눈앞의 현상과 맞지 않았다. 위험을 밀어내지 못한 채 안쪽으로 들어가 몸에 흔적이 남는다.",
      ];
    }
    return failures[hashNumber(`${hazardId}:${seed}`) % failures.length];
  }

  function actionResolutionText(actorName, actionText, outcome, hazardId, delta, narrationSeed = "", itemUse = null) {
    const itemLead = itemUseLeadText(actorName, actionText, itemUse);
    const approach = itemLead || (outcome === "FAIL"
      ? actionAttemptSentence(actorName, actionText)
      : actionApproachText(actorName, actionText));
    const outcomeCopy = hazardOutcomeCopy(hazardId, outcome, narrationSeed || actionText);
    const exposure = delta > 0
      ? ` 피부와 옷자락에 옅은 흰 얼룩이 번지며 오염도가 ${delta}% 상승한다.`
      : " 몸에 새로 번지는 흰 흔적은 없다.";
    return `${approach} ${outcomeCopy}${exposure}`;
  }

  function routePastNarration(route, actorIds) {
    let narration = String(route?.narration || `${nodeDisplayName(route?.to)} 방향으로 이동한다.`);
    narration = narration
      .replace(/물리 경로를 따라/g, "통로를 따라")
      .replace(/이동한다\.$/, "이동했다.")
      .replace(/내려간다\.$/, "내려갔다.")
      .replace(/올라간다\.$/, "올라갔다.")
      .replace(/되돌아간다\.$/, "되돌아갔다.");
    return `${joinNames(actorIds)}는 ${narration}`;
  }

  function ambientArrivalChanges(draft, session, targetNode, ambientRuleId) {
    const changes = [];
    session.memberIds.forEach((memberId) => {
      const delta = deterministicDelta(ambientRuleId || "EXP_AMBIENT_A", `${session.id}:${targetNode}:${memberId}`);
      const char = draft.characters[memberId];
      char.contamination = clamp(char.contamination + delta, 0, 100);
      char.symptom = contaminationStage(char.contamination);
      if (delta) changes.push(`${DEMO_USERS[memberId].name}의 옷자락에 옅은 흰 얼룩이 번지며 오염도가 ${delta}% 상승한다.`);
    });
    return changes;
  }

  function applyArrival(draft, session, targetNode, ambientRuleId) {
    // 도착 직전 스냅샷으로 먼저 와 있던 다른 조사조를 확정한다.
    const waitingSessions = fieldSessions(draft, session, `node:${targetNode}`);
    const waitingIds = unique(waitingSessions.flatMap((candidate) => candidate.memberIds));
    const arrivingNames = joinNames(session.memberIds);

    session.currentNode = targetNode;
    session.currentDetailId = null;
    ui.selectedDetailId = null;
    appendChatDivider(session, `node:${targetNode}`, nodeDisplayName(targetNode));

    const ambient = ambientArrivalChanges(draft, session, targetNode, ambientRuleId);
    waitingSessions.forEach((candidate) => {
      appendLog(candidate, "presence", `${arrivingNames}가 ${nodeDisplayName(targetNode)}에 도착해 현장에 합류했다.`);
    });

    const parts = [`${arrivingNames}는 ${nodeDisplayName(targetNode)}에 도착했다.`];
    if (waitingIds.length) parts.push(`이곳에 먼저 도착해 있던 ${joinNames(waitingIds)}와 마주쳤다.`);
    if (ambient.length) parts.push(ambient.join(" "));
    return parts.join(" ");
  }

  function notifyDeparture(draft, session, route) {
    const originNode = session.currentNode;
    const witnesses = fieldSessions(draft, session, `node:${originNode}`);
    if (!witnesses.length) return;
    const leavingNames = joinNames(session.memberIds);
    witnesses.forEach((candidate) => appendLog(candidate, "presence", `${leavingNames}가 ${nodeDisplayName(originNode)}을 떠나 ${nodeDisplayName(route.to)} 방향으로 이동을 시작했다.`));
  }

  function announceRouteEncounter(draft, session, route) {
    const scopeKey = `route:${route.from}:${route.to}`;
    const waitingSessions = fieldSessions(draft, session, scopeKey);
    if (!waitingSessions.length) return;
    const waitingIds = unique(waitingSessions.flatMap((candidate) => candidate.memberIds));
    const arrivingNames = joinNames(session.memberIds);
    waitingSessions.forEach((candidate) => {
      appendLog(candidate, "presence", `${arrivingNames}도 같은 통로에 들어섰다. 가까운 곳에서 겹쳐지는 발소리와 인기척이 선명해진다.`);
    });
    appendLog(session, "presence", `앞서 이 통로에 들어온 ${joinNames(waitingIds)}의 발소리와 인기척이 가까이 느껴진다.`);
  }

  function scheduleMovement(session) {
    const movement = session?.movement;
    const existing = movementTimers.get(session?.id);
    if (!movement) {
      if (existing) clearTimeout(existing.timerId);
      movementTimers.delete(session?.id);
      return;
    }
    if (existing?.token === movement.token) return;
    if (existing) clearTimeout(existing.timerId);
    const wait = Math.max(0, movement.resolveAt - Date.now());
    const timerId = setTimeout(() => completeMovement(session.id, movement.token), wait);
    movementTimers.set(session.id, { token: movement.token, timerId });
  }

  function completeMovement(sessionId, token) {
    mutate("complete-movement", (draft) => {
      const session = draft.sessions[sessionId];
      const movement = session?.movement;
      if (!session || !movement || movement.token !== token) return;
      const route = DATA.routes.find((candidate) => candidate.id === movement.routeId);
      const profile = DATA.riskProfiles[`${route.id}:${session.variant}`];
      const hazards = profile?.hazards || [];
      const itemLead = movement.itemUse
        ? itemUseLeadText(DEMO_USERS[movement.actorId]?.name || joinNames(session.memberIds), movement.actionText || "", { ...movement.itemUse, status: "usable" })
        : "";
      const movementNarration = `${itemLead ? `${itemLead} ` : ""}${routePastNarration(route, session.memberIds)}`;
      session.movement = null;
      if (hazards.length) {
        const overview = combinedHazardOverview(hazards);
        session.activeEncounter = { routeId: route.id, fromNode: route.from, targetNode: route.to, overview, ambientRuleId: profile.ambientRuleId, hazards, currentIndex: 0, resolutions: [] };
        appendChatDivider(session, `route:${route.from}:${route.to}`, `${nodeDisplayName(route.from)} → ${nodeDisplayName(route.to)} 이동 경로`);
        announceRouteEncounter(draft, session, route);
        appendLog(session, "risk", `${movementNarration} 그 앞에서 ${overview}`);
      } else {
        const arrival = applyArrival(draft, session, route.to, profile?.ambientRuleId);
        appendLog(session, "scene", `${movementNarration} ${arrival}`);
      }
    });
    movementTimers.delete(sessionId);
  }

  function isNearBottom(element, threshold = 48) {
    if (!element) return true;
    return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
  }

  function captureInvestigationViewState() {
    const input = document.querySelector("[data-chat-input]");
    const system = document.querySelector(".retro-system-scroll");
    const chat = document.querySelector("[data-chat-stream]");
    const investigation = document.querySelector(".retro-investigation");
    return {
      mountedSessionId: investigation?.dataset.sessionId || null,
      inputFocused: document.activeElement === input,
      inputValue: input?.value ?? ui.actionText,
      selectionStart: input?.selectionStart ?? null,
      selectionEnd: input?.selectionEnd ?? null,
      systemScrollTop: system?.scrollTop ?? 0,
      systemAtBottom: isNearBottom(system),
      chatScrollTop: chat?.scrollTop ?? 0,
      chatAtBottom: isNearBottom(chat),
      hadSystem: Boolean(system),
      hadChat: Boolean(chat),
    };
  }

  function scrollInvestigationStreamsToLatest({ system: includeSystem = true, chat: includeChat = true } = {}) {
    const system = document.querySelector(".retro-system-scroll");
    const chat = document.querySelector("[data-chat-stream]");
    if (includeSystem && system) system.scrollTop = system.scrollHeight;
    if (includeChat && chat) chat.scrollTop = chat.scrollHeight;
  }

  function applyInvestigationLayout(root = document.querySelector("[data-layout-root]")) {
    if (!root) return;
    root.style.setProperty("--layout-left", `${ui.layout.leftPercent}%`);
    root.style.setProperty("--layout-scene", `${ui.layout.scenePercent}%`);
    root.querySelector('[data-layout-resizer="columns"]')?.setAttribute("aria-valuenow", String(Math.round(ui.layout.leftPercent)));
    root.querySelector('[data-layout-resizer="rows"]')?.setAttribute("aria-valuenow", String(Math.round(ui.layout.scenePercent)));
  }

  function saveInvestigationLayout() {
    localStorage.setItem(LAYOUT_KEY, JSON.stringify(ui.layout));
  }

  function bindInvestigationResizers() {
    const root = document.querySelector("[data-layout-root]");
    if (!root) return;
    applyInvestigationLayout(root);
    root.querySelectorAll("[data-layout-resizer]").forEach((handle) => {
      const axis = handle.dataset.layoutResizer;
      const updateByPointer = (event) => {
        const rect = axis === "columns"
          ? root.getBoundingClientRect()
          : root.querySelector(".retro-left-column")?.getBoundingClientRect();
        if (!rect) return;
        if (axis === "columns") ui.layout.leftPercent = clamp(((event.clientX - rect.left) / rect.width) * 100, 38, 78);
        else ui.layout.scenePercent = clamp(((event.clientY - rect.top) / rect.height) * 100, 32, 82);
        applyInvestigationLayout(root);
      };
      handle.addEventListener("pointerdown", (event) => {
        if (window.matchMedia?.("(max-width: 980px)")?.matches) return;
        event.preventDefault();
        const system = document.querySelector(".retro-system-scroll");
        const chat = document.querySelector("[data-chat-stream]");
        const keepSystemLatest = isNearBottom(system);
        const keepChatLatest = isNearBottom(chat);
        handle.setPointerCapture?.(event.pointerId);
        document.body.classList.add("retro-resizing");
        updateByPointer(event);
        const move = (moveEvent) => {
          updateByPointer(moveEvent);
          requestAnimationFrame(() => scrollInvestigationStreamsToLatest({ system: keepSystemLatest, chat: keepChatLatest }));
        };
        const finish = (upEvent) => {
          try { handle.releasePointerCapture?.(upEvent.pointerId); } catch { /* 이미 해제된 포인터는 무시합니다. */ }
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", finish);
          handle.removeEventListener("pointercancel", finish);
          document.body.classList.remove("retro-resizing");
          saveInvestigationLayout();
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", finish);
        handle.addEventListener("pointercancel", finish);
      });
      handle.addEventListener("keydown", (event) => {
        const valid = axis === "columns" ? ["ArrowLeft", "ArrowRight"] : ["ArrowUp", "ArrowDown"];
        if (!valid.includes(event.key)) return;
        event.preventDefault();
        const direction = ["ArrowRight", "ArrowDown"].includes(event.key) ? 2 : -2;
        if (axis === "columns") ui.layout.leftPercent = clamp(ui.layout.leftPercent + direction, 38, 78);
        else ui.layout.scenePercent = clamp(ui.layout.scenePercent + direction, 32, 82);
        applyInvestigationLayout(root);
        saveInvestigationLayout();
      });
      handle.addEventListener("dblclick", () => {
        if (axis === "columns") ui.layout.leftPercent = DEFAULT_LAYOUT.leftPercent;
        else ui.layout.scenePercent = DEFAULT_LAYOUT.scenePercent;
        applyInvestigationLayout(root);
        saveInvestigationLayout();
      });
    });
  }

  function requestLatestLogScroll({ system = true, chat = false } = {}) {
    if (system) ui.forceSystemLatest = true;
    if (chat) ui.forceChatLatest = true;
  }

  function restoreInvestigationViewState(snapshot, { forceSystemLatest = false, forceChatLatest = false } = {}) {
    const settle = () => scrollInvestigationStreamsToLatest({ system: forceSystemLatest, chat: forceChatLatest });
    requestAnimationFrame(() => {
      const input = document.querySelector("[data-chat-input]");
      const system = document.querySelector(".retro-system-scroll");
      const chat = document.querySelector("[data-chat-stream]");

      if (forceSystemLatest) {
        scrollInvestigationStreamsToLatest({ system: true, chat: false });
      } else if (system) {
        system.scrollTop = !snapshot.hadSystem || snapshot.systemAtBottom
          ? system.scrollHeight
          : Math.min(snapshot.systemScrollTop, Math.max(0, system.scrollHeight - system.clientHeight));
      }
      if (forceChatLatest) {
        scrollInvestigationStreamsToLatest({ system: false, chat: true });
      } else if (chat) {
        chat.scrollTop = !snapshot.hadChat || snapshot.chatAtBottom
          ? chat.scrollHeight
          : Math.min(snapshot.chatScrollTop, Math.max(0, chat.scrollHeight - chat.clientHeight));
      }
      if (input && snapshot.inputFocused) {
        input.value = snapshot.inputValue;
        ui.actionText = snapshot.inputValue;
        input.focus({ preventScroll: true });
        if (snapshot.selectionStart != null) {
          const max = input.value.length;
          input.setSelectionRange(Math.min(snapshot.selectionStart, max), Math.min(snapshot.selectionEnd ?? snapshot.selectionStart, max));
        }
      }
      if (forceSystemLatest || forceChatLatest) {
        requestAnimationFrame(settle);
        setTimeout(settle, 80);
        setTimeout(settle, 240);
        document.fonts?.ready?.then(() => requestAnimationFrame(settle)).catch?.(() => {});
      }
    });
  }

  function nodeDisplayName(nodeId) {
    if (nodeId === "E_ENTRY") return "해오름역 구역 입구";
    return DATA.places[nodeId]?.name || nodeId;
  }

  function placeFloor(nodeId) {
    if (nodeId === "E_ENTRY") return "구역 경계";
    return DATA.places[nodeId]?.floor || "";
  }

  function findDetail(detailId) {
    for (const place of Object.values(DATA.places)) {
      const detail = place.details?.find((candidate) => candidate.id === detailId);
      if (detail) return detail;
    }
    return null;
  }

  function routesFrom(nodeId) { return DATA.routes.filter((route) => route.from === nodeId); }
  function currentPlace(session) { return DATA.places[session.currentNode] || null; }
  function navigableDestinations() {
    return [{ id: "E_ENTRY", name: nodeDisplayName("E_ENTRY") }, ...Object.values(DATA.places).map((place) => ({ id: place.id, name: place.name }))];
  }
  function destinationMatch(text) {
    const clean = normalizeActionText(text);
    const phraseMatch = clean.match(/(?:.*에서\s*)?(.+?)(?:으?로|쪽으로)\s*(?:이동|간다|가자|가보|가볼|감|향|따라|내려|올라|돌아)/);
    const focused = normalizedSearchText(phraseMatch?.[1] || clean);
    const whole = normalizedSearchText(clean);
    let best = null;
    navigableDestinations().forEach((destination) => {
      const name = normalizedSearchText(destination.name);
      const aliases = [name, name.replace(/^지하[12]층/, "")];
      if (destination.name.includes("1·2번")) aliases.push("1번승강장", "2번승강장", "1번", "2번");
      let score = 0;
      aliases.filter((alias) => alias.length >= 2).forEach((alias) => {
        if (focused === alias) score = Math.max(score, 300 + alias.length);
        else if (focused.includes(alias)) score = Math.max(score, 250 + alias.length);
        else if (includesFuzzyToken(focused, alias)) score = Math.max(score, 200 + alias.length);
        else if (whole.includes(alias)) score = Math.max(score, 100 + alias.length);
      });
      if (score && (!best || score > best.score)) best = { ...destination, score };
    });
    return best;
  }
  function shortestRoutePath(fromNode, destinationNode) {
    if (!fromNode || !destinationNode || fromNode === destinationNode) return [];
    const queue = [{ nodeId: fromNode, path: [] }];
    const visited = new Set([fromNode]);
    while (queue.length) {
      const current = queue.shift();
      for (const route of routesFrom(current.nodeId)) {
        if (visited.has(route.to)) continue;
        const path = [...current.path, route];
        if (route.to === destinationNode) return path;
        visited.add(route.to);
        queue.push({ nodeId: route.to, path });
      }
    }
    return [];
  }
  function alreadyAtLocationText(actorName, nodeId) {
    return `${actorName}는 이동하려던 장소명을 다시 확인한다. 이미 ${nodeDisplayName(nodeId)}에 있다.`;
  }
  function routeGuidanceText(actorName, fromNode, destinationNode) {
    const path = shortestRoutePath(fromNode, destinationNode);
    if (!path.length) return `${actorName}는 ${nodeDisplayName(destinationNode)}로 향하는 표지를 찾지만, 지금 서 있는 곳에서 그곳까지 이어지는 통로는 확인되지 않는다.`;
    const first = path[0];
    const steps = path.map((route) => nodeDisplayName(route.to));
    const remaining = steps.length > 1 ? ` 이후 ${steps.slice(1).join(" → ")} 순서로 통로가 이어진다.` : "";
    return `${actorName}가 ${nodeDisplayName(destinationNode)}로 가려면 먼저 ${nodeDisplayName(first.to)} 방향으로 이동해야 한다.${remaining}`;
  }
  function itemClaimKey(objectId, itemId) { return `${objectId}:${itemId}`; }
  function variantItemClaims(snapshot, sessionOrVariant) {
    const variant = typeof sessionOrVariant === "string" ? sessionOrVariant : sessionOrVariant?.variant;
    return snapshot.itemClaimsByVariant?.[variant] || {};
  }
  function itemClaim(snapshot, session, objectId, itemId) {
    return variantItemClaims(snapshot, session)[itemClaimKey(objectId, itemId)] || null;
  }
  function availableObjectItems(snapshot, session, objectId) {
    return (DATA.objectItems[objectId] || []).filter((mapping) => !itemClaim(snapshot, session, objectId, mapping.itemId));
  }
  function objectItemFindingText(snapshot, session, objectId) {
    const mappedItems = DATA.objectItems[objectId] || [];
    if (!mappedItems.length) return "내부를 확인해도 아무것도 없다.";
    const availableItems = availableObjectItems(snapshot, session, objectId);
    if (!availableItems.length) return "누군가 먼저 가져간 듯 물품이 놓였던 자리만 남아 있다. 내부에는 아무것도 없다.";
    return `안쪽에서 ${availableItems.map((mapping) => mapping.name).join(", ")}을 발견했다. 조사와 별도로 가져가야 한다.`;
  }
  function variantGlow(variant) {
    return { a: "rgba(143,224,177,.20)", b: "rgba(149,189,232,.20)", c: "rgba(223,158,155,.22)", d: "rgba(238,242,240,.25)" }[variant];
  }

  function mappedEntry(collection, key) {
    if (!key || !collection || !Object.prototype.hasOwnProperty.call(collection, key)) return null;
    return collection[key] || {};
  }

  function normalizeMedia(entry, { id: mediaId, label, alt }) {
    return {
      id: mediaId,
      label,
      src: String(entry?.src || "").trim(),
      alt: String(entry?.alt || alt || `${label} 흑백 조사 이미지`),
      position: String(entry?.position || "center"),
    };
  }

  function sceneMediaFor(session) {
    const routeId = session.movement?.routeId || session.activeEncounter?.routeId || "";
    const routeEntry = mappedEntry(IMAGE_MAP.scene?.byRoute, routeId);
    if (routeEntry) {
      const route = DATA.routes.find((candidate) => candidate.id === routeId);
      const label = route ? `${nodeDisplayName(route.from)} → ${nodeDisplayName(route.to)}` : "이동 경로";
      return normalizeMedia(routeEntry, { id: routeId, label, alt: `${label}의 흑백 이동 풍경` });
    }

    const detailId = session.currentDetailId || "";
    const detailEntry = mappedEntry(IMAGE_MAP.scene?.byDetail, detailId);
    if (detailEntry) {
      const detail = findDetail(detailId);
      const label = detail?.name || "세부 조사 지점";
      return normalizeMedia(detailEntry, { id: detailId, label, alt: `${label}의 흑백 조사 풍경` });
    }

    const nodeEntry = mappedEntry(IMAGE_MAP.scene?.byNode, session.currentNode);
    if (nodeEntry) {
      const label = nodeDisplayName(session.currentNode);
      return normalizeMedia(nodeEntry, { id: session.currentNode, label, alt: `${label}의 흑백 조사 풍경` });
    }

    return normalizeMedia(IMAGE_MAP.scene?.default || {}, {
      id: session.currentNode || "SCENE",
      label: nodeDisplayName(session.currentNode),
      alt: `${nodeDisplayName(session.currentNode)}의 흑백 조사 풍경`,
    });
  }

  function objectMediaFor(object) {
    const entry = mappedEntry(IMAGE_MAP.object?.byId, object?.id) || {};
    return normalizeMedia(entry, {
      id: object?.id || "OBJECT",
      label: object?.name || "조사 오브젝트",
      alt: `${object?.name || "조사 오브젝트"}의 흑백 상세 이미지`,
    });
  }

  function mappedMediaMarkup(media, kind = "scene") {
    const image = media.src
      ? `<img class="retro-mapped-image retro-${kind}-image" data-mapped-image src="${escapeHtml(media.src)}" alt="${escapeHtml(media.alt)}" style="object-position:${escapeHtml(media.position)}" />`
      : "";
    return `<div class="retro-mapped-media retro-${kind}-media" data-media-id="${escapeHtml(media.id)}">
      <div class="retro-image-placeholder" aria-label="${escapeHtml(media.label)} 이미지 대체 화면">
        <span>IMAGE SLOT</span>
        <strong>${escapeHtml(media.label)}</strong>
        <small>MONOCHROME PLACEHOLDER · ILLUSTRATION PENDING</small>
      </div>
      ${image}
    </div>`;
  }

  function bindMappedImages(scope = document) {
    scope.querySelectorAll("[data-mapped-image]").forEach((image) => {
      const showFallback = () => {
        image.hidden = true;
        image.parentElement?.classList.add("image-fallback");
      };
      image.addEventListener("error", showFallback, { once: true });
      if (image.complete && image.naturalWidth === 0) showFallback();
    });
  }

  function renderInvestigation(sessionId) {
    const viewSnapshot = captureInvestigationViewState();
    if (!ensureAuth()) return;
    const session = state.sessions[sessionId];
    const uid = currentUserId();
    if (!session || !session.memberIds.includes(uid)) return go("home");
    if (session.status === "BRIEFING") return go(`briefing/${session.id}`);
    if (session.status === "COMPLETED") return go(`result/${session.id}`);
    const forceLatest = viewSnapshot.mountedSessionId !== session.id;
    const forceSystemLatest = forceLatest || ui.forceSystemLatest;
    const forceChatLatest = forceLatest || ui.forceChatLatest;
    ui.forceSystemLatest = false;
    ui.forceChatLatest = false;
    document.body.classList.add("retro-mode");
    document.body.classList.remove("retro-login-mode", "retro-home-mode", "retro-page-mode");
    const place = currentPlace(session);
    const encounter = session.activeEncounter;
    const currentHazardId = encounter?.hazards?.[encounter.currentIndex] || null;
    const hazard = currentHazardId ? DATA.hazardTemplates[currentHazardId] : null;
    const revealKey = session.choiceReveal ? `${session.id}:${session.choiceReveal.type}:${session.choiceReveal.at}` : "";
    if (revealKey && ui.choiceRevealKey !== revealKey) {
      ui.choiceRevealKey = revealKey;
      ui.choicePanelOpen = true;
    } else if (!revealKey) {
      ui.choiceRevealKey = "";
      ui.choicePanelOpen = false;
    }
    const userCharacter = state.characters[uid];
    const visiblePeople = fieldCharacterIds(state, session).filter((memberId) => memberId !== uid);
    const sceneMedia = sceneMediaFor(session);
    const displayNodeName = session.movement
      ? `${nodeDisplayName(session.movement.fromNode)} → ${nodeDisplayName(session.movement.targetNode)} 이동 중`
      : encounter
        ? `${nodeDisplayName(encounter.fromNode || session.currentNode)} → ${nodeDisplayName(encounter.targetNode)} 이동 경로`
        : nodeDisplayName(session.currentNode);

    const scene = `
      <section class="retro-scene-frame">
        ${mappedMediaMarkup(sceneMedia, "scene")}
        <div class="retro-halftone" aria-hidden="true"></div>
        <div class="retro-location-card">
          <span>현재 장소</span>
          <strong>${escapeHtml(displayNodeName)}</strong>
          <small>${escapeHtml(placeFloor(session.currentNode))}</small>
        </div>
        <div class="retro-field-card">
          <span>DAY 01</span>
          <span>${session.memberIds.length}인 조사</span>
          <span>${visiblePeople.length ? `현장 ${visiblePeople.length + session.memberIds.length}명` : "단독 현장"}</span>
        </div>
        ${session.movement ? `<div class="retro-motion-overlay"><div class="pixel-loader"></div><strong>이동 중...</strong><span>${escapeHtml(nodeDisplayName(session.movement.targetNode))} 방향으로 이어지는 통로를 따라 이동하고 있다.</span></div>` : ""}
        ${sceneChoiceOverlay(session, hazard)}
      </section>`;

    const systemPanel = `<section class="retro-system-panel"><div class="retro-window-title">SYSTEM</div><div class="retro-system-scroll">${systemLogEntries(session).map(systemLogLineMarkup).join("") || `<div class="retro-system-line">${escapeHtml(place?.details?.[0]?.environment || "해오름역의 정적만이 이어진다.")}</div>`}</div>${hazard ? `<div class="retro-current-risk"><strong>현재 위험</strong><span>${escapeHtml(encounter.overview)}</span></div>` : ""}</section>`;

    const rowResizer = `<div class="retro-layout-resizer retro-layout-resizer-row" data-layout-resizer="rows" role="separator" aria-label="일러스트와 시스템 로그 높이 조절" aria-orientation="horizontal" aria-valuemin="32" aria-valuemax="82" tabindex="0" title="드래그하여 높이 조절 · 더블클릭으로 초기화"></div>`;
    const columnResizer = `<div class="retro-layout-resizer retro-layout-resizer-column" data-layout-resizer="columns" role="separator" aria-label="일러스트·로그와 채팅 영역 너비 조절" aria-orientation="vertical" aria-valuemin="38" aria-valuemax="78" tabindex="0" title="드래그하여 너비 조절 · 더블클릭으로 초기화"></div>`;
    const right = `<aside class="retro-right-panel">${rightPanel(session, userCharacter, hazard)}</aside>`;
    shell(`<div class="retro-investigation" data-layout-root data-session-id="${escapeHtml(session.id)}"><div class="retro-left-column">${scene}${rowResizer}${systemPanel}</div>${columnResizer}${right}</div>`, {
      headerExtra: `<span class="badge">DAY 01</span><span class="badge">${escapeHtml(displayNodeName)}</span><button type="button" class="badge retro-map-button" data-open-map="${escapeHtml(session.id)}">구역 지도</button>`,
    });
    bindInvestigation(session);
    bindInvestigationResizers();
    bindMappedImages();
    scheduleMovement(session);
    restoreInvestigationViewState(viewSnapshot, { forceSystemLatest, forceChatLatest });
  }

  function systemLogEntries(session) {
    return session.logs.filter((entry) => entry.type === "action-input" || (!entry.actorId && entry.type !== "interaction" && entry.type !== "chat-divider"));
  }

  function chatScopeKey(session) {
    return spatialScopeKey(session);
  }

  function chatScopeLabel(scopeKey) {
    if (!scopeKey) return "현재 위치";
    if (scopeKey.startsWith("node:")) return nodeDisplayName(scopeKey.slice(5));
    if (scopeKey.startsWith("detail:")) {
      const [, nodeId, detailId] = scopeKey.split(":");
      const detail = DATA.places[nodeId]?.details?.find((item) => item.id === detailId);
      return `${nodeDisplayName(nodeId)} · ${detail?.name || "세부 조사 지점"}`;
    }
    if (scopeKey.startsWith("route:")) {
      const [, fromNode, toNode] = scopeKey.split(":");
      return `${nodeDisplayName(fromNode)} → ${nodeDisplayName(toNode)} 이동 경로`;
    }
    return "현재 위치";
  }

  function chatLogEntries(session) {
    const source = session.logs
      .filter((entry) => entry.type === "interaction" || entry.type === "chat-divider");
    const timeline = [];
    let lastScopeKey = null;
    source.forEach((entry) => {
      if (entry.type === "chat-divider") {
        if (entry.scopeKey !== lastScopeKey) timeline.push(entry);
        lastScopeKey = entry.scopeKey || lastScopeKey;
        return;
      }
      if (entry.scopeKey && entry.scopeKey !== lastScopeKey) {
        timeline.push({
          id: `virtual_divider_${entry.id}`,
          type: "chat-divider",
          text: chatScopeLabel(entry.scopeKey),
          scopeKey: entry.scopeKey,
          at: Math.max(0, entry.at - 1),
          virtual: true,
        });
        lastScopeKey = entry.scopeKey;
      }
      timeline.push(entry);
    });
    const currentScopeKey = chatScopeKey(session);
    if (currentScopeKey !== lastScopeKey) {
      timeline.push({
        id: `virtual_current_${currentScopeKey}`,
        type: "chat-divider",
        text: chatScopeLabel(currentScopeKey),
        scopeKey: currentScopeKey,
        at: Date.now(),
        virtual: true,
      });
    }
    return timeline;
  }

  function rightPanel(session, character, hazard) {
    const tabs = [["chat", "조사 채팅"], ["inventory", "소지품"], ["status", "상태"], ["record", "기록"]];
    return `<div class="retro-panel-tabs">${tabs.map(([key, label]) => `<button class="retro-tab ${ui.tab === key ? "active" : ""}" data-tab="${key}">${label}</button>`).join("")}</div><div class="retro-tab-body">${panelContent(session, character, hazard)}</div>`;
  }

  function panelContent(session, character, hazard) {
    if (ui.tab === "inventory") return inventoryPanel(character);
    if (ui.tab === "status") return statusPanel(character);
    if (ui.tab === "record") return recordPanel(session);
    return chatPanel(session, character, hazard);
  }

  function chatPanel(session, character, hazard) {
    const messages = chatLogEntries(session);
    const composerDisabled = session.movement || ui.aiPending;
    const aiStatus = ui.aiPending
      ? "AI가 행동 뜻을 판정하는 중..."
      : ui.aiAvailable === true
        ? "AI 자유문장 판정 · /행동"
        : ui.aiAvailable === false
          ? "로컬 판정 대기 · /행동"
          : "AI 연결 확인 중 · /행동";
    return `<section class="retro-chat-panel">
      <div class="retro-chat-stream" data-chat-stream>${messages.length ? messages.map(chatBubble).join("") : `<div class="retro-chat-empty">현재 위치에서 오간 대화가 없습니다.<br>일반 대화는 그대로, 시스템 판정이 필요한 행동은 /로 시작해 입력하세요.</div>`}</div>
      <div class="retro-chat-composer">
        <textarea data-chat-input ${composerDisabled ? "disabled" : ""} placeholder="${session.movement ? "이동 중입니다..." : ui.aiPending ? "AI가 행동 문장을 읽고 있습니다..." : hazard ? "대화는 그대로, 위험 대응은 /자유문장으로 입력하세요..." : "대화는 그대로, 시스템 행동은 /자유문장으로 입력하세요..."}">${escapeHtml(ui.actionText)}</textarea>
        <div class="retro-composer-row"><span data-ai-status class="${ui.aiAvailable === true ? "is-ai-ready" : ""}">${aiStatus}</span><button class="retro-send" data-send-chat ${composerDisabled ? "disabled" : ""}>${ui.aiPending ? "판정 중" : "전송 ↵"}</button></div>
      </div>
    </section>`;
  }

  function chatBubble(entry) {
    if (entry.type === "chat-divider") {
      return `<div class="retro-chat-divider"><span>${escapeHtml(entry.text || chatScopeLabel(entry.scopeKey))}</span></div>`;
    }
    const actor = entry.actorId ? DEMO_USERS[entry.actorId] : null;
    const initial = actor?.initial || "!";
    return `<article class="retro-chat-message ${entry.actorId === currentUserId() ? "mine" : ""}"><div class="retro-chat-avatar">${escapeHtml(initial)}</div><div class="retro-chat-content"><div class="retro-chat-meta"><strong>${escapeHtml(actor?.name || "시스템")}</strong><span>${new Date(entry.at).toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit" })}</span></div><div class="retro-chat-bubble">${escapeHtml(entry.text)}</div></div></article>`;
  }

  function choicePanelBody(session, hazard) {
    if (hazard) {
      return `<div class="retro-scene-choice-list">${hazard.safeActions.map((action) => `<button class="retro-choice" data-suggested-action="${escapeHtml(action)}">▶ ${escapeHtml(action)}</button>`).join("")}</div>`;
    }
    const routes = routesFrom(session.currentNode);
    const place = currentPlace(session);
    const selectedId = ui.selectedDetailId && place?.details.some((detail) => detail.id === ui.selectedDetailId) ? ui.selectedDetailId : place?.details?.[0]?.id;
    const objects = selectedId ? (DATA.objectsByDetail[selectedId] || []) : [];
    return `<div class="retro-scene-choice-list">
      ${routes.map((route) => `<button class="retro-choice" data-move-route="${route.id}">▶ ${escapeHtml(route.choice)}</button>`).join("")}
      ${place?.details?.map((detail) => `<button class="retro-choice ${detail.id === selectedId ? "selected" : ""}" data-detail="${detail.id}">◇ ${escapeHtml(detail.name)} 살펴보기</button>`).join("") || ""}
      ${objects.map((object) => {
        const inspected = session.inspectedObjectIds.includes(object.id);
        const itemButtons = inspected ? availableObjectItems(state, session, object.id).map((mapping) => `<button class="retro-choice" data-take-item="${object.id}|${mapping.itemId}">□ ${escapeHtml(mapping.name)} 가져가기</button>`).join("") : "";
        return `<button class="retro-choice" data-inspect-object="${object.id}">${inspected ? "●" : "○"} ${escapeHtml(object.name)} ${inspected ? "상세 보기" : "조사하기"}</button>${itemButtons}`;
      }).join("")}
    </div>`;
  }

  function sceneChoiceOverlay(session, hazard) {
    if (!session.choiceReveal || session.movement) return "";
    if (!ui.choicePanelOpen) {
      return `<button class="retro-choice-launch" data-open-choice-panel><span>◆</span> 행동 선택</button>`;
    }
    return `<section class="retro-scene-actions" aria-label="행동 선택">
      <div class="retro-scene-actions-head"><div><strong>행동 선택</strong><small>${hazard ? "확인한 징후를 바탕으로 대응을 고른다." : "주변 단서를 바탕으로 다음 행동을 고른다."}</small></div><button class="retro-choice-close" data-close-choice-panel aria-label="행동 선택 닫기">×</button></div>
      ${choicePanelBody(session, hazard)}
      <div class="retro-scene-actions-foot">선택지 외 행동은 채팅창에 /행동으로 입력할 수 있다.</div>
    </section>`;
  }

  function inventoryPanel(character) {
    const inventory = Object.values(character.inventory || {});
    const activeSession = getUserSession(currentUserId());
    const presentIds = activeSession ? fieldCharacterIds(state, activeSession).filter((memberId) => memberId !== currentUserId()) : [];
    return `<section class="retro-menu-panel"><div class="retro-menu-head"><strong>소지품</strong><small>가져가기 행동을 완료한 물품</small></div>${inventory.length ? inventory.map((item) => `<button class="retro-menu-row" data-item-modal="${item.itemId}"><span>▶ ${escapeHtml(item.name)}</span><b>×${item.quantity}</b></button>`).join("") : `<div class="retro-empty-box">아직 획득한 물품이 없습니다.</div>`}${presentIds.length && inventory.length ? `<div class="retro-transfer-box"><strong>소지품 건네기</strong><select data-transfer-target><option value="">받을 인물</option>${presentIds.map((memberId) => `<option value="${memberId}">${escapeHtml(DEMO_USERS[memberId]?.name)}</option>`).join("")}</select><select data-transfer-item><option value="">전달할 물품</option>${inventory.map((item) => `<option value="${item.itemId}">${escapeHtml(item.name)} ×${item.quantity}</option>`).join("")}</select><button class="retro-choice" data-transfer-item-button>1개 건네기</button></div>` : ""}</section>`;
  }

  function contaminationStage(value) {
    if (value >= 100) return "완전 용해";
    if (value >= 80) return "붕락";
    if (value >= 60) return "용해";
    if (value >= 40) return "유화";
    if (value >= 20) return "번짐";
    return "안정";
  }

  function statusPanel(character) {
    const stage = contaminationStage(character.contamination);
    const blocks = Math.min(10, Math.ceil(character.contamination / 10));
    return `<section class="retro-menu-panel"><div class="retro-menu-head"><strong>상태</strong><small>현재 기록된 객관적 수치</small></div><div class="retro-status-grid"><div><span>오염도</span><strong>${character.contamination}%</strong></div><div><span>단계</span><strong>${escapeHtml(stage)}</strong></div></div><div class="pixel-meter">${Array.from({length:10}, (_, index) => `<i class="${index < blocks ? "filled" : ""}"></i>`).join("")}</div><div class="retro-note">공개·은폐·발각은 시스템이 판정하지 않으며 역할극으로 처리합니다.</div></section>`;
  }

  function recordPanel(session) {
    const inspected = session.inspectedObjectIds.map((objectId) => findObject(objectId)).filter(Boolean);
    return `<section class="retro-menu-panel"><div class="retro-menu-head"><strong>조사 기록</strong><small>직접 확인된 정보만 표시</small></div>${inspected.length ? inspected.map((object) => `<div class="retro-record-row"><strong>${escapeHtml(object.name)}</strong><span>${escapeHtml(object.result)}</span></div>`).join("") : `<div class="retro-empty-box">확인한 오브젝트가 없습니다.</div>`}<button class="retro-danger" data-end-session>조사 종료</button></section>`;
  }

  function bindModalControls(root) {
    if (!root) return;
    let onKeydown = null;
    const close = () => {
      root.innerHTML = "";
      if (onKeydown) document.removeEventListener("keydown", onKeydown);
    };
    onKeydown = (event) => { if (event.key === "Escape") close(); };
    root.querySelectorAll("[data-close-modal]").forEach((element) => element.addEventListener("click", (event) => {
      if (event.target === element || element.tagName === "BUTTON") close();
    }));
    document.addEventListener("keydown", onKeydown);
    requestAnimationFrame(() => root.querySelector("[data-modal-close-button]")?.focus());
  }

  function showObjectModal(objectId) {
    const object = findObject(objectId);
    const root = document.getElementById("modal-root");
    if (!object || !root) return;
    const detail = findDetail(object.detailId);
    const media = objectMediaFor(object);
    state = loadState();
    const session = getUserSession(currentUserId());
    const mappedItems = DATA.objectItems[object.id] || [];
    const availableItems = session ? availableObjectItems(state, session, object.id) : mappedItems;
    root.innerHTML = `<div class="retro-modal-backdrop" data-close-modal>
      <section class="retro-modal retro-object-modal" role="dialog" aria-modal="true" aria-labelledby="object-modal-title">
        <div class="retro-modal-title"><span>오브젝트 상세</span><button type="button" data-close-modal data-modal-close-button aria-label="닫기">×</button></div>
        <div class="retro-object-modal-grid">
          ${mappedMediaMarkup(media, "object")}
          <div class="retro-object-copy">
            <div class="retro-object-location">${escapeHtml(detail?.name || "세부 조사 지점")}</div>
            <h2 id="object-modal-title">${escapeHtml(object.name)}</h2>
            <p class="retro-object-observation">${escapeHtml(object.observation || object.context || "")}</p>
            <div class="retro-object-result"><strong>조사 결과</strong><p>${escapeHtml(object.result)}</p></div>
            <div class="retro-object-meta"><span>조사 후 상태</span><b>${escapeHtml(object.afterState || "변화 없음")}</b></div>
            ${!mappedItems.length ? `<div class="retro-object-items empty"><span>아무것도 없다.</span></div>` : availableItems.length ? `<div class="retro-object-items"><strong>별도 획득 가능</strong><span>${availableItems.map((item) => escapeHtml(item.name)).join(" · ")}</span><small>물품은 팝업을 닫은 뒤 ‘가져가기’ 행동으로 획득합니다.</small></div>` : `<div class="retro-object-items empty"><span>누군가 먼저 가져간 뒤라 아무것도 없다.</span></div>`}
          </div>
        </div>
        <button class="retro-modal-button" type="button" data-close-modal>닫기</button>
      </section>
    </div>`;
    bindMappedImages(root);
    bindModalControls(root);
  }

  function showItemModal(itemId) {
    const item = currentCharacter()?.inventory?.[itemId];
    if (!item) return;
    const root = document.getElementById("modal-root");
    if (!root) return;
    root.innerHTML = `<div class="retro-modal-backdrop" data-close-modal><section class="retro-modal" role="dialog" aria-modal="true"><div class="retro-modal-title">소지품 <button type="button" data-close-modal data-modal-close-button aria-label="닫기">×</button></div><div class="retro-item-icon">▣</div><h2>${escapeHtml(item.name)}</h2><p>${escapeHtml(item.category)} · 상태 ${escapeHtml(item.state)}</p><div class="retro-modal-count">보유 수량 ${item.quantity}</div><button class="retro-modal-button" type="button" data-close-modal>닫기</button></section></div>`;
    bindModalControls(root);
  }

  function loadMapSvg(root, currentNode) {
    const canvas = root?.querySelector?.("[data-map-canvas]");
    if (!canvas) return;
    fetch("assets/maps/haeoreum-day1-map.svg?v=0.3.18")
      .then((response) => {
        if (!response.ok) throw new Error(`MAP_HTTP_${response.status}`);
        return response.text();
      })
      .then((markup) => {
        canvas.innerHTML = markup;
        canvas.querySelectorAll("[data-node]").forEach((node) => {
          const isCurrent = node.getAttribute("data-node") === currentNode;
          node.classList.toggle("is-current", isCurrent);
          if (isCurrent) node.setAttribute("aria-current", "location");
        });
      })
      .catch(() => {
        canvas.innerHTML = `<div class="retro-map-load-fallback"><strong>구역 지도를 불러오지 못했습니다.</strong><span>assets/maps/haeoreum-day1-map.svg 파일을 확인해 주세요.</span></div>`;
      });
  }

  function showMapModal(sessionId) {
    state = loadState();
    const session = state.sessions[sessionId];
    const root = document.getElementById("modal-root");
    if (!session || !root) return;
    const displayLocation = session.movement
      ? `${nodeDisplayName(session.movement.fromNode)} → ${nodeDisplayName(session.movement.targetNode)} 이동 중`
      : session.activeEncounter
        ? `${nodeDisplayName(session.activeEncounter.fromNode || session.currentNode)} → ${nodeDisplayName(session.activeEncounter.targetNode)} 이동 경로`
        : nodeDisplayName(session.currentNode);
    const connectedRoutes = routesFrom(session.currentNode);
    const connectedMarkup = connectedRoutes.length
      ? connectedRoutes.map((route) => `<li><span>↔</span><strong>${escapeHtml(nodeDisplayName(route.to))}</strong><small>${escapeHtml(route.choice)}</small></li>`).join("")
      : `<li class="empty"><span>×</span><strong>직접 연결된 이동 경로 없음</strong></li>`;

    root.innerHTML = `<div class="retro-modal-backdrop" data-close-modal>
      <section class="retro-modal retro-map-modal" role="dialog" aria-modal="true" aria-labelledby="map-modal-title">
        <div class="retro-modal-title"><span id="map-modal-title">해오름역 구역 지도</span><button type="button" data-close-modal data-modal-close-button aria-label="닫기">×</button></div>
        <div class="retro-map-current"><span>현재 위치</span><strong><i aria-hidden="true"></i>${escapeHtml(displayLocation)}</strong></div>
        <div class="retro-map-viewport" role="img" aria-label="해오름역 지상, 지하 1층, 지하 2층의 조사 구역 배치와 양방향 이동 경로 지도">
          <div class="retro-map-canvas" data-map-canvas><div class="retro-map-loading">구역 지도 불러오는 중...</div></div>
        </div>
        <div class="retro-map-footer">
          <p class="retro-map-note">검은 외곽선은 건물 경계, 흰 띠는 복도입니다. 실선 양방향 화살표는 실제 이동 가능한 경로이며, 계단 안내에는 연결되는 층과 구역을 직접 표시했습니다.</p>
          <div class="retro-map-routes"><strong>현재 위치에서 바로 연결된 경로</strong><ul>${connectedMarkup}</ul></div>
        </div>
        <button class="retro-modal-button" type="button" data-close-modal>지도 닫기</button>
      </section>
    </div>`;
    bindModalControls(root);
    loadMapSvg(root, session.currentNode);
  }

  function isMapRequest(text) {
    const clean = normalizeActionText(text);
    const namesMap = /(구역\s*(지도|배치|도면)|전체\s*지도|지도|약도|이동\s*경로)/.test(clean);
    const asksToSee = /(보여|보자|본다|보다|봐|봄|봤|보았|보기|열어|펼쳐|확인|어디|있어|있나|알려|보고|볼래)/.test(clean) || /^(지도|약도)$/.test(clean);
    return namesMap && asksToSee;
  }

  function hazardInputIntent(text) {
    if (isMapRequest(text)) return "map";
    if (isNavigationHintRequest(text)) return "navigation-hint";
    if (isObservationAction(text)) return "observation";
    return "hazard-response";
  }

  function isNavigationHintRequest(text) {
    const clean = normalizeActionText(text);
    return /(길을?\s*(잃|모르)|방향을?\s*(잃|모르)|어디로\s*(가|가야|나가)|어느\s*(쪽|길)|무엇을\s*(해야|하지)|뭘\s*(해야|하지)|어떻게\s*(가|나가|피하|해야)|헤매|갈피를\s*못|출구가\s*어디|여긴\s*어디|어디인지\s*모르|갈\s*곳을\s*모르)/.test(clean);
  }

  function isHintLike(text) {
    return isNavigationHintRequest(text);
  }

  function isObservationAction(text) {
    return /(관찰|둘러보|둘러본|주변을?\s*(보|살피)|주위를?\s*(보|살피)|살펴보|바라보|쳐다보|눈으로\s*(보|확인)|시야를\s*돌|주변\s*봄)/.test(normalizeActionText(text));
  }

  function isInspectionAction(text) {
    return /(조사|확인|관찰|살펴|들여다|읽어|읽는다|열어|만져|점검|본다|보다|봐|봄|보자|훑어)/.test(normalizeActionText(text));
  }

  function isMovementAction(text) {
    const clean = normalizeActionText(text);
    return /(이동|간다|간당|가자|가보자|가볼|갈래|향한다|향해|따라가|따라간|쫓아가|지나간|지나가|통과|건너|들어가|나가|돌아가|내려가|올라가|걷|발을?\s*옮|ㄱㄱ)/.test(clean)
      || /(?:^|\s)(?:감|가)(?:\s|$)/.test(clean);
  }

  function isWaitAction(text) {
    return /(기다린|기다려|대기|멈춰|가만히|숨을\s*고르|잠시\s*쉰)/.test(normalizeActionText(text));
  }

  function isListeningAction(text) {
    const clean = normalizeActionText(text);
    return /(듣|귀를?\s*기울|소리에?\s*집중|청취)/.test(clean)
      || /(?:방송|잡음|소리|울림|발소리|기계음).*(?:확인|집중)/.test(clean);
  }

  function isSelfCheckAction(text) {
    const clean = normalizeActionText(text);
    const self = /(?:내|나의|자신의?|자기|몸|피부|손(?:바닥)?|팔|다리|얼굴|옷(?:자락)?|상태|오염|상처|증상|호흡)/.test(clean);
    const checks = /(?:살피|살핀|살펴|확인|점검|관찰|들여다|훑|만져|본다|보다|봐|체크)/.test(clean);
    return self && checks;
  }

  function isHazardResponseAction(session, text) {
    if (!session?.activeEncounter) return false;
    const clean = normalizeActionText(text);
    if (isMapRequest(clean) || isListeningAction(clean) || isSelfCheckAction(clean) || isObservationAction(clean) || isNavigationHintRequest(clean)) return false;
    const crosses = /(피해|피하|비켜|우회|건너|통과|지나가|지나간|넘어|기어|숙여|막아|가려|받쳐|붙잡|균형|발판|마른\s*곳|안전한\s*곳|틈을?\s*(보|노리|기다)|간격을?\s*(보|노리|기다)|멎을\s*때|잦아들|뛰|달려|맨손|무시|그냥\s*간)/.test(clean);
    const purposefulMove = isMovementAction(clean) && /(잔상|흰\s*(선|얼룩|잔류물|점액)|파편|유리|물|웅덩이|계단|발판|문|통로|안전|위험|난간|손잡이)/.test(clean);
    return crosses || purposefulMove;
  }

  function normalizeActionText(value) {
    return String(value || "")
      .normalize("NFKC")
      .replace(/^\/+\s*/, "")
      .replace(/([가-힣])\1{2,}/g, "$1$1")
      .replace(/한당(?=$|\s)/g, "한다")
      .replace(/간당(?=$|\s)/g, "간다")
      .replace(/할게용(?=$|\s)/g, "할게요")
      .replace(/[ㅋㅎㅠㅜ]+$/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizedSearchText(value) {
    return normalizeActionText(value).toLowerCase().replace(/[^0-9a-z가-힣]+/g, "");
  }

  const ITEM_USE_FITS = new Set(["NONE", "SUITABLE", "UNSUITABLE", "MISSING"]);
  const ITEM_USE_EXCLUSIONS = new Set(["손", "맨손", "발", "몸", "주먹", "손바닥", "소매", "옷소매", "옷자락", "지도"]);

  function escapeRegExp(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function inventoryItemEntries(character) {
    return Object.values(character?.inventory || {})
      .filter((item) => Number(item?.quantity) > 0)
      .map((item) => ({ ...item, catalog: DATA.itemCatalog[item.itemId] || null }));
  }

  function itemUseMentionName(text, character = currentCharacter()) {
    const clean = normalizeActionText(text);
    const useVerb = "(?:꺼내|사용|이용|활용|들고|쥐고|착용|쓰고|써서|닦|문지|훔치|비추|밝히|가리|덮|감싸|묶|고정|밀|받치|찌르|건드|막|표시|두드|열|잡)";
    const knownNames = unique([
      ...inventoryItemEntries(character).map((item) => item.name),
      ...Object.values(DATA.itemCatalog || {}).map((item) => item.name),
    ]).filter(Boolean).sort((left, right) => right.length - left.length);

    for (const name of knownNames) {
      const flexibleName = escapeRegExp(name).replace(/\s+/g, "\\s*");
      const instrumental = new RegExp(`${flexibleName}\\s*(?:으)?로\\s*(?:[^,.!?]{0,24}\\s*)?${useVerb}`);
      const direct = new RegExp(`${flexibleName}\\s*(?:을|를)?\\s*${useVerb}`);
      if (instrumental.test(clean) || direct.test(clean)) return name;
    }

    const patterns = [
      new RegExp(`([0-9A-Za-z가-힣·_-]{2,20}?)(?:으)?로\\s*(?:[^,.!?]{0,18}\\s*)?${useVerb}`),
      new RegExp(`([0-9A-Za-z가-힣·_-]{2,20}?)(?:을|를)\\s*${useVerb}`),
      new RegExp(`(?:꺼내|들고|쥐고|사용|이용|활용)(?:서|해|하여|한)?\\s*([0-9A-Za-z가-힣·_-]{2,20})`),
    ];
    for (const pattern of patterns) {
      const matched = clean.match(pattern)?.[1]?.replace(/[을를이가은는]$/u, "").trim();
      if (matched && !ITEM_USE_EXCLUSIONS.has(matched)) return matched;
    }
    return "";
  }

  function itemNameMatches(referenceName, itemName) {
    const reference = normalizedSearchText(referenceName);
    const candidate = normalizedSearchText(itemName);
    if (!reference || !candidate) return false;
    if (reference === candidate) return true;
    if (Math.min(reference.length, candidate.length) < 2) return false;
    return reference.includes(candidate) || candidate.includes(reference);
  }

  function ownedItemForReference(character, referenceName, preferredItemId = "") {
    const inventory = inventoryItemEntries(character);
    if (preferredItemId) {
      const preferred = inventory.find((item) => item.itemId === preferredItemId);
      if (preferred) return preferred;
    }
    return inventory.find((item) => itemNameMatches(referenceName, item.name)) || null;
  }

  function inferredItemTags(item) {
    const tags = new Set(item?.catalog?.tags || []);
    const name = String(item?.name || "");
    if (/(수건|티슈|휴지|천)/.test(name)) tags.add("ABSORBENT_MATERIAL");
    if (/(봉|막대|밀대|우산)/.test(name)) tags.add("LONG_REACH_TOOL");
    if (/(손전등|후레시|후래시|랜턴)/.test(name)) tags.add("PORTABLE_LIGHT");
    if (/장갑/.test(name)) tags.add("HAND_PROTECTION");
    if (/(테이프|끈|로프|줄)/.test(name)) tags.add("FASTENING_TOOL");
    if (/(펜|연필|마커)/.test(name)) tags.add("WRITING_TOOL");
    return tags;
  }

  function itemUseRequirement(text) {
    const clean = normalizeActionText(text);
    const rules = [
      { pattern: /(닦|문지|훔치|흡수)/, tags: ["WET_WIPE", "ABSORBENT_MATERIAL", "PAPER_TISSUE", "LARGE_CLOTH", "CLEANING_TOOL"], reason: "표면을 닦거나 흡수할 수 있는 재질과 형태가 아니다" },
      { pattern: /(비추|밝히|불을\s*켜|조명)/, tags: ["PORTABLE_LIGHT", "SIGNAL_LIGHT"], reason: "주변을 밝힐 수 있는 광원이 아니다" },
      { pattern: /(묶|고정|동여매|붙여)/, tags: ["FASTENING_TOOL", "BOARD_TAPE", "BARRIER_TAPE"], reason: "묶거나 고정할 수 있는 길이와 접착력이 없다" },
      { pattern: /(받치|지렛대|멀리서\s*(?:밀|건드|찌르)|틈을\s*벌)/, tags: ["LONG_REACH_TOOL", "PUSH_TOOL", "HEAVY_OBJECT"], reason: "거리와 하중을 버틸 수 있는 도구가 아니다" },
      { pattern: /(가리|덮|감싸|막아)/, tags: ["WATERPROOF_COVER", "LARGE_CLOTH", "INSULATION_CLOTH", "BARRIER_TAPE"], reason: "가리거나 덮을 만큼 넓고 튼튼하지 않다" },
      { pattern: /(기록|적어|써서\s*표시|표식을?\s*남)/, tags: ["WRITING_TOOL", "MARKING_TOOL"], reason: "기록이나 표식을 남길 수 있는 물건이 아니다" },
      { pattern: /(손잡이|난간|접촉).*(잡|만지|열)|잡고\s*(?:열|당기)/, tags: ["HAND_PROTECTION", "INSULATION_CLOTH", "LARGE_CLOTH", "WET_WIPE", "PAPER_TISSUE"], reason: "손과 오염된 표면 사이를 막아 줄 수 있는 물건이 아니다" },
      { pattern: /(신호|호출|소리를\s*내|불빛을\s*흔들)/, tags: ["SIGNAL_DEVICE", "SIGNAL_LIGHT", "VISIBILITY_GEAR"], reason: "멀리 전달할 신호를 만들 수 있는 물건이 아니다" },
      { pattern: /(개찰|승차|통과).*(찍|대|태그)/, tags: ["TRANSIT_CARD", "TICKET_TOKEN"], reason: "개찰 설비가 인식할 수 있는 승차 매체가 아니다" },
    ];
    return rules.find((rule) => rule.pattern.test(clean)) || null;
  }

  function localItemUseFields(text, character = currentCharacter()) {
    const usedItemName = itemUseMentionName(text, character);
    if (!usedItemName) return { usedItemName: "", usedItemId: "", itemUseFit: "NONE", itemUseReason: "" };
    const item = ownedItemForReference(character, usedItemName);
    if (!item) {
      return { usedItemName, usedItemId: "", itemUseFit: "MISSING", itemUseReason: `${usedItemName}은 현재 소지품에 없다` };
    }
    const stateName = String(item.state || "CLEAN").toUpperCase();
    if (["BROKEN", "DEPLETED", "USED_UP", "UNUSABLE"].includes(stateName)) {
      return { usedItemName, usedItemId: item.itemId, itemUseFit: "UNSUITABLE", itemUseReason: `${item.name}은 현재 사용할 수 없는 상태다` };
    }
    const requirement = itemUseRequirement(text);
    if (stateName === "CONTAMINATED" && requirement?.tags.some((tag) => ["WET_WIPE", "ABSORBENT_MATERIAL", "PAPER_TISSUE", "CLEANING_TOOL"].includes(tag))) {
      return { usedItemName, usedItemId: item.itemId, itemUseFit: "UNSUITABLE", itemUseReason: `${item.name} 자체가 오염되어 닦는 용도로 쓸 수 없다` };
    }
    if (requirement) {
      const tags = inferredItemTags(item);
      if (!requirement.tags.some((tag) => tags.has(tag))) {
        return { usedItemName, usedItemId: item.itemId, itemUseFit: "UNSUITABLE", itemUseReason: `${item.name}은 ${requirement.reason}` };
      }
    }
    return { usedItemName, usedItemId: item.itemId, itemUseFit: "SUITABLE", itemUseReason: `${item.name}은 입력한 용도로 사용할 수 있다` };
  }

  function withLocalItemUse(result, text, character = currentCharacter()) {
    return { ...result, ...localItemUseFields(text, character) };
  }

  function evaluateItemUse(character, text, interpretation = {}) {
    const local = localItemUseFields(text, character);
    const usedItemName = String(interpretation.usedItemName || local.usedItemName || "").trim();
    if (!usedItemName) return null;
    if (ITEM_USE_EXCLUSIONS.has(usedItemName.replace(/[을를이가은는]$/u, ""))) return null;
    const item = ownedItemForReference(character, usedItemName, interpretation.usedItemId || local.usedItemId);
    if (!item) {
      return { status: "missing", fit: "MISSING", mentionedName: usedItemName, itemId: "", item: null, reason: `${usedItemName}은 현재 소지품에 없다` };
    }

    const authoritativeLocal = local.usedItemId === item.itemId ? local : localItemUseFields(text.replace(usedItemName, item.name), character);
    const stateName = String(item.state || "CLEAN").toUpperCase();
    if (["BROKEN", "DEPLETED", "USED_UP", "UNUSABLE"].includes(stateName)) {
      return { status: "unavailable", fit: "UNSUITABLE", mentionedName: usedItemName, itemId: item.itemId, item, reason: `${item.name}은 현재 사용할 수 없는 상태다` };
    }
    const requirement = itemUseRequirement(text);
    if (stateName === "CONTAMINATED" && requirement && /(닦|문지|훔치|흡수|손잡이|난간|접촉)/.test(normalizeActionText(text))) {
      return { status: "unavailable", fit: "UNSUITABLE", mentionedName: usedItemName, itemId: item.itemId, item, reason: `${item.name} 자체가 오염되어 접촉을 막거나 닦는 용도로 쓸 수 없다` };
    }

    let fit = authoritativeLocal.itemUseFit || "SUITABLE";
    let reason = authoritativeLocal.itemUseReason || "";
    if (["SUITABLE", "UNSUITABLE"].includes(interpretation.itemUseFit)) {
      fit = interpretation.itemUseFit;
      reason = String(interpretation.itemUseReason || reason).trim().slice(0, 240);
    }
    if (fit === "UNSUITABLE") {
      return { status: "unsuitable", fit, mentionedName: usedItemName, itemId: item.itemId, item, reason: reason || `${item.name}은 그 용도로 쓰기 어렵다` };
    }
    return { status: "usable", fit: "SUITABLE", mentionedName: usedItemName, itemId: item.itemId, item, reason };
  }

  function itemUseFailureText(session, actorName, text, itemUse) {
    const attempt = actionAttemptSentence(actorName, text);
    const followup = isMovementAction(text)
      ? "닦지 않은 곳에 그대로 손발을 대는 대신, 출발하려던 자리에서 멈춘다."
      : "빈손으로 같은 동작을 밀어붙이지 않고 손을 거둔다.";
    let cause;
    if (itemUse.status === "missing") {
      cause = `그러나 주머니와 가방을 훑어도 ${itemUse.mentionedName}은 손에 잡히지 않는다.`;
    } else if (itemUse.status === "unavailable") {
      cause = `꺼낸 ${itemUse.item?.name || itemUse.mentionedName}은 ${itemUse.reason || "지금 손을 대기 어려운 상태"}라 바로 다시 넣는다.`;
    } else {
      cause = `${itemUse.item?.name || itemUse.mentionedName}을 대 보지만 ${itemUse.reason || "이 용도로는 힘이나 면적이 맞지 않아"} 금세 손을 거둔다.`;
    }
    return `${attempt} ${cause} ${followup}`;
  }

  function itemUseLeadText(actorName, text, itemUse) {
    if (!itemUse || itemUse.status !== "usable") return "";
    const name = itemUse.item?.name || itemUse.mentionedName;
    const clean = normalizeActionText(text);
    if (/(닦|문지|훔치)/.test(clean)) return `${actorName}는 소지품에서 ${name}을 꺼내 닿으려던 표면을 먼저 꼼꼼히 닦아 낸다.`;
    if (/(비추|밝히|불을\s*켜)/.test(clean)) return `${actorName}는 소지품에서 ${name}을 꺼내 어두운 앞쪽을 비추며 시야를 확보한다.`;
    if (/(묶|고정|붙여)/.test(clean)) return `${actorName}는 ${name}을 꺼내 흔들리는 부분을 단단히 고정한다.`;
    if (/(가리|덮|감싸|막아)/.test(clean)) return `${actorName}는 ${name}을 펼쳐 위험한 표면과 몸 사이를 가린다.`;
    if (/(받치|밀|찌르|건드)/.test(clean)) return `${actorName}는 ${name}을 단단히 쥐고 직접 닿지 않는 거리에서 앞쪽을 확인한다.`;
    return `${actorName}는 소지품에서 ${name}을 꺼내 입력한 용도에 맞게 사용한다.`;
  }

  function editDistance(left, right) {
    const a = [...left];
    const b = [...right];
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let row = 1; row <= a.length; row += 1) {
      const current = [row];
      for (let column = 1; column <= b.length; column += 1) {
        current[column] = Math.min(
          current[column - 1] + 1,
          previous[column] + 1,
          previous[column - 1] + (a[row - 1] === b[column - 1] ? 0 : 1),
        );
      }
      previous = current;
    }
    return previous[b.length];
  }

  function includesFuzzyToken(haystack, needle) {
    if (!needle || !haystack) return false;
    if (haystack.includes(needle)) return true;
    if (needle.length < 4) return false;
    for (const size of [needle.length - 1, needle.length, needle.length + 1]) {
      for (let start = 0; start <= haystack.length - size; start += 1) {
        if (editDistance(haystack.slice(start, start + size), needle) <= 1) return true;
      }
    }
    return false;
  }

  function broadcastCharacterLine(draft, session, text, actorId) {
    const scopeKey = chatScopeKey(session);
    const recipients = [session, ...fieldSessions(draft, session)];
    unique(recipients.map((candidate) => candidate.id)).forEach((candidateId) => {
      appendLog(draft.sessions[candidateId], "interaction", text, actorId, { scopeKey });
    });
  }

  function clearChatComposer(input) {
    ui.actionText = "";
    if (input) input.value = "";
  }

  function routeMatch(session, text) {
    const normalized = normalizedSearchText(text);
    return routesFrom(session.currentNode).find((route) => {
      const targetName = nodeDisplayName(route.to);
      const target = normalizedSearchText(targetName);
      const choice = normalizedSearchText(route.choice).replace(/으?로(이동|돌아가기)$/g, "");
      const wordTokens = targetName.split(/\s+/).map(normalizedSearchText).filter((token) => token.length >= 2);
      const tokens = [target, choice, target.replace(/^지하[12]층/, ""), ...wordTokens].filter((token) => token.length >= 2);
      return tokens.some((token) => includesFuzzyToken(normalized, token));
    });
  }

  function detailMatch(session, text) {
    const place = currentPlace(session);
    if (!place) return null;
    const normalized = String(text || "").replace(/\s+/g, "");
    return place.details.find((detail) => {
      const name = detail.name.replace(/\s+/g, "");
      const tokens = [name, ...detail.name.split(/\s+/)]
        .map((token) => token.replace(/[을를이가은는에서쪽]/g, ""))
        .filter((token) => token.length >= 2);
      return tokens.some((token) => normalized.includes(token));
    }) || null;
  }

  function objectMatch(session, text) {
    const place = currentPlace(session);
    if (!place) return null;
    const normalized = text.replace(/\s+/g, "");
    for (const detail of place.details) {
      for (const object of DATA.objectsByDetail[detail.id] || []) {
        const tokens = [object.name.replace(/\s+/g, ""), ...object.name.split(/\s+/)]
          .map((token) => token.replace(/[을를이가은는에서쪽]/g, ""))
          .filter((token) => token.length >= 2);
        if (tokens.some((token) => normalized.includes(token))) return object;
      }
    }
    return null;
  }

  function sceneObservationText(session, actorName, detail = null) {
    if (session.currentNode === "E_ENTRY") {
      return `${actorName}는 구역 경계에서 걸음을 멈추고 주변을 천천히 살핀다. 원형 지붕 아래로 오래된 환승 표지와 굳게 닫힌 출입 시설이 이어지고, 지상 환승광장 쪽으로 난 통로만이 어둠 속에 길게 남아 있다.`;
    }
    const place = currentPlace(session);
    if (!place) return `${actorName}는 발을 멈추고 주위를 살핀다. 겹친 빛과 오래된 먼지 사이로 지금 서 있는 공간의 윤곽이 희미하게 드러난다.`;
    if (detail) return `${actorName}는 ${detail.name} 쪽으로 시선을 좁힌다. ${detail.environment}`;
    const descriptions = place.details.map((item) => item.environment).filter(Boolean).join(" ");
    const light = DATA.variants[session.variant]?.light || "희미한 빛";
    return `${actorName}는 ${place.name} 한가운데에서 발을 멈추고 시야를 천천히 돌린다. ${light}이 공간의 모서리를 흐리게 물들이고 있다. ${descriptions}`;
  }

  function listeningText(session, actorName, text) {
    const clean = normalizeActionText(text);
    const encounter = session.activeEncounter;
    if (/(방송|잡음|스피커|안내\s*음성)/.test(clean)) {
      const hazardId = encounter?.hazards?.[encounter.currentIndex] || "";
      const distortion = hazardId === "HZ_STATION_11"
        ? "서로 다른 승강장 번호가 한 음절씩 겹쳐져, 어느 안내가 먼저 시작됐는지조차 가려지지 않는다."
        : "치직거리는 숨 사이로 닳아 없어진 듯한 몇 음절이 되풀이되지만, 온전한 문장이나 방향은 잡히지 않는다.";
      return `${actorName}는 움직임을 멈추고 희미한 방송 잡음에 귀를 기울인다. ${distortion}`;
    }
    if (/(발소리|인기척|목소리)/.test(clean)) {
      return `${actorName}는 숨을 낮추고 멀고 가까운 소리를 가려 듣는다. 금속 구조물을 타고 번지는 울림은 있지만, 곁으로 다가오는 일정한 발소리나 또렷한 목소리는 없다.`;
    }
    return `${actorName}는 눈을 움직이지 않은 채 주변의 소리에만 집중한다. 멀리서 금속이 식는 소리와 환풍 설비의 낮은 떨림이 서로 다른 방향에서 끊어져 들린다.`;
  }

  function selfStatusText(character, actorName) {
    const contamination = Number(character?.contamination) || 0;
    if (contamination <= 0) return `${actorName}는 소매를 걷어 손바닥과 팔 안쪽을 차례로 살핀다. 피부에는 흰 잔류물이나 젖은 자국이 없고, 호흡과 손끝의 감각도 평소와 다르지 않다.`;
    if (contamination < 10) return `${actorName}는 빛이 닿는 쪽으로 손과 소매를 돌려 본다. 피부 가장자리와 옷감에 엷은 흰 얼룩이 조금 번져 있지만, 통증이나 감각의 둔함은 아직 없다.`;
    if (contamination < 30) return `${actorName}는 손목에서 팔 안쪽까지 천천히 짚어 본다. 흰 얼룩이 피부 주름을 따라 남아 있고 손끝이 약간 서늘하지만, 움직임에는 지장이 없다.`;
    if (contamination < 60) return `${actorName}는 호흡을 고르며 피부와 옷자락의 변화를 살핀다. 말라붙은 흰 흔적이 여러 군데 이어지고 손끝의 감각도 전보다 둔해져 있다.`;
    return `${actorName}는 떨리는 손을 들어 피부 상태를 확인한다. 흰 잔류물이 넓게 번져 있고 감각이 늦게 돌아와, 손가락을 굽혔다 펴는 데에도 의식적으로 힘을 줘야 한다.`;
  }

  function waitingText(session, actorName, text) {
    const clean = normalizeActionText(text);
    const namedPerson = Object.values(DEMO_USERS).find((user) => clean.replace(/\s+/g, "").includes(user.name.replace(/\s+/g, "")) || clean.includes(user.loginId));
    if (namedPerson) return `${actorName}는 ${namedPerson.name}가 올 방향을 향해 발걸음을 멈춘다. 한동안 금속성 울림과 끊긴 방송만 지나가고, 아직 그 사람의 발소리나 목소리는 가까워지지 않는다.`;
    if (session.activeEncounter) return `${actorName}는 위험이 되풀이되는 간격을 놓치지 않도록 그 자리에서 숨을 고른다. 눈앞의 움직임은 아직 길을 내주지 않고 같은 주기로 통로를 가로지른다.`;
    return `${actorName}는 서두르지 않고 잠시 숨을 고른다. 멀리서 금속이 한 번 울리고 끊긴 방송이 천장을 스친 뒤, 다시 역사 안에 낮은 정적이 내려앉는다.`;
  }

  function irrelevantHazardActionText(session, actorName, text, executable = true) {
    const encounter = session.activeEncounter;
    const hazardId = encounter?.hazards?.[encounter.currentIndex] || "";
    const danger = HAZARD_PHENOMENA[hazardId] || encounter?.overview || "통로를 막은 위험이 계속 움직인다.";
    const action = executable ? actionAttemptSentence(actorName, text) : `${actorName}는 짧게 입을 열었다가 눈앞의 위험에 다시 시선을 붙든다.`;
    return `${action} ${danger} 그 행동만으로는 앞을 가로막은 위험이 걷히지 않아, 통로에 들어서지 않은 채 거리를 유지한다.`;
  }

  function hazardObservationText(session, actorName) {
    const encounter = session.activeEncounter;
    const hazardId = encounter?.hazards?.[encounter.currentIndex] || "";
    let clue = "움직임이 반복될 때마다 안전한 틈과 위험한 경계가 잠깐씩 드러난다.";
    if (hazardId.startsWith("HZ_TEMP")) clue = "잔상은 일정한 간격으로 흐려지고, 몇 차례마다 실체가 또렷해지는 짧은 공백이 생긴다.";
    else if (hazardId.startsWith("HZ_CONT") || hazardId.startsWith("HZ_WATER")) clue = "흰 잔류물은 낮고 젖은 곳을 따라 번지고 있으며, 마른 발판은 아직 몇 군데 남아 있다.";
    else if (hazardId.startsWith("HZ_STRUCT") || hazardId.startsWith("HZ_STATION")) clue = "흔들림과 파편이 잦아드는 순간마다 체중을 실어도 버틸 만한 지점이 드문드문 드러난다.";
    return `${actorName}는 움직이지 않은 채 통로의 변화를 살핀다. ${encounter?.overview || "통로의 상태가 불안정하게 흔들린다."} ${clue}`;
  }

  function hintResponseText(session, hazard = null) {
    if (hazard || session.activeEncounter) {
      return "잠시 숨을 죽이고 바라보자, 위험한 움직임이 잦아드는 순간과 오염이 닿지 않는 짧은 틈이 번갈아 드러난다.";
    }
    const routes = routesFrom(session.currentNode);
    const place = currentPlace(session);
    if (!routes.length) return "막힌 구조 사이를 다시 살피자, 가까운 조사 지점 몇 곳만이 손을 뻗을 수 있는 거리 안에 남아 있다.";
    const routeNames = routes.map((route) => nodeDisplayName(route.to));
    const routeCopy = routeNames.length === 1
      ? `${routeNames[0]} 쪽으로 이어지는 바닥 흔적이 한 줄로 남아 있다.`
      : `${routeNames.slice(0, -1).join(", ")}와 ${routeNames.at(-1)} 쪽으로 바닥의 닳은 동선선이 서로 갈라져 있다.`;
    const detailCopy = place?.details?.length ? ` 가까운 곳에는 ${place.details.map((detail) => detail.name).join(", ")}이 보인다.` : "";
    return `겹쳐 보이던 표지 사이에서 실제 먼지가 끊긴 방향과 오래 닳은 바닥선이 눈에 들어온다. ${routeCopy}${detailCopy}`;
  }

  function ambiguousMovementText(session, actorName) {
    const routes = routesFrom(session.currentNode);
    if (!routes.length) return `${actorName}는 앞으로 나아가려 했지만, 눈앞의 통로는 무너진 구조와 닫힌 문에 가로막혀 있다.`;
    const names = routes.map((route) => nodeDisplayName(route.to));
    if (names.length === 1) return `${actorName}가 발을 떼자 ${names[0]} 쪽으로 이어지는 길만이 어둠 속에서 또렷해진다.`;
    return `${actorName}가 발을 떼는 순간, ${names.slice(0, -1).join(", ")}와 ${names.at(-1)}로 향하는 통로가 서로 다른 방향으로 갈라진다. 어느 길을 택할지 정하기 전에는 발걸음을 옮기기 어렵다.`;
  }

  function actionAttemptSentence(actorName, text) {
    let action = String(text || "").trim().replace(/^\/+\s*/, "").replace(/[.!?]+$/, "");
    action = action.replace(/^(?:나는|내가|제가|난)\s+/, "");
    if (!action) return `${actorName}는 주변에 손을 뻗어 반응을 확인한다.`;
    const hasActionEnding = /(다|요|해|봐|보자|가자|기다려|멈춰|잡아|열어|닫아|눌러|밀어|당겨|려고|려 한다)$/.test(action);
    return hasActionEnding
      ? `${actorName}는 ${action}.`
      : `${actorName}는 ${action} 쪽으로 손과 몸을 움직인다.`;
  }

  function failureVariantIndex(session, text, size) {
    const previousFailures = (session?.logs || []).filter((entry) => entry.type === "fail").length;
    return (hashNumber(`${session?.currentNode || ""}:${text}`) + previousFailures) % size;
  }

  function inspectionTarget(text) {
    let target = String(text || "").trim().replace(/^\/+\s*/, "").replace(/[“”"'`]/g, "");
    target = target.replace(/^(?:나는|내가|제가|난)\s+/, "");
    target = target.replace(/\s*(?:을|를|은|는|이|가)?\s*(?:자세히\s*)?(?:조사(?:한다|해|하기)?|확인(?:한다|해|하기)?|관찰(?:한다|해|하기)?|살펴(?:본다|봐|보기)?|들여다(?:본다|봐|보기)?|읽어(?:본다|봐|보기)?|열어(?:본다|봐|보기)?|만져(?:본다|봐|보기)?|점검(?:한다|해|하기)?|본다|보다|봐|보자|훑어(?:본다|봐|보기)?).*$/u, "");
    target = target.replace(/[을를은는이가]$/u, "").trim();
    return target || "눈앞의 물건";
  }

  function mundaneInspectionText(session, actorName, text) {
    const target = inspectionTarget(text);
    const variants = [
      `${actorName}는 ${target} 쪽을 가까이 들여다본다. 낡은 사용 흔적만 남은 평범한 대상이다. 눈에 띄는 단서나 따로 조사할 만한 것은 보이지 않는다.`,
      `${actorName}가 ${target}에 시선을 두고 표면과 가장자리를 천천히 훑는다. 먼지와 오래된 자국 외에는 아무것도 없다. 지금 확인할 수 있는 특별한 정보도 없다.`,
      `${actorName}는 ${target} 주변까지 살펴보지만 구조나 상태는 일반적인 것과 다르지 않다. 숨겨진 틈이나 반응은 없고, 더 조사할 만한 부분도 찾지 못한다.`,
      `${actorName}가 ${target} 앞에서 잠시 멈춘다. 가까이서 보아도 그저 평범한 시설물일 뿐이다. 특이한 흔적이나 챙길 수 있는 물건은 없다.`,
    ];
    const index = (hashNumber(`${session?.currentNode || ""}:${target}`) + (session?.logs?.length || 0)) % variants.length;
    return variants[index];
  }

  function unknownActionText(session, actorName, text) {
    const attempt = actionAttemptSentence(actorName, text);
    let reasons;
    if (/(부르|외치|소리|대답|말을?\s*건)/.test(text)) {
      reasons = [
        "그러나 목소리는 빈 역사 안에서 몇 차례 메아리칠 뿐이다. 대답하는 인기척이 없어 대화는 이어지지 않는다.",
        "소리는 멀리까지 번지지만 돌아오는 것은 끊긴 방송 잡음뿐이다. 응답할 사람이 없어 아무 반응도 얻지 못한다.",
        "잠시 기다려도 발소리나 대답은 들리지 않는다. 주변에 의사를 주고받을 대상이 없어 행동은 여기서 끝난다.",
        "목소리가 벽과 천장에 부딪혀 흐려진다. 잠시 귀를 기울여도 사람의 대답은 돌아오지 않는다.",
      ];
    } else if (/(켜|꺼|누르|조작|작동|입력|충전|사용)/.test(text)) {
      reasons = [
        "그러나 조작부에는 전원이 들어오지 않고 눌린 부분도 곧 제자리로 돌아온다. 반응할 회로가 없어 장치는 작동하지 않는다.",
        "표시창과 버튼은 완전히 꺼져 있다. 전력이나 작동 신호가 남아 있지 않아 입력한 동작은 아무 결과도 만들지 못한다.",
        "몇 차례 조작해도 내부에서 기계음조차 들리지 않는다. 기능이 정지된 상태라 더 이상 진행할 수 없다.",
        "손끝의 움직임은 정확히 닿았지만 장치가 응답하지 않는다. 전원이 끊긴 탓에 기대한 기능은 실행되지 않는다.",
      ];
    } else if (/(밀|당기|돌리|열|닫|두드|부수|잡아|잡고)/.test(text)) {
      reasons = [
        "하지만 힘을 받아 움직일 틈이나 이음새가 보이지 않는다. 구조가 단단히 고정되어 있어 밀고 당겨도 형태가 변하지 않는다.",
        "손에 힘을 주는 순간 낡은 표면만 낮게 울린다. 걸쇠나 가동부가 맞물리지 않아 행동은 더 이어지지 못한다.",
        "붙잡을 곳은 있었지만 안쪽 구조가 완전히 굳어 있다. 힘이 전달되지 않아 열리거나 움직이는 부분은 없다.",
        "여러 각도로 힘을 바꾸어도 고정점이 꿈쩍하지 않는다. 현재 방법으로 움직일 수 없는 구조라 손을 놓을 수밖에 없다.",
      ];
    } else if (/(챙|가져|줍|집어|들고|꺼내)/.test(text)) {
      reasons = [
        "그러나 손에 넣을 수 있는 물건은 남아 있지 않다. 보이는 것은 고정된 부품뿐이라 가져갈 수 없다.",
        "손을 뻗은 자리에는 먼지와 빈 흔적만 남아 있다. 손가락에 잡히는 물건이 없어 빈손으로 돌아온다.",
        "가까이 확인해도 분리되는 물건이나 챙길 만한 것은 없다. 고정된 구조를 억지로 떼어낼 수도 없다.",
        "움직일 수 있는 물품을 찾지 못한다. 남은 것들은 시설에 단단히 붙어 있어 소지품으로 옮길 수 없다.",
      ];
    } else {
      reasons = [
        "그러나 손끝이 닿은 곳에서는 아무 반응도 돌아오지 않는다. 먼지만 얇게 밀려나고 나머지는 고요하다.",
        "움직임은 끝까지 이어졌지만 대상의 구조와 맞물리지 않는다. 변화를 일으킬 지점이 없어 아무 흔적도 남지 않는다.",
        "잠시 결과를 기다려도 빛과 먼지의 흐름만 이어진다. 현재 방식에 반응하는 대상이 없어 주변은 그대로 남는다.",
        "시선과 손끝이 닿은 범위에는 행동을 받아들일 부분이 없다. 방법과 대상이 맞지 않아 주변 상태는 변하지 않는다.",
      ];
    }
    return `${attempt} ${reasons[failureVariantIndex(session, text, reasons.length)]}`;
  }

  const ACTION_INTENTS = new Set([
    "MAP", "MOVE", "INSPECT_OBJECT", "OBSERVE_DETAIL", "OBSERVE_SCENE",
    "MUNDANE_INSPECTION", "NAVIGATION_HINT", "LISTEN", "CHECK_SELF", "WAIT", "HAZARD_RESPONSE", "OTHER",
  ]);
  const ACTION_SUBJECTS = new Set(["SELF", "ENVIRONMENT", "OBJECT", "PERSON", "UNKNOWN"]);
  const SENSORY_MODES = new Set(["LISTEN", "LOOK", "TOUCH", "MOVE", "OTHER"]);
  const HAZARD_RELEVANCE = new Set(["RELEVANT", "IRRELEVANT", "NONE"]);

  function localActionAnalysis(session, text, result) {
    const clean = normalizeActionText(text);
    const selfCheck = isSelfCheckAction(clean);
    const listening = isListeningAction(clean);
    let actionSubject = selfCheck ? "SELF" : listening ? "ENVIRONMENT" : result.intent === "INSPECT_OBJECT" ? "OBJECT" : "ENVIRONMENT";
    if (/(기다리|부르|따라가).*(?:캐릭터|사람)|(?:캐릭터|사람).*(기다리|부르|따라가)/.test(clean)) actionSubject = "PERSON";
    const sensoryMode = listening ? "LISTEN" : selfCheck || isObservationAction(clean) || isInspectionAction(clean) ? "LOOK" : isMovementAction(clean) ? "MOVE" : /(만지|닦|누르|잡|밀|당기)/.test(clean) ? "TOUCH" : "OTHER";
    const hazardRelevance = session.activeEncounter
      ? (result.intent === "HAZARD_RESPONSE" && isHazardResponseAction(session, clean) ? "RELEVANT" : "IRRELEVANT")
      : "NONE";
    const targetText = selfCheck ? "자신의 상태" : listening ? (clean.match(/(?:방송\s*잡음|방송|잡음|발소리|소리|기계음)/)?.[0] || "주변의 소리") : clean.slice(0, 120);
    return { actionSubject, sensoryMode, targetText, hazardRelevance, executable: clean.length > 1 };
  }

  function localActionInterpretation(session, text) {
    let result;
    if (isMapRequest(text)) result = { intent: "MAP", targetId: "", normalizedAction: "구역 지도를 확인한다", confidence: 1 };
    else if (isNavigationHintRequest(text)) result = { intent: "NAVIGATION_HINT", targetId: "", normalizedAction: text, confidence: 0.98 };
    else if (isSelfCheckAction(text)) result = { intent: "CHECK_SELF", targetId: "", normalizedAction: text, confidence: 0.99 };
    else if (isListeningAction(text)) result = { intent: "LISTEN", targetId: "", normalizedAction: text, confidence: 0.99 };
    const route = routeMatch(session, text);
    const destination = destinationMatch(text);
    const object = objectMatch(session, text);
    const detail = detailMatch(session, text);
    if (!result && session.activeEncounter) {
      if (isObservationAction(text)) result = { intent: "OBSERVE_SCENE", targetId: "", normalizedAction: text, confidence: 0.95 };
      else if (isHazardResponseAction(session, text)) result = { intent: "HAZARD_RESPONSE", targetId: "", normalizedAction: text, confidence: 0.78 };
      else if (isWaitAction(text)) result = { intent: "WAIT", targetId: "", normalizedAction: text, confidence: 0.96 };
      else result = { intent: "OTHER", targetId: "", normalizedAction: text, confidence: 0.48 };
    }
    if (!result && object && isInspectionAction(text)) result = { intent: "INSPECT_OBJECT", targetId: object.id, normalizedAction: text, confidence: 0.98 };
    if (!result && detail && (isObservationAction(text) || isInspectionAction(text))) result = { intent: "OBSERVE_DETAIL", targetId: detail.id, normalizedAction: text, confidence: 0.96 };
    if (!result && isObservationAction(text)) result = { intent: "OBSERVE_SCENE", targetId: "", normalizedAction: text, confidence: 0.95 };
    if (!result && isInspectionAction(text)) result = { intent: "MUNDANE_INSPECTION", targetId: "", normalizedAction: text, confidence: 0.9 };
    if (!result && isMovementAction(text)) result = { intent: "MOVE", targetId: route?.id || "", destinationNodeId: destination?.id || route?.to || "", normalizedAction: text, confidence: route || destination ? 0.98 : 0.58 };
    if (!result && isWaitAction(text)) result = { intent: "WAIT", targetId: "", normalizedAction: text, confidence: 0.96 };
    const interpreted = result || { intent: "OTHER", targetId: "", normalizedAction: text, confidence: 0.2 };
    return { ...withLocalItemUse(interpreted, text), ...localActionAnalysis(session, text, interpreted), destinationNodeId: interpreted.destinationNodeId || (interpreted.intent === "MOVE" ? destination?.id || "" : "") };
  }

  function shouldUseAI(session, interpretation) {
    if (typeof fetch !== "function" || ui.aiAvailable === false) return false;
    return interpretation.intent !== "MAP";
  }

  function actionAIContext(session) {
    const place = currentPlace(session);
    const details = (place?.details || []).map((detail) => ({ id: detail.id, name: detail.name }));
    const objects = (place?.details || []).flatMap((detail) => (DATA.objectsByDetail[detail.id] || []).map((object) => ({ id: object.id, name: object.name })));
    const encounter = session.activeEncounter;
    const hazardId = encounter?.hazards?.[encounter.currentIndex] || "";
    const currentDetail = session.currentDetailId ? findDetail(session.currentDetailId)?.name || "" : "";
    const visibleSituation = encounter
      ? `${encounter.overview || ""} ${HAZARD_PHENOMENA[hazardId] || DATA.hazardTemplates[hazardId]?.name || ""}`
      : (place?.details || []).map((detail) => `${detail.name}: ${detail.environment || ""}`).join(" ");
    const inventory = inventoryItemEntries(currentCharacter()).map((item) => ({
      id: item.itemId,
      name: item.name,
      state: item.state || "CLEAN",
      quantity: item.quantity,
      tags: [...inferredItemTags(item)],
      primary: item.catalog?.primary || "",
      secondary: item.catalog?.secondary || "",
    }));
    return {
      phase: encounter ? "hazard" : "scene",
      currentLocation: nodeDisplayName(session.currentNode),
      currentDetail,
      visibleSituation,
      routes: routesFrom(session.currentNode).map((route) => ({ id: route.id, name: `${nodeDisplayName(route.to)} · ${route.choice} · ${route.narration || ""}` })),
      destinations: navigableDestinations().map((destination) => ({ id: destination.id, name: destination.name })),
      details,
      objects,
      inventory,
      characterStatus: {
        contamination: Number(currentCharacter()?.contamination) || 0,
        symptom: String(currentCharacter()?.symptom || "NONE"),
      },
      recentSystem: systemLogEntries(session).slice(-8).map((entry) => entry.text),
    };
  }

  function validateAIInterpretation(value, session, fallback) {
    if (!value || !ACTION_INTENTS.has(value.intent)) return fallback;
    const destinationNodeId = navigableDestinations().some((destination) => destination.id === fallback.destinationNodeId) ? fallback.destinationNodeId : "";
    const intent = fallback.intent === "MOVE" && destinationNodeId ? "MOVE" : value.intent;
    const routeIds = new Set(routesFrom(session.currentNode).map((route) => route.id));
    const place = currentPlace(session);
    const detailIds = new Set((place?.details || []).map((detail) => detail.id));
    const objectIds = new Set((place?.details || []).flatMap((detail) => (DATA.objectsByDetail[detail.id] || []).map((object) => object.id)));
    let targetId = String(value.targetId || "").slice(0, 80);
    if (intent === "MOVE" && targetId && !routeIds.has(targetId)) targetId = "";
    if (intent === "MOVE" && targetId && destinationNodeId && DATA.routes.find((route) => route.id === targetId)?.to !== destinationNodeId) targetId = "";
    if (intent === "OBSERVE_DETAIL" && targetId && !detailIds.has(targetId)) targetId = "";
    if (intent === "INSPECT_OBJECT" && targetId && !objectIds.has(targetId)) targetId = "";
    const confidence = Math.max(0, Math.min(1, Number(value.confidence) || 0));
    if (confidence < 0.42) return fallback;
    const fallbackItemName = String(fallback.usedItemName || "").trim();
    const usedItemName = String(value.usedItemName || fallbackItemName).trim().slice(0, 120);
    const inventoryIds = new Set(inventoryItemEntries(currentCharacter()).map((item) => item.itemId));
    let usedItemId = String(value.usedItemId || fallback.usedItemId || "").trim().slice(0, 80);
    if (usedItemId && !inventoryIds.has(usedItemId)) usedItemId = "";
    let itemUseFit = ITEM_USE_FITS.has(value.itemUseFit) ? value.itemUseFit : fallback.itemUseFit || "NONE";
    let itemUseReason = String(value.itemUseReason || fallback.itemUseReason || "").trim().slice(0, 240);
    if (!usedItemName) {
      usedItemId = "";
      itemUseFit = "NONE";
      itemUseReason = "";
    } else if (!usedItemId) {
      itemUseFit = "MISSING";
    }
    let hazardRelevance = HAZARD_RELEVANCE.has(value.hazardRelevance) ? value.hazardRelevance : fallback.hazardRelevance;
    if (!session.activeEncounter) hazardRelevance = "NONE";
    if (session.activeEncounter && intent !== "HAZARD_RESPONSE") hazardRelevance = "IRRELEVANT";
    return {
      intent,
      targetId,
      destinationNodeId,
      normalizedAction: String(value.normalizedAction || fallback.normalizedAction || "").trim().slice(0, 240),
      confidence,
      usedItemName,
      usedItemId,
      itemUseFit,
      itemUseReason,
      actionSubject: ACTION_SUBJECTS.has(value.actionSubject) ? value.actionSubject : fallback.actionSubject,
      sensoryMode: SENSORY_MODES.has(value.sensoryMode) ? value.sensoryMode : fallback.sensoryMode,
      targetText: String(value.targetText || fallback.targetText || "").trim().slice(0, 160),
      hazardRelevance,
      executable: typeof value.executable === "boolean" ? value.executable : fallback.executable,
    };
  }

  function updateAIStatusElements() {
    const status = document.querySelector("[data-ai-status]");
    if (!status) return;
    status.classList?.toggle?.("is-ai-ready", ui.aiAvailable === true);
    status.textContent = ui.aiPending
      ? "AI가 행동 뜻을 판정하는 중..."
      : ui.aiAvailable === true
        ? "AI 자유문장 판정 · /행동"
        : ui.aiAvailable === false
          ? "로컬 판정 대기 · /행동"
          : "AI 연결 확인 중 · /행동";
  }

  function setAIPending(pending, sessionId) {
    ui.aiPending = pending;
    const input = document.querySelector("[data-chat-input]");
    const button = document.querySelector("[data-send-chat]");
    const latestSession = loadState().sessions[sessionId];
    if (input) {
      input.disabled = pending || Boolean(latestSession?.movement);
      if (pending) input.placeholder = "AI가 행동 문장을 읽고 있습니다...";
    }
    if (button) {
      button.disabled = pending || Boolean(latestSession?.movement);
      button.textContent = pending ? "판정 중" : "전송 ↵";
    }
    updateAIStatusElements();
  }

  async function requestAIInterpretation(session, text, fallback) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timeout = controller ? setTimeout(() => controller.abort(), 17_000) : null;
    try {
      const response = await fetch("/api/interpret-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, context: actionAIContext(session) }),
        signal: controller?.signal,
      });
      if (response.status === 503) ui.aiAvailable = false;
      if (!response.ok) throw new Error(`AI_HTTP_${response.status}`);
      const value = await response.json();
      ui.aiAvailable = true;
      return validateAIInterpretation(value, session, fallback);
    } catch {
      return fallback;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  function queueActionNarration(session, entry, text, interpretation, event = {}) {
    if (ui.aiAvailable !== true || !entry?.id) return;
    pendingNarrationJobs.push({
      sessionId: session.id,
      logId: entry.id,
      text,
      interpretation,
      event: { ...event, fallback: entry.text },
      context: actionAIContext(session),
    });
  }

  async function flushPendingNarrations() {
    if (narrationFlushActive || !pendingNarrationJobs.length) return;
    narrationFlushActive = true;
    try {
      while (pendingNarrationJobs.length) {
        const job = pendingNarrationJobs.shift();
        try {
          const response = await fetch("/api/narrate-action", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(job),
          });
          if (!response.ok) throw new Error(`NARRATION_HTTP_${response.status}`);
          const value = await response.json();
          const narration = String(value.narration || "").trim().slice(0, 1200);
          if (!narration) throw new Error("NARRATION_EMPTY");
          requestLatestLogScroll({ system: true });
          mutate("ai-action-narration", (draft) => {
            const current = draft.sessions[job.sessionId];
            const log = current?.logs?.find((entry) => entry.id === job.logId);
            if (!log || log.aiNarrationFinal) return;
            log.text = narration;
            log.aiNarrationFinal = true;
          });
        } catch {
          // 로컬 결과문을 그대로 유지합니다.
        }
      }
    } finally {
      narrationFlushActive = false;
    }
  }

  function applyActionInterpretation(sessionId, text, interpretation) {
    state = loadState();
    const session = state.sessions[sessionId];
    if (!session || session.movement) return;
    requestLatestLogScroll({ system: true });
    const uid = currentUserId();
    const actorName = DEMO_USERS[uid].name;
    const normalizedText = interpretation.normalizedAction || text;
    const record = (current, type, copy, event = {}) => {
      const entry = appendLog(current, type, copy);
      queueActionNarration(current, entry, text, interpretation, event);
      return entry;
    };
    const itemUse = evaluateItemUse(state.characters[uid], text, interpretation);
    if (itemUse && itemUse.status !== "usable") {
      mutate("item-use-rejected", (draft) => {
        const current = draft.sessions[sessionId];
        if (current) record(current, "fail", itemUseFailureText(current, actorName, text, itemUse), { kind: "ITEM_UNAVAILABLE", outcome: "NO_PROGRESS", itemUse });
      });
      return;
    }
    const itemLead = itemUseLeadText(actorName, text, itemUse);
    const narrated = (result) => itemLead ? `${itemLead} ${result}` : result;

    if (interpretation.intent === "MAP") {
      mutate("map-request", (draft) => {
        const current = draft.sessions[sessionId];
        if (current) appendLog(current, "scene", `${actorName}는 접힌 해오름역 구역 지도를 펼쳐 현재 위치와 연결 통로를 대조한다.`);
      });
      showMapModal(sessionId);
      return;
    }

    if (session.activeEncounter) {
      if (interpretation.intent === "NAVIGATION_HINT") {
        mutate("hazard-hint", (draft) => {
          const current = draft.sessions[sessionId];
          current.choiceReveal = { type: "hazard", at: Date.now(), actorId: uid };
          const hazardId = current.activeEncounter?.hazards?.[current.activeEncounter.currentIndex];
          record(current, "scene", hintResponseText(current, hazardId ? DATA.hazardTemplates[hazardId] : null), { kind: "HAZARD_HINT", outcome: "NO_PROGRESS", hazardId });
        });
        return;
      }
      if (interpretation.intent === "LISTEN") {
        mutate("listen-during-hazard", (draft) => {
          const current = draft.sessions[sessionId];
          const hazardId = current.activeEncounter?.hazards?.[current.activeEncounter.currentIndex] || "";
          record(current, "scene", narrated(listeningText(current, actorName, normalizedText)), { kind: "LISTEN", outcome: "NO_PROGRESS", hazardId, sensoryMode: "LISTEN" });
        });
        return;
      }
      if (interpretation.intent === "CHECK_SELF") {
        mutate("self-check-during-hazard", (draft) => {
          const current = draft.sessions[sessionId];
          const character = draft.characters[uid];
          const hazardId = current.activeEncounter?.hazards?.[current.activeEncounter.currentIndex] || "";
          record(current, "scene", selfStatusText(character, actorName), { kind: "CHECK_SELF", outcome: "NO_PROGRESS", hazardId, contamination: character.contamination, symptom: character.symptom });
        });
        return;
      }
      if (interpretation.intent === "WAIT") {
        mutate("wait-during-hazard", (draft) => {
          const current = draft.sessions[sessionId];
          const hazardId = current.activeEncounter?.hazards?.[current.activeEncounter.currentIndex] || "";
          record(current, "scene", waitingText(current, actorName, normalizedText), { kind: "WAIT", outcome: "NO_PROGRESS", hazardId });
        });
        return;
      }
      if (["OBSERVE_SCENE", "OBSERVE_DETAIL", "INSPECT_OBJECT", "MUNDANE_INSPECTION"].includes(interpretation.intent)) {
        mutate("observe-hazard", (draft) => {
          const current = draft.sessions[sessionId];
          const hazardId = current.activeEncounter?.hazards?.[current.activeEncounter.currentIndex] || "";
          record(current, "scene", narrated(hazardObservationText(current, actorName)), { kind: "OBSERVE_HAZARD", outcome: "NO_PROGRESS", hazardId });
        });
        return;
      }
      if (interpretation.intent === "HAZARD_RESPONSE" && interpretation.hazardRelevance === "RELEVANT" && interpretation.executable !== false) {
        return resolveHazard(sessionId, text, false, itemUse, interpretation);
      }
      mutate("irrelevant-hazard-action", (draft) => {
        const current = draft.sessions[sessionId];
        const hazardId = current.activeEncounter?.hazards?.[current.activeEncounter.currentIndex] || "";
        record(current, "fail", irrelevantHazardActionText(current, actorName, normalizedText, interpretation.executable !== false), { kind: "IRRELEVANT_HAZARD_ACTION", outcome: "NO_PROGRESS", hazardId });
      });
      return;
    }

    if (interpretation.intent === "INSPECT_OBJECT") {
      const object = findObject(interpretation.targetId);
      if (object) {
        mutate("chat-inspect-object", (draft) => {
          const current = draft.sessions[sessionId];
          if (!current.inspectedObjectIds.includes(object.id)) current.inspectedObjectIds.push(object.id);
          record(current, "scene", narrated(`${actorName}는 ${object.name} 앞에 몸을 낮추고 세부를 확인한다. ${object.result} ${objectItemFindingText(draft, current, object.id)}`), { kind: "INSPECT_OBJECT", outcome: "OBSERVED", objectId: object.id, objectName: object.name });
          current.choiceReveal = null;
        });
        showObjectModal(object.id);
        return;
      }
    }

    if (interpretation.intent === "OBSERVE_DETAIL") {
      const detail = findDetail(interpretation.targetId);
      mutate("chat-observe-detail", (draft) => {
        const current = draft.sessions[sessionId];
        record(current, "scene", narrated(sceneObservationText(current, actorName, detail)), { kind: "OBSERVE_DETAIL", outcome: "OBSERVED", detailId: detail?.id || "", detailName: detail?.name || "" });
      });
      return;
    }

    if (interpretation.intent === "OBSERVE_SCENE") {
      mutate("chat-observe-scene", (draft) => {
        const current = draft.sessions[sessionId];
        record(current, "scene", narrated(sceneObservationText(current, actorName)), { kind: "OBSERVE_SCENE", outcome: "OBSERVED" });
      });
      return;
    }

    if (interpretation.intent === "MUNDANE_INSPECTION") {
      mutate("mundane-inspection", (draft) => {
        const current = draft.sessions[sessionId];
        record(current, "scene", narrated(mundaneInspectionText(current, actorName, normalizedText)), { kind: "MUNDANE_INSPECTION", outcome: "NOTHING_FOUND" });
      });
      return;
    }

    if (interpretation.intent === "NAVIGATION_HINT") {
      mutate("chat-hint", (draft) => {
        const current = draft.sessions[sessionId];
        current.choiceReveal = { type: "context", at: Date.now(), actorId: uid };
        record(current, "scene", hintResponseText(current), { kind: "NAVIGATION_HINT", outcome: "NO_PROGRESS" });
      });
      return;
    }

    if (interpretation.intent === "MOVE") {
      const actionContext = { actionText: text, itemUse };
      const destinationNodeId = interpretation.destinationNodeId || "";
      if (destinationNodeId === session.currentNode) {
        mutate("already-at-destination", (draft) => {
          const current = draft.sessions[sessionId];
          current.choiceReveal = null;
          appendLog(current, "scene", alreadyAtLocationText(actorName, destinationNodeId));
        });
        return;
      }
      if (interpretation.targetId) return beginMove(sessionId, interpretation.targetId, actionContext);
      const directRoute = destinationNodeId ? routesFrom(session.currentNode).find((route) => route.to === destinationNodeId) : null;
      if (directRoute) return beginMove(sessionId, directRoute.id, actionContext);
      if (destinationNodeId) {
        mutate("route-guidance", (draft) => {
          const current = draft.sessions[sessionId];
          current.choiceReveal = null;
          appendLog(current, "scene", routeGuidanceText(actorName, current.currentNode, destinationNodeId));
        });
        return;
      }
      const routes = routesFrom(session.currentNode);
      if (routes.length === 1) return beginMove(sessionId, routes[0].id, actionContext);
      mutate("ambiguous-movement", (draft) => {
        const current = draft.sessions[sessionId];
        current.choiceReveal = { type: "context", at: Date.now(), actorId: uid };
        record(current, "scene", narrated(ambiguousMovementText(current, actorName)), { kind: "AMBIGUOUS_MOVE", outcome: "NO_PROGRESS" });
      });
      return;
    }

    if (interpretation.intent === "LISTEN") {
      mutate("listen-action", (draft) => {
        const current = draft.sessions[sessionId];
        record(current, "scene", narrated(listeningText(current, actorName, normalizedText)), { kind: "LISTEN", outcome: "HEARD", sensoryMode: "LISTEN" });
      });
      return;
    }

    if (interpretation.intent === "CHECK_SELF") {
      mutate("self-check-action", (draft) => {
        const current = draft.sessions[sessionId];
        const character = draft.characters[uid];
        record(current, "scene", selfStatusText(character, actorName), { kind: "CHECK_SELF", outcome: "OBSERVED", contamination: character.contamination, symptom: character.symptom });
      });
      return;
    }

    if (interpretation.intent === "WAIT") {
      mutate("wait-action", (draft) => {
        const current = draft.sessions[sessionId];
        record(current, "scene", narrated(waitingText(current, actorName, normalizedText)), { kind: "WAIT", outcome: "WAITED" });
      });
      return;
    }

    mutate("unknown-action", (draft) => {
      const current = draft.sessions[sessionId];
      record(current, "fail", narrated(unknownActionText(current, actorName, normalizedText)), { kind: "OTHER", outcome: "NO_PROGRESS" });
    });
  }

  function handleChatInput(sessionId) {
    if (ui.aiPending) return;
    const input = document.querySelector("[data-chat-input]");
    const rawText = String(input?.value || "").trim();
    if (!rawText) return toast("입력 내용을 확인해 주세요.", "대화나 행동을 입력해 주세요.", "error");
    const session = loadState().sessions[sessionId];
    if (!session) return;
    const uid = currentUserId();
    const isSystemAction = rawText.startsWith("/");
    const text = isSystemAction ? rawText.replace(/^\/+\s*/, "").trim() : rawText;
    if (isSystemAction && !text) return toast("행동 내용을 입력해 주세요.", "/ 뒤에 시스템이 판정할 행동을 적어 주세요.", "error");
    if (session.movement && !isMapRequest(text)) return;
    if (isSystemAction && isMultiAction(text)) return toast("ONE_ACTION_ONLY", "한 번의 /행동에는 한 가지 행동만 입력할 수 있습니다.", "error");

    if (isSystemAction) {
      clearChatComposer(input);
      requestLatestLogScroll({ system: true });
      mutate("action-input", (draft) => {
        const current = draft.sessions[sessionId];
        if (current) appendActionInput(current, text, uid);
      });
    }

    if (isMapRequest(text)) {
      if (!isSystemAction) {
        clearChatComposer(input);
        requestLatestLogScroll({ chat: true, system: false });
        mutate("map-chat", (draft) => {
          const current = draft.sessions[sessionId];
          if (current) broadcastCharacterLine(draft, current, text, uid);
        });
      }
      return applyActionInterpretation(sessionId, text, localActionInterpretation(session, text));
    }

    // 일반 대화는 행동 판정을 발생시키지 않는다.
    // 단, 길을 잃었거나 다음 행동을 묻는 명백한 표현은 '힌트 요청'으로만 해석해 선택지를 연다.
    if (!isSystemAction) {
      clearChatComposer(input);
      requestLatestLogScroll({ chat: true, system: isNavigationHintRequest(text) });
      mutate("field-chat", (draft) => {
        const current = draft.sessions[sessionId];
        if (!current || current.movement) return;
        broadcastCharacterLine(draft, current, text, uid);
        if (isNavigationHintRequest(text)) {
          current.choiceReveal = { type: current.activeEncounter ? "hazard" : "context", at: Date.now(), actorId: uid };
          const currentHazardId = current.activeEncounter?.hazards?.[current.activeEncounter.currentIndex];
          appendLog(current, "scene", hintResponseText(current, currentHazardId ? DATA.hazardTemplates[currentHazardId] : null));
        }
      });
      return;
    }

    const localInterpretation = localActionInterpretation(session, text);
    if (!shouldUseAI(session, localInterpretation)) return applyActionInterpretation(sessionId, text, localInterpretation);

    setAIPending(true, sessionId);
    requestAIInterpretation(session, text, localInterpretation)
      .then((interpretation) => {
        setAIPending(false, sessionId);
        applyActionInterpretation(sessionId, text, interpretation);
      })
      .catch(() => {
        setAIPending(false, sessionId);
        applyActionInterpretation(sessionId, text, localInterpretation);
      });
  }

  function bindInvestigation(session) {
    document.querySelectorAll("[data-tab]").forEach((element) => element.addEventListener("click", () => { ui.tab = element.dataset.tab; render(); }));
    const chatInput = document.querySelector("[data-chat-input]");
    chatInput?.addEventListener("compositionstart", () => { ui.isComposing = true; });
    chatInput?.addEventListener("compositionend", (event) => {
      ui.isComposing = false;
      ui.actionText = event.target.value;
      if (ui.pendingExternalRender) {
        ui.pendingExternalRender = false;
        render();
      }
    });
    chatInput?.addEventListener("input", (event) => { ui.actionText = event.target.value; });
    chatInput?.addEventListener("keydown", (event) => {
      if (event.isComposing || ui.isComposing) return;
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); handleChatInput(session.id); }
    });
    document.querySelector("[data-send-chat]")?.addEventListener("click", () => handleChatInput(session.id));
    document.querySelector("[data-open-map]")?.addEventListener("click", () => showMapModal(session.id));
    document.querySelector("[data-open-choice-panel]")?.addEventListener("click", () => { ui.choicePanelOpen = true; render(); });
    document.querySelector("[data-close-choice-panel]")?.addEventListener("click", () => { ui.choicePanelOpen = false; render(); });
    document.querySelectorAll("[data-suggested-action]").forEach((element) => element.addEventListener("click", () => { ui.actionText = `/${String(element.dataset.suggestedAction || "").replace(/^\/+/, "")}`; ui.choicePanelOpen = false; render(); const input = document.querySelector("[data-chat-input]"); if (input) { input.value = ui.actionText; input.focus(); } }));
    document.querySelectorAll("[data-move-route]").forEach((element) => element.addEventListener("click", () => { ui.choicePanelOpen = false; beginMove(session.id, element.dataset.moveRoute); }));
    document.querySelectorAll("[data-detail]").forEach((element) => element.addEventListener("click", () => {
      const detailId = element.dataset.detail;
      ui.selectedDetailId = detailId;
      mutate("enter-detail", (draft) => {
        const current = draft.sessions[session.id];
        if (!current || current.movement || current.activeEncounter) return;
        current.currentDetailId = detailId;
        appendChatDivider(current, `detail:${current.currentNode}:${detailId}`, chatScopeLabel(`detail:${current.currentNode}:${detailId}`));
      });
    }));
    document.querySelectorAll("[data-inspect-object]").forEach((element) => element.addEventListener("click", () => inspectObject(session.id, element.dataset.inspectObject)));
    document.querySelectorAll("[data-take-item]").forEach((element) => element.addEventListener("click", () => { const [objectId, itemId] = element.dataset.takeItem.split("|"); takeItem(session.id, objectId, itemId); }));
    document.querySelectorAll("[data-item-modal]").forEach((element) => element.addEventListener("click", () => showItemModal(element.dataset.itemModal)));
    document.querySelector("[data-transfer-item-button]")?.addEventListener("click", () => transferFieldItem(session.id));
    document.querySelector("[data-end-session]")?.addEventListener("click", () => endSession(session.id));
  }

  function findObject(objectId) {
    for (const objects of Object.values(DATA.objectsByDetail)) {
      const found = objects.find((o) => o.id === objectId);
      if (found) return found;
    }
    return null;
  }

  function beginMove(sessionId, routeId, actionContext = null) {
    const uid = currentUserId();
    mutate("begin-move", (draft) => {
      const session = draft.sessions[sessionId];
      const route = DATA.routes.find((candidate) => candidate.id === routeId);
      if (!session || !route || session.activeEncounter || session.movement) return;
      if (route.from !== session.currentNode) {
        appendLog(session, "fail", `${DEMO_USERS[uid].name}는 ${nodeDisplayName(route.to)} 방향으로 이동하려 한다. 그러나 눈앞의 통로는 그 장소와 이어져 있지 않아 발을 옮길 수 없다.`);
        return;
      }
      notifyDeparture(draft, session, route);
      session.choiceReveal = null;
      session.movement = {
        token: id("move"), routeId: route.id, fromNode: route.from, targetNode: route.to,
        actorId: uid, startedAt: Date.now(), resolveAt: Date.now() + MOVE_DELAY_MS,
        actionText: actionContext?.actionText || "",
        itemUse: actionContext?.itemUse?.status === "usable" ? {
          itemId: actionContext.itemUse.itemId,
          mentionedName: actionContext.itemUse.mentionedName,
          item: {
            itemId: actionContext.itemUse.item?.itemId || actionContext.itemUse.itemId,
            name: actionContext.itemUse.item?.name || actionContext.itemUse.mentionedName,
          },
        } : null,
      };
    });
    const movingSession = loadState().sessions[sessionId];
    if (movingSession?.movement?.routeId === routeId) toast("이동 중...", `${nodeDisplayName(movingSession.movement.fromNode)}에서 ${nodeDisplayName(movingSession.movement.targetNode)} 방향으로 이동하고 있습니다.`);
  }

  function isMultiAction(text) {
    return /(그리고|동시에|한 뒤|후에|,|;|\+| 및 )/.test(text.trim());
  }

  function deterministicDelta(ruleId, seed) {
    const rule = DATA.contaminationRules[ruleId] || DATA.contaminationRules.EXP_CONTACT_NONE;
    if (!rule || rule.max <= 0) return 0;
    return rule.min + (hashNumber(seed) % (rule.max - rule.min + 1));
  }

  function resolveHazard(sessionId, forcedText = null, alreadyLogged = false, itemUse = null, interpretation = null) {
    const text = String(forcedText ?? (document.querySelector("[data-chat-input]")?.value || "")).trim();
    const selectedItemId = itemUse?.itemId || ui.selectedItemId || "";
    if (!text) return toast("행동을 입력해 주세요.", "한 가지 행동을 구체적으로 적어 주세요.", "error");
    if (isMultiAction(text)) return toast("ONE_ACTION_ONLY", "한 채팅에는 한 가지 행동만 입력할 수 있습니다.", "error");
    const uid = currentUserId();
    requestLatestLogScroll({ system: true });
    mutate("resolve-hazard", (draft) => {
      const session = draft.sessions[sessionId];
      const encounter = session?.activeEncounter;
      if (!encounter) return;
      const hazardId = encounter.hazards[encounter.currentIndex];
      const hazard = DATA.hazardTemplates[hazardId];
      const lower = text.toLowerCase();
      const risky = /(뛰|달려|맨손|무시|강하게 밀|밟고|잡고 버틴|그냥 간)/.test(lower);
      const safe = hazard.safeKeywords.some((keyword) => lower.includes(keyword.toLowerCase()));
      const hasItem = selectedItemId && draft.characters[uid].inventory[selectedItemId]?.quantity > 0;
      const outcome = risky ? "FAIL" : safe || hasItem ? "SUCCESS" : "PARTIAL";
      let ruleId = "EXP_CONTACT_NONE";
      if (outcome === "PARTIAL") ruleId = "EXP_CONTACT_LOW";
      if (outcome === "FAIL") ruleId = hazard.failRule || "EXP_CONTACT_MEDIUM";
      if (hasItem && outcome !== "FAIL") ruleId = "EXP_ITEM_ONLY";
      const delta = deterministicDelta(ruleId, `${sessionId}:${hazardId}:${text}:${encounter.currentIndex}`);
      session.choiceReveal = null;
      const character = draft.characters[uid];
      character.contamination = clamp(character.contamination + delta, 0, 100);
      character.symptom = contaminationStage(character.contamination);
      if (hasItem && ruleId === "EXP_ITEM_ONLY") character.inventory[selectedItemId].state = "CONTAMINATED";
      encounter.resolutions.push({ hazardId, actorId: uid, text, selectedItemId: selectedItemId || null, outcome, ruleId, delta });
      let resultText = actionResolutionText(DEMO_USERS[uid].name, text, outcome, hazardId, delta, `${session.id}:${encounter.currentIndex}:${encounter.resolutions.length}:${session.logs.length}`, itemUse);
      encounter.currentIndex += 1;
      if (encounter.currentIndex >= encounter.hazards.length) {
        const arrival = applyArrival(draft, session, encounter.targetNode, encounter.ambientRuleId);
        resultText += ` ${arrival}`;
        session.activeEncounter = null;
      } else {
        const nextHazardId = encounter.hazards[encounter.currentIndex];
        resultText += ` 이어서 ${HAZARD_PHENOMENA[nextHazardId] || DATA.hazardTemplates[nextHazardId]?.name}`;
      }
      const entry = appendLog(session, outcome === "FAIL" ? "fail" : "success", resultText);
      queueActionNarration(session, entry, text, interpretation || localActionInterpretation(session, text), {
        kind: "HAZARD_RESPONSE",
        outcome,
        hazardId,
        contaminationDelta: delta,
        contaminationAfter: character.contamination,
        arrived: !session.activeEncounter,
        currentLocation: nodeDisplayName(session.currentNode),
      });
    });
    ui.actionText = "";
    ui.selectedItemId = "";
  }

  function sendFieldMessage(sessionId) {
    const text = String(document.querySelector("[data-field-message]")?.value || "").trim();
    if (!text) return toast("대화 내용을 입력해 주세요.", "같은 현장에 있는 인물에게 전달할 말을 적어 주세요.", "error");
    const uid = currentUserId();
    mutate("field-message", (draft) => {
      const session = draft.sessions[sessionId];
      if (!session || session.movement) return;
      const scopeKey = chatScopeKey(session);
      const recipients = [session, ...fieldSessions(draft, session)];
      unique(recipients.map((candidate) => candidate.id)).forEach((candidateId) => {
        appendLog(draft.sessions[candidateId], "interaction", `“${text}”`, uid, { scopeKey });
      });
    });
    ui.fieldMessage = "";
  }

  function transferFieldItem(sessionId) {
    const targetId = document.querySelector("[data-transfer-target]")?.value || "";
    const itemId = document.querySelector("[data-transfer-item]")?.value || "";
    const uid = currentUserId();
    if (!targetId || !itemId) return toast("받을 인물과 소지품을 선택해 주세요.", "전달은 현재 같은 현장에 있는 인물에게만 가능합니다.", "error");
    mutate("transfer-field-item", (draft) => {
      const session = draft.sessions[sessionId];
      if (!session || session.movement) return;
      const presentIds = fieldCharacterIds(draft, session).filter((memberId) => memberId !== uid);
      if (!presentIds.includes(targetId)) return;
      const giverItem = draft.characters[uid].inventory[itemId];
      if (!giverItem || giverItem.quantity < 1) return;
      const receiverInventory = draft.characters[targetId].inventory;
      if (!receiverInventory[itemId]) receiverInventory[itemId] = { ...giverItem, quantity: 0 };
      receiverInventory[itemId].quantity += 1;
      giverItem.quantity -= 1;
      if (giverItem.quantity <= 0) delete draft.characters[uid].inventory[itemId];
      const message = `${DEMO_USERS[uid].name}가 ${DEMO_USERS[targetId].name}에게 ${giverItem.name} ×1을 건넸다.`;
      const scopeKey = chatScopeKey(session);
      const recipients = [session, ...fieldSessions(draft, session)];
      unique(recipients.map((candidate) => candidate.id)).forEach((candidateId) => appendLog(draft.sessions[candidateId], "interaction", message, null, { scopeKey }));
    });
    ui.transferItemId = "";
  }

  function inspectObject(sessionId, objectId) {
    const uid = currentUserId();
    let canReveal = false;
    mutate("inspect-object", (draft) => {
      const session = draft.sessions[sessionId];
      const object = findObject(objectId);
      if (!session || !object || session.activeEncounter || session.movement) return;
      const detailAllowed = DATA.places[session.currentNode]?.details.some((d) => d.id === object.detailId);
      if (!detailAllowed) {
        appendLog(session, "fail", `${DEMO_USERS[uid].name}는 ${object.name}을 조사하려고 주변을 살핀다. 그러나 이 장소에는 해당 물건이 보이지 않아 행동을 이어갈 수 없다.`);
        return;
      }
      canReveal = true;
      if (!session.inspectedObjectIds.includes(objectId)) {
        session.inspectedObjectIds.push(objectId);
        appendLog(session, "scene", `${DEMO_USERS[uid].name}는 ${object.name} 앞에 몸을 낮추고 세부를 확인한다. ${object.result} ${objectItemFindingText(draft, session, object.id)}`);
      }
    });
    if (canReveal) showObjectModal(objectId);
  }

  function takeItemNow(sessionId, objectId, itemId) {
    const uid = currentUserId();
    mutate("take-item", (draft) => {
      const session = draft.sessions[sessionId];
      const key = itemClaimKey(objectId, itemId);
      const mapping = (DATA.objectItems[objectId] || []).find((m) => m.itemId === itemId);
      if (!session || !mapping || !session.inspectedObjectIds.includes(objectId)) return;
      const claims = variantItemClaims(draft, session);
      if (claims[key]) {
        appendLog(session, "fail", `${DEMO_USERS[uid].name}는 ${mapping.name}을 챙기려고 곧바로 손을 뻗는다. 그러나 이미 누군가 가져가버렸다··· 남아 있는 것은 빈 자리뿐이라 획득할 수 없다.`);
        return;
      }
      claims[key] = { objectId, itemId, characterId: uid, sessionId, claimedAt: Date.now() };
      if (!session.takenItemKeys.includes(key)) session.takenItemKeys.push(key);
      const catalog = DATA.itemCatalog[itemId];
      const inventory = draft.characters[uid].inventory;
      if (!inventory[itemId]) inventory[itemId] = { itemId, name: catalog?.name || mapping.name, category: catalog?.category || "일반", quantity: 0, state: "CLEAN" };
      inventory[itemId].quantity += mapping.default;
      appendLog(session, "item", `${DEMO_USERS[uid].name}는 ${mapping.name} ×${mapping.default}을 챙겨 소지품에 넣었다.`);
    });
  }

  async function withLocalItemClaimLock(lockName, callback) {
    const storageKey = `${GLOBAL_KEY}_item_lock_${hashNumber(lockName)}`;
    const token = `${Date.now()}:${Math.random().toString(36).slice(2)}`;
    try {
      for (let attempt = 0; attempt < 24; attempt += 1) {
        const now = Date.now();
        const existing = JSON.parse(localStorage.getItem(storageKey) || "null");
        if (!existing || existing.expiresAt < now) {
          localStorage.setItem(storageKey, JSON.stringify({ token, expiresAt: now + 2000 }));
          await new Promise((resolve) => setTimeout(resolve, 28));
          const confirmed = JSON.parse(localStorage.getItem(storageKey) || "null");
          if (confirmed?.token === token) {
            try { return callback(); }
            finally {
              const latest = JSON.parse(localStorage.getItem(storageKey) || "null");
              if (latest?.token === token) localStorage.removeItem(storageKey);
            }
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 22 + (attempt % 4) * 7));
      }
    } catch {
      return callback();
    }
    return callback();
  }

  function takeItem(sessionId, objectId, itemId) {
    const session = loadState().sessions[sessionId];
    const lockName = `baekji-item-claim:${session?.variant || "unknown"}:${itemClaimKey(objectId, itemId)}`;
    if (typeof navigator !== "undefined" && navigator.locks?.request) {
      navigator.locks.request(lockName, () => takeItemNow(sessionId, objectId, itemId))
        .catch(() => withLocalItemClaimLock(lockName, () => takeItemNow(sessionId, objectId, itemId)));
      return;
    }
    if (typeof navigator !== "undefined") {
      withLocalItemClaimLock(lockName, () => takeItemNow(sessionId, objectId, itemId));
      return;
    }
    takeItemNow(sessionId, objectId, itemId);
  }

  function endSession(sessionId) {
    mutate("end-session", (draft) => {
      const session = draft.sessions[sessionId];
      if (!session || session.activeEncounter) return;
      session.status = "COMPLETED";
      session.endedAt = Date.now();
      appendLog(session, "scene", "조사를 마치고 현재까지 확인한 기록을 확정했다.");
    });
    go(`result/${sessionId}`);
  }

  function renderResult(sessionId) {
    if (!ensureAuth()) return;
    document.body.classList.add("retro-mode", "retro-page-mode");
    document.body.classList.remove("retro-login-mode", "retro-home-mode");
    const session = state.sessions[sessionId];
    if (!session || !session.memberIds.includes(currentUserId())) return go("home");
    const inspected = session.inspectedObjectIds.map(findObject).filter(Boolean);
    shell(`
      <main class="container narrow">
        <section class="hero"><div class="eyebrow">Session result</div><h1 style="font-size:54px">조사 기록 확정</h1><p class="lead">이 결과는 현재 루프의 해오름역 필드 상태에 기록되었습니다. MVP에서는 다음 루프 초기화와 누적 완료 시스템을 아직 실행하지 않습니다.</p></section>
        <section class="result-summary">
          <article class="card kpi"><span class="muted small">도착 위치</span><div class="kpi-value" style="font-size:20px">${escapeHtml(nodeDisplayName(session.currentNode))}</div></article>
          <article class="card kpi"><span class="muted small">확인 오브젝트</span><div class="kpi-value">${inspected.length}</div></article>
          <article class="card kpi"><span class="muted small">획득 처리</span><div class="kpi-value">${session.takenItemKeys.length}</div></article>
        </section>
        <section class="section card pad"><div class="card-header"><div><h2 class="card-title">조원 상태</h2></div></div><div class="member-grid">${session.memberIds.map((memberId) => memberRow({ ...state.parties[session.partyId], confirmedBy: session.memberIds, readyBy: session.memberIds }, memberId)).join("")}</div></section>
        <section class="section card pad"><div class="card-header"><div><h2 class="card-title">확인된 조사 결과</h2></div></div><div class="list">${inspected.length ? inspected.map((o) => `<div class="list-item"><div class="list-main"><div class="list-title">${escapeHtml(o.name)}</div><div class="list-sub">${escapeHtml(o.result)}</div></div></div>`).join("") : `<div class="empty">확인한 오브젝트가 없습니다.</div>`}</div></section>
        <section class="section"><div class="button-row"><button class="button" data-go="home">홈으로</button><button class="button danger" data-reset-demo>전체 데모 초기화</button></div></section>
      </main>`);
    document.querySelector("[data-reset-demo]").addEventListener("click", resetDemo);
  }

  function resetDemo() {
    localStorage.removeItem(GLOBAL_KEY);
    state = makeInitialState();
    saveState("reset");
    toast("데모 상태를 초기화했습니다.");
    go("home");
  }

  function render() {
    state = loadState();
    const [page, param] = routeParts();
    document.body.classList.add("retro-mode");
    if (page !== "login") document.body.classList.remove("retro-login-mode");
    if (page !== "home") document.body.classList.remove("retro-home-mode");
    if (["party", "briefing", "result"].includes(page)) document.body.classList.add("retro-page-mode");
    else document.body.classList.remove("retro-page-mode");
    if (page !== "login" && !currentUser()) return renderLogin();
    if (page === "login") return currentUser() ? go("home") : renderLogin();
    if (page === "home") return renderHome();
    if (page === "party") return renderParty(param);
    if (page === "briefing") return renderBriefing(param);
    if (page === "investigate") return renderInvestigation(param);
    if (page === "result") return renderResult(param);
    go("home");
  }

  function renderExternalUpdate() {
    if (ui.isComposing) {
      ui.pendingExternalRender = true;
      return;
    }
    render();
  }

  async function checkAIStatus() {
    if (typeof fetch !== "function") {
      ui.aiAvailable = false;
      updateAIStatusElements();
      return;
    }
    try {
      const response = await fetch("/api/ai/status", { cache: "no-store" });
      if (!response.ok) throw new Error(`AI_STATUS_${response.status}`);
      const payload = await response.json();
      ui.aiAvailable = payload.available === true;
      ui.aiModel = payload.model || "";
    } catch {
      ui.aiAvailable = false;
      ui.aiModel = "";
    }
    updateAIStatusElements();
  }

  window.addEventListener("hashchange", render);
  window.addEventListener("storage", (event) => { if (event.key === GLOBAL_KEY) renderExternalUpdate(); });
  window.addEventListener("pageshow", () => {
    if (routeParts()[0] === "investigate") {
      requestLatestLogScroll({ system: true, chat: true });
      render();
    }
  });
  setInterval(() => {
    document.querySelectorAll("[data-clock]").forEach((el) => { el.textContent = nowText(); });
  }, 1000);
  // 입력 중 다른 탭의 주기적 heartbeat가 전체 화면을 다시 그리지 않도록
  // 온라인 시각은 로그인/실제 상태 변경 시에만 갱신한다.

  if (!location.hash) location.hash = currentUser() ? "#/home" : "#/login";
  render();
  checkAIStatus();
})();
