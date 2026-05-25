import { describe, expect, it } from 'vitest';
import { createTroopInstance, resolveTroopCombatant } from './army';
import { FACTIONS, FACTION_UPGRADES, getFactionNativeTroopUnlockIds, TROOP_TYPE_UPGRADES, UNIT_TYPES } from './unitCatalog';
import type { FactionId, ResolvedCombatantDefinition, UnitTypeId } from './types';
import { getAvailableTroopUnlockIds, upgradeAffectsTroop } from './upgrades';

function combatantDiffers(left: ResolvedCombatantDefinition, right: ResolvedCombatantDefinition): boolean {
  const statChanged = Object.keys(left.stats).some((stat) => left.stats[stat as keyof typeof left.stats] !== right.stats[stat as keyof typeof right.stats]);
  const leftAbilityIds = left.abilities.map((ability) => ability.id).sort();
  const rightAbilityIds = right.abilities.map((ability) => ability.id).sort();
  const leftAttributes = [...left.attributes].sort();
  const rightAttributes = [...right.attributes].sort();

  return statChanged || JSON.stringify(leftAbilityIds) !== JSON.stringify(rightAbilityIds) || JSON.stringify(leftAttributes) !== JSON.stringify(rightAttributes);
}

describe('troop unlock availability', () => {
  it('includes unowned native and Rift-earned troops for unlocked factions only', () => {
    const ownedNativeTroopUnlockId = 'human/soldier';
    const unownedNativeTroopUnlockId = getFactionNativeTroopUnlockIds('human').find((troopUnlockId) => troopUnlockId !== ownedNativeTroopUnlockId)!;

    const available = getAvailableTroopUnlockIds({
      unlockedFactionIds: ['human'],
      unlockedTroopUnlockIds: ['human/wizard', 'troll/wizard'],
      troops: [createTroopInstance('human', 'soldier')],
    });

    expect(available).toContain(unownedNativeTroopUnlockId);
    expect(available).toContain('human/wizard');
    expect(available).not.toContain(ownedNativeTroopUnlockId);
    expect(available).not.toContain('troll/wizard');
  });
});

describe('upgrade applicability', () => {
  it('matches the actual resolved troop changes for every upgrade and faction/unit pairing', () => {
    const factionIds = Object.keys(FACTIONS) as FactionId[];
    const unitTypeIds = Object.keys(UNIT_TYPES) as UnitTypeId[];
    const troops = factionIds.flatMap((factionId) => unitTypeIds.map((unitTypeId) => createTroopInstance(factionId, unitTypeId)));
    const upgradeIds = [...Object.keys(FACTION_UPGRADES), ...Object.keys(TROOP_TYPE_UPGRADES)];

    const mismatches = upgradeIds.flatMap((upgradeId) =>
      troops.flatMap((troop) => {
        const base = resolveTroopCombatant({ factionUpgradeIds: [], troopTypeUpgradeIds: [] }, troop, 'player');
        const upgraded = resolveTroopCombatant(
          upgradeId in FACTION_UPGRADES
            ? { factionUpgradeIds: [upgradeId], troopTypeUpgradeIds: [] }
            : { factionUpgradeIds: [], troopTypeUpgradeIds: [upgradeId] },
          troop,
          'player',
        );
        const actual = combatantDiffers(base, upgraded);
        const claimed = upgradeAffectsTroop(upgradeId, troop);
        return actual === claimed ? [] : [`${upgradeId} -> ${troop.factionId}/${troop.unitTypeId}: claimed ${claimed}, actual ${actual}`];
      }),
    );

    expect(mismatches).toEqual([]);
  });
});
