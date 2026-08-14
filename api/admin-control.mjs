import { adminSessionTokenFromRequest } from "./_admin-auth.mjs";
import { verifyAdminSession, readWorldState } from "./admin-snapshot.mjs";
import { worldItemSource } from "./_day1-items.mjs";

const DEFAULT_SUPABASE_URL = "https://kfgtvifupumjuewwxzmz.supabase.co";
const DEFAULT_SUPABASE_KEY = "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";
const STATE_KEY = "day1_world";
const MAX_BODY_BYTES = 16 * 1024;
const MAX_PATCH_HISTORY = 1000;
const ALLOWED_NODES = new Set([
  "E_ENTRY",
  "E_G_PLAZA",
  "E_G_EAST",
  "E_G_WEST",
  "E_B1_CONCOURSE",
  "E_B1_TICKET",
  "E_B1_GATE",
  "E_B1_SHELTER",
  "E_B2_TRANSFER",
  "E_B2_P12",
  "E_B2_SHELTER_STAIR",
]);
const ALLOWED_VARIANTS = new Set(["a", "b", "c", "d"]);
const ALLOWED_SESSION_STATUS = new Set(["BRIEFING", "ACTIVE", "COMPLETED"]);

function sendJson(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.end(JSON.stringify(payload));
}

function config(env) {
  return {
    url: env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
    key: env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_KEY,
  };
}

async function rpc(env, name, body, fetchImpl = globalThis.fetch) {
  const { url, key } = config(env);
  const response = await fetchImpl(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw Object.assign(new Error(`${name}_${response.status}`), { statusCode: response.status, detail });
  }
  if (response.status === 204) return null;
  return response.json();
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error("REQUEST_TOO_LARGE"), { statusCode: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw Object.assign(new Error("INVALID_JSON"), { statusCode: 400 }); }
}

