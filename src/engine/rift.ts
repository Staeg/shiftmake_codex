import { createRng } from './rng';
import { fixed } from './fixed';
import { composeBaseTroopDefinition, getMutator, FACTIONS, UNIT_TYPES } from './unitCatalog';
import { resolveEnemyCombatant } from './army';
import { getFallbackRewardForExhaustedUpgradeSlots } from './upgrades';
import type {
  FactionId,
  GameState,
  MutatorId,
  ResourceAmounts,
  RewardPackage,
  RiftInstance,
  UnitTypeId,
  UpgradeId,
} from './types';

const CYCLE_RIFT_TIERS: number[][] = [
  [2, 1, 1, 1],
  [2, 2, 1, 1],
  [3, 2, 1, 1],
  [3, 2, 2, 1],
  [3, 3, 2, 1],
];

const MUTATOR_POOL: MutatorId[] = ['momentum', 'heavy-air', 'rich', 'outpost', 'quagmire'];

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

export function getCycleTierSchedule(cycleNumber: number): number[] {
  return cycleNumber <= CYCLE_RIFT_TIERS.length
    ? [...CYCLE_RIFT_TIERS[cycleNumber - 1]]
    : [4, 3, 2, 1];
}

function randomFactionUnitPairs(): Array<{ factionId: FactionId; unitTypeId: UnitTypeId }> {
  return Object.keys(FACTIONS).flatMap((factionId) =>
    Object.keys(UNIT_TYPES).map((unitTypeId) => ({
      factionId: factionId as FactionId,
      unitTypeId: unitTypeId as UnitTypeId,
    })),
  );
}

function pickMutators(tier: number, seed: number): MutatorId[] {
  // Hash the Rift seed before drawing the first mutator so adjacent Rifts/cycles
  // do not collapse into visible streak patterns.
  const rng = createRng(mixSeed(seed));
  const count = tier > 0 ? 1 : 0;
  const selected: MutatorId[] = [];
  let pool = [...MUTATOR_POOL];
  for (let i = 0; i < count && pool.length > 0; i += 1) {
    const pick = rng.pick(pool);
    selected.push(pick);
    pool = pool.filter((entry) => entry !== pick);
  }
  return selected;
}

function getBudgetForRift(tier: number, seed: number, mutatorIds: MutatorId[]): number {
  const rng = createRng(seed);
  const variance = rng.pick([0.9, 0.95, 1, 1.05, 1.1]);
  return fixed(
    150 *
      tier *
      variance *
      mutatorIds.reduce((multiplier, id) => multiplier * getMutator(id).enemyBudgetMultiplier, 1),
  );
}

export function getEnemyUnitBudgetCost(factionId: FactionId, unitTypeId: UnitTypeId): number {
  const troop = composeBaseTroopDefinition(factionId, unitTypeId);
  return fixed(troop.cost / troop.quantity);
}

function makeResourceAmounts(): ResourceAmounts {
  return { gold: 0, essence: 0 };
}

function buildRewardPackage(
  tier: number,
  mutatorIds: MutatorId[],
  availableUpgradeIds: UpgradeId[],
): RewardPackage {
  const slots = Array.from({ length: tier }, (_, index) => index + 1);
  const base: RewardPackage = {
    resources: makeResourceAmounts(),
    upgradeChoiceBatches: 0,
    summaryParts: [],
  };
  const rewardMultiplier = mutatorIds.reduce((multiplier, id) => multiplier * getMutator(id).rewardMultiplier, 1);
  const categories = ['gold', 'essence', 'upgrade', 'blueprint'] as const;

  slots.forEach((slotTier, index) => {
    const category = categories[index] ?? 'gold';
    if (category === 'gold') {
      base.resources.gold += 50 * slotTier;
      base.summaryParts.push(`${50 * slotTier} gold`);
      return;
    }
    if (category === 'essence') {
      base.resources.essence += 50 * slotTier;
      base.summaryParts.push(`${50 * slotTier} essence`);
      return;
    }
    if (category === 'upgrade') {
      if (availableUpgradeIds.length >= 3) {
        base.upgradeChoiceBatches += 1;
        base.summaryParts.push(`upgrade choice x1`);
      } else {
        const fallback = getFallbackRewardForExhaustedUpgradeSlots(slotTier);
        base.resources.gold += fallback.gold;
        base.resources.essence += fallback.essence;
        base.summaryParts.push(`${fallback.gold} gold`, `${fallback.essence} essence`);
      }
      return;
    }

    const fallback = getFallbackRewardForExhaustedUpgradeSlots(slotTier);
    base.resources.gold += fallback.gold;
    base.resources.essence += fallback.essence;
    base.summaryParts.push(`${fallback.gold} gold`, `${fallback.essence} essence`);
  });

  base.resources.gold = fixed(base.resources.gold * rewardMultiplier);
  base.resources.essence = fixed(base.resources.essence * rewardMultiplier);

  if (rewardMultiplier > 1 && base.upgradeChoiceBatches > 0) {
    base.upgradeChoiceBatches *= rewardMultiplier;
    const wholeBatches = Math.floor(base.upgradeChoiceBatches);
    base.upgradeChoiceBatches = wholeBatches;
  }

  return base;
}

function buildEnemyArmy(tier: number, seed: number, mutatorIds: MutatorId[]) {
  const rng = createRng(seed);
  const budget = getBudgetForRift(tier, deriveSeed(seed, 97), mutatorIds);
  const pairs = rng.shuffle(randomFactionUnitPairs());
  const selections = pairs.slice(0, tier + 1);
  const perSelectionBudget = budget / selections.length;

  return selections.map((selection, index) => {
    const perUnitCost = getEnemyUnitBudgetCost(selection.factionId, selection.unitTypeId);
    const quantity = Math.max(1, Math.floor(perSelectionBudget / Math.max(1, perUnitCost)));
    return resolveEnemyCombatant([], selection.factionId, selection.unitTypeId, quantity, tier, `rift-${seed}-${index}`);
  });
}

export function generateCycleRifts(state: Pick<GameState, 'campaignSeed' | 'cycleNumber'>): RiftInstance[] {
  const tiers = getCycleTierSchedule(state.cycleNumber);
  const cycleSeed = deriveSeed(state.campaignSeed, state.cycleNumber);

  return tiers.map((tier, index) => {
    const riftSeed = deriveSeed(cycleSeed, index + 1);
    const mutatorIds = pickMutators(tier, riftSeed);
    const enemyArmy = buildEnemyArmy(tier, riftSeed, mutatorIds);
    return {
      id: `cycle-${state.cycleNumber}-rift-${index + 1}`,
      cycleNumber: state.cycleNumber,
      seed: riftSeed,
      tier,
      mutatorIds,
      enemyArmy,
      rewardPackage: buildRewardPackage(tier, mutatorIds, []),
      expiresInCycles: 2,
      state: 'discovered',
    };
  });
}

export function enrichRiftRewards(rifts: RiftInstance[], availableUpgradeIds: UpgradeId[]): RiftInstance[] {
  return rifts.map((rift) => ({
    ...rift,
    rewardPackage: buildRewardPackage(rift.tier, rift.mutatorIds, availableUpgradeIds),
  }));
}

export function getMutatorLabels(mutatorIds: MutatorId[]): string[] {
  return mutatorIds.map((id) => getMutator(id).label);
}
