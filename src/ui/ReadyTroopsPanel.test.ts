import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'svelte';
import { createTroopInstance, getTroopEffectiveDefinition } from '../engine/army';
import type { RaceId, UnitClassId } from '../engine/types';
import ReadyTroopsPanel from './ReadyTroopsPanel.svelte';
import { createTroopAssignmentInteraction } from './troopAssignmentInteraction';
import { draftFixture } from './__fixtures__/essenceDraft';

const Panel = ReadyTroopsPanel as unknown as { render(props: ComponentProps<ReadyTroopsPanel>): { html: string } };
function setup() {
  const game = draftFixture();
  const interaction = createTroopAssignmentInteraction({ runtime: () => { throw new Error('SSR must not attach inputs'); },
    isBlocked: () => false, describeTroop: () => null, onDrop: vi.fn(), onDragComplete: vi.fn() });
  const props: ComponentProps<ReadyTroopsPanel> = { game, interaction,
    planning: { editable: true, submitted: false, selectedTroopId: null, hintTroopId: null,
      attention: false, upgradeId: null, selectTroop: vi.fn() },
    inspection: { preview: vi.fn(), clear: vi.fn(), highlightedKeys: new Set() },
    getRaceUnitPortrait: (race: RaceId, unit: UnitClassId) => `/troop/${race}/${unit}.png` };
  return { props, game, interaction };
}

describe('ready troops surface', () => {
  it('shows resolved idle troops and preserves inspection/input identities without changing game data', () => {
    const { props, game } = setup();
    const original = JSON.stringify(game);
    const html = Panel.render(props).html;
    expect(html).toContain('data-ready-drop-target="true"');
    expect(html).toContain('data-tutorial-target="ready-troop"');
    for (const troop of game.troops) {
      const resolved = getTroopEffectiveDefinition(game, troop.id);
      expect(html).toContain(`Drag ${resolved.label} to a Rift`);
      expect(html).toContain(`${resolved.quantity} ${resolved.label} units`);
      expect(html).toContain(`data-assignment-hint-troop="${troop.id}"`);
    }
    expect(JSON.stringify(game)).toBe(original);
    expect(props.planning.selectTroop).not.toHaveBeenCalled();
    expect(props.inspection.preview).not.toHaveBeenCalled();
  });

  it('filters assigned and recovering troops and shows the empty state without inventing units', () => {
    const { props, game } = setup();
    const html = Panel.render({ ...props, game: { ...game,
      troops: game.troops.map((troop, index) => index === 0 ? { ...troop, assignmentRiftId: game.openRifts[0]!.id }
        : { ...troop, recoveryCyclesRemaining: 1 }) } }).html;
    expect(html).toContain('No idle troops are ready right now.');
    expect(html).not.toContain('data-tutorial-target="ready-troop"');
  });

  it('consumes explicit highlight/attention/hint/readonly and shared conflict state', () => {
    const { props, game, interaction } = setup();
    const troopId = game.troops[0]!.id;
    interaction.setConflict({ troopId, message: 'Conflict' });
    const html = Panel.render({ ...props, planning: { ...props.planning, editable: false,
      submitted: true, attention: true, hintTroopId: troopId }, inspection: { ...props.inspection,
      highlightedKeys: new Set([`ready:${troopId}`]) } }).html;
    expect(html).toMatch(/ready-troop-tile[^"\n]*selected[^"\n]*assignment-attention[^"\n]*assignment-hint-troop[^"\n]*conflict-pulse[^"\n]*readonly-plan/);
    expect(html).not.toContain('data-ready-drop-target=');
    expect(html).not.toContain('aria-label="Drag');
    expect(html).toContain('aria-label="Inspect');
  });

  it('retains density classes for large ready rosters', () => {
    const { props, game } = setup();
    const troops = Array.from({ length: 16 }, (_, index) => ({ ...createTroopInstance('goblin', 'militia'), id: `large-roster-${index}` }));
    const html = Panel.render({ ...props, game: { ...game, troops } }).html;
    expect(html).toMatch(/ready-troops-grid[^"\n]*roster-count-8[^"\n]*roster-count-12[^"\n]*roster-count-16/);
    expect(html).toContain('density-24');
    expect(html.match(/data-tutorial-target="ready-troop"/g)).toHaveLength(16);
  });
});
