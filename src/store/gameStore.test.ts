import { beforeEach, describe, expect, it } from 'vitest';
import { decodeBattleReport } from '../engine/battleReport';
import { decodeCampaignReport } from '../engine/campaignReport';
import type { CampaignReportUiContext, ReplayIndexEntry, ReplayPayloadWrite, StoredReplayPayload } from '../engine/types';
import { gameStore, persistReplayPayloadWrites } from './gameStore';

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

class QuotaStorage {
  private values = new Map<string, string>();

  constructor(private readonly maxChars: number) {}

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    const previous = this.values.get(key);
    const nextTotal = this.totalChars() - (previous?.length ?? 0) + value.length;
    if (nextTotal > this.maxChars) {
      const error = new Error('Quota exceeded');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  private totalChars(): number {
    return [...this.values.values()].reduce((total, value) => total + value.length, 0);
  }
}

function makeReplayPayload(seed: number): StoredReplayPayload {
  return {
    version: 1,
    input: {
      seed,
      riftId: `rift-${seed}`,
      tier: 1,
      mutatorIds: [],
      playerCombatants: [],
      enemyCombatants: [],
    },
  };
}

function makeReplayIndexEntry(replayId: string, summaryOnly = false): ReplayIndexEntry {
  return {
    id: replayId,
    riftId: 'rift',
    cycleNumber: 1,
    battleSeed: 1,
    outcome: 'victory',
    playerTroopLabels: ['Test Troop'],
    mutatorIds: [],
    summary: 'VICTORY 1-0',
    replayId,
    estimatedBytes: 100,
    summaryOnly,
  };
}

function makeReplayWrite(replayId: string, seed: number): ReplayPayloadWrite {
  return {
    replayId,
    replay: makeReplayPayload(seed),
    estimatedBytes: JSON.stringify(makeReplayPayload(seed)).length,
  };
}

function latestPayloadSlack(write: ReplayPayloadWrite): number {
  return JSON.stringify(write.replay).length;
}

function currentStoreState<T>(): T {
  let value: T | undefined;
  const unsubscribe = gameStore.subscribe((state) => {
    value = state as T;
  });
  unsubscribe();
  return value as T;
}

function claimDefaultOpeningTroops(): void {
  gameStore.claimOpeningTroop('human/soldier');
  gameStore.claimOpeningTroop('elf/archer');
}

describe('persistReplayPayloadWrites', () => {
  it('evicts the oldest replay payload and retries when storage is full', () => {
    const oldestKey = 'shiftmake:replay:oldest';
    const newerKey = 'shiftmake:replay:newer';
    const latestKey = 'shiftmake:replay:latest';
    const oldestPayload = JSON.stringify(makeReplayPayload(1));
    const newerPayload = JSON.stringify(makeReplayPayload(2));
    const latestWrite = makeReplayWrite(latestKey, 3);
    const storage = new QuotaStorage(oldestPayload.length + newerPayload.length + latestPayloadSlack(latestWrite) - 1);

    storage.setItem(oldestKey, oldestPayload);
    storage.setItem(newerKey, newerPayload);

    const result = persistReplayPayloadWrites(
      storage,
      [makeReplayIndexEntry(latestKey), makeReplayIndexEntry(newerKey), makeReplayIndexEntry(oldestKey)],
      [latestWrite],
    );

    expect(storage.getItem(latestKey)).not.toBeNull();
    expect(storage.getItem(oldestKey)).toBeNull();
    expect(result.failedReplayIds.size).toBe(0);
    expect(result.evictedReplayIds).toEqual([oldestKey]);
    expect(result.replayIndex.find((entry) => entry.replayId === oldestKey)?.summaryOnly).toBe(true);
  });

  it('falls back to a summary when nothing older can be evicted', () => {
    const latestKey = 'shiftmake:replay:latest';
    const latestWrite = makeReplayWrite(latestKey, 4);
    const storage = new QuotaStorage(latestPayloadSlack(latestWrite) - 1);

    const result = persistReplayPayloadWrites(storage, [makeReplayIndexEntry(latestKey)], [latestWrite]);

    expect(storage.getItem(latestKey)).toBeNull();
    expect(result.failedReplayIds.has(latestKey)).toBe(true);
    expect(result.replayIndex.find((entry) => entry.replayId === latestKey)?.summaryOnly).toBe(true);
  });
});

describe('gameStore progression flow', () => {
  let storage: MemoryStorage;

  beforeEach(() => {
    storage = new MemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      value: storage,
      configurable: true,
    });
    gameStore.initialize();
  });

  it('warns before ending a cycle with unspent Essence and requires confirmation', () => {
    gameStore.startNewCampaign(1);
    claimDefaultOpeningTroops();

    gameStore.endCycle();
    let state = currentStoreState<{
      game: { cycleNumber: number };
      cycleEndConfirmationPending: boolean;
      systemMessage: string | null;
    }>();

    expect(state.cycleEndConfirmationPending).toBe(true);
    expect(state.systemMessage).toBe('No troops are assigned and you still have unspent Essence. End the cycle anyway?');

    gameStore.endCycle(true);
    state = currentStoreState<{
      game: { cycleNumber: number };
      cycleEndConfirmationPending: boolean;
      systemMessage: string | null;
    }>();

    expect(state.game.cycleNumber).toBe(2);
    expect(state.cycleEndConfirmationPending).toBe(false);
  });

