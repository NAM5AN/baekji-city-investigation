import DAY1_DATA from "../data/day1.json" with { type: "json" };

const OFFER_TTL_MS = 60_000;

function clone(value) { return structuredClone(value); }
function compact(value, max = 700) { return String(value ?? "").normalize("NFKC").trim().replace(/^\/+\s*/, "").replace(/\s+/g, " ").slice(0, max); }
function unique(values) { return [...new Set((values || []).filter(Boolean))]; }
function baseItemId(key, item = {}) { return String(item.catalogItemId || item.baseItemId || item.originalItemId || item.itemId || key || "").split("::")[0]; }
function itemFields(item = {}) {
  return {
    name: String(item.name || ""), state: String(item.state || "CLEAN"), condition: String(item.condition || ""),
    charge: item.charge ?? null, remaining: item.remaining ?? item.remainingUses ?? null,
    content: item.content ?? item.contents ?? null, empty: Boolean(item.empty), consumed: Boolean(item.consumed),
    durability: item.durability ?? null, customState: String(item.customState || item.statusText || ""),
  };
}
function signature(item) { return JSON.stringify(itemFields(item)); }
function hash(value) {
  let output = 2166136261;
  for (const char of String(value)) { output ^= char.charCodeAt(0); output = Math.imul(output, 16777619); }
  return (output >>> 0).toString(36);
}
function scope(session) {
  if (!session) return "";
  if (session.movement) return `route:${session.movement.fromNode}:${session.movement.targetNode}`;
  if (session.activeEncounter) return `route:${session.activeEncounter.fromNode}:${session.activeEncounter.targetNode}`;
  if (session.currentDetailId) return `detail:${session.currentNode}:${session.currentDetailId}`;
  return `node:${session.currentNode}`;
}
function sessionOf(state, characterId) {
  const sessionId = state.characters?.[characterId]?.currentSessionId;
  return sessionId ? state.sessions?.[sessionId] || null : null;
}
function activeColocated(left, right) {
  return Boolean(left && right && left.status === "ACTIVE" && right.status === "ACTIVE" && left.variant === right.variant && scope(left) === scope(right));
}
function resolution(state, transferId) {
  return (state.itemTransferResolutions || []).find((entry) => entry?.transferId === transferId) || null;
}
function displayName(item = {}) { return String(item.displayName || item.name || "알 수 없는 물품"); }
function characterName(characterId, names = {}) { return String(names[characterId] || characterId || "조사자"); }
function addLog(session, idFactory, nowMs, type, text, extra = {}) {
  if (!session) return;
  session.logs ||= [];
  session.logs.push({ id: idFactory(type), type, text, actorId: null, at: nowMs, ...extra });
}
function fieldSessions(state, source) {
  return Object.values(state.sessions || {}).filter((candidate) => candidate?.status === "ACTIVE" && candidate.variant === source?.variant && scope(candidate) === scope(source));
}
function transferLogEntries(session, detail, decision, giverId, receiverId, extra = {}) {
  const participants = unique([giverId, receiverId]);
  const members = unique(session?.memberIds);
  const publicText = {
    OFFER: "근처에서 누군가 물품을 건네려 한다.", ACCEPT: "근처에서 물품 전달이 이루어졌다.",
    REJECT: "근처에서 물품 전달이 거절되었다.", EXPIRED: "근처의 물품 전달이 이루어지지 않았다.",
    CANCELLED: "근처의 물품 전달이 취소되었다.",
  }[decision] || "근처의 물품 전달이 이루어지지 않았다.";
  return [
    ...(members.some((memberId) => participants.includes(memberId)) ? [{ text: detail, recipientCharacterIds: participants, ...extra }] : []),
    ...(members.some((memberId) => !participants.includes(memberId)) ? [{ text: publicText, excludedCharacterIds: participants, ...extra }] : []),
  ];
}
function broadcast(state, source, idFactory, nowMs, detail, decision, giverId, receiverId, extra = {}) {
  for (const session of fieldSessions(state, source)) {
    for (const entry of transferLogEntries(session, detail, decision, giverId, receiverId, { scopeKey: scope(source), ...extra })) {
      addLog(session, idFactory, nowMs, `item-transfer-${decision.toLowerCase()}`, entry.text, entry);
    }
  }
}
function availableQuantity(state, giverId, inventoryKey, nowMs) {
  const item = state.characters?.[giverId]?.inventory?.[inventoryKey];
  if (!item) return 0;
  const reserved = (state.itemTransferOffers || []).reduce((total, offer) => (
    offer?.giverId === giverId && offer?.sourceInventoryKey === inventoryKey && !resolution(state, offer.id) && nowMs <= Number(offer.expiresAt || 0)
      ? total + Number(offer.quantity || 0) : total
  ), 0);
  return Math.max(0, Number(item.quantity || 0) - reserved);
}
function destinationKey(inventory, offer) {
  const compatible = Object.entries(inventory).find(([, item]) => baseItemId("", item) === offer.baseItemId && signature(item) === offer.itemVariantSignature);
  if (compatible) return compatible[0];
  if (!inventory[offer.baseItemId]) return offer.baseItemId;
  const prefix = `${offer.baseItemId}::variant_${hash(offer.itemVariantSignature)}`;
  let candidate = prefix;
  let suffix = 2;
  while (inventory[candidate]) {
    if (signature(inventory[candidate]) === offer.itemVariantSignature) return candidate;
    candidate = `${prefix}_${suffix++}`;
  }
  return candidate;
}
function completeOffer(state, offer, decision, actorId, nowMs, idFactory, names) {
  const giverSession = sessionOf(state, offer.giverId) || state.sessions?.[offer.sourceSessionId];
  const receiverSession = sessionOf(state, offer.receiverId) || state.sessions?.[offer.receiverSessionId];
  let finalDecision = decision;
  let reason = "";
  const giverInventory = state.characters?.[offer.giverId]?.inventory || {};
  const sourceItem = giverInventory[offer.sourceInventoryKey];

  if (nowMs > Number(offer.expiresAt || 0) || decision === "EXPIRED") {
    finalDecision = "EXPIRED";
    reason = "응답 시간이 지나 제안이 만료됐다.";
  } else if (decision === "ACCEPT" && !activeColocated(giverSession, receiverSession)) {
    finalDecision = "EXPIRED";
    reason = "두 캐릭터가 더 이상 같은 현장에 있지 않다.";
  } else if (decision === "ACCEPT" && (!sourceItem || Number(sourceItem.quantity || 0) < Number(offer.quantity || 0) || signature(sourceItem) !== offer.itemVariantSignature)) {
    finalDecision = "EXPIRED";
    reason = "건네려던 물품의 수량이나 상태가 달라졌다.";
  }

  if (finalDecision === "ACCEPT") {
    const receiver = state.characters?.[offer.receiverId];
    if (!receiver) return false;
    const inventory = receiver.inventory ||= {};
    const key = destinationKey(inventory, offer);
    if (inventory[key]) inventory[key].quantity = Number(inventory[key].quantity || 0) + Number(offer.quantity || 0);
    else {
      const item = clone(offer.itemSnapshot || {});
      delete item.inventoryKey; delete item.displayName; delete item.stateLabel;
      item.quantity = Number(offer.quantity || 0);
      item.itemId = key; item.catalogItemId = offer.baseItemId; item.baseItemId = offer.baseItemId;
      inventory[key] = item;
    }
    sourceItem.quantity = Number(sourceItem.quantity || 0) - Number(offer.quantity || 0);
    if (sourceItem.quantity <= 0) delete giverInventory[offer.sourceInventoryKey];
  }

  const result = {
    id: `item_transfer_resolution_${offer.id}`, transferId: offer.id, decision: finalDecision,
    receiverId: offer.receiverId, resolvedBy: actorId || "SYSTEM", resolvedAt: nowMs, reason, version: 1,
  };
  (state.itemTransferResolutions ||= []).push(result);
  const itemName = displayName(offer.itemSnapshot);
  const giverName = characterName(offer.giverId, names);
  const receiverName = characterName(offer.receiverId, names);
  const detail = finalDecision === "ACCEPT"
    ? `${receiverName}가 ${giverName}에게서 ${itemName} ×${offer.quantity}을 받아 소지품에 넣었다.`
    : finalDecision === "REJECT"
      ? `${receiverName}는 ${giverName}가 내민 ${itemName}을 받지 않았다. 물품은 원래 소유자에게 그대로 남았다.`
      : `${giverName}가 내민 ${itemName}의 전달은 이루어지지 않았다. ${reason}`;
  if (giverSession || receiverSession) broadcast(state, giverSession || receiverSession, idFactory, nowMs, detail, finalDecision, offer.giverId, offer.receiverId, { itemTransferOfferId: offer.id, itemTransferDecision: finalDecision });
  return true;
}
export function reconcileItemTransfers(state, { nowMs, idFactory, names = {} }) {
  let changed = false;
  for (const offer of state.itemTransferOffers || []) {
    if (!offer?.id || resolution(state, offer.id)) continue;
    const giverSession = sessionOf(state, offer.giverId);
    const receiverSession = sessionOf(state, offer.receiverId);
    if (nowMs >= Number(offer.expiresAt || 0)) {
      changed = completeOffer(state, offer, "EXPIRED", "SYSTEM", nowMs, idFactory, names) || changed;
    } else if (!activeColocated(giverSession, receiverSession)) {
      (state.itemTransferResolutions ||= []).push({
        id: `item_transfer_resolution_${offer.id}`, transferId: offer.id, decision: "CANCELLED",
        receiverId: offer.receiverId, resolvedBy: "SYSTEM", resolvedAt: nowMs,
        reason: "둘 중 한 명이 전달을 시작한 장소를 벗어났다.", version: 1,
      });
      const source = state.sessions?.[offer.sourceSessionId] || giverSession || receiverSession;
      if (source) broadcast(state, source, idFactory, nowMs, `${characterName(offer.giverId, names)}와 ${characterName(offer.receiverId, names)}가 서로 다른 장소로 이동해 ${displayName(offer.itemSnapshot)} ×${offer.quantity} 전달이 자동 취소됐다. 물품은 원래 소유자에게 그대로 남았다.`, "CANCELLED", offer.giverId, offer.receiverId, { itemTransferOfferId: offer.id, itemTransferDecision: "CANCELLED" });
      changed = true;
    }
  }
  return changed;
}