function cleanText(value, maxLength) {
  return String(value ?? "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function integer(value, min, max) {
  const parsed = Math.trunc(Number(value));
  if (!Number.isFinite(parsed)) return null;
  return Math.max(min, Math.min(max, parsed));
}

function hasOwn(object, key) {
  return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
}

function ensureWorld(state) {
  if (!state || state.version !== 3 || typeof state.characters !== "object" || typeof state.sessions !== "object") {
    throw Object.assign(new Error("WORLD_STATE_UNAVAILABLE"), { statusCode: 503 });
  }
}

function patchEnvelope(state, requestId, operation, targetKind, targetId, data) {
  const nextSeq = Math.max(0, Number(state.adminControlSeq || 0)) + 1;
  return {
    seq: nextSeq,
    requestId,
    at: Date.now(),
    action: operation,
    targetKind,
    targetId,
    data,
  };
}

function attachPatch(state, patch) {
  state.adminControlSeq = patch.seq;
  const history = Array.isArray(state.adminControlPatches) ? state.adminControlPatches : [];
  state.adminControlPatches = [...history.filter((entry) => Number(entry?.seq || 0) !== patch.seq), patch]
    .sort((a, b) => Number(a?.seq || 0) - Number(b?.seq || 0))
    .slice(-MAX_PATCH_HISTORY);
}

function characterStatusMutation(state, body, requestId) {
  const characterId = cleanText(body.characterId, 180);
  const character = state.characters?.[characterId];
  if (!character) throw Object.assign(new Error("ADMIN_TARGET_CHARACTER_NOT_FOUND"), { statusCode: 404 });

  const changed = {};
  if (hasOwn(body, "contamination")) {
    const contamination = integer(body.contamination, 0, 100);
    if (contamination == null) throw Object.assign(new Error("INVALID_CONTAMINATION"), { statusCode: 400 });
    changed.contamination = contamination;
  }
  if (hasOwn(body, "symptom")) {
    const symptom = cleanText(body.symptom, 120) || "안정";
    changed.symptom = symptom;
  }
  if (!Object.keys(changed).length) throw Object.assign(new Error("ADMIN_CONTROL_NO_CHANGES"), { statusCode: 400 });

  const before = { contamination: Number(character.contamination || 0), symptom: String(character.symptom || "안정") };
  Object.assign(character, changed);
  const after = { contamination: Number(character.contamination || 0), symptom: String(character.symptom || "안정") };
  const patch = patchEnvelope(state, requestId, "CHARACTER_STATUS", "CHARACTER", characterId, changed);
  attachPatch(state, patch);
  return {
    patch,
    targetKind: "CHARACTER",
    targetId: characterId,
    before,
    after,
    summary: `캐릭터 ${characterId} 상태를 변경했습니다.`,
    metadata: { changedFields: Object.keys(changed) },
  };
}

function inventoryMutation(state, body, requestId) {
  const characterId = cleanText(body.characterId, 180);
  const itemId = cleanText(body.itemId, 80);
  const character = state.characters?.[characterId];
  if (!character) throw Object.assign(new Error("ADMIN_TARGET_CHARACTER_NOT_FOUND"), { statusCode: 404 });
  if (!itemId) throw Object.assign(new Error("ADMIN_ITEM_ID_REQUIRED"), { statusCode: 400 });
  if (!character.inventory || typeof character.inventory !== "object") character.inventory = {};

  const quantity = integer(body.quantity, 0, 99);
  if (quantity == null) throw Object.assign(new Error("INVALID_ITEM_QUANTITY"), { statusCode: 400 });
  const existing = character.inventory[itemId] ? clone(character.inventory[itemId]) : null;
  const before = existing;
  let after = null;

  if (quantity <= 0) {
    delete character.inventory[itemId];
  } else {
    const name = cleanText(body.name || existing?.name, 120);
    if (!name) throw Object.assign(new Error("ADMIN_ITEM_NAME_REQUIRED"), { statusCode: 400 });
    after = {
      ...(existing || {}),
      itemId,
      name,
      category: cleanText(body.category || existing?.category || "일반", 60) || "일반",
      quantity,
      state: cleanText(body.state || existing?.state || "CLEAN", 40) || "CLEAN",
    };
    character.inventory[itemId] = after;
  }

  const patch = patchEnvelope(state, requestId, "INVENTORY_SET", "CHARACTER", characterId, {
    characterId,
    itemId,
    item: after ? clone(after) : null,
  });
  attachPatch(state, patch);
  return {
    patch,
    targetKind: "CHARACTER",
    targetId: characterId,
    before: { itemId, item: before },
    after: { itemId, item: after },
    summary: quantity > 0 ? `캐릭터 ${characterId}의 ${nameForAudit(after, itemId)} 수량을 ${quantity}개로 변경했습니다.` : `캐릭터 ${characterId}의 ${nameForAudit(existing, itemId)}을 소지품에서 제거했습니다.`,
    metadata: { itemId, quantity },
  };
}

function nameForAudit(item, fallback) {
  return String(item?.name || fallback || "소지품");
}

function inventoryBaseId(inventoryKey, item) {
  return cleanText(item?.catalogItemId || item?.baseItemId || item?.originalItemId || item?.itemId || inventoryKey, 80).split("::")[0];
}

function inventoryTargetKey(inventory, preferredKey, requestId, mode, baseId = "") {
  const preferred = cleanText(preferredKey, 120);
  if (preferred && !hasOwn(inventory, preferred)) return preferred;
  const base = cleanText(baseId, 80) || inventoryBaseId(preferred, inventory?.[preferred]) || "ITEM";
  const seed = cleanText(requestId, 120).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 28) || "request";
  const prefix = `${base}::admin_${mode.toLowerCase()}_${seed}`;
  let key = prefix;
  let suffix = 2;
  while (hasOwn(inventory, key)) key = `${prefix}_${suffix++}`;
  return key;
}

function inventoryCopyKey(inventory, baseId, requestId) {
  const seed = cleanText(requestId, 120).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 28) || "request";
  return inventoryTargetKey(inventory, `${baseId || "ITEM"}::admin_copy_${seed}`, requestId, "copy", baseId);
}

