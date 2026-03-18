import { describe, expect, it } from 'vitest';
import { createTroopInstance, getAvailableFactionTroopUnlocks, getTroopAddUnitCost, getTroopUnlockCost } from './army';
import { generateCycleRifts, getEnemyUnitBudgetCost } from './rift';
import { applyCycleOutcomes, buyTroopTypeUpgrade, chooseStartingFaction, claimRewardChoice, deserializeGameState, serializeGameState, startNewGame, unlockTroopType } from './game';
import { getPurchasableFactionUpgrades, getPurchasableTroopTypeUpgrades } from './upgrades';

describe('campaign balance helpers', () => {
  it('prices added units as the next step in the troop curve', () => {
    const trollSoldiers = createTroopInstance('troll', 'soldier', 1);
    expect(getTroopAddUnitCost({ troopTypeUpgradeIds: [] }, trollSoldiers)).toBe(31.2);

    const trollChampions = createTroopInstance('troll', 'champion', 1);
    expect(getTroopAddUnitCost({ troopTypeUpgradeIds: [] }, trollChampions)).toBe(78);
  });

  it('uses per-starting-unit troop value for enemy budgeting', () => {
    expect(getEnemyUnitBudgetCost('goblin', 'soldier')).toBe(9.6);
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
    const defaultBand = { min: 75, max: 161 };
    const budgetAffectingBands = {
      outpost: { min: 66, max: 156 },
      quagmire: { min: 36, max: 156 },
      rich: { min: 108, max: 241 },
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

    expect(getTroopUnlockCost(elfState, 'elf', 'druid')).toBe(100);
    expect(getTroopUnlockCost(elfState, 'elf', 'wizard')).toBe(100);
    expect(getTroopUnlockCost(goblinState, 'goblin', 'shaman')).toBe(100);
    expect(getTroopUnlockCost(goblinState, 'goblin', 'wizard')).toBe(100);
    expect(getTroopUnlockCost(trollState, 'troll', 'shaman')).toBe(100);
  });

  it('scales troop unlock cost by total currently unlocked troops', () => {
    const startingState = {
      ...chooseStartingFaction(startNewGame(14), 'human'),
      resources: { gold: 1000, essence: 1000 },
    };
    const withSecondTroop = unlockTroopType(startingState, 'human', 'archer');
    const withThirdTroop = unlockTroopType(withSecondTroop, 'human', 'knight');

    expect(getTroopUnlockCost(startingState, 'human', 'knight')).toBe(100);
    expect(getTroopUnlockCost(withSecondTroop, 'human', 'priest')).toBe(200);
    expect(getTroopUnlockCost(withThirdTroop, 'human', 'priest')).toBe(300);
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

  it('cheat upgrades unlocks upgrade purchases without granting ownership immediately', () => {
    const state = chooseStartingFaction(startNewGame(18, { cheatUpgrades: true }), 'human');

    expect(state.factionUpgradeIds).toEqual([]);
    expect(state.troopTypeUpgradeIds).toEqual([]);
    expect(getPurchasableFactionUpgrades(state, 'human')).toEqual(['human-united', 'human-combined-arms']);
    expect(getPurchasableTroopTypeUpgrades(state, 'soldier')).toContain('soldier-just-a-bunch-of-guys');
  });

  it('archives defeats in the replay index while keeping the troop in recovery', () => {
    const state = chooseStartingFaction(startNewGame(19), 'human');
    const troop = state.troops[0]!;
    const riftId = state.openRifts[0]!.id;

    const { nextState } = applyCycleOutcomes(state, {
      records: [
        {
          riftId,
          assignedTroopIds: [troop.id],
          battleInput: {
            seed: 19,
            riftId,
            tier: 1,
            mutatorIds: [],
            playerCombatants: [],
            enemyCombatants: [],
          },
          replay: {
            id: 'replay-defeat-1',
            seed: 19,
            riftId,
            tier: 1,
            mutatorIds: [],
            mapRadius: 3,
            saturation: 1,
            initial: { units: [] },
            steps: [],
            outcome: 'defeat',
            troopLabels: {},
            troopProfiles: [],
            aliveCounts: [{ player: 0, enemy: 1, byTroopLabel: {} }],
            summary: {
              playerTroops: ['Human Soldier 1'],
              enemyTroops: ['Enemy Troop'],
              finalPlayerAlive: 0,
              finalEnemyAlive: 1,
            },
          },
          outcome: 'defeat',
          rewardPackage: {
            resources: { gold: 0, essence: 0 },
            upgradeChoiceBatches: 0,
            blueprintChoiceCountByTier: [],
            summaryParts: [],
          },
          recoveryMap: { [troop.id]: 2 },
        },
      ],
    });

    expect(nextState.replayIndex[0]?.summary).toBe('DEFEAT 0-1');
    expect(nextState.replayIndex[0]?.outcome).toBe('defeat');
    expect(nextState.troops.find((entry) => entry.id === troop.id)?.recoveryCyclesRemaining).toBeGreaterThan(0);
  });

  it('purchases troop-type upgrades once and persists them through save round-trips', () => {
    const state = {
      ...chooseStartingFaction(startNewGame(15), 'human'),
      resources: { gold: 1000, essence: 1000 },
    };

    const upgraded = buyTroopTypeUpgrade(state, 'archer-shredding-arrows');
    const loaded = deserializeGameState(serializeGameState(upgraded));

    expect(upgraded.troopTypeUpgradeIds).toContain('archer-shredding-arrows');
    expect(loaded.ok).toBe(true);
    expect(loaded.state?.troopTypeUpgradeIds).toContain('archer-shredding-arrows');
  });

  it('defaults missing troop-type upgrade data when loading older saves', () => {
    const state = chooseStartingFaction(startNewGame(16), 'human');
    const legacyLike = JSON.stringify(
      Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'troopTypeUpgradeIds')),
    );

    const loaded = deserializeGameState(legacyLike);

    expect(loaded.ok).toBe(true);
    expect(loaded.state?.troopTypeUpgradeIds).toEqual([]);
  });

  it('flattens later soldier add-unit costs after the troop-type upgrade is purchased', () => {
    const state = chooseStartingFaction(startNewGame(17), 'human');
    const soldier = state.troops[0]!;
    const upgradedState = { ...state, troopTypeUpgradeIds: ['soldier-just-a-bunch-of-guys'] };
    const grownSoldier = { ...soldier, quantity: 2 };

    expect(getTroopAddUnitCost(upgradedState, grownSoldier)).toBe(getTroopAddUnitCost(upgradedState, soldier));
  });
});
