import type { PlayerProgress } from './types';

// Explicit projection prevents game-only or unvalidated extra fields leaking into progress.
export function pickPlayerProgress(state: PlayerProgress): PlayerProgress {
  return {
    victoryPoints: state.victoryPoints,
    essence: state.essence,
    unlockedRaceIds: state.unlockedRaceIds,
    unlockedTroopUnlockIds: state.unlockedTroopUnlockIds,
    recentTroopUnlockIds: state.recentTroopUnlockIds,
    troops: state.troops,
    raceUpgradeIds: state.raceUpgradeIds,
    troopClassUpgradeIds: state.troopClassUpgradeIds,
    activeTroopOffer: state.activeTroopOffer,
    activeUpgradeOffer: state.activeUpgradeOffer,
    activeRaceUnlockOffer: state.activeRaceUnlockOffer,
    activeTroopClassUnlockOffer: state.activeTroopClassUnlockOffer,
    troopOfferRolls: state.troopOfferRolls,
    upgradeOfferRolls: state.upgradeOfferRolls,
    essenceDraftRerollUsed: state.essenceDraftRerollUsed,
    seenTroopOfferOptionIds: state.seenTroopOfferOptionIds,
    seenUpgradeOfferOptionIds: state.seenUpgradeOfferOptionIds,
  };
}
