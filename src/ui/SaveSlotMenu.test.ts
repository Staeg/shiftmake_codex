import { describe, expect, it } from 'vitest';
import type { ComponentProps } from 'svelte';
import type { SaveSlotSummary } from '../store/saveSlots';
import SaveSlotMenu from './SaveSlotMenu.svelte';
import { gameModeLabel, newGameActionLabel, newGameModeDescription } from './gameModeLabels';

const ServerMenu = SaveSlotMenu as unknown as {
  render: (props: ComponentProps<SaveSlotMenu>) => { html: string };
};

const empty: SaveSlotSummary = {
  slotId: 1, status: 'empty', gameMode: null, cycleNumber: null,
  phase: null, raceLabel: null, lastPlayedAt: null,
};

function renderSlots(slots: SaveSlotSummary[], tutorialLocked = false, tutorialStep?: 'start-contest') {
  return ServerMenu.render({slots, tutorialLocked, tutorialStep, onLoad: () => {}, onStart: () => {}, onBlocked: () => {}}).html;
}

describe('save slot menu', () => {
  it('renders empty slots without a load action or eagerly opened mode picker', () => {
    const html = renderSlots([empty]);
    expect(html).toContain('Save slot 1');
    expect(html).toContain('Start New Game');
    expect(html).not.toContain('Load Slot');
    expect(html).not.toContain('role="dialog"');
  });

  it('renders occupied slot metadata and load action without inventing missing data', () => {
    const html = renderSlots([{...empty, slotId: 2, status: 'occupied', gameMode: 'ladder', cycleNumber: 4, phase: 'planning'}]);
    expect(html).toContain('Primary action for save slot 2');
    for (const text of ['Ladder', 'In progress', '4', 'planning', 'No timestamp', 'Load Slot']) expect(html).toContain(text);
  });

  it('preserves the tutorial new-game exception without unlocking load actions', () => {
    const occupied = {...empty, status: 'occupied' as const};
    const buttons = [...renderSlots([occupied], true, 'start-contest').matchAll(/<button\b[^>]*>/g)].map((entry) => entry[0]);
    expect(buttons.find((button) => button.includes('Primary action'))).toContain('tutorial-scene-locked');
    expect(buttons.find((button) => button.includes('Start new game'))).not.toContain('tutorial-scene-locked');
    expect(renderSlots([empty], true)).toContain('tutorial-scene-locked');
  });

  it('keeps all mode labels and start versus replacement wording explicit', () => {
    expect(gameModeLabel(null)).toBe('Campaign');
    expect(gameModeLabel('contest')).toBe('Contest');
    for (const mode of ['campaign', 'ladder', 'contest'] as const) {
      const label = mode === 'contest' ? 'Contest vs AI' : gameModeLabel(mode);
      expect(newGameActionLabel(empty, mode)).toBe(`Start ${label}`);
      expect(newGameActionLabel({status:'occupied'}, mode)).toBe(`Replace ${label}`);
      expect(newGameModeDescription(mode).length).toBeGreaterThan(30);
    }
  });
});
