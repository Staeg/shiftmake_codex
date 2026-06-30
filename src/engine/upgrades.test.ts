import { describe, expect, it } from 'vitest';
import { createTroopInstance, resolveTroopCombatant } from './army';
import { RACES, RACE_UPGRADES, getRaceNativeTroopUnlockIds, TROOP_CLASS_UPGRADES, UNIT_CLASSES } from './unitCatalog';
import type { RaceId, ResolvedCombatantDefinition, UnitClassId } from './types';
import { getAvailableTroopUnlockIds, upgradeAffectsTroop } from './upgrades';

const ALL_RACE_IDS = Object.keys(RACES) as RaceId[];
const ALL_UNIT_CLASS_IDS = Object.keys(UNIT_CLASSES) as UnitClassId[];
const ALL_TROOPS = ALL_RACE_IDS.flatMap((raceId) => ALL_UNIT_CLASS_IDS.map((unitClassId) => createTroopInstance(raceId, unitClassId)));
const ELVEN_BACKLINE_UPGRADE_UNIT_CLASSES: UnitClassId[] = ['druid', 'elementalist', 'archer', 'wizard', 'priest', 'ranger', 'necromancer', 'shaman'];

function combatantDiffers(left: ResolvedCombatantDefinition, right: ResolvedCombatantDefinition): boolean {
  const statChanged = Object.keys(left.stats).some((stat) => left.stats[stat as keyof typeof left.stats] !== right.stats[stat as keyof typeof right.stats]);
  const leftAbilityIds = left.abilities.map((ability) => ability.id).sort();
  const rightAbilityIds = right.abilities.map((ability) => ability.id).sort();
  const leftAttributes = [...left.attributes].sort();
  const rightAttributes = [...right.attributes].sort();
  const roleChanged = left.role !== right.role;

  return roleChanged || statChanged || JSON.stringify(leftAbilityIds) !== JSON.stringify(rightAbilityIds) || JSON.stringify(leftAttributes) !== JSON.stringify(rightAttributes);
}

function troopUnlockId(raceId: RaceId, unitClassId: UnitClassId): string {
  return `${raceId}/${unitClassId}`;
}

function raceTroopIds(raceId: RaceId, unitClassIds: UnitClassId[] = ALL_UNIT_CLASS_IDS): string[] {
  return unitClassIds.map((unitClassId) => troopUnlockId(raceId, unitClassId));
}

function unitClassIds(unitClassId: UnitClassId): string[] {
  return ALL_RACE_IDS.map((raceId) => troopUnlockId(raceId, unitClassId));
}

function actualAffectedTroopIds(upgradeId: string): string[] {
  return ALL_TROOPS.filter((troop) => {
    const base = resolveTroopCombatant({ raceUpgradeIds: [], troopClassUpgradeIds: [] }, troop, 'player');
    const upgraded = resolveTroopCombatant(
      upgradeId in RACE_UPGRADES
        ? { raceUpgradeIds: [upgradeId], troopClassUpgradeIds: [] }
        : { raceUpgradeIds: [], troopClassUpgradeIds: [upgradeId] },
      troop,
      'player',
    );
    return combatantDiffers(base, upgraded);
  }).map((troop) => troopUnlockId(troop.raceId, troop.unitClassId));
}

function claimedAffectedTroopIds(upgradeId: string): string[] {
  return ALL_TROOPS.filter((troop) => upgradeAffectsTroop(upgradeId, troop)).map((troop) => troopUnlockId(troop.raceId, troop.unitClassId));
}

