import { describe, expect, it } from 'vitest';
import type { ReplayIndexEntry, ReplayPayloadWrite, StoredReplayPayload } from '../engine/types';
import { persistReplayPayloadWrites } from './gameStore';

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

function latestPayloadSlack(write: ReplayPayloadWrite): number {
  return JSON.stringify(write.replay).length;
}
