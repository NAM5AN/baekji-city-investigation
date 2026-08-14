(() => {
  "use strict";

  const SUPABASE_URL = "https://kfgtvifupumjuewwxzmz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";
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

  function decorateInviteCandidates() {
    document.querySelectorAll(".retro-invite-card").forEach((card) => {
      const name = card.querySelector(".list-title");
      const image = card.querySelector(":scope > .retro-invite-profile");
      if (!name || !image) return;

      const lookupLabel = card.dataset.testerAccountId || name.textContent;
      const account = accountForLabel(lookupLabel);
      if (!account) return;

      card.dataset.testerAccountId = account.id;
      if (name.textContent !== account.name) name.textContent = account.name;
      if (!account.profilePhoto) return;

      if (image.getAttribute("src") !== account.profilePhoto) image.src = account.profilePhoto;
      image.alt = `${account.name} 프로필 사진`;
      image.dataset.testerProfilePhoto = "true";
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
    decorateInviteCandidates();
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
