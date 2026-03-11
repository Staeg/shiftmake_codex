import { describe, expect, it } from 'vitest';
import { resolveDebugBattle } from './battle';
import { BASIC_UNIT_TYPES } from './unitCatalog';

describe('resolveDebugBattle', () => {
  it('is deterministic for the same seed and armies', () => {
    const input = {
      seed: 1337,
      player: { swordsman: 3, peasant: 2, archer: 1 },
      enemy: { swordsman: 3, peasant: 2, archer: 1 },
    };

    const a = resolveDebugBattle(input);
    const b = resolveDebugBattle(input);

    expect(a).toEqual(b);
  });

  it('always includes beat steps so initiative changes are visible', () => {
    const replay = resolveDebugBattle({
      seed: 7,
      player: { swordsman: 1, peasant: 0, archer: 0 },
      enemy: { swordsman: 1, peasant: 0, archer: 0 },
    });

    expect(replay.steps.length).toBeGreaterThan(0);
    expect(replay.steps[0]?.kind).toBe('beat');
    expect(replay.steps.some((step) => step.kind === 'beat')).toBe(true);
  });

  it('does not place melee and ranged units from the same side on the same spawn hex', () => {
    const replay = resolveDebugBattle({
      seed: 11,
      player: { swordsman: 8, peasant: 8, archer: 8 },
      enemy: { swordsman: 8, peasant: 8, archer: 8 },
    });

    (['player', 'enemy'] as const).forEach((side) => {
      const sideUnits = replay.initial.units.filter((unit) => unit.side === side);
      const rangedHexes = new Set(
        sideUnits
          .filter((unit) => BASIC_UNIT_TYPES[unit.typeId].stats.range > 0)
          .map((unit) => `${unit.position.q},${unit.position.r}`),
      );

      const meleeOnRangedHex = sideUnits.filter(
        (unit) => BASIC_UNIT_TYPES[unit.typeId].stats.range === 0 && rangedHexes.has(`${unit.position.q},${unit.position.r}`),
      );

      expect(meleeOnRangedHex).toHaveLength(0);
    });
  });

  it('spreads overflowing enemy melee spawns across valid enemy-corner bands', () => {
    const replay = resolveDebugBattle({
      seed: 21,
      player: { swordsman: 0, peasant: 0, archer: 1 },
      enemy: { swordsman: 0, peasant: 24, archer: 4 },
    });

    const meleeStartQ = replay.mapRadius - 1;
    const enemyMelee = replay.initial.units.filter(
      (unit) => unit.side === 'enemy' && BASIC_UNIT_TYPES[unit.typeId].stats.range === 0,
    );

    const countsByHex = new Map<string, number>();
    enemyMelee.forEach((unit) => {
      const key = `${unit.position.q},${unit.position.r}`;
      countsByHex.set(key, (countsByHex.get(key) ?? 0) + 1);
      expect(unit.position.q).toBeLessThanOrEqual(meleeStartQ);
    });

    expect(countsByHex.size).toBeGreaterThan(2);

    const sizeByHex = new Map<string, number>();
    enemyMelee.forEach((unit) => {
      const key = `${unit.position.q},${unit.position.r}`;
      const size = BASIC_UNIT_TYPES[unit.typeId].stats.size;
      sizeByHex.set(key, (sizeByHex.get(key) ?? 0) + size);
    });

    const totals = [...sizeByHex.values()];
    const maxTotal = Math.max(...totals);
    const minTotal = Math.min(...totals);
    expect(maxTotal - minTotal).toBeLessThanOrEqual(2);
  });
});


