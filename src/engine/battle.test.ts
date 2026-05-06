import { describe, expect, it } from 'vitest';
import { resolveAbilityTargetRadius, resolveDebugBattle, resolveBattle } from './battle';
import { createTroopInstance, resolveTroopCombatant } from './army';
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
    expect(troop.cost).toBe(24);
  });

  it('clamps composed stats and merges unit and faction abilities', () => {
    const troop = composeTroopDefinition('troll', 'champion');

    expect(troop.stats).toEqual({
      health: 169,
      damage: 24,
      speed: 13.6,
      range: 0,
      armor: 0,
      size: 3,
      capacity: 2,
    });
    expect(troop.abilities.map((ability) => ability.label)).toEqual(['Valor 20', 'Regen 5']);
    expect(troop.quantity).toBe(2);
    expect(troop.cost).toBe(60);
  });

  it('composes knight stats and abilities', () => {
    const troop = composeTroopDefinition('human', 'knight');

    expect(troop.label).toBe('Human Knight');
    expect(troop.type).toBe('knight');
    expect(troop.attributes).toEqual(['melee', 'human']);
    expect(troop.stats).toEqual({
      health: 220,
      damage: 17.6,
      speed: 7.7,
      range: 0,
      armor: 11,
      size: 2,
      capacity: 6,
    });
    expect(troop.abilities.map((ability) => ability.label)).toEqual(['Taunt']);
    expect(troop.quantity).toBe(2);
    expect(troop.cost).toBe(60);
  });

  it('adds new faction roster units with their abilities', () => {
    expect(composeTroopDefinition('troll', 'avenger').abilities.map((ability) => ability.label)).toEqual(['Vengeance 3', 'Regen 5']);
    expect(composeTroopDefinition('dwarf', 'avenger').attributes).toEqual(['melee', 'dwarf']);
    expect(composeTroopDefinition('dwarf', 'avenger').stats).toMatchObject({ health: 240, damage: 6, speed: 8.5, armor: 3, size: 2, capacity: 2 });
    expect(composeTroopDefinition('orc', 'soldier').attributes).toEqual(['melee', 'orc']);
    expect(composeTroopDefinition('orc', 'soldier').stats).toMatchObject({ health: 110, damage: 12.5, speed: 11, armor: 1, size: 1, capacity: 1 });
    expect(composeTroopDefinition('fae', 'wizard').attributes).toEqual(['caster', 'fae']);
    expect(composeTroopDefinition('fae', 'wizard').stats).toMatchObject({ health: 16, damage: 9, speed: 9.2, range: 3, armor: -1 });
    expect(composeTroopDefinition('elf', 'druid').abilities.map((ability) => ability.label)).toEqual(['Shapeshift - Bear']);
    expect(composeTroopDefinition('goblin', 'shaman').abilities.map((ability) => ability.label)).toEqual(['Enhance 1']);
    expect(composeTroopDefinition('elf', 'elementalist').abilities.map((ability) => ability.label)).toEqual(['Charge 4 Summon Elemental']);
    expect(composeTroopDefinition('troll', 'necromancer').abilities.map((ability) => ability.label)).toEqual(['Corpse Summon Skeleton', 'Regen 5']);
    expect(composeTroopDefinition('goblin', 'beastmaster').abilities.map((ability) => ability.label)).toEqual(['Summon Wolf 2']);
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
      target: { mode: 'random', allegiance: 'ally', radiusSource: 'selfRange', filters: { notTypes: ['caster'] } },
      effects: [
        { kind: 'haste', amount: 1, mode: 'flat' },
        { kind: 'ramp', amount: 1, mode: 'flat' },
      ],
    });
  });
});

describe('selection cost helpers', () => {
  it('matches the human soldier checksum across starting and upgraded quantities', () => {
    expect(getTroopSelectionCost('human/soldier', 1)).toBe(4.8);
    expect(getTroopSelectionCost('human/soldier', 5)).toBe(24);
    expect(getTroopSelectionCost('human/soldier', 6)).toBe(28.8);
    expect(getTroopSelectionCost('human/soldier', 7)).toBe(33.6);
  });

  it('sums side cost totals across multiple troop selections', () => {
    expect(
      getArmySelectionCost({
        'human/soldier': 1,
        'elf/archer': 1,
      }),
    ).toBe(8.13);
  });
});

