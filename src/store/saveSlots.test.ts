import { describe, expect, it } from 'vitest';
import { chooseStartingFaction, serializeGameState, startNewGame } from '../engine/game';
import { createNewSlotCampaign, listSaveSlots, migrateLegacySave, readSlotReplay, saveToSlot } from './saveSlots';

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
  it('always exposes three slots and marks empty slots correctly', () => {
    const storage = new MemoryStorage();

    expect(listSaveSlots(storage)).toEqual([
      {
        slotId: 1,
        status: 'empty',
        cycleNumber: null,
        phase: null,
        factionLabel: null,
        lastPlayedAt: null,
      },
      {
        slotId: 2,
        status: 'empty',
        cycleNumber: null,
        phase: null,
        factionLabel: null,
        lastPlayedAt: null,
      },
      {
        slotId: 3,
        status: 'empty',
        cycleNumber: null,
        phase: null,
        factionLabel: null,
        lastPlayedAt: null,
      },
    ]);
  });

  it('summarizes occupied slots from the saved campaign', () => {
    const storage = new MemoryStorage();
    const game = chooseStartingFaction(startNewGame(7), 'troll');

    saveToSlot(storage, 2, game);

    expect(listSaveSlots(storage)[1]).toMatchObject({
      slotId: 2,
      status: 'occupied',
      cycleNumber: 1,
      phase: 'planning',
      factionLabel: 'Trolls',
    });
  });

  it('overwriting a slot starts a fresh campaign and isolates replay payloads by slot', () => {
    const storage = new MemoryStorage();

    createNewSlotCampaign(storage, 1, 11);
    storage.setItem('shiftmake:slot:1:replay:test-battle', JSON.stringify({ version: 1, input: { seed: 1, riftId: 'rift', tier: 1, mutatorIds: [], playerCombatants: [], enemyCombatants: [] } }));
    storage.setItem('shiftmake:slot:2:replay:test-battle', JSON.stringify({ version: 1, input: { seed: 2, riftId: 'rift', tier: 1, mutatorIds: [], playerCombatants: [], enemyCombatants: [] } }));

    const fresh = createNewSlotCampaign(storage, 1, 22);

    expect(fresh.campaignSeed).toBe(22);
    expect(readSlotReplay(storage, 1, 'test-battle')).toBeNull();
    expect(readSlotReplay(storage, 2, 'test-battle')).not.toBeNull();
  });

  it('migrates the legacy single save into slot one when slots are empty', () => {
    const storage = new MemoryStorage();
    const game = chooseStartingFaction(startNewGame(9), 'elf');

    storage.setItem('shiftmake:save:v1', serializeGameState(game));

    const slots = migrateLegacySave(storage);

    expect(slots[0]).toMatchObject({
      slotId: 1,
      status: 'occupied',
      factionLabel: 'Elves',
    });
    expect(storage.getItem('shiftmake:save:v1')).toBeNull();
  });
});
