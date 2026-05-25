import { resolveEnemyCombatant } from './army';
import { generateCycleRifts } from './rift';
import {
  FACTION_UPGRADES,
  FACTIONS,
  MUTATORS,
  TROOP_TYPE_UPGRADES,
  UNIT_TYPES,
  getTroopTypeUpgrade,
} from './unitCatalog';
import type {
  FactionId,
  GameState,
  LadderCompatibilityIssue,
  LadderDrawResult,
  LadderGuardianSnapshot,
  LadderHarvestResult,
  LadderRiftPayload,
  LadderRiftSetPayload,
  MutatorId,
  RiftInstance,
  RiftResolutionRecord,
  TroopInstance,
  UnitTypeId,
  UpgradeId,
} from './types';

export const LADDER_BASELINE_SETS_PER_CYCLE = 5;
export const LADDER_FINAL_CYCLE = 10;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKnownTroopTypeUpgradeId(value: string): boolean {
  if (value in TROOP_TYPE_UPGRADES) {
    return true;
  }
  try {
    getTroopTypeUpgrade(value);
    return true;
  } catch {
    return false;
  }
}

function issue(
  code: LadderCompatibilityIssue['code'],
  path: string,
  message: string,
  value?: string | number | boolean | null,
): LadderCompatibilityIssue {
  return value === undefined ? { code, path, message } : { code, path, message, value };
}

function validatePositiveInteger(value: unknown, path: string, code: LadderCompatibilityIssue['code'], label: string): LadderCompatibilityIssue[] {
  return Number.isInteger(value) && Number(value) > 0 ? [] : [issue(code, path, `${label} must be a positive integer.`, typeof value === 'number' ? value : null)];
}

function validateGuardian(guardian: unknown, path: string): LadderCompatibilityIssue[] {
  if (!isObject(guardian)) {
    return [issue('invalid_rift', path, 'Guardian must be an object.')];
  }

  const issues: LadderCompatibilityIssue[] = [];
  if (typeof guardian.factionId !== 'string' || !(guardian.factionId in FACTIONS)) {
    issues.push(issue('unknown_faction', `${path}.factionId`, 'Guardian faction is not known.', typeof guardian.factionId === 'string' ? guardian.factionId : null));
  }
  if (typeof guardian.unitTypeId !== 'string' || !(guardian.unitTypeId in UNIT_TYPES)) {
    issues.push(issue('unknown_unit_type', `${path}.unitTypeId`, 'Guardian unit type is not known.', typeof guardian.unitTypeId === 'string' ? guardian.unitTypeId : null));
  }

  const factionUpgradeIds = Array.isArray(guardian.factionUpgradeIds) ? guardian.factionUpgradeIds : [];
  factionUpgradeIds.forEach((upgradeId, index) => {
    if (typeof upgradeId !== 'string' || !(upgradeId in FACTION_UPGRADES)) {
      issues.push(issue('unknown_faction_upgrade', `${path}.factionUpgradeIds[${index}]`, 'Guardian faction upgrade is not known.', typeof upgradeId === 'string' ? upgradeId : null));
    }
  });

  const troopTypeUpgradeIds = Array.isArray(guardian.troopTypeUpgradeIds) ? guardian.troopTypeUpgradeIds : [];
  troopTypeUpgradeIds.forEach((upgradeId, index) => {
    if (typeof upgradeId !== 'string' || !isKnownTroopTypeUpgradeId(upgradeId)) {
      issues.push(issue('unknown_troop_type_upgrade', `${path}.troopTypeUpgradeIds[${index}]`, 'Guardian troop-type upgrade is not known.', typeof upgradeId === 'string' ? upgradeId : null));
    }
  });

  return issues;
}

function validateRift(rift: unknown, expectedCycleNumber: number, path: string): LadderCompatibilityIssue[] {
  if (!isObject(rift)) {
    return [issue('invalid_rift', path, 'Rift must be an object.')];
  }

  const issues: LadderCompatibilityIssue[] = [];
  if (rift.cycleNumber !== expectedCycleNumber) {
    issues.push(issue('invalid_cycle', `${path}.cycleNumber`, 'Rift cycle must match the Rift-set cycle.', typeof rift.cycleNumber === 'number' ? rift.cycleNumber : null));
  }
  issues.push(...validatePositiveInteger(rift.tier, `${path}.tier`, 'invalid_tier', 'Tier'));
  issues.push(...validatePositiveInteger(rift.saturation, `${path}.saturation`, 'invalid_saturation', 'Saturation'));
  issues.push(...validatePositiveInteger(rift.victoryPoints, `${path}.victoryPoints`, 'invalid_victory_points', 'Victory points'));

  const mutatorIds = Array.isArray(rift.mutatorIds) ? rift.mutatorIds : [];
  mutatorIds.forEach((mutatorId, index) => {
    if (typeof mutatorId !== 'string' || !(mutatorId in MUTATORS)) {
      issues.push(issue('unknown_mutator', `${path}.mutatorIds[${index}]`, 'Rift mutator is not known.', typeof mutatorId === 'string' ? mutatorId : null));
    }
  });

  const guardians = Array.isArray(rift.guardians) ? rift.guardians : [];
  if (guardians.length === 0) {
    issues.push(issue('missing_guardians', `${path}.guardians`, 'Rift must have at least one Guardian.'));
  }
  guardians.forEach((guardian, index) => issues.push(...validateGuardian(guardian, `${path}.guardians[${index}]`)));

  return issues;
}

