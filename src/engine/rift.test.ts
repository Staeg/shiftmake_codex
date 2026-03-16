import { describe, expect, it } from 'vitest';
import { enrichRiftRewards, generateCycleRifts } from './rift';
import { FACTION_UPGRADES, UNIT_TYPES } from './unitCatalog';

function rewardSignature(rift: ReturnType<typeof generateCycleRifts>[number]): string {
  const parts: string[] = [];
  if (rift.rewardPackage.resources.gold > 0) {
    parts.push(`g${rift.rewardPackage.resources.gold}`);
  }
  if (rift.rewardPackage.resources.essence > 0) {
    parts.push(`e${rift.rewardPackage.resources.essence}`);
  }
  if (rift.rewardPackage.upgradeChoiceBatches > 0) {
    parts.push(`u${rift.rewardPackage.upgradeChoiceBatches}`);
  }
  if (rift.rewardPackage.blueprintChoiceCountByTier.length > 0) {
    parts.push(`b${rift.rewardPackage.blueprintChoiceCountByTier.join('.')}`);
  }
  return parts.join('-');
}

describe('rift generation', () => {
  it('keeps per-rift saturation inside the configured random range', () => {
    const saturations = Array.from({ length: 20 }, (_, index) => generateCycleRifts({ campaignSeed: 100 + index, cycleNumber: index + 1 }))
      .flat()
      .map((rift) => rift.saturation);

    expect(Math.min(...saturations)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...saturations)).toBeLessThanOrEqual(15);
  });

  it('allows enemy combatants to use any troop type across factions', () => {
    const rifts = Array.from({ length: 20 }, (_, index) => generateCycleRifts({ campaignSeed: 77 + index, cycleNumber: 6 + index })).flat();
    const seenNonDefaultCombo = rifts.some((rift) =>
      rift.enemyArmy.some(
        (combatant) =>
          (combatant.factionId === 'human' && combatant.unitTypeId === 'shaman') ||
          (combatant.factionId === 'elf' && combatant.unitTypeId === 'champion'),
      ),
    );

    rifts.forEach((rift) => {
      rift.enemyArmy.forEach((combatant) => {
        expect(Object.keys(UNIT_TYPES)).toContain(combatant.unitTypeId);
      });
    });

    expect(seenNonDefaultCombo).toBe(true);
  });

  it('limits tier 1 rewards to a single small resource and tier 2 rewards to non-overlapping combinations', () => {
    const upgradePool = Object.keys(FACTION_UPGRADES).slice(0, 3);
    const blueprintPool = ['human/avenger', 'elf/elementalist', 'goblin/beastmaster', 'troll/necromancer'];
    const signatures = new Set<string>();
    const tierOneSignatures = new Set<string>();

    for (let seed = 1; seed <= 40; seed += 1) {
      for (let cycle = 1; cycle <= 5; cycle += 1) {
        const rifts = enrichRiftRewards(
          generateCycleRifts({ campaignSeed: seed, cycleNumber: cycle }).map((rift) => ({ ...rift, mutatorIds: [] })),
          upgradePool,
          blueprintPool,
        );
        rifts.forEach((rift) => {
          const signature = rewardSignature(rift);
          if (rift.tier === 1) {
            tierOneSignatures.add(signature);
          }
          if (rift.tier === 2) {
            signatures.add(signature);
          }
        });
      }
    }

    expect([...tierOneSignatures].sort()).toEqual(['b1', 'e50', 'g50']);
    expect([...signatures].sort()).toEqual(['e100-b1', 'e50-b2', 'e50-u1', 'g100-b1', 'g100-e50', 'g50-b2', 'g50-e100', 'g50-u1', 'u1-b1']);
  });

  it('falls back to bonus resources when no blueprint rewards remain', () => {
    const [rift] = enrichRiftRewards(
      [{ ...generateCycleRifts({ campaignSeed: 9, cycleNumber: 1 })[0], tier: 1, mutatorIds: [] }],
      [],
      [],
    );

    expect(rift.rewardPackage.blueprintChoiceCountByTier).toEqual([]);
  });
});
