import { applyStatModifier, composeBaseTroopDefinition, FACTION_UPGRADES, getAbility, getFactionNativeTroopUnlockIds, TROOP_TYPE_UPGRADES } from './unitCatalog';
export function getAllUpgradeIds() {
    return [...Object.keys(FACTION_UPGRADES), ...Object.keys(TROOP_TYPE_UPGRADES)];
}
export function getUnownedUpgradeIds(state) {
    return getAllUpgradeIds().filter((upgradeId) => !state.factionUpgradeIds.includes(upgradeId) && !state.troopTypeUpgradeIds.includes(upgradeId));
}
export function getClaimableTroopUnlockIds(state) {
    const unlockedFactionIds = new Set(state.unlockedFactionIds);
    const nativeTroopUnlockIds = state.unlockedFactionIds.flatMap((factionId) => getFactionNativeTroopUnlockIds(factionId));
    const latentTroopUnlockIds = state.unlockedTroopUnlockIds.filter((troopUnlockId) => {
        const [factionId] = troopUnlockId.split('/');
        return unlockedFactionIds.has(factionId);
    });
    return [...new Set([...nativeTroopUnlockIds, ...latentTroopUnlockIds])];
}
export function getOwnedTroopUnlockIds(state) {
    return state.troops.map((troop) => `${troop.factionId}/${troop.unitTypeId}`);
}
export function getAvailableTroopUnlockIds(state) {
    const ownedTroopUnlockIds = new Set(getOwnedTroopUnlockIds(state));
    return getClaimableTroopUnlockIds(state).filter((troopUnlockId) => !ownedTroopUnlockIds.has(troopUnlockId));
}
export function describeTroopUnlock(troopUnlockId) {
    const [factionId, unitTypeId] = troopUnlockId.split('/');
    return composeBaseTroopDefinition(factionId, unitTypeId).label;
}
function hasRangedOrCasterTag(troop) {
    const definition = composeBaseTroopDefinition(troop.factionId, troop.unitTypeId);
    return definition.attributes.includes('ranged') || definition.attributes.includes('caster');
}
function canAbilityAffectTroop(abilityId, troop) {
    const definition = composeBaseTroopDefinition(troop.factionId, troop.unitTypeId);
    if (abilityId === 'fade-into-shadow') {
        return definition.role === 'backline';
    }
    if (abilityId === 'long-shot-doctrine' || abilityId === 'silver-distance') {
        return hasRangedOrCasterTag(troop);
    }
    return true;
}
function factionUpgradeAffectsTroop(upgradeId, troop) {
    const upgrade = FACTION_UPGRADES[upgradeId];
    if (!upgrade || upgrade.factionId !== troop.factionId) {
        return false;
    }
    const definition = composeBaseTroopDefinition(troop.factionId, troop.unitTypeId);
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
function troopTypeUpgradeAffectsTroop(upgradeId, troop) {
    const upgrade = TROOP_TYPE_UPGRADES[upgradeId];
    if (!upgrade || upgrade.unitTypeId !== troop.unitTypeId) {
        return false;
    }
    const definition = composeBaseTroopDefinition(troop.factionId, troop.unitTypeId);
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
    if (upgradeId in FACTION_UPGRADES) {
        return factionUpgradeAffectsTroop(upgradeId, troop);
    }
    return troopTypeUpgradeAffectsTroop(upgradeId, troop);
}
//# sourceMappingURL=upgrades.js.map