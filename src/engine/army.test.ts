import { describe, expect, it } from 'vitest';
import { createTroopInstance, getResolvedStatBreakdowns, resolveEnemyCombatant, resolveTroopCombatant } from './army';
import { composeBaseTroopDefinition, getFactionNativeTroopUnlockIds, getTroopQuantityForCost, isNativeTroopUnlockId } from './unitCatalog';

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

  it('does not include Troll Soldiers in the Troll native troop pool', () => {
    expect(getFactionNativeTroopUnlockIds('troll')).not.toContain('troll/soldier');
    expect(isNativeTroopUnlockId('troll/soldier')).toBe(false);
  });

  it('does not apply faction range bonuses or penalties to melee units', () => {
    expect(composeBaseTroopDefinition('elf', 'soldier').stats.range).toBe(0);
    expect(composeBaseTroopDefinition('goblin', 'soldier').stats.range).toBe(0);
  });

  it('still applies faction range changes to non-melee units and non-melee-only upgrades', () => {
    expect(composeBaseTroopDefinition('elf', 'archer').stats.range).toBe(3);
    expect(composeBaseTroopDefinition('goblin', 'wizard').stats.range).toBe(1);

    const soldier = createTroopInstance('elf', 'soldier');
    const archer = createTroopInstance('elf', 'archer');
    const soldierResolved = resolveTroopCombatant({ factionUpgradeIds: ['elven-eyes'], troopTypeUpgradeIds: [] }, soldier, 'player');
    const archerResolved = resolveTroopCombatant({ factionUpgradeIds: ['elven-eyes'], troopTypeUpgradeIds: [] }, archer, 'player');

    expect(soldierResolved.stats.range).toBe(0);
    expect(archerResolved.stats.range).toBe(4);
  });

  it('only applies enemy stat scaling at tier 4 and leaves tier 3 at base stats', () => {
    const humanSoldierBase = composeBaseTroopDefinition('human', 'soldier');
    const tier3Breakdowns = getResolvedStatBreakdowns(
      { factionUpgradeIds: ['elven-eyes'], troopTypeUpgradeIds: [] },
      createTroopInstance('elf', 'archer'),
      'enemy',
      3,
    );
    const tier3Enemy = resolveEnemyCombatant([], [], 'human', 'soldier', 3, 'enemy-1');
    const tier4Breakdowns = getResolvedStatBreakdowns(
      { factionUpgradeIds: ['elven-eyes'], troopTypeUpgradeIds: [] },
      createTroopInstance('elf', 'archer'),
      'enemy',
      4,
    );
    const tier4Enemy = resolveEnemyCombatant([], [], 'human', 'soldier', 4, 'enemy-2');

    expect(tier3Breakdowns.damage.lines.map((line) => line.label)).toEqual(['Archer base', 'Elves']);
    expect(tier3Breakdowns.range.lines.map((line) => line.label)).toEqual(['Archer base', 'Elves', 'Elven Eyes']);
    expect(tier4Breakdowns.damage.lines.map((line) => line.label)).toEqual(['Archer base', 'Elves', 'Enemy Rift Tier 4']);

    expect(tier3Enemy.stats.health).toBe(humanSoldierBase.stats.health);
    expect(tier3Enemy.stats.damage).toBe(humanSoldierBase.stats.damage);
    expect(tier3Enemy.stats.speed).toBe(humanSoldierBase.stats.speed);

    expect(tier4Enemy.stats.health).toBe(humanSoldierBase.stats.health * 1.2);
    expect(tier4Enemy.stats.damage).toBe(humanSoldierBase.stats.damage * 1.2);
    expect(tier4Enemy.stats.speed).toBe(humanSoldierBase.stats.speed * 1.2);
  });
});
