(() => {
  "use strict";

  const DEMO_NAMES = new Map([
    ["test_a", "테스트 캐릭터 A"],
    ["test_b", "테스트 캐릭터 B"],
    ["test_c", "테스트 캐릭터 C"],
  ]);

  function parseTransferText(text) {
    const value = String(text || "").trim().replace(/^.*?·\s*/, "");
    let match = value.match(/^(.+?)의 조사조 소속이 다른 조사조로 이동되었다\.?$/);
    if (match) return { moverId: match[1].trim(), direction: "out" };
    match = value.match(/^(.+?)의 조사조 소속이 이 조사조로 이동되었다\.?$/);
    if (match) return { moverId: match[1].trim(), direction: "in" };
    return null;
  }

  function hasFinalConsonant(text) {
    const chars = Array.from(String(text || "").trim());
    const code = chars.length ? chars.at(-1).charCodeAt(0) : 0;
    return code >= 0xac00 && code <= 0xd7a3 ? ((code - 0xac00) % 28) !== 0 : false;
  }

  function subjectParticle(text) {
    return hasFinalConsonant(text) ? "이" : "가";
  }

  function displayName(lookup, id) {
    return lookup.get(String(id)) || DEMO_NAMES.get(String(id)) || String(id || "알 수 없는 캐릭터");
  }

  function canonicalTransferText(moverName, sourceParty, targetParty) {
    return `${moverName}${subjectParticle(moverName)} ${sourceParty}에서 ${targetParty} 소속으로 이동했다.`;
  }

  function unpairedTransferText(moverName, direction) {
    return `${moverName}의 조사조 소속이 ${direction === "out" ? "다른 조사조로 이동되었다." : "이 조사조로 이동되었다."}`;
  }

  function pairTransferRecords(records, lookup = new Map()) {
    const rows = (Array.isArray(records) ? records : []).map((record, index) => ({ ...record, index, parsed: parseTransferText(record.text) }));
    const used = new Set();
    const output = [];

    rows.forEach((record) => {
      if (!record.parsed || used.has(record.index)) {
        if (!used.has(record.index)) output.push({ ...record, canonical: false });
        return;
      }
      const mate = rows.find((candidate) =>
        candidate.index !== record.index &&
        !used.has(candidate.index) &&
        candidate.parsed &&
        candidate.parsed.moverId === record.parsed.moverId &&
        candidate.parsed.direction !== record.parsed.direction &&
        Math.abs(candidate.index - record.index) <= 6
      );
      if (!mate) {
        const name = displayName(lookup, record.parsed.moverId);
        output.push({ ...record, text: record.text.replace(record.parsed.moverId, name), canonical: true });
        used.add(record.index);
        return;
      }

      used.add(record.index);
      used.add(mate.index);
      const out = record.parsed.direction === "out" ? record : mate;
      const incoming = record.parsed.direction === "in" ? record : mate;
      const keep = record.index < mate.index ? record : mate;
      const name = displayName(lookup, record.parsed.moverId);
      output.push({
        ...keep,
        text: canonicalTransferText(name, out.partyName || "이전 조사조", incoming.partyName || "새 조사조"),
        sourceParty: out.partyName || "이전 조사조",
        targetParty: incoming.partyName || "새 조사조",
        canonical: true,
        pairedIndexes: [record.index, mate.index],
      });
    });

    return output.sort((a, b) => a.index - b.index);
  }

  const TEST_API = Object.freeze({ parseTransferText, canonicalTransferText, pairTransferRecords, subjectParticle });
  if (typeof window !== "undefined") window.__BAEKJI_ADMIN_TRANSFER_LOG_FIX_TEST__ = TEST_API;
  if (typeof document === "undefined") return;

  let directory = new Map(DEMO_NAMES);
  let refreshQueued = false;

  const esc = (value) => String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  function sameDirectory(next) {
    if (directory.size !== next.size) return false;
    return [...next].every(([id, name]) => directory.get(id) === name);
  }

  function receiveSnapshot(snapshot) {
    if (!snapshot?.state) return;
    const next = new Map(DEMO_NAMES);
    (snapshot.directory || []).forEach((entry) => {
      if (entry?.id && (entry.name || entry.character_name)) next.set(String(entry.id), String(entry.name || entry.character_name));
    });
    if (sameDirectory(next)) return;
    directory = next;
    scheduleRefresh();
  }

  function rowRecord(row) {
    const spans = [...row.querySelectorAll("header span")];
    const p = row.querySelector("p");
    return {
      row,
      text: String(p?.textContent || ""),
      partyName: String(spans[2]?.textContent || "조사조").trim(),
    };
  }

  function renderCanonicalRow(row, text, sourceParty, targetParty, moverId = "", direction = "") {
    const p = row.querySelector("p");
    const renderedText = `SYSTEM · ${text}`;
    if (p && p.textContent !== renderedText) p.innerHTML = `<strong>SYSTEM</strong> · ${esc(text)}`;
    const spans = [...row.querySelectorAll("header span")];
    if (spans[2] && sourceParty && targetParty && spans[2].textContent !== `${sourceParty} → ${targetParty}`) spans[2].textContent = `${sourceParty} → ${targetParty}`;
    row.dataset.logSearchText = `${text} ${sourceParty || ""} ${targetParty || ""}`.toLowerCase();
    row.dataset.partyTransferCanonical = "true";
    if (moverId) row.dataset.partyTransferMoverId = moverId;
    if (sourceParty) row.dataset.partyTransferSourceParty = sourceParty;
    if (targetParty) row.dataset.partyTransferTargetParty = targetParty;
    if (direction) row.dataset.partyTransferDirection = direction;
  }

  function refresh() {
    refreshQueued = false;
    const list = document.querySelector("[data-admin-log-list]");
    if (!list) return;
    const rows = [...list.querySelectorAll(".admin-log-row")];
    rows.forEach((row) => {
      const moverId = row.dataset.partyTransferMoverId;
      const sourceParty = row.dataset.partyTransferSourceParty;
      const targetParty = row.dataset.partyTransferTargetParty;
      if (moverId && sourceParty && targetParty) {
        renderCanonicalRow(row, canonicalTransferText(displayName(directory, moverId), sourceParty, targetParty), sourceParty, targetParty, moverId);
      } else if (moverId && row.dataset.partyTransferDirection) {
        renderCanonicalRow(row, unpairedTransferText(displayName(directory, moverId), row.dataset.partyTransferDirection), "", "", moverId, row.dataset.partyTransferDirection);
      }
    });
    const records = rows.map(rowRecord);
    const paired = pairTransferRecords(records, directory);
    const keepRows = new Set(paired.map((entry) => entry.row));

    rows.forEach((row) => {
      const parsed = parseTransferText(row.querySelector("p")?.textContent || "");
      if (parsed && !keepRows.has(row)) row.remove();
    });

    paired.forEach((entry) => {
      if (!entry.canonical || !entry.row?.isConnected) return;
      const moverId = entry.row.dataset.partyTransferMoverId || entry.parsed?.moverId || "";
      const direction = entry.row.dataset.partyTransferDirection || entry.parsed?.direction || "";
      const sourceParty = entry.row.dataset.partyTransferSourceParty || entry.sourceParty || "";
      const targetParty = entry.row.dataset.partyTransferTargetParty || entry.targetParty || "";
      const text = sourceParty && targetParty && moverId
        ? canonicalTransferText(displayName(directory, moverId), sourceParty, targetParty)
        : (moverId && direction ? unpairedTransferText(displayName(directory, moverId), direction) : entry.text);
      renderCanonicalRow(entry.row, text, sourceParty, targetParty, moverId, direction);
    });
  }

  function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(refresh);
  }

  const panel = document.querySelector("[data-admin-panel]");
  if (panel && typeof MutationObserver === "function") {
    new MutationObserver(scheduleRefresh).observe(panel, { childList: true, subtree: true });
  }
  document.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest('[data-admin-tab="logs"]')) {
      setTimeout(scheduleRefresh, 0);
    }
  });
  const shell = window.__BAEKJI_ADMIN_SHELL__;
  if (shell?.snapshot) {
    receiveSnapshot(shell.snapshot.latest());
    shell.snapshot.subscribe(receiveSnapshot);
  }
  scheduleRefresh();
})();
