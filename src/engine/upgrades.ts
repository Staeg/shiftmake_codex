import { composeBaseTroopDefinition, FACTION_UPGRADES, NATIVE_TROOP_UNLOCK_IDS, TROOP_TYPE_UPGRADES } from './unitCatalog';
import type { FactionId, GameState, TroopUnlockId, UpgradeId } from './types';

export function getAllUpgradeIds(): UpgradeId[] {
  return [...Object.keys(FACTION_UPGRADES), ...Object.keys(TROOP_TYPE_UPGRADES)];
}

export function getUnownedUpgradeIds(state: Pick<GameState, 'factionUpgradeIds' | 'troopTypeUpgradeIds'>): UpgradeId[] {
  return getAllUpgradeIds().filter(
    (upgradeId) => !state.factionUpgradeIds.includes(upgradeId) && !state.troopTypeUpgradeIds.includes(upgradeId),
  );
}

export function getClaimableTroopUnlockIds(state: Pick<GameState, 'unlockedTroopUnlockIds'>): TroopUnlockId[] {
  return [...new Set([...NATIVE_TROOP_UNLOCK_IDS, ...state.unlockedTroopUnlockIds])];
}

export function describeTroopUnlock(troopUnlockId: TroopUnlockId): string {
  const [factionId, unitTypeId] = troopUnlockId.split('/') as [FactionId, string];
  return composeBaseTroopDefinition(factionId, unitTypeId).label;
}
