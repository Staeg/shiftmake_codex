import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { claimTroopOffer, claimUpgradeOffer, rerollTroopOffer } from '../engine/game';
import { createEssenceDraftSession } from './essenceDraftSession';
import { buildUpgradeDetail } from './detailCards';
import { draftFixture } from './__fixtures__/essenceDraft';

function setup() {
  const commands = { claimTroop: vi.fn(), claimUpgrade: vi.fn(), reroll: vi.fn(), pin: vi.fn() };
  const session = createEssenceDraftSession(commands);
  const game = draftFixture();
  session.synchronize(game, 'slot-1-cycle-1', false);
  const troop = game.activeTroopOffer!.optionTroopUnlockIds[0]!;
  const upgrade = game.activeUpgradeOffer!.optionUpgradeIds[0]!;
  const detail = buildUpgradeDetail(upgrade);
  return { commands, session, game, troop, upgrade, detail };
}

describe('Essence draft presentation session', () => {
  it('toggles independent selections and pins inspection without changing offers', () => {
    const { session, commands, game, troop, upgrade, detail } = setup();
    const original = JSON.stringify(game);
    session.selectTroop(troop, detail);
    session.selectUpgrade(upgrade, detail);
    expect(get(session)).toMatchObject({ selectedTroop: troop, selectedUpgrade: upgrade });
    session.selectTroop(troop, detail);
    expect(get(session)).toMatchObject({ selectedTroop: null, selectedUpgrade: upgrade });
    expect(commands.pin).toHaveBeenLastCalledWith(null);
    expect(JSON.stringify(game)).toBe(original);
    expect(commands.claimTroop).not.toHaveBeenCalled();
  });

  it('preserves confirmed cards through same-cycle sync and clears on context/new offers', () => {
    const { session, commands, game, troop, upgrade, detail } = setup();
    session.selectTroop(troop, detail);
    session.confirmTroop();
    session.confirmTroop();
    expect(commands.claimTroop).toHaveBeenCalledTimes(1);
    expect(commands.claimTroop).toHaveBeenCalledWith(troop);
    const claimedTroop = claimTroopOffer(game, troop);
    session.synchronize(claimedTroop, 'slot-1-cycle-1', false);
    expect(get(session).confirmedTroop).toBe(troop);
    session.selectUpgrade(upgrade, detail);
    session.confirmUpgrade();
    session.synchronize(claimUpgradeOffer(claimedTroop, upgrade), 'slot-1-cycle-1', false);
    expect(get(session)).toMatchObject({ confirmedTroop: troop, confirmedUpgrade: upgrade });
    session.synchronize(game, 'slot-1-cycle-1', false);
    expect(get(session)).toMatchObject({ confirmedTroop: null, confirmedUpgrade: null });
    session.selectTroop(troop, detail);
    session.synchronize(game, 'slot-2-cycle-1', false);
    expect(get(session).selectedTroop).toBeNull();
  });

  it('rerolls one side without losing the other selection and rejects a second reroll', () => {
    const { session, commands, game, troop, upgrade, detail } = setup();
    session.selectTroop(troop, detail);
    session.selectUpgrade(upgrade, detail);
    session.hoverReroll('troop');
    expect(get(session).hoveredReroll).toBe('troop');
    session.reroll('troop');
    expect(get(session)).toMatchObject({ selectedTroop: null, selectedUpgrade: upgrade, hoveredReroll: null });
    session.synchronize(rerollTroopOffer(game), 'slot-1-cycle-1', false);
    session.reroll('upgrade');
    expect(commands.reroll).toHaveBeenCalledTimes(1);
    expect(commands.reroll).toHaveBeenCalledWith('troop');
    expect(session.canReroll('upgrade')).toBe(false);
  });

  it('drops stale options and keeps submitted sessions read-only', () => {
    const { session, commands, game, troop, upgrade, detail } = setup();
    session.selectTroop(troop, detail);
    session.hoverUpgrade(upgrade);
    session.synchronize({ ...game, activeTroopOffer: null, activeUpgradeOffer: null }, 'slot-1-cycle-1', false);
    expect(get(session)).toMatchObject({ selectedTroop: null, hoveredUpgrade: null });
    commands.pin.mockClear();
    session.synchronize(game, 'slot-1-cycle-1', true);
    session.selectTroop(troop, detail);
    session.selectUpgrade(upgrade, detail);
    session.confirmTroop();
    session.confirmUpgrade();
    session.reroll('troop');
    expect(get(session).selectedTroop).toBeNull();
    for (const command of Object.values(commands)) expect(command).not.toHaveBeenCalled();
  });

  it('resets only selections when planning inspection changes, retaining confirmed cards', () => {
    const { session, game, troop, upgrade, detail } = setup();
    session.selectTroop(troop, detail);
    session.confirmTroop();
    session.synchronize(claimTroopOffer(game, troop), 'slot-1-cycle-1', false);
    session.selectUpgrade(upgrade, detail);
    session.hoverUpgrade(upgrade);
    session.resetSelections();
    expect(get(session)).toMatchObject({ selectedUpgrade: null, hoveredUpgrade: null, confirmedTroop: troop });
  });
});
