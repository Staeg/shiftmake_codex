import { fixed, fixedClamp, fixedMax, fixedMul } from './fixed';
import { applyPercentageUpgrade, applyStatModifier, clampStat, composeBaseTroopDefinition, getAbility, getFaction, getFactionUpgrade, getTroopSelectionCost, getTroopUnlockId, getUnitType, getUpgradeableStatsForUnitType, } from './unitCatalog';
export const VICTORY_RECOVERY = 1;
export const DEFEAT_RECOVERY = 2;
const EXPLAINED_STAT_KEYS = ['health', 'damage', 'speed', 'armor', 'range', 'capacity', 'size'];
function withDefaultStatLevels(levels) {
    return {
        health: levels?.health ?? 0,
        damage: levels?.damage ?? 0,
        speed: levels?.speed ?? 0,
        armor: levels?.armor ?? 0,
        range: levels?.range ?? 0,
        capacity: levels?.capacity ?? 0,
    };
}
export function createTroopInstance(factionId, unitTypeId, index) {
    const base = composeBaseTroopDefinition(factionId, unitTypeId);
    return {
        id: `${factionId}-${unitTypeId}-${index}`,
        factionId,
        unitTypeId,
        quantity: base.quantity,
        unlocked: true,
        statUpgradeLevels: withDefaultStatLevels(),
        recoveryCyclesRemaining: 0,
        assignmentRiftId: null,
    };
}
export function getTroopById(state, troopId) {
    const troop = state.troops.find((entry) => entry.id === troopId);
    if (!troop) {
        throw new Error(`Unknown troop instance ${troopId}`);
    }
    return troop;
}
export function getTroopsAssignedToRift(state, riftId) {
    return state.troops.filter((troop) => troop.assignmentRiftId === riftId);
}
export function isFactionUnited(state, factionId) {
    return state.factionUpgradeIds
        .map(getFactionUpgrade)
        .filter((upgrade) => upgrade.factionId === factionId)
        .some((upgrade) => upgrade.effects.some((effect) => effect.kind === 'addAbility' && getAbility(effect.abilityId).overworldEffectId === 'united'));
}
export function canUpgradeStat(unitTypeId, stat) {
    return getUpgradeableStatsForUnitType(unitTypeId).includes(stat);
}
function applyTierScaling(stats, tier) {
    if (tier === null || tier <= 1) {
        return stats;
    }
    const multiplier = fixed(1 + 0.2 * (tier - 1));
    return {
        ...stats,
        health: fixedMul(stats.health, multiplier),
        damage: fixedMul(stats.damage, multiplier),
        speed: fixedClamp(fixedMul(stats.speed, multiplier), 1, 100),
    };
}
function applyUpgradeLevels(base, troop) {
    const baseAttributes = composeBaseTroopDefinition(troop.factionId, troop.unitTypeId).attributes;
    const levels = withDefaultStatLevels(troop.statUpgradeLevels);
    const next = { ...base };
    next.health = applyPercentageUpgrade(next.health, levels.health);
    next.damage = applyPercentageUpgrade(next.damage, levels.damage);
    next.speed = fixedClamp(applyPercentageUpgrade(next.speed, levels.speed), 1, 100);
    next.armor = fixed(next.armor + levels.armor);
    next.range = baseAttributes.includes('melee') ? next.range : fixedMax(next.range + levels.range, 0);
    next.capacity = fixedMax(next.capacity + levels.capacity, 0);
    return next;
}
function applyFactionUpgradeEffects(state, factionId, unitTypeId, stats, abilities, attributes) {
    let nextStats = { ...stats };
    const nextAbilities = [...abilities];
    const nextAttributes = [...attributes];
    state.factionUpgradeIds
        .map(getFactionUpgrade)
        .filter((upgrade) => upgrade.factionId === factionId)
        .forEach((upgrade) => {
        upgrade.effects.forEach((effect) => {
            if (effect.kind === 'addAbility') {
                const ability = getAbility(effect.abilityId);
                if (!nextAbilities.some((entry) => entry.id === ability.id)) {
                    nextAbilities.push(ability);
                }
                return;
            }
            if (effect.kind === 'addAttribute') {
                if (!nextAttributes.includes(effect.attribute)) {
                    nextAttributes.push(effect.attribute);
                }
                return;
            }
            if (effect.unitFilter === 'nonMelee' && nextAttributes.includes('melee')) {
                return;
            }
            nextStats = applyStatModifier(nextStats, effect.statModifiers, nextAttributes);
        });
    });
    return { stats: nextStats, abilities: nextAbilities, attributes: nextAttributes };
}
function pushContribution(contributions, stat, line) {
    if (!contributions[stat]) {
        contributions[stat] = [];
    }
    contributions[stat]?.push(line);
}
function applyFactionUpgradeEffectsDetailed(state, factionId, stats, abilities, attributes) {
    let nextStats = { ...stats };
    const nextAbilities = [...abilities];
    const nextAttributes = [...attributes];
    const statContributions = {};
    state.factionUpgradeIds
        .map(getFactionUpgrade)
        .filter((upgrade) => upgrade.factionId === factionId)
        .forEach((upgrade) => {
        upgrade.effects.forEach((effect) => {
            if (effect.kind === 'addAbility') {
                const ability = getAbility(effect.abilityId);
                if (!nextAbilities.some((entry) => entry.id === ability.id)) {
                    nextAbilities.push(ability);
                }
                return;
            }
            if (effect.kind === 'addAttribute') {
                if (!nextAttributes.includes(effect.attribute)) {
                    nextAttributes.push(effect.attribute);
                }
                return;
            }
            if (effect.unitFilter === 'nonMelee' && nextAttributes.includes('melee')) {
                return;
            }
            const before = nextStats;
            nextStats = applyStatModifier(nextStats, effect.statModifiers, nextAttributes);
            EXPLAINED_STAT_KEYS.forEach((stat) => {
                const delta = fixed(nextStats[stat] - before[stat]);
                if (delta !== 0) {
                    pushContribution(statContributions, stat, { label: upgrade.label, value: delta, kind: 'delta' });
                }
            });
        });
    });
    return { stats: nextStats, abilities: nextAbilities, attributes: nextAttributes, statContributions };
}
function buildStatBreakdowns(troop, side, enemyTier, baseStats, factionStats, tierStats, upgradedStats, finalStats, factionUpgradeContributions) {
    const faction = getFaction(troop.factionId);
    const unitType = getUnitType(troop.unitTypeId);
    const levels = withDefaultStatLevels(troop.statUpgradeLevels);
    return Object.fromEntries(EXPLAINED_STAT_KEYS.map((stat) => {
        const lines = [{ label: `${unitType.label} base`, value: baseStats[stat], kind: 'base' }];
        const factionDelta = fixed(factionStats[stat] - baseStats[stat]);
        if (factionDelta !== 0) {
            lines.push({ label: faction.label, value: factionDelta, kind: 'delta' });
        }
        const tierDelta = fixed(tierStats[stat] - factionStats[stat]);
        if (tierDelta !== 0 && side === 'enemy' && enemyTier !== null && enemyTier > 1) {
            lines.push({ label: `Enemy Rift Tier ${enemyTier}`, value: tierDelta, kind: 'delta' });
        }
        const upgradeDelta = fixed(upgradedStats[stat] - tierStats[stat]);
        if (upgradeDelta !== 0) {
            const label = stat in levels && levels[stat] > 0
                ? `Purchased ${stat} upgrades x${levels[stat]}`
                : 'Purchased upgrades';
            lines.push({ label, value: upgradeDelta, kind: 'delta' });
        }
        factionUpgradeContributions[stat]?.forEach((line) => lines.push(line));
        return [
            stat,
            {
                stat,
                finalValue: finalStats[stat],
                lines,
            },
        ];
    }));
}
export function getResolvedStatBreakdowns(state, troop, side, enemyTier = null) {
    const unitType = getUnitType(troop.unitTypeId);
    const base = composeBaseTroopDefinition(troop.factionId, troop.unitTypeId);
    const baseUnitStats = {
        health: clampStat('health', unitType.stats.health),
        damage: clampStat('damage', unitType.stats.damage),
        speed: clampStat('speed', unitType.stats.speed),
        armor: clampStat('armor', unitType.stats.armor),
        range: clampStat('range', unitType.stats.range),
        capacity: clampStat('capacity', unitType.stats.capacity),
        size: clampStat('size', unitType.stats.size),
    };
    const tierStats = applyTierScaling(base.stats, side === 'enemy' ? enemyTier : null);
    const upgradedStats = applyUpgradeLevels(tierStats, troop);
    const detailed = applyFactionUpgradeEffectsDetailed(state, troop.factionId, upgradedStats, base.abilities, base.attributes);
    return buildStatBreakdowns(troop, side, enemyTier, baseUnitStats, base.stats, tierStats, upgradedStats, detailed.stats, detailed.statContributions);
}
export function getEnemyStatBreakdowns(factionId, unitTypeId, tier) {
    const troop = {
        id: '__enemy_preview__',
        factionId,
        unitTypeId,
        quantity: composeBaseTroopDefinition(factionId, unitTypeId).quantity,
        unlocked: true,
        statUpgradeLevels: withDefaultStatLevels(),
        recoveryCyclesRemaining: 0,
        assignmentRiftId: null,
    };
    return getResolvedStatBreakdowns({ factionUpgradeIds: [] }, troop, 'enemy', tier);
}
export function resolveTroopCombatant(state, troop, side, enemyTier = null, combatantId = troop.id) {
    const base = composeBaseTroopDefinition(troop.factionId, troop.unitTypeId);
    const scaled = applyTierScaling(base.stats, side === 'enemy' ? enemyTier : null);
    const upgraded = applyUpgradeLevels(scaled, troop);
    const withFactionEffects = applyFactionUpgradeEffects(state, troop.factionId, troop.unitTypeId, upgraded, base.abilities, base.attributes);
    return {
        combatantId,
        factionId: troop.factionId,
        unitTypeId: troop.unitTypeId,
        troopInstanceId: troop.id,
        label: base.label,
        role: base.role,
        type: base.type,
        attributes: withFactionEffects.attributes,
        stats: withFactionEffects.stats,
        abilities: withFactionEffects.abilities,
        quantity: troop.quantity,
        cost: base.cost,
        side,
        statBreakdowns: getResolvedStatBreakdowns(state, troop, side, enemyTier),
    };
}
export function resolveEnemyCombatant(factionUpgradeIds, factionId, unitTypeId, quantity, tier, combatantId) {
    const fakeState = { factionUpgradeIds };
    const troop = {
        id: combatantId,
        factionId,
        unitTypeId,
        quantity,
        unlocked: true,
        statUpgradeLevels: withDefaultStatLevels(),
        recoveryCyclesRemaining: 0,
        assignmentRiftId: null,
    };
    return resolveTroopCombatant(fakeState, troop, 'enemy', tier, combatantId);
}
export function getTroopAddUnitCost(troop) {
    const troopId = `${troop.factionId}/${troop.unitTypeId}`;
    const currentCost = getTroopSelectionCost(troopId, troop.quantity);
    const nextCost = getTroopSelectionCost(troopId, troop.quantity + 1);
    return fixed(nextCost - currentCost);
}
export function getTroopStatUpgradeCost(troop, stat) {
    if (!canUpgradeStat(troop.unitTypeId, stat)) {
        return Number.POSITIVE_INFINITY;
    }
    const levels = troop.statUpgradeLevels[stat] ?? 0;
    const unitType = getUnitType(troop.unitTypeId);
    const upgradeBaseCost = 100;
    if (stat === 'health' || stat === 'damage' || stat === 'speed') {
        return fixed((upgradeBaseCost / 10) * (levels + 1));
    }
    if (stat === 'armor') {
        return fixed((upgradeBaseCost / 20 + unitType.stats.armor) * (levels + 1));
    }
    const starting = stat === 'range' ? unitType.stats.range : unitType.stats.capacity;
    const safeStarting = Math.max(1, starting);
    return fixed((upgradeBaseCost * (levels + safeStarting)) / (safeStarting * 2));
}
export function getFactionUnlockCost(state) {
    return 100 * state.unlockedFactionIds.length;
}
export function getTroopUnlockCost(state, factionId, unitTypeId) {
    void factionId;
    void unitTypeId;
    const unlockedTroopCount = state.troops.filter((troop) => troop.unlocked).length;
    return fixed(100 * unlockedTroopCount);
}
export function getTroopEffectiveDefinition(state, troopId) {
    return resolveTroopCombatant(state, getTroopById(state, troopId), 'player');
}
export function getTroopStatusCounts(state) {
    let active = 0;
    let recovering = 0;
    let idle = 0;
    state.troops.filter((troop) => troop.unlocked).forEach((troop) => {
        if (troop.assignmentRiftId) {
            active += 1;
        }
        else if (troop.recoveryCyclesRemaining > 0) {
            recovering += 1;
        }
        else {
            idle += 1;
        }
    });
    return { active, recovering, idle };
}
export function getFactionTroops(state, factionId) {
    return state.troops.filter((troop) => troop.factionId === factionId);
}
export function getAvailableFactionTroopUnlocks(state, factionId) {
    const faction = getFaction(factionId);
    const availableUnitTypeIds = [...faction.defaultUnitTypeIds];
    faction.blueprintUnitTypeIds.forEach((unitTypeId) => {
        if (state.unlockedBlueprintTroopIds.includes(getTroopUnlockId(factionId, unitTypeId))) {
            availableUnitTypeIds.push(unitTypeId);
        }
    });
    return availableUnitTypeIds.filter((unitTypeId, index) => availableUnitTypeIds.indexOf(unitTypeId) === index &&
        !state.troops.some((troop) => troop.factionId === factionId && troop.unitTypeId === unitTypeId));
}
export function tickRecovery(troops) {
    return troops.map((troop) => ({
        ...troop,
        recoveryCyclesRemaining: Math.max(0, troop.recoveryCyclesRemaining - 1),
        assignmentRiftId: troop.assignmentRiftId,
    }));
}
export function getRiftSummaryTroops(state, rift) {
    return getTroopsAssignedToRift(state, rift.id).map((troop) => composeBaseTroopDefinition(troop.factionId, troop.unitTypeId).label);
}
//# sourceMappingURL=army.js.map