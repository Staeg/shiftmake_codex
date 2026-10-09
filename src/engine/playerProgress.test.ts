import { describe, expect, it } from 'vitest';
import {
  applyContestPlayerProgress, applyScheduledUnlockToContestProgress, deserializeGameState,
  extractContestPlayerProgress, getContestPlayerProgress, getRootProgress,
  serializeGameState, startNewGame, withRootProgress,
} from './game';
import { projectContestStateForPlayer } from './multiplayerContest';
import { pickPlayerProgress } from './playerProgress';
import type { PlayerProgress } from './types';

function progress(): PlayerProgress {
  return {
    victoryPoints: 13,
    essence: 4,
    unlockedRaceIds: ['human'],
    unlockedTroopUnlockIds: ['human/soldier'],
    recentTroopUnlockIds: ['human/soldier'],
    troops: [{ id: 'reference-troop', raceId: 'human', unitClassId: 'soldier', recoveryCyclesRemaining: 1, assignmentRiftId: null }],
    raceUpgradeIds: ['human-combined-arms'],
    troopClassUpgradeIds: ['soldier-shield-drill'],
    activeTroopOffer: { kind: 'troop', optionTroopUnlockIds: ['human/archer'] },
    activeUpgradeOffer: { kind: 'upgrade', optionUpgradeIds: ['human-tubthumping'] },
    activeRaceUnlockOffer: {
      kind: 'race_unlock', cycleNumber: 3, optionRaceIds: ['elf'],
      upgradeIdsByRaceId: { elf: [] }, troopUnlockChoiceCount: 2,
      troopUnlockIdsByRaceId: { elf: ['elf/archer'] },
    },
    activeTroopClassUnlockOffer: {
      kind: 'troop_class_unlock', cycleNumber: 3, raceId: 'elf',
      remainingChoices: 1, optionTroopUnlockIds: ['elf/archer'],
    },
    troopOfferRolls: 8,
    upgradeOfferRolls: 9,
    essenceDraftRerollUsed: 'upgrade',
    seenTroopOfferOptionIds: ['human/archer'],
    seenUpgradeOfferOptionIds: ['human-tubthumping'],
  };
}

describe('player progress boundaries', () => {
  it('round trips every field through root progress without cloning nested values', () => {
    const input = progress();
    const original = startNewGame(5, 'campaign');
    const state = withRootProgress(original, { ...input, campaignSeed: 999, phase: 'game_over' } as PlayerProgress);
    expect(getRootProgress(state)).toEqual(input);
    expect(extractContestPlayerProgress(state)).toEqual(input);
    expect(state.campaignSeed).toBe(original.campaignSeed);
    expect(state.phase).toBe(original.phase);
    expect(state.openRifts).toBe(original.openRifts);
    expect(state.replayIndex).toBe(original.replayIndex);
    for (const key of Object.keys(input) as (keyof PlayerProgress)[]) {
      expect(pickPlayerProgress(state)[key]).toBe(input[key]);
    }
    expect(pickPlayerProgress(state)).not.toHaveProperty('contest');
    expect(getRootProgress(original)).not.toEqual(input);
  });

  it('preserves complete progress through both player seats and perspective swapping', () => {
    const playerOne = progress();
    const playerTwo = { ...progress(), victoryPoints: 21, essence: 7, troops: [] };
    const original = startNewGame(6, 'contest');
    const state = applyContestPlayerProgress(applyContestPlayerProgress(original, 'playerOne', playerOne), 'playerTwo', playerTwo);
    expect(getContestPlayerProgress(state, 'playerOne')).toEqual(playerOne);
    expect(getContestPlayerProgress(state, 'playerTwo')).toBe(playerTwo);
    const projected = projectContestStateForPlayer(state, 'playerTwo');
    expect(extractContestPlayerProgress(projected)).toEqual(playerTwo);
    expect(getContestPlayerProgress(projected, 'playerTwo')).toEqual(playerOne);
    expect(original.contest?.players.playerTwo.troops).toHaveLength(0);
  });

  it('preserves all fields through the AI pseudo-state path', () => {
    const input = progress();
    const state = { ...startNewGame(7, 'contest'), cycleNumber: 2, phase: 'planning' as const };
    expect(applyScheduledUnlockToContestProgress(state, input)).toEqual(input);
    expect(applyScheduledUnlockToContestProgress(state, input).troops).toBe(input.troops);
  });

  it('keeps independent constructor arrays and a flat version-3 save shape', () => {
    const original = startNewGame(8, 'contest');
    expect(original.troops).not.toBe(original.contest?.players.playerOne.troops);
    expect(original.contest?.players.playerOne.troops).not.toBe(original.contest?.players.playerTwo.troops);
    const input = progress();
    const state = applyContestPlayerProgress(original, 'playerOne', input);
    const serialized = serializeGameState(state);
    const json = JSON.parse(serialized);
    expect(json.version).toBe(3);
    expect(json).not.toHaveProperty('progress');
    expect(pickPlayerProgress(json)).toEqual(input);
    const loaded = deserializeGameState(serialized);
    expect(loaded.ok).toBe(true);
    expect(pickPlayerProgress(loaded.state!)).toEqual(input);
    expect(loaded.state!.contest?.players.playerOne).toEqual(input);
  });
});
