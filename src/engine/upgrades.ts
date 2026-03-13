import { fixed } from './fixed';
import { getFactionUpgrade, getFaction, FACTION_UPGRADES } from './unitCatalog';
import type { FactionId, GameState, RewardChoice, UpgradeId } from './types';

export function getPurchasableFactionUpgrades(state: GameState, factionId: FactionId): UpgradeId[] {
  return Object.values(FACTION_UPGRADES)
    .filter((upgrade) => upgrade.factionId === factionId && !state.factionUpgradeIds.includes(upgrade.id))
    .map((upgrade) => upgrade.id);
}

export function getFactionUpgradeCost(upgradeId: UpgradeId): number {
  return getFactionUpgrade(upgradeId).cost;
}

export function buildRewardChoice(id: string, riftId: string, optionUpgradeIds: UpgradeId[]): RewardChoice {
  return {
    id,
    riftId,
    title: optionUpgradeIds.length > 0 ? `Choose an upgrade for ${getFaction(getFactionUpgrade(optionUpgradeIds[0]).factionId).label}` : 'No upgrade choices',
    optionUpgradeIds,
  };
}

export function getFallbackRewardForExhaustedUpgradeSlots(tierValue: number): { gold: number; essence: number } {
  return {
    gold: fixed(29 * tierValue),
    essence: fixed(20 * tierValue),
  };
}
