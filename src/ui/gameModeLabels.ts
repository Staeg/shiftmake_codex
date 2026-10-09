import type { GameMode } from '../engine/types';
import type { SaveSlotSummary } from '../store/saveSlots';

export function gameModeLabel(mode: GameMode | null): string {
  if (!mode) return 'Campaign';
  return mode.split(/[_-]+/).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

export function newGameActionLabel(slot: Pick<SaveSlotSummary, 'status'>, mode: GameMode): string {
  const prefix = slot.status === 'occupied' ? 'Replace' : 'Start';
  if (mode === 'campaign') return `${prefix} Campaign`;
  if (mode === 'ladder') return `${prefix} Ladder`;
  return `${prefix} Contest vs AI`;
}

export function newGameModeDescription(mode: GameMode): string {
  if (mode === 'campaign') return 'A standard local run with fresh Rifts generated from your save seed.';
  if (mode === 'ladder') return 'A campaign that draws shared Rift-sets and feeds your completed sets back into the ladder pool.';
  return 'A solo Contest run where an AI rival drafts and assigns troops against you.';
}
