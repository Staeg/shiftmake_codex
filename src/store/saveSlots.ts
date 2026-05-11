import { getFaction } from '../engine/unitCatalog';
import { deserializeGameState, serializeGameState, startNewGame } from '../engine/game';
import { resolveBattle } from '../engine/battle';
import type { BattleReplay, BattleOutcome, CampaignPhase, CampaignReportPayload, GameMode, GameState, ReplayIndexEntry, StoredReplayPayload } from '../engine/types';

export type SaveSlotId = 1 | 2 | 3;

export interface SaveSlotSummary {
  slotId: SaveSlotId;
  status: 'empty' | 'occupied';
  gameMode: GameMode | null;
  cycleNumber: number | null;
  phase: CampaignPhase | null;
  factionLabel: string | null;
  lastPlayedAt: string | null;
}

interface SlotMetaRecord {
  updatedAt: string;
}

type SlotMetaIndex = Partial<Record<SaveSlotId, SlotMetaRecord>>;

const SLOT_IDS: SaveSlotId[] = [1, 2, 3];
const SLOT_META_KEY = 'shiftmake:slots:v3';
const REPLAY_STORAGE_VERSION = 'v3.19';
const LEGACY_SAVE_KEY = 'shiftmake:save:v1';
const LEGACY_REPLAY_PREFIX = 'shiftmake:replay:';

function getSlotSaveKey(slotId: SaveSlotId): string {
  return `shiftmake:slot:${slotId}:save:v3`;
}

function getSlotReplayPrefix(slotId: SaveSlotId): string {
  return `shiftmake:slot:${slotId}:replay:${REPLAY_STORAGE_VERSION}:`;
}

export function getSlotReplayStorageKey(slotId: SaveSlotId, replayId: string): string {
  return `${getSlotReplayPrefix(slotId)}${replayId}`;
}

function getLegacyUnversionedReplayPrefix(slotId: SaveSlotId): string {
  return `shiftmake:slot:${slotId}:replay:`;
}

function getLegacyV30ReplayPrefix(slotId: SaveSlotId): string {
  return `shiftmake:slot:${slotId}:replay:v3.0:`;
}

function getLegacyV2ReplayPrefix(slotId: SaveSlotId): string {
  return `shiftmake:slot:${slotId}:replay:v2:`;
}

function getLegacyV3ReplayPrefix(slotId: SaveSlotId): string {
  return `shiftmake:slot:${slotId}:replay:v3:`;
}

function getSlotReplayKeys(slotId: SaveSlotId, replayId: string): string[] {
  return [
    `${getSlotReplayPrefix(slotId)}${replayId}`,
    `${getLegacyV30ReplayPrefix(slotId)}${replayId}`,
    `${getLegacyV3ReplayPrefix(slotId)}${replayId}`,
    `${getLegacyV2ReplayPrefix(slotId)}${replayId}`,
    `${getLegacyUnversionedReplayPrefix(slotId)}${replayId}`,
  ];
}

function readMeta(storage: Storage): SlotMetaIndex {
  const raw = storage.getItem(SLOT_META_KEY);
  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw) as SlotMetaIndex;
  } catch {
    return {};
  }
}

function writeMeta(storage: Storage, meta: SlotMetaIndex): void {
  storage.setItem(SLOT_META_KEY, JSON.stringify(meta));
}

function updateSlotTimestamp(storage: Storage, slotId: SaveSlotId, updatedAt = new Date().toISOString()): void {
  const meta = readMeta(storage);
  writeMeta(storage, {
    ...meta,
    [slotId]: { updatedAt },
  });
}

function clearSlotTimestamp(storage: Storage, slotId: SaveSlotId): void {
  const meta = readMeta(storage);
  const nextMeta = { ...meta };
  delete nextMeta[slotId];
  writeMeta(storage, nextMeta);
}

