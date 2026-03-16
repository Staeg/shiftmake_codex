import { describe, expect, it } from 'vitest';
import { enrichRiftRewards, generateCycleRifts } from './rift';
import { FACTION_UPGRADES, getFaction } from './unitCatalog';

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

  it('limits enemy combatants to each faction’s valid default roster', () => {
    const rifts = generateCycleRifts({ campaignSeed: 77, cycleNumber: 6 });

    rifts.forEach((rift) => {
      rift.enemyArmy.forEach((combatant) => {
        expect(getFaction(combatant.factionId).defaultUnitTypeIds).toContain(combatant.unitTypeId);
      });
    });
  });

  it('limits tier 1 rewards to a single small resource and tier 2 rewards to non-overlapping combinations', () => {
    const upgradePool = Object.keys(FACTION_UPGRADES).slice(0, 3);
    const signatures = new Set<string>();
    const tierOneSignatures = new Set<string>();

    for (let seed = 1; seed <= 40; seed += 1) {
      for (let cycle = 1; cycle <= 5; cycle += 1) {
        const rifts = enrichRiftRewards(
          generateCycleRifts({ campaignSeed: seed, cycleNumber: cycle }).map((rift) => ({ ...rift, mutatorIds: [] })),
          upgradePool,
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

    expect([...tierOneSignatures].sort()).toEqual(['e50', 'g50']);
    expect([...signatures].sort()).toEqual(['e50-u1', 'g100-e50', 'g108-e40', 'g50-e100', 'g50-u1', 'g58-e90']);
  });
});
