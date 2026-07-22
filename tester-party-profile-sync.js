(() => {
  "use strict";

  const SUPABASE_URL = "https://zstgpnwnwmeifgmyeqtz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_g-cXysHfl260KTtSRLABTw_4wnaaxDY";
  const accounts = new Map();
  let refreshQueued = false;

  function accountFromRow(row) {
    return {
      id: String(row?.id || ""),
      name: String(row?.character_name || "").trim(),
      profilePhoto: String(row?.profile_photo || ""),
    };
  }

  function accountForLabel(label) {
    const value = String(label || "").trim();
    if (!value) return null;
    return accounts.get(value)
      || Array.from(accounts.values()).find((account) => account.name === value)
      || null;
  }

  function replaceAccountIds(value) {
    let output = String(value || "");
    accounts.forEach((account) => {
      if (account.id && account.name && output.includes(account.id)) {
        output = output.split(account.id).join(account.name);
      }
    });
    return output;
  }

  function profileImage(account) {
    const image = document.createElement("img");
    image.className = "tester-briefing-avatar";
    image.src = account.profilePhoto;
    image.alt = `${account.name} 프로필 사진`;
    return image;
  }

  function decorateBriefingMembers() {
    document.querySelectorAll(".briefing-member").forEach((member) => {
      const name = member.querySelector(".briefing-member-main strong");
      const icon = member.querySelector(".briefing-member-icon");
      if (!name || !icon) return;

      const lookupLabel = member.dataset.testerAccountId || name.textContent;
      const account = accountForLabel(lookupLabel);
      if (!account) return;

      member.dataset.testerAccountId = account.id;
      if (name.textContent !== account.name) name.textContent = account.name;

      if (account.profilePhoto) {
        let image = icon.querySelector(".tester-briefing-avatar");
        if (!image) {
          icon.replaceChildren(profileImage(account));
          icon.classList.add("has-profile-photo");
        } else if (image.getAttribute("src") !== account.profilePhoto) {
          image.src = account.profilePhoto;
        }
      } else if (!icon.textContent.trim()) {
        icon.textContent = Array.from(account.name)[0] || "?";
      }
    });
  }

  function decorateRelatedCopy() {
    document.querySelectorAll(".briefing-confirmation .retro-flow-notice > span, .retro-invite-modal p").forEach((element) => {
      const next = replaceAccountIds(element.textContent);
      if (next !== element.textContent) element.textContent = next;
    });
  }

  function refresh() {
    refreshQueued = false;
    if (!accounts.size) return;
    decorateBriefingMembers();
    decorateRelatedCopy();
  }

  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(refresh);
  }

  async function loadAccounts() {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/baekji_tester_list_accounts`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: "{}",
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`TESTER_DIRECTORY_${response.status}`);
    const rows = await response.json();
    (rows || []).map(accountFromRow).filter((account) => account.id && account.name).forEach((account) => accounts.set(account.id, account));
    scheduleRefresh();
  }

  window.__BAEKJI_TESTER_PARTY_PROFILE_TEST__ = Object.freeze({ accountFromRow, replaceAccountIds });

  const observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener("hashchange", scheduleRefresh);
  window.addEventListener("baekji-cloud-sync", scheduleRefresh);
  loadAccounts().catch((error) => console.warn("[tester-party-profile-sync]", error));
})();
