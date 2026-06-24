import { describe, expect, it } from 'vitest';
import type { BattleReplay, BattleUnit, RoleId } from '../engine/types';
import { buildBattleRecap, findLastAliveStep, isUnitAliveAtStep } from './battleRecap';

function makeUnit(id: string, side: 'player' | 'enemy', troopLabel: string, alive = true, role: RoleId = 'frontline'): BattleUnit {
  return {
    id,
    troopInstanceId: null,
    troopId: troopLabel,
    troopLabel,
    unitClassId: 'soldier',
    raceId: 'human',
    side,
    role,
    unitClassTag: 'soldier',
    attributes: [],
    position: { q: 0, r: 0 },
    stats: { health: 10, damage: 3, speed: 1, range: 0, armor: 0, size: 1, capacity: 1 },
    hp: alive ? 10 : 0,
    maxHp: 10,
    initiative: 0,
    alive,
    engagedWithIds: [],
  };
}

function makeReplay(): BattleReplay {
  const playerA = makeUnit('p-1', 'player', 'Elven Archers', true, 'backline');
  const playerB = makeUnit('p-2', 'player', 'Elven Archers', true, 'backline');
  const enemy = makeUnit('e-1', 'enemy', 'Troll Berserkers');

  return {
    id: 'test',
    seed: 1,
    riftId: 'rift',
    tier: 1,
    mutatorIds: [],
    mapRadius: 2,
    saturation: 2,
    initial: { units: [playerA, playerB, enemy] },
    steps: [
      {
        index: 0,
        kind: 'attack',
        actorIds: ['p-1'],
        targetIds: ['e-1'],
        message: 'attack',
        metadata: { damage: 4 },
        snapshot: { units: [playerA, playerB, enemy] },
      },
      {
        index: 1,
        kind: 'heal',
        actorIds: ['p-2'],
        targetIds: ['p-1'],
        message: 'heal',
        metadata: { amount: 3 },
        snapshot: { units: [playerA, playerB, enemy] },
      },
      {
        index: 2,
        kind: 'death',
        actorIds: ['e-1'],
        targetIds: ['p-1'],
        message: 'dead',
        snapshot: { units: [makeUnit('p-1', 'player', 'Elven Archers', false), playerB, enemy] },
      },
    ],
    outcome: 'victory',
    troopLabels: {},
    troopProfiles: [],
    aliveCounts: [],
    summary: {
      playerTroops: ['Elven Archers'],
      enemyTroops: ['Troll Berserkers'],
      finalPlayerAlive: 1,
      finalEnemyAlive: 1,
    },
  };
}

describe('battleRecap', () => {
  it('aggregates troop and unit damage and healing totals', () => {
    const recap = buildBattleRecap(makeReplay());
    const playerTroop = recap.find((entry) => entry.side === 'player' && entry.troopLabel === 'Elven Archers');

    expect(playerTroop).toMatchObject({
      damageDone: 4,
      healingDone: 3,
      kills: 0,
    });
    expect(playerTroop?.units).toEqual([
      expect.objectContaining({ unitId: 'p-1', unitLabel: 'Unit 1', damageDone: 4, healingDone: 0, kills: 0 }),
      expect.objectContaining({ unitId: 'p-2', unitLabel: 'Unit 2', damageDone: 0, healingDone: 3, kills: 0 }),
    ]);

    const enemyTroop = recap.find((entry) => entry.side === 'enemy' && entry.troopLabel === 'Troll Berserkers');
    expect(enemyTroop).toMatchObject({
      kills: 1,
    });
  });

  it('maps replay role intent metadata into troop roleSummary labels', () => {
    const playerFrontline = makeUnit('p-frontline', 'player', 'Shield Wall');
    const playerPusher = makeUnit('p-pusher', 'player', 'Militia Swarm', true, 'pusher');
    const playerBackline = makeUnit('p-backline', 'player', 'Rangers', true, 'backline');
    const enemy = makeUnit('e-1', 'enemy', 'Raiders');
    const replay: BattleReplay = {
      id: 'role-summary',
      seed: 2,
      riftId: 'rift',
      tier: 1,
      mutatorIds: [],
      mapRadius: 2,
      saturation: 2,
      initial: { units: [playerFrontline, playerPusher, playerBackline, enemy] },
      steps: [
        {
          index: 0,
          kind: 'move',
          actorIds: ['p-frontline'],
          targetIds: ['e-1'],
          message: 'frontline screens',
          metadata: { roleIntent: 'screen-frontline' },
          snapshot: { units: [playerFrontline, playerPusher, playerBackline, enemy] },
        },
        {
          index: 1,
          kind: 'engage',
          actorIds: ['p-pusher'],
          targetIds: ['e-1'],
          message: 'Pusher breaches',
          metadata: { roleIntent: 'breach-backline' },
          snapshot: { units: [playerFrontline, playerPusher, playerBackline, enemy] },
        },
        {
          index: 2,
          kind: 'move',
          actorIds: ['p-backline'],
          targetIds: [],
          message: 'backline retreats',
          metadata: { roleIntent: 'retreat-range' },
          snapshot: { units: [playerFrontline, playerPusher, playerBackline, enemy] },
        },
        {
          index: 3,
          kind: 'move',
          actorIds: ['p-pusher'],
          targetIds: ['e-1'],
          message: 'Pusher holds',
          metadata: { roleIntent: 'hold-backline' },
          snapshot: { units: [playerFrontline, playerPusher, playerBackline, enemy] },
        },
      ],
      outcome: 'victory',
      troopLabels: {},
      troopProfiles: [],
      aliveCounts: [],
      summary: {
        playerTroops: ['Shield Wall', 'Militia Swarm', 'Rangers'],
        enemyTroops: ['Raiders'],
        finalPlayerAlive: 3,
        finalEnemyAlive: 1,
      },
    };

    const recap = buildBattleRecap(replay);

    expect(recap.find((entry) => entry.troopLabel === 'Shield Wall')?.roleSummary).toEqual(['Held line']);
    expect(recap.find((entry) => entry.troopLabel === 'Militia Swarm')?.roleSummary).toEqual(['Broke through']);
    expect(recap.find((entry) => entry.troopLabel === 'Rangers')?.roleSummary).toEqual(['Kept range']);
  });

  it('finds the last replay step where a unit was alive', () => {
    const replay = makeReplay();

    expect(isUnitAliveAtStep(replay, 'p-1', 2)).toBe(false);
    expect(findLastAliveStep(replay, 'p-1', 2)).toBe(1);
    expect(findLastAliveStep(replay, 'p-2', 2)).toBe(2);
  });
});
