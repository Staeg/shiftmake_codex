import { claimOpeningTroop, getOpeningRaceOptionIds, getOpeningRaceStarterTroopUnlockIds,
  revealEssenceDraft, startNewGame, startOpeningCampaign } from '../../engine/game';

export function draftFixture() {
  let game = startNewGame(49);
  const starters = getOpeningRaceStarterTroopUnlockIds(game);
  const firstRace = getOpeningRaceOptionIds(game)[0]!;
  const first = starters[firstRace]!;
  const secondRace = getOpeningRaceOptionIds(game).find(race => race !== firstRace && starters[race]?.split('/')[1] !== first.split('/')[1])!;
  for (const id of [first, starters[secondRace]!]) game = claimOpeningTroop(game, id);
  return revealEssenceDraft(startOpeningCampaign(game));
}
