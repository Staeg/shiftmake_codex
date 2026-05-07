import { describe, expect, it } from 'vitest';
import { claimOpeningTroop, serializeGameState, startNewGame, startOpeningCampaign } from '../engine/game';
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

describe('save slot repository', () => {
  it('always exposes three slots and uses the v2 empty summary', () => {
    const storage = new MemoryStorage();

    expect(listSaveSlots(storage)).toEqual([
      { slotId: 1, status: 'empty', cycleNumber: null, phase: null, factionLabel: null, lastPlayedAt: null },
      { slotId: 2, status: 'empty', cycleNumber: null, phase: null, factionLabel: null, lastPlayedAt: null },
      { slotId: 3, status: 'empty', cycleNumber: null, phase: null, factionLabel: null, lastPlayedAt: null },
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
      factionLabel: null,
    });

    saveToSlot(storage, 1, startOpeningCampaign(claimOpeningTroop(claimOpeningTroop(opening, 'troll/soldier'), 'elf/archer')));

    expect(listSaveSlots(storage)[0]).toMatchObject({
      slotId: 1,
      status: 'occupied',
      cycleNumber: 1,
      phase: 'planning',
      factionLabel: 'Trolls',
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
    const game = {
      ...startOpeningCampaign(claimOpeningTroop(claimOpeningTroop(startNewGame(9), 'elf/archer'), 'human/soldier')),
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

  it('migrates a legacy save into slot one and copies legacy replay payloads', () => {
    const storage = new MemoryStorage();
    const game = {
      ...startOpeningCampaign(claimOpeningTroop(claimOpeningTroop(startNewGame(9), 'elf/archer'), 'human/soldier')),
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
      factionLabel: 'Elves',
    });
    expect(storage.getItem('shiftmake:save:v1')).toBeNull();
    expect(readSlotReplay(storage, 1, 'test-battle')).not.toBeNull();
  });
});