function summarizeSlot(slotId: SaveSlotId, game: GameState | null, updatedAt: string | null): SaveSlotSummary {
  if (!game) {
    return {
      slotId,
      status: 'empty',
      gameMode: null,
      cycleNumber: null,
      phase: null,
      factionLabel: null,
      lastPlayedAt: updatedAt,
    };
  }

  const leadFactionId = game.unlockedFactionIds[0] ?? null;
  return {
    slotId,
    status: 'occupied',
    gameMode: game.gameMode ?? 'campaign',
    cycleNumber: game.cycleNumber,
    phase: game.phase,
    factionLabel: leadFactionId ? getFaction(leadFactionId).label : null,
    lastPlayedAt: updatedAt,
  };
}

function loadGameFromStorage(storage: Storage, slotId: SaveSlotId): GameState | null {
  const raw = storage.getItem(getSlotSaveKey(slotId));
  if (!raw) {
    return null;
  }

  const result = deserializeGameState(raw);
  return result.ok ? result.state ?? null : null;
}

function parseSummaryCounts(summary: string): { player: number; enemy: number } | null {
  const match = /\b(\d+)\s*-\s*(\d+)\b/.exec(summary);
  if (!match) {
    return null;
  }
  return {
    player: Number(match[1]),
    enemy: Number(match[2]),
  };
}

function buildReplaySummary(outcome: BattleOutcome, finalPlayerAlive: number, finalEnemyAlive: number): string {
  return `${outcome.toUpperCase()} ${finalPlayerAlive}-${finalEnemyAlive}`;
}

function replayResultMatchesEntry(entry: ReplayIndexEntry, replay: BattleReplay): boolean {
  const storedCounts = {
    player: entry.finalPlayerAlive ?? parseSummaryCounts(entry.summary)?.player ?? null,
    enemy: entry.finalEnemyAlive ?? parseSummaryCounts(entry.summary)?.enemy ?? null,
  };
  return (
    entry.outcome === replay.outcome &&
    storedCounts.player === replay.summary.finalPlayerAlive &&
    storedCounts.enemy === replay.summary.finalEnemyAlive
  );
}

export function verifyReplayIndexAgainstStoredPayloads(storage: Storage, slotId: SaveSlotId, game: GameState): { game: GameState; changedCount: number } {
  let updated = false;
  let changedCount = 0;
  const checkedAt = new Date().toISOString();
  const replayIndex = game.replayIndex.map((entry) => {
    if (entry.summaryOnly) {
      return entry;
    }

    const payload = readSlotReplayPayload(storage, slotId, entry.replayId);
    if (!payload) {
      return entry;
    }

    const replay = resolveBattle(payload.input);
    if (replayResultMatchesEntry(entry, replay)) {
      if (entry.resultDrift) {
        updated = true;
        const { resultDrift, ...clearedEntry } = entry;
        return clearedEntry;
      }
      return entry;
    }

    updated = true;
    changedCount += 1;
    return {
      ...entry,
      resultDrift: {
        checkedAt,
        originalSummary: entry.summary,
        currentSummary: buildReplaySummary(replay.outcome, replay.summary.finalPlayerAlive, replay.summary.finalEnemyAlive),
        currentOutcome: replay.outcome,
        currentFinalPlayerAlive: replay.summary.finalPlayerAlive,
        currentFinalEnemyAlive: replay.summary.finalEnemyAlive,
      },
    };
  });

  return {
    game: updated ? { ...game, replayIndex } : game,
    changedCount,
  };
}

function clearSlotReplays(storage: Storage, slotId: SaveSlotId): void {
  const prefixes = [
    getSlotReplayPrefix(slotId),
    getLegacyV30ReplayPrefix(slotId),
    getLegacyV2ReplayPrefix(slotId),
    getLegacyV3ReplayPrefix(slotId),
    getLegacyUnversionedReplayPrefix(slotId),
  ];
  const keysToDelete: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach((key) => storage.removeItem(key));
}

function copyLegacyReplaysToSlot(storage: Storage, slotId: SaveSlotId, game: GameState): void {
  game.replayIndex.forEach((entry) => {
    const payload = storage.getItem(`${LEGACY_REPLAY_PREFIX}${entry.replayId}`);
    if (!payload) {
      return;
    }
    storage.setItem(`${getSlotReplayPrefix(slotId)}${entry.replayId}`, payload);
  });
}