describe('resolveDebugBattle', () => {
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

  it('can apply troop and faction upgrades in debug battles', () => {
    const replay = resolveDebugBattle({
      seed: 42,
      player: { 'human/archer': 5 },
      enemy: { 'human/archer': 5 },
      playerFactionUpgradeIds: ['human-tubthumping'],
      playerTroopTypeUpgradeIds: ['archer-pinning-volley'],
      enemyTroopTypeUpgradeIds: ['archer-pinning-volley'],
    });

    const playerProfile = replay.troopProfiles.find((profile) => profile.side === 'player' && profile.unitTypeId === 'archer');
    expect(playerProfile?.abilities.map((ability) => ability.id)).toContain('pinning-volley');
    expect(playerProfile?.abilities.map((ability) => ability.id)).toContain('tubthumping');
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
    expect(replay.steps[0]?.metadata?.explanation?.beat?.initiativePurposeHint).toContain('100');
  });

  it('applies haze as a negative initiative bonus each beat', () => {
    const input = makeBattleInput([makeBattleCombatant('human/soldier', 'player')], [makeBattleCombatant('human/soldier', 'enemy')], 17);
    input.mutatorIds = ['haze'];

    const replay = resolveBattle(input);

    expect(replay.steps[0]?.kind).toBe('beat');
    expect(replay.steps[0]?.metadata?.initiativeBonus).toBe(-5);
  });

  it('animated removes fading from summoned units and suppresses new fading grants', () => {
    const input = makeBattleInput(
      [makeBattleCombatant('goblin/beastmaster', 'player'), makeBattleCombatant('troll/shaman', 'player')],
      [makeBattleCombatant('human/soldier', 'enemy')],
      18,
    );
    input.mutatorIds = ['animated'];

    const replay = resolveBattle(input);
    const wolfProfile = replay.troopProfiles.find((profile) => profile.troopLabel === 'Wolf');

    expect(wolfProfile).toBeDefined();
    expect(wolfProfile?.abilities.map((ability) => ability.id)).not.toContain('fading');
    expect(replay.steps.some((step) => step.message.includes('gains Fading'))).toBe(false);
  });

  it('corrosion zeroes starting armor and still allows armor to go negative', () => {
    const input = makeBattleInput(
      [makeBattleCombatant('elf/archer', 'player', [getAbility('shredding-arrows')])],
      [makeBattleCombatant('human/knight', 'enemy')],
      19,
    );
    input.mutatorIds = ['corrosion'];

    const replay = resolveBattle(input);
    const knightAtStart = replay.initial.units.find((unit) => unit.side === 'enemy' && unit.troopLabel === 'Human Knight');
    const enemyArmorHistory = replay.steps
      .map((step) => step.snapshot.units.find((unit) => unit.side === 'enemy' && unit.troopLabel === 'Human Knight')?.stats.armor)
      .filter((armor): armor is number => typeof armor === 'number');

    expect(knightAtStart?.stats.armor).toBe(0);
    expect(Math.min(...enemyArmorHistory)).toBeLessThan(0);
  });

  it('quakes displaces units to random adjacent hexes that still fit', () => {
    const player = makeBattleCombatant('human/soldier', 'player');
    player.stats = { ...player.stats, health: 12, damage: 0, speed: 1, size: 1, capacity: 0 };
    const enemy = makeBattleCombatant('human/soldier', 'enemy');
    enemy.stats = { ...enemy.stats, health: 12, damage: 0, speed: 1, size: 1, capacity: 0 };
    const input = makeBattleInput([player], [enemy], 20);
    input.mutatorIds = ['quakes', 'decay'];

    const replay = resolveBattle(input);
    const quakeStep = replay.steps.find((step) => step.metadata?.sourceAbilityId === 'quakes');

    expect(quakeStep).toBeDefined();
    expect(quakeStep?.kind).toBe('move');
  });

  it('decay damages and can kill units without using armor', () => {
    const player = makeBattleCombatant('human/knight', 'player');
    player.stats = { ...player.stats, health: 1, armor: 50 };
    const enemy = makeBattleCombatant('human/knight', 'enemy');
    enemy.stats = { ...enemy.stats, health: 1, armor: 50 };
    const input = makeBattleInput([player], [enemy], 21);
    input.mutatorIds = ['decay'];

    const replay = resolveBattle(input);
    const decayHit = replay.steps.find((step) => step.metadata?.sourceAbilityId === 'decay' && step.kind === 'attack');
    const decayDeaths = replay.steps.filter((step) => step.metadata?.sourceAbilityId === 'decay' && step.kind === 'death');

    expect(decayHit?.metadata?.armorIgnored).toBe(true);
    expect(decayDeaths).toHaveLength(2);
    expect(replay.outcome).toBe('draw');
  });

  it('includes source ability metadata on ordinary heal steps', () => {
    const priest = makeBattleCombatant('human/priest', 'player');
    const ally = makeBattleCombatant('human/soldier', 'player');
    ally.stats = { ...ally.stats, health: 1 };

    const replay = resolveBattle(makeBattleInput([priest, ally], [makeBattleCombatant('human/knight', 'enemy')], 46));

    const healStep = replay.steps.find((step) => step.kind === 'heal' && step.metadata?.sourceAbilityId);

    expect(healStep?.metadata?.sourceAbilityId).toBeDefined();
    expect(healStep?.metadata?.sourceAbilityLabel).toBeDefined();
    expect(healStep?.metadata?.explanation?.ability?.abilityId).toBe(healStep?.metadata?.sourceAbilityId);
    expect(healStep?.metadata?.explanation?.ability?.abilityLabel).toBe(healStep?.metadata?.sourceAbilityLabel);
  });

  it('gives generic death steps a non-fallback explanation payload', () => {
    const replay = resolveDebugBattle({
      seed: 22,
      player: { 'goblin/beastmaster': 1 },
      enemy: { 'human/knight': 2 },
    });

    const deathStep = replay.steps.find((step) => step.kind === 'death');

    expect(deathStep).toBeDefined();
    expect(deathStep?.metadata?.sourceAbilityId).toBe('battle-resolution');
    expect(deathStep?.metadata?.sourceAbilityLabel).toBe('Battle resolution');
    expect(deathStep?.metadata?.explanation?.ability).toMatchObject({
      abilityId: 'battle-resolution',
      abilityLabel: 'Battle resolution',
      effect: 'death',
    });
  });

  it('distinguishes move and engage explanation payloads', () => {
    const replay = resolveDebugBattle({
      seed: 7,
      player: { 'human/knight': 1 },
      enemy: { 'human/soldier': 1 },
    });

    const moveStep = replay.steps.find((step) => step.kind === 'move');
    const engageStep = replay.steps.find((step) => step.kind === 'engage');

    expect(moveStep?.metadata?.explanation?.movement?.stepKind).toBe('move');
    expect(engageStep?.metadata?.explanation?.movement?.stepKind).toBe('engage');
    expect(moveStep?.metadata?.explanation?.movement?.movementPhase).toBe('approach');
    expect(engageStep?.metadata?.explanation?.movement?.movementPhase).toBe('commit');
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

  it('stores live resolved stats in replay snapshots after shapeshift buffs apply', () => {
    const replay = resolveDebugBattle({
      seed: 17,
      player: { 'elf/druid': 1, 'elf/soldier': 3 },
      enemy: { 'human/knight': 1 },
    });

    const buffStep = replay.steps.find((step) => step.kind === 'buff' && step.message.includes('gains +20 damage.'));
    const druid = buffStep?.snapshot.units.find((unit) => unit.troopLabel === 'Elven Druid');

    expect(druid?.stats.damage).toBeGreaterThan(10);
    expect(druid?.stats.health).toBeGreaterThan(20);
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

  it('preserves configured saturation in the replay payload', () => {
    const replay = resolveBattle({
      seed: 5,
      riftId: 'test-rift',
      tier: 2,
      mutatorIds: [],
      saturation: 3,
      playerCombatants: [],
      enemyCombatants: [],
    });

    expect(replay.saturation).toBe(3);
  });

  it('spawns summoned wolves and kills them when their bonded summoner dies', () => {
    const replay = resolveDebugBattle({
      seed: 22,
      player: { 'goblin/beastmaster': 1 },
      enemy: { 'human/knight': 2 },
    });

    expect(replay.steps.some((step) => step.message.includes('summons Wolf'))).toBe(true);
    expect(replay.steps.filter((step) => step.kind === 'death' && step.message.includes('Wolf')).length).toBeGreaterThan(0);
  });

  it('keeps summoned units on their native stats and attributes instead of inheriting summoner faction traits', () => {
    const replay = resolveDebugBattle({
      seed: 22,
      player: { 'goblin/beastmaster': 1 },
      enemy: { 'human/knight': 2 },
    });

    const wolfProfile = replay.troopProfiles.find((profile) => profile.side === 'player' && profile.unitTypeId === 'wolf');

    expect(wolfProfile).toMatchObject({
      troopLabel: 'Wolf',
      factionId: 'goblin',
      attributes: ['melee', 'summoned'],
      stats: {
        health: 70,
        damage: 6,
        speed: 12,
        range: 2,
        armor: 0,
        size: 1,
        capacity: 1,
      },
    });
    expect(wolfProfile?.abilities.map((ability) => ability.id)).toEqual(['bonded', 'pack-1']);
  });

  it('consumes a corpse to summon a skeleton and skips fading corpses', () => {
    const skeletonReplay = resolveDebugBattle({
      seed: 31,
      player: { 'troll/necromancer': 1 },
      enemy: { 'human/militia': 1 },
    });
    const fadingReplay = resolveDebugBattle({
      seed: 32,
      player: { 'troll/necromancer': 1 },
      enemy: { 'troll/skeleton': 1 },
    });

    expect(skeletonReplay.steps.some((step) => step.message.includes('summons Skeleton'))).toBe(true);
    expect(fadingReplay.steps.some((step) => step.message.includes('summons Skeleton'))).toBe(false);
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
    const forsakenAbility = getAbility('forsaken-80');
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
    const combinedArmsAbility = getAbility('combined-arms-20');

    const countStartOfBattleBuffs = (extraAllies: string[]) => {
      const playerCombatants = [
        makeBattleCombatant('human/soldier', 'player', [combinedArmsAbility]),
        ...extraAllies.map((id) => makeBattleCombatant(id, 'player')),
      ];
      const replay = resolveBattle(makeBattleInput(playerCombatants, [makeBattleCombatant('human/knight', 'enemy')]));
      const firstBeat = replay.steps.findIndex((step) => step.kind === 'beat');
      return replay.steps.slice(0, firstBeat).filter((step) => step.kind === 'buff').length;
    };

    // combined-arms-20 has 3 effects (bolster, haste, ramp) per repeat
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

  it('ally R uses the acting unit resolved range', () => {
    const enhance = getAbility('enhance-1');
    const goblinShaman = composeTroopDefinition('goblin', 'shaman');
    const trollShaman = composeTroopDefinition('troll', 'shaman');

    expect(resolveAbilityTargetRadius({ resolvedStats: goblinShaman.stats }, enhance.target)).toBe(1);
    expect(resolveAbilityTargetRadius({ resolvedStats: trollShaman.stats }, enhance.target)).toBe(2);
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

  it('resolves troop-type upgrades across matching unit types and rewires replacement upgrades', () => {
    const upgradedState = {
      factionUpgradeIds: [
        'human-tubthumping',
        'human-hold-the-standard',
        'elf-fade-into-shadow',
        'elf-long-shot-doctrine',
        'elf-silver-distance',
        'goblin-snatch-the-moment',
        'goblin-loot-frenzy',
        'troll-stoneblood',
        'troll-crushing-sweep',
        'troll-rowdy-regrowth',
        'dwarf-diggy-hole',
        'dwarf-copious-ale',
        'dwarf-stand-as-one',
        'dwarf-stall-warts',
        'orc-seeing-red',
        'orc-first-blood',
        'orc-warcry',
        'orc-berserk',
        'fae-ensorcel',
        'fae-glamour',
        'fae-changeling',
        'fae-whimsy',
      ],
      troopTypeUpgradeIds: [
        'soldier-shield-drill',
        'archer-pinning-volley',
        'archer-shredding-arrows',
        'avenger-blood-oath',
        'avenger-sevenfold',
        'avenger-last-witness',
        'beastmaster-blood-in-the-water',
        'beastmaster-packmasters-whistle',
        'beastmaster-thrill-of-the-hunt',
        'champion-anointed',
        'druid-wild-growth',
        'druid-true-form',
        'druid-thornhide',
        'druid-bramble-snare',
        'druid-wild-call',
        'elementalist-arc-conductor',
        'elementalist-mitosis',
        'elementalist-living-circuit',
        'knight-brace',
        'knight-challenge-accepted',
        'knight-sentinel-runes',
        'militia-dogpile',
        'militia-rabble-rush',
        'necromancer-rising-tide',
        'necromancer-early-riser',
        'necromancer-carrion-choir',
        'priest-overflowing-grace',
        'priest-zeal',
        'priest-mercy-before-dawn',
        'ranger-concussive-shots',
        'ranger-skirmishers-step',
        'ranger-heartseeker',
        'ranger-scavengers-hunger',
        'shaman-serve-once-more',
        'shaman-static-charge',
        'shaman-war-drums',
        'wizard-leyline-focus',
        'wizard-lightning-rods',
        'wizard-storm',
        'wizard-spell-echo',
      ],
    };

    const humanSoldier = resolveTroopCombatant(upgradedState, createTroopInstance('human', 'soldier'), 'player');
    const humanArcher = resolveTroopCombatant(upgradedState, createTroopInstance('human', 'archer'), 'player');
    const elfArcher = resolveTroopCombatant(upgradedState, createTroopInstance('elf', 'archer'), 'player');
    const trollAvenger = resolveTroopCombatant(upgradedState, createTroopInstance('troll', 'avenger'), 'player');
    const goblinBeastmaster = resolveTroopCombatant(upgradedState, createTroopInstance('goblin', 'beastmaster'), 'player');
    const elfDruid = resolveTroopCombatant(upgradedState, createTroopInstance('elf', 'druid'), 'player');
    const elfElementalist = resolveTroopCombatant(upgradedState, createTroopInstance('elf', 'elementalist'), 'player');
    const trollNecromancer = resolveTroopCombatant(upgradedState, createTroopInstance('troll', 'necromancer'), 'player');
    const humanPriest = resolveTroopCombatant(upgradedState, createTroopInstance('human', 'priest'), 'player');
    const elfRanger = resolveTroopCombatant(upgradedState, createTroopInstance('elf', 'ranger'), 'player');
    const trollShaman = resolveTroopCombatant(upgradedState, createTroopInstance('troll', 'shaman'), 'player');
    const goblinWizard = resolveTroopCombatant(upgradedState, createTroopInstance('goblin', 'wizard'), 'player');
    const humanKnight = resolveTroopCombatant(upgradedState, createTroopInstance('human', 'knight'), 'player');
    const humanMilitia = resolveTroopCombatant(upgradedState, createTroopInstance('human', 'militia'), 'player');
    const dwarfSoldier = resolveTroopCombatant(upgradedState, createTroopInstance('dwarf', 'soldier'), 'player');
    const orcSoldier = resolveTroopCombatant(upgradedState, createTroopInstance('orc', 'soldier'), 'player');
    const faeWizard = resolveTroopCombatant(upgradedState, createTroopInstance('fae', 'wizard'), 'player');

    expect(humanSoldier.abilities.map((ability) => ability.id)).toContain('shield-drill');
    expect(humanArcher.abilities.map((ability) => ability.id)).toContain('shredding-arrows');
    expect(humanArcher.abilities.map((ability) => ability.id)).toContain('pinning-volley');
    expect(elfArcher.abilities.map((ability) => ability.id)).toContain('shredding-arrows');
    expect(elfArcher.abilities.map((ability) => ability.id)).toContain('long-shot-doctrine');
    expect(elfArcher.abilities.map((ability) => ability.id)).toContain('silver-distance');
    expect(trollAvenger.abilities.map((ability) => ability.id)).toContain('blood-oath');
    expect(trollAvenger.abilities.map((ability) => ability.id)).toContain('uses-7-corpse-summon-skeleton');
    expect(trollAvenger.abilities.map((ability) => ability.id)).toContain('last-witness');
    expect(goblinBeastmaster.abilities.map((ability) => ability.id)).toContain('summon-wolf-2-blood');
    expect(goblinBeastmaster.abilities.map((ability) => ability.id)).toContain('packmasters-whistle');
    expect(goblinBeastmaster.abilities.map((ability) => ability.id)).toContain('thrill-of-the-hunt');
    expect(goblinBeastmaster.abilities.map((ability) => ability.id)).not.toContain('summon-wolf-2');
    expect(elfDruid.abilities.map((ability) => ability.id)).toContain('regen-60');
    expect(elfDruid.abilities.map((ability) => ability.id)).toContain('shapeshift-bear-2');
    expect(elfDruid.abilities.map((ability) => ability.id)).toContain('thornhide');
    expect(elfDruid.abilities.map((ability) => ability.id)).toContain('bramble-snare');
    expect(elfDruid.abilities.map((ability) => ability.id)).toContain('wild-call');
    expect(elfDruid.abilities.map((ability) => ability.id)).toContain('fade-into-shadow');
    expect(elfElementalist.abilities.map((ability) => ability.id)).toContain('charge-4-summon-elemental-mitosis');
    expect(elfElementalist.abilities.map((ability) => ability.id)).toContain('arc-conductor');
    expect(elfElementalist.abilities.map((ability) => ability.id)).toContain('living-circuit');
    expect(elfElementalist.abilities.map((ability) => ability.id)).not.toContain('charge-4-summon-elemental');
    expect(trollNecromancer.abilities.map((ability) => ability.id)).toContain('corpse-summon-skeleton-rising');
    expect(trollNecromancer.abilities.map((ability) => ability.id)).toContain('early-riser');
    expect(trollNecromancer.abilities.map((ability) => ability.id)).toContain('carrion-choir');
    expect(trollNecromancer.abilities.map((ability) => ability.id)).not.toContain('corpse-summon-skeleton');
    expect(humanPriest.abilities.map((ability) => ability.id)).toContain('zeal-enhance-1');
    expect(humanPriest.abilities.map((ability) => ability.id)).toContain('mercy-before-dawn');
    expect(humanPriest.abilities.map((ability) => ability.id)).toContain('overflowing-grace');
    expect(humanPriest.abilities.map((ability) => ability.id)).toContain('tubthumping');
    expect(elfRanger.abilities.map((ability) => ability.id)).toContain('concussive-shots');
    expect(elfRanger.abilities.map((ability) => ability.id)).toContain('skirmishers-step');
    expect(elfRanger.abilities.map((ability) => ability.id)).toContain('heartseeker');
    expect(elfRanger.abilities.map((ability) => ability.id)).toContain('scavengers-hunger');
    expect(trollShaman.abilities.map((ability) => ability.id)).toContain('serve-once-more');
    expect(trollShaman.abilities.map((ability) => ability.id)).toContain('static-charge');
    expect(trollShaman.abilities.map((ability) => ability.id)).toContain('war-drums');
    expect(goblinWizard.abilities.map((ability) => ability.id)).toContain('leyline-focus');
    expect(goblinWizard.abilities.map((ability) => ability.id)).toContain('lightning-rods');
    expect(goblinWizard.abilities.map((ability) => ability.id)).toContain('summon-elemental-1');
    expect(goblinWizard.abilities.map((ability) => ability.id)).toContain('charge-4-random-enemy-r-strike-4');
    expect(goblinWizard.abilities.map((ability) => ability.id)).toContain('spell-echo');
    expect(goblinWizard.abilities.map((ability) => ability.id)).toContain('snatch-the-moment');
    expect(humanKnight.abilities.map((ability) => ability.id)).toContain('brace');
    expect(humanKnight.abilities.map((ability) => ability.id)).toContain('challenge-accepted');
    expect(humanKnight.abilities.map((ability) => ability.id)).toContain('sentinel-runes');
    expect(humanKnight.abilities.map((ability) => ability.id)).toContain('hold-the-standard');
    expect(humanMilitia.abilities.map((ability) => ability.id)).toContain('dogpile');
    expect(humanMilitia.abilities.map((ability) => ability.id)).toContain('rabble-rush');
    expect(dwarfSoldier.abilities.map((ability) => ability.id)).toContain('diggy-hole');
    expect(dwarfSoldier.abilities.map((ability) => ability.id)).toContain('copious-ale');
    expect(dwarfSoldier.abilities.map((ability) => ability.id)).toContain('stand-as-one');
    expect(dwarfSoldier.abilities.map((ability) => ability.id)).toContain('stall-warts');
    expect(dwarfSoldier.stats.speed).toBe(11.9);
    expect(orcSoldier.abilities.map((ability) => ability.id)).toContain('seeing-red');
    expect(orcSoldier.abilities.map((ability) => ability.id)).toContain('first-blood');
    expect(orcSoldier.abilities.map((ability) => ability.id)).toContain('warcry');
    expect(orcSoldier.abilities.map((ability) => ability.id)).toContain('berserk');
    expect(faeWizard.abilities.map((ability) => ability.id)).toContain('ensorcel');
    expect(faeWizard.abilities.map((ability) => ability.id)).toContain('glamour');
    expect(faeWizard.abilities.map((ability) => ability.id)).toContain('changeling');
    expect(faeWizard.abilities.map((ability) => ability.id)).toContain('whimsy');
  });

  it('diggy hole delays Dwarven deployment until beat 10 on the enemy side of the board', () => {
    const dwarf = resolveTroopCombatant(
      { factionUpgradeIds: ['dwarf-diggy-hole'], troopTypeUpgradeIds: [] },
      createTroopInstance('dwarf', 'soldier'),
      'player',
    );
    const enemy = makeBattleCombatant('human/soldier', 'enemy');
    dwarf.quantity = 1;
    dwarf.stats = { ...dwarf.stats, damage: 0, speed: 1 };
    enemy.stats = { ...enemy.stats, damage: 0, speed: 1 };

    const input = makeBattleInput([dwarf], [enemy], 61);
    input.playerFactionUpgradeIds = ['dwarf-diggy-hole'];
    const replay = resolveBattle(input);

    expect(replay.initial.units.some((unit) => unit.factionId === 'dwarf')).toBe(false);
    const digStep = replay.steps.find((step) => step.metadata?.sourceAbilityId === 'diggy-hole');
    expect(digStep).toBeTruthy();
    expect(replay.steps.filter((step) => step.kind === 'beat').find((step) => step.metadata?.beat === 10)).toBeTruthy();
    const spawnedDwarf = digStep?.snapshot.units.find((unit) => unit.factionId === 'dwarf' && unit.side === 'player');
    expect(spawnedDwarf?.position.q).toBeGreaterThan(0);
  });

  it('Ale and Hearty sets one random unit from each Dwarven troop to speed 1', () => {
    const dwarf = resolveTroopCombatant(
      { factionUpgradeIds: ['dwarf-copious-ale'], troopTypeUpgradeIds: [] },
      createTroopInstance('dwarf', 'soldier'),
      'player',
    );
    dwarf.quantity = 3;
    dwarf.stats = { ...dwarf.stats, damage: 0 };
    const enemy = makeBattleCombatant('human/soldier', 'enemy');
    enemy.stats = { ...enemy.stats, damage: 0, speed: 1 };

    const input = makeBattleInput([dwarf], [enemy], 62);
    input.playerFactionUpgradeIds = ['dwarf-copious-ale'];
    const replay = resolveBattle(input);
    const aleStep = replay.steps.find((step) => step.metadata?.sourceAbilityId === 'copious-ale');

    expect(aleStep).toBeTruthy();
    const dwarfSpeeds = aleStep?.snapshot.units.filter((unit) => unit.factionId === 'dwarf').map((unit) => unit.stats.speed).sort((a, b) => a - b);
    expect(dwarfSpeeds).toEqual([1, 11.9, 11.9]);
  });

  it('Mycelial Beards shares mitigated damage among Dwarves on the target hex', () => {
    const dwarf = resolveTroopCombatant(
      { factionUpgradeIds: ['dwarf-stand-as-one'], troopTypeUpgradeIds: [] },
      createTroopInstance('dwarf', 'soldier'),
      'player',
    );
    dwarf.quantity = 2;
    dwarf.stats = { ...dwarf.stats, health: 50, damage: 0, speed: 1 };
    const enemy = makeBattleCombatant('human/archer', 'enemy');
    enemy.stats = { ...enemy.stats, damage: 23, speed: 100, range: 99 };

    const input = makeBattleInput([dwarf], [enemy], 63);
    input.playerFactionUpgradeIds = ['dwarf-stand-as-one'];
    const replay = resolveBattle(input);
    const sharedStep = replay.steps.find((step) => step.kind === 'attack' && step.message.includes('shared among 2 Dwarves'));

    expect(sharedStep?.targetIds).toHaveLength(2);
    const damagedDwarves = sharedStep?.snapshot.units.filter((unit) => unit.factionId === 'dwarf').map((unit) => unit.hp).sort((a, b) => a - b);
    expect(damagedDwarves).toEqual([41, 41]);
  });

  it('stall warts grants Dwarves armor after normal attacks hit them', () => {
    const dwarf = resolveTroopCombatant(
      { factionUpgradeIds: ['dwarf-stall-warts'], troopTypeUpgradeIds: [] },
      createTroopInstance('dwarf', 'soldier'),
      'player',
    );
    dwarf.quantity = 1;
    dwarf.stats = { ...dwarf.stats, damage: 0, speed: 1 };
    const enemy = makeBattleCombatant('human/archer', 'enemy');
    enemy.stats = { ...enemy.stats, damage: 10, speed: 100, range: 99 };

    const input = makeBattleInput([dwarf], [enemy], 64);
    input.playerFactionUpgradeIds = ['dwarf-stall-warts'];
    const replay = resolveBattle(input);
    const armorStep = replay.steps.find((step) => step.kind === 'buff' && step.metadata?.sourceAbilityId === 'stall-warts');

    expect(armorStep?.message).toContain('gains +1 armor');
    expect(armorStep?.snapshot.units.find((unit) => unit.factionId === 'dwarf')?.stats.armor).toBe(6);
  });

  it('seeing red costs armor and grants initiative when Orcs kill', () => {
    const orc = resolveTroopCombatant(
      { factionUpgradeIds: ['orc-seeing-red'], troopTypeUpgradeIds: [] },
      createTroopInstance('orc', 'champion'),
      'player',
    );
    orc.quantity = 1;
    orc.stats = { ...orc.stats, damage: 100, speed: 100 };
    const enemy = makeBattleCombatant('human/militia', 'enemy');
    enemy.stats = { ...enemy.stats, damage: 0, speed: 1 };

    const input = makeBattleInput([orc], [enemy], 65);
    input.playerFactionUpgradeIds = ['orc-seeing-red'];
    const replay = resolveBattle(input);

    expect(replay.steps.some((step) => step.kind === 'buff' && step.metadata?.sourceAbilityId === 'seeing-red' && step.message.includes('loses 1 armor'))).toBe(true);
    expect(replay.steps.some((step) => step.kind === 'buff' && step.metadata?.sourceAbilityId === 'seeing-red' && step.message.includes('gains 75 initiative'))).toBe(true);
  });

  it('first blood makes Orcs attack immediately when they engage', () => {
    const orc = resolveTroopCombatant(
      { factionUpgradeIds: ['orc-first-blood'], troopTypeUpgradeIds: [] },
      createTroopInstance('orc', 'soldier'),
      'player',
    );
    orc.quantity = 1;
    orc.stats = { ...orc.stats, damage: 5, speed: 100 };
    const enemy = makeBattleCombatant('human/soldier', 'enemy');
    enemy.stats = { ...enemy.stats, damage: 0, speed: 1, health: 100 };

    const input = makeBattleInput([orc], [enemy], 66);
    input.playerFactionUpgradeIds = ['orc-first-blood'];
    const replay = resolveBattle(input);
    const engageIndex = replay.steps.findIndex((step) => step.kind === 'engage' && step.actorIds.some((id) => id.startsWith('player_')));
    const nearbyAttacks = replay.steps
      .slice(Math.max(0, engageIndex - 3), engageIndex + 4)
      .filter((step) => step.kind === 'attack' && step.actorIds.some((id) => id.startsWith('player_')));

    expect(engageIndex).toBeGreaterThan(-1);
    expect(nearbyAttacks.length).toBeGreaterThanOrEqual(2);
    expect(nearbyAttacks.some((step) => step.index < engageIndex)).toBe(true);
    expect(nearbyAttacks.some((step) => step.index > engageIndex)).toBe(true);
  });

  it('warcry grants allied damage once per Orc on the fallen enemy hex', () => {
    const orc = resolveTroopCombatant(
      { factionUpgradeIds: ['orc-warcry'], troopTypeUpgradeIds: [] },
      createTroopInstance('orc', 'soldier'),
      'player',
    );
    orc.quantity = 1;
    orc.stats = { ...orc.stats, damage: 100, speed: 100 };
    const ally = makeBattleCombatant('human/archer', 'player');
    ally.stats = { ...ally.stats, damage: 1, speed: 1 };
    const enemy = makeBattleCombatant('human/militia', 'enemy');
    enemy.stats = { ...enemy.stats, damage: 0, speed: 1 };

    const input = makeBattleInput([orc, ally], [enemy], 67);
    input.playerFactionUpgradeIds = ['orc-warcry'];
    const replay = resolveBattle(input);
    const archerBuffs = replay.steps.filter(
      (step) => step.kind === 'buff' && step.metadata?.sourceAbilityId === 'warcry' && step.message.includes('Human Archer gains +1 damage'),
    );

    expect(archerBuffs).toHaveLength(1);
  });

  it('berserk prevents lethal damage, blocks later damage, then kills the Orc after its next turn', () => {
    const orc = resolveTroopCombatant(
      { factionUpgradeIds: ['orc-berserk'], troopTypeUpgradeIds: [] },
      createTroopInstance('orc', 'soldier'),
      'player',
    );
    orc.quantity = 1;
    orc.stats = { ...orc.stats, health: 10, damage: 0, speed: 50 };
    const enemy = makeBattleCombatant('human/archer', 'enemy');
    enemy.stats = { ...enemy.stats, damage: 50, speed: 100, range: 99 };

    const input = makeBattleInput([orc], [enemy], 68);
    input.playerFactionUpgradeIds = ['orc-berserk'];
    const replay = resolveBattle(input);
    const berserkStep = replay.steps.find((step) => step.kind === 'buff' && step.metadata?.sourceAbilityId === 'berserk');
    const zeroDamageAfterBerserk = replay.steps.find(
      (step) => step.index > (berserkStep?.index ?? 0) && step.kind === 'attack' && step.targetIds.some((id) => id.startsWith('player_')) && step.metadata?.damage === 0,
    );
    const deathStep = replay.steps.find((step) => step.kind === 'death' && step.metadata?.sourceAbilityId === 'berserk');

    expect(berserkStep?.message).toContain('goes berserk');
    expect(zeroDamageAfterBerserk).toBeTruthy();
    expect(deathStep?.message).toContain('burns out');
  });

  it('ensorcel marks a priority enemy, removes its abilities, and Fae target it in range', () => {
    const fae = resolveTroopCombatant(
      { factionUpgradeIds: ['fae-ensorcel'], troopTypeUpgradeIds: [] },
      createTroopInstance('fae', 'wizard'),
      'player',
    );
    fae.quantity = 1;
    fae.stats = { ...fae.stats, damage: 1, speed: 100, range: 99 };
    const frontline = makeBattleCombatant('human/beastmaster', 'enemy');
    frontline.stats = { ...frontline.stats, damage: 0, speed: 1 };
    const backline = makeBattleCombatant('human/wizard', 'enemy');
    backline.stats = { ...backline.stats, damage: 0, speed: 1 };

    const input = makeBattleInput([fae], [backline, frontline], 69);
    input.playerFactionUpgradeIds = ['fae-ensorcel'];
    const replay = resolveBattle(input);
    const ensorcelStep = replay.steps.find((step) => step.metadata?.sourceAbilityId === 'ensorcel');
    const firstFaeAttack = replay.steps.find((step) => step.kind === 'attack' && step.actorIds.some((id) => id.startsWith('player_')));

    expect(ensorcelStep?.message).toContain('Human Beastmaster');
    expect(replay.steps.some((step) => step.metadata?.sourceAbilityId?.startsWith('summon-wolf'))).toBe(false);
    expect(firstFaeAttack?.targetIds.map((id) => replay.steps[firstFaeAttack.index]!.snapshot.units.find((unit) => unit.id === id)?.troopLabel)).toContain('Human Beastmaster');
  });

  it('glamour redirects one incoming normal attack with the Fae as the attacker', () => {
    const fae = resolveTroopCombatant(
      { factionUpgradeIds: ['fae-glamour'], troopTypeUpgradeIds: [] },
      createTroopInstance('fae', 'wizard'),
      'player',
    );
    fae.quantity = 1;
    fae.stats = { ...fae.stats, damage: 7, speed: 1, range: 99 };
    const attacker = makeBattleCombatant('human/archer', 'enemy');
    attacker.stats = { ...attacker.stats, damage: 50, speed: 100, range: 99 };
    const bystander = makeBattleCombatant('human/soldier', 'enemy');
    bystander.stats = { ...bystander.stats, damage: 0, speed: 1 };

    const input = makeBattleInput([fae], [attacker, bystander], 70);
    input.playerFactionUpgradeIds = ['fae-glamour'];
    const replay = resolveBattle(input);
    const glamourStep = replay.steps.find((step) => step.metadata?.sourceAbilityId === 'glamour');
    const redirectedAttack = replay.steps.find((step) => step.kind === 'attack' && step.index > (glamourStep?.index ?? 0) && step.actorIds[0]?.startsWith('player_'));
    const redirectedTarget = redirectedAttack
      ? redirectedAttack.snapshot.units.find((unit) => unit.id === redirectedAttack.targetIds[0])
      : null;

    expect(glamourStep?.message).toContain('glamours');
    expect(redirectedAttack?.message).toContain('Fae Wizard hits Human');
    expect(redirectedTarget?.side).toBe('enemy');
  });

  it('changeling turns one random enemy from each enemy troop after beat 12', () => {
    const fae = resolveTroopCombatant(
      { factionUpgradeIds: ['fae-changeling'], troopTypeUpgradeIds: [] },
      createTroopInstance('fae', 'wizard'),
      'player',
    );
    fae.quantity = 1;
    fae.stats = { ...fae.stats, damage: 0, speed: 1 };
    const soldiers = makeBattleCombatant('human/soldier', 'enemy');
    soldiers.quantity = 2;
    soldiers.stats = { ...soldiers.stats, damage: 0, speed: 1 };
    const archers = makeBattleCombatant('human/archer', 'enemy');
    archers.quantity = 2;
    archers.stats = { ...archers.stats, damage: 0, speed: 1 };

    const input = makeBattleInput([fae], [soldiers, archers], 71);
    input.playerFactionUpgradeIds = ['fae-changeling'];
    const replay = resolveBattle(input);
    const changelingStep = replay.steps.find((step) => step.metadata?.sourceAbilityId === 'changeling');
    const changedUnits = changelingStep?.snapshot.units.filter((unit) => unit.side === 'player' && unit.factionId === 'human') ?? [];

    expect(changelingStep?.message).toContain('2 enemy units');
    expect(changedUnits).toHaveLength(2);
    expect(new Set(changedUnits.map((unit) => unit.unitTypeId))).toEqual(new Set(['soldier', 'archer']));
  });

  it('whimsy relocates a damaged Fae unit to a random legal hex', () => {
    const fae = resolveTroopCombatant(
      { factionUpgradeIds: ['fae-whimsy'], troopTypeUpgradeIds: [] },
      createTroopInstance('fae', 'wizard'),
      'player',
    );
    fae.quantity = 1;
    fae.stats = { ...fae.stats, damage: 0, speed: 1 };
    const enemy = makeBattleCombatant('human/archer', 'enemy');
    enemy.stats = { ...enemy.stats, damage: 10, speed: 100, range: 99 };

    const input = makeBattleInput([fae], [enemy], 72);
    input.playerFactionUpgradeIds = ['fae-whimsy'];
    const replay = resolveBattle(input);
    const whimsyStep = replay.steps.find((step) => step.kind === 'move' && step.metadata?.sourceAbilityId === 'whimsy');

    expect(whimsyStep?.message).toContain('Whimsy');
    expect(whimsyStep?.metadata?.toQ).toBeTypeOf('number');
    expect(whimsyStep?.metadata?.toR).toBeTypeOf('number');
  });

  it('executioner prioritizes the lowest-current-hp legal attack target', () => {
    const champion = resolveTroopCombatant(
      { factionUpgradeIds: [], troopTypeUpgradeIds: ['champion-executioner'] },
      createTroopInstance('human', 'champion'),
      'player',
    );
    const replay = resolveBattle(
      makeBattleInput(
        [champion],
        [makeBattleCombatant('goblin/soldier', 'enemy'), makeBattleCombatant('human/soldier', 'enemy')],
        52,
      ),
    );

    const championAttack = replay.steps.find(
      (step) => step.kind === 'attack' && step.actorIds[0]?.startsWith('player_') && step.message.includes('Human Champion hits'),
    );

    expect(championAttack?.message).toContain('Goblin Soldier');
  });

  it('shredding arrows applies a battle-long armor reduction that can go below zero', () => {
    const archer = resolveTroopCombatant(
      { factionUpgradeIds: [], troopTypeUpgradeIds: ['archer-shredding-arrows'] },
      createTroopInstance('human', 'archer'),
      'player',
    );
    const tank = makeBattleCombatant('goblin/soldier', 'enemy');
    tank.stats = { ...tank.stats, health: 200 };
    const replay = resolveBattle(makeBattleInput([archer], [tank], 19));
    const enemyArmorHistory = replay.steps
      .map((step) => step.snapshot.units.find((unit) => unit.side === 'enemy' && unit.troopLabel === 'Goblin Soldier')?.stats.armor)
      .filter((value): value is number => typeof value === 'number');

    expect(Math.min(...enemyArmorHistory)).toBeLessThan(0);
  });

  it('concussive shots resets the attacked target initiative', () => {
    const ranger = resolveTroopCombatant(
      { factionUpgradeIds: [], troopTypeUpgradeIds: ['ranger-concussive-shots'] },
      createTroopInstance('elf', 'ranger'),
      'player',
    );
    const replay = resolveBattle(makeBattleInput([ranger], [makeBattleCombatant('human/soldier', 'enemy')], 23));
    const initiativeStep = replay.steps.find((step) => step.kind === 'buff' && step.message.includes('sets initiative to 0'));

    expect(initiativeStep).toBeDefined();
    expect(initiativeStep?.message).toContain('Human Soldier');
    expect(initiativeStep?.metadata?.value).toBe(0);
  });

  it('pinning volley applies a battle-long speed reduction', () => {
    const archer = resolveTroopCombatant(
      { factionUpgradeIds: [], troopTypeUpgradeIds: ['archer-pinning-volley'] },
      createTroopInstance('human', 'archer'),
      'player',
    );
    const replay = resolveBattle(makeBattleInput([archer], [makeBattleCombatant('human/soldier', 'enemy')], 24));

    expect(replay.steps.some((step) => step.kind === 'buff' && step.message.includes('Human Soldier loses 1 speed.'))).toBe(true);
  });

  it('rabble rush grants militia initiative based on same-hex militia allies', () => {
    const militia = resolveTroopCombatant(
      { factionUpgradeIds: [], troopTypeUpgradeIds: ['militia-rabble-rush'] },
      createTroopInstance('human', 'militia'),
      'player',
    );
    const replay = resolveBattle(makeBattleInput([militia, militia], [makeBattleCombatant('human/knight', 'enemy')], 25));

    expect(replay.steps.some((step) => step.kind === 'buff' && step.message.includes('Human Militia gains 1 initiative.'))).toBe(true);
  });

  it('early riser gives necromancer skeleton summons immediate initiative', () => {
    const necromancer = resolveTroopCombatant(
      { factionUpgradeIds: [], troopTypeUpgradeIds: ['necromancer-early-riser'] },
      createTroopInstance('troll', 'necromancer'),
      'player',
    );
    const corpseSource = makeBattleCombatant('human/soldier', 'enemy');
    corpseSource.stats = { ...corpseSource.stats, health: 1 };
    const replay = resolveBattle(makeBattleInput([necromancer], [corpseSource], 45));
    const summonStep = replay.steps.find((step) => step.message.includes('summons Skeleton'));
    const summonedSkeleton = summonStep?.snapshot.units.find((unit) => unit.side === 'player' && unit.troopLabel.includes('Skeleton'));

    expect(summonedSkeleton?.initiative).toBe(100);
  });

  it('mercy before dawn saves an allied unit at 1 hp the first time it would die', () => {
    const priest = resolveTroopCombatant(
      { factionUpgradeIds: [], troopTypeUpgradeIds: ['priest-mercy-before-dawn'] },
      createTroopInstance('human', 'priest'),
      'player',
    );
    const ally = makeBattleCombatant('human/militia', 'player');
    ally.stats = { ...ally.stats, health: 1 };
    const replay = resolveBattle(makeBattleInput([priest, ally], [makeBattleCombatant('human/knight', 'enemy')], 46));

    expect(replay.steps.some((step) => step.message.includes('preserves Human Militia at 1 HP'))).toBe(true);
  });

  it('tubthumping flips harmful speed reductions into +1 speed for humans', () => {
    const archer = resolveTroopCombatant(
      { factionUpgradeIds: ['human-tubthumping'], troopTypeUpgradeIds: [] },
      createTroopInstance('human', 'archer'),
      'player',
    );
    const enemyArcher = resolveTroopCombatant(
      { factionUpgradeIds: [], troopTypeUpgradeIds: ['archer-pinning-volley'] },
      createTroopInstance('human', 'archer'),
      'enemy',
    );
    const replay = resolveBattle(makeBattleInput([archer], [enemyArcher], 48));

    expect(replay.steps.some((step) => step.kind === 'buff' && step.message.includes('Human Archer gains +1 speed.'))).toBe(true);
    expect(replay.steps.some((step) => step.kind === 'buff' && step.message.includes('Human Archer loses 1 speed.'))).toBe(false);
  });

  it('stoneblood saves trolls at 25 hp and removes regen for the rest of the battle', () => {
    const soldier = resolveTroopCombatant(
      { factionUpgradeIds: ['troll-stoneblood'], troopTypeUpgradeIds: [] },
      createTroopInstance('troll', 'soldier'),
      'player',
    );
    soldier.stats = { ...soldier.stats, health: 20 };
    const replay = resolveBattle(makeBattleInput([soldier], [makeBattleCombatant('human/knight', 'enemy')], 49));
    const stonebloodStepIndex = replay.steps.findIndex((step) => step.message.includes('refuses to fall and stays at 25 HP'));

    expect(stonebloodStepIndex).toBeGreaterThan(-1);
    expect(replay.steps[stonebloodStepIndex]?.message).toContain('25 HP');
  });

  it('zeal reacts to applied heal effects even when the heal restores 0 HP', () => {
    const priest = resolveTroopCombatant(
      { factionUpgradeIds: [], troopTypeUpgradeIds: ['priest-zeal'] },
      createTroopInstance('human', 'priest'),
      'player',
    );
    const replay = resolveBattle(
      makeBattleInput([priest, makeBattleCombatant('human/soldier', 'player')], [makeBattleCombatant('human/knight', 'enemy')], 29),
    );

    expect(replay.steps.some((step) => step.kind === 'heal' && step.message.includes('Human Priest heals Human Soldier for 0.'))).toBe(true);
    expect(replay.steps.some((step) => step.kind === 'buff' && step.message.includes('Human Soldier gains +1 speed.'))).toBe(true);
    expect(replay.steps.some((step) => step.kind === 'buff' && step.message.includes('Human Soldier gains +1 damage.'))).toBe(true);
  });

  it('serve once more reacts to both regen and other beneficial effects', () => {
    const shaman = resolveTroopCombatant(
      { factionUpgradeIds: [], troopTypeUpgradeIds: ['shaman-serve-once-more'] },
      createTroopInstance('troll', 'shaman'),
      'player',
    );
    const replay = resolveBattle(
      makeBattleInput([shaman, makeBattleCombatant('troll/soldier', 'player')], [makeBattleCombatant('human/knight', 'enemy')], 31),
    );

    expect(replay.steps.some((step) => step.kind === 'heal' && step.message.includes('Troll Shaman heals Troll Shaman for 0.'))).toBe(true);
    expect(replay.steps.some((step) => step.kind === 'buff' && step.message.includes('Troll Shaman gains Fading.'))).toBe(true);
    expect(replay.steps.some((step) => step.kind === 'buff' && step.message.includes('Troll Soldier gains Fading.'))).toBe(true);
    expect(replay.steps.some((step) => step.kind === 'buff' && step.message.includes('Troll Soldier gains On Death Summon Skeleton.'))).toBe(true);
  });

  it('militia with scurry can share a hex past saturation without changing their actual size', () => {
    const militia = resolveTroopCombatant(
      { factionUpgradeIds: [], troopTypeUpgradeIds: ['militia-scurry'] },
      createTroopInstance('human', 'militia'),
      'player',
    );
    const soldier = makeBattleCombatant('human/soldier', 'player');
    const replay = resolveBattle({
      seed: 37,
      riftId: null,
      tier: null,
      mutatorIds: [],
      saturation: 1,
      playerCombatants: [militia, soldier],
      enemyCombatants: [],
    });

    const playerUnits = replay.initial.units.filter((unit) => unit.side === 'player');
    const sizeByHex = playerUnits.reduce<Record<string, number>>((acc, unit) => {
      const key = `${unit.position.q},${unit.position.r}`;
      acc[key] = (acc[key] ?? 0) + unit.stats.size;
      return acc;
    }, {});

    expect(playerUnits.length).toBeGreaterThan(2);
    expect(playerUnits.filter((unit) => unit.troopLabel === 'Human Militia').every((unit) => unit.stats.size === 1)).toBe(true);
    expect(Object.values(sizeByHex).some((size) => size > replay.saturation)).toBe(true);
  });

  it('alternate fuel can substitute health for missing corpses, but never fatally', () => {
    const upgradedNecromancer = resolveTroopCombatant(
      { factionUpgradeIds: [], troopTypeUpgradeIds: ['necromancer-alternate-fuel'] },
      createTroopInstance('troll', 'necromancer'),
      'player',
    );
    const replay = resolveBattle(makeBattleInput([upgradedNecromancer], [makeBattleCombatant('troll/skeleton', 'enemy')], 43));

    expect(replay.steps.some((step) => step.message.includes('spends 10 health instead of a corpse'))).toBe(true);
    expect(replay.steps.some((step) => step.message.includes('summons Skeleton'))).toBe(true);

    const fragileNecromancer = makeBattleCombatant('troll/necromancer', 'player', [getAbility('alternate-fuel-10')]);
    const fragileSkeleton = makeBattleCombatant('troll/skeleton', 'enemy');
    fragileNecromancer.stats = { ...fragileNecromancer.stats, health: 10 };
    fragileSkeleton.stats = { ...fragileSkeleton.stats, health: 1 };

    const fragileReplay = resolveBattle(makeBattleInput([fragileNecromancer], [fragileSkeleton], 44));

    expect(fragileReplay.steps.some((step) => step.message.includes('spends 10 health instead of a corpse'))).toBe(false);
    expect(fragileReplay.steps.some((step) => step.message.includes('summons Skeleton'))).toBe(false);
  });

  it('retaliate only answers normal attacks once instead of looping indefinitely', () => {
    const knightA = resolveTroopCombatant(
      { factionUpgradeIds: [], troopTypeUpgradeIds: ['knight-retaliate'] },
      createTroopInstance('human', 'knight'),
      'player',
    );
    const knightB = resolveTroopCombatant(
      { factionUpgradeIds: [], troopTypeUpgradeIds: ['knight-retaliate'] },
      createTroopInstance('human', 'knight'),
      'enemy',
    );
    const replay = resolveBattle(makeBattleInput([knightA], [knightB], 47));
    const retaliationCount = replay.steps.filter((step) => step.kind === 'attack' && step.metadata?.category === 'retaliation').length;
    const normalCount = replay.steps.filter((step) => step.kind === 'attack' && step.metadata?.category === 'normal').length;

    expect(retaliationCount).toBeGreaterThan(0);
    expect(retaliationCount).toBeLessThanOrEqual(normalCount);
  });

  it('mitosis grants recursively summoned elementals the split ability', () => {
    const elementalist = resolveTroopCombatant(
      { factionUpgradeIds: [], troopTypeUpgradeIds: ['elementalist-mitosis'] },
      createTroopInstance('elf', 'elementalist'),
      'player',
    );
    const replay = resolveBattle(
      makeBattleInput([elementalist, makeBattleCombatant('human/knight', 'player')], [makeBattleCombatant('human/knight', 'enemy')], 59),
    );
    const elementalSummons = replay.steps.filter((step) => step.message.includes('summons Elemental'));
    const elementalProfile = replay.troopProfiles.find((profile) => profile.side === 'player' && profile.troopLabel === 'Elemental');

    expect(elementalSummons.length).toBeGreaterThanOrEqual(2);
    expect(elementalProfile?.abilities.map((ability) => ability.id)).toContain('charge-4-uses-1-summon-elemental');
  });

  it('overflowing grace grants initiative when a priest heal tops an ally off', () => {
    const priest = resolveTroopCombatant(
      { factionUpgradeIds: [], troopTypeUpgradeIds: ['priest-overflowing-grace'] },
      createTroopInstance('human', 'priest'),
      'player',
    );
    const ally = makeBattleCombatant('human/soldier', 'player');
    ally.stats = { ...ally.stats, health: ally.stats.health - 4 };
    const replay = resolveBattle(makeBattleInput([priest, ally], [makeBattleCombatant('human/knight', 'enemy')], 71));

    expect(replay.steps.some((step) => step.metadata?.sourceAbilityId === 'overflowing-grace')).toBe(true);
  });

  it('rowdy regrowth triggers from non-regen healing', () => {
    const trollSoldier = resolveTroopCombatant(
      { factionUpgradeIds: ['troll-rowdy-regrowth'], troopTypeUpgradeIds: [] },
      createTroopInstance('troll', 'soldier'),
      'player',
    );
    trollSoldier.stats = { ...trollSoldier.stats, health: trollSoldier.stats.health - 4 };
    const priest = makeBattleCombatant('human/priest', 'player');
    const replay = resolveBattle(makeBattleInput([priest, trollSoldier], [makeBattleCombatant('human/knight', 'enemy')], 72));

    expect(replay.steps.some((step) => step.metadata?.sourceAbilityId === 'rowdy-regrowth')).toBe(true);
  });

  it('bramble snare stacks once per shapeshift, including true form', () => {
    const druid = resolveTroopCombatant(
      { factionUpgradeIds: [], troopTypeUpgradeIds: ['druid-true-form', 'druid-bramble-snare'] },
      createTroopInstance('elf', 'druid'),
      'player',
    );
    druid.quantity = 1;
    const replay = resolveBattle(makeBattleInput([druid, makeBattleCombatant('human/soldier', 'player')], [makeBattleCombatant('human/knight', 'enemy')], 73));

    expect(replay.steps.filter((step) => step.message.includes('empowers Bramble Snare')).length).toBe(2);
  });

  it('silver distance strips initiative on max-range elven attacks', () => {
    const archer = resolveTroopCombatant(
      { factionUpgradeIds: ['elf-silver-distance'], troopTypeUpgradeIds: [] },
      createTroopInstance('elf', 'archer'),
      'player',
    );
    const replay = resolveBattle(makeBattleInput([archer], [makeBattleCombatant('human/soldier', 'enemy')], 74));

    expect(replay.steps.some((step) => step.metadata?.sourceAbilityId === 'silver-distance')).toBe(true);
  });

  it('sentinel runes triggers on knight death if no enemy left its hex first', () => {
    const knight = resolveTroopCombatant(
      { factionUpgradeIds: [], troopTypeUpgradeIds: ['knight-sentinel-runes'] },
      createTroopInstance('human', 'knight'),
      'player',
    );
    knight.stats = { ...knight.stats, health: 1 };
    const replay = resolveBattle(makeBattleInput([knight], [makeBattleCombatant('human/champion', 'enemy')], 75));

    expect(replay.steps.some((step) => step.metadata?.sourceAbilityId === 'sentinel-runes')).toBe(true);
    expect(replay.steps.filter((step) => step.message.includes('summons Elemental')).length).toBeGreaterThanOrEqual(1);
  });

  it("scavenger's hunger consumes early ranger kills into wolf summons", () => {
    const ranger = resolveTroopCombatant(
      { factionUpgradeIds: [], troopTypeUpgradeIds: ['ranger-scavengers-hunger'] },
      createTroopInstance('elf', 'ranger'),
      'player',
    );
    const enemy = makeBattleCombatant('human/militia', 'enemy');
    enemy.stats = { ...enemy.stats, health: 1 };
    const replay = resolveBattle(makeBattleInput([ranger], [enemy], 76));

    expect(replay.steps.some((step) => step.metadata?.sourceAbilityId === 'scavengers-hunger')).toBe(true);
    expect(replay.steps.some((step) => step.message.includes('summons Wolf'))).toBe(true);
  });

  it('lightning rods adds a start-of-battle elemental summon to wizards', () => {
    const wizard = resolveTroopCombatant(
      { factionUpgradeIds: [], troopTypeUpgradeIds: ['wizard-lightning-rods'] },
      createTroopInstance('goblin', 'wizard'),
      'player',
    );
    const replay = resolveBattle(makeBattleInput([wizard], [makeBattleCombatant('human/soldier', 'enemy')], 77));

    expect(replay.steps.some((step) => step.metadata?.sourceAbilityId === 'summon-elemental-1')).toBe(true);
  });

  it('thrill of the hunt still buffs wolves even when no beastmaster is present', () => {
    const wolf = makeBattleCombatant('human/wolf', 'player');
    const enemy = makeBattleCombatant('human/militia', 'enemy');
    enemy.stats = { ...enemy.stats, health: 1 };
    const replay = resolveBattle({
      seed: 78,
      riftId: null,
      tier: null,
      mutatorIds: [],
      playerTroopTypeUpgradeIds: ['beastmaster-thrill-of-the-hunt'],
      playerCombatants: [wolf],
      enemyCombatants: [enemy],
    });

    expect(replay.steps.some((step) => step.metadata?.sourceAbilityId === 'thrill-of-the-hunt')).toBe(true);
  });
});
