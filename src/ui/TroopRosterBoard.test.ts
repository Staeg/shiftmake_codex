import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'svelte';
import type { RaceId, UnitClassId } from '../engine/types';
import { getTroopEffectiveDefinition } from '../engine/army';
import { getAvailableTroopUnlockIds } from '../engine/upgrades';
import { buildRaceDetail } from './detailCards';
import { draftFixture } from './__fixtures__/essenceDraft';
import TroopRosterBoard from './TroopRosterBoard.svelte';

const Board = TroopRosterBoard as unknown as { render(props: ComponentProps<TroopRosterBoard>): { html: string } };
function setup() {
  const game = draftFixture();
  const props: ComponentProps<TroopRosterBoard> = { game, selectedRaceId: null, selectedTroopId: null,
    inspection: { preview: vi.fn(), clear: vi.fn(), pin: vi.fn(), highlightedKeys: new Set() },
    getRacePortrait: (race: RaceId) => `/race/${race}.png`, getRaceUnitPortrait: (race: RaceId, unit: UnitClassId) => `/troop/${race}/${unit}.png`,
    selectRace: vi.fn(), selectTroop: vi.fn() };
  return { game, props };
}

describe('troop roster board', () => {
  it('renders owned races and engine-resolved troops without changing game data or issuing commands', () => {
    const { props, game } = setup();
    const original = JSON.stringify(game);
    const html = Board.render(props).html;
    for (const troop of game.troops) {
      const definition = getTroopEffectiveDefinition(game, troop.id);
      expect(html).toContain(`Inspect troop ${definition.label}`);
      expect(html).toContain(`${definition.quantity} ${definition.label} units`);
      expect(html).toContain(`/troop/${troop.raceId}/${troop.unitClassId}.png`);
    }
    expect(html).toContain('data-ui-name="Race card');
    expect(html).not.toContain('Available Troop Classes');
    expect(JSON.stringify(game)).toBe(original);
    expect(props.selectRace).not.toHaveBeenCalled();
    expect(props.selectTroop).not.toHaveBeenCalled();
    expect(props.inspection.pin).not.toHaveBeenCalled();
    expect(props.inspection.preview).not.toHaveBeenCalled();
  });

  it('exposes future classes only for a selected or inspector-highlighted owned race', () => {
    const { props, game } = setup();
    const race = game.troops[0]!.raceId;
    const unlocks = getAvailableTroopUnlockIds(game).filter(id => id.startsWith(`${race}/`));
    expect(unlocks.length).toBeGreaterThan(0);
    const selected = Board.render({ ...props, selectedRaceId: race }).html;
    const highlighted = Board.render({ ...props, inspection: { ...props.inspection,
      highlightedKeys: new Set([buildRaceDetail(race).detailKey]) } }).html;
    for (const html of [selected, highlighted]) {
      expect(html).toContain('Available Troop Classes');
      for (const id of unlocks) expect(html).toContain(`/troop/${id}.png`);
    }
  });

  it('keeps troop highlights and selection scoped to their identities', () => {
    const { props, game } = setup();
    const troop = game.troops[0]!;
    const selected = Board.render({ ...props, selectedTroopId: troop.id }).html;
    const highlighted = Board.render({ ...props, inspection: { ...props.inspection,
      highlightedKeys: new Set([`troop:${troop.id}`]) } }).html;
    for (const html of [selected, highlighted]) expect(html).toMatch(/class="troop-chip[^"\n]*selected/);
    expect(Board.render(props).html).not.toMatch(/class="troop-chip[^"\n]*selected/);
  });

  it('renders an empty authoritative roster without inventing races or troops', () => {
    const { props, game } = setup();
    const html = Board.render({ ...props, game: { ...game, troops: [], unlockedRaceIds: [] } }).html;
    expect(html).not.toContain('data-ui-name="Race card');
    expect(html).not.toContain('Inspect troop');
  });
});
