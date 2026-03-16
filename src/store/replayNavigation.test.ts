import { describe, expect, it } from 'vitest';
import type { BattleReplay, BattleStep } from '../engine/types';
import { nextPlayableStep, previousPlayableStep } from './replayNavigation';

function makeStep(index: number, kind: BattleStep['kind']): BattleStep {
  return {
    index,
    kind,
    actorIds: [],
    targetIds: [],
    message: `${kind} ${index}`,
    snapshot: { units: [] },
  };
}

function makeReplay(steps: BattleStep[]): BattleReplay {
  return {
    id: 'test-replay',
    seed: 1,
    riftId: null,
    tier: null,
    mutatorIds: [],
    mapRadius: 3,
    saturation: 1,
    initial: { units: [] },
    steps,
    outcome: 'draw',
    troopLabels: {},
    troopProfiles: [],
    aliveCounts: [{ player: 0, enemy: 0, byTroopLabel: {} }],
    summary: {
      playerTroops: [],
      enemyTroops: [],
      finalPlayerAlive: 0,
      finalEnemyAlive: 0,
    },
  };
}

describe('replayNavigation', () => {
  it('skips beat steps while moving forward and backward', () => {
    const replay = makeReplay([makeStep(0, 'beat'), makeStep(1, 'attack'), makeStep(2, 'beat'), makeStep(3, 'move')]);

    expect(nextPlayableStep(-1, replay)).toBe(1);
    expect(nextPlayableStep(1, replay)).toBe(3);
    expect(previousPlayableStep(3, replay)).toBe(1);
  });

  it('stops at the current step when only beats remain ahead', () => {
    const replay = makeReplay([makeStep(0, 'attack'), makeStep(1, 'beat'), makeStep(2, 'beat')]);

    expect(nextPlayableStep(0, replay)).toBe(0);
  });
});