export function listSaveSlots(storage: Storage = localStorage): SaveSlotSummary[] {
  const meta = readMeta(storage);
  return SLOT_IDS.map((slotId) => summarizeSlot(slotId, loadGameFromStorage(storage, slotId), meta[slotId]?.updatedAt ?? null));
}

export function loadSaveSlot(storage: Storage, slotId: SaveSlotId): GameState | null {
  return loadGameFromStorage(storage, slotId);
}

export function saveToSlot(storage: Storage, slotId: SaveSlotId, game: GameState): void {
  storage.setItem(getSlotSaveKey(slotId), serializeGameState(game));
  updateSlotTimestamp(storage, slotId);
}

export function createNewSlotCampaign(
  storage: Storage,
  slotId: SaveSlotId,
  seed = Date.now() >>> 0,
  gameMode: GameMode = 'campaign',
): GameState {
  clearSlotReplays(storage, slotId);
  const game = startNewGame(seed, gameMode);
  saveToSlot(storage, slotId, game);
  return game;
}

export function clearSaveSlot(storage: Storage, slotId: SaveSlotId): void {
  storage.removeItem(getSlotSaveKey(slotId));
  clearSlotReplays(storage, slotId);
  clearSlotTimestamp(storage, slotId);
}

export function readSlotReplay(storage: Storage, slotId: SaveSlotId, replayId: string): BattleReplay | null {
  const json = getSlotReplayKeys(slotId, replayId)
    .map((key) => storage.getItem(key))
    .find((payload): payload is string => payload !== null);
  if (!json) {
    return null;
  }

  try {
    const parsed = JSON.parse(json) as BattleReplay | StoredReplayPayload;
    if ('steps' in parsed && Array.isArray(parsed.steps)) {
      return parsed;
    }
    if ('input' in parsed && parsed.input) {
      return resolveBattle(parsed.input);
    }
    return null;
  } catch {
    return null;
  }
}

export function readSlotReplayPayload(storage: Storage, slotId: SaveSlotId, replayId: string): StoredReplayPayload | null {
  const json = getSlotReplayKeys(slotId, replayId)
    .map((key) => storage.getItem(key))
    .find((payload): payload is string => payload !== null);
  if (!json) {
    return null;
  }

  try {
    const parsed = JSON.parse(json) as BattleReplay | StoredReplayPayload;
    if ('input' in parsed && parsed.input) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function writeSlotReplay(storage: Storage, slotId: SaveSlotId, replayId: string, payload: string): void {
  storage.setItem(getSlotReplayStorageKey(slotId, replayId), payload);
}

export function removeSlotReplay(storage: Storage, slotId: SaveSlotId, replayId: string): void {
  getSlotReplayKeys(slotId, replayId).forEach((key) => storage.removeItem(key));
}

export function importCampaignReportToSlot(storage: Storage, slotId: SaveSlotId, report: CampaignReportPayload): GameState {
  const missingReplayIds = new Set(report.missingReplayIds);
  const game = {
    ...report.game,
    replayIndex: report.game.replayIndex.map((entry) =>
      missingReplayIds.has(entry.replayId) && !(entry.replayId in report.replayPayloads) ? { ...entry, summaryOnly: true } : entry,
    ),
  };
  storage.setItem(getSlotSaveKey(slotId), serializeGameState(game));
  clearSlotReplays(storage, slotId);
  Object.entries(report.replayPayloads).forEach(([replayId, payload]) => {
    writeSlotReplay(storage, slotId, replayId, JSON.stringify(payload));
  });
  updateSlotTimestamp(storage, slotId);
  return game;
}

export function migrateLegacySave(storage: Storage = localStorage): SaveSlotSummary[] {
  const existingSlots = listSaveSlots(storage);
  if (existingSlots.some((slot) => slot.status === 'occupied')) {
    return existingSlots;
  }

  const raw = storage.getItem(LEGACY_SAVE_KEY);
  if (!raw) {
    return existingSlots;
  }

  const result = deserializeGameState(raw);
  if (!result.ok || !result.state) {
    return existingSlots;
  }

  saveToSlot(storage, 1, result.state);
  copyLegacyReplaysToSlot(storage, 1, result.state);
  storage.removeItem(LEGACY_SAVE_KEY);
  return listSaveSlots(storage);
}
