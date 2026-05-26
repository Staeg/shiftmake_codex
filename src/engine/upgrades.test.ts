import { describe, expect, it } from 'vitest';
import { createTroopInstance, resolveTroopCombatant } from './army';
import { FACTIONS, FACTION_UPGRADES, getFactionNativeTroopUnlockIds, TROOP_TYPE_UPGRADES, UNIT_TYPES } from './unitCatalog';
import type { FactionId, ResolvedCombatantDefinition, UnitTypeId } from './types';
import { getAvailableTroopUnlockIds, upgradeAffectsTroop } from './upgrades';

const ALL_FACTION_IDS = Object.keys(FACTIONS) as FactionId[];
const ALL_UNIT_TYPE_IDS = Object.keys(UNIT_TYPES) as UnitTypeId[];
const ALL_TROOPS = ALL_FACTION_IDS.flatMap((factionId) => ALL_UNIT_TYPE_IDS.map((unitTypeId) => createTroopInstance(factionId, unitTypeId)));
const ELVEN_BACKLINE_UPGRADE_UNIT_TYPES: UnitTypeId[] = ['druid', 'elementalist', 'archer', 'wizard', 'priest', 'ranger', 'necromancer', 'shaman'];
const GOBLIN_PACK_UNIT_TYPES = ALL_UNIT_TYPE_IDS.filter((unitTypeId) => unitTypeId !== 'wolf');

function combatantDiffers(left: ResolvedCombatantDefinition, right: ResolvedCombatantDefinition): boolean {
  const statChanged = Object.keys(left.stats).some((stat) => left.stats[stat as keyof typeof left.stats] !== right.stats[stat as keyof typeof right.stats]);
  const leftAbilityIds = left.abilities.map((ability) => ability.id).sort();
  const rightAbilityIds = right.abilities.map((ability) => ability.id).sort();
  const leftAttributes = [...left.attributes].sort();
  const rightAttributes = [...right.attributes].sort();

  return statChanged || JSON.stringify(leftAbilityIds) !== JSON.stringify(rightAbilityIds) || JSON.stringify(leftAttributes) !== JSON.stringify(rightAttributes);
}

function troopUnlockId(factionId: FactionId, unitTypeId: UnitTypeId): string {
  return `${factionId}/${unitTypeId}`;
}

function factionTroopIds(factionId: FactionId, unitTypeIds: UnitTypeId[] = ALL_UNIT_TYPE_IDS): string[] {
  return unitTypeIds.map((unitTypeId) => troopUnlockId(factionId, unitTypeId));
}

function troopTypeIds(unitTypeId: UnitTypeId): string[] {
  return ALL_FACTION_IDS.map((factionId) => troopUnlockId(factionId, unitTypeId));
}

function actualAffectedTroopIds(upgradeId: string): string[] {
  return ALL_TROOPS.filter((troop) => {
    const base = resolveTroopCombatant({ factionUpgradeIds: [], troopTypeUpgradeIds: [] }, troop, 'player');
    const upgraded = resolveTroopCombatant(
      upgradeId in FACTION_UPGRADES
        ? { factionUpgradeIds: [upgradeId], troopTypeUpgradeIds: [] }
        : { factionUpgradeIds: [], troopTypeUpgradeIds: [upgradeId] },
      troop,
      'player',
    );
    return combatantDiffers(base, upgraded);
  }).map((troop) => troopUnlockId(troop.factionId, troop.unitTypeId));
}

function claimedAffectedTroopIds(upgradeId: string): string[] {
  return ALL_TROOPS.filter((troop) => upgradeAffectsTroop(upgradeId, troop)).map((troop) => troopUnlockId(troop.factionId, troop.unitTypeId));
}

