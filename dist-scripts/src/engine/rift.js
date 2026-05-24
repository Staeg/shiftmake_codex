import { createRng } from './rng';
import { ALL_TROOP_UNLOCK_IDS, MUTATORS, getMutator } from './unitCatalog';
import { resolveEnemyCombatant } from './army';
const CYCLE_RIFT_TIERS = [
    [2, 1, 1, 1],
    [2, 2, 1, 1],
    [3, 2, 1, 1],
    [3, 2, 2, 1],
    [3, 3, 2, 1],
];
const MUTATOR_POOL = Object.keys(MUTATORS);
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
function createDerivedRng(seed, salt) {
    return createRng(mixSeed(deriveSeed(seed, salt)));
}
function splitTroopUnlockId(troopUnlockId) {
    return troopUnlockId.split('/');
}
export function getCycleTierSchedule(cycleNumber) {
    return cycleNumber <= CYCLE_RIFT_TIERS.length ? [...CYCLE_RIFT_TIERS[cycleNumber - 1]] : [4, 3, 2, 1];
}
function buildCycleMutatorAssignments(tiers, cycleSeed) {
    const eligibleRiftCount = tiers.filter((tier) => tier > 0).length;
    if (eligibleRiftCount === 0) {
        return tiers.map(() => []);
    }
    const rng = createDerivedRng(cycleSeed, 41);
    const bag = [];
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
function buildEnemyArmy(tier, seed) {
    const rng = createDerivedRng(seed, 97);
    const enemyGroupCount = Math.min(tier, 3) + 1;
    const selections = rng.shuffle([...ALL_TROOP_UNLOCK_IDS]).slice(0, enemyGroupCount);
    return selections.map((troopUnlockId, index) => {
        const [factionId, unitTypeId] = splitTroopUnlockId(troopUnlockId);
        return resolveEnemyCombatant([], [], factionId, unitTypeId, tier, `rift-${seed}-${index}`);
    });
}
function pickRiftSaturation(seed) {
    const rng = createDerivedRng(seed, 809);
    return 3 + rng.int(13);
}
export function generateCycleRifts(state) {
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
            saturation: pickRiftSaturation(riftSeed),
            state: 'discovered',
        };
    });
}
export function getContestCycleTierSchedule(cycleNumber) {
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
export function generateContestCycleRifts(state) {
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
            saturation: pickRiftSaturation(riftSeed),
            state: 'discovered',
            controller: 'neutral',
            occupyingPlayerId: null,
            occupyingTroopIds: [],
        };
    });
}
export function getMutatorLabels(mutatorIds) {
    return mutatorIds.map((id) => getMutator(id).label);
}
//# sourceMappingURL=rift.js.map