(() => {
  "use strict";

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const DATA = window.DAY1_DATA;
  if (!DATA) return;

  const SAFE_LIGHT_NAMES = {
    a: "초록빛",
    b: "파란빛",
    c: "붉은빛",
    d: "흰빛",
  };

  const ZONE_DESCRIPTIONS = {
    E: "해오름역은 지상 환승광장과 지하 대합실, 승강장으로 이어진다.",
  };

  const TUTORIAL_RULES = [
    "일반 대화는 그대로 입력하고, 조사·이동·위험 대응처럼 시스템 판정이 필요한 행동은 앞에 ‘/’를 붙입니다.",
    "한 메시지에는 한 가지 행동만 입력합니다. 위험이 두 개라면 서로 다른 행동으로 하나씩 해결해야 합니다.",
    "이동은 현재 장소와 직접 연결된 통로로만 가능합니다. 길을 확인하려면 ‘/지도’를 입력합니다.",
    "오브젝트를 조사해 물품을 발견해도 자동 획득되지 않습니다. 확인 후 별도의 ‘가져가기’를 눌러야 합니다.",
  ];

  function currentSession() {
    const match = location.hash.match(/^#\/briefing\/([^/?#]+)/);
    if (!match) return null;
    let state;
    try { state = JSON.parse(localStorage.getItem(GLOBAL_KEY) || "null"); } catch { state = null; }
    return state?.sessions?.[decodeURIComponent(match[1])] || null;
  }

  function headlineFor(session) {
    const zoneId = String(DATA.meta?.zone?.id || session?.destination || "");
    const variantId = String(session?.variant || "");
    const light = SAFE_LIGHT_NAMES[variantId] || "옅은빛";
    const zoneName = String(DATA.meta?.zone?.name || "조사 구역");
    const description = ZONE_DESCRIPTIONS[zoneId]
      || `${zoneName}은 여러 출입구와 내부 통로로 이어진다.`;
    return `${light}의 ${description}`;
  }

  function applyBriefingTutorial() {
    const session = currentSession();
    const card = document.querySelector(".briefing.card");
    if (!session || !card) return;
    const key = `${DATA.meta?.zone?.id || "zone"}:${session.variant || "variant"}`;
    if (card.dataset.tutorialVersion === key) return;
    card.dataset.tutorialVersion = key;

    const title = card.querySelector(".card-header h2");
    const lead = card.querySelector(".card-header + .lead");
    const list = card.querySelector(".rule-list");
    if (title) title.textContent = headlineFor(session);
    if (lead) {
      lead.textContent = "구역 진입 후 장면, 시스템 로그, 조사 채팅을 함께 확인하세요. 아래 방식으로 대화와 행동을 구분하면 조사를 진행할 수 있습니다.";
    }
    if (list) {
      list.replaceChildren(...TUTORIAL_RULES.map((copy) => {
        const rule = document.createElement("div");
        rule.className = "rule";
        rule.textContent = copy;
        return rule;
      }));
    }
  }

  new MutationObserver(applyBriefingTutorial).observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", () => queueMicrotask(applyBriefingTutorial));
  window.addEventListener("storage", (event) => { if (event.key === GLOBAL_KEY) queueMicrotask(applyBriefingTutorial); });
  applyBriefingTutorial();
})();