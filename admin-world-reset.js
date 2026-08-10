(() => {
  "use strict";

  const API_URL = "/api/admin-session-ops";
  const ROOT_ID = "admin-world-reset-root";
  const STYLE_ID = "admin-world-reset-style";
  let busy = false;

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function requestId() {
    if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
    return `reset_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .admin-world-reset-button{border:1px solid #8b3131;background:#261516;color:#ffdede;padding:8px 11px;font:inherit;font-weight:800;cursor:pointer;white-space:nowrap}
      .admin-world-reset-button:hover{background:#3a191b}.admin-world-reset-button:disabled{opacity:.55;cursor:not-allowed}
      #${ROOT_ID}{position:fixed;inset:0;z-index:10050;pointer-events:none}
      .admin-world-reset-backdrop{position:absolute;inset:0;background:rgba(0,0,0,.72);display:grid;place-items:center;padding:18px;pointer-events:auto}
      .admin-world-reset-modal{width:min(560px,100%);background:#111719;color:#edf3f1;border:1px solid #7f8b87;box-shadow:8px 8px 0 rgba(0,0,0,.45)}
      .admin-world-reset-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding:18px;border-bottom:1px solid #56605d}.admin-world-reset-head strong{display:block;font-size:20px}.admin-world-reset-head small{display:block;margin-top:5px;color:#9daaa6}
      .admin-world-reset-close{border:1px solid #65716d;background:#1a2022;color:#fff;width:34px;height:34px;font:inherit;cursor:pointer}
      .admin-world-reset-body{padding:20px}.admin-world-reset-warning{border:1px solid #8b3131;background:#281719;padding:14px;line-height:1.6}.admin-world-reset-warning strong{color:#ffb8b8}.admin-world-reset-warning ul{margin:10px 0 0;padding-left:20px;color:#d3dcda}
      .admin-world-reset-confirm{display:grid;gap:8px;margin-top:18px}.admin-world-reset-confirm span{font-weight:800}.admin-world-reset-confirm input{width:100%;box-sizing:border-box;border:1px solid #65716d;background:#0c1011;color:#fff;padding:11px 12px;font:inherit}
      .admin-world-reset-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px}.admin-world-reset-actions button{border:1px solid #65716d;background:#1b2224;color:#fff;padding:10px 15px;font:inherit;font-weight:800;cursor:pointer}.admin-world-reset-actions .danger{border-color:#a14040;background:#6d2226}.admin-world-reset-actions .danger:disabled{opacity:.4;cursor:not-allowed}
      .admin-world-reset-result{padding:18px;border:1px solid #486759;background:#14231c;line-height:1.6}.admin-world-reset-error{margin-top:12px;color:#ffb2b2;min-height:1.4em}
      @media(max-width:760px){.admin-world-reset-button{padding:7px 9px;font-size:12px}.admin-world-reset-backdrop{align-items:end;padding:10px}.admin-world-reset-modal{width:100%;max-height:82vh;overflow:auto;box-shadow:none}}
    `;
    document.head.appendChild(style);
  }

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement("div");
      root.id = ROOT_ID;
      document.body.appendChild(root);
    }
    return root;
  }

  function closeModal() {
    ensureRoot().replaceChildren();
  }

  function openModal() {
    const root = ensureRoot();
    root.innerHTML = `<div class="admin-world-reset-backdrop" data-admin-reset-backdrop>
      <section class="admin-world-reset-modal" role="dialog" aria-modal="true" aria-labelledby="admin-reset-title">
        <header class="admin-world-reset-head"><div><strong id="admin-reset-title">조사 상태 전체 초기화</strong><small>조사 사이트의 ‘전체 데모 초기화’와 동일한 초기 상태</small></div><button type="button" class="admin-world-reset-close" data-admin-reset-close aria-label="닫기">×</button></header>
        <div class="admin-world-reset-body">
          <div class="admin-world-reset-warning"><strong>현재 조사 진행 상태가 전부 사라집니다.</strong><ul><li>조사조·초대·준비 상태·조사 세션</li><li>캐릭터 오염도·증상·소지품</li><li>이동·돌발상황·조사 로그·획득 기록</li></ul><p>테스터 계정, 관리자 계정, 관리자 채팅과 감사 로그는 삭제하지 않습니다.</p></div>
          <label class="admin-world-reset-confirm"><span>확인을 위해 ‘초기화’를 입력하세요.</span><input autocomplete="off" data-admin-reset-confirm-input placeholder="초기화" /></label>
          <div class="admin-world-reset-error" data-admin-reset-error></div>
          <div class="admin-world-reset-actions"><button type="button" data-admin-reset-cancel>취소</button><button type="button" class="danger" data-admin-reset-submit disabled>전체 초기화</button></div>
        </div>
      </section>
    </div>`;
    root.querySelector("[data-admin-reset-confirm-input]")?.focus();
  }

  async function submitReset() {
    if (busy) return;
    const root = ensureRoot();
    const input = root.querySelector("[data-admin-reset-confirm-input]");
    const submit = root.querySelector("[data-admin-reset-submit]");
    const error = root.querySelector("[data-admin-reset-error]");
    if (!input || input.value.trim() !== "초기화") return;
    busy = true;
    if (submit) { submit.disabled = true; submit.textContent = "초기화 중…"; }
    if (error) error.textContent = "";
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ operation: "WORLD_RESET", requestId: requestId(), confirmation: "초기화" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.ok) throw new Error(data?.code || `HTTP_${response.status}`);
      root.innerHTML = `<div class="admin-world-reset-backdrop"><section class="admin-world-reset-modal" role="dialog" aria-modal="true"><div class="admin-world-reset-body"><div class="admin-world-reset-result"><strong>초기화 완료</strong><br>${esc(data.summary || "조사 사이트를 초기 상태로 되돌렸습니다.")}<br><small>세계 revision r${Number(data.revision || 0)} · 감사 로그 #${Number(data.auditId || 0)}</small></div></div></section></div>`;
      window.dispatchEvent(new CustomEvent("baekji-admin-world-reset", { detail: data }));
      setTimeout(() => location.reload(), 900);
    } catch (cause) {
      if (error) error.textContent = `초기화 실패: ${String(cause?.message || cause)}`;
      if (submit) { submit.disabled = false; submit.textContent = "전체 초기화"; }
    } finally {
      busy = false;
    }
  }

  function installButton() {
    ensureStyle();
    const meta = document.querySelector(".admin-topbar-meta");
    if (!meta || meta.querySelector("[data-admin-world-reset-open]")) return;
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-world-reset-button";
    button.dataset.adminWorldResetOpen = "true";
    button.textContent = "조사 상태 초기화";
    meta.prepend(button);
  }

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest("[data-admin-world-reset-open]")) { openModal(); return; }
    if (target.closest("[data-admin-reset-close], [data-admin-reset-cancel]")) { closeModal(); return; }
    if (target.matches("[data-admin-reset-backdrop]")) { closeModal(); return; }
    if (target.closest("[data-admin-reset-submit]")) submitReset();
  });

  document.addEventListener("input", (event) => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    if (!input?.matches("[data-admin-reset-confirm-input]")) return;
    const submit = ensureRoot().querySelector("[data-admin-reset-submit]");
    if (submit) submit.disabled = input.value.trim() !== "초기화" || busy;
  });

  document.addEventListener("keydown", (event) => { if (event.key === "Escape") closeModal(); });
  installButton();
  new MutationObserver(installButton).observe(document.documentElement, { childList: true, subtree: true });
})();
