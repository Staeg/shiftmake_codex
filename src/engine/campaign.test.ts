import { describe, expect, it } from 'vitest';
import { createTroopInstance, getAvailableFactionTroopUnlocks, getTroopAddUnitCost, getTroopUnlockCost } from './army';
import { generateCycleRifts, getEnemyUnitBudgetCost } from './rift';
import { chooseStartingFaction, claimRewardChoice, startNewGame, unlockTroopType } from './game';

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

  it('keeps tier 1 Rift enemy budget spend within explicit per-mutator bands', () => {
    const defaultBand = { min: 80, max: 161 };
    const budgetAffectingBands = {
      outpost: { min: 77.33, max: 156 },
      quagmire: { min: 36, max: 144 },
      rich: { min: 130, max: 240 },
    } as const;

    const seenBudgetAffectingMutators = new Set<keyof typeof budgetAffectingBands>();

    for (let campaignSeed = 1; campaignSeed <= 200; campaignSeed += 1) {
      for (let cycleNumber = 1; cycleNumber <= 5; cycleNumber += 1) {
        const rifts = generateCycleRifts({ campaignSeed, cycleNumber }).filter((rift) => rift.tier === 1);

        rifts.forEach((rift) => {
          const mutatorId = rift.mutatorIds[0];
          const expected = budgetAffectingBands[mutatorId as keyof typeof budgetAffectingBands] ?? defaultBand;
          const spentBudget = rift.enemyArmy.reduce(
            (sum, troop) => sum + troop.quantity * getEnemyUnitBudgetCost(troop.factionId, troop.unitTypeId),
            0,
          );

          if (mutatorId in budgetAffectingBands) {
            seenBudgetAffectingMutators.add(mutatorId as keyof typeof budgetAffectingBands);
          }
          expect(spentBudget).toBeGreaterThanOrEqual(expected.min);
          expect(spentBudget).toBeLessThanOrEqual(expected.max);
        });
      }
    }

    expect([...seenBudgetAffectingMutators].sort()).toEqual(Object.keys(budgetAffectingBands).sort());
  });

  it('only offers troop unlocks from the faction roster', () => {
    const state = chooseStartingFaction(startNewGame(7), 'troll');
    expect(getAvailableFactionTroopUnlocks(state, 'troll')).toEqual(['avenger', 'champion', 'shaman']);

    const afterInvalidUnlock = unlockTroopType(state, 'troll', 'wizard');
    expect(afterInvalidUnlock).toEqual(state);
  });

  it('does not surcharge the first non-starting troop unlock for factions with non-soldier starters', () => {
    const elfState = chooseStartingFaction(startNewGame(8), 'elf');
    const goblinState = chooseStartingFaction(startNewGame(9), 'goblin');
    const trollState = chooseStartingFaction(startNewGame(10), 'troll');

    expect(getTroopUnlockCost(elfState, 'elf', 'druid')).toBe(80);
    expect(getTroopUnlockCost(elfState, 'elf', 'wizard')).toBe(60);
    expect(getTroopUnlockCost(goblinState, 'goblin', 'shaman')).toBe(60);
    expect(getTroopUnlockCost(goblinState, 'goblin', 'wizard')).toBe(60);
    expect(getTroopUnlockCost(trollState, 'troll', 'shaman')).toBe(60);
  });

  it('cheat blueprints unlock blueprint troop rewards from the start', () => {
    const state = chooseStartingFaction(startNewGame(11, { cheatBlueprints: true }), 'troll');

    expect(state.unlockedBlueprintTroopIds).toContain('troll/necromancer');
    expect(state.unlockedBlueprintTroopIds).toContain('troll/knight');
    expect(getAvailableFactionTroopUnlocks(state, 'troll')).toEqual(['avenger', 'champion', 'shaman', 'necromancer', 'knight']);
  });

  it('claiming a blueprint reward makes that troop type unlockable instead of granting it for free', () => {
    const state = chooseStartingFaction(startNewGame(12), 'elf');
    const rewarded = claimRewardChoice(
      {
        ...state,
        phase: 'reward_claims',
        pendingRewardChoices: [
          {
            id: 'reward-1',
            riftId: 'rift-1',
            title: 'Choose a blueprint',
            kind: 'blueprint',
            optionTroopUnlockIds: ['elf/elementalist', 'elf/ranger'],
          },
        ],
      },
      'reward-1',
      'elf/elementalist',
    );

    expect(rewarded.unlockedBlueprintTroopIds).toContain('elf/elementalist');
    expect(rewarded.troops.some((troop) => troop.factionId === 'elf' && troop.unitTypeId === 'elementalist')).toBe(false);
    expect(getAvailableFactionTroopUnlocks(rewarded, 'elf')).toContain('elementalist');
  });

  it('cheat resources starts the campaign with bonus gold and essence', () => {
    const state = startNewGame(13, { cheatResources: true });

    expect(state.resources).toEqual({ gold: 1120, essence: 1120 });
  });
});
