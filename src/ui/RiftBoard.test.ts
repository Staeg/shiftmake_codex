import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'svelte';
import { writable } from 'svelte/store';
import { getTroopEffectiveDefinition } from '../engine/army';
import { resolveAssignedRifts } from '../engine/game';
import type { RaceId, UnitClassId } from '../engine/types';
import RiftBoard from './RiftBoard.svelte';
import { createTroopAssignmentInteraction } from './troopAssignmentInteraction';
import { draftFixture } from './__fixtures__/essenceDraft';
import { rivalInfoFixture } from './__fixtures__/rivalInfo';

const Board = RiftBoard as unknown as { render(props: ComponentProps<RiftBoard>): { html: string } };
function setup() {
  const base = draftFixture();
  const rift = base.openRifts[0]!;
  const game = { ...base, troops: base.troops.map(troop => ({ ...troop, assignmentRiftId: rift.id })) };
  const interaction = createTroopAssignmentInteraction({ runtime: () => { throw new Error('No input during SSR'); },
    isBlocked: () => false, describeTroop: () => null, onDragComplete: vi.fn(), onDrop: vi.fn() });
  const props: ComponentProps<RiftBoard> = { game, records: [], resolving: false, interaction,
    planning: { editable: true, submitted: false, selectedRiftId: null, selectedTroopId: null,
      hintRiftId: null, upgradeId: null, holdingTroopIds: new Set(), selectTroop: vi.fn() },
    inspection: { preview: vi.fn(), clear: vi.fn(), pin: vi.fn(), highlightedKeys: new Set() },
    getRaceUnitPortrait: (race: RaceId, unit: UnitClassId) => `/troop/${race}/${unit}.png` };
  return { props, game, rift, interaction };
}

describe('Rift board surface', () => {
  it('renders authoritative Rift and assigned troops with preserved input/debug targets and no commands', () => {
    const { props, game, rift } = setup();
    const original = JSON.stringify(game);
    const html = Board.render(props).html;
    expect(html).toContain(`data-rift-id="${rift.id}"`);
    expect(html).toContain(`data-rift-drop-target="${rift.id}"`);
    expect(html).toContain('data-tutorial-target="rift-enemy"');
    expect(html).toContain('data-tutorial-target="rift-mutator"');
    for (const troop of game.troops) {
      const definition = getTroopEffectiveDefinition(game, troop.id);
      expect(html).toContain(`Drag ${definition.label} to another Rift or Available Troops`);
      expect(html).toContain(`${definition.quantity} ${definition.label} units`);
    }
    expect(props.planning.selectTroop).not.toHaveBeenCalled();
    expect(props.inspection.pin).not.toHaveBeenCalled();
    expect(props.inspection.preview).not.toHaveBeenCalled();
    expect(JSON.stringify(game)).toBe(original);
  });

  it('uses explicit inspection/selection/hint/holding inputs and omits writable drop targets for submitted plans', () => {
    const { props, game, rift } = setup();
    const html = Board.render({ ...props, planning: { ...props.planning,
      editable: false, submitted: true, selectedRiftId: rift.id,
      selectedTroopId: game.troops[0]!.id, hintRiftId: rift.id,
      holdingTroopIds: new Set([game.troops[0]!.id]) },
      inspection: { ...props.inspection, highlightedKeys: new Set([`enemy:${rift.id}:${rift.enemyArmy[0]!.combatantId}`]) } }).html;
    expect(html).toMatch(/rift-card[^"\n]*archive-highlighted[^"\n]*assignment-hint-rift/);
    expect(html).toMatch(/assigned-summary-tile[^"\n]*selected[^"\n]*holding[^"\n]*readonly-plan/);
    expect(html).toMatch(/enemy-tile[^"\n]*selected/);
    expect(html).not.toContain('data-rift-drop-target=');
    expect(html).not.toContain('aria-label="Drag');
  });

  it('displays conflicts from the shared interaction owner without creating a second owner', () => {
    const { props, interaction, rift } = setup();
    interaction.setConflict({ riftId: rift.id, message: 'One troop per race.' });
    expect(Board.render(props).html).toContain('One troop per race.');
    interaction.setConflict(null);
    expect(Board.render(props).html).not.toContain('One troop per race.');
  });

  it('renders an active pointer preview from the shared owner while preserving engine eligibility feedback', () => {
    const { props, game, rift, interaction } = setup();
    const state = writable({ conflict: null, drag: { troopId: game.troops[0]!.id,
      sourceRiftId: rift.id, pointerId: 1, startX: 0, startY: 0, x: 10, y: 10,
      active: true, label: 'Preview troop', portraitUrl: '/preview.png',
      dropTarget: { kind: 'rift' as const, riftId: rift.id } } });
    const html = Board.render({ ...props, interaction: { ...interaction, subscribe: state.subscribe } }).html;
    expect(html).toMatch(/rift-card[^"\n]*drop-target-active/);
    expect(html).toContain('drop-preview-tile');
    expect(html).toContain('/preview.png');
    expect(html).toContain('dragging-source');
  });

  it('renders Contest occupation labels and keeps resolved animation phase geometry targets', () => {
    const { props, game, rift } = setup();
    const rival = rivalInfoFixture();
    const staticHtml = Board.render({ ...props, game: rival, opponentName: 'Ada' }).html;
    expect(staticHtml).toContain('Held By Ada');
    expect(staticHtml).toContain('contest-ai-held');
    const records = resolveAssignedRifts({ ...game, openRifts: [rift] }).records;
    const original = JSON.stringify(records);
    const html = Board.render({ ...props, records, resolving: true }).html;
    expect(html).toContain('rift-battle-animation');
    expect(html).toContain(`data-flight-replay-id="${records[0]!.replay.id}"`);
    expect(html).toContain('phase-now');
    expect(html).toContain('aria-label="Inspect');
    expect(JSON.stringify(records)).toBe(original);
  });
});
