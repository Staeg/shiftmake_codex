import { applyStatModifier, composeBaseTroopDefinition, RACE_UPGRADES, getAbility, getRaceNativeTroopUnlockIds, TROOP_CLASS_UPGRADES } from './unitCatalog';
export function getAllUpgradeIds() {
    return [...Object.keys(RACE_UPGRADES), ...Object.keys(TROOP_CLASS_UPGRADES)];
}
export function getUnownedUpgradeIds(state) {
    return getAllUpgradeIds().filter((upgradeId) => !state.raceUpgradeIds.includes(upgradeId) && !state.troopClassUpgradeIds.includes(upgradeId));
}
export function getClaimableTroopUnlockIds(state) {
    const unlockedRaceIds = new Set(state.unlockedRaceIds);
    const nativeTroopUnlockIds = state.unlockedRaceIds.flatMap((raceId) => getRaceNativeTroopUnlockIds(raceId));
    const latentTroopUnlockIds = state.unlockedTroopUnlockIds.filter((troopUnlockId) => {
        const [raceId] = troopUnlockId.split('/');
        return unlockedRaceIds.has(raceId);
    });
    return [...new Set([...nativeTroopUnlockIds, ...latentTroopUnlockIds])];
}
export function getOwnedTroopUnlockIds(state) {
    return state.troops.map((troop) => `${troop.raceId}/${troop.unitClassId}`);
}
export function getAvailableTroopUnlockIds(state) {
    const ownedTroopUnlockIds = new Set(getOwnedTroopUnlockIds(state));
    return getClaimableTroopUnlockIds(state).filter((troopUnlockId) => !ownedTroopUnlockIds.has(troopUnlockId));
}
export function describeTroopUnlock(troopUnlockId) {
    const [raceId, unitClassId] = troopUnlockId.split('/');
    return composeBaseTroopDefinition(raceId, unitClassId).label;
}
function hasRangedOrCasterTag(troop) {
    const definition = composeBaseTroopDefinition(troop.raceId, troop.unitClassId);
    return definition.attributes.includes('ranged') || definition.attributes.includes('caster');
}
function canAbilityAffectTroop(abilityId, troop) {
    const definition = composeBaseTroopDefinition(troop.raceId, troop.unitClassId);
    if (abilityId === 'fade-into-shadow') {
        return definition.role === 'backline';
    }
    if (abilityId === 'long-shot-doctrine' || abilityId === 'silver-distance') {
        return hasRangedOrCasterTag(troop);
    }
    return true;
}
function raceUpgradeAffectsTroop(upgradeId, troop) {
    const upgrade = RACE_UPGRADES[upgradeId];
    if (!upgrade || upgrade.raceId !== troop.raceId) {
        return false;
    }
    const definition = composeBaseTroopDefinition(troop.raceId, troop.unitClassId);
    return upgrade.effects.some((effect) => {
        if (effect.kind === 'addAbility') {
            return canAbilityAffectTroop(effect.abilityId, troop) && !definition.abilities.some((ability) => ability.id === getAbility(effect.abilityId).id);
        }
        if (effect.kind === 'addAttribute') {
            return !definition.attributes.includes(effect.attribute);
        }
        if (effect.unitFilter === 'nonMelee' && definition.attributes.includes('melee')) {
            return false;
        }
        const modified = applyStatModifier(definition.stats, effect.statModifiers, definition.attributes);
        return Object.keys(effect.statModifiers).some((stat) => modified[stat] !== definition.stats[stat]);
    });
}
function troopClassUpgradeAffectsTroop(upgradeId, troop) {
    const upgrade = TROOP_CLASS_UPGRADES[upgradeId];
    if (!upgrade || upgrade.unitClassId !== troop.unitClassId) {
        return false;
    }
    const definition = composeBaseTroopDefinition(troop.raceId, troop.unitClassId);
    return upgrade.effects.some((effect) => {
        if (effect.kind === 'addAbility') {
            return !definition.abilities.some((ability) => ability.id === getAbility(effect.abilityId).id);
        }
        if (effect.kind === 'replaceAbility') {
            return definition.abilities.some((ability) => ability.id === effect.removeAbilityId)
                && !definition.abilities.some((ability) => ability.id === effect.addAbilityId);
        }
        if (effect.kind === 'addAttribute') {
            return !definition.attributes.includes(effect.attribute);
        }
        const modified = applyStatModifier(definition.stats, effect.statModifiers, definition.attributes);
        return Object.keys(effect.statModifiers).some((stat) => modified[stat] !== definition.stats[stat]);
    });
}
export function upgradeAffectsTroop(upgradeId, troop) {
    if (upgradeId in RACE_UPGRADES) {
        return raceUpgradeAffectsTroop(upgradeId, troop);
    }
    return troopClassUpgradeAffectsTroop(upgradeId, troop);
}
//# sourceMappingURL=upgrades.js.map