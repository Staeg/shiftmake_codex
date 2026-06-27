import { describe, expect, it } from 'vitest';
import type { BattleReplay, BattleStep } from '../engine/types';
import { buildBattlePresentationTimeline } from './battlePresentationTimeline';

function makeStep(index: number, kind: BattleStep['kind'], metadata: BattleStep['metadata'] = {}): BattleStep {
  return {
    index,
    kind,
    actorIds: [],
    targetIds: [],
    message: `${kind} ${index}`,
    snapshot: { units: [] },
    metadata,
  };
}

function makeReplay(steps: BattleStep[]): BattleReplay {
  return {
    id: 'timeline-test',
    seed: 1,
    riftId: null,
    tier: null,
    mutatorIds: [],
    mapRadius: 3,
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

describe('battlePresentationTimeline', () => {
  it('creates monotonic visual cues for playable steps and skips beats', () => {
    const replay = makeReplay([
      makeStep(0, 'beat'),
      makeStep(1, 'attack', { mode: 'ranged' }),
      makeStep(2, 'buff', { effect: 'summon' }),
      makeStep(3, 'move'),
    ]);

    const timeline = buildBattlePresentationTimeline(replay, 500);

    expect(timeline.cues.map((cue) => cue.stepIndex)).toEqual([1, 2, 3]);
    expect(timeline.cues.map((cue) => cue.kind)).toEqual(['attack', 'buff', 'move']);
    expect(timeline.cues[0]?.startMs).toBe(0);
    expect(timeline.cues[1]?.startMs).toBeGreaterThan(timeline.cues[0]!.startMs);
    expect(timeline.cues[2]?.startMs).toBeGreaterThan(timeline.cues[1]!.startMs);
    expect(timeline.durationMs).toBeGreaterThan(timeline.cues[timeline.cues.length - 1]!.startMs);
  });

  it('scales timing from the replay speed control', () => {
    const replay = makeReplay([makeStep(0, 'attack', { mode: 'ranged' }), makeStep(1, 'heal')]);

    const normal = buildBattlePresentationTimeline(replay, 500);
    const slow = buildBattlePresentationTimeline(replay, 1000);

    expect(slow.cues[0]?.durationMs).toBe((normal.cues[0]?.durationMs ?? 0) * 2);
    expect(slow.cues[1]?.startMs).toBe((normal.cues[1]?.startMs ?? 0) * 2);
  });
});