const EXPECTED_AFFECTED_TROOPS_BY_UPGRADE: Record<string, string[]> = {
  'human-combined-arms': factionTroopIds('human'),
  'human-tubthumping': factionTroopIds('human'),
  'elf-elven-reflexes': factionTroopIds('elf', ELVEN_BACKLINE_UPGRADE_UNIT_TYPES),
  'elven-forsaken': factionTroopIds('elf'),
  'elf-silvershot-doctrine': factionTroopIds('elf', ELVEN_BACKLINE_UPGRADE_UNIT_TYPES),
  'goblin-behavior': factionTroopIds('goblin'),
  'goblin-pack': factionTroopIds('goblin', GOBLIN_PACK_UNIT_TYPES),
  'goblin-loot-frenzy': factionTroopIds('goblin'),
  'troll-roll-the-boulder': factionTroopIds('troll'),
  'troll-mossblood': factionTroopIds('troll'),
  'troll-rowdy-regrowth': factionTroopIds('troll'),
  'human-hold-the-standard': factionTroopIds('human'),
  'dwarf-diggy-hole': factionTroopIds('dwarf'),
  'dwarf-ale-and-hearty': factionTroopIds('dwarf'),
  'dwarf-stall-warts': factionTroopIds('dwarf'),
  'orc-seeing-red': factionTroopIds('orc'),
  'orc-first-blood': factionTroopIds('orc'),
  'orc-berserk': factionTroopIds('orc'),
  'fae-glamour': factionTroopIds('fae'),
  'fae-changeling': factionTroopIds('fae'),
  'fae-whimsy': factionTroopIds('fae'),
  'soldier-shield-drill': troopTypeIds('soldier'),
  'archer-crippling-shots': troopTypeIds('archer'),
  'avenger-sevenfold': troopTypeIds('avenger'),
  'avenger-witness': troopTypeIds('avenger'),
  'beastmaster-bloodhounds': troopTypeIds('beastmaster'),
  'beastmaster-thrill-of-the-hunt': troopTypeIds('beastmaster'),
  'champion-anointed-executioner': troopTypeIds('champion'),
  'knight-dine-in-hell': troopTypeIds('knight'),
  'knight-sentinel-runes': troopTypeIds('knight'),
  'druid-forest-friends': troopTypeIds('druid'),
  'druid-true-form': troopTypeIds('druid'),
  'druid-ents-visage': troopTypeIds('druid'),
  'elementalist-crackling-mitosis': troopTypeIds('elementalist'),
  'elementalist-living-circuit': troopTypeIds('elementalist'),
  'militia-rat-behavior': troopTypeIds('militia'),
  'militia-dogpile': troopTypeIds('militia'),
  'necromancer-hemomancy': troopTypeIds('necromancer'),
  'necromancer-explosion-corpse': troopTypeIds('necromancer'),
  'priest-bolstering-light': troopTypeIds('priest'),
  'priest-mercy-before-dawn': troopTypeIds('priest'),
  'ranger-on-the-hunt': troopTypeIds('ranger'),
  'ranger-shadows-embrace': troopTypeIds('ranger'),
  'shaman-grave-vigor': troopTypeIds('shaman'),
  'shaman-war-drums': troopTypeIds('shaman'),
  'wizard-storm-rods': troopTypeIds('wizard'),
  'wizard-spell-echo': troopTypeIds('wizard'),
};

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
  it('has an intent-level expected affected troop list for every upgrade', () => {
    expect(Object.keys(EXPECTED_AFFECTED_TROOPS_BY_UPGRADE).sort()).toEqual(
      [...Object.keys(FACTION_UPGRADES), ...Object.keys(TROOP_TYPE_UPGRADES)].sort(),
    );
  });

  it('matches explicit design intent for every upgrade and faction/unit pairing', () => {
    Object.entries(EXPECTED_AFFECTED_TROOPS_BY_UPGRADE).forEach(([upgradeId, expected]) => {
      expect(claimedAffectedTroopIds(upgradeId), upgradeId).toEqual(expected);
      expect(actualAffectedTroopIds(upgradeId), upgradeId).toEqual(expected);
    });
  });

  it('matches the actual resolved troop changes for every upgrade and faction/unit pairing', () => {
    const upgradeIds = [...Object.keys(FACTION_UPGRADES), ...Object.keys(TROOP_TYPE_UPGRADES)];

    const mismatches = upgradeIds.flatMap((upgradeId) =>
      ALL_TROOPS.flatMap((troop) => {
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