function hasActiveSourceOffer(state, characterId, inventoryKey, now) {
  const resolved = new Set((state.itemTransferResolutions || []).map((entry) => String(entry?.transferId || "")));
  return (state.itemTransferOffers || []).some((offer) => String(offer?.giverId || "") === characterId
    && String(offer?.sourceInventoryKey || "") === inventoryKey
    && !resolved.has(String(offer?.id || ""))
    && Number(offer?.expiresAt || 0) >= Number(now));
}

function inventoryChange(characterId, inventoryKey, item) {
  return { characterId, inventoryKey, item: item == null ? null : clone(item) };
}

export function inventoryTransferMutation(sourceState, body, requestId, now = Date.now()) {
  const state = clone(sourceState);
  const mode = cleanText(body.mode, 32).toUpperCase();
  if (!new Set(["WORLD_CLAIM", "CHARACTER_MOVE", "CHARACTER_COPY"]).has(mode)) {
    throw Object.assign(new Error("ADMIN_ITEM_TRANSFER_MODE_INVALID"), { statusCode: 400 });
  }
  const targetCharacterId = cleanText(body.targetCharacterId, 180);
  const target = state.characters?.[targetCharacterId];
  if (!target) throw Object.assign(new Error("ADMIN_TARGET_CHARACTER_NOT_FOUND"), { statusCode: 404 });
  if (!target.inventory || typeof target.inventory !== "object") target.inventory = {};

  const before = { mode, source: null, target: null, claim: null };
  const after = { mode, source: null, target: null, claim: null };
  const inventoryChanges = [];
  let claimChange = null;
  let metadata = { mode, targetCharacterId };

  if (mode === "WORLD_CLAIM") {
    const variant = cleanText(body.variant, 8).toLowerCase();
    const objectId = cleanText(body.objectId, 80);
    const catalogItemId = cleanText(body.catalogItemId, 80);
    if (!ALLOWED_VARIANTS.has(variant)) throw Object.assign(new Error("INVALID_ITEM_VARIANT"), { statusCode: 400 });
    const source = worldItemSource(objectId, catalogItemId);
    if (!source) throw Object.assign(new Error("ADMIN_WORLD_ITEM_SOURCE_NOT_FOUND"), { statusCode: 404 });
    state.itemClaimsByVariant ||= { a: {}, b: {}, c: {}, d: {} };
    const claims = state.itemClaimsByVariant[variant] || (state.itemClaimsByVariant[variant] = {});
    const claimKey = `${objectId}:${catalogItemId}`;
    if (claims[claimKey]) throw Object.assign(new Error("ADMIN_WORLD_ITEM_ALREADY_CLAIMED"), { statusCode: 409 });
    const targetKey = inventoryTargetKey(target.inventory, catalogItemId, requestId, "claim");
    const item = {
      itemId: targetKey,
      baseItemId: catalogItemId,
      catalogItemId,
      name: String(source.catalog?.name || source.mapping?.name || catalogItemId),
      category: String(source.catalog?.category || "일반"),
      quantity: Number(source.mapping?.default || 1),
      state: "CLEAN",
    };
    const claim = { objectId, itemId: catalogItemId, characterId: targetCharacterId, sessionId: null, claimedAt: Number(now), adminGranted: true };
    claims[claimKey] = claim;
    target.inventory[targetKey] = item;
    inventoryChanges.push(inventoryChange(targetCharacterId, targetKey, item));
    claimChange = { variant, claimKey, claim: clone(claim) };
    before.source = { objectId, itemId: catalogItemId, variant };
    before.target = { characterId: targetCharacterId, inventoryKey: targetKey, item: null };
    before.claim = { variant, claimKey, claim: null };
    after.target = { characterId: targetCharacterId, inventoryKey: targetKey, item: clone(item) };
    after.source = clone(before.source);
    after.claim = clone(claimChange);
    metadata = { ...metadata, variant, objectId, catalogItemId, targetInventoryKey: targetKey, quantity: item.quantity };
  } else {
    const sourceCharacterId = cleanText(body.sourceCharacterId, 180);
    const sourceInventoryKey = cleanText(body.sourceInventoryKey, 120);
    const sourceCharacter = state.characters?.[sourceCharacterId];
    if (!sourceCharacter) throw Object.assign(new Error("ADMIN_SOURCE_CHARACTER_NOT_FOUND"), { statusCode: 404 });
    if (mode === "CHARACTER_MOVE" && sourceCharacterId === targetCharacterId) throw Object.assign(new Error("ADMIN_ITEM_TRANSFER_SAME_CHARACTER"), { statusCode: 400 });
    const sourceInventory = sourceCharacter.inventory && typeof sourceCharacter.inventory === "object" ? sourceCharacter.inventory : {};
    const sourceItem = sourceInventory[sourceInventoryKey];
    if (!sourceItem || Number(sourceItem.quantity || 0) <= 0) throw Object.assign(new Error("ADMIN_SOURCE_ITEM_NOT_FOUND"), { statusCode: 404 });
    if (mode === "CHARACTER_MOVE" && hasActiveSourceOffer(state, sourceCharacterId, sourceInventoryKey, now)) throw Object.assign(new Error("ADMIN_ITEM_TRANSFER_RESERVED"), { statusCode: 409 });
    const sourceBaseId = inventoryBaseId(sourceInventoryKey, sourceItem);
    const targetKey = mode === "CHARACTER_MOVE"
      ? inventoryTargetKey(target.inventory, sourceInventoryKey, requestId, "move", sourceBaseId)
      : inventoryCopyKey(target.inventory, sourceBaseId, requestId);
    const targetItem = clone(sourceItem);
    if (targetKey !== sourceInventoryKey) targetItem.itemId = targetKey;
    const baseId = sourceBaseId;
    if (!targetItem.baseItemId) targetItem.baseItemId = baseId;
    if (!targetItem.catalogItemId) targetItem.catalogItemId = baseId;
    if (hasOwn(target.inventory, targetKey)) throw Object.assign(new Error("ADMIN_ITEM_TRANSFER_TARGET_COLLISION"), { statusCode: 409 });
    target.inventory[targetKey] = targetItem;
    inventoryChanges.push(inventoryChange(targetCharacterId, targetKey, targetItem));
    before.source = { characterId: sourceCharacterId, inventoryKey: sourceInventoryKey, item: clone(sourceItem) };
    before.target = { characterId: targetCharacterId, inventoryKey: targetKey, item: null };
    after.target = { characterId: targetCharacterId, inventoryKey: targetKey, item: clone(targetItem) };
    if (mode === "CHARACTER_MOVE") {
      delete sourceInventory[sourceInventoryKey];
      inventoryChanges.unshift(inventoryChange(sourceCharacterId, sourceInventoryKey, null));
      after.source = { characterId: sourceCharacterId, inventoryKey: sourceInventoryKey, item: null };
    } else {
      after.source = clone(before.source);
    }
    metadata = { ...metadata, sourceCharacterId, sourceInventoryKey, targetInventoryKey: targetKey, quantity: Number(targetItem.quantity || 0) };
  }

  const patch = patchEnvelope(state, requestId, "INVENTORY_TRANSFER", "CHARACTER", targetCharacterId, {
    mode,
    inventoryChanges,
    ...(claimChange ? { claimChange } : {}),
  });
  attachPatch(state, patch);
  const verb = mode === "WORLD_CLAIM" ? "월드 미습득 아이템 지급" : mode === "CHARACTER_MOVE" ? "캐릭터 소지품 이동" : "캐릭터 소지품 복제 지급";
  return {
    state,
    patch,
    targetKind: "CHARACTER",
    targetId: targetCharacterId,
    before,
    after,
    summary: `캐릭터 ${targetCharacterId}에 ${verb}을 적용했습니다.`,
    metadata,
  };
}

