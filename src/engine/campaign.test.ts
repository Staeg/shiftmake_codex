import { describe, expect, it } from 'vitest';
import { createTroopInstance, getAvailableFactionTroopUnlocks, getTroopAddUnitCost } from './army';
import { generateCycleRifts, getEnemyUnitBudgetCost } from './rift';
import { startNewGame, chooseStartingFaction, unlockTroopType } from './game';

describe('campaign balance helpers', () => {
  it('prices added units as the next step in the troop curve', () => {
    const trollSoldiers = createTroopInstance('troll', 'soldier', 1);
    expect(getTroopAddUnitCost(trollSoldiers)).toBe(26);

    const trollChampions = createTroopInstance('troll', 'champion', 1);
    expect(getTroopAddUnitCost(trollChampions)).toBe(78);
  });

  it('uses per-starting-unit troop value for enemy budgeting', () => {
    expect(getEnemyUnitBudgetCost('goblin', 'soldier')).toBe(8);
    expect(getEnemyUnitBudgetCost('goblin', 'champion')).toBe(24);
  });

  it('gives each Rift as many mutators as its tier', () => {
    const rifts = generateCycleRifts({
      campaignSeed: 12345,
      cycleNumber: 1,
    });

    expect(rifts.map((rift) => rift.mutatorIds.length)).toEqual(rifts.map((rift) => rift.tier));
  });

  it('keeps tier 1 Rift enemy counts close to the 150-budget spec', () => {
    const rifts = generateCycleRifts({
      campaignSeed: 12345,
      cycleNumber: 1,
    }).filter((rift) => rift.tier === 1);

    rifts.forEach((rift) => {
      const totalUnits = rift.enemyArmy.reduce((sum, troop) => sum + troop.quantity, 0);
      expect(totalUnits).toBeLessThan(20);
    });
  });

  it('only offers troop unlocks from the faction roster', () => {
    const state = chooseStartingFaction(startNewGame(7), 'troll');
    expect(getAvailableFactionTroopUnlocks(state, 'troll')).toEqual(['champion']);

    const afterInvalidUnlock = unlockTroopType(state, 'troll', 'wizard');
    expect(afterInvalidUnlock).toEqual(state);
  });
});
