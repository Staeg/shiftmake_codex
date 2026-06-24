import { describe, expect, it } from 'vitest';
import {
  claimOpeningTroop,
  deserializeGameState,
  getOpeningRaceOptionIds,
  getOpeningRaceStarterTroopUnlockIds,
  serializeGameState,
  startNewGame,
  startOpeningCampaign,
} from '../engine/game';
import { RACES } from '../engine/unitCatalog';
import type { GameState, TroopUnlockId } from '../engine/types';
import { createNewSlotCampaign, listSaveSlots, migrateLegacySave, readSlotReplay, saveToSlot, verifyReplayIndexAgainstStoredPayloads, writeSlotReplay } from './saveSlots';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function getOpeningPair(state: GameState): [TroopUnlockId, TroopUnlockId] {
  const startersByRaceId = getOpeningRaceStarterTroopUnlockIds(state);
  const candidates = getOpeningRaceOptionIds(state).map((raceId) => startersByRaceId[raceId]);
  const firstTroopUnlockId = candidates[0]!;
  const [firstRaceId, firstUnitClassId] = firstTroopUnlockId.split('/');
  const secondTroopUnlockId = candidates.find((troopUnlockId) => {
    const [raceId, unitClassId] = troopUnlockId.split('/');
    return raceId !== firstRaceId && unitClassId !== firstUnitClassId;
  })!;
  return [firstTroopUnlockId, secondTroopUnlockId];
}

function finishOpening(state: GameState): GameState {
  const [firstTroopUnlockId, secondTroopUnlockId] = getOpeningPair(state);
  return startOpeningCampaign(claimOpeningTroop(claimOpeningTroop(state, firstTroopUnlockId), secondTroopUnlockId));
}

