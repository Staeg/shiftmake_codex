import { fixed } from './fixed';
import { getFactionUpgrade, getFaction, getTroopTypeUpgrade, FACTION_UPGRADES, TROOP_TYPE_UPGRADES, composeBaseTroopDefinition } from './unitCatalog';
import type { FactionId, GameState, RewardChoice, TroopUnlockId, UnitTypeId, UpgradeId } from './types';

export function getPurchasableFactionUpgrades(state: GameState, factionId: FactionId): UpgradeId[] {
  return Object.values(FACTION_UPGRADES)
    .filter((upgrade) => upgrade.factionId === factionId && !state.factionUpgradeIds.includes(upgrade.id))
    .filter((upgrade) => upgrade.source === 'default' || state.cheatUpgrades)
    .map((upgrade) => upgrade.id);
}

export function getFactionUpgradeCost(upgradeId: UpgradeId): number {
  return getFactionUpgrade(upgradeId).cost;
}

export function getPurchasableTroopTypeUpgrades(state: GameState, unitTypeId: UnitTypeId): UpgradeId[] {
  return Object.values(TROOP_TYPE_UPGRADES)
    .filter((upgrade) => upgrade.unitTypeId === unitTypeId && !state.troopTypeUpgradeIds.includes(upgrade.id))
    .map((upgrade) => upgrade.id);
}

export function getTroopTypeUpgradeCost(upgradeId: UpgradeId): number {
  return getTroopTypeUpgrade(upgradeId).cost;
}

export function buildRewardChoice(id: string, riftId: string, optionUpgradeIds: UpgradeId[]): RewardChoice {
  return {
    id,
    riftId,
    kind: 'upgrade',
    title: optionUpgradeIds.length > 0 ? `Choose an upgrade for ${getFaction(getFactionUpgrade(optionUpgradeIds[0]).factionId).label}` : 'No upgrade choices',
    optionUpgradeIds,
  };
}

export function buildBlueprintRewardChoice(id: string, riftId: string, optionTroopUnlockIds: TroopUnlockId[]): RewardChoice {
  return {
    id,
    riftId,
    kind: 'blueprint',
    title: 'Choose a blueprint',
    optionTroopUnlockIds,
  };
}

export function describeTroopUnlock(troopUnlockId: TroopUnlockId): string {
  const [factionId, unitTypeId] = troopUnlockId.split('/') as [FactionId, string];
  return composeBaseTroopDefinition(factionId, unitTypeId).label;
}

export function getFallbackRewardForExhaustedUpgradeSlots(tierValue: number): { gold: number; essence: number } {
  return {
    gold: fixed(29 * tierValue),
    essence: fixed(20 * tierValue),
  };
}
