import { describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'svelte';
import { claimTroopOffer, claimUpgradeOffer } from '../engine/game';
import { TROOP_CATALOG } from '../engine/unitCatalog';
import { createEssenceDraftSession } from './essenceDraftSession';
import { buildUpgradeDetail, getUpgradeDetails } from './detailCards';
import EssenceDraftPanel from './EssenceDraftPanel.svelte';
import { draftFixture } from './__fixtures__/essenceDraft';

const ServerPanel = EssenceDraftPanel as unknown as {
  render(props: ComponentProps<EssenceDraftPanel>): { html: string };
};

function setup() {
  const game = draftFixture();
  const commands = { claimTroop: vi.fn(), claimUpgrade: vi.fn(), reroll: vi.fn(), pin: vi.fn() };
  const session = createEssenceDraftSession(commands);
  session.synchronize(game, 'qa', false);
  const props = { game, session, disabled: false, highlighted: false, cost: 2, revealLabel: 'Reveal Unlock Draft',
    reveal: vi.fn(), previewDetail: vi.fn(), clearDetail: vi.fn(),
    getRaceUnitPortrait: (race: string, unitClass: string) => `/unit/${race}/${unitClass}.png` };
  return { game, commands, session, props, troop: game.activeTroopOffer!.optionTroopUnlockIds[0]!,
    upgrade: game.activeUpgradeOffer!.optionUpgradeIds[0]! };
}

describe('Essence draft panel', () => {
  it('renders advertised choices and guarded confirmation without issuing commands', () => {
    const { game, props, commands } = setup();
    const html = ServerPanel.render(props).html;
    for (const id of game.activeTroopOffer!.optionTroopUnlockIds) expect(html).toContain(`Inspect troop unlock ${TROOP_CATALOG[id]!.label}`);
    for (const id of game.activeUpgradeOffer!.optionUpgradeIds) expect(html).toContain(getUpgradeDetails(id).label);
    expect(html).toMatch(/data-tutorial-target="confirm-draft-troop"[^>]*disabled/);
    expect(html).toMatch(/data-tutorial-target="confirm-draft-upgrade"[^>]*disabled/);
    expect(html).toContain('Bottom essence draft panel');
    for (const command of Object.values(commands)) expect(command).not.toHaveBeenCalled();
  });

  it('keeps confirmed cards when offers disappear and renders the remaining side', () => {
    const { game, session, props, troop, upgrade } = setup();
    session.selectTroop(troop, buildUpgradeDetail(upgrade));
    session.confirmTroop();
    const claimedTroop = claimTroopOffer(game, troop);
    session.synchronize(claimedTroop, 'qa', false);
    const halfHtml = ServerPanel.render({ ...props, game: claimedTroop }).html;
    expect(halfHtml).toContain(`Confirmed troop ${TROOP_CATALOG[troop]!.label}`);
    expect(halfHtml).toContain('Confirm Upgrade');
    expect(halfHtml).not.toContain('Confirm Troop');
    session.selectUpgrade(upgrade, buildUpgradeDetail(upgrade));
    session.confirmUpgrade();
    const claimedBoth = claimUpgradeOffer(claimedTroop, upgrade);
    session.synchronize(claimedBoth, 'qa', false);
    const html = ServerPanel.render({ ...props, game: claimedBoth }).html;
    expect(html).toContain(`Confirmed upgrade ${getUpgradeDetails(upgrade).label}`);
    expect(html).toContain('confirmed-check');
    expect(html).not.toContain('Preparing the mandatory draft');
  });

  it('disables all mutable controls for a submitted session', () => {
    const { props, session, troop, upgrade } = setup();
    session.selectTroop(troop, buildUpgradeDetail(upgrade));
    session.selectUpgrade(upgrade, buildUpgradeDetail(upgrade));
    const html = ServerPanel.render({ ...props, disabled: true }).html;
    for (const match of html.matchAll(/<button[^>]*>/g)) expect(match[0]).toContain('disabled');
  });
});
