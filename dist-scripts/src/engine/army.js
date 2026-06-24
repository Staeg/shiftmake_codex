import { fixed, fixedClamp, formatFixed } from './fixed';
import { applyStatModifier, clampStat, composeBaseTroopDefinition, getAbility, getRace, getRaceUpgrade, getTroopQuantityForCost, getTroopClassUpgrade, getTroopUnlockId, getTroopClass, } from './unitCatalog';
export const VICTORY_RECOVERY = 1;
export const DEFEAT_RECOVERY = 1;
const EXPLAINED_STAT_KEYS = ['health', 'damage', 'speed', 'armor', 'range', 'capacity', 'size'];
export function createTroopInstance(raceId, unitClassId) {
    return {
        id: getTroopUnlockId(raceId, unitClassId),
        raceId,
        unitClassId,
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
export function isRaceUnited(state, raceId) {
    return state.raceUpgradeIds
        .map(getRaceUpgrade)
        .filter((upgrade) => upgrade.raceId === raceId)
        .some((upgrade) => upgrade.effects.some((effect) => effect.kind === 'addAbility' && getAbility(effect.abilityId).overworldEffectId === 'united'));
}
function applyTierScaling(stats, tier) {
    if (tier === null || tier < 4) {
        return stats;
    }
    const multiplier = 1.2;
    return {
        ...stats,
        health: fixed(stats.health * multiplier),
        damage: fixed(stats.damage * multiplier),
        speed: fixedClamp(fixed(stats.speed * multiplier), 1, 100),
    };
}
function applyRaceUpgradeEffects(state, raceId, stats, abilities, attributes) {
    let nextStats = { ...stats };
    const nextAbilities = [...abilities];
    const nextAttributes = [...attributes];
    state.raceUpgradeIds
        .map(getRaceUpgrade)
        .filter((upgrade) => upgrade.raceId === raceId)
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
function applyRaceUpgradeEffectsDetailed(state, raceId, stats, abilities, attributes) {
    let nextStats = { ...stats };
    const nextAbilities = [...abilities];
    const nextAttributes = [...attributes];
    const statContributions = {};
    state.raceUpgradeIds
        .map(getRaceUpgrade)
        .filter((upgrade) => upgrade.raceId === raceId)
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
function applyTroopClassUpgradeEffects(state, unitClassId, stats, abilities, attributes) {
    let nextStats = { ...stats };
    let nextAbilities = [...abilities];
    const nextAttributes = [...attributes];
    state.troopClassUpgradeIds
        .map(getTroopClassUpgrade)
        .filter((upgrade) => upgrade.unitClassId === unitClassId)
        .forEach((upgrade) => {
        upgrade.effects.forEach((effect) => {
            if (effect.kind === 'addAbility') {
                const ability = getAbility(effect.abilityId);
                if (!nextAbilities.some((entry) => entry.id === ability.id)) {
                    nextAbilities.push(ability);
                }
                return;
            }
            if (effect.kind === 'replaceAbility') {
                nextAbilities = nextAbilities.filter((entry) => entry.id !== effect.removeAbilityId);
                const replacement = getAbility(effect.addAbilityId);
                if (!nextAbilities.some((entry) => entry.id === replacement.id)) {
                    nextAbilities.push(replacement);
                }
                return;
            }
            if (effect.kind === 'addAttribute') {
                if (!nextAttributes.includes(effect.attribute)) {
                    nextAttributes.push(effect.attribute);
                }
                return;
            }
            nextStats = applyStatModifier(nextStats, effect.statModifiers, nextAttributes);
        });
    });
    return { stats: nextStats, abilities: nextAbilities, attributes: nextAttributes };
}
function applyTroopClassUpgradeEffectsDetailed(state, unitClassId, stats, abilities, attributes) {
    let nextStats = { ...stats };
    let nextAbilities = [...abilities];
    const nextAttributes = [...attributes];
    const statContributions = {};
    state.troopClassUpgradeIds
        .map(getTroopClassUpgrade)
        .filter((upgrade) => upgrade.unitClassId === unitClassId)
        .forEach((upgrade) => {
        upgrade.effects.forEach((effect) => {
            if (effect.kind === 'addAbility') {
                const ability = getAbility(effect.abilityId);
                if (!nextAbilities.some((entry) => entry.id === ability.id)) {
                    nextAbilities.push(ability);
                }
                return;
            }
            if (effect.kind === 'replaceAbility') {
                nextAbilities = nextAbilities.filter((entry) => entry.id !== effect.removeAbilityId);
                const replacement = getAbility(effect.addAbilityId);
                if (!nextAbilities.some((entry) => entry.id === replacement.id)) {
                    nextAbilities.push(replacement);
                }
                return;
            }
            if (effect.kind === 'addAttribute') {
                if (!nextAttributes.includes(effect.attribute)) {
                    nextAttributes.push(effect.attribute);
                }
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
function buildStatBreakdowns(troop, side, enemyTier, baseStats, raceStats, tierStats, finalStats, troopClassUpgradeContributions, raceUpgradeContributions) {
    const race = getRace(troop.raceId);
    const unitClass = getUnitClass(troop.unitClassId);
    return Object.fromEntries(EXPLAINED_STAT_KEYS.map((stat) => {
        const lines = [{ label: `${unitClass.label} base`, value: baseStats[stat], kind: 'base' }];
        const raceDelta = fixed(raceStats[stat] - baseStats[stat]);
        if (raceDelta !== 0) {
            lines.push({ label: race.label, value: raceDelta, kind: 'delta' });
        }
        const tierDelta = fixed(tierStats[stat] - raceStats[stat]);
        if (tierDelta !== 0 && side === 'enemy' && enemyTier !== null && enemyTier > 1) {
            lines.push({ label: `Enemy Rift Tier ${enemyTier}`, value: tierDelta, kind: 'delta' });
        }
        troopClassUpgradeContributions[stat]?.forEach((line) => lines.push(line));
        raceUpgradeContributions[stat]?.forEach((line) => lines.push(line));
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
    const unitClass = getUnitClass(troop.unitClassId);
    const base = composeBaseTroopDefinition(troop.raceId, troop.unitClassId);
    const baseUnitStats = {
        health: clampStat('health', unitClass.stats.health),
        damage: clampStat('damage', unitClass.stats.damage),
        speed: clampStat('speed', unitClass.stats.speed),
        armor: clampStat('armor', unitClass.stats.armor),
        range: clampStat('range', unitClass.stats.range),
        capacity: clampStat('capacity', unitClass.stats.capacity),
        size: clampStat('size', unitClass.stats.size),
    };
    const tierStats = applyTierScaling(base.stats, side === 'enemy' ? enemyTier : null);
    const troopClassDetailed = applyTroopClassUpgradeEffectsDetailed(state, troop.unitClassId, tierStats, base.abilities, base.attributes);
    const raceDetailed = applyRaceUpgradeEffectsDetailed(state, troop.raceId, troopClassDetailed.stats, troopClassDetailed.abilities, troopClassDetailed.attributes);
    return buildStatBreakdowns(troop, side, enemyTier, baseUnitStats, base.stats, tierStats, raceDetailed.stats, troopClassDetailed.statContributions, raceDetailed.statContributions);
}
export function getTroopQuantityBreakdown(troop) {
    const race = getRace(troop.raceId);
    const unitClass = getUnitClass(troop.unitClassId);
    const baseQuantity = getTroopQuantityForCost(unitClass.cost);
    const base = composeBaseTroopDefinition(troop.raceId, troop.unitClassId);
    const lines = [{ label: `${unitClass.label} base cost ${formatFixed(unitClass.cost)}`, value: baseQuantity, kind: 'base' }];
    const costMultiplier = race.statAdjustments.cost?.multiplier ?? 1;
    const costFlat = race.statAdjustments.cost?.flat ?? 0;
    if (costMultiplier !== 1 || costFlat !== 0) {
        const costText = costMultiplier !== 1
            ? `Cost x${formatFixed(costMultiplier)}`
            : `Cost ${costFlat > 0 ? '+' : ''}${formatFixed(costFlat)}`;
        lines.push({
            label: `${race.label} ${costText} -> quantity x${formatFixed(base.quantity / baseQuantity)}`,
            value: fixed(base.quantity - baseQuantity),
            kind: 'delta',
        });
    }
    return {
        stat: 'quantity',
        finalValue: base.quantity,
        lines,
    };
}
export function getEnemyStatBreakdowns(raceId, unitClassId, tier) {
    return getResolvedStatBreakdowns({ raceUpgradeIds: [], troopClassUpgradeIds: [] }, createTroopInstance(raceId, unitClassId), 'enemy', tier);
}
export function resolveTroopCombatant(state, troop, side, enemyTier = null, combatantId = troop.id) {
    const base = composeBaseTroopDefinition(troop.raceId, troop.unitClassId);
    const scaled = applyTierScaling(base.stats, side === 'enemy' ? enemyTier : null);
    const withTroopClassEffects = applyTroopClassUpgradeEffects(state, troop.unitClassId, scaled, base.abilities, base.attributes);
    const withRaceEffects = applyRaceUpgradeEffects(state, troop.raceId, withTroopClassEffects.stats, withTroopClassEffects.abilities, withTroopClassEffects.attributes);
    return {
        combatantId,
        raceId: troop.raceId,
        unitClassId: troop.unitClassId,
        troopInstanceId: troop.id,
        label: base.label,
        role: base.role,
        unitClassTag: base.unitClassTag,
        attributes: withRaceEffects.attributes,
        stats: withRaceEffects.stats,
        abilities: withRaceEffects.abilities,
        quantity: base.quantity,
        cost: base.cost,
        side,
        statBreakdowns: getResolvedStatBreakdowns(state, troop, side, enemyTier),
    };
}
export function resolveEnemyCombatant(raceUpgradeIds, troopClassUpgradeIds, raceId, unitClassId, tier, combatantId) {
    return resolveTroopCombatant({ raceUpgradeIds, troopClassUpgradeIds }, createTroopInstance(raceId, unitClassId), 'enemy', tier, combatantId);
}
export function getTroopEffectiveDefinition(state, troopId) {
    return resolveTroopCombatant(state, getTroopById(state, troopId), 'player');
}
export function getTroopStatusCounts(state) {
    let active = 0;
    let recovering = 0;
    let idle = 0;
    state.troops.forEach((troop) => {
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
export function getRaceTroops(state, raceId) {
    return state.troops.filter((troop) => troop.raceId === raceId);
}
export function tickRecovery(troops) {
    return troops.map((troop) => ({
        ...troop,
        recoveryCyclesRemaining: Math.max(0, troop.recoveryCyclesRemaining - 1),
    }));
}
export function getRiftSummaryTroops(state, rift) {
    return getTroopsAssignedToRift(state, rift.id).map((troop) => composeBaseTroopDefinition(troop.raceId, troop.unitClassId).label);
}
//# sourceMappingURL=army.js.map