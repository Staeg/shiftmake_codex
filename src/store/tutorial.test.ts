import { describe, expect, it } from 'vitest';
import {
  buildTutorialOpeningGame,
  buildTutorialReplayFixture,
  continueTutorial,
  makeTutorialProgress,
  recordTutorialAction,
  rewindTutorial,
  TUTORIAL_BATTLE_SEED,
  TUTORIAL_CAMPAIGN_SEED,
} from './tutorial';

describe('tutorial progress', () => {
  it('gates multi-action replay steps behind Continue', () => {
    let progress = recordTutorialAction(makeTutorialProgress(), 'watch-battle');
    expect(progress.step).toBe('unit-hover');

    progress = recordTutorialAction(progress, 'unit-hover');
    expect(progress.ready).toBe(false);

    progress = recordTutorialAction(progress, 'unit-unhover');
    expect(progress.ready).toBe(true);
    expect(continueTutorial(progress).step).toBe('unit-lock');
  });

  it('rewinds to the previous step with cleared signals', () => {
    const progressed = continueTutorial({
      step: 'stats',
      ready: true,
      signals: ['unit-hover'],
      completed: false,
    });

    expect(progressed.step).toBe('speed');
    expect(rewindTutorial(progressed)).toEqual({
      step: 'stats',
      ready: true,
      signals: [],
      completed: false,
    });
  });
});

describe('tutorial fixtures', () => {
  it('builds a fixed replay with the required battle categories', () => {
    const fixture = buildTutorialReplayFixture();
    const write = fixture.replayWrites[0];

    expect(fixture.game.campaignSeed).toBe(TUTORIAL_CAMPAIGN_SEED);
    expect(fixture.game.replayIndex.length).toBeGreaterThan(0);
    expect(write?.replay.input.seed).toBe(TUTORIAL_BATTLE_SEED);

    const profiles = fixture.game.replayIndex[0]!.playerTroopLabels;
    expect(profiles.length).toBeGreaterThan(0);
    expect(write?.replay.input.playerCombatants.some((combatant) => combatant.abilities.length > 0)).toBe(true);
    expect(new Set(write?.replay.input.enemyCombatants.map((combatant) => combatant.role))).toEqual(
      new Set(['chaff', 'backline']),
    );
  });

  it('starts the guided opening from the same fixed Contest seed', () => {
    const opening = buildTutorialOpeningGame();

    expect(opening.gameMode).toBe('contest');
    expect(opening.phase).toBe('opening_unlock');
    expect(opening.campaignSeed).toBe(TUTORIAL_CAMPAIGN_SEED);
  });
});
