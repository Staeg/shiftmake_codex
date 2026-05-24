import { describe, expect, it } from 'vitest';
import {
  buildTutorialOpeningGame,
  buildTutorialReplayFixture,
  continueTutorial,
  getTutorialStepCenterMode,
  getPreviousTutorialStep,
  getTutorialStepSurface,
  makeTutorialProgress,
  recordTutorialAction,
  rewindTutorial,
  TUTORIAL_BATTLE_SEED,
  TUTORIAL_CAMPAIGN_SEED,
} from './tutorial';

describe('tutorial progress', () => {
  it('auto-advances multi-action replay steps when all signals are received', () => {
    let progress = recordTutorialAction(makeTutorialProgress(), 'watch-battle');
    expect(progress.step).toBe('battle-layout');
    progress = continueTutorial(progress);
    expect(progress.step).toBe('unit-hover');

    progress = recordTutorialAction(progress, 'unit-hover');
    expect(progress.step).toBe('unit-hover');

    progress = recordTutorialAction(progress, 'unit-unhover');
    expect(progress.step).toBe('unit-lock');
  });

  it('rewinds to the previous step with cleared signals', () => {
    const progressed = continueTutorial({
      step: 'initiative',
      ready: false,
      signals: [],
      completed: false,
    });

    expect(progressed.step).toBe('initiative');
    const advanced = recordTutorialAction(progressed, 'initiative-hover');
    expect(advanced.step).toBe('play');
    expect(rewindTutorial(advanced)).toEqual({
      step: 'initiative',
      ready: false,
      signals: [],
      completed: false,
    });
  });

  it('maps tutorial steps to the view they need', () => {
    expect(getPreviousTutorialStep('game-start')).toBe('finish-replay');
    expect(getTutorialStepSurface('watch-battle')).toBe('archive');
    expect(getTutorialStepSurface('unit-actions')).toBe('replay');
    expect(getTutorialStepSurface('game-start')).toBe('main-menu');
    expect(getTutorialStepSurface('start-contest')).toBe('singleplayer');
    expect(getTutorialStepSurface('opening')).toBe('opening');
    expect(getTutorialStepSurface('choose-draft')).toBe('overworld');
    expect(getTutorialStepCenterMode('choose-draft')).toBe('troops');
    expect(getTutorialStepCenterMode('rift-enemies')).toBe('rifts');
    expect(getTutorialStepCenterMode('rival-info')).toBe('contest');
  });

  it('gates overworld tutorial steps behind their requested actions', () => {
    let progress = {
      step: 'essence' as const,
      ready: false,
      signals: [],
      completed: false,
    };

    progress = recordTutorialAction(progress, 'essence-view');
    expect(progress.step).toBe('reveal-draft');

    progress = recordTutorialAction(progress, 'reveal-draft');
    expect(progress.step).toBe('choose-draft');
    expect(progress.ready).toBe(false);

    progress = recordTutorialAction(progress, 'draft-troop');
    expect(progress.step).toBe('choose-draft');

    progress = recordTutorialAction(progress, 'draft-upgrade');
    expect(progress.step).toBe('return-rifts');
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
