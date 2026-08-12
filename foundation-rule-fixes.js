(() => {
  "use strict";

  const GLOBAL_KEY = "baekji_city_mvp_state_v3";
  const VERSION = "0.4.2";

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, Number(value) || 0));
  }

  function hashNumber(text) {
    let hash = 2166136261;
    for (const ch of String(text || "")) {
      hash ^= ch.charCodeAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0);
  }

  function contaminationStage(value) {
    const amount = clamp(value, 0, 100);
    if (amount >= 100) return "완전 용해";
    if (amount >= 80) return "붕락";
    if (amount >= 60) return "용해";
    if (amount >= 40) return "유화";
    if (amount >= 20) return "번짐";
    return "안정";
  }

  function mobilityProfile(value) {
    const contamination = clamp(value, 0, 100);
    if (contamination >= 100) return { contamination, stage: "완전 용해", delayMultiplier: Infinity, failureChance: 100, blocked: true };
    if (contamination >= 80) return { contamination, stage: "붕락", delayMultiplier: 3, failureChance: 35, blocked: false };
    if (contamination >= 60) return { contamination, stage: "용해", delayMultiplier: 2, failureChance: 15, blocked: false };
    if (contamination >= 40) return { contamination, stage: "유화", delayMultiplier: 1.5, failureChance: 0, blocked: false };
    return { contamination, stage: contaminationStage(contamination), delayMultiplier: 1, failureChance: 0, blocked: false };
  }

  function safeParse(raw) {
    try {
      const value = JSON.parse(String(raw || "null"));
      return value?.version === 3 ? value : null;
    } catch {
      return null;
    }
  }

  function displayNameForId(id, character = {}) {
    let registryEntry = null;
    try {
      const registry = typeof window !== "undefined" ? window.__BAEKJI_TESTER_REGISTRY_GUARD__ : null;
      registryEntry = registry?.values?.().find?.((entry) => String(entry?.id) === String(id)) || null;
    } catch {
      registryEntry = null;
    }
    return String(character.name || character.characterName || registryEntry?.name || registryEntry?.characterName || registryEntry?.loginId || id || "조사자");
  }

  function memberMobility(state, session) {
    const members = Array.isArray(session?.memberIds) ? session.memberIds : [];
    const candidates = members.map((id) => {
      const character = state?.characters?.[id] || {};
      return {
        id,
        name: displayNameForId(id, character),
        contamination: clamp(character.contamination, 0, 100),
      };
    });
    if (!candidates.length && session?.movement?.actorId) {
      const id = session.movement.actorId;
      const character = state?.characters?.[id] || {};
      candidates.push({ id, name: displayNameForId(id, character), contamination: clamp(character.contamination, 0, 100) });
    }
    candidates.sort((a, b) => b.contamination - a.contamination);
    const worst = candidates[0] || { id: "", name: "조사자", contamination: 0 };
    return { ...worst, profile: mobilityProfile(worst.contamination) };
  }

  function appendSystemLog(session, type, text, meta = {}, at = Date.now()) {
    if (!session) return;
    if (!Array.isArray(session.logs)) session.logs = [];
    session.logs.push({
      id: `mobility_${at.toString(36)}_${hashNumber(`${session.id}:${text}:${at}`).toString(36)}`,
      type,
      text,
      actorId: null,
      at,
      systemNarration: true,
      ...meta,
    });
  }

  function removeDepartureArtifacts(next, previous, movementStartedAt) {
    if (!next?.sessions) return;
    for (const [sessionId, session] of Object.entries(next.sessions)) {
      const previousCount = Array.isArray(previous?.sessions?.[sessionId]?.logs) ? previous.sessions[sessionId].logs.length : 0;
      if (!Array.isArray(session?.logs) || session.logs.length <= previousCount) continue;
      const before = session.logs.slice(0, previousCount);
      const added = session.logs.slice(previousCount).filter((entry) => {
        const at = Number(entry?.at || 0);
        const recent = !movementStartedAt || Math.abs(at - movementStartedAt) <= 1000;
        return !(recent && entry?.type === "presence" && /떠나.*이동을 시작했다/.test(String(entry?.text || "")));
      });
      session.logs = before.concat(added);
    }
  }

  function applyMovementImpairment(next, previous = null, now = Date.now()) {
    if (!next?.sessions || !next?.characters) return next;

    for (const session of Object.values(next.sessions)) {
      const movement = session?.movement;
      if (!movement || movement.mobilityFoundationAdjusted) continue;
      const previousMovement = previous?.sessions?.[session.id]?.movement;
      if (previousMovement?.token && previousMovement.token === movement.token) continue;

      const mobility = memberMobility(next, session);
      const profile = mobility.profile;
      const startedAt = Number(movement.startedAt || now);
      const baseDuration = Math.max(0, Number(movement.resolveAt || startedAt) - startedAt);
      const seed = `${session.id}:${movement.token}:${mobility.id}:${profile.contamination}`;
      const roll = (hashNumber(seed) % 100) + 1;

      if (profile.blocked) {
        removeDepartureArtifacts(next, previous, startedAt);
        session.movement = null;
        appendSystemLog(
          session,
          "fail",
          `${mobility.name}는 완전 용해 상태로 스스로 이동할 수 없다. 현재 조사조는 이 상태로 이동을 시작할 수 없다.`,
          { kind: "MOBILITY_IMPAIRMENT", mobilityBlocked: true, contamination: profile.contamination, stage: profile.stage },
          now,
        );
        continue;
      }

      if (profile.failureChance > 0 && roll <= profile.failureChance) {
        removeDepartureArtifacts(next, previous, startedAt);
        session.movement = null;
        appendSystemLog(
          session,
          "fail",
          `${mobility.name}의 ${profile.stage} 증상으로 몸이 뜻대로 따라주지 않아 이동을 시작하지 못했다. 자세를 바로잡은 뒤 다시 시도해야 한다.`,
          { kind: "MOBILITY_IMPAIRMENT", mobilityFailed: true, contamination: profile.contamination, stage: profile.stage, roll, failureChance: profile.failureChance },
          now,
        );
        continue;
      }

      movement.mobilityFoundationAdjusted = true;
      movement.mobilityPenalty = {
        characterId: mobility.id,
        contamination: profile.contamination,
        stage: profile.stage,
        delayMultiplier: profile.delayMultiplier,
        failureChance: profile.failureChance,
        roll,
      };

      if (profile.delayMultiplier > 1 && baseDuration > 0) {
        movement.resolveAt = startedAt + Math.ceil(baseDuration * profile.delayMultiplier);
        appendSystemLog(
          session,
          "scene",
          `${mobility.name}의 ${profile.stage} 증상으로 움직임이 둔해져 조사조의 이동 속도가 평소보다 느려졌다.`,
          { kind: "MOBILITY_IMPAIRMENT", mobilitySlowed: true, contamination: profile.contamination, stage: profile.stage, delayMultiplier: profile.delayMultiplier },
          now,
        );
      }
    }
    return next;
  }

  const TEST_API = Object.freeze({ hashNumber, contaminationStage, mobilityProfile, displayNameForId, memberMobility, applyMovementImpairment });
  if (typeof window !== "undefined") window.__BAEKJI_MOVEMENT_IMPAIRMENT_TEST__ = TEST_API;

  if (typeof Storage !== "undefined" && typeof localStorage !== "undefined") {
    const storageProto = Storage.prototype;
    const previousSetItem = storageProto.setItem;
    const previousGetItem = storageProto.getItem;
    storageProto.setItem = function movementSafeSetItem(key, value) {
      if (this === localStorage && String(key) === GLOBAL_KEY) {
        const next = safeParse(value);
        if (next) {
          const previous = safeParse(previousGetItem.call(localStorage, GLOBAL_KEY));
          applyMovementImpairment(next, previous);
          value = JSON.stringify(next);
        }
      }
      return previousSetItem.call(this, key, value);
    };
  }

  function replaceText(node, from, to) {
    if (!node || String(node.textContent || "").trim() !== from) return false;
    node.textContent = to;
    return true;
  }

  function applyFoundationUiFixes() {
    if (typeof document === "undefined") return;

    document.querySelectorAll("[data-reset-demo]").forEach((button) => button.remove());

    document.querySelectorAll(".hero .lead, .card-header .muted.small, .list-sub, .rule").forEach((node) => {
      replaceText(node,
        "고정 조장이나 직책은 없습니다.",
        "조사조를 생성한 캐릭터가 조장을 맡으며, 조장은 조원 관리와 세션 시작을 담당합니다.");
      replaceText(node,
        "조사조는 매일 자율적으로 새로 편성합니다. 이 화면의 개설자는 편성 작업을 시작한 사람일 뿐 세계관상 조장이 아닙니다.",
        "조사조는 매일 자율적으로 새로 편성합니다. 조사조를 생성한 캐릭터가 이번 조사조의 조장을 맡으며, 조원 관리와 세션 시작을 담당합니다.");
      replaceText(node,
        "한 메시지에는 한 가지 행동만 입력합니다. 복수 위험은 서로 다른 행동으로 순서대로 해결합니다.",
        "한 메시지에는 한 가지 행동만 입력합니다. 한 행동이 여러 위험에 영향을 줄 수 있는지는 현재 상황과 행동 내용에 따라 시스템이 판정합니다.");
      replaceText(node, "편성 개설자", "조장");
    });
  }

  if (typeof document !== "undefined") {
    const target = document.getElementById("app") || document.documentElement;
    if (typeof MutationObserver === "function" && target) {
      new MutationObserver(applyFoundationUiFixes).observe(target, { childList: true, subtree: true });
    }
    window?.addEventListener?.("hashchange", () => queueMicrotask(applyFoundationUiFixes));
    applyFoundationUiFixes();
  }

  if (typeof document !== "undefined") document.documentElement.dataset.foundationRuleVersion = VERSION;
})();