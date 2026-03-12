import { describe, expect, it } from 'vitest';
import { resolveDebugBattle } from './battle';
import { composeTroopDefinition, resolveAbilityDefinition, TROOP_CATALOG } from './unitCatalog';
import { getArmySelectionCost, getTroopSelectionCost } from './unitCatalog';

describe('troop composition', () => {
  it('composes faction and unit type stats into a resolved troop', () => {
    const troop = composeTroopDefinition('human', 'soldier');

    expect(troop.label).toBe('Human Soldier');
    expect(troop.types).toEqual(['soldier', 'melee', 'human']);
    expect(troop.stats).toEqual({
      health: 110,
      damage: 11,
      speed: 11,
      range: 0,
      armor: 3,
      size: 1,
      capacity: 3,
    });
    expect(troop.quantity).toBe(5);
    expect(troop.cost).toBe(90);
  });

  it('clamps composed stats and merges unit and faction abilities', () => {
    const troop = composeTroopDefinition('troll', 'champion');

    expect(troop.stats).toEqual({
      health: 195,
      damage: 24,
      speed: 13.6,
      range: 0,
      armor: 0,
      size: 3,
      capacity: 2,
    });
    expect(troop.abilities.map((ability) => ability.label)).toEqual(['Valor 20', 'Regen 5']);
    expect(troop.quantity).toBe(1);
    expect(troop.cost).toBe(78);
  });

  it('resolves named abilities from baseline effects plus modifiers', () => {
    expect(resolveAbilityDefinition('blast-5')).toMatchObject({
      label: 'Blast 5',
      trigger: 'onAttack',
      effect: 'blast',
      amount: 5,
    });

    expect(resolveAbilityDefinition('valor-20')).toMatchObject({
      label: 'Valor 20',
      trigger: 'onKill',
      effect: 'heal',
      radius: 0,
      amount: 20,
    });

    expect(resolveAbilityDefinition('regen-5')).toMatchObject({
      label: 'Regen 5',
      trigger: 'endOfTurn',
      effect: 'heal',
      amount: 5,
    });
  });
});

describe('selection cost helpers', () => {
  it('matches the human soldier checksum across starting and upgraded quantities', () => {
    expect(getTroopSelectionCost('human/soldier', 1)).toBe(18);
    expect(getTroopSelectionCost('human/soldier', 5)).toBe(90);
    expect(getTroopSelectionCost('human/soldier', 6)).toBe(108);
    expect(getTroopSelectionCost('human/soldier', 7)).toBe(144);
  });

  it('sums side cost totals across multiple troop selections', () => {
    expect(
      getArmySelectionCost({
        'human/soldier': 5,
        'elf/archer': 5,
      }),
    ).toBe(200);
  });
});

describe('resolveDebugBattle', () => {
  it('is deterministic for the same seed and armies', () => {
    const input = {
      seed: 1337,
      player: { 'human/soldier': 3, 'human/militia': 2, 'elf/archer': 1 },
      enemy: { 'human/soldier': 3, 'human/militia': 2, 'elf/archer': 1 },
    };

    const a = resolveDebugBattle(input);
    const b = resolveDebugBattle(input);

    expect(a).toEqual(b);
  });

  it('always includes beat steps so initiative changes are visible', () => {
    const replay = resolveDebugBattle({
      seed: 7,
      player: { 'human/soldier': 1 },
      enemy: { 'human/soldier': 1 },
    });

    expect(replay.steps.length).toBeGreaterThan(0);
    expect(replay.steps[0]?.kind).toBe('beat');
    expect(replay.steps.some((step) => step.kind === 'beat')).toBe(true);
  });

  it('formats attack damage without floating point noise', () => {
    const replay = resolveDebugBattle({
      seed: 99,
      player: { 'human/soldier': 1 },
      enemy: { 'human/militia': 1 },
    });

    const attackStep = replay.steps.find((step) => step.kind === 'attack');
    expect(attackStep).toBeDefined();
    expect(attackStep?.message).not.toContain('000000');
  });

  it('does not place melee and ranged units from the same side on the same spawn hex', () => {
    const replay = resolveDebugBattle({
      seed: 11,
      player: { 'human/soldier': 8, 'human/militia': 8, 'elf/archer': 8, 'goblin/wizard': 4 },
      enemy: { 'human/soldier': 8, 'human/militia': 8, 'elf/archer': 8, 'goblin/wizard': 4 },
    });

    (['player', 'enemy'] as const).forEach((side) => {
      const sideUnits = replay.initial.units.filter((unit) => unit.side === side);
      const rangedHexes = new Set(
        sideUnits
          .filter((unit) => TROOP_CATALOG[unit.troopId].stats.range > 0)
          .map((unit) => `${unit.position.q},${unit.position.r}`),
      );

      const meleeOnRangedHex = sideUnits.filter(
        (unit) => TROOP_CATALOG[unit.troopId].stats.range === 0 && rangedHexes.has(`${unit.position.q},${unit.position.r}`),
      );

      expect(meleeOnRangedHex).toHaveLength(0);
    });
  });

  it('spreads overflowing enemy melee spawns across valid enemy-corner bands', () => {
    const replay = resolveDebugBattle({
      seed: 21,
      player: { 'elf/archer': 1 },
      enemy: { 'human/militia': 28 },
    });

    const meleeStartQ = replay.mapRadius - 1;
    const enemyMelee = replay.initial.units.filter(
      (unit) => unit.side === 'enemy' && TROOP_CATALOG[unit.troopId].stats.range === 0,
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
      const size = TROOP_CATALOG[unit.troopId].stats.size;
      sizeByHex.set(key, (sizeByHex.get(key) ?? 0) + size);
    });

    const totals = [...sizeByHex.values()];
    const maxTotal = Math.max(...totals);
    const minTotal = Math.min(...totals);
    expect(maxTotal - minTotal).toBeLessThanOrEqual(1);
  });
});
