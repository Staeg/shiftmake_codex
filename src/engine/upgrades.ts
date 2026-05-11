import { composeBaseTroopDefinition, FACTION_UPGRADES, getFactionNativeTroopUnlockIds, TROOP_TYPE_UPGRADES } from './unitCatalog';
import type { FactionId, GameState, TroopUnlockId, UpgradeId } from './types';

export function getAllUpgradeIds(): UpgradeId[] {
  return [...Object.keys(FACTION_UPGRADES), ...Object.keys(TROOP_TYPE_UPGRADES)];
}

export function getUnownedUpgradeIds(state: Pick<GameState, 'factionUpgradeIds' | 'troopTypeUpgradeIds'>): UpgradeId[] {
  return getAllUpgradeIds().filter(
    (upgradeId) => !state.factionUpgradeIds.includes(upgradeId) && !state.troopTypeUpgradeIds.includes(upgradeId),
  );
}

export function getClaimableTroopUnlockIds(state: Pick<GameState, 'unlockedFactionIds' | 'unlockedTroopUnlockIds'>): TroopUnlockId[] {
  const unlockedFactionIds = new Set(state.unlockedFactionIds);
  const nativeTroopUnlockIds = state.unlockedFactionIds.flatMap((factionId) => getFactionNativeTroopUnlockIds(factionId));
  const latentTroopUnlockIds = state.unlockedTroopUnlockIds.filter((troopUnlockId) => {
    const [factionId] = troopUnlockId.split('/') as [FactionId, string];
    return unlockedFactionIds.has(factionId);
  });

  return [...new Set([...nativeTroopUnlockIds, ...latentTroopUnlockIds])];
}

export function getOwnedTroopUnlockIds(state: Pick<GameState, 'troops'>): TroopUnlockId[] {
  return state.troops.map((troop) => `${troop.factionId}/${troop.unitTypeId}`);
}

export function getAvailableTroopUnlockIds(
  state: Pick<GameState, 'troops' | 'unlockedFactionIds' | 'unlockedTroopUnlockIds'>,
): TroopUnlockId[] {
  const ownedTroopUnlockIds = new Set(getOwnedTroopUnlockIds(state));
  return getClaimableTroopUnlockIds(state).filter((troopUnlockId) => !ownedTroopUnlockIds.has(troopUnlockId));
}

export function describeTroopUnlock(troopUnlockId: TroopUnlockId): string {
  const [factionId, unitTypeId] = troopUnlockId.split('/') as [FactionId, string];
  return composeBaseTroopDefinition(factionId, unitTypeId).label;
}
