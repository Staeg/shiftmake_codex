import { describe, expect, it } from 'vitest';
import { RACE_UPGRADES, TROOP_CLASS_UPGRADES } from '../engine/unitCatalog';
import { buildArchiveDetails, healthPercent } from './archiveDetails';
import { archiveFixture } from './__fixtures__/archive';

describe('archive detail presentation', () => {
  it('derives health and damage bars from resolved replay data without mutation', () => {
    const { entry, payload, replay } = archiveFixture();
    const original = JSON.stringify({ payload, replay });
    const details = buildArchiveDetails(entry, payload, replay);
    const final = replay.steps.at(-1)?.snapshot.units ?? replay.initial.units;
    for (const side of ['player', 'enemy'] as const) {
      const combatant = details.combatants[side][0]!;
      const units = final.filter(unit => unit.side === side && unit.troopLabel === combatant.label);
      const hp = units.reduce((sum, unit) => sum + (unit.alive ? Math.max(0, unit.hp) : 0), 0);
      const max = units.reduce((sum, unit) => sum + unit.maxHp, 0);
      const performance = details.performance.get(`${side}:${combatant.label}`)!;
      expect(performance.healthPercent).toBe(healthPercent(hp, max));
      expect(performance.damagePercent).toBeGreaterThanOrEqual(0);
      expect(performance.damagePercent).toBeLessThanOrEqual(100);
    }
    expect(JSON.stringify({ payload, replay })).toBe(original);
  });

  it('uses participant provenance, filters unrelated upgrades and repairs only display quantity', () => {
    const { entry, payload } = archiveFixture();
    const humanUpgrade = Object.entries(RACE_UPGRADES).find(([, upgrade]) => upgrade.raceId === 'human')![0];
    const elfUpgrade = Object.entries(RACE_UPGRADES).find(([, upgrade]) => upgrade.raceId === 'elf')![0];
    const knightUpgrade = Object.entries(TROOP_CLASS_UPGRADES).find(([, upgrade]) => upgrade.unitClassId === 'knight')![0];
    payload.input.playerRaceUpgradeIds = [humanUpgrade, elfUpgrade];
    payload.input.playerTroopClassUpgradeIds = [knightUpgrade];
    payload.input.playerCombatants[0]!.quantity = 0;
    const details = buildArchiveDetails({ ...entry, sideParticipants: {
      player: { kind: 'opponent', label: 'Rival' }, enemy: { kind: 'neutral', label: 'Guardians' } } }, payload, null);
    expect(details.participants.player.label).toBe('Rival');
    expect(details.upgrades.player).toEqual([humanUpgrade]);
    expect(details.combatants.player[0]!.quantity).toBe(1);
    expect(payload.input.playerCombatants[0]!.quantity).toBe(0);
    expect(details.performance.size).toBe(0);
    expect(buildArchiveDetails(null, null, null).combatants.player).toEqual([]);
  });
});