describe('save slot repository', () => {
  it('always exposes three slots and uses the v2 empty summary', () => {
    const storage = new MemoryStorage();

    expect(listSaveSlots(storage)).toEqual([
      { slotId: 1, status: 'empty', gameMode: null, cycleNumber: null, phase: null, raceLabel: null, lastPlayedAt: null },
      { slotId: 2, status: 'empty', gameMode: null, cycleNumber: null, phase: null, raceLabel: null, lastPlayedAt: null },
      { slotId: 3, status: 'empty', gameMode: null, cycleNumber: null, phase: null, raceLabel: null, lastPlayedAt: null },
    ]);
  });

  it('summarizes opening and active runs with the new campaign phases', () => {
    const storage = new MemoryStorage();
    const opening = createNewSlotCampaign(storage, 1, 7);

    expect(listSaveSlots(storage)[0]).toMatchObject({
      slotId: 1,
      status: 'occupied',
      cycleNumber: 1,
      phase: 'opening_unlock',
      raceLabel: null,
    });

    const opened = finishOpening(opening);
    saveToSlot(storage, 1, opened);
    const leadRace = opened.unlockedRaceIds[0]!;

    expect(listSaveSlots(storage)[0]).toMatchObject({
      slotId: 1,
      status: 'occupied',
      cycleNumber: 1,
      phase: 'planning',
      raceLabel: RACES[leadRace].label,
    });
  });

  it('overwriting a slot starts a fresh campaign and clears only that slot replays', () => {
    const storage = new MemoryStorage();

    createNewSlotCampaign(storage, 1, 11);
    storage.setItem('shiftmake:slot:1:replay:v3.19:test-battle', JSON.stringify({ version: 1, input: { seed: 1, riftId: 'rift', tier: 1, mutatorIds: [], playerCombatants: [], enemyCombatants: [] } }));
    storage.setItem('shiftmake:slot:1:replay:v2:test-battle-v2', JSON.stringify({ version: 1, input: { seed: 1, riftId: 'rift', tier: 1, mutatorIds: [], playerCombatants: [], enemyCombatants: [] } }));
    storage.setItem('shiftmake:slot:2:replay:v3.19:test-battle', JSON.stringify({ version: 1, input: { seed: 2, riftId: 'rift', tier: 1, mutatorIds: [], playerCombatants: [], enemyCombatants: [] } }));

    const fresh = createNewSlotCampaign(storage, 1, 22);

    expect(fresh.campaignSeed).toBe(22);
    expect(readSlotReplay(storage, 1, 'test-battle')).toBeNull();
    expect(readSlotReplay(storage, 1, 'test-battle-v2')).toBeNull();
    expect(readSlotReplay(storage, 2, 'test-battle')).not.toBeNull();
  });

  it('writes replay payloads to the explicit minor-versioned v3 key and still reads legacy keys', () => {
    const storage = new MemoryStorage();
    const payload = JSON.stringify({
      version: 1,
      input: { seed: 1, riftId: 'rift', tier: 1, mutatorIds: [], playerCombatants: [], enemyCombatants: [] },
    });

    writeSlotReplay(storage, 1, 'new-battle', payload);
    expect(storage.getItem('shiftmake:slot:1:replay:v3.19:new-battle')).toBe(payload);

    storage.setItem('shiftmake:slot:1:replay:v3.0:old-v30', payload);
    storage.setItem('shiftmake:slot:1:replay:old-unversioned', payload);
    expect(readSlotReplay(storage, 1, 'old-v30')).not.toBeNull();
    expect(readSlotReplay(storage, 1, 'old-unversioned')).not.toBeNull();
  });

  it('marks archived battles whose stored input now resolves to a different result', () => {
    const storage = new MemoryStorage();
    const opened = finishOpening(startNewGame(9));
    const game = {
      ...opened,
      replayIndex: [
        {
          id: 'changed-battle',
          riftId: 'rift',
          cycleNumber: 1,
          battleSeed: 3,
          outcome: 'defeat' as const,
          playerTroopLabels: ['Elven Archers'],
          mutatorIds: [],
          summary: 'DEFEAT 0-17',
          replayId: 'changed-battle',
          estimatedBytes: 100,
        },
      ],
    };
    saveToSlot(storage, 1, game);
    writeSlotReplay(
      storage,
      1,
      'changed-battle',
      JSON.stringify({ version: 1, input: { seed: 3, riftId: 'rift', tier: 1, mutatorIds: [], playerCombatants: [], enemyCombatants: [] } }),
    );

    const verified = verifyReplayIndexAgainstStoredPayloads(storage, 1, game);

    expect(verified.changedCount).toBe(1);
    expect(verified.game.replayIndex[0]?.resultDrift).toMatchObject({
      originalSummary: 'DEFEAT 0-17',
      currentSummary: 'DRAW 0-0',
      currentOutcome: 'draw',
      currentFinalPlayerAlive: 0,
      currentFinalEnemyAlive: 0,
    });
  });

  it('loads older v3 saves with newly required fields defaulted', () => {
    const opened = finishOpening(startNewGame(15));
    const staleSave = { ...opened } as Partial<GameState>;
    delete staleSave.gameMode;
    delete staleSave.recentTroopUnlockIds;
    delete staleSave.raceUpgradeIds;
    delete staleSave.troopClassUpgradeIds;
    delete staleSave.activeRaceUnlockOffer;
    delete staleSave.activeTroopClassUnlockOffer;
    delete staleSave.troopOfferRolls;
    delete staleSave.upgradeOfferRolls;
    delete staleSave.postgameDismissed;

    const loaded = deserializeGameState(JSON.stringify(staleSave));

    expect(loaded.ok).toBe(true);
    expect(loaded.state).toMatchObject({
      gameMode: 'campaign',
      recentTroopUnlockIds: [],
      raceUpgradeIds: [],
      troopClassUpgradeIds: [],
      activeRaceUnlockOffer: null,
      activeTroopClassUnlockOffer: null,
      troopOfferRolls: 0,
      upgradeOfferRolls: 0,
      postgameDismissed: false,
    });
  });

  it('drops obsolete catalog ids from loaded saves', () => {
    const opened = finishOpening(startNewGame(18));
    const loaded = deserializeGameState(
      JSON.stringify({
        ...opened,
        unlockedRaceIds: [...opened.unlockedRaceIds, 'retired-race'],
        unlockedTroopUnlockIds: ['human/soldier', 'retired-race/soldier'],
        recentTroopUnlockIds: ['retired-race/soldier'],
        troops: [
          ...opened.troops,
          {
            id: 'retired-race/soldier',
            raceId: 'retired-race',
            unitClassId: 'soldier',
            recoveryCyclesRemaining: 0,
            assignmentRiftId: null,
          },
        ],
        raceUpgradeIds: ['human-tubthumping', 'retired-upgrade'],
        troopClassUpgradeIds: ['archer-shredding-arrows', 'retired-class-upgrade'],
        activeTroopOffer: { kind: 'troop', optionTroopUnlockIds: ['human/soldier', 'retired-race/soldier'] },
        activeUpgradeOffer: { kind: 'upgrade', optionUpgradeIds: ['human-tubthumping', 'retired-upgrade'] },
      }),
    );

    expect(loaded.ok).toBe(true);
    expect(loaded.repairs).toMatchObject({
      missingRaceIds: ['retired-race'],
      missingTroopUnlockIds: ['retired-race/soldier'],
      missingTroopInstanceIds: ['retired-race/soldier'],
      missingUpgradeIds: ['retired-upgrade', 'retired-class-upgrade'],
      missingDraftOptionIds: ['retired-race/soldier', 'retired-upgrade'],
    });
    expect(loaded.state?.unlockedRaceIds).not.toContain('retired-race');
    expect(loaded.state?.unlockedTroopUnlockIds).toEqual(['human/soldier']);
    expect(loaded.state?.recentTroopUnlockIds).toEqual([]);
    expect(loaded.state?.troops.some((troop) => troop.raceId === 'retired-race')).toBe(false);
    expect(loaded.state?.raceUpgradeIds).toEqual(['human-tubthumping']);
    expect(loaded.state?.troopClassUpgradeIds).toEqual(['archer-shredding-arrows']);
    expect(loaded.state?.activeTroopOffer?.optionTroopUnlockIds).toEqual(['human/soldier']);
    expect(loaded.state?.activeUpgradeOffer?.optionUpgradeIds).toEqual(['human-tubthumping']);
  });

  it('repairs stale phase-specific saves instead of loading a blank overworld branch', () => {
    const opened = finishOpening(startNewGame(16));
    const loaded = deserializeGameState(JSON.stringify({ ...opened, phase: 'race_unlock', activeRaceUnlockOffer: undefined }));

    expect(loaded.ok).toBe(true);
    expect(loaded.state?.phase).toBe('planning');
  });

  it('marks stale replay payloads summary-only when verification can no longer resolve them', () => {
    const storage = new MemoryStorage();
    const opened = finishOpening(startNewGame(17));
    const game = {
      ...opened,
      replayIndex: [
        {
          id: 'bad-battle',
          riftId: 'rift',
          cycleNumber: 1,
          battleSeed: 3,
          outcome: 'victory' as const,
          playerTroopLabels: ['Elven Archers'],
          mutatorIds: [],
          summary: 'VICTORY 1-0',
          replayId: 'bad-battle',
          estimatedBytes: 100,
        },
      ],
    };
    saveToSlot(storage, 1, game);
    writeSlotReplay(storage, 1, 'bad-battle', JSON.stringify({ version: 1, input: { playerCombatants: [null], enemyCombatants: [] } }));

    const verified = verifyReplayIndexAgainstStoredPayloads(storage, 1, game);

    expect(verified.changedCount).toBe(1);
    expect(verified.game.replayIndex[0]?.summaryOnly).toBe(true);
  });

  it('migrates a legacy save into slot one and copies legacy replay payloads', () => {
    const storage = new MemoryStorage();
    const opened = finishOpening(startNewGame(9));
    const game = {
      ...opened,
      replayIndex: [
        {
          id: 'test-battle',
          riftId: 'rift',
          cycleNumber: 1,
          battleSeed: 3,
          outcome: 'victory' as const,
          playerTroopLabels: ['Elven Archers'],
          mutatorIds: [],
          summary: 'VICTORY // Elven Archers',
          replayId: 'test-battle',
          estimatedBytes: 100,
        },
      ],
    };
    storage.setItem('shiftmake:save:v1', serializeGameState(game));
    storage.setItem('shiftmake:replay:test-battle', JSON.stringify({ version: 1, input: { seed: 3, riftId: 'rift', tier: 1, mutatorIds: [], playerCombatants: [], enemyCombatants: [] } }));

    const slots = migrateLegacySave(storage);

    expect(slots[0]).toMatchObject({
      slotId: 1,
      status: 'occupied',
      raceLabel: RACES[opened.unlockedRaceIds[0]!].label,
    });
    expect(storage.getItem('shiftmake:save:v1')).toBeNull();
    expect(readSlotReplay(storage, 1, 'test-battle')).not.toBeNull();
  });
});
