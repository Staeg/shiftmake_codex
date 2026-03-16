import { createRng } from './rng';
import { fixed } from './fixed';
import { composeBaseTroopDefinition, getMutator, FACTIONS, getTroopUnlockId, UNIT_TYPES } from './unitCatalog';
import { resolveEnemyCombatant } from './army';
import { getFallbackRewardForExhaustedUpgradeSlots } from './upgrades';
const CYCLE_RIFT_TIERS = [
    [2, 1, 1, 1],
    [2, 2, 1, 1],
    [3, 2, 1, 1],
    [3, 2, 2, 1],
    [3, 3, 2, 1],
];
const MUTATOR_POOL = ['momentum', 'heavy-air', 'rich', 'outpost', 'quagmire'];
export function deriveSeed(seed, salt) {
    return (seed * 1664525 + 1013904223 + salt * 2654435761) >>> 0;
}
function mixSeed(seed) {
    let value = seed >>> 0;
    value ^= value >>> 16;
    value = Math.imul(value, 0x7feb352d);
    value ^= value >>> 15;
    value = Math.imul(value, 0x846ca68b);
    value ^= value >>> 16;
    return value >>> 0;
}
export function getCycleTierSchedule(cycleNumber) {
    return cycleNumber <= CYCLE_RIFT_TIERS.length
        ? [...CYCLE_RIFT_TIERS[cycleNumber - 1]]
        : [4, 3, 2, 1];
}
function randomFactionUnitPairs() {
    return Object.keys(FACTIONS).flatMap((factionId) => Object.keys(UNIT_TYPES).map((unitTypeId) => ({
        factionId: factionId,
        unitTypeId: unitTypeId,
    })));
}
function pickMutators(tier, seed) {
    // Hash the Rift seed before drawing the first mutator so adjacent Rifts/cycles
    // do not collapse into visible streak patterns.
    const rng = createRng(mixSeed(seed));
    const count = tier > 0 ? 1 : 0;
    const selected = [];
    let pool = [...MUTATOR_POOL];
    for (let i = 0; i < count && pool.length > 0; i += 1) {
        const pick = rng.pick(pool);
        selected.push(pick);
        pool = pool.filter((entry) => entry !== pick);
    }
    return selected;
}
function getBudgetForRift(tier, seed, mutatorIds) {
    const rng = createRng(seed);
    const variance = rng.pick([0.9, 0.95, 1, 1.05, 1.1]);
    return fixed(150 *
        tier *
        variance *
        mutatorIds.reduce((multiplier, id) => multiplier * getMutator(id).enemyBudgetMultiplier, 1));
}
export function getEnemyUnitBudgetCost(factionId, unitTypeId) {
    const troop = composeBaseTroopDefinition(factionId, unitTypeId);
    return fixed(troop.cost / troop.quantity);
}
function makeResourceAmounts() {
    return { gold: 0, essence: 0 };
}
function applyRewardCategory(rewardPackage, category, slotTier, availableUpgradeIds, availableBlueprintTroopIds) {
    if (category === 'gold') {
        rewardPackage.resources.gold += 50 * slotTier;
        rewardPackage.summaryParts.push(`${50 * slotTier} gold`);
        return;
    }
    if (category === 'essence') {
        rewardPackage.resources.essence += 50 * slotTier;
        rewardPackage.summaryParts.push(`${50 * slotTier} essence`);
        return;
    }
    if (category === 'upgrade') {
        if (availableUpgradeIds.length >= 3) {
            rewardPackage.upgradeChoiceBatches += 1;
            rewardPackage.summaryParts.push('upgrade choice x1');
        }
        else {
            const fallback = getFallbackRewardForExhaustedUpgradeSlots(slotTier);
            rewardPackage.resources.gold += fallback.gold;
            rewardPackage.resources.essence += fallback.essence;
            rewardPackage.summaryParts.push(`${fallback.gold} gold`, `${fallback.essence} essence`);
        }
        return;
    }
    if (availableBlueprintTroopIds.length >= slotTier) {
        rewardPackage.blueprintChoiceCountByTier.push(slotTier);
        rewardPackage.summaryParts.push(`blueprint choice x${slotTier}`);
        return;
    }
    const fallback = getFallbackRewardForExhaustedUpgradeSlots(slotTier);
    rewardPackage.resources.gold += fallback.gold;
    rewardPackage.resources.essence += fallback.essence;
    rewardPackage.summaryParts.push(`${fallback.gold} gold`, `${fallback.essence} essence`);
}
function buildRewardPackage(tier, mutatorIds, availableUpgradeIds, availableBlueprintTroopIds, seed) {
    const base = {
        resources: makeResourceAmounts(),
        upgradeChoiceBatches: 0,
        blueprintChoiceCountByTier: [],
        summaryParts: [],
    };
    const rewardMultiplier = mutatorIds.reduce((multiplier, id) => multiplier * getMutator(id).rewardMultiplier, 1);
    const rng = createRng(deriveSeed(seed, 401));
    const firstRewardPool = ['gold', 'essence'];
    if (availableBlueprintTroopIds.length >= 1) {
        firstRewardPool.push('blueprint');
    }
    const firstReward = rng.pick(firstRewardPool);
    applyRewardCategory(base, firstReward, 1, availableUpgradeIds, availableBlueprintTroopIds);
    let remainingCategories = ['gold', 'essence', 'upgrade', 'blueprint'].filter((category) => category !== firstReward);
    for (let slotTier = 2; slotTier <= tier; slotTier += 1) {
        const category = rng.pick(remainingCategories);
        applyRewardCategory(base, category, slotTier, availableUpgradeIds, availableBlueprintTroopIds);
        remainingCategories = remainingCategories.filter((entry) => entry !== category);
    }
    base.resources.gold = fixed(base.resources.gold * rewardMultiplier);
    base.resources.essence = fixed(base.resources.essence * rewardMultiplier);
    if (rewardMultiplier > 1 && base.upgradeChoiceBatches > 0) {
        base.upgradeChoiceBatches *= rewardMultiplier;
        const wholeBatches = Math.floor(base.upgradeChoiceBatches);
        base.upgradeChoiceBatches = wholeBatches;
    }
    return base;
}
function buildEnemyArmy(tier, seed, mutatorIds) {
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
function pickRiftSaturation(seed) {
    const rng = createRng(deriveSeed(seed, 809));
    return 3 + rng.int(13);
}
export function generateCycleRifts(state) {
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
            rewardPackage: buildRewardPackage(tier, mutatorIds, [], [], riftSeed),
            saturation: pickRiftSaturation(riftSeed),
            expiresInCycles: 2,
            state: 'discovered',
        };
    });
}
export function enrichRiftRewards(rifts, availableUpgradeIds, availableBlueprintTroopIds = []) {
    return rifts.map((rift) => ({
        ...rift,
        rewardPackage: buildRewardPackage(rift.tier, rift.mutatorIds, availableUpgradeIds, availableBlueprintTroopIds, rift.seed),
    }));
}
export function getBlueprintRewardPool() {
    return Object.values(FACTIONS).flatMap((faction) => faction.blueprintUnitTypeIds.map((unitTypeId) => getTroopUnlockId(faction.id, unitTypeId)));
}
export function getMutatorLabels(mutatorIds) {
    return mutatorIds.map((id) => getMutator(id).label);
}
