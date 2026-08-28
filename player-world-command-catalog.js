/*
 * The browser loads this as a classic script while the index API imports the
 * same CommonJS export. Keep command identity, payload shaping, and RPC
 * transport metadata in this one boundary.
 */
(function exposePlayerWorldCommandCatalog(root, factory) {
  const catalog = factory();
  if (typeof module === "object" && module.exports) module.exports = catalog;
  root.__BAEKJI_PLAYER_WORLD_COMMAND_CATALOG__ = catalog;
})(typeof globalThis === "object" ? globalThis : this, function createPlayerWorldCommandCatalog() {
  "use strict";

  const PARTY_ID = /^[A-Za-z0-9_-]{1,96}$/;

  function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function hasExactKeys(value, keys) {
    return isObject(value)
      && Object.keys(value).length === keys.length
      && keys.every((key) => Object.hasOwn(value, key));
  }

  function partyId(value) {
    return String(value || "");
  }

  function normalizedPartyName(value) {
    if (typeof value !== "string" || /[\u0000-\u001f\u007f]/.test(value)) return "";
    return value.trim().replace(/\s+/g, " ");
  }

  function emptyPayload(payload) {
    return hasExactKeys(payload, []);
  }

  function onePartyPayload(payload) {
    return hasExactKeys(payload, ["partyId"]) && PARTY_ID.test(partyId(payload.partyId));
  }

  function partyInviteePayload(payload) {
    return hasExactKeys(payload, ["partyId", "inviteeId"])
      && PARTY_ID.test(partyId(payload.partyId))
      && PARTY_ID.test(partyId(payload.inviteeId));
  }

  function renamePayload(payload) {
    const name = normalizedPartyName(payload?.name);
    return hasExactKeys(payload, ["partyId", "name"])
      && PARTY_ID.test(partyId(payload.partyId))
      && typeof payload.name === "string"
      && name.length >= 1
      && name.length <= 24;
  }

  function noParams() { return {}; }
  function partyParams(payload) { return { p_party_id: payload.partyId }; }
  function partyInviteeParams(payload) { return { p_party_id: payload.partyId, p_invitee_id: payload.inviteeId }; }
  function renameParams(payload) { return { p_party_id: payload.partyId, p_name: payload.name }; }

  function exactAllowedKeys(payload, required, optional = []) {
    if (!isObject(payload)) return false;
    const allowed = new Set([...required, ...optional]);
    return required.every((key) => Object.hasOwn(payload, key))
      && Object.keys(payload).every((key) => allowed.has(key));
  }

  function identifier(value, max = 160) {
    return typeof value === "string" && value.length >= 1 && value.length <= max && /^[A-Za-z0-9_:-]+$/.test(value);
  }

  function safeText(value, max = 1200, allowEmpty = false) {
    return typeof value === "string"
      && !/[\u0000-\u001f\u007f]/.test(value)
      && value.trim().length <= max
      && (allowEmpty || value.trim().length > 0);
  }

  function oneIdentifierPayload(key) {
    return (payload) => exactAllowedKeys(payload, [key]) && identifier(payload[key]);
  }

  function optionalTextPayload(required, optional, rules = {}) {
    return (payload) => exactAllowedKeys(payload, required, optional)
      && required.every((key) => rules[key]?.(payload[key]) ?? identifier(payload[key]))
      && optional.every((key) => !Object.hasOwn(payload, key) || (rules[key]?.(payload[key]) ?? safeText(payload[key], 1200, true)));
  }

  function identityCanonical(payload) {
    return Object.fromEntries(Object.entries(payload).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value]));
  }

  function genericDefinition(family, validate, canonicalize = identityCanonical) {
    return Object.freeze({ family, validate, canonicalize, rpcName: null, rpcParams: () => null });
  }

  const definitions = Object.freeze({
    CONFIRM_BRIEFING_V1: Object.freeze({ family: "party", rpcName: "baekji_player_confirm_briefing_v1", validate: emptyPayload, canonicalize: () => ({}), rpcParams: noParams }),
    DECLINE_PARTY_INVITE_V1: Object.freeze({ family: "party", rpcName: "baekji_player_decline_party_invite_v1", validate: onePartyPayload, canonicalize: (payload) => ({ partyId: partyId(payload.partyId) }), rpcParams: partyParams }),
    CANCEL_PARTY_INVITE_V1: Object.freeze({ family: "party", rpcName: "baekji_player_cancel_party_invite_v1", validate: partyInviteePayload, canonicalize: (payload) => ({ partyId: partyId(payload.partyId), inviteeId: partyId(payload.inviteeId) }), rpcParams: partyInviteeParams }),
    INVITE_PARTY_MEMBER_V1: Object.freeze({ family: "party", rpcName: "baekji_player_invite_party_member_v1", validate: partyInviteePayload, canonicalize: (payload) => ({ partyId: partyId(payload.partyId), inviteeId: partyId(payload.inviteeId) }), rpcParams: partyInviteeParams }),
    ACCEPT_PARTY_INVITE_V1: Object.freeze({ family: "party", rpcName: "baekji_player_accept_party_invite_v1", validate: onePartyPayload, canonicalize: (payload) => ({ partyId: partyId(payload.partyId) }), rpcParams: partyParams }),
    RENAME_PARTY_V1: Object.freeze({ family: "party", rpcName: "baekji_player_rename_party_v1", validate: renamePayload, canonicalize: (payload) => ({ partyId: partyId(payload.partyId), name: normalizedPartyName(payload.name) }), rpcParams: renameParams }),
    CREATE_PARTY_V1: Object.freeze({ family: "party", rpcName: "baekji_player_create_party_v1", validate: emptyPayload, canonicalize: () => ({}), rpcParams: noParams }),
    TOGGLE_PARTY_READY_V1: Object.freeze({ family: "party", rpcName: "baekji_player_toggle_party_ready_v1", validate: onePartyPayload, canonicalize: (payload) => ({ partyId: partyId(payload.partyId) }), rpcParams: partyParams }),
    LOCK_PARTY_COMPOSITION_V1: Object.freeze({ family: "party", rpcName: "baekji_player_lock_party_composition_v1", validate: onePartyPayload, canonicalize: (payload) => ({ partyId: partyId(payload.partyId) }), rpcParams: partyParams }),

    REOPEN_PARTY_RECRUITING_V1: genericDefinition("party", onePartyPayload),
    LEAVE_PARTY_V1: genericDefinition("party", onePartyPayload),
    REMOVE_PARTY_MEMBER_V1: genericDefinition("party", (payload) => exactAllowedKeys(payload, ["partyId", "memberId"]) && identifier(payload.partyId, 96) && identifier(payload.memberId, 96)),
    DISBAND_RECRUITING_PARTY_V1: genericDefinition("party", onePartyPayload),
    START_PARTY_SESSION_V1: genericDefinition("party", onePartyPayload),
    FORCE_START_PARTY_SESSION_V1: genericDefinition("party", onePartyPayload),
    ROLLBACK_BRIEFING_V1: genericDefinition("party", oneIdentifierPayload("sessionId")),
    ACTIVATE_SESSION_V1: genericDefinition("party", oneIdentifierPayload("sessionId")),
    DISBAND_COMPLETED_PARTY_V1: genericDefinition("party", oneIdentifierPayload("sessionId")),
    REQUEST_PARTY_TRANSFER_V1: genericDefinition("party", oneIdentifierPayload("targetPartyId")),
    APPROVE_PARTY_TRANSFER_V1: genericDefinition("party", oneIdentifierPayload("requestId")),
    REJECT_PARTY_TRANSFER_V1: genericDefinition("party", oneIdentifierPayload("requestId")),

    END_SESSION_V1: genericDefinition("investigation", oneIdentifierPayload("sessionId")),
    BEGIN_MOVEMENT_V1: genericDefinition("investigation", optionalTextPayload(
      ["sessionId", "routeId"], ["actionText", "itemId"],
      { sessionId: identifier, routeId: identifier, actionText: (value) => safeText(value, 700, true), itemId: (value) => identifier(value, 220) },
    )),
    SETTLE_MOVEMENT_V1: genericDefinition("investigation", (payload) => exactAllowedKeys(payload, ["sessionId", "movementToken"]) && identifier(payload.sessionId) && identifier(payload.movementToken, 220)),
    RESOLVE_HAZARD_V1: genericDefinition("investigation", (payload) => exactAllowedKeys(payload, ["sessionId", "movementToken", "hazardIndex", "hazardId", "actionText"], ["itemId", "targetId"])
      && identifier(payload.sessionId) && identifier(payload.movementToken, 220) && Number.isSafeInteger(payload.hazardIndex) && payload.hazardIndex >= 0 && payload.hazardIndex <= 99
      && identifier(payload.hazardId) && safeText(payload.actionText, 700)
      && (!Object.hasOwn(payload, "itemId") || identifier(payload.itemId, 220))
      && (!Object.hasOwn(payload, "targetId") || identifier(payload.targetId, 120))),
    INVESTIGATION_ACTION_V1: genericDefinition("investigation", (payload) => exactAllowedKeys(payload, ["sessionId", "kind"], ["targetId", "objectId", "itemId", "text"])
      && identifier(payload.sessionId) && ["DETAIL", "OBSERVE", "INSPECT", "TAKE", "ACTION_INPUT", "ITEM_UNAVAILABLE", "MAP", "HAZARD_HINT", "LISTEN", "CHECK_SELF", "WAIT", "OBSERVE_HAZARD", "IRRELEVANT_HAZARD_ACTION", "OBSERVE_DETAIL", "OBSERVE_SCENE", "MUNDANE_INSPECTION", "NAVIGATION_HINT", "ALREADY_AT_DESTINATION", "ROUTE_GUIDANCE", "AMBIGUOUS_MOVE", "OTHER"].includes(payload.kind)
      && ["targetId", "objectId", "itemId"].every((key) => !Object.hasOwn(payload, key) || identifier(payload[key], 220))
      && (!Object.hasOwn(payload, "text") || safeText(payload.text, 700, true))),
    SEND_FIELD_CHAT_V1: genericDefinition("investigation", (payload) => exactAllowedKeys(payload, ["sessionId", "text"]) && identifier(payload.sessionId) && safeText(payload.text, 700)),

    OFFER_ITEM_TRANSFER_V1: genericDefinition("inventory", (payload) => exactAllowedKeys(payload, ["receiverId", "inventoryKey", "quantity"], ["actionText", "source"])
      && identifier(payload.receiverId, 120) && identifier(payload.inventoryKey, 220) && Number.isSafeInteger(payload.quantity) && payload.quantity >= 1 && payload.quantity <= 99
      && (!Object.hasOwn(payload, "actionText") || safeText(payload.actionText, 700, true))
      && (!Object.hasOwn(payload, "source") || safeText(payload.source, 80, true))),
    RESOLVE_ITEM_TRANSFER_V1: genericDefinition("inventory", (payload) => exactAllowedKeys(payload, ["transferId", "decision"]) && identifier(payload.transferId, 220) && ["ACCEPT", "REJECT"].includes(payload.decision)),
    CANCEL_ITEM_TRANSFER_V1: genericDefinition("inventory", oneIdentifierPayload("transferId")),
    EXPIRE_ITEM_TRANSFER_V1: genericDefinition("inventory", oneIdentifierPayload("transferId")),
    CLAIM_FIELD_ITEM_V1: genericDefinition("inventory", (payload) => exactAllowedKeys(payload, ["sessionId", "objectId", "itemId"]) && identifier(payload.sessionId) && identifier(payload.objectId, 220) && identifier(payload.itemId, 220)),

    // AI output is deliberately not part of the envelope.  The API builds its
    // prompt from the canonical snapshot and supplies the resulting decision
    // only to the pure server reducer.
    CHARACTER_INTERACTION_V1: genericDefinition("ai", (payload) => exactAllowedKeys(payload, ["sessionId", "targetId", "actionText"])
      && identifier(payload.sessionId) && identifier(payload.targetId, 120) && safeText(payload.actionText, 700)),
    RESOLVE_FLEXIBLE_HAZARD_V1: genericDefinition("ai", (payload) => exactAllowedKeys(payload, ["sessionId", "movementToken", "hazardIndex", "hazardId", "actionText"], ["targetId"])
      && identifier(payload.sessionId) && identifier(payload.movementToken, 220) && Number.isSafeInteger(payload.hazardIndex) && payload.hazardIndex >= 0 && payload.hazardIndex <= 99
      && identifier(payload.hazardId, 160) && safeText(payload.actionText, 700)
      && (!Object.hasOwn(payload, "targetId") || identifier(payload.targetId, 120))),
  });

  function definition(command) {
    return typeof command === "string" ? definitions[command] || null : null;
  }

  function hasCommand(command) {
    return !!definition(command);
  }

  function validatePayload(command, payload) {
    const entry = definition(command);
    return !!entry && entry.validate(payload);
  }

  function canonicalizePayload(command, payload) {
    const entry = definition(command);
    return entry && entry.validate(payload) ? entry.canonicalize(payload) : null;
  }

  function rpcName(command) {
    return definition(command)?.rpcName || null;
  }

  function rpcParams(command, canonicalPayload) {
    const entry = definition(command);
    return entry && entry.validate(canonicalPayload) ? entry.rpcParams(canonicalPayload) : null;
  }

  function family(command) {
    return definition(command)?.family || null;
  }

  return Object.freeze({
    commands: Object.freeze(Object.keys(definitions)),
    hasCommand,
    validatePayload,
    canonicalizePayload,
    rpcName,
    rpcParams,
    family,
    normalizedPartyName,
  });
});
