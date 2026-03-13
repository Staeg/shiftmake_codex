import { getFaction } from '../engine/unitCatalog';
import { deserializeGameState, serializeGameState, startNewGame } from '../engine/game';
import { resolveBattle } from '../engine/battle';
import type { BattleReplay, CampaignPhase, GameState, StoredReplayPayload } from '../engine/types';

export type SaveSlotId = 1 | 2 | 3;

export interface SaveSlotSummary {
  slotId: SaveSlotId;
  status: 'empty' | 'occupied';
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
const SLOT_META_KEY = 'shiftmake:slots:v1';
const LEGACY_SAVE_KEY = 'shiftmake:save:v1';
const LEGACY_REPLAY_PREFIX = 'shiftmake:replay:';

function getSlotSaveKey(slotId: SaveSlotId): string {
  return `shiftmake:slot:${slotId}:save:v1`;
}

function getSlotReplayPrefix(slotId: SaveSlotId): string {
  return `shiftmake:slot:${slotId}:replay:`;
}

function getSlotReplayKey(slotId: SaveSlotId, replayId: string): string {
  return `${getSlotReplayPrefix(slotId)}${replayId}`;
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

function clearSlotReplays(storage: Storage, slotId: SaveSlotId): void {
  const prefix = getSlotReplayPrefix(slotId);
  const keysToDelete: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(prefix)) {
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach((key) => storage.removeItem(key));
}

function copyLegacyReplaysToSlot(storage: Storage, slotId: SaveSlotId, game: GameState): void {
  game.replayIndex.forEach((entry) => {
    const legacyKey = `${LEGACY_REPLAY_PREFIX}${entry.replayId}`;
    const payload = storage.getItem(legacyKey);
    if (!payload) {
      return;
    }
    storage.setItem(getSlotReplayKey(slotId, entry.replayId), payload);
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

export function createNewSlotCampaign(storage: Storage, slotId: SaveSlotId, seed = Date.now() >>> 0): GameState {
  clearSlotReplays(storage, slotId);
  const game = startNewGame(seed);
  saveToSlot(storage, slotId, game);
  return game;
}

export function clearSaveSlot(storage: Storage, slotId: SaveSlotId): void {
  storage.removeItem(getSlotSaveKey(slotId));
  clearSlotReplays(storage, slotId);
  clearSlotTimestamp(storage, slotId);
}

export function readSlotReplay(storage: Storage, slotId: SaveSlotId, replayId: string): BattleReplay | null {
  const json = storage.getItem(getSlotReplayKey(slotId, replayId));
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

export function writeSlotReplay(storage: Storage, slotId: SaveSlotId, replayId: string, payload: string): void {
  storage.setItem(getSlotReplayKey(slotId, replayId), payload);
}

export function removeSlotReplay(storage: Storage, slotId: SaveSlotId, replayId: string): void {
  storage.removeItem(getSlotReplayKey(slotId, replayId));
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
