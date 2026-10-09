import { describe, expect, it } from 'vitest';
import type { ComponentProps } from 'svelte';
import type { BattleReplay, BattleUnit } from '../engine/types';
import ReplayRecap from './ReplayRecap.svelte';

const ServerRecap = ReplayRecap as unknown as {
  render(props: ComponentProps<ReplayRecap>): { html: string };
};

function makeReplay(): BattleReplay {
  const unit: BattleUnit = {
    id: 'one', troopInstanceId: null, troopId: 'human/soldier', troopLabel: 'Human Soldiers',
    unitClassId: 'soldier', raceId: 'human', side: 'player', role: 'frontline',
    unitClassTag: 'soldier', attributes: [], position: { q: 0, r: 0 },
    occupiedHexes: [{ q: 0, r: 0 }], footprintOrientation: 'north',
    stats: { health: 10, damage: 2, rate: 1, move: 1, range: 0, armor: 0, size: 1, capacity: 1 },
    hp: 10, maxHp: 10, readiness: 0, alive: true, engagedWithIds: [],
  };
  return {
    id: 'recap', seed: 1, riftId: null, tier: null, mutatorIds: [], mapRadius: 1,
    mapHexes: [{ q: 0, r: 0 }], initial: { units: [unit] },
    steps: [
      { index: 0, kind: 'attack', actorIds: ['one'], targetIds: [], message: 'attack',
        metadata: { damage: 4 }, snapshot: { units: [unit] } },
      { index: 1, kind: 'heal', actorIds: ['one'], targetIds: ['one'], message: 'heal',
        metadata: { amount: 2 }, snapshot: { units: [unit] } },
    ],
    outcome: 'victory', troopLabels: {}, troopProfiles: [], aliveCounts: [],
    summary: { playerTroops: ['Human Soldiers'], enemyTroops: [], finalPlayerAlive: 1, finalEnemyAlive: 0 },
  };
}

function render(replay: BattleReplay): string {
  return ServerRecap.render({ replay, snapshot: replay.initial.units,
    getRaceUnitPortrait: () => '', onClose: () => {}, onInspect: () => {}, }).html;
}

describe('replay recap presentation', () => {
  it('renders replay-derived totals with the shared side scale and collapsed units', () => {
    const html = render(makeReplay());
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-labelledby="battle-recap-title"');
    expect(html).toContain('Human Soldiers');
    expect(html).toContain('Dmg 4');
    expect(html).toContain('Heal 2');
    expect(html).toContain('width: 100%');
    expect(html).toContain('width: 50%');
    expect(html).toContain('Show units');
    expect(html).not.toContain('aria-label="Inspect Unit 1"');
    expect(html).toContain('No troops recorded.');
  });

  it('renders empty sides without invalid numeric bar widths', () => {
    const replay = makeReplay();
    replay.initial.units = [];
    replay.steps = [];
    const html = render(replay);
    expect(html.match(/No troops recorded\./g)).toHaveLength(2);
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });
});
