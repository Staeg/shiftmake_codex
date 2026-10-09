import { describe, expect, it } from 'vitest';
import { battleUnitChanged } from './battleUnitComparison';
import type { BattleUnit, UnitStats } from './types';

function unit(): BattleUnit {
  return {
    id: 'unit-1', troopInstanceId: 'troop-1', troopId: 'human/soldier', troopLabel: 'Human Soldiers',
    unitClassId: 'soldier', raceId: 'human', side: 'player', role: 'frontline', unitClassTag: 'soldier',
    attributes: ['human', 'melee'], position: {q: 1, r: 2}, occupiedHexes: [{q: 1, r: 2}, {q: 1, r: 3}],
    footprintOrientation: 'north', stats: {health: 100, damage: 10, rate: 20, move: 1, range: 1, armor: 2, size: 2, capacity: 3},
    hp: 80, maxHp: 100, readiness: 50, alive: true, engagedWithIds: ['enemy-1', 'enemy-2'],
  };
}

const changes: { [K in keyof BattleUnit]-?: (value: BattleUnit) => void } = {
  id: (value) => { value.id = 'unit-2'; },
  troopInstanceId: (value) => { value.troopInstanceId = null; },
  troopId: (value) => { value.troopId = 'human/archer'; },
  troopLabel: (value) => { value.troopLabel = 'Other Soldiers'; },
  unitClassId: (value) => { value.unitClassId = 'archer'; },
  raceId: (value) => { value.raceId = 'elf'; },
  side: (value) => { value.side = 'enemy'; },
  role: (value) => { value.role = 'backline'; },
  unitClassTag: (value) => { value.unitClassTag = 'archer'; },
  attributes: (value) => { value.attributes[0] = 'elf'; },
  position: (value) => { value.position.q += 1; },
  occupiedHexes: (value) => { value.occupiedHexes[1]!.r += 1; },
  footprintOrientation: (value) => { value.footprintOrientation = 'south'; },
  stats: (value) => { value.stats.health += 1; },
  hp: (value) => { value.hp += 1; },
  maxHp: (value) => { value.maxHp += 1; },
  readiness: (value) => { value.readiness += 1; },
  alive: (value) => { value.alive = false; },
  engagedWithIds: (value) => { value.engagedWithIds[0] = 'enemy-3'; },
};

describe('battle unit dirty comparison', () => {
  it('recognizes new units and equal units with independently allocated nested data', () => {
    const left = unit();
    const right = unit();
    expect(battleUnitChanged(undefined, right)).toBe(true);
    expect(battleUnitChanged(left, left)).toBe(false);
    expect(battleUnitChanged(left, right)).toBe(false);
    left.troopInstanceId = null;
    right.troopInstanceId = null;
    expect(battleUnitChanged(left, right)).toBe(false);
  });

  for (const [field, change] of Object.entries(changes)) {
    it(`detects a changed ${field} in either direction`, () => {
      const left = unit();
      const right = unit();
      change(right);
      expect(battleUnitChanged(left, right)).toBe(true);
      expect(battleUnitChanged(right, left)).toBe(true);
    });
  }

  const statChanges: { [K in keyof UnitStats]-?: number } = {
    health: 101, damage: 11, rate: 21, move: 2, range: 2, armor: 3, size: 3, capacity: 4,
  };
  for (const key of Object.keys(statChanges) as (keyof UnitStats)[]) {
    it(`compares nested ${key} without relying on stats identity`, () => {
      const left = unit();
      const right = unit();
      right.stats[key] = statChanges[key];
      expect(battleUnitChanged(left, right)).toBe(true);
    });
  }

  it('compares both coordinates of positions and every occupied hex', () => {
    for (const key of ['q', 'r'] as const) {
      const right = unit();
      right.position[key] += 1;
      expect(battleUnitChanged(unit(), right)).toBe(true);
      for (let index = 0; index < 2; index += 1) {
        const footprint = unit();
        footprint.occupiedHexes[index]![key] += 1;
        expect(battleUnitChanged(unit(), footprint)).toBe(true);
      }
    }
  });

  it('preserves array ordering and distinguishes empty, shorter, and longer arrays', () => {
    for (const key of ['attributes', 'engagedWithIds', 'occupiedHexes'] as const) {
      const reversed = unit();
      reversed[key].reverse();
      expect(battleUnitChanged(unit(), reversed)).toBe(true);
      const shorter = unit();
      shorter[key].pop();
      expect(battleUnitChanged(unit(), shorter)).toBe(true);
      const empty = unit();
      empty[key].length = 0;
      expect(battleUnitChanged(unit(), empty)).toBe(true);
      expect(battleUnitChanged(empty, structuredClone(empty))).toBe(false);
      const longer = unit();
      if (key === 'occupiedHexes') longer.occupiedHexes.push({q: 4, r: 4});
      else longer[key].push('extra');
      expect(battleUnitChanged(unit(), longer)).toBe(true);
    }
  });

  it('ignores object insertion order while preserving numeric zero and fractional values', () => {
    const left = unit();
    const right = unit();
    right.position = {r: 2, q: 1};
    right.stats = {capacity: 3, size: 2, armor: 2, range: 1, move: 1, rate: 20, damage: 10, health: 100};
    left.hp = 0;
    right.hp = -0;
    expect(battleUnitChanged(left, right)).toBe(false);
    right.readiness += 0.01;
    expect(battleUnitChanged(left, right)).toBe(true);
  });
});
