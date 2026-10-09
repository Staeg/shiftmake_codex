import { describe, expect, it } from 'vitest';
import { canClaimOpeningTroop, claimOpeningTroop, getOpeningRaceOptionIds,
  getOpeningRaceStarterTroopUnlockIds, startNewGame, startOpeningCampaign, unclaimOpeningTroop } from './game';
import { getRaceNativeTroopUnlockIds, RACES } from './unitCatalog';
import type { RaceId, TroopUnlockId } from './types';

describe('opening troop eligibility query', () => {
  it.each([49, 112, 2026])('matches claim behavior for seed %i without mutating the source', (seed) => {
    let state = startNewGame(seed);
    const options = getOpeningRaceOptionIds(state);
    const starters = getOpeningRaceStarterTroopUnlockIds(state);
    const first = starters[options[0]!]!;
    const second = starters[options[1]!]!;
    for (const picked of [null, first, second] as const) {
      if (picked) state = claimOpeningTroop(state, picked);
      const before = JSON.stringify(state);
      for (const raceId of Object.keys(RACES) as RaceId[]) {
        for (const candidate of getRaceNativeTroopUnlockIds(raceId)) {
          const expected = state.troops.length < 2 && options.includes(raceId) && starters[raceId] === candidate
            && !state.troops.some(troop=>troop.raceId===raceId||troop.unitClassId===candidate.split('/')[1]);
          expect(canClaimOpeningTroop(state, candidate)).toBe(expected);
          expect(claimOpeningTroop(state, candidate) !== state).toBe(expected);
        }
      }
      expect(JSON.stringify(state)).toBe(before);
    }
    expect(canClaimOpeningTroop(startOpeningCampaign(state), first)).toBe(false);
    expect(canClaimOpeningTroop(unclaimOpeningTroop(state, first), first)).toBe(true);
    expect(canClaimOpeningTroop(state, 'not/a-troop' as TroopUnlockId)).toBe(false);
  });
});