  it('keeps active draft offers stable through save and reload', () => {
    gameStore.startNewCampaign(1);
    claimDefaultOpeningTroops();
    gameStore.revealEssenceDraft();

    const beforeReload = currentStoreState<{ game: { activeTroopOffer: unknown; activeUpgradeOffer: unknown } }>().game;

    gameStore.returnToMainMenu();
    expect(gameStore.loadSlot(1)).toBe(true);

    const afterReload = currentStoreState<{ game: { activeTroopOffer: unknown; activeUpgradeOffer: unknown } }>().game;

    expect(afterReload.activeTroopOffer).toEqual(beforeReload.activeTroopOffer);
    expect(afterReload.activeUpgradeOffer).toEqual(beforeReload.activeUpgradeOffer);
  });

  it('adds resolved battles to the archive index when a cycle ends', () => {
    gameStore.startNewCampaign(1);
    claimDefaultOpeningTroops();

    const started = currentStoreState<{
      game: {
        troops: Array<{ id: string }>;
        openRifts: Array<{ id: string }>;
      };
    }>();
    const troopId = started.game.troops[0]?.id;
    const riftId = started.game.openRifts[0]?.id;

    expect(troopId).toBeTruthy();
    expect(riftId).toBeTruthy();

    gameStore.assignTroopToRift(troopId!, riftId!);
    gameStore.endCycle(true);

    const ended = currentStoreState<{
      game: {
        cycleNumber: number;
        replayIndex: ReplayIndexEntry[];
      };
    }>();

    expect(ended.game.cycleNumber).toBe(2);
    expect(ended.game.replayIndex).toHaveLength(1);
    expect(ended.game.replayIndex[0]?.cycleNumber).toBe(1);
    expect(ended.game.replayIndex[0]?.riftId).toBe(riftId);
  });

  it('creates and imports exact battle reports for archived replays', () => {
    gameStore.startNewCampaign(1);
    claimDefaultOpeningTroops();

    const started = currentStoreState<{
      game: {
        troops: Array<{ id: string }>;
        openRifts: Array<{ id: string }>;
      };
    }>();
    const troopId = started.game.troops[0]?.id;
    const riftId = started.game.openRifts[0]?.id;

    gameStore.assignTroopToRift(troopId!, riftId!);
    gameStore.endCycle(true);

    const archived = currentStoreState<{ game: { replayIndex: ReplayIndexEntry[] } }>();
    const replayId = archived.game.replayIndex[0]?.replayId;
    expect(replayId).toBeTruthy();

    const report = gameStore.createBattleReport(replayId!, 2, [
      {
        source: 'renderer',
        severity: 'warning',
        code: 'unit_texture_fallback_used',
        message: 'No texture was loaded for human/soldier; using renderer fallback texture.',
        textureKey: 'human/soldier',
      },
    ]);
    expect(report).toBeTruthy();
    const decoded = decodeBattleReport(report!);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      return;
    }
    expect(decoded.payload.summary.riftId).toBe(riftId);
    expect(decoded.payload.diagnostics[0]?.code).toBe('unit_texture_fallback_used');

    const result = gameStore.importBattleReport(report!);
    expect(result.ok).toBe(true);

    const imported = currentStoreState<{
      screen: string;
      loadedReplay: { id: string; steps: unknown[] } | null;
      loadedReplayPayload: StoredReplayPayload | null;
      loadedBattleReport: { reportId: string } | null;
      currentStep: number;
    }>();
    expect(imported.screen).toBe('replay');
    expect(imported.loadedReplay?.id).toBe(replayId);
    expect(imported.loadedReplayPayload?.input.seed).toBe(decoded.payload.replay.input.seed);
    expect(imported.loadedBattleReport?.reportId).toBe(decoded.payload.reportId);
    expect(imported.currentStep).toBe(2);
  });

  it('exports and imports campaign reports into a chosen save slot', () => {
    gameStore.startNewCampaign(1);
    claimDefaultOpeningTroops();

    const started = currentStoreState<{
      game: {
        troops: Array<{ id: string }>;
        openRifts: Array<{ id: string }>;
      };
    }>();
    const troopId = started.game.troops[0]?.id;
    const riftId = started.game.openRifts[0]?.id;
    gameStore.assignTroopToRift(troopId!, riftId!);
    gameStore.endCycle(true);

    const uiContext: CampaignReportUiContext = {
      screen: 'overworld',
      centerMode: 'rifts',
      selectedRiftId: riftId!,
      selectedTroopId: troopId!,
      selectedReplayId: null,
      currentReplayStep: null,
      systemMessage: 'Investigating campaign state.',
      validationMessages: ['Example warning'],
    };

    const report = gameStore.createCampaignReport(uiContext);
    expect(report).toBeTruthy();
    const decoded = decodeCampaignReport(report!);
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) {
      return;
    }
    expect(decoded.payload.summary.replayPayloadCount).toBe(1);
    expect(decoded.payload.uiContext.selectedRiftId).toBe(riftId);

    gameStore.startNewCampaign(2);
    storage.setItem('shiftmake:slot:2:replay:stale', JSON.stringify(makeReplayPayload(999)));
    const result = gameStore.importCampaignReport(report!, 2);
    expect(result.ok).toBe(true);

    const imported = currentStoreState<{
      activeSlotId: number | null;
      screen: string;
      centerMode: string;
      validationMessages: string[];
      game: {
        campaignSeed: number;
        replayIndex: ReplayIndexEntry[];
      };
    }>();
    expect(imported.activeSlotId).toBe(2);
    expect(imported.screen).toBe('overworld');
    expect(imported.centerMode).toBe('rifts');
    expect(imported.validationMessages).toEqual(['Example warning']);
    expect(imported.game.campaignSeed).toBe(decoded.payload.game.campaignSeed);
    expect(storage.getItem('shiftmake:slot:2:replay:stale')).toBeNull();
    expect(storage.getItem(`shiftmake:slot:2:replay:v3.19:${imported.game.replayIndex[0]?.replayId}`)).not.toBeNull();
    expect(storage.getItem('shiftmake:slot:1:save:v3')).not.toBeNull();
  });
});