function sessionMutation(state, body, requestId) {
  const sessionId = cleanText(body.sessionId, 180);
  const session = state.sessions?.[sessionId];
  if (!session) throw Object.assign(new Error("ADMIN_TARGET_SESSION_NOT_FOUND"), { statusCode: 404 });

  const changes = {};
  const before = {
    currentNode: session.currentNode || "",
    currentDetailId: session.currentDetailId || null,
    variant: session.variant || "",
    status: session.status || "",
    movement: session.movement || null,
    activeEncounter: session.activeEncounter || null,
  };

  if (hasOwn(body, "nodeId")) {
    const nodeId = cleanText(body.nodeId, 80);
    if (!ALLOWED_NODES.has(nodeId)) throw Object.assign(new Error("INVALID_SESSION_NODE"), { statusCode: 400 });
    session.currentNode = nodeId;
    session.currentDetailId = null;
    session.movement = null;
    session.activeEncounter = null;
    session.choiceReveal = { type: "persistent-menu", at: Date.now() };
    changes.nodeId = nodeId;
    changes.clearTransient = true;
  }
  if (hasOwn(body, "variant")) {
    const variant = cleanText(body.variant, 8).toLowerCase();
    if (!ALLOWED_VARIANTS.has(variant)) throw Object.assign(new Error("INVALID_SESSION_VARIANT"), { statusCode: 400 });
    session.variant = variant;
    changes.variant = variant;
  }
  if (hasOwn(body, "status")) {
    const status = cleanText(body.status, 20).toUpperCase();
    if (!ALLOWED_SESSION_STATUS.has(status)) throw Object.assign(new Error("INVALID_SESSION_STATUS"), { statusCode: 400 });
    session.status = status;
    session.endedAt = status === "COMPLETED" ? Date.now() : null;
    changes.status = status;
  }
  if (body.clearTransient === true && !changes.clearTransient) {
    session.movement = null;
    session.activeEncounter = null;
    session.choiceReveal = { type: "persistent-menu", at: Date.now() };
    changes.clearTransient = true;
  }
  if (!Object.keys(changes).length) throw Object.assign(new Error("ADMIN_CONTROL_NO_CHANGES"), { statusCode: 400 });

  const after = {
    currentNode: session.currentNode || "",
    currentDetailId: session.currentDetailId || null,
    variant: session.variant || "",
    status: session.status || "",
    movement: session.movement || null,
    activeEncounter: session.activeEncounter || null,
  };
  const patch = patchEnvelope(state, requestId, "SESSION_CONTROL", "SESSION", sessionId, changes);
  attachPatch(state, patch);
  return {
    patch,
    targetKind: "SESSION",
    targetId: sessionId,
    before,
    after,
    summary: `조사 세션 ${sessionId}의 진행 상태를 변경했습니다.`,
    metadata: { changedFields: Object.keys(changes), partyId: String(session.partyId || "") },
  };
}

