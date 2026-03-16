import { describe, expect, it } from 'vitest';
import { createTroopInstance, getResolvedStatBreakdowns, resolveTroopCombatant } from './army';
import { composeBaseTroopDefinition } from './unitCatalog';

describe('range adjustments', () => {
  it('does not apply faction range bonuses to melee units', () => {
    expect(composeBaseTroopDefinition('elf', 'soldier').stats.range).toBe(0);
  });

  it('does not apply faction range penalties to melee units', () => {
    expect(composeBaseTroopDefinition('goblin', 'soldier').stats.range).toBe(0);
  });

  it('still applies faction range changes to non-melee units', () => {
    expect(composeBaseTroopDefinition('elf', 'archer').stats.range).toBe(3);
    expect(composeBaseTroopDefinition('goblin', 'wizard').stats.range).toBe(1);
  });

  it('does not apply range stat modifiers to melee units with non-melee-only upgrades', () => {
    const troop = createTroopInstance('elf', 'soldier', 0);
    const resolved = resolveTroopCombatant({ factionUpgradeIds: ['elven-eyes'] }, troop, 'player');

    expect(resolved.stats.range).toBe(0);
  });

  it('explains stat sources across baseline, faction, troop upgrades, faction upgrades, and enemy tier scaling', () => {
    const troop = createTroopInstance('elf', 'archer', 0);
    troop.statUpgradeLevels.range = 2;
    const breakdowns = getResolvedStatBreakdowns({ factionUpgradeIds: ['elven-eyes'] }, troop, 'enemy', 3);

    expect(breakdowns.range.lines.map((line) => line.label)).toEqual(['Archer base', 'Elves', 'Purchased range upgrades x2', 'Elven Eyes']);
    expect(breakdowns.damage.lines.map((line) => line.label)).toEqual(['Archer base', 'Elves', 'Enemy Rift Tier 3']);
  });
});
