import { createRng } from './rng';
import { ALL_TROOP_UNLOCK_IDS, MUTATORS, getMutator } from './unitCatalog';
import { resolveEnemyCombatant } from './army';
import type { RaceId, GameState, MutatorId, RiftInstance, TroopUnlockId, UnitClassId } from './types';

const CYCLE_RIFT_TIERS: number[][] = [
  [2, 1, 1, 1],
  [2, 2, 1, 1],
  [3, 2, 1, 1],
  [3, 2, 2, 1],
  [3, 3, 2, 1],
];

const MUTATOR_POOL: MutatorId[] = Object.keys(MUTATORS) as MutatorId[];

export function deriveSeed(seed: number, salt: number): number {
  return (seed * 1664525 + 1013904223 + salt * 2654435761) >>> 0;
}

function mixSeed(seed: number): number {
  let value = seed >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return value >>> 0;
}

function createDerivedRng(seed: number, salt: number) {
  return createRng(mixSeed(deriveSeed(seed, salt)));
}

function splitTroopUnlockId(troopUnlockId: TroopUnlockId): [RaceId, UnitClassId] {
  return troopUnlockId.split('/') as [RaceId, UnitClassId];
}

export function getCycleTierSchedule(cycleNumber: number): number[] {
  return cycleNumber <= CYCLE_RIFT_TIERS.length ? [...CYCLE_RIFT_TIERS[cycleNumber - 1]] : [4, 3, 2, 1];
}

function buildCycleMutatorAssignments(tiers: number[], cycleSeed: number): MutatorId[][] {
  const eligibleRiftCount = tiers.filter((tier) => tier > 0).length;
  if (eligibleRiftCount === 0) {
    return tiers.map(() => []);
  }

  const rng = createDerivedRng(cycleSeed, 41);
  const bag: MutatorId[] = [];
  while (bag.length < eligibleRiftCount) {
    bag.push(...rng.shuffle([...MUTATOR_POOL]));
  }
  const assignments = rng.shuffle(bag.slice(0, eligibleRiftCount));
  let bagIndex = 0;

  return tiers.map((tier) => {
    if (tier <= 0) {
      return [];
    }
    const mutatorId = assignments[bagIndex] ?? assignments[assignments.length - 1];
    bagIndex += 1;
    return mutatorId ? [mutatorId] : [];
  });
}

function buildEnemyArmy(tier: number, seed: number) {
  const rng = createDerivedRng(seed, 97);
  const enemyGroupCount = Math.min(tier, 3) + 1;
  const selections = rng.shuffle([...ALL_TROOP_UNLOCK_IDS]).slice(0, enemyGroupCount);

  return selections.map((troopUnlockId, index) => {
    const [raceId, unitClassId] = splitTroopUnlockId(troopUnlockId);
    return resolveEnemyCombatant([], [], raceId, unitClassId, tier, `rift-${seed}-${index}`);
  });
}

export function generateCycleRifts(state: Pick<GameState, 'campaignSeed' | 'cycleNumber'>): RiftInstance[] {
  const tiers = getCycleTierSchedule(state.cycleNumber);
  const cycleSeed = deriveSeed(state.campaignSeed, state.cycleNumber);
  const cycleMutatorAssignments = buildCycleMutatorAssignments(tiers, cycleSeed);

  return tiers.map((tier, index) => {
    const riftSeed = deriveSeed(cycleSeed, index + 1);
    return {
      id: `cycle-${state.cycleNumber}-rift-${index + 1}`,
      cycleNumber: state.cycleNumber,
      seed: riftSeed,
      tier,
      mutatorIds: cycleMutatorAssignments[index] ?? [],
      enemyArmy: buildEnemyArmy(tier, riftSeed),
      victoryPoints: tier,
      state: 'discovered',
    };
  });
}

export function getContestCycleTierSchedule(cycleNumber: number): number[] {
  if (cycleNumber === 1) {
    return [1, 1, 1];
  }
  if (cycleNumber === 3) {
    return [2];
  }
  if (cycleNumber === 5) {
    return [3];
  }
  if (cycleNumber === 7) {
    return [4];
  }
  return [];
}

export function generateContestCycleRifts(state: Pick<GameState, 'campaignSeed' | 'cycleNumber'>): RiftInstance[] {
  const tiers = getContestCycleTierSchedule(state.cycleNumber);
  const cycleSeed = deriveSeed(state.campaignSeed, state.cycleNumber * 9_973 + 17);
  const cycleMutatorAssignments = buildCycleMutatorAssignments(tiers, cycleSeed);

  return tiers.map((tier, index) => {
    const riftSeed = deriveSeed(cycleSeed, index + 1);
    return {
      id: `contest-cycle-${state.cycleNumber}-rift-${index + 1}`,
      cycleNumber: state.cycleNumber,
      seed: riftSeed,
      tier,
      mutatorIds: cycleMutatorAssignments[index] ?? [],
      enemyArmy: buildEnemyArmy(tier, riftSeed),
      victoryPoints: tier,
      state: 'discovered',
      controller: 'neutral',
      occupyingPlayerId: null,
      occupyingTroopIds: [],
    };
  });
}

export function getMutatorLabels(mutatorIds: MutatorId[]): string[] {
  return mutatorIds.map((id) => getMutator(id).label);
}
