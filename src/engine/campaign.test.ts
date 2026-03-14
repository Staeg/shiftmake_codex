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

  it('always generates four Rifts per cycle', () => {
    const rifts = generateCycleRifts({
      campaignSeed: 12345,
      cycleNumber: 1,
    });

    expect(rifts).toHaveLength(4);
  });

  it('gives each Rift exactly one mutator', () => {
    const rifts = generateCycleRifts({
      campaignSeed: 12345,
      cycleNumber: 3,
    });

    expect(rifts.map((rift) => rift.mutatorIds.length)).toEqual([1, 1, 1, 1]);
  });

  it('keeps tier 1 Rift enemy budget spend within the expected band', () => {
    const rifts = generateCycleRifts({
      campaignSeed: 12345,
      cycleNumber: 1,
    }).filter((rift) => rift.tier === 1);

    rifts.forEach((rift) => {
      const spentBudget = rift.enemyArmy.reduce(
        (sum, troop) => sum + troop.quantity * getEnemyUnitBudgetCost(troop.factionId, troop.unitTypeId),
        0,
      );
      expect(spentBudget).toBeGreaterThanOrEqual(75);
      expect(spentBudget).toBeLessThanOrEqual(170);
    });
  });

  it('only offers troop unlocks from the faction roster', () => {
    const state = chooseStartingFaction(startNewGame(7), 'troll');
    expect(getAvailableFactionTroopUnlocks(state, 'troll')).toEqual(['avenger', 'champion', 'shaman']);

    const afterInvalidUnlock = unlockTroopType(state, 'troll', 'wizard');
    expect(afterInvalidUnlock).toEqual(state);
  });
});
