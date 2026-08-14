(() => {
  "use strict";

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const USER_KEY = "baekji_city_mvp_current_user_v034";
  const STATE_KEY = "day1_world";
  const WRITER_KEY = "baekji_city_cloud_writer_v1";
  const SUPABASE_URL = "https://kfgtvifupumjuewwxzmz.supabase.co";
  const SUPABASE_KEY = "sb_publishable_KROAv1c1eX3wlEt8Mog8OQ_jNTMJzoM";
  const ACTIVE_POLL_MS = 1500;
  const HIDDEN_POLL_MS = 5000;
  const PUSH_DEBOUNCE_MS = 120;
  const RECOVERY_QUIET_MS = 4000;
  const UNSYNCED_KEY_PREFIX = "baekji_city_cloud_unsynced_v1:";

  const storageProto = typeof Storage !== "undefined" ? Storage.prototype : null;
  const nativeSetItem = storageProto?.setItem;
  const nativeRemoveItem = storageProto?.removeItem;
  const nativeGetItem = storageProto?.getItem;

  let initialized = false;
  let bootstrapInFlight = false;
  let applyingRemote = false;
  let revision = 0;
  let pendingRaw = null;
  let pendingGeneration = 0;
  let unsyncedRaw = null;
  let unsyncedGeneration = 0;
  let unsyncedOwnerKey = "";
  let remoteBasisRaw = null;
  let recoveryTimer = 0;
  let recoveryNotBefore = 0;
  let recoveryOwnerId = "";
  let recoveryOwnerKey = "";
  let pushTimer = 0;
  let pushInFlight = false;
  let pollTimer = 0;

  function activeUserId() {
    try { return String(sessionStorage.getItem(USER_KEY) || ""); }
    catch { return ""; }
  }

  function syncEnabled() {
    return Boolean(activeUserId());
  }

  function unsyncedKey(userId = activeUserId()) {
    return userId ? `${UNSYNCED_KEY_PREFIX}${userId}` : "";
  }

  function syncOwner() {
    const userId = activeUserId();
    return { userId, overlayKey: unsyncedKey(userId) };
  }

  function sameSyncOwner(owner) {
    return Boolean(owner?.userId && activeUserId() === owner.userId && unsyncedKey() === owner.overlayKey);
  }

  function parseUnsyncedRecord(raw) {
    try {
      const record = JSON.parse(raw || "null");
      if (record?.format !== 1 || !safeParse(record.baseRaw) || !safeParse(record.stateRaw)) return null;
      return record;
    } catch {
      return null;
    }
  }

  function persistUnsyncedOverlayForOwner(state, owner, updateActiveMemory = sameSyncOwner(owner), baseState = safeParse(remoteBasisRaw), generation = null) {
    if (!owner?.overlayKey || !state || state.version !== 3 || !baseState || baseState.version !== 3) return null;
    const nextGeneration = generation == null ? unsyncedGeneration + 1 : Number(generation || 0);
    const raw = JSON.stringify({
      format: 1,
      ownerId: owner.userId,
      generation: nextGeneration,
      baseRaw: JSON.stringify(baseState),
      stateRaw: JSON.stringify(state),
    });
    nativeSetItem?.call(localStorage, owner.overlayKey, raw);
    if (updateActiveMemory) {
      unsyncedRaw = raw;
      unsyncedOwnerKey = owner.overlayKey;
      unsyncedGeneration = nextGeneration;
    }
    return state;
  }

  function loadUnsyncedOverlay() {
    const key = unsyncedKey();
    unsyncedOwnerKey = key;
    unsyncedRaw = key ? nativeGetItem?.call(localStorage, key) || null : null;
    const record = parseUnsyncedRecord(unsyncedRaw);
    if (!record || record.ownerId !== activeUserId()) {
      unsyncedRaw = null;
      unsyncedGeneration = 0;
      return null;
    }
    unsyncedGeneration = Number(record.generation || 0);
    return safeParse(record.stateRaw);
  }

  function persistUnsyncedOverlay(state) {
    return persistUnsyncedOverlayForOwner(state, syncOwner(), true);
  }

  function clearUnsyncedOverlay(generation = unsyncedGeneration) {
    if (generation !== unsyncedGeneration) return false;
    const key = unsyncedKey();
    if (key) nativeRemoveItem?.call(localStorage, key);
    unsyncedRaw = null;
    unsyncedOwnerKey = "";
    clearTimeout(recoveryTimer);
    recoveryTimer = 0;
    recoveryOwnerId = "";
    recoveryOwnerKey = "";
    return true;
  }

  function activeUnsyncedOverlay() {
    if (unsyncedOwnerKey !== unsyncedKey()) return loadUnsyncedOverlay();
    return safeParse(parseUnsyncedRecord(unsyncedRaw)?.stateRaw);
  }

  function activeUnsyncedRecord() {
    if (unsyncedOwnerKey !== unsyncedKey()) loadUnsyncedOverlay();
    return parseUnsyncedRecord(unsyncedRaw);
  }

  function safeParse(raw) {
    try {
      const value = JSON.parse(raw || "null");
      return value?.version === 3 ? value : null;
    } catch {
      return null;
    }
  }

  function stableArrayKey(value) {
    if (value == null || typeof value !== "object") return `p:${JSON.stringify(value)}`;
    const direct = value.id ?? value.key ?? value.token ?? value.sequenceNo ?? value.sequence_no ?? value.requestId;
    if (direct != null) return `i:${String(direct)}`;
    return `o:${JSON.stringify([
      value.type ?? value.kind ?? value.eventType ?? value.action ?? "",
      value.at ?? value.createdAt ?? value.startedAt ?? "",
      value.actorId ?? value.actor_character_id ?? "",
      value.text ?? value.publicText ?? value.public_text ?? "",
      value.scopeKey ?? value.routeId ?? value.objectId ?? value.targetId ?? "",
    ])}`;
  }

  function mergeArrays(remote, local) {
    const output = [];
    const seen = new Map();
    [...(Array.isArray(remote) ? remote : []), ...(Array.isArray(local) ? local : [])].forEach((value) => {
      const key = stableArrayKey(value);
      if (!seen.has(key)) {
        seen.set(key, output.length);
        output.push(value);
        return;
      }
      const index = seen.get(key);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        output[index] = mergeValues(output[index], value);
      }
    });
    return output;
  }

  function mergeValues(remote, local) {
    if (Array.isArray(remote) || Array.isArray(local)) return mergeArrays(remote, local);
    if (remote && local && typeof remote === "object" && typeof local === "object") {
      const result = { ...remote };
      Object.keys(local).forEach((key) => {
        result[key] = key in remote ? mergeValues(remote[key], local[key]) : local[key];
      });
      return result;
    }
    return local === undefined ? remote : local;
  }

  function movementTerminalMarker(session, movement) {
    const marker = session?.lastMovementTransition;
    if (!marker || !movement || marker.token !== movement.token) return null;
    if (marker.kind !== "ARRIVED" && marker.kind !== "ENCOUNTER") return null;
    return marker;
  }

  function legacyMovementCompletionEvidence(session, movement) {
    if (!session || !movement || session.lastMovementTransition) return false;
    if (movement.targetNode && String(session.currentNode || "") === String(movement.targetNode)) return true;
    const encounter = session.activeEncounter;
    return Boolean(encounter && (
      (movement.routeId && encounter.routeId === movement.routeId)
      || (movement.fromNode && movement.targetNode
        && encounter.fromNode === movement.fromNode
        && encounter.targetNode === movement.targetNode)
    ));
  }

  function synthesizeLegacyMovementTransition(session, movement) {
    const encounter = session?.activeEncounter;
    const kind = encounter ? "ENCOUNTER" : "ARRIVED";
    return {
      token: movement.token,
      kind,
      routeId: movement.routeId || encounter?.routeId || "",
      fromNode: movement.fromNode || encounter?.fromNode || "",
      targetNode: movement.targetNode || encounter?.targetNode || session?.currentNode || "",
      completedAt: Math.max(0, Number(session?.endedAt || movement.resolveAt || movement.startedAt || 0)),
    };
  }

  function copyMovementTransition(target, source) {
    ["movement", "currentNode", "currentDetailId", "activeEncounter", "choiceReveal", "lastMovementTransition"].forEach((key) => {
      if (hasOwn(source, key)) target[key] = source[key];
      else delete target[key];
    });
    return target;
  }

  function sameMovementOrigin(session, movement, otherSession) {
    const node = String(session?.currentNode || "");
    return Boolean(node && (
      node === String(movement?.fromNode || "")
      || node === String(otherSession?.currentNode || "")
    ));
  }

  function reconcileSessionMovement(remoteSession, localSession, mergedSession) {
    if (!remoteSession || !localSession || !mergedSession) return mergedSession;
    const remoteMovement = remoteSession.movement || null;
    const localMovement = localSession.movement || null;

    if (remoteMovement && !localMovement) {
      if (movementTerminalMarker(localSession, remoteMovement)) {
        return copyMovementTransition(mergedSession, localSession);
      }
      if (legacyMovementCompletionEvidence(localSession, remoteMovement)) {
        copyMovementTransition(mergedSession, localSession);
        mergedSession.lastMovementTransition = synthesizeLegacyMovementTransition(localSession, remoteMovement);
        return mergedSession;
      }
      if (sameMovementOrigin(localSession, remoteMovement, remoteSession)) {
        return copyMovementTransition(mergedSession, remoteSession);
      }
      return mergedSession;
    }

    if (!remoteMovement && localMovement) {
      if (movementTerminalMarker(remoteSession, localMovement)) {
        return copyMovementTransition(mergedSession, remoteSession);
      }
      if (legacyMovementCompletionEvidence(remoteSession, localMovement)) {
        copyMovementTransition(mergedSession, remoteSession);
        mergedSession.lastMovementTransition = synthesizeLegacyMovementTransition(remoteSession, localMovement);
        return mergedSession;
      }
      return copyMovementTransition(mergedSession, localSession);
    }

    if (!remoteMovement || !localMovement) {
      const remoteMarkerAt = Number(remoteSession.lastMovementTransition?.completedAt || 0);
      const localMarkerAt = Number(localSession.lastMovementTransition?.completedAt || 0);
      if (!remoteMarkerAt && !localMarkerAt) return mergedSession;
      return copyMovementTransition(mergedSession, remoteMarkerAt > localMarkerAt ? remoteSession : localSession);
    }
    if (movementTerminalMarker(remoteSession, remoteMovement)) {
      return copyMovementTransition(mergedSession, remoteSession);
    }
    if (movementTerminalMarker(localSession, localMovement)) {
      return copyMovementTransition(mergedSession, localSession);
    }
    if (String(remoteMovement.token || "") !== String(localMovement.token || "")) {
      const remoteStartedAt = Number(remoteMovement.startedAt || 0);
      const localStartedAt = Number(localMovement.startedAt || 0);
      const remoteIsNewer = remoteStartedAt > localStartedAt
        || (remoteStartedAt === localStartedAt && String(remoteMovement.token || "") > String(localMovement.token || ""));
      return copyMovementTransition(mergedSession, remoteIsNewer ? remoteSession : localSession);
    }

    const movement = mergeValues(remoteMovement, localMovement);
    movement.resolveAt = Math.max(Number(remoteMovement.resolveAt || 0), Number(localMovement.resolveAt || 0));
    if (remoteMovement.mobilityFoundationAdjusted || localMovement.mobilityFoundationAdjusted) {
      movement.mobilityFoundationAdjusted = true;
      movement.mobilityPenalty = localMovement.mobilityFoundationAdjusted
        ? localMovement.mobilityPenalty
        : remoteMovement.mobilityPenalty;
    }
    copyMovementTransition(mergedSession, localSession);
    mergedSession.movement = movement;
    return mergedSession;
  }

  function reconcileMovementTransitions(remote, local, merged) {
    if (!merged || merged.version !== 3) return merged;
    const remoteSessions = remote?.sessions || {};
    const localSessions = local?.sessions || {};
    Object.keys(merged.sessions || {}).forEach((sessionId) => {
      reconcileSessionMovement(remoteSessions[sessionId], localSessions[sessionId], merged.sessions[sessionId]);
    });
    return merged;
  }

  function acceptedLocalMovementTerminal(localSession, remoteSession) {
    const remoteMovement = remoteSession?.movement || null;
    const marker = localSession?.lastMovementTransition;
    if (!marker || localSession?.movement || (marker.kind !== "ARRIVED" && marker.kind !== "ENCOUNTER")) return null;
    if (remoteMovement && marker.token !== remoteMovement.token) return null;
    if (marker.routeId && remoteMovement?.routeId && marker.routeId !== remoteMovement.routeId) return null;
    if (marker.kind === "ENCOUNTER") {
      const encounter = localSession.activeEncounter;
      if (!encounter || (marker.routeId && encounter.routeId !== marker.routeId)) return null;
    } else if (String(localSession.currentNode || "") !== String(marker.targetNode || remoteMovement?.targetNode || "")) {
      return null;
    }
    if (remoteMovement) return marker;

    const remoteMarker = remoteSession?.lastMovementTransition;
    if (!remoteMarker || remoteMarker.token !== marker.token) return null;
    if (marker.kind === "ARRIVED" && remoteMarker.kind === "ENCOUNTER") return marker;
    if (marker.kind === "ENCOUNTER" && remoteMarker.kind === "ENCOUNTER") {
      const localProgress = Math.max(Number(localSession.activeEncounter?.currentIndex || 0), localSession.activeEncounter?.resolutions?.length || 0);
      const remoteProgress = Math.max(Number(remoteSession.activeEncounter?.currentIndex || 0), remoteSession.activeEncounter?.resolutions?.length || 0);
      return localProgress > remoteProgress ? marker : null;
    }
    return marker.kind === remoteMarker.kind && Number(marker.completedAt || 0) > Number(remoteMarker.completedAt || 0)
      ? marker
      : null;
  }

  function contaminationStage(value) {
    if (value >= 100) return "완전 용해";
    if (value >= 80) return "붕락";
    if (value >= 60) return "용해";
    if (value >= 40) return "유화";
    if (value >= 20) return "번짐";
    return "안정";
  }

  function preserveAcceptedLocalMovementTransitions(remote, currentLocal) {
    if (!remote || remote.version !== 3 || !currentLocal || currentLocal.version !== 3) return remote;
    const protectedState = JSON.parse(JSON.stringify(remote));
    const acceptedTokens = new Map();
    Object.entries(remote.sessions || {}).forEach(([sessionId, remoteSession]) => {
      const localSession = currentLocal.sessions?.[sessionId];
      const marker = acceptedLocalMovementTerminal(localSession, remoteSession);
      if (!marker) return;
      copyMovementTransition(protectedState.sessions[sessionId], localSession);
      acceptedTokens.set(String(marker.token), { marker, sessionId });
    });
    if (!acceptedTokens.size) return remote;

    Object.entries(currentLocal.sessions || {}).forEach(([sessionId, localSession]) => {
      const targetSession = protectedState.sessions?.[sessionId];
      if (!targetSession) return;
      const terminalLogs = (localSession.logs || []).filter((entry) => acceptedTokens.has(String(entry?.movementToken || "")));
      if (terminalLogs.length) targetSession.logs = mergeArrays(targetSession.logs || [], terminalLogs);
    });
    acceptedTokens.forEach(({ marker, sessionId }) => {
      Object.entries(marker.contaminationDeltas || {}).forEach(([characterId, rawDelta]) => {
        const character = protectedState.characters?.[characterId];
        const delta = Math.max(0, Number(rawDelta || 0));
        if (!character || !delta) return;
        const current = Number(character.contamination || 0);
        const localBaseline = Number(marker.contaminationBaselines?.[characterId]);
        const remoteMarker = remote.sessions?.[sessionId]?.lastMovementTransition;
        const sameTokenRemoteMarker = remoteMarker?.token === marker.token ? remoteMarker : null;
        const remoteBaseline = Number(sameTokenRemoteMarker?.contaminationBaselines?.[characterId]);
        const remoteDelta = Math.max(0, Number(sameTokenRemoteMarker?.contaminationDeltas?.[characterId] || 0));
        if (Number.isFinite(localBaseline)) {
          const comparableBaseline = Number.isFinite(remoteBaseline) ? remoteBaseline : localBaseline;
          const unrelatedDelta = Math.max(0, current - comparableBaseline - remoteDelta);
          character.contamination = Math.min(100, localBaseline + delta + unrelatedDelta);
        } else {
          character.contamination = Math.min(100, current + Math.max(0, delta - remoteDelta));
        }
        character.symptom = contaminationStage(character.contamination);
      });
    });
    return protectedState;
  }

  function reconcileCompletedPartyDisbands(remote, local, merged) {
    if (!merged || merged.version !== 3) return merged;
    const markerSessions = new Map();
    [remote, local, merged].forEach((state) => {
      Object.entries(state?.sessions || {}).forEach(([sessionId, session]) => {
        if (session?.status !== "COMPLETED" || !session.partyDisbandedAt) return;
        const known = markerSessions.get(sessionId);
        if (!known || Number(session.partyDisbandedAt) > Number(known.partyDisbandedAt)) markerSessions.set(sessionId, session);
      });
    });
    markerSessions.forEach((markerSession, sessionId) => {
      merged.sessions ||= {};
      if (!merged.sessions[sessionId]) merged.sessions[sessionId] = JSON.parse(JSON.stringify(markerSession));
      const session = merged.sessions[sessionId];
      session.status = "COMPLETED";
      session.partyDisbandedAt = markerSession.partyDisbandedAt;
      session.partyDisbandedBy = markerSession.partyDisbandedBy || null;
      const partyId = markerSession.partyId;
      const party = merged.parties?.[partyId];
      if (party) {
        party.status = "CLOSED";
        party.archivedAt = markerSession.partyDisbandedAt;
        party.archivedSessionId = sessionId;
        party.memberIds = [];
        party.invitedIds = [];
        party.declinedIds = [];
        party.confirmedBy = [];
        party.readyBy = [];
        party.readyStateBy = {};
        party.sessionId = null;
      }
      [...new Set(markerSession.memberIds || [])].forEach((memberId) => {
        const character = merged.characters?.[memberId];
        if (!character) return;
        if (character.currentPartyId === partyId) character.currentPartyId = null;
        if (character.currentSessionId === sessionId) character.currentSessionId = null;
      });
    });
    return merged;
  }

  function preserveAcceptedLocalPartyDisbands(remote, currentLocal) {
    if (!remote || remote.version !== 3 || !currentLocal || currentLocal.version !== 3) return remote;
    const localMarkers = Object.values(currentLocal.sessions || {}).filter((session) => session?.status === "COMPLETED" && session.partyDisbandedAt);
    if (!localMarkers.length) return remote;
    const protectedState = JSON.parse(JSON.stringify(remote));
    localMarkers.forEach((markerSession) => {
      const remoteMarker = remote.sessions?.[markerSession.id];
      const preservesLocalCharacter = !remoteMarker?.partyDisbandedAt || Number(markerSession.partyDisbandedAt) > Number(remoteMarker.partyDisbandedAt);
      if (!preservesLocalCharacter) return;
      [...new Set(markerSession.memberIds || [])].forEach((memberId) => {
        const localCharacter = currentLocal.characters?.[memberId];
        if (!localCharacter) return;
        protectedState.characters ||= {};
        protectedState.characters[memberId] = JSON.parse(JSON.stringify(localCharacter));
      });
    });
    return reconcileCompletedPartyDisbands(remote, currentLocal, protectedState);
  }

  function hasOwn(object, key) {
    return Boolean(object && Object.prototype.hasOwnProperty.call(object, key));
  }

  function adminControlSeq(state) {
    return Math.max(0, Number(state?.adminControlSeq || 0));
  }

  function adminControlHistory(state) {
    return (Array.isArray(state?.adminControlPatches) ? state.adminControlPatches : [])
      .filter((patch) => Number(patch?.seq || 0) > 0)
      .sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0));
  }

  function applyAdminControlPatch(state, patch) {
    if (!state || state.version !== 3 || !patch || typeof patch !== "object") return state;
    const action = String(patch.action || "");
    const data = patch.data && typeof patch.data === "object" ? patch.data : {};
    const targetId = String(patch.targetId || "");

    if (action === "CHARACTER_STATUS") {
      const character = state.characters?.[targetId];
      if (!character) return state;
      if (hasOwn(data, "contamination")) character.contamination = Math.max(0, Math.min(100, Number(data.contamination) || 0));
      if (hasOwn(data, "symptom")) character.symptom = String(data.symptom || "안정");
      return state;
    }

    if (action === "INVENTORY_SET") {
      const characterId = String(data.characterId || targetId);
      const itemId = String(data.itemId || "");
      const character = state.characters?.[characterId];
      if (!character || !itemId) return state;
      if (!character.inventory || typeof character.inventory !== "object") character.inventory = {};
      if (data.item == null) delete character.inventory[itemId];
      else character.inventory[itemId] = { ...data.item, itemId };
      return state;
    }

    if (action === "INVENTORY_TRANSFER") {
      (Array.isArray(data.inventoryChanges) ? data.inventoryChanges : []).forEach((change) => {
        const characterId = String(change?.characterId || "");
        const inventoryKey = String(change?.inventoryKey || "");
        const character = state.characters?.[characterId];
        if (!character || !inventoryKey) return;
        if (!character.inventory || typeof character.inventory !== "object") character.inventory = {};
        if (change.item == null) delete character.inventory[inventoryKey];
        else character.inventory[inventoryKey] = JSON.parse(JSON.stringify(change.item));
      });
      const claimChange = data.claimChange;
      if (claimChange && typeof claimChange === "object") {
        const variant = String(claimChange.variant || "");
        const claimKey = String(claimChange.claimKey || "");
        if (variant && claimKey) {
          state.itemClaimsByVariant ||= {};
          const claims = state.itemClaimsByVariant[variant] || (state.itemClaimsByVariant[variant] = {});
          if (claimChange.claim == null) delete claims[claimKey];
          else claims[claimKey] = JSON.parse(JSON.stringify(claimChange.claim));
        }
      }
      const fieldPlacementChange = data.fieldPlacementChange;
      if (fieldPlacementChange && typeof fieldPlacementChange === "object") {
        const variant = String(fieldPlacementChange.variant || "");
        const placementId = String(fieldPlacementChange.placementId || "");
        if (variant && placementId) {
          state.fieldItemPlacementsByVariant ||= {};
          const placements = state.fieldItemPlacementsByVariant[variant] || (state.fieldItemPlacementsByVariant[variant] = {});
          if (fieldPlacementChange.placement == null) delete placements[placementId];
          else placements[placementId] = JSON.parse(JSON.stringify(fieldPlacementChange.placement));
        }
      }
      return state;
    }

    if (action === "SESSION_CONTROL") {
      const session = state.sessions?.[targetId];
      if (!session) return state;
      if (hasOwn(data, "nodeId")) {
        session.currentNode = String(data.nodeId || session.currentNode || "");
        session.currentDetailId = null;
      }
      if (data.clearTransient === true) {
        session.movement = null;
        session.activeEncounter = null;
        session.choiceReveal = { type: "persistent-menu", at: Number(patch.at || Date.now()) };
      }
      if (hasOwn(data, "variant")) session.variant = String(data.variant || session.variant || "a");
      if (hasOwn(data, "status")) {
        session.status = String(data.status || session.status || "ACTIVE");
        session.endedAt = session.status === "COMPLETED" ? Number(patch.at || Date.now()) : null;
      }
      return state;
    }

    return state;
  }

  function reconcileAdminControl(remote, local, merged) {
    if (!merged || merged.version !== 3) return merged;
    const localSeq = adminControlSeq(local);
    const remoteSeq = adminControlSeq(remote);
    const history = mergeArrays(adminControlHistory(remote), adminControlHistory(local))
      .filter((patch) => Number(patch?.seq || 0) > 0)
      .sort((a, b) => Number(a.seq || 0) - Number(b.seq || 0))
      .slice(-1000);

    if (remoteSeq > localSeq) {
      adminControlHistory(remote)
        .filter((patch) => Number(patch.seq || 0) > localSeq && Number(patch.seq || 0) <= remoteSeq)
        .forEach((patch) => applyAdminControlPatch(merged, patch));
    }

    merged.adminControlSeq = Math.max(localSeq, remoteSeq);
    if (history.length) merged.adminControlPatches = history;
    return merged;
  }

  function reconcileFieldItemPlacements(remote, local, merged) {
    if (!merged || merged.version !== 3) return merged;
    merged.fieldItemPlacementsByVariant ||= {};
    merged.fieldItemPlacementClaimsByVariant ||= {};
    ["a", "b", "c", "d"].forEach((variant) => {
      const placements = merged.fieldItemPlacementsByVariant?.[variant] || {};
      const remoteClaims = remote?.fieldItemPlacementClaimsByVariant?.[variant] || {};
      const localClaims = local?.fieldItemPlacementClaimsByVariant?.[variant] || {};
      const claims = {};
      Object.keys(placements).forEach((placementId) => {
        const remoteClaim = remoteClaims[placementId];
        const localClaim = localClaims[placementId];
        const winner = remoteClaim || localClaim;
        if (!winner) return;
        claims[placementId] = JSON.parse(JSON.stringify(winner));
        [remoteClaim, localClaim].filter(Boolean).forEach((candidate) => {
          if (candidate === winner || (candidate.characterId === winner.characterId && candidate.targetInventoryKey === winner.targetInventoryKey)) return;
          const inventory = merged.characters?.[candidate.characterId]?.inventory;
          const item = inventory?.[candidate.targetInventoryKey];
          if (item?._fieldPlacementId === placementId) delete inventory[candidate.targetInventoryKey];
        });
        const placement = placements[placementId];
        const character = merged.characters?.[winner.characterId];
        const targetKey = String(winner.targetInventoryKey || placement?.sourceInventoryKey || "");
        if (!character || !targetKey || !placement?.item) return;
        character.inventory ||= {};
        if (!character.inventory[targetKey]) {
          const item = JSON.parse(JSON.stringify(placement.item));
          if (targetKey !== String(placement.sourceInventoryKey || "")) item.itemId = targetKey;
          item._fieldPlacementId = placementId;
          character.inventory[targetKey] = item;
        }
      });
      merged.fieldItemPlacementsByVariant[variant] = placements;
      merged.fieldItemPlacementClaimsByVariant[variant] = claims;
    });
    return merged;
  }

  function mergeCloudStates(remote, local) {
    // Legacy contract equivalent: reconcileAdminControl(result.state, localState, mergeValues(result.state, localState))
    const merged = reconcileMovementTransitions(remote, local, mergeValues(remote, local));
    return reconcileFieldItemPlacements(remote, local, reconcileCompletedPartyDisbands(remote, local, reconcileAdminControl(remote, local, merged)));
  }

  function valuesEqual(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function rebaseArrayDelta(base, desired, remote, path) {
    if (valuesEqual(desired, base)) return remote;
    if (valuesEqual(remote, base)) return desired;
    const baseValues = Array.isArray(base) ? base : [];
    const desiredValues = Array.isArray(desired) ? desired : [];
    const remoteValues = Array.isArray(remote) ? remote : [];
    const baseByKey = new Map(baseValues.map((value) => [stableArrayKey(value), value]));
    const desiredByKey = new Map(desiredValues.map((value) => [stableArrayKey(value), value]));
    const removed = new Set([...baseByKey.keys()].filter((key) => !desiredByKey.has(key)));
    const output = [];
    const outputKeys = new Set();

    remoteValues.forEach((remoteValue) => {
      const key = stableArrayKey(remoteValue);
      if (removed.has(key)) return;
      const baseValue = baseByKey.get(key);
      const desiredValue = desiredByKey.get(key);
      const nextValue = desiredByKey.has(key) && baseByKey.has(key)
        ? rebaseUnsyncedValue(baseValue, desiredValue, remoteValue, [...path, key])
        : remoteValue;
      output.push(nextValue);
      outputKeys.add(key);
    });
    desiredValues.forEach((desiredValue) => {
      const key = stableArrayKey(desiredValue);
      if (!baseByKey.has(key) && !outputKeys.has(key)) {
        output.push(desiredValue);
        outputKeys.add(key);
      }
    });
    return output;
  }

  function rebaseUnsyncedValue(base, desired, remote, path = []) {
    if (valuesEqual(desired, base)) return remote;
    if (valuesEqual(remote, base)) return desired;
    if (Array.isArray(base) || Array.isArray(desired) || Array.isArray(remote)) {
      return rebaseArrayDelta(base, desired, remote, path);
    }
    const baseObject = base && typeof base === "object";
    const desiredObject = desired && typeof desired === "object";
    const remoteObject = remote && typeof remote === "object";
    if (!baseObject || !desiredObject || !remoteObject) return desired;

    const result = {};
    const keys = new Set([...Object.keys(base), ...Object.keys(desired), ...Object.keys(remote)]);
    keys.forEach((key) => {
      const baseHas = hasOwn(base, key);
      const desiredHas = hasOwn(desired, key);
      const remoteHas = hasOwn(remote, key);
      if (!desiredHas && baseHas) return;
      if (!desiredHas) {
        if (remoteHas) result[key] = remote[key];
        return;
      }
      if (!baseHas) {
        result[key] = desired[key];
        return;
      }
      result[key] = rebaseUnsyncedValue(base[key], desired[key], remoteHas ? remote[key] : undefined, [...path, key]);
    });

    if (path.length === 2 && path[0] === "sessions") {
      const transitionKeys = ["movement", "currentNode", "currentDetailId", "activeEncounter", "choiceReveal", "lastMovementTransition"];
      if (transitionKeys.some((key) => !valuesEqual(base[key], desired[key]))) {
        reconcileSessionMovement(remote, desired, result);
      }
    }
    return result;
  }

  function rebaseUnsyncedOverlay(base, desired, latestRemote) {
    if (!base || !desired || !latestRemote) return desired || latestRemote;
    const rebased = rebaseUnsyncedValue(base, desired, latestRemote, []);
    return reconcileFieldItemPlacements(latestRemote, desired, reconcileCompletedPartyDisbands(latestRemote, desired, reconcileAdminControl(latestRemote, desired, rebased)));
  }

  function writerId() {
    let value = nativeGetItem?.call(localStorage, WRITER_KEY) || "";
    if (!value) {
      value = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      nativeSetItem?.call(localStorage, WRITER_KEY, value);
    }
    return `${activeUserId() || "inactive"}:${value}`;
  }

  async function rpc(name, body) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`SYNC_RPC_${name}_${response.status}`);
      if (response.status === 204) return null;
      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function readRemoteState() {
    const rows = await rpc("baekji_mvp_get_state", { p_state_key: STATE_KEY });
    return Array.isArray(rows) ? rows[0] || null : rows || null;
  }

  async function readRemoteRevision() {
    const value = await rpc("baekji_mvp_get_revision", { p_state_key: STATE_KEY });
    return Number(value || 0);
  }

  async function putRemoteState(state, expectedRevision) {
    const rows = await rpc("baekji_mvp_put_state", {
      p_state_key: STATE_KEY,
      p_state: state,
      p_writer_id: writerId(),
      p_expected_revision: expectedRevision || null,
    });
    return Array.isArray(rows) ? rows[0] || null : rows || null;
  }

  function notifyStatus(status, detail = {}) {
    document.documentElement.dataset.cloudSyncStatus = status;
    window.dispatchEvent(new CustomEvent("baekji-cloud-sync", { detail: { status, revision, ...detail } }));
  }

  function suspendSync() {
    clearTimeout(pushTimer);
    clearTimeout(pollTimer);
    clearTimeout(recoveryTimer);
    pushTimer = 0;
    pollTimer = 0;
    recoveryTimer = 0;
    recoveryOwnerId = "";
    recoveryOwnerKey = "";
    pendingRaw = null;
    initialized = false;
    if (document.documentElement.dataset.cloudSyncStatus !== "idle") notifyStatus("idle");
  }

  function dispatchExternalUpdate(oldValue, newValue) {
    try {
      window.dispatchEvent(new StorageEvent("storage", {
        key: GLOBAL_KEY,
        oldValue,
        newValue,
        storageArea: localStorage,
        url: location.href,
      }));
    } catch {
      const event = new Event("storage");
      Object.defineProperty(event, "key", { value: GLOBAL_KEY });
      window.dispatchEvent(event);
    }
  }

  function applyRemoteState(row) {
    if (!syncEnabled()) return false;
    const remote = row?.state;
    if (!remote || remote.version !== 3) return false;
    const oldRaw = nativeGetItem.call(localStorage, GLOBAL_KEY);
    const currentLocal = safeParse(oldRaw);
    const protectedRemote = preserveAcceptedLocalPartyDisbands(preserveAcceptedLocalMovementTransitions(remote, currentLocal), currentLocal);
    const record = activeUnsyncedRecord();
    const base = safeParse(record?.baseRaw);
    const desired = safeParse(record?.stateRaw);
    const nextState = base && desired ? rebaseUnsyncedOverlay(base, desired, protectedRemote) : protectedRemote;
    const nextRaw = JSON.stringify(nextState);
    remoteBasisRaw = JSON.stringify(remote);
    if (record && base && desired) {
      persistUnsyncedOverlayForOwner(nextState, syncOwner(), true, remote, record.generation);
    }
    revision = Number(row.revision || 0);
    if (oldRaw === nextRaw) return false;
    applyingRemote = true;
    try {
      nativeSetItem.call(localStorage, GLOBAL_KEY, nextRaw);
    } finally {
      applyingRemote = false;
    }
    dispatchExternalUpdate(oldRaw, nextRaw);
    return true;
  }

  function preserveCurrentCharacterOnBootstrap(row) {
    const remote = row?.state;
    if (!remote || remote.version !== 3) return null;
    const userId = activeUserId();
    if (!userId || remote.characters?.[userId]) return null;
    const localState = safeParse(pendingRaw || nativeGetItem.call(localStorage, GLOBAL_KEY));
    const localCharacter = localState?.characters?.[userId];
    if (!localCharacter) return null;

    const merged = {
      ...remote,
      characters: {
        ...(remote.characters || {}),
        [userId]: localCharacter,
      },
    };
    const mergedRaw = JSON.stringify(merged);
    const oldRaw = nativeGetItem.call(localStorage, GLOBAL_KEY);
    revision = Number(row.revision || 0);
    remoteBasisRaw = JSON.stringify(remote);
    if (oldRaw !== mergedRaw) {
      applyingRemote = true;
      try { nativeSetItem.call(localStorage, GLOBAL_KEY, mergedRaw); }
      finally { applyingRemote = false; }
      dispatchExternalUpdate(oldRaw, mergedRaw);
    }
    pendingRaw = mergedRaw;
    pendingGeneration += 1;
    return merged;
  }

  function schedulePush(raw) {
    if (!syncEnabled()) return;
    if (!safeParse(raw)) return;
    const state = safeParse(raw);
    const record = activeUnsyncedRecord();
    const pendingState = state;
    pendingRaw = JSON.stringify(pendingState);
    if (record) {
      persistUnsyncedOverlayForOwner(
        pendingState,
        syncOwner(),
        true,
        safeParse(record.baseRaw),
      );
    }
    pendingGeneration += 1;
    if (!initialized || applyingRemote) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(flushPush, PUSH_DEBOUNCE_MS);
  }

  async function flushPush() {
    if (!syncEnabled()) {
      pendingRaw = null;
      return;
    }
    if (!initialized || pushInFlight || !pendingRaw) return;
    const raw = pendingRaw;
    const batchOwner = syncOwner();
    const batchGeneration = pendingGeneration;
    const batchUnsyncedGeneration = unsyncedGeneration;
    let batchBase = safeParse(activeUnsyncedRecord()?.baseRaw) || safeParse(remoteBasisRaw);
    pendingRaw = null;
    const localState = safeParse(raw);
    if (!localState) return;
    pushInFlight = true;
    notifyStatus("saving");
    try {
      const maxAttempts = 3;
      let candidate = localState;
      let result = null;
      let conflictCount = 0;
      for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        result = await putRemoteState(candidate, attempt === 0 ? revision : Number(result?.revision || 0));
        if (!sameSyncOwner(batchOwner)) {
          const abandoned = result?.state?.version === 3 && batchBase
            ? rebaseUnsyncedOverlay(batchBase, candidate, result.state)
            : candidate;
          persistUnsyncedOverlayForOwner(abandoned, batchOwner, false, result?.state?.version === 3 ? result.state : batchBase, batchUnsyncedGeneration || 1);
          return;
        }
        if (result?.accepted || result?.state?.version !== 3) break;
        conflictCount += 1;
        candidate = batchBase ? rebaseUnsyncedOverlay(batchBase, candidate, result.state) : mergeCloudStates(result.state, candidate);
        batchBase = result.state;
      }
      if (result?.accepted) {
        revision = Number(result.revision || revision);
        remoteBasisRaw = JSON.stringify(candidate);
        clearUnsyncedOverlay(batchUnsyncedGeneration);
        if (conflictCount) {
          applyingRemote = true;
          try { nativeSetItem.call(localStorage, GLOBAL_KEY, JSON.stringify(candidate)); }
          finally { applyingRemote = false; }
        }
        notifyStatus("synced");
      } else {
        if (result?.state?.version === 3) {
          // A logical write batch owns one bounded retry budget. Reconcile its
          // terminal transitions locally with the newest remote snapshot, but do
          // not re-queue that exhausted batch. A genuinely newer write that was
          // scheduled while this batch was in flight keeps its own generation.
          const hasNewerPending = pendingGeneration > batchGeneration && Boolean(pendingRaw);
          const newerPendingState = hasNewerPending ? safeParse(pendingRaw) : null;
          const desiredState = newerPendingState || candidate;
          const finalResolved = batchBase
            ? rebaseUnsyncedOverlay(batchBase, desiredState, result.state)
            : mergeCloudStates(result.state, desiredState);
          const finalRaw = JSON.stringify(finalResolved);
          pendingRaw = hasNewerPending ? finalRaw : null;
          persistUnsyncedOverlayForOwner(finalResolved, batchOwner, true, result.state);
          applyRemoteState(result);
          scheduleRecovery();
        }
        notifyStatus("conflict");
      }
    } catch (error) {
      if (!sameSyncOwner(batchOwner)) {
        persistUnsyncedOverlayForOwner(localState, batchOwner, false, batchBase, batchUnsyncedGeneration || 1);
      } else if (syncEnabled()) {
        const newerPending = safeParse(pendingRaw);
        const recoveryState = newerPending ? mergeCloudStates(localState, newerPending) : localState;
        persistUnsyncedOverlayForOwner(recoveryState, batchOwner, true, batchBase);
        pendingRaw = null;
        deferRecovery();
        notifyStatus("offline", { message: String(error?.message || error) });
      }
    } finally {
      pushInFlight = false;
      if (syncEnabled() && pendingRaw) {
        clearTimeout(pushTimer);
        pushTimer = setTimeout(flushPush, 350);
      } else if (sameSyncOwner(batchOwner) && unsyncedRaw) {
        scheduleRecovery(batchOwner);
      }
    }
  }

  function deferRecovery(delay = RECOVERY_QUIET_MS) {
    const owner = syncOwner();
    if (!sameSyncOwner(owner) || !activeUnsyncedOverlay()) return;
    recoveryNotBefore = Date.now() + Math.max(RECOVERY_QUIET_MS, Number(delay || 0));
    scheduleRecovery(owner, true);
  }

  async function recoverUnsyncedOverlay(owner = syncOwner()) {
    if (!sameSyncOwner(owner) || pendingRaw || pushInFlight) return false;
    const overlay = activeUnsyncedOverlay();
    if (!overlay) return false;
    pendingRaw = JSON.stringify(overlay);
    pendingGeneration += 1;
    await flushPush();
    return true;
  }

  function scheduleRecovery(owner = syncOwner(), reset = false) {
    if (!sameSyncOwner(owner) || !activeUnsyncedOverlay() || pendingRaw || pushInFlight) return;
    if (recoveryTimer && !reset && recoveryOwnerId === owner.userId && recoveryOwnerKey === owner.overlayKey) return;
    clearTimeout(recoveryTimer);
    recoveryTimer = 0;
    recoveryOwnerId = owner.userId;
    recoveryOwnerKey = owner.overlayKey;
    const wait = Math.max(RECOVERY_QUIET_MS, recoveryNotBefore - Date.now());
    recoveryTimer = setTimeout(() => {
      recoveryTimer = 0;
      if (!sameSyncOwner(owner)) return false;
      return recoverUnsyncedOverlay(owner);
    }, wait);
  }

  async function pollOnce(forceFull = false) {
    if (!syncEnabled()) {
      suspendSync();
      return;
    }
    if (!initialized || pushInFlight || pendingRaw) return;
    const pollOwner = syncOwner();
    try {
      const remoteRevision = forceFull ? revision + 1 : await readRemoteRevision();
      if (!sameSyncOwner(pollOwner)) return;
      if (!forceFull && (!remoteRevision || remoteRevision <= revision)) {
        notifyStatus("synced");
        scheduleRecovery();
        return;
      }
      const row = await readRemoteState();
      if (!sameSyncOwner(pollOwner)) return;
      if (!row) return;
      if (Number(row.revision || 0) > revision || forceFull) {
        if (unsyncedRaw) deferRecovery();
        applyRemoteState(row);
      }
      notifyStatus("synced");
      scheduleRecovery();
    } catch (error) {
      if (!sameSyncOwner(pollOwner)) return;
      notifyStatus("offline", { message: String(error?.message || error) });
    }
  }

  function schedulePoll(delay = document.hidden ? HIDDEN_POLL_MS : ACTIVE_POLL_MS) {
    clearTimeout(pollTimer);
    if (!syncEnabled()) {
      pollTimer = 0;
      return;
    }
    pollTimer = setTimeout(async () => {
      await pollOnce(false);
      schedulePoll();
    }, delay);
  }

  async function bootstrap() {
    if (!syncEnabled()) {
      suspendSync();
      return;
    }
    const bootstrapOwner = syncOwner();
    notifyStatus("connecting");
    try {
      loadUnsyncedOverlay();
      const row = await readRemoteState();
      if (!sameSyncOwner(bootstrapOwner)) return;
      if (row?.state?.version === 3) {
        const hasOverlay = Boolean(activeUnsyncedRecord());
        const preserved = hasOverlay ? null : preserveCurrentCharacterOnBootstrap(row);
        if (!preserved) {
          pendingRaw = null;
          applyRemoteState(row);
        }
      } else {
        const localRaw = pendingRaw || nativeGetItem.call(localStorage, GLOBAL_KEY);
        const localState = safeParse(localRaw);
        if (localState) {
          const created = await putRemoteState(localState, null);
          if (!sameSyncOwner(bootstrapOwner)) {
            persistUnsyncedOverlayForOwner(localState, bootstrapOwner, false);
            return;
          }
          if (created?.state?.version === 3) {
            revision = Number(created.revision || 0);
            remoteBasisRaw = JSON.stringify(created.state);
            if (created.accepted === false) applyRemoteState(created);
          }
        }
      }
      initialized = true;
      notifyStatus("synced");
      if (pendingRaw) flushPush();
      else scheduleRecovery();
    } catch (error) {
      if (!sameSyncOwner(bootstrapOwner)) return;
      initialized = true;
      notifyStatus("offline", { message: String(error?.message || error) });
    }
    schedulePoll(600);
  }

  async function ensureBootstrap() {
    if (!syncEnabled()) {
      suspendSync();
      return;
    }
    if (initialized || bootstrapInFlight) return;
    bootstrapInFlight = true;
    try { await bootstrap(); }
    finally { bootstrapInFlight = false; }
  }

  function refreshSync(forceFull = false) {
    if (!syncEnabled()) {
      suspendSync();
      return;
    }
    if (!initialized) {
      ensureBootstrap();
      return;
    }
    pollOnce(forceFull);
    schedulePoll(250);
  }

  if (storageProto && nativeSetItem && nativeRemoveItem && nativeGetItem) {
    storageProto.setItem = function patchedSetItem(key, value) {
      nativeSetItem.call(this, key, value);
      if (this === localStorage && key === GLOBAL_KEY && !applyingRemote && syncEnabled()) schedulePush(String(value));
    };
    storageProto.removeItem = function patchedRemoveItem(key) {
      nativeRemoveItem.call(this, key);
      if (this === localStorage && key === GLOBAL_KEY && !applyingRemote) pendingRaw = null;
    };
  }

  window.addEventListener("online", () => refreshSync(true));
  window.addEventListener("focus", () => refreshSync(false));
  window.addEventListener("hashchange", () => refreshSync(false));
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshSync(false);
    else schedulePoll();
  });
  window.addEventListener("beforeunload", () => { if (syncEnabled() && pendingRaw) flushPush(); });

  window.__BAEKJI_CLOUD_SYNC_TEST__ = Object.freeze({
    mergeValues,
    mergeArrays,
    safeParse,
    stableArrayKey,
    adminControlSeq,
    adminControlHistory,
    applyAdminControlPatch,
    reconcileAdminControl,
    reconcileFieldItemPlacements,
    movementTerminalMarker,
    legacyMovementCompletionEvidence,
    synthesizeLegacyMovementTransition,
    reconcileSessionMovement,
    reconcileMovementTransitions,
    reconcileCompletedPartyDisbands,
    preserveAcceptedLocalPartyDisbands,
    mergeCloudStates,
    valuesEqual,
    rebaseArrayDelta,
    rebaseUnsyncedValue,
    rebaseUnsyncedOverlay,
    parseUnsyncedRecord,
    unsyncedKey,
    syncOwner,
    sameSyncOwner,
    persistUnsyncedOverlayForOwner,
    activeUnsyncedOverlay,
    loadUnsyncedOverlay,
    persistUnsyncedOverlay,
    clearUnsyncedOverlay,
    deferRecovery,
    recoverUnsyncedOverlay,
    scheduleRecovery,
    activeUserId,
    syncEnabled,
    preserveCurrentCharacterOnBootstrap,
  });

  ensureBootstrap();
})();
