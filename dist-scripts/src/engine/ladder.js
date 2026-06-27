import { resolveEnemyCombatant } from "./army";
import { generateCycleRifts } from "./rift";
import {
  RACE_UPGRADES,
  RACES,
  MUTATORS,
  TROOP_CLASS_UPGRADES,
  UNIT_CLASSES,
  getTroopClassUpgrade
} from "./unitCatalog";
const LADDER_BASELINE_SETS_PER_CYCLE = 5;
const LADDER_FINAL_CYCLE = 10;
function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isKnownTroopClassUpgradeId(value) {
  if (value in TROOP_CLASS_UPGRADES) {
    return true;
  }
  try {
    getTroopClassUpgrade(value);
    return true;
  } catch {
    return false;
  }
}
function issue(code, path, message, value) {
  return value === void 0 ? { code, path, message } : { code, path, message, value };
}
function validatePositiveInteger(value, path, code, label) {
  return Number.isInteger(value) && Number(value) > 0 ? [] : [issue(code, path, `${label} must be a positive integer.`, typeof value === "number" ? value : null)];
}
function validateGuardian(guardian, path) {
  if (!isObject(guardian)) {
    return [issue("invalid_rift", path, "Guardian must be an object.")];
  }
  const issues = [];
  if (typeof guardian.raceId !== "string" || !(guardian.raceId in RACES)) {
    issues.push(issue("unknown_race", `${path}.raceId`, "Guardian race is not known.", typeof guardian.raceId === "string" ? guardian.raceId : null));
  }
  if (typeof guardian.unitClassId !== "string" || !(guardian.unitClassId in UNIT_CLASSES)) {
    issues.push(issue("unknown_unit_class", `${path}.unitClassId`, "Guardian unit class is not known.", typeof guardian.unitClassId === "string" ? guardian.unitClassId : null));
  }
  const raceUpgradeIds = Array.isArray(guardian.raceUpgradeIds) ? guardian.raceUpgradeIds : [];
  raceUpgradeIds.forEach((upgradeId, index) => {
    if (typeof upgradeId !== "string" || !(upgradeId in RACE_UPGRADES)) {
      issues.push(issue("unknown_race_upgrade", `${path}.raceUpgradeIds[${index}]`, "Guardian race upgrade is not known.", typeof upgradeId === "string" ? upgradeId : null));
    }
  });
  const troopClassUpgradeIds = Array.isArray(guardian.troopClassUpgradeIds) ? guardian.troopClassUpgradeIds : [];
  troopClassUpgradeIds.forEach((upgradeId, index) => {
    if (typeof upgradeId !== "string" || !isKnownTroopClassUpgradeId(upgradeId)) {
      issues.push(issue("unknown_troop_class_upgrade", `${path}.troopClassUpgradeIds[${index}]`, "Guardian troop-class upgrade is not known.", typeof upgradeId === "string" ? upgradeId : null));
    }
  });
  return issues;
}
function validateRift(rift, expectedCycleNumber, path) {
  if (!isObject(rift)) {
    return [issue("invalid_rift", path, "Rift must be an object.")];
  }
  const issues = [];
  if (rift.cycleNumber !== expectedCycleNumber) {
    issues.push(issue("invalid_cycle", `${path}.cycleNumber`, "Rift cycle must match the Rift-set cycle.", typeof rift.cycleNumber === "number" ? rift.cycleNumber : null));
  }
  issues.push(...validatePositiveInteger(rift.tier, `${path}.tier`, "invalid_tier", "Tier"));
  issues.push(...validatePositiveInteger(rift.victoryPoints, `${path}.victoryPoints`, "invalid_victory_points", "Victory points"));
  const mutatorIds = Array.isArray(rift.mutatorIds) ? rift.mutatorIds : [];
  mutatorIds.forEach((mutatorId, index) => {
    if (typeof mutatorId !== "string" || !(mutatorId in MUTATORS)) {
      issues.push(issue("unknown_mutator", `${path}.mutatorIds[${index}]`, "Rift mutator is not known.", typeof mutatorId === "string" ? mutatorId : null));
    }
  });
  const guardians = Array.isArray(rift.guardians) ? rift.guardians : [];
  if (guardians.length === 0) {
    issues.push(issue("missing_guardians", `${path}.guardians`, "Rift must have at least one Guardian."));
  }
  guardians.forEach((guardian, index) => issues.push(...validateGuardian(guardian, `${path}.guardians[${index}]`)));
  return issues;
}
function validateLadderRiftSetPayload(payload, cycleNumber) {
  if (!isObject(payload) || payload.version !== 1 || !Array.isArray(payload.rifts)) {
    return [issue("invalid_payload", "$", "Ladder Rift-set payload must be version 1 with a rifts array.")];
  }
  if (!Number.isInteger(cycleNumber) || cycleNumber < 1 || cycleNumber > LADDER_FINAL_CYCLE) {
    return [issue("invalid_cycle", "cycleNumber", "Cycle number must be from 1 to 10.", cycleNumber)];
  }
  return payload.rifts.flatMap((rift, index) => validateRift(rift, cycleNumber, `rifts[${index}]`));
}
function ladderRiftSetToRiftInstances(draw) {
  const issues = validateLadderRiftSetPayload(draw.payload, draw.cycleNumber);
  if (issues.length > 0) {
    throw new Error(`Cannot convert incompatible Ladder Rift-set ${draw.id}.`);
  }
  return draw.payload.rifts.map((rift) => ({
    id: rift.id,
    cycleNumber: rift.cycleNumber,
    seed: rift.seed,
    tier: rift.tier,
    mutatorIds: [...rift.mutatorIds],
    enemyArmy: rift.guardians.map(
      (guardian, index) => resolveEnemyCombatant(
        guardian.raceUpgradeIds,
        guardian.troopClassUpgradeIds,
        guardian.raceId,
        guardian.unitClassId,
        rift.tier,
        `${rift.id}-guardian-${index + 1}`
      )
    ),
    enemyRaceUpgradeIds: [...new Set(rift.guardians.flatMap((guardian) => guardian.raceUpgradeIds))],
    enemyTroopClassUpgradeIds: [...new Set(rift.guardians.flatMap((guardian) => guardian.troopClassUpgradeIds))],
    victoryPoints: rift.victoryPoints,
    state: "discovered"
  }));
}
function combatantToGuardian(combatant, raceUpgradeIds = [], troopClassUpgradeIds = []) {
  return {
    raceId: combatant.raceId,
    unitClassId: combatant.unitClassId,
    raceUpgradeIds: [...raceUpgradeIds],
    troopClassUpgradeIds: [...troopClassUpgradeIds]
  };
}
function riftInstancesToLadderPayload(rifts) {
  return {
    version: 1,
    rifts: rifts.map((rift) => ({
      id: rift.id,
      cycleNumber: rift.cycleNumber,
      seed: rift.seed,
      tier: rift.tier,
      mutatorIds: [...rift.mutatorIds],
      victoryPoints: rift.victoryPoints,
      guardians: rift.enemyArmy.map(
        (combatant) => combatantToGuardian(combatant, rift.enemyRaceUpgradeIds ?? [], rift.enemyTroopClassUpgradeIds ?? [])
      )
    }))
  };
}
function generateBaselineLadderPayload(campaignSeed, cycleNumber) {
  return riftInstancesToLadderPayload(generateCycleRifts({ campaignSeed, cycleNumber }));
}
function troopToGuardian(troop, state) {
  return {
    raceId: troop.raceId,
    unitClassId: troop.unitClassId,
    raceUpgradeIds: [...state.raceUpgradeIds],
    troopClassUpgradeIds: [...state.troopClassUpgradeIds]
  };
}
function buildHarvestedLadderPayload(state, records) {
  const recordsByRiftId = new Map(records.map((record) => [record.riftId, record]));
  return {
    version: 1,
    rifts: state.openRifts.filter((rift) => rift.cycleNumber === state.cycleNumber).map((rift) => {
      const record = recordsByRiftId.get(rift.id);
      const conqueredGuardians = record?.outcome === "victory" ? record.assignedTroopIds.map((troopId) => state.troops.find((troop) => troop.id === troopId) ?? null).filter((troop) => troop !== null).map((troop) => troopToGuardian(troop, state)) : [];
      return {
        id: rift.id,
        cycleNumber: rift.cycleNumber,
        seed: rift.seed,
        tier: rift.tier,
        mutatorIds: [...rift.mutatorIds],
        victoryPoints: rift.victoryPoints,
        guardians: conqueredGuardians.length > 0 ? conqueredGuardians : rift.enemyArmy.map(
          (combatant) => combatantToGuardian(combatant, rift.enemyRaceUpgradeIds ?? [], rift.enemyTroopClassUpgradeIds ?? [])
        )
      };
    })
  };
}
function withLadderDraw(state, draw) {
  return {
    ...state,
    openRifts: ladderRiftSetToRiftInstances(draw),
    ladder: {
      currentRiftSetId: draw.id,
      currentGeneration: draw.generation,
      currentSourceCycleNumber: draw.cycleNumber
    }
  };
}
function getCurrentLadderSetId(state) {
  return state.ladder?.currentRiftSetId ?? null;
}
export {
  LADDER_BASELINE_SETS_PER_CYCLE,
  LADDER_FINAL_CYCLE,
  buildHarvestedLadderPayload,
  generateBaselineLadderPayload,
  getCurrentLadderSetId,
  ladderRiftSetToRiftInstances,
  riftInstancesToLadderPayload,
  validateLadderRiftSetPayload,
  withLadderDraw
};
//# sourceMappingURL=ladder.js.map
