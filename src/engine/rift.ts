import { createRng } from './rng';
import { ALL_TROOP_UNLOCK_IDS, getMutator } from './unitCatalog';
import { resolveEnemyCombatant } from './army';
import type { FactionId, GameState, MutatorId, RiftInstance, TroopUnlockId, UnitTypeId } from './types';

const CYCLE_RIFT_TIERS: number[][] = [
  [2, 1, 1, 1],
  [2, 2, 1, 1],
  [3, 2, 1, 1],
  [3, 2, 2, 1],
  [3, 3, 2, 1],
];

const MUTATOR_POOL: MutatorId[] = ['momentum', 'heavy-air', 'quagmire'];

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

function splitTroopUnlockId(troopUnlockId: TroopUnlockId): [FactionId, UnitTypeId] {
  return troopUnlockId.split('/') as [FactionId, UnitTypeId];
}

export function getCycleTierSchedule(cycleNumber: number): number[] {
  return cycleNumber <= CYCLE_RIFT_TIERS.length ? [...CYCLE_RIFT_TIERS[cycleNumber - 1]] : [4, 3, 2, 1];
}

function pickMutators(tier: number, seed: number): MutatorId[] {
  const rng = createRng(mixSeed(seed));
  const count = tier > 0 ? 1 : 0;
  const selected: MutatorId[] = [];
  let pool = [...MUTATOR_POOL];

  for (let index = 0; index < count && pool.length > 0; index += 1) {
    const mutatorId = rng.pick(pool);
    selected.push(mutatorId);
    pool = pool.filter((entry) => entry !== mutatorId);
  }

  return selected;
}

function buildEnemyArmy(tier: number, seed: number) {
  const rng = createRng(deriveSeed(seed, 97));
  const selections = rng.shuffle([...ALL_TROOP_UNLOCK_IDS]).slice(0, tier + 1);

  return selections.map((troopUnlockId, index) => {
    const [factionId, unitTypeId] = splitTroopUnlockId(troopUnlockId);
    return resolveEnemyCombatant([], [], factionId, unitTypeId, tier, `rift-${seed}-${index}`);
  });
}

function pickRiftSaturation(seed: number): number {
  const rng = createRng(deriveSeed(seed, 809));
  return 3 + rng.int(13);
}

export function generateCycleRifts(state: Pick<GameState, 'campaignSeed' | 'cycleNumber'>): RiftInstance[] {
  const tiers = getCycleTierSchedule(state.cycleNumber);
  const cycleSeed = deriveSeed(state.campaignSeed, state.cycleNumber);

  return tiers.map((tier, index) => {
    const riftSeed = deriveSeed(cycleSeed, index + 1);
    return {
      id: `cycle-${state.cycleNumber}-rift-${index + 1}`,
      cycleNumber: state.cycleNumber,
      seed: riftSeed,
      tier,
      mutatorIds: pickMutators(tier, riftSeed),
      enemyArmy: buildEnemyArmy(tier, riftSeed),
      victoryPoints: tier,
      saturation: pickRiftSaturation(riftSeed),
      state: 'discovered',
    };
  });
}

export function getMutatorLabels(mutatorIds: MutatorId[]): string[] {
  return mutatorIds.map((id) => getMutator(id).label);
}
