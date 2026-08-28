import { createHash } from "node:crypto";
import playerWorldCommandCatalog from "../player-world-command-catalog.js";
import { reducePlayerWorldPartyCommand } from "./player-world-party-reducer.mjs";
import { reducePlayerWorldInvestigationCommand } from "../lib/player-world-investigation-reducer.mjs";
import { reconcileItemTransfers, reducePlayerWorldInventoryCommand } from "../lib/player-world-inventory-reducer.mjs";
import { derivePlayerWorldEffects } from "../lib/player-world-derived-effects.mjs";
import { reducePlayerWorldAiCommand } from "../lib/player-world-ai-reducer.mjs";

function commandFingerprint(command, payload) {
  return createHash("sha256").update(`${command}:${JSON.stringify(payload)}`).digest("hex");
}

function deterministicIdFactory(commandId) {
  const stable = String(commandId || "").toLowerCase();
  let index = 0;
  return (prefix) => `${String(prefix || "id").replace(/[^A-Za-z0-9_-]/g, "_")}_${stable}${index++ ? `_${index}` : ""}`;
}

function normalizedResult(result, sourceState) {
  if (!result || !["APPLIED", "NOOP", "OUT_OF_SCOPE"].includes(result.status)) {
    if (result?.status === "REJECTED") return { status: "OUT_OF_SCOPE", state: sourceState };
    return { status: "OUT_OF_SCOPE", state: sourceState };
  }
  return result;
}

/**
 * Runs one authenticated command against an already-read canonical snapshot.
 * The caller must still submit the result through the database CAS/ledger RPC.
 */
export function reducePlayerWorldCommand({ state, actorId, commandId, command, payload, nowMs = Date.now(), names = {}, serverDecision = null }) {
  if (!playerWorldCommandCatalog.validatePayload(command, payload)) return { status: "OUT_OF_SCOPE", state };
  const canonicalPayload = playerWorldCommandCatalog.canonicalizePayload(command, payload);
  const family = playerWorldCommandCatalog.family(command);
  const idFactory = deterministicIdFactory(commandId);
  const input = { state, actorId, command, payload: canonicalPayload, nowMs, idFactory, names };
  let result;
  if (family === "party") result = reducePlayerWorldPartyCommand(input);
  else if (family === "investigation") result = reducePlayerWorldInvestigationCommand(input);
  else if (family === "inventory") result = reducePlayerWorldInventoryCommand(input);
  else if (family === "ai") result = reducePlayerWorldAiCommand({ ...input, decision: serverDecision });
  else result = { status: "OUT_OF_SCOPE", state };
  result = normalizedResult(result, state);

  // Location/session/party changes settle outstanding offers in the same
  // canonical commit, rather than through a browser repair timer.
  if (result.status === "APPLIED") {
    const previousLogIds = new Set(Object.values(state.sessions || {}).flatMap((session) => (session.logs || []).map((entry) => entry?.id)).filter(Boolean));
    const addedActions = Object.values(result.state.sessions || {}).flatMap((session) => (session.logs || [])
      .filter((entry) => entry?.type === "action-input" && entry.id && !previousLogIds.has(entry.id) && !entry.fieldObservationBroadcasted)
      .map((entry) => ({ sessionId: session.id, actionLogId: entry.id })));
    for (const context of addedActions) {
      for (const effect of ["ACTION_FANOUT", "SOUND_FANOUT"]) {
        const derived = derivePlayerWorldEffects({ state: result.state, effect, context, nowMs, idFactory });
        if (derived.applied) result.state = derived.state;
      }
    }
    reconcileItemTransfers(result.state, { nowMs, idFactory, names });
  }
  return { ...result, canonicalPayload, fingerprint: commandFingerprint(command, canonicalPayload) };
}

export { commandFingerprint, deterministicIdFactory };
