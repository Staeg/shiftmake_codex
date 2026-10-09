import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'svelte';
import type { RaceId, UnitClassId } from '../engine/types';
import { claimOpeningTroop, getOpeningRaceOptionIds, getOpeningRaceStarterTroopUnlockIds, startNewGame } from '../engine/game';
import { getRace, TROOP_CATALOG } from '../engine/unitCatalog';
import OpeningUnlockScreen from './OpeningUnlockScreen.svelte';

const ServerScreen = OpeningUnlockScreen as unknown as {
  render: (props: ComponentProps<OpeningUnlockScreen>) => { html: string };
};

function render(game = startNewGame(49), overrides: Partial<ComponentProps<OpeningUnlockScreen>['actions']> = {}) {
  const actions = { label: 'Begin Campaign', disabled: false, tutorialLocked: false,
    claim: vi.fn(), unclaim: vi.fn(), begin: vi.fn(), ...overrides };
  return { actions, ...ServerScreen.render({ game, actions,
    getRacePortrait: (race: RaceId) => `/race/${race}.png`, getRaceUnitPortrait: (race: RaceId, unitClass: UnitClassId) => `/unit/${race}/${unitClass}.png` }) };
}

describe('opening unlock screen', () => {
  it('renders the seeded included starters, future inspectors and disabled begin without performing commands', () => {
    const game = startNewGame(49);
    const { html, actions } = render(game);
    for (const race of getOpeningRaceOptionIds(game)) {
      const starter = TROOP_CATALOG[getOpeningRaceStarterTroopUnlockIds(game)[race]!]!;
      expect(html).toContain(`Choose ${getRace(race).label} with ${starter.label}`);
      expect(html).toContain(`Opening included troop ${starter.label}`);
    }
    expect(html).toContain('Choose Two Starting Races');
    expect(html).toContain('Inspect future unlock');
    expect(html).toMatch(/data-ui-name="Begin campaign button"[^>]*disabled/);
    expect(html).not.toContain('ability-hover-tooltip');
    for (const command of [actions.claim, actions.unclaim, actions.begin]) expect(command).not.toHaveBeenCalled();
  });

  it('keeps chosen cards deselectable and enables begin only after two starters', () => {
    let game = startNewGame(49);
    const starters = getOpeningRaceStarterTroopUnlockIds(game);
    const races = getOpeningRaceOptionIds(game);
    for (const race of races.slice(0, 2)) game = claimOpeningTroop(game, starters[race]!);
    const html = render(game).html;
    const choices = [...html.matchAll(/<button[^>]*aria-label="Choose [^"]+"[^>]*>/g)].map(match=>match[0]);
    expect(choices.filter(button=>button.includes('aria-pressed="true"'))).toHaveLength(2);
    for (const selected of choices.filter(button=>button.includes('aria-pressed="true"'))) expect(selected).not.toContain('disabled');
    expect(html).not.toMatch(/data-ui-name="Begin campaign button"[^>]*disabled/);
  });

  it('preserves submitted-session disabling and tutorial lock presentation', () => {
    const game = startNewGame(49);
    expect(render(game, { disabled: true, label: 'Waiting For Rival', tutorialLocked: true }).html).toContain('tutorial-scene-locked');
    expect(render(game, { label: 'Waiting For Rival' }).html).toContain('Waiting For Rival');
  });
});
