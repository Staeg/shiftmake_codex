import { fixed } from './fixed';
import { getFactionUpgrade, getFaction, FACTION_UPGRADES, composeBaseTroopDefinition } from './unitCatalog';
export function getPurchasableFactionUpgrades(state, factionId) {
    return Object.values(FACTION_UPGRADES)
        .filter((upgrade) => upgrade.factionId === factionId && !state.factionUpgradeIds.includes(upgrade.id))
        .map((upgrade) => upgrade.id);
}
export function getFactionUpgradeCost(upgradeId) {
    return getFactionUpgrade(upgradeId).cost;
}
export function buildRewardChoice(id, riftId, optionUpgradeIds) {
    return {
        id,
        riftId,
        kind: 'upgrade',
        title: optionUpgradeIds.length > 0 ? `Choose an upgrade for ${getFaction(getFactionUpgrade(optionUpgradeIds[0]).factionId).label}` : 'No upgrade choices',
        optionUpgradeIds,
    };
}
export function buildBlueprintRewardChoice(id, riftId, optionTroopUnlockIds) {
    return {
        id,
        riftId,
        kind: 'blueprint',
        title: 'Choose a blueprint',
        optionTroopUnlockIds,
    };
}
export function describeTroopUnlock(troopUnlockId) {
    const [factionId, unitTypeId] = troopUnlockId.split('/');
    return composeBaseTroopDefinition(factionId, unitTypeId).label;
}
export function getFallbackRewardForExhaustedUpgradeSlots(tierValue) {
    return {
        gold: fixed(29 * tierValue),
        essence: fixed(20 * tierValue),
    };
}