function claimFieldItem(state, actorId, payload, nowMs, idFactory) {
  const session = state.sessions?.[compact(payload.sessionId, 120)];
  const objectId = compact(payload.objectId, 160);
  const itemId = compact(payload.itemId, 220);
  if (!session || session.status !== "ACTIVE" || !session.memberIds?.includes(actorId) || session.movement || session.activeEncounter || !session.inspectedObjectIds?.includes(objectId)) return false;
  const actor = state.characters?.[actorId];
  if (!actor) return false;

  if (itemId.startsWith("FIELD:")) {
    const placementId = itemId.slice(6);
    const placement = state.fieldItemPlacementsByVariant?.[session.variant]?.[placementId];
    if (!placement || placement.objectId !== objectId) return false;
    const claims = (state.fieldItemPlacementClaimsByVariant ||= {})[session.variant] ||= {};
    if (claims[placementId]) return false;
    const inventory = actor.inventory ||= {};
    const preferredKey = String(placement.sourceInventoryKey || placement.item?.itemId || placementId);
    const base = baseItemId(preferredKey, placement.item);
    const prefix = `${base || "ITEM"}::field_${hash(placementId)}`;
    let key = preferredKey;
    let suffix = 2;
    if (Object.hasOwn(inventory, key)) {
      key = prefix;
      while (Object.hasOwn(inventory, key)) key = `${prefix}_${suffix++}`;
    }
    const recovered = clone(placement.item || {});
    if (key !== preferredKey) recovered.itemId = key;
    recovered._fieldPlacementId = placementId;
    inventory[key] = recovered;
    claims[placementId] = { placementId, objectId, characterId: actorId, sessionId: session.id, targetInventoryKey: key, claimedAt: nowMs };
    addLog(session, idFactory, nowMs, "item", "현장에 놓인 물품을 챙겨 소지품에 넣었다.", { actorId });
    return true;
  }

  const mapping = (DAY1_DATA.objectItems?.[objectId] || []).find((entry) => entry.itemId === itemId);
  if (!mapping) return false;
  const claims = (state.itemClaimsByVariant ||= {})[session.variant] ||= {};
  const key = `${objectId}:${itemId}`;
  if (claims[key]) return false;
  claims[key] = { objectId, itemId, characterId: actorId, sessionId: session.id, claimedAt: nowMs };
  session.takenItemKeys ||= [];
  if (!session.takenItemKeys.includes(key)) session.takenItemKeys.push(key);
  const inventory = actor.inventory ||= {};
  inventory[itemId] ||= { itemId, name: DAY1_DATA.itemCatalog?.[itemId]?.name || mapping.name, category: DAY1_DATA.itemCatalog?.[itemId]?.category || "일반", quantity: 0, state: "CLEAN" };
  inventory[itemId].quantity = Number(inventory[itemId].quantity || 0) + Number(mapping.default || 1);
  addLog(session, idFactory, nowMs, "item", "현장 물품을 획득했다.", { actorId });
  return true;
}