const EXPECTED_AFFECTED_TROOPS_BY_UPGRADE: Record<string, string[]> = {
  'human-combined-arms': raceTroopIds('human'),
  'human-tubthumping': raceTroopIds('human'),
  'elf-feline-grace': raceTroopIds('elf', ELVEN_BACKLINE_UPGRADE_UNIT_CLASSES),
  'elven-forsaken': raceTroopIds('elf'),
  'elf-silvershot-doctrine': raceTroopIds('elf', ELVEN_BACKLINE_UPGRADE_UNIT_CLASSES),
  'goblin-behavior': raceTroopIds('goblin'),
  'goblin-pack': raceTroopIds('goblin'),
  'goblin-overwhelm-hex': raceTroopIds('goblin'),
  'troll-gargantuan-zeal': raceTroopIds('troll'),
  'troll-mossblood': raceTroopIds('troll'),
  'troll-rowdy-regrowth': raceTroopIds('troll'),
  'human-hold-the-standard': raceTroopIds('human'),
  'dwarf-diggy-hole': raceTroopIds('dwarf'),
  'dwarf-ale-and-hearty': raceTroopIds('dwarf'),
  'dwarf-stall-warts': raceTroopIds('dwarf'),
  'orc-seeing-red': raceTroopIds('orc'),
  'orc-first-blood': raceTroopIds('orc'),
  'orc-berserk': raceTroopIds('orc'),
  'fae-glamour': raceTroopIds('fae'),
  'fae-changeling': raceTroopIds('fae'),
  'fae-whimsy': raceTroopIds('fae'),
  'soldier-shield-drill': unitClassIds('soldier'),
  'soldier-dreamwork': unitClassIds('soldier'),
  'soldier-martyrs-zeal': unitClassIds('soldier'),
  'archer-crippling-shots': unitClassIds('archer'),
  'archer-barrage': unitClassIds('archer'),
  'archer-hexing-shots': unitClassIds('archer'),
  'avenger-sevenfold': unitClassIds('avenger'),
  'avenger-witness': unitClassIds('avenger'),
  'avenger-wages-of-virtue': unitClassIds('avenger'),
  'beastmaster-opening': unitClassIds('beastmaster'),
  'beastmaster-thrill-of-the-hunt': unitClassIds('beastmaster'),
  'beastmaster-throwing-axes': unitClassIds('beastmaster'),
  'champion-anointed-executioner': unitClassIds('champion'),
  'champion-honorable-duel': unitClassIds('champion'),
  'champion-triumph': unitClassIds('champion'),
  'knight-dine-in-hell': unitClassIds('knight'),
  'knight-sentinel-runes': unitClassIds('knight'),
  'knight-sunder': unitClassIds('knight'),
  'druid-forest-friends': unitClassIds('druid'),
  'druid-true-form': unitClassIds('druid'),
  'druid-ents-visage': unitClassIds('druid'),
  'elementalist-crackling-mitosis': unitClassIds('elementalist'),
  'elementalist-crack-exploits': unitClassIds('elementalist'),
  'elementalist-living-circuit': unitClassIds('elementalist'),
  'militia-rat-behavior': unitClassIds('militia'),
  'militia-dogpile': unitClassIds('militia'),
  'militia-crippling-hex': unitClassIds('militia'),
  'necromancer-hemomancy': unitClassIds('necromancer'),
  'necromancer-explosion-corpse': unitClassIds('necromancer'),
  'necromancer-saintbane': unitClassIds('necromancer'),
  'priest-bolstering-light': unitClassIds('priest'),
  'priest-holy-constructs': unitClassIds('priest'),
  'priest-mercy-before-dawn': unitClassIds('priest'),
  'ranger-on-the-hunt': unitClassIds('ranger'),
  'ranger-shadows-embrace': unitClassIds('ranger'),
  'ranger-hunters-zeal': unitClassIds('ranger'),
  'shaman-grave-vigor': unitClassIds('shaman'),
  'shaman-final-hex': unitClassIds('shaman'),
  'shaman-war-drums': unitClassIds('shaman'),
  'wizard-storm-rods': unitClassIds('wizard'),
  'wizard-spell-echo': unitClassIds('wizard'),
  'wizard-vulnerability-hex': unitClassIds('wizard'),
};

describe('troop unlock availability', () => {
  it('includes unowned native and Rift-earned troops for unlocked races only', () => {
    const ownedNativeTroopUnlockId = 'human/soldier';
    const unownedNativeTroopUnlockId = getRaceNativeTroopUnlockIds('human').find((troopUnlockId) => troopUnlockId !== ownedNativeTroopUnlockId)!;

    const available = getAvailableTroopUnlockIds({
      unlockedRaceIds: ['human'],
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
      [...Object.keys(RACE_UPGRADES), ...Object.keys(TROOP_CLASS_UPGRADES)].sort(),
    );
  });

  it('matches explicit design intent for every upgrade and race/unit pairing', () => {
    Object.entries(EXPECTED_AFFECTED_TROOPS_BY_UPGRADE).forEach(([upgradeId, expected]) => {
      expect(claimedAffectedTroopIds(upgradeId), upgradeId).toEqual(expected);
      expect(actualAffectedTroopIds(upgradeId), upgradeId).toEqual(expected);
    });
  });

  it('matches the actual resolved troop changes for every upgrade and race/unit pairing', () => {
    const upgradeIds = [...Object.keys(RACE_UPGRADES), ...Object.keys(TROOP_CLASS_UPGRADES)];

    const mismatches = upgradeIds.flatMap((upgradeId) =>
      ALL_TROOPS.flatMap((troop) => {
        const base = resolveTroopCombatant({ raceUpgradeIds: [], troopClassUpgradeIds: [] }, troop, 'player');
        const upgraded = resolveTroopCombatant(
          upgradeId in RACE_UPGRADES
            ? { raceUpgradeIds: [upgradeId], troopClassUpgradeIds: [] }
            : { raceUpgradeIds: [], troopClassUpgradeIds: [upgradeId] },
          troop,
          'player',
        );
        const actual = combatantDiffers(base, upgraded);
        const claimed = upgradeAffectsTroop(upgradeId, troop);
        return actual === claimed ? [] : [`${upgradeId} -> ${troop.raceId}/${troop.unitClassId}: claimed ${claimed}, actual ${actual}`];
      }),
    );

    expect(mismatches).toEqual([]);
  });
});
