(() => {
  "use strict";

  const API_URL = "/api/admin-snapshot";
  const GROUP_VERSION = "1";
  const SNAPSHOT_CACHE_MS = 5_000;
  const RECIPIENT_SPECIFIC_TYPES = new Set(["field-action", "field-sound", "interaction"]);

  const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const unique = (values) => [...new Set((Array.isArray(values) ? values : []).filter(Boolean))];
  const values = (object) => Object.values(object && typeof object === "object" ? object : {});

  function isGroupableDescriptor(item) {
    return Boolean(
      item &&
      item.actor === "SYSTEM" &&
      item.type &&
      !RECIPIENT_SPECIFIC_TYPES.has(item.type) &&
      item.type !== "chat-divider" &&
      clean(item.text)
    );
  }

  function groupingKey(item) {
    if (!isGroupableDescriptor(item)) return "";
    return [item.type, item.timeText, clean(item.text)].join("\u241f");
  }

  function partyIdentity(item) {
    return clean(item?.partyId) || clean(item?.partyName);
  }

  function groupDescriptors(items) {
    const buckets = new Map();
    const singles = [];

    (Array.isArray(items) ? items : []).forEach((item, index) => {
      const key = groupingKey(item);
      if (!key) {
        singles.push({ anchor: index, grouped: false, items: [item] });
        return;
      }
      if (!buckets.has(key)) buckets.set(key, { anchor: index, grouped: true, items: [] });
      const bucket = buckets.get(key);
      bucket.anchor = Math.min(bucket.anchor, index);
      bucket.items.push(item);
    });

    const output = [...singles];
    buckets.forEach((bucket) => {
      const parties = unique(bucket.items.map(partyIdentity));
      if (bucket.items.length > 1 && parties.length > 1) {
        output.push(bucket);
        return;
      }
      bucket.items.forEach((item, offset) => output.push({
        anchor: bucket.anchor + offset / 1000,
        grouped: false,
        items: [item],
      }));
    });

    return output.sort((a, b) => a.anchor - b.anchor);
  }

  function descriptorFromRow(row, index) {
    const headerSpans = [...row.querySelectorAll("header > span")];
    const paragraph = row.querySelector("p");
    const actor = clean(paragraph?.querySelector("strong")?.textContent || "");
    const fullText = clean(paragraph?.textContent || "");
    const bodyText = actor && fullText.startsWith(actor)
      ? clean(fullText.slice(actor.length).replace(/^\s*[·•:-]\s*/, ""))
      : fullText;
    return {
      index,
      row,
      type: clean(row.dataset.logTypeId || headerSpans[0]?.textContent || ""),
      timeText: clean(headerSpans[1]?.textContent || ""),
      partyId: clean(row.dataset.logPartyId || ""),
      partyName: clean(headerSpans[2]?.textContent || ""),
      scopeTitle: clean(headerSpans[3]?.textContent || ""),
      actor,
      text: bodyText,
    };
  }

  function partyForSnapshot(state, partyId, partyName = "") {
    if (!state) return null;
    if (partyId && state.parties?.[partyId]) return state.parties[partyId];
    return values(state.parties).find((party) =>
      String(party?.id || "") === String(partyId || "") ||
      String(party?.sessionId || "") === String(partyId || "") ||
      (partyName && String(party?.name || "") === String(partyName))
    ) || null;
  }

  function recipientNames(snapshot, descriptors) {
    const directory = new Map((Array.isArray(snapshot?.directory) ? snapshot.directory : []).map((entry) => [String(entry?.id || ""), clean(entry?.name || entry?.loginId || entry?.id)]));
    const names = [];
    const partyFallbacks = [];

    (Array.isArray(descriptors) ? descriptors : []).forEach((item) => {
      const party = partyForSnapshot(snapshot?.state, item?.partyId, item?.partyName);
      const memberIds = unique(party?.memberIds || []);
      if (memberIds.length) {
        memberIds.forEach((id) => names.push(directory.get(String(id)) || String(id)));
      } else if (item?.partyName) {
        partyFallbacks.push(clean(item.partyName));
      }
    });

    const resolved = unique(names);
    return resolved.length ? resolved : unique(partyFallbacks);
  }

  function partyIdsForGroup(descriptors) {
    return unique((Array.isArray(descriptors) ? descriptors : []).map((item) => clean(item?.partyId)).filter(Boolean));
  }

  function partyNamesForGroup(descriptors) {
    return unique((Array.isArray(descriptors) ? descriptors : []).map((item) => clean(item?.partyName)).filter(Boolean));
  }

  function scopeTitlesForGroup(descriptors) {
    return unique((Array.isArray(descriptors) ? descriptors : []).map((item) => clean(item?.scopeTitle)).filter(Boolean));
  }

  function applyGroupToDom(group, snapshot) {
    const descriptors = group.items || [];
    const keeper = descriptors[0]?.row;
    if (!keeper) return;

    const ids = partyIdsForGroup(descriptors);
    const partyNames = partyNamesForGroup(descriptors);
    const scopes = scopeTitlesForGroup(descriptors);
    const recipients = recipientNames(snapshot, descriptors);
    const headerSpans = [...keeper.querySelectorAll("header > span")];

    keeper.classList.add("is-grouped-system");
    keeper.dataset.logPartyIds = ids.join("|");
    keeper.dataset.logPartyId = ids[0] || keeper.dataset.logPartyId || "";
    keeper.dataset.logSearchText = clean([
      keeper.dataset.logSearchText || "",
      recipients.join(" "),
      partyNames.join(" "),
      scopes.join(" "),
    ].join(" ")).toLowerCase();

    if (headerSpans[2]) {
      headerSpans[2].textContent = partyNames.length > 1 ? `${partyNames.length}개 조사조` : (partyNames[0] || headerSpans[2].textContent);
      if (partyNames.length > 1) headerSpans[2].title = partyNames.join(" · ");
    }
    if (headerSpans[3] && scopes.length > 1) {
      headerSpans[3].textContent = `${scopes.length}개 현장`;
      headerSpans[3].title = scopes.join(" · ");
    }

    keeper.querySelector(".admin-log-recipients")?.remove();
    const recipientLine = document.createElement("div");
    recipientLine.className = "admin-log-recipients";
    const label = document.createElement("span");
    label.textContent = "표시 대상";
    const names = document.createElement("strong");
    names.textContent = recipients.length ? recipients.join(" · ") : (partyNames.join(" · ") || "수신자 확인 불가");
    recipientLine.append(label, names);
    keeper.append(recipientLine);

    descriptors.slice(1).forEach((item) => item.row?.remove());
  }

  function applyGroupedFilters() {
    const party = document.querySelector("[data-log-party]")?.value || "";
    const type = document.querySelector("[data-log-type]")?.value || "";
    const query = clean(document.querySelector("[data-log-search]")?.value || "").toLowerCase();
    document.querySelectorAll(".admin-log-row").forEach((row) => {
      const partyIds = clean(row.dataset.logPartyIds || row.dataset.logPartyId || "").split("|").filter(Boolean);
      const matchParty = !party || partyIds.includes(party);
      const matchType = !type || row.dataset.logTypeId === type;
      const matchQuery = !query || String(row.dataset.logSearchText || "").includes(query);
      row.hidden = !(matchParty && matchType && matchQuery);
    });
  }

  let snapshotCache = null;
  let snapshotCacheAt = 0;
  let snapshotPromise = null;

  async function getSnapshot() {
    const now = Date.now();
    if (snapshotCache && now - snapshotCacheAt < SNAPSHOT_CACHE_MS) return snapshotCache;
    if (snapshotPromise) return snapshotPromise;
    snapshotPromise = fetch(API_URL, { method: "GET", credentials: "same-origin", cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.ok) return null;
        snapshotCache = data;
        snapshotCacheAt = Date.now();
        return data;
      })
      .catch(() => null)
      .finally(() => { snapshotPromise = null; });
    return snapshotPromise;
  }

  async function processCurrentLogList() {
    const list = document.querySelector("[data-admin-log-list]");
    if (!list || list.dataset.recipientGroupingVersion === GROUP_VERSION || list.dataset.recipientGroupingBusy === "1") return;
    list.dataset.recipientGroupingBusy = "1";

    try {
      const rows = [...list.querySelectorAll(".admin-log-row")];
      const descriptors = rows.map(descriptorFromRow);
      const groups = groupDescriptors(descriptors);
      const grouped = groups.filter((group) => group.grouped);
      if (!grouped.length) {
        rows.forEach((row) => { row.dataset.logPartyIds ||= row.dataset.logPartyId || ""; });
        return;
      }

      const snapshot = await getSnapshot();
      grouped.forEach((group) => applyGroupToDom(group, snapshot));
      [...list.querySelectorAll(".admin-log-row")].forEach((row) => { row.dataset.logPartyIds ||= row.dataset.logPartyId || ""; });
      applyGroupedFilters();
    } finally {
      list.dataset.recipientGroupingVersion = GROUP_VERSION;
      delete list.dataset.recipientGroupingBusy;
    }
  }

  const TEST_API = Object.freeze({
    clean,
    isGroupableDescriptor,
    groupingKey,
    groupDescriptors,
    recipientNames,
  });
  const root = typeof window !== "undefined" ? window : globalThis;
  root.__BAEKJI_ADMIN_LOG_GROUPING_TEST__ = TEST_API;

  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;

  let processTimer = 0;
  function scheduleProcess() {
    clearTimeout(processTimer);
    processTimer = setTimeout(processCurrentLogList, 0);
  }

  const observer = new MutationObserver(scheduleProcess);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scheduleProcess();

  document.addEventListener("input", (event) => {
    if (event.target?.matches?.("[data-log-search]")) setTimeout(applyGroupedFilters, 0);
  });
  document.addEventListener("change", (event) => {
    if (event.target?.matches?.("[data-log-party], [data-log-type]")) setTimeout(applyGroupedFilters, 0);
  });
})();
