import { createTroopInstance } from '../../engine/army';
import { startNewGame } from '../../engine/game';
import { pickPlayerProgress } from '../../engine/playerProgress';
import { RACE_UPGRADES, TROOP_CLASS_UPGRADES } from '../../engine/unitCatalog';
import type { GameState, ContestPlayerState } from '../../engine/types';
import { draftFixture } from './essenceDraft';

export function rivalInfoFixture(): GameState {
  const campaign = draftFixture();
  const contest = startNewGame(49, 'contest').contest!;
  const troops = [createTroopInstance('human', 'wizard'), createTroopInstance('goblin', 'militia')];
  const opponent: ContestPlayerState = { ...contest.players.playerTwo,
    unlockedRaceIds: ['human', 'goblin'], unlockedTroopUnlockIds: troops.map(troop => troop.id), troops,
    raceUpgradeIds: [Object.values(RACE_UPGRADES).find(upgrade => upgrade.raceId === 'human')!.id],
    troopClassUpgradeIds: [Object.values(TROOP_CLASS_UPGRADES).find(upgrade => upgrade.unitClassId === 'wizard')!.id] };
  return { ...campaign, gameMode: 'contest', cycleNumber: 2, activeTroopOffer: null, activeUpgradeOffer: null,
    essence: 0, contest: { ...contest, players: { playerOne: pickPlayerProgress(campaign), playerTwo: opponent },
      opponentInfo: { cycleNumber: 1, playerTwo: opponent } },
    openRifts: campaign.openRifts.map((rift, index) => index === 0 ? { ...rift,
      controller: 'playerTwo', occupyingPlayerId: 'playerTwo', occupyingTroopIds: [troops[0]!.id] } : rift) };
}
