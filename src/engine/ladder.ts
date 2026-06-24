import { resolveEnemyCombatant } from './army';
import { generateCycleRifts } from './rift';
import {
  RACE_UPGRADES,
  RACES,
  MUTATORS,
  TROOP_CLASS_UPGRADES,
  UNIT_CLASSES,
  getTroopClassUpgrade,
} from './unitCatalog';
import type {
  RaceId,
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
  UnitClassId,
  UpgradeId,
} from './types';

export const LADDER_BASELINE_SETS_PER_CYCLE = 5;
export const LADDER_FINAL_CYCLE = 10;

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isKnownTroopClassUpgradeId(value: string): boolean {
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
  if (typeof guardian.raceId !== 'string' || !(guardian.raceId in RACES)) {
    issues.push(issue('unknown_race', `${path}.raceId`, 'Guardian race is not known.', typeof guardian.raceId === 'string' ? guardian.raceId : null));
  }
  if (typeof guardian.unitClassId !== 'string' || !(guardian.unitClassId in UNIT_CLASSES)) {
    issues.push(issue('unknown_unit_class', `${path}.unitClassId`, 'Guardian unit class is not known.', typeof guardian.unitClassId === 'string' ? guardian.unitClassId : null));
  }

  const raceUpgradeIds = Array.isArray(guardian.raceUpgradeIds) ? guardian.raceUpgradeIds : [];
  raceUpgradeIds.forEach((upgradeId, index) => {
    if (typeof upgradeId !== 'string' || !(upgradeId in RACE_UPGRADES)) {
      issues.push(issue('unknown_race_upgrade', `${path}.raceUpgradeIds[${index}]`, 'Guardian race upgrade is not known.', typeof upgradeId === 'string' ? upgradeId : null));
    }
  });

  const troopClassUpgradeIds = Array.isArray(guardian.troopClassUpgradeIds) ? guardian.troopClassUpgradeIds : [];
  troopClassUpgradeIds.forEach((upgradeId, index) => {
    if (typeof upgradeId !== 'string' || !isKnownTroopClassUpgradeId(upgradeId)) {
      issues.push(issue('unknown_troop_class_upgrade', `${path}.troopClassUpgradeIds[${index}]`, 'Guardian troop-class upgrade is not known.', typeof upgradeId === 'string' ? upgradeId : null));
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
        guardian.raceUpgradeIds,
        guardian.troopClassUpgradeIds,
        guardian.raceId,
        guardian.unitClassId,
        rift.tier,
        `${rift.id}-guardian-${index + 1}`,
      ),
    ),
    enemyRaceUpgradeIds: [...new Set(rift.guardians.flatMap((guardian) => guardian.raceUpgradeIds))],
    enemyTroopClassUpgradeIds: [...new Set(rift.guardians.flatMap((guardian) => guardian.troopClassUpgradeIds))],
    victoryPoints: rift.victoryPoints,
    saturation: rift.saturation,
    state: 'discovered',
  }));
}

function combatantToGuardian(combatant: { raceId: RaceId; unitClassId: UnitClassId }, raceUpgradeIds: UpgradeId[] = [], troopClassUpgradeIds: UpgradeId[] = []): LadderGuardianSnapshot {
  return {
    raceId: combatant.raceId,
    unitClassId: combatant.unitClassId,
    raceUpgradeIds: [...raceUpgradeIds],
    troopClassUpgradeIds: [...troopClassUpgradeIds],
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
        combatantToGuardian(combatant, rift.enemyRaceUpgradeIds ?? [], rift.enemyTroopClassUpgradeIds ?? []),
      ),
    })),
  };
}

export function generateBaselineLadderPayload(campaignSeed: number, cycleNumber: number): LadderRiftSetPayload {
  return riftInstancesToLadderPayload(generateCycleRifts({ campaignSeed, cycleNumber }));
}

function troopToGuardian(troop: TroopInstance, state: Pick<GameState, 'raceUpgradeIds' | 'troopClassUpgradeIds'>): LadderGuardianSnapshot {
  return {
    raceId: troop.raceId,
    unitClassId: troop.unitClassId,
    raceUpgradeIds: [...state.raceUpgradeIds],
    troopClassUpgradeIds: [...state.troopClassUpgradeIds],
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
                  combatantToGuardian(combatant, rift.enemyRaceUpgradeIds ?? [], rift.enemyTroopClassUpgradeIds ?? []),
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