export function validateLadderRiftSetPayload(payload: unknown, cycleNumber: number): LadderCompatibilityIssue[] {
  if (!isObject(payload) || payload.version !== 1 || !Array.isArray(payload.rifts)) {
    return [issue('invalid_payload', '$', 'Ladder Rift-set payload must be version 1 with a rifts array.')];
  }
  if (!Number.isInteger(cycleNumber) || cycleNumber < 1 || cycleNumber > LADDER_FINAL_CYCLE) {
    return [issue('invalid_cycle', 'cycleNumber', 'Cycle number must be from 1 to 10.', cycleNumber)];
  }
  return payload.rifts.flatMap((rift, index) => validateRift(rift, cycleNumber, `rifts[${index}]`));
}

export function ladderRiftSetToRiftInstances(draw: LadderDrawResult): RiftInstance[] {
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
    enemyArmy: rift.guardians.map((guardian, index) =>
      resolveEnemyCombatant(
        guardian.factionUpgradeIds,
        guardian.troopTypeUpgradeIds,
        guardian.factionId,
        guardian.unitTypeId,
        rift.tier,
        `${rift.id}-guardian-${index + 1}`,
      ),
    ),
    enemyFactionUpgradeIds: [...new Set(rift.guardians.flatMap((guardian) => guardian.factionUpgradeIds))],
    enemyTroopTypeUpgradeIds: [...new Set(rift.guardians.flatMap((guardian) => guardian.troopTypeUpgradeIds))],
    victoryPoints: rift.victoryPoints,
    saturation: rift.saturation,
    state: 'discovered',
  }));
}

function combatantToGuardian(combatant: { factionId: FactionId; unitTypeId: UnitTypeId }, factionUpgradeIds: UpgradeId[] = [], troopTypeUpgradeIds: UpgradeId[] = []): LadderGuardianSnapshot {
  return {
    factionId: combatant.factionId,
    unitTypeId: combatant.unitTypeId,
    factionUpgradeIds: [...factionUpgradeIds],
    troopTypeUpgradeIds: [...troopTypeUpgradeIds],
  };
}

export function riftInstancesToLadderPayload(rifts: RiftInstance[]): LadderRiftSetPayload {
  return {
    version: 1,
    rifts: rifts.map((rift) => ({
      id: rift.id,
      cycleNumber: rift.cycleNumber,
      seed: rift.seed,
      tier: rift.tier,
      mutatorIds: [...rift.mutatorIds],
      saturation: rift.saturation,
      victoryPoints: rift.victoryPoints,
      guardians: rift.enemyArmy.map((combatant) =>
        combatantToGuardian(combatant, rift.enemyFactionUpgradeIds ?? [], rift.enemyTroopTypeUpgradeIds ?? []),
      ),
    })),
  };
}

export function generateBaselineLadderPayload(campaignSeed: number, cycleNumber: number): LadderRiftSetPayload {
  return riftInstancesToLadderPayload(generateCycleRifts({ campaignSeed, cycleNumber }));
}

function troopToGuardian(troop: TroopInstance, state: Pick<GameState, 'factionUpgradeIds' | 'troopTypeUpgradeIds'>): LadderGuardianSnapshot {
  return {
    factionId: troop.factionId,
    unitTypeId: troop.unitTypeId,
    factionUpgradeIds: [...state.factionUpgradeIds],
    troopTypeUpgradeIds: [...state.troopTypeUpgradeIds],
  };
}

export function buildHarvestedLadderPayload(state: GameState, records: RiftResolutionRecord[]): LadderRiftSetPayload {
  const recordsByRiftId = new Map(records.map((record) => [record.riftId, record]));
  return {
    version: 1,
    rifts: state.openRifts
      .filter((rift) => rift.cycleNumber === state.cycleNumber)
      .map((rift) => {
        const record = recordsByRiftId.get(rift.id);
        const conqueredGuardians =
          record?.outcome === 'victory'
            ? record.assignedTroopIds
                .map((troopId) => state.troops.find((troop) => troop.id === troopId) ?? null)
                .filter((troop): troop is TroopInstance => troop !== null)
                .map((troop) => troopToGuardian(troop, state))
            : [];
        return {
          id: rift.id,
          cycleNumber: rift.cycleNumber,
          seed: rift.seed,
          tier: rift.tier,
          mutatorIds: [...rift.mutatorIds],
          saturation: rift.saturation,
          victoryPoints: rift.victoryPoints,
          guardians:
            conqueredGuardians.length > 0
              ? conqueredGuardians
              : rift.enemyArmy.map((combatant) =>
                  combatantToGuardian(combatant, rift.enemyFactionUpgradeIds ?? [], rift.enemyTroopTypeUpgradeIds ?? []),
                ),
        };
      }),
  };
}

export function withLadderDraw(state: GameState, draw: LadderDrawResult): GameState {
  return {
    ...state,
    openRifts: ladderRiftSetToRiftInstances(draw),
    ladder: {
      currentRiftSetId: draw.id,
      currentGeneration: draw.generation,
      currentSourceCycleNumber: draw.cycleNumber,
    },
  };
}

export function getCurrentLadderSetId(state: Pick<GameState, 'ladder'>): string | null {
  return state.ladder?.currentRiftSetId ?? null;
}

export type LadderHarvestRequest = Pick<LadderHarvestResult, 'parentId' | 'parentSpent' | 'payload'> & {
  parentGeneration: number;
};
