import { describe, expect, it } from 'vitest';
import { MUTATORS, composeBaseTroopDefinition, getMutator } from './unitCatalog';
import { generateCycleRifts } from './rift';

describe('rift generation', () => {
  it('returns a harmless placeholder for unknown mutator ids', () => {
    expect(getMutator('quagmire')).toEqual({
      id: 'quagmire',
      label: 'Quagmire',
      description:
        'Legacy or missing mutator "quagmire". This save references a mutator that is no longer present in the current catalog, so its gameplay effect is ignored.',
    });
  });

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

    expect([...seenMutators].sort()).toEqual(Object.keys(MUTATORS).sort());
  });

  it('keeps mutator and fit rolls broadly uniform across many generated Rifts', () => {
    const rifts = Array.from({ length: 250 }, (_, index) => generateCycleRifts({ campaignSeed: 800 + index, cycleNumber: 1 + index })).flat();
    const mutatorCounts = new Map<string, number>();
    const fitCounts = new Map<number, number>();

    rifts.forEach((rift) => {
      rift.mutatorIds.forEach((mutatorId) => {
        mutatorCounts.set(mutatorId, (mutatorCounts.get(mutatorId) ?? 0) + 1);
      });
      fitCounts.set(rift.saturation, (fitCounts.get(rift.saturation) ?? 0) + 1);
    });

    const mutatorFrequencies = [...mutatorCounts.values()];
    const fitFrequencies = [...fitCounts.values()];

    expect(mutatorCounts.size).toBe(Object.keys(MUTATORS).length);
    expect(fitCounts.size).toBe(13);
    expect(Math.max(...mutatorFrequencies) - Math.min(...mutatorFrequencies)).toBeLessThan(120);
    expect(Math.max(...fitFrequencies) - Math.min(...fitFrequencies)).toBeLessThan(80);
  });

  it('distributes mutators as evenly as possible within each cycle', () => {
    const cycles = Array.from({ length: 40 }, (_, index) => generateCycleRifts({ campaignSeed: 1200 + index, cycleNumber: index + 1 }));
    const mutatorPoolSize = Object.keys(MUTATORS).length;

    cycles.forEach((rifts) => {
      const counts = new Map<string, number>();
      rifts.flatMap((rift) => rift.mutatorIds).forEach((mutatorId) => {
        counts.set(mutatorId, (counts.get(mutatorId) ?? 0) + 1);
      });

      expect([...counts.values()].reduce((sum, count) => sum + count, 0)).toBe(rifts.length);
      if (mutatorPoolSize >= rifts.length) {
        expect([...counts.values()]).toEqual(Array.from({ length: rifts.length }, () => 1));
      } else {
        const frequencies = [...counts.values()];
        expect(Math.max(...frequencies) - Math.min(...frequencies)).toBeLessThanOrEqual(1);
      }
    });
  });

  it('adds enemy groups through tier 3, then holds tier 4 at the same group count while keeping player-derived quantities', () => {
    const rifts = Array.from({ length: 15 }, (_, index) => generateCycleRifts({ campaignSeed: 300 + index, cycleNumber: 6 + index })).flat();

    rifts.forEach((rift) => {
      const unlockIds = rift.enemyArmy.map((combatant) => `${combatant.raceId}/${combatant.unitClassId}`);
      const expectedEnemyGroups = Math.min(rift.tier, 3) + 1;

      expect(rift.enemyArmy).toHaveLength(expectedEnemyGroups);
      expect(new Set(unlockIds).size).toBe(rift.enemyArmy.length);

      rift.enemyArmy.forEach((combatant) => {
        const playerTroop = composeBaseTroopDefinition(combatant.raceId, combatant.unitClassId);
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
