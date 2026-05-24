import { fixed, fixedClamp, formatFixed } from './fixed';
import { applyStatModifier, clampStat, composeBaseTroopDefinition, getAbility, getFaction, getFactionUpgrade, getTroopQuantityForCost, getTroopTypeUpgrade, getTroopUnlockId, getUnitType, } from './unitCatalog';
export const VICTORY_RECOVERY = 1;
export const DEFEAT_RECOVERY = 1;
const EXPLAINED_STAT_KEYS = ['health', 'damage', 'speed', 'armor', 'range', 'capacity', 'size'];
export function createTroopInstance(factionId, unitTypeId) {
    return {
        id: getTroopUnlockId(factionId, unitTypeId),
        factionId,
        unitTypeId,
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
function applyFactionUpgradeEffects(state, factionId, stats, abilities, attributes) {
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
function applyTroopTypeUpgradeEffects(state, unitTypeId, stats, abilities, attributes) {
    let nextStats = { ...stats };
    let nextAbilities = [...abilities];
    const nextAttributes = [...attributes];
    state.troopTypeUpgradeIds
        .map(getTroopTypeUpgrade)
        .filter((upgrade) => upgrade.unitTypeId === unitTypeId)
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
function applyTroopTypeUpgradeEffectsDetailed(state, unitTypeId, stats, abilities, attributes) {
    let nextStats = { ...stats };
    let nextAbilities = [...abilities];
    const nextAttributes = [...attributes];
    const statContributions = {};
    state.troopTypeUpgradeIds
        .map(getTroopTypeUpgrade)
        .filter((upgrade) => upgrade.unitTypeId === unitTypeId)
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
function buildStatBreakdowns(troop, side, enemyTier, baseStats, factionStats, tierStats, finalStats, troopTypeUpgradeContributions, factionUpgradeContributions) {
    const faction = getFaction(troop.factionId);
    const unitType = getUnitType(troop.unitTypeId);
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
        troopTypeUpgradeContributions[stat]?.forEach((line) => lines.push(line));
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
    const troopTypeDetailed = applyTroopTypeUpgradeEffectsDetailed(state, troop.unitTypeId, tierStats, base.abilities, base.attributes);
    const factionDetailed = applyFactionUpgradeEffectsDetailed(state, troop.factionId, troopTypeDetailed.stats, troopTypeDetailed.abilities, troopTypeDetailed.attributes);
    return buildStatBreakdowns(troop, side, enemyTier, baseUnitStats, base.stats, tierStats, factionDetailed.stats, troopTypeDetailed.statContributions, factionDetailed.statContributions);
}
export function getTroopQuantityBreakdown(troop) {
    const faction = getFaction(troop.factionId);
    const unitType = getUnitType(troop.unitTypeId);
    const baseQuantity = getTroopQuantityForCost(unitType.cost);
    const base = composeBaseTroopDefinition(troop.factionId, troop.unitTypeId);
    const lines = [{ label: `${unitType.label} base cost ${formatFixed(unitType.cost)}`, value: baseQuantity, kind: 'base' }];
    const costMultiplier = faction.statAdjustments.cost?.multiplier ?? 1;
    const costFlat = faction.statAdjustments.cost?.flat ?? 0;
    if (costMultiplier !== 1 || costFlat !== 0) {
        const costText = costMultiplier !== 1
            ? `Cost x${formatFixed(costMultiplier)}`
            : `Cost ${costFlat > 0 ? '+' : ''}${formatFixed(costFlat)}`;
        lines.push({
            label: `${faction.label} ${costText} -> quantity x${formatFixed(base.quantity / baseQuantity)}`,
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
export function getEnemyStatBreakdowns(factionId, unitTypeId, tier) {
    return getResolvedStatBreakdowns({ factionUpgradeIds: [], troopTypeUpgradeIds: [] }, createTroopInstance(factionId, unitTypeId), 'enemy', tier);
}
export function resolveTroopCombatant(state, troop, side, enemyTier = null, combatantId = troop.id) {
    const base = composeBaseTroopDefinition(troop.factionId, troop.unitTypeId);
    const scaled = applyTierScaling(base.stats, side === 'enemy' ? enemyTier : null);
    const withTroopTypeEffects = applyTroopTypeUpgradeEffects(state, troop.unitTypeId, scaled, base.abilities, base.attributes);
    const withFactionEffects = applyFactionUpgradeEffects(state, troop.factionId, withTroopTypeEffects.stats, withTroopTypeEffects.abilities, withTroopTypeEffects.attributes);
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
        quantity: base.quantity,
        cost: base.cost,
        side,
        statBreakdowns: getResolvedStatBreakdowns(state, troop, side, enemyTier),
    };
}
export function resolveEnemyCombatant(factionUpgradeIds, troopTypeUpgradeIds, factionId, unitTypeId, tier, combatantId) {
    return resolveTroopCombatant({ factionUpgradeIds, troopTypeUpgradeIds }, createTroopInstance(factionId, unitTypeId), 'enemy', tier, combatantId);
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
export function getFactionTroops(state, factionId) {
    return state.troops.filter((troop) => troop.factionId === factionId);
}
export function tickRecovery(troops) {
    return troops.map((troop) => ({
        ...troop,
        recoveryCyclesRemaining: Math.max(0, troop.recoveryCyclesRemaining - 1),
    }));
}
export function getRiftSummaryTroops(state, rift) {
    return getTroopsAssignedToRift(state, rift.id).map((troop) => composeBaseTroopDefinition(troop.factionId, troop.unitTypeId).label);
}
//# sourceMappingURL=army.js.map