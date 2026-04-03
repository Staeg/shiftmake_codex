import { describe, expect, it } from 'vitest';
import { composeBaseTroopDefinition } from './unitCatalog';
import { generateCycleRifts } from './rift';

describe('rift generation', () => {
  it('always creates four Rifts with saturation inside the configured range', () => {
    const rifts = Array.from({ length: 20 }, (_, index) => generateCycleRifts({ campaignSeed: 100 + index, cycleNumber: index + 1 })).flat();

    expect(rifts.every((rift) => rift.state === 'discovered')).toBe(true);
    expect(rifts).toHaveLength(80);
    expect(Math.min(...rifts.map((rift) => rift.saturation))).toBeGreaterThanOrEqual(3);
    expect(Math.max(...rifts.map((rift) => rift.saturation))).toBeLessThanOrEqual(15);
  });

  it('uses only the remaining combat mutators', () => {
    const seenMutators = new Set(
      Array.from({ length: 30 }, (_, index) => generateCycleRifts({ campaignSeed: 200 + index, cycleNumber: 1 + index }))
        .flatMap((rifts) => rifts.flatMap((rift) => rift.mutatorIds)),
    );

    expect([...seenMutators].sort()).toEqual(['heavy-air', 'momentum', 'quagmire']);
  });

  it('adds enemy groups through tier 3, then holds tier 4 at the same group count while keeping player-derived quantities', () => {
    const rifts = Array.from({ length: 15 }, (_, index) => generateCycleRifts({ campaignSeed: 300 + index, cycleNumber: 6 + index })).flat();

    rifts.forEach((rift) => {
      const unlockIds = rift.enemyArmy.map((combatant) => `${combatant.factionId}/${combatant.unitTypeId}`);
      const expectedEnemyGroups = Math.min(rift.tier, 3) + 1;

      expect(rift.enemyArmy).toHaveLength(expectedEnemyGroups);
      expect(new Set(unlockIds).size).toBe(rift.enemyArmy.length);

      rift.enemyArmy.forEach((combatant) => {
        const playerTroop = composeBaseTroopDefinition(combatant.factionId, combatant.unitTypeId);
        expect(playerTroop.attributes).not.toContain('summoned');
        expect(combatant.quantity).toBe(playerTroop.quantity);
      });
    });
  });

  it('shows VP reward equal to Rift tier', () => {
    const rifts = generateCycleRifts({ campaignSeed: 77, cycleNumber: 4 });

    expect(rifts.map((rift) => rift.victoryPoints)).toEqual(rifts.map((rift) => rift.tier));
  });
});
