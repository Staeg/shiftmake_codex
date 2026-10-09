import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'svelte';
import type { RaceId, UnitClassId } from '../engine/types';
import { createTroopInstance, resolveTroopCombatant } from '../engine/army';
import { getUpgradeDetails } from './detailCards';
import { rivalInfoFixture } from './__fixtures__/rivalInfo';
import RivalInfoBoard from './RivalInfoBoard.svelte';

const Board = RivalInfoBoard as unknown as { render(props: ComponentProps<RivalInfoBoard>): { html: string } };
function setup() {
  const game = rivalInfoFixture();
  const props: ComponentProps<RivalInfoBoard> = { game,
    inspection: { preview: vi.fn(), clear: vi.fn(), pin: vi.fn(), highlightedKeys: new Set() },
    getRacePortrait: (race: RaceId) => `/race/${race}.png`,
    getRaceUnitPortrait: (race: RaceId, unit: UnitClassId) => `/troop/${race}/${unit}.png` };
  return { game, props, snapshot: game.contest!.opponentInfo!.playerTwo };
}

describe('rival information board', () => {
  it('renders revealed engine-resolved troops and upgrades without mutation or commands', () => {
    const { game, props, snapshot } = setup();
    const before = JSON.stringify(game);
    const html = Board.render(props).html;
    for (const troop of snapshot.troops) {
      const definition = resolveTroopCombatant(snapshot, troop, 'enemy', null, `known-player-two:${troop.id}`);
      expect(html).toContain(`Inspect opponent troop ${definition.label}`);
      expect(html).toContain(`${definition.quantity} ${definition.label} units`);
    }
    for (const upgrade of [...snapshot.raceUpgradeIds, ...snapshot.troopClassUpgradeIds]) {
      expect(html).toContain(getUpgradeDetails(upgrade).label);
    }
    expect(html).toContain('No known race upgrades');
    expect(JSON.stringify(game)).toBe(before);
    expect(props.inspection.preview).not.toHaveBeenCalled();
    expect(props.inspection.pin).not.toHaveBeenCalled();
  });

  it('uses the revealed snapshot rather than the later live rival roster', () => {
    const { props, game } = setup();
    const live = { ...game.contest!.players.playerTwo, troops: [createTroopInstance('dwarf', 'knight')] };
    const html = Board.render({ ...props, game: { ...game, contest: { ...game.contest!,
      players: { ...game.contest!.players, playerTwo: live } } } }).html;
    expect(html).toContain('Inspect opponent troop Human Wizard');
    expect(html).toContain('Inspect opponent troop Goblin Militia');
    expect(html).not.toContain('Dwarven Knight');
  });

  it('marks only currently unoccupied snapshot troops as mobile threats', () => {
    const { props, game } = setup();
    expect(Board.render(props).html.match(/class="troop-chip[^"\n]*opponent-threat/g)).toHaveLength(1);
    const released = { ...game, openRifts: game.openRifts.map(rift => ({ ...rift, occupyingTroopIds: [] })) };
    expect(Board.render({ ...props, game: released }).html.match(/class="troop-chip[^"\n]*opponent-threat/g)).toHaveLength(2);
  });

  it('scopes inspector selection to snapshot cycle and troop identity', () => {
    const { props, snapshot } = setup();
    const selected = Board.render({ ...props, inspection: { ...props.inspection,
      highlightedKeys: new Set([`opponent:1:${snapshot.troops[0]!.id}`]) } }).html;
    expect(selected).toMatch(/class="troop-chip[^"\n]*selected/);
    const stale = Board.render({ ...props, inspection: { ...props.inspection,
      highlightedKeys: new Set([`opponent:2:${snapshot.troops[0]!.id}`]) } }).html;
    expect(stale).not.toMatch(/class="troop-chip[^"\n]*selected/);
  });

  it('keeps unrevealed or non-Contest intel empty', () => {
    const { props, game } = setup();
    for (const value of [{ ...game, gameMode: 'campaign' as const },
      { ...game, contest: { ...game.contest!, opponentInfo: null } }]) {
      const html = Board.render({ ...props, game: value }).html;
      expect(html).toContain('No Intel Yet');
      expect(html).toContain('data-ui-name="Opponent info unknown"');
      expect(html).not.toContain('Inspect opponent troop');
    }
  });
});
