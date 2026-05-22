import { describe, expect, it } from 'vitest';
import { buildReplayStepExplanationView } from './replayStepExplanation';
import type { BattleStep } from '../engine/types';

describe('replay step explanations', () => {
  it('exposes active and secondary affected units for multi-unit steps', () => {
    const step: BattleStep = {
      index: 0,
      kind: 'attack',
      actorIds: ['actor'],
      targetIds: ['target-a', 'target-b'],
      message: 'Actor hits two targets.',
      snapshot: { units: [] },
      metadata: {
        activeUnitId: 'actor',
        secondaryUnitIds: ['target-a', 'target-b'],
        damage: 4,
        mode: 'melee',
        category: 'normal',
      },
    };

    const view = buildReplayStepExplanationView(step);

    expect(view.activeUnitId).toBe('actor');
    expect(view.secondaryUnitIds).toEqual(['target-a', 'target-b']);
  });
});
