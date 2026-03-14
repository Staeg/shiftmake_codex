import { describe, expect, it } from 'vitest';
import { resolveDebugBattle, resolveBattle } from './battle';
import { composeTroopDefinition, resolveAbilityDefinition, TROOP_CATALOG, getAbility, getTroopDefinitionOrThrow } from './unitCatalog';
import { getArmySelectionCost, getTroopSelectionCost } from './unitCatalog';
import type { AbilityDefinition, BattleInput, ResolvedCombatantDefinition } from './types';

describe('troop composition', () => {
  it('composes faction and unit type stats into a resolved troop', () => {
    const troop = composeTroopDefinition('human', 'soldier');

    expect(troop.label).toBe('Human Soldier');
    expect(troop.type).toBe('soldier');
    expect(troop.attributes).toEqual(['melee', 'human']);
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

  it('composes knight stats and abilities', () => {
    const troop = composeTroopDefinition('human', 'knight');

    expect(troop.label).toBe('Human Knight');
    expect(troop.type).toBe('knight');
    expect(troop.attributes).toEqual(['melee', 'human']);
    expect(troop.stats).toEqual({
      health: 220,
      damage: 22,
      speed: 7.7,
      range: 0,
      armor: 11,
      size: 2,
      capacity: 6,
    });
    expect(troop.abilities.map((ability) => ability.label)).toEqual(['Taunt']);
    expect(troop.quantity).toBe(1);
    expect(troop.cost).toBe(54);
  });

  it('adds new faction roster units with their abilities', () => {
    expect(composeTroopDefinition('troll', 'avenger').abilities.map((ability) => ability.label)).toEqual(['Vengeance 1', 'Regen 5']);
    expect(composeTroopDefinition('elf', 'druid').abilities.map((ability) => ability.label)).toEqual(['Shapeshift - Bear']);
    expect(composeTroopDefinition('goblin', 'shaman').abilities.map((ability) => ability.label)).toEqual(['Enhance 1']);
  });

  it('resolves named abilities from baseline effects plus modifiers', () => {
    expect(resolveAbilityDefinition('blast-5')).toMatchObject({
      label: 'Blast 5',
      trigger: { timing: 'onAttack' },
      effects: [{ kind: 'blast', amount: 5 }],
    });

    expect(resolveAbilityDefinition('valor-20')).toMatchObject({
      label: 'Valor 20',
      trigger: { timing: 'onKill' },
      target: { mode: 'aoe', allegiance: 'ally', radius: 0 },
      effects: [{ kind: 'heal', amount: 20, mode: 'flat' }],
    });

    expect(resolveAbilityDefinition('regen-5')).toMatchObject({
      label: 'Regen 5',
      trigger: { timing: 'endOfTurn' },
      duration: { kind: 'instant' },
      target: { mode: 'self' },
      effects: [{ kind: 'heal', amount: 5, mode: 'flat' }],
    });

    expect(resolveAbilityDefinition('taunt')).toMatchObject({
      label: 'Taunt',
      trigger: { timing: 'endOfTurn' },
      duration: { kind: 'instant' },
      target: { mode: 'aoe', allegiance: 'enemy', radius: 0, filters: { unengaged: true } },
      effects: [{ kind: 'redirect' }],
    });

    expect(resolveAbilityDefinition('enhance-1')).toMatchObject({
      label: 'Enhance 1',
      trigger: { timing: 'endOfTurn' },
      target: { mode: 'random', allegiance: 'ally', radius: 2, filters: { notTypes: ['caster'] } },
      effects: [
        { kind: 'haste', amount: 1, mode: 'flat' },
        { kind: 'ramp', amount: 1, mode: 'flat' },
      ],
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

  it('triggers charged shapeshift once through the generic ability runtime', () => {
    const replay = resolveDebugBattle({
      seed: 17,
      player: { 'elf/druid': 3 },
      enemy: { 'human/knight': 1 },
    });

    expect(replay.steps.filter((step) => step.message.includes('becomes frontline.')).length).toBeGreaterThan(0);
    expect(replay.steps.some((step) => step.message.includes('sets range to 0'))).toBe(true);
  });

  it('lets Enhance target a nearby non-caster ally', () => {
    const replay = resolveDebugBattle({
      seed: 33,
      player: { 'goblin/shaman': 1, 'goblin/soldier': 1 },
      enemy: { 'human/knight': 1 },
    });

    expect(
      replay.steps.some(
        (step) => step.kind === 'buff' && step.message.includes('Goblin Soldier') && step.message.includes('+1'),
      ),
    ).toBe(true);
  });
});

describe('ability mechanics', () => {
  // Builds a minimal ResolvedCombatantDefinition from a catalog troop, with optional extra abilities.
  function makeBattleCombatant(
    troopId: string,
    side: 'player' | 'enemy',
    extraAbilities: AbilityDefinition[] = [],
  ): ResolvedCombatantDefinition {
    const troop = getTroopDefinitionOrThrow(troopId);
    return {
      combatantId: `test-${side}-${troopId}`,
      troopInstanceId: null,
      factionId: troop.factionId,
      unitTypeId: troop.unitTypeId,
      label: troop.label,
      role: troop.role,
      type: troop.type,
      attributes: troop.attributes,
      stats: troop.stats,
      abilities: [...troop.abilities, ...extraAbilities],
      quantity: 1,
      cost: troop.cost,
      side,
    };
  }

  function makeBattleInput(
    playerCombatants: ResolvedCombatantDefinition[],
    enemyCombatants: ResolvedCombatantDefinition[],
    seed = 1,
  ): BattleInput {
    return { seed, riftId: null, tier: null, mutatorIds: [], playerCombatants, enemyCombatants };
  }

  it('maxUses: charged ability fires at most once per unit over the entire battle', () => {
    // shapeshift-bear has chargeEvery: 5, maxUses: 1 — should fire exactly once with 1 druid
    const replay = resolveDebugBattle({
      seed: 17,
      player: { 'elf/druid': 1, 'elf/soldier': 3 },
      enemy: { 'human/knight': 1 },
    });

    const shapeshiftCount = replay.steps.filter((step) => step.message.includes('becomes frontline')).length;
    expect(shapeshiftCount).toBe(1);
  });

  it('chargeEvery: ability cannot fire before the unit has taken that many turns', () => {
    // shapeshift-bear requires 5 endOfTurn events — at least 5 beats must elapse first
    const replay = resolveDebugBattle({
      seed: 17,
      player: { 'elf/druid': 1, 'elf/soldier': 3 },
      enemy: { 'human/knight': 1 },
    });

    const shapeshiftStepIndex = replay.steps.findIndex((step) => step.message.includes('becomes frontline'));
    expect(shapeshiftStepIndex).toBeGreaterThan(-1);

    const beatsBeforeShapeshift = replay.steps.slice(0, shapeshiftStepIndex).filter((step) => step.kind === 'beat').length;
    // Even at maximum speed (100), a unit can take at most one turn per beat.
    // So chargeEvery: 5 requires at least 5 beats to elapse before it can fire.
    expect(beatsBeforeShapeshift).toBeGreaterThanOrEqual(5);
  });

  it('forsaken: triggers for a solo troop but not when an ally of a different type is present', () => {
    const forsakenAbility = getAbility('forsaken-boost-80');
    const enemy = makeBattleCombatant('human/soldier', 'enemy');

    const soloReplay = resolveBattle(makeBattleInput([makeBattleCombatant('elf/archer', 'player', [forsakenAbility])], [enemy]));

    const alliedReplay = resolveBattle(
      makeBattleInput([makeBattleCombatant('elf/archer', 'player', [forsakenAbility]), makeBattleCombatant('elf/soldier', 'player')], [enemy]),
    );

    // forsaken fires at startOfBattle — buff steps appear before the first beat step
    const countPreBeatBuffs = (replay: ReturnType<typeof resolveBattle>) => {
      const firstBeat = replay.steps.findIndex((step) => step.kind === 'beat');
      return replay.steps.slice(0, firstBeat).filter((step) => step.kind === 'buff').length;
    };

    expect(countPreBeatBuffs(soloReplay)).toBeGreaterThan(0); // forsaken fires when alone
    expect(countPreBeatBuffs(alliedReplay)).toBe(0); // forsaken blocked when ally is present
  });

  it('combined arms: fires once per distinct other friendly troop type at startOfBattle', () => {
    const combinedArmsAbility = getAbility('combined-arms-boost-20');

    const countStartOfBattleBuffs = (extraAllies: string[]) => {
      const playerCombatants = [
        makeBattleCombatant('human/soldier', 'player', [combinedArmsAbility]),
        ...extraAllies.map((id) => makeBattleCombatant(id, 'player')),
      ];
      const replay = resolveBattle(makeBattleInput(playerCombatants, [makeBattleCombatant('human/knight', 'enemy')]));
      const firstBeat = replay.steps.findIndex((step) => step.kind === 'beat');
      return replay.steps.slice(0, firstBeat).filter((step) => step.kind === 'buff').length;
    };

    // combined-arms-boost-20 has 3 effects (bolster, haste, ramp) per repeat
    expect(countStartOfBattleBuffs([])).toBe(0); // solo: 0 other troop types → 0 repeats
    expect(countStartOfBattleBuffs(['human/archer'])).toBe(3); // 1 other type → 1 repeat × 3 effects
    expect(countStartOfBattleBuffs(['human/archer', 'human/militia'])).toBe(6); // 2 other types → 2 repeats × 3 effects
  });

  it('pack: grants temporary damage at start of turn and expires after the acting unit turn', () => {
    const replay = resolveBattle(
      makeBattleInput(
        [
          makeBattleCombatant('goblin/soldier', 'player', [getAbility('pack-1')]),
          makeBattleCombatant('goblin/soldier', 'player'),
        ],
        [makeBattleCombatant('human/knight', 'enemy')],
        41,
      ),
    );

    expect(replay.steps.some((step) => step.message.includes('gains +1 damage until end of turn'))).toBe(true);
    expect(replay.steps.some((step) => step.message.includes('loses +1 damage'))).toBe(true);
  });

  it('taunt: is authored as unengaged redirect rather than bespoke taunt logic', () => {
    const taunt = resolveAbilityDefinition('taunt');

    expect(taunt.target).toMatchObject({
      mode: 'aoe',
      allegiance: 'enemy',
      radius: 0,
      filters: { unengaged: true },
    });
    expect(taunt.effects).toEqual([{ kind: 'redirect' }]);
  });
});
