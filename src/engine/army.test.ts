import { describe, expect, it } from 'vitest';
import { createTroopInstance, getResolvedStatBreakdowns, resolveEnemyCombatant, resolveTroopCombatant } from './army';
import { composeBaseTroopDefinition, getTroopQuantityForCost } from './unitCatalog';

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

  it('explains enemy tier scaling at 10 percent per tier past the first and no longer references stat purchases', () => {
    const breakdowns = getResolvedStatBreakdowns(
      { factionUpgradeIds: ['elven-eyes'], troopTypeUpgradeIds: [] },
      createTroopInstance('elf', 'archer'),
      'enemy',
      3,
    );
    const enemy = resolveEnemyCombatant([], [], 'human', 'soldier', 3, 'enemy-1');

    expect(breakdowns.damage.lines.map((line) => line.label)).toEqual(['Archer base', 'Elves', 'Enemy Rift Tier 3']);
    expect(breakdowns.range.lines.map((line) => line.label)).toEqual(['Archer base', 'Elves', 'Elven Eyes']);

    expect(enemy.stats.health).toBe(132);
    expect(enemy.stats.damage).toBe(13.2);
    expect(enemy.stats.speed).toBe(13.2);
  });
});