function applyOperation(sourceState, body, requestId) {
  const state = clone(sourceState);
  ensureWorld(state);
  const operation = cleanText(body.operation, 40).toUpperCase();
  if (operation === "CHARACTER_STATUS") return { state, ...characterStatusMutation(state, body, requestId) };
  if (operation === "INVENTORY_SET") return { state, ...inventoryMutation(state, body, requestId) };
  if (operation === "INVENTORY_TRANSFER") return inventoryTransferMutation(state, body, requestId);
  if (operation === "SESSION_CONTROL") return { state, ...sessionMutation(state, body, requestId) };
  throw Object.assign(new Error("ADMIN_CONTROL_OPERATION_INVALID"), { statusCode: 400 });
}

async function atomicApply(env, token, requestId, world, mutation, fetchImpl) {
  const rows = await rpc(env, "baekji_admin_state_apply", {
    p_token: token,
    p_state_key: STATE_KEY,
    p_state: mutation.state,
    p_expected_revision: world.revision,
    p_request_id: requestId,
    p_action: mutation.patch.action,
    p_target_kind: mutation.targetKind,
    p_target_id: mutation.targetId,
    p_summary: mutation.summary,
    p_before_state: mutation.before,
    p_after_state: mutation.after,
    p_metadata: { ...mutation.metadata, adminControlSeq: mutation.patch.seq },
  }, fetchImpl);
  return Array.isArray(rows) ? rows[0] || null : rows || null;
}

function priorInventoryTransfer(state, requestId) {
  return (state?.adminControlPatches || []).find((patch) => String(patch?.requestId || "") === requestId && patch?.action === "INVENTORY_TRANSFER") || null;
}

