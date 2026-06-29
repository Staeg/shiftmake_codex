import { describe, expect, it } from 'vitest';
import { createTroopInstance, getResolvedStatBreakdowns, getTroopQuantityBreakdown, resolveEnemyCombatant, resolveTroopCombatant } from './army';
import { composeBaseTroopDefinition, getAbility, getRaceNativeTroopUnlockIds, getSummonedUnitPreviews, getTroopQuantityForCost, isNativeTroopUnlockId } from './unitCatalog';

describe('troop composition', () => {
  it('derives troop quantity from 120 divided by resolved troop cost', () => {
    const humanSoldier = composeBaseTroopDefinition('human', 'soldier');
    const goblinSoldier = composeBaseTroopDefinition('goblin', 'soldier');
    const humanChampion = composeBaseTroopDefinition('human', 'champion');

    expect(humanSoldier.cost).toBe(24);
    expect(humanSoldier.quantity).toBe(getTroopQuantityForCost(humanSoldier.cost));
    expect(humanSoldier.quantity).toBe(5);

    expect(goblinSoldier.cost).toBe(12);
    expect(goblinSoldier.quantity).toBe(getTroopQuantityForCost(goblinSoldier.cost));
    expect(goblinSoldier.quantity).toBe(10);

    expect(humanChampion.quantity).toBe(2);
  });

  it('keeps non-goblin troop costs at their default values and only halves goblin costs', () => {
    expect(composeBaseTroopDefinition('human', 'soldier').cost).toBe(24);
    expect(composeBaseTroopDefinition('elf', 'soldier').cost).toBe(24);
    expect(composeBaseTroopDefinition('troll', 'soldier').cost).toBe(24);
    expect(composeBaseTroopDefinition('goblin', 'soldier').cost).toBe(12);
  });

  it('explains goblin quantity as a cost-to-quantity modifier', () => {
    const breakdown = getTroopQuantityBreakdown(createTroopInstance('goblin', 'druid'));

    expect(breakdown.finalValue).toBe(composeBaseTroopDefinition('goblin', 'druid').quantity);
    expect(breakdown.lines.map((line) => line.label)).toContain('Goblins Cost x0.5 -> quantity x2');
  });

  it('maps summon abilities to inspectable summoned profiles including upgraded grants', () => {
    const wolf = getSummonedUnitPreviews(getAbility('summon-wolf-2'), 'goblin')[0]!;
    const skeleton = getSummonedUnitPreviews(getAbility('corpse-summon-skeleton-rising'), 'troll')[0]!;
    const elemental = getSummonedUnitPreviews(getAbility('charge-4-summon-elemental-mitosis'), 'elf')[0]!;

    expect(wolf.troop.unitClassId).toBe('wolf');
    expect(skeleton.troop.abilities.map((ability) => ability.id)).toContain('heal-ally-0-7');
    expect(elemental.troop.abilities.map((ability) => ability.id)).toContain('charge-4-uses-1-summon-elemental');
  });

  it('does not include Troll Soldiers in the Troll native troop pool', () => {
    expect(getRaceNativeTroopUnlockIds('troll')).not.toContain('troll/soldier');
    expect(isNativeTroopUnlockId('troll/soldier')).toBe(false);
  });

  it('does not apply race range bonuses or penalties to melee units', () => {
    expect(composeBaseTroopDefinition('elf', 'soldier').stats.range).toBe(0);
    expect(composeBaseTroopDefinition('goblin', 'soldier').stats.range).toBe(0);
  });

  it('still applies race range changes to non-melee units and non-melee-only upgrades', () => {
    expect(composeBaseTroopDefinition('elf', 'archer').stats.range).toBe(6);
    expect(composeBaseTroopDefinition('goblin', 'wizard').stats.range).toBe(4);

    const soldier = createTroopInstance('elf', 'soldier');
    const archer = createTroopInstance('elf', 'archer');
    const soldierResolved = resolveTroopCombatant({ raceUpgradeIds: ['elf-elven-reflexes'], troopClassUpgradeIds: [] }, soldier, 'player');
    const archerResolved = resolveTroopCombatant({ raceUpgradeIds: ['elf-elven-reflexes'], troopClassUpgradeIds: [] }, archer, 'player');

    expect(soldierResolved.stats.range).toBe(0);
    expect(archerResolved.stats.range).toBe(8);
  });

  it('does not grant backline-only Feline Grace abilities to Elven Champions', () => {
    const champion = createTroopInstance('elf', 'champion');
    const championResolved = resolveTroopCombatant({ raceUpgradeIds: ['elf-elven-reflexes'], troopClassUpgradeIds: [] }, champion, 'player');

    expect(championResolved.stats.range).toBe(0);
    expect(championResolved.abilities.map((ability) => ability.id)).not.toContain('fade-into-shadow');
  });

  it('uses the same detailed upgrade pass for resolved combatants and standalone stat breakdowns', () => {
    const state = {
      raceUpgradeIds: ['elf-elven-reflexes'],
      troopClassUpgradeIds: ['archer-crippling-shots'],
    };
    const troop = createTroopInstance('elf', 'archer');
    const resolved = resolveTroopCombatant(state, troop, 'player');
    const breakdowns = getResolvedStatBreakdowns(state, troop, 'player');

    expect(resolved.statBreakdowns).toEqual(breakdowns);
    expect(resolved.statBreakdowns.range.finalValue).toBe(resolved.stats.range);
    expect(resolved.statBreakdowns.damage.finalValue).toBe(resolved.stats.damage);
    expect(resolved.abilities.map((ability) => ability.id)).toContain('pinning-volley');
  });

  it('only applies enemy stat scaling at tier 4 and leaves tier 3 at base stats', () => {
    const humanSoldierBase = composeBaseTroopDefinition('human', 'soldier');
    const tier3Breakdowns = getResolvedStatBreakdowns(
      { raceUpgradeIds: ['elf-elven-reflexes'], troopClassUpgradeIds: [] },
      createTroopInstance('elf', 'archer'),
      'enemy',
      3,
    );
    const tier3Enemy = resolveEnemyCombatant([], [], 'human', 'soldier', 3, 'enemy-1');
    const tier4Breakdowns = getResolvedStatBreakdowns(
      { raceUpgradeIds: ['elf-elven-reflexes'], troopClassUpgradeIds: [] },
      createTroopInstance('elf', 'archer'),
      'enemy',
      4,
    );
    const tier4Enemy = resolveEnemyCombatant([], [], 'human', 'soldier', 4, 'enemy-2');

    expect(tier3Breakdowns.damage.lines.map((line) => line.label)).toEqual(['Archer base', 'Elves']);
    expect(tier3Breakdowns.range.lines.map((line) => line.label)).toEqual(['Archer base', 'Elves', 'Feline Grace']);
    expect(tier4Breakdowns.damage.lines.map((line) => line.label)).toEqual(['Archer base', 'Elves', 'Enemy Rift Tier 4']);

    expect(tier3Enemy.stats.health).toBe(humanSoldierBase.stats.health);
    expect(tier3Enemy.stats.damage).toBe(humanSoldierBase.stats.damage);
    expect(tier3Enemy.stats.speed).toBe(humanSoldierBase.stats.speed);

    expect(tier4Enemy.stats.health).toBe(humanSoldierBase.stats.health * 1.2);
    expect(tier4Enemy.stats.damage).toBe(humanSoldierBase.stats.damage * 1.2);
    expect(tier4Enemy.stats.speed).toBe(humanSoldierBase.stats.speed * 1.2);
  });
});