export function reducePlayerWorldInventoryCommand({ state, actorId, command, payload = {}, nowMs, idFactory, names = {} }) {
  if (!state || !actorId || !command || !Number.isFinite(nowMs) || typeof idFactory !== "function") return { status: "OUT_OF_SCOPE", state };
  const next = clone(state);

  if (command === "OFFER_ITEM_TRANSFER_V1") {
    const receiverId = compact(payload.receiverId, 120);
    const inventoryKey = compact(payload.inventoryKey, 220);
    const quantity = Math.max(1, Math.min(99, Number(payload.quantity) || 1));
    const giver = next.characters?.[actorId];
    const receiver = next.characters?.[receiverId];
    const giverSession = sessionOf(next, actorId);
    const receiverSession = sessionOf(next, receiverId);
    const item = giver?.inventory?.[inventoryKey];
    if (!giver || !receiver || receiverId === actorId || !activeColocated(giverSession, receiverSession) || !item || availableQuantity(next, actorId, inventoryKey, nowMs) < quantity) return { status: "OUT_OF_SCOPE", state };
    const transferId = idFactory("item_transfer");
    const snapshot = { ...clone(item), quantity, inventoryKey, baseItemId: baseItemId(inventoryKey, item), catalogItemId: baseItemId(inventoryKey, item), displayName: displayName(item) };
    const offer = {
      id: transferId, giverId: actorId, receiverId, sourceSessionId: giverSession.id, receiverSessionId: receiverSession.id,
      sourceScopeKey: scope(giverSession), sourceInventoryKey: inventoryKey, baseItemId: snapshot.baseItemId,
      itemSnapshot: snapshot, itemVariantSignature: signature(item), quantity,
      actionText: compact(payload.actionText), source: compact(payload.source, 80) || "free-action",
      createdAt: nowMs, expiresAt: nowMs + OFFER_TTL_MS, version: 1,
    };
    (next.itemTransferOffers ||= []).push(offer);
    const actionText = compact(payload.actionText);
    if (actionText) addLog(giverSession, idFactory, nowMs, "action-input", actionText, { actorId, itemTransferOfferId: transferId, recipientCharacterIds: [actorId, receiverId], fieldObservationBroadcasted: true });
    broadcast(next, giverSession, idFactory, nowMs, `${characterName(actorId, names)}가 ${characterName(receiverId, names)}에게 ${snapshot.displayName} ×${quantity}을 내밀었다. 상대의 응답을 기다리고 있다.`, "OFFER", actorId, receiverId, { itemTransferOfferId: transferId, itemTransferDecision: "OFFER" });
    return { status: "APPLIED", state: next };
  }

  if (command === "RESOLVE_ITEM_TRANSFER_V1") {
    const transferId = compact(payload.transferId, 220);
    const decision = payload.decision === "ACCEPT" ? "ACCEPT" : payload.decision === "REJECT" ? "REJECT" : "";
    const offer = (next.itemTransferOffers || []).find((entry) => entry?.id === transferId);
    if (!offer || offer.receiverId !== actorId || !decision) return { status: "OUT_OF_SCOPE", state };
    if (resolution(next, transferId)) return { status: "NOOP", state };
    return completeOffer(next, offer, decision, actorId, nowMs, idFactory, names)
      ? { status: "APPLIED", state: next } : { status: "OUT_OF_SCOPE", state };
  }

  if (command === "CANCEL_ITEM_TRANSFER_V1") {
    const transferId = compact(payload.transferId, 220);
    const offer = (next.itemTransferOffers || []).find((entry) => entry?.id === transferId);
    if (!offer || offer.giverId !== actorId) return { status: "OUT_OF_SCOPE", state };
    if (resolution(next, transferId)) return { status: "NOOP", state };
    (next.itemTransferResolutions ||= []).push({ id: `item_transfer_resolution_${offer.id}`, transferId: offer.id, decision: "CANCELLED", receiverId: offer.receiverId, resolvedBy: actorId, resolvedAt: nowMs, reason: "보낸 캐릭터가 전달을 취소했다.", version: 1 });
    const source = sessionOf(next, actorId) || next.sessions?.[offer.sourceSessionId];
    if (source) broadcast(next, source, idFactory, nowMs, `${characterName(actorId, names)}가 ${characterName(offer.receiverId, names)}에게 건네려던 ${displayName(offer.itemSnapshot)} ×${offer.quantity} 전달을 취소했다. 물품은 원래 소유자에게 그대로 남았다.`, "CANCELLED", actorId, offer.receiverId, { itemTransferOfferId: offer.id, itemTransferDecision: "CANCELLED" });
    return { status: "APPLIED", state: next };
  }

  if (command === "EXPIRE_ITEM_TRANSFER_V1") {
    const transferId = compact(payload.transferId, 220);
    const offer = (next.itemTransferOffers || []).find((entry) => entry?.id === transferId);
    if (!offer || ![offer.giverId, offer.receiverId].includes(actorId)) return { status: "OUT_OF_SCOPE", state };
    if (resolution(next, transferId)) return { status: "NOOP", state };
    if (nowMs < Number(offer.expiresAt || 0)) return { status: "OUT_OF_SCOPE", state };
    return completeOffer(next, offer, "EXPIRED", actorId, nowMs, idFactory, names)
      ? { status: "APPLIED", state: next } : { status: "OUT_OF_SCOPE", state };
  }

  if (command === "CLAIM_FIELD_ITEM_V1") {
    return claimFieldItem(next, actorId, payload, nowMs, idFactory)
      ? { status: "APPLIED", state: next } : { status: "OUT_OF_SCOPE", state };
  }

  return { status: "UNSUPPORTED", state };
}