export async function adminControlHandler(request, response, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  if (request.method !== "POST") return sendJson(response, 405, { ok: false, code: "METHOD_NOT_ALLOWED" });
  const token = adminSessionTokenFromRequest(request);
  if (!token) return sendJson(response, 401, { ok: false, code: "ADMIN_SESSION_REQUIRED" });

  try {
    const admin = await verifyAdminSession(env, token, fetchImpl);
    if (!admin) return sendJson(response, 401, { ok: false, code: "ADMIN_SESSION_INVALID" });
    const body = await readBody(request);
    const requestId = cleanText(body.requestId, 120);
    if (!requestId) return sendJson(response, 400, { ok: false, code: "ADMIN_REQUEST_ID_REQUIRED" });

    let world = await readWorldState(env, fetchImpl);
    if (!world.state) return sendJson(response, 503, { ok: false, code: "WORLD_STATE_UNAVAILABLE" });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const prior = cleanText(body.operation, 40).toUpperCase() === "INVENTORY_TRANSFER" ? priorInventoryTransfer(world.state, requestId) : null;
      if (prior) {
        return sendJson(response, 200, {
          ok: true,
          admin,
          alreadyApplied: true,
          revision: world.revision,
          auditId: 0,
          adminControlSeq: Number(world.state.adminControlSeq || prior.seq || 0),
          summary: "이미 적용된 소지품 이동·복제 요청입니다.",
        });
      }
      const mutation = applyOperation(world.state, body, requestId);
      const result = await atomicApply(env, token, requestId, world, mutation, fetchImpl);
      if (result?.accepted) {
        return sendJson(response, 200, {
          ok: true,
          admin,
          alreadyApplied: result.already_applied === true,
          revision: Number(result.revision || world.revision),
          auditId: Number(result.audit_id || 0),
          adminControlSeq: Number(result.state?.adminControlSeq || mutation.patch.seq),
          summary: mutation.summary,
        });
      }
      if (result?.state?.version === 3) {
        world = { state: result.state, revision: Number(result.revision || 0) };
        continue;
      }
      world = await readWorldState(env, fetchImpl);
    }

    return sendJson(response, 409, { ok: false, code: "ADMIN_CONTROL_CONFLICT" });
  } catch (error) {
    const message = String(error?.message || "ADMIN_CONTROL_UNAVAILABLE");
    const known = new Set([
      "REQUEST_TOO_LARGE", "INVALID_JSON", "WORLD_STATE_UNAVAILABLE", "ADMIN_TARGET_CHARACTER_NOT_FOUND",
      "ADMIN_TARGET_SESSION_NOT_FOUND", "INVALID_CONTAMINATION", "ADMIN_CONTROL_NO_CHANGES", "ADMIN_ITEM_ID_REQUIRED",
      "INVALID_ITEM_QUANTITY", "ADMIN_ITEM_NAME_REQUIRED", "INVALID_SESSION_NODE", "INVALID_SESSION_VARIANT",
      "INVALID_SESSION_STATUS", "ADMIN_CONTROL_OPERATION_INVALID", "ADMIN_ITEM_TRANSFER_MODE_INVALID", "INVALID_ITEM_VARIANT",
      "ADMIN_WORLD_ITEM_SOURCE_NOT_FOUND", "ADMIN_WORLD_ITEM_ALREADY_CLAIMED", "ADMIN_SOURCE_CHARACTER_NOT_FOUND",
      "ADMIN_SOURCE_ITEM_NOT_FOUND", "ADMIN_ITEM_TRANSFER_SAME_CHARACTER", "ADMIN_ITEM_TRANSFER_RESERVED", "ADMIN_ITEM_TRANSFER_TARGET_COLLISION",
    ]);
    const status = Number(error?.statusCode || (known.has(message) ? 400 : 502));
    return sendJson(response, status >= 400 && status < 600 ? status : 502, { ok: false, code: known.has(message) ? message : "ADMIN_CONTROL_UNAVAILABLE" });
  }
}

export default async function handler(request, response) {
  return adminControlHandler(request, response);
}

export { applyOperation, characterStatusMutation, inventoryMutation, sessionMutation, attachPatch, patchEnvelope, ALLOWED_NODES };
