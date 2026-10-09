import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'svelte';
import type { RaceId, UnitClassId } from '../engine/types';
import { applyCycleOutcomes, claimRaceUnlockOffer, startNewGame } from '../engine/game';
import { getRace, getRaceNativeTroopUnlockIds, TROOP_CATALOG } from '../engine/unitCatalog';
import ScheduledUnlockScreen from './ScheduledUnlockScreen.svelte';

const ServerScreen = ScheduledUnlockScreen as unknown as {
  render: (props: ComponentProps<ScheduledUnlockScreen>) => { html: string };
};

function render(game: ComponentProps<ScheduledUnlockScreen>['game'], disabled = false) {
  const actions = { disabled, waitingLabel: disabled ? 'Waiting For Rival' : null,
    claimRace: vi.fn(), claimTroop: vi.fn() };
  return { actions, ...ServerScreen.render({ game, actions,
    getRacePortrait: (race: RaceId) => `/race/${race}.png`, getRaceUnitPortrait: (race: RaceId, unitClass: UnitClassId) => `/unit/${race}/${unitClass}.png` }) };
}

describe('scheduled unlock screen', () => {
  const cycleThree = applyCycleOutcomes({ ...startNewGame(49), phase: 'planning', cycleNumber: 2 }, { records: [] }).nextState;

  it('renders engine-generated choices without claiming or preselecting a race', () => {
    const { html, actions } = render(cycleThree);
    for (const race of cycleThree.activeRaceUnlockOffer!.optionRaceIds) {
      expect(html).toContain(`Select ${getRace(race).label}`);
      for (const troop of cycleThree.activeRaceUnlockOffer!.troopUnlockIdsByRaceId[race]!) {
        expect(html).toContain(`Inspect included troop ${TROOP_CATALOG[troop]!.label}`);
      }
    }
    expect(html).toContain('Cycle 3 Muster');
    expect(html).toMatch(/<button[^>]*disabled[^>]*>\s*Confirm Race/);
    expect(actions.claimRace).not.toHaveBeenCalled();
    expect(actions.claimTroop).not.toHaveBeenCalled();
  });

  it('renders later offers and submitted-session read-only controls', () => {
    const withRace = claimRaceUnlockOffer(cycleThree, cycleThree.activeRaceUnlockOffer!.optionRaceIds[0]!);
    const cycleSeven = applyCycleOutcomes({ ...withRace, phase: 'planning', cycleNumber: 6 }, { records: [] }).nextState;
    const html = render(cycleSeven, true).html;
    expect(html).toContain('Cycle 7 Muster');
    expect(html).toContain('Waiting For Rival');
    for (const choice of html.matchAll(/<button[^>]*aria-label="Select [^"]+"[^>]*>/g)) expect(choice[0]).toContain('disabled');
    expect(cycleSeven.activeRaceUnlockOffer!.troopUnlockChoiceCount).toBe(3);
    for (const race of cycleSeven.activeRaceUnlockOffer!.optionRaceIds) {
      for (const troop of cycleSeven.activeRaceUnlockOffer!.troopUnlockIdsByRaceId[race]!) {
        expect(html).toContain(`Inspect included troop ${TROOP_CATALOG[troop]!.label}`);
      }
    }
  });

  it('keeps legacy troop choices available only when commands are enabled', () => {
    const raceId = cycleThree.activeRaceUnlockOffer!.optionRaceIds[0]!;
    const game = { ...cycleThree, phase: 'troop_class_unlock' as const, activeRaceUnlockOffer: null,
      activeTroopClassUnlockOffer: { kind: 'troop_class_unlock' as const, raceId, cycleNumber: 3,
        remainingChoices: 2, optionTroopUnlockIds: getRaceNativeTroopUnlockIds(raceId) } };
    const { html, actions } = render(game, true);
    expect(html).toContain('Choose Troop Class 2');
    const choices = [...html.matchAll(/<button[^>]*aria-label="Inspect troop unlock [^"]+"[^>]*>/g)];
    expect(choices.length).toBeGreaterThan(0);
    for (const choice of choices) expect(choice[0]).toContain('disabled');
    expect(actions.claimTroop).not.toHaveBeenCalled();
    expect(render({ ...game, phase: 'planning' }).html.trim()).toBe('');
  });
});
