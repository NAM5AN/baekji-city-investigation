(() => {
  "use strict";

  const VERSION = "0.2.1";
  const modalRoot = document.getElementById("admin-modal-root");
  if (!modalRoot || window.__BAEKJI_ADMIN_OBSERVATION_PEOPLE_POLISH__) return;

  let queued = false;

  function clean(value) {
    return String(value || "").trim();
  }

  function partyMembershipFromVisiblePeople() {
    const members = new Map();
    modalRoot.querySelectorAll('.admin-observe-person[data-observe-jump="character"]').forEach((button) => {
      const text = button.querySelector(':scope > span:not(.admin-observe-avatar)');
      const name = clean(text?.querySelector("strong")?.textContent);
      const partyName = clean(text?.querySelector("small")?.textContent);
      if (!name || !partyName || partyName === "조사조 없음") return;
      if (!members.has(partyName)) members.set(partyName, []);
      const names = members.get(partyName);
      if (!names.includes(name)) names.push(name);
    });
    return members;
  }

  function decoratePartyRows() {
    queued = false;
    const members = partyMembershipFromVisiblePeople();
    modalRoot.querySelectorAll('.admin-observe-row[data-observe-jump="party"]').forEach((button) => {
      const text = button.querySelector(":scope > span");
      const partyName = clean(text?.querySelector("strong")?.textContent);
      if (!text || !partyName) return;
      const names = members.get(partyName) || [];
      let label = text.querySelector(":scope > .admin-observe-party-members");
      if (!names.length) {
        label?.remove();
        return;
      }
      const next = `조원 · ${names.join(" · ")}`;
      if (!label) {
        label = document.createElement("small");
        label.className = "admin-observe-party-members";
        text.append(label);
      }
      if (label.textContent !== next) label.textContent = next;
    });
  }

  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(decoratePartyRows);
  }

  new MutationObserver(schedule).observe(modalRoot, { childList: true, subtree: true });
  schedule();

  window.__BAEKJI_ADMIN_OBSERVATION_PEOPLE_POLISH__ = Object.freeze({
    version: VERSION,
    decoratePartyRows,
  });
})();
