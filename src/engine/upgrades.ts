import { applyStatModifier, composeBaseTroopDefinition, RACE_UPGRADES, getAbility, getRaceNativeTroopUnlockIds, TROOP_CLASS_UPGRADES } from './unitCatalog';
import type { AbilityId, RaceId, GameState, TroopInstance, TroopUnlockId, UpgradeId } from './types';

export function getAllUpgradeIds(): UpgradeId[] {
  return [...Object.keys(RACE_UPGRADES), ...Object.keys(TROOP_CLASS_UPGRADES)];
}

export function getUnownedUpgradeIds(state: Pick<GameState, 'raceUpgradeIds' | 'troopClassUpgradeIds'>): UpgradeId[] {
  return getAllUpgradeIds().filter(
    (upgradeId) => !state.raceUpgradeIds.includes(upgradeId) && !state.troopClassUpgradeIds.includes(upgradeId),
  );
}

export function getClaimableTroopUnlockIds(state: Pick<GameState, 'unlockedRaceIds' | 'unlockedTroopUnlockIds'>): TroopUnlockId[] {
  const unlockedRaceIds = new Set(state.unlockedRaceIds);
  const nativeTroopUnlockIds = state.unlockedRaceIds.flatMap((raceId) => getRaceNativeTroopUnlockIds(raceId));
  const latentTroopUnlockIds = state.unlockedTroopUnlockIds.filter((troopUnlockId) => {
    const [raceId] = troopUnlockId.split('/') as [RaceId, string];
    return unlockedRaceIds.has(raceId);
  });

  return [...new Set([...nativeTroopUnlockIds, ...latentTroopUnlockIds])];
}

export function getOwnedTroopUnlockIds(state: Pick<GameState, 'troops'>): TroopUnlockId[] {
  return state.troops.map((troop) => `${troop.raceId}/${troop.unitClassId}`);
}

export function getAvailableTroopUnlockIds(
  state: Pick<GameState, 'troops' | 'unlockedRaceIds' | 'unlockedTroopUnlockIds'>,
): TroopUnlockId[] {
  const ownedTroopUnlockIds = new Set(getOwnedTroopUnlockIds(state));
  return getClaimableTroopUnlockIds(state).filter((troopUnlockId) => !ownedTroopUnlockIds.has(troopUnlockId));
}

export function describeTroopUnlock(troopUnlockId: TroopUnlockId): string {
  const [raceId, unitClassId] = troopUnlockId.split('/') as [RaceId, string];
  return composeBaseTroopDefinition(raceId, unitClassId).label;
}

function hasRangedOrCasterTag(troop: TroopInstance): boolean {
  const definition = composeBaseTroopDefinition(troop.raceId, troop.unitClassId);
  return definition.attributes.includes('ranged') || definition.attributes.includes('caster');
}

function canAbilityAffectTroop(abilityId: AbilityId, troop: TroopInstance): boolean {
  const definition = composeBaseTroopDefinition(troop.raceId, troop.unitClassId);
  if (abilityId === 'fade-into-shadow') {
    return definition.role === 'backline';
  }
  if (abilityId === 'long-shot-doctrine' || abilityId === 'silver-distance') {
    return hasRangedOrCasterTag(troop);
  }
  return true;
}

function raceUpgradeAffectsTroop(upgradeId: UpgradeId, troop: TroopInstance): boolean {
  const upgrade = RACE_UPGRADES[upgradeId];
  if (!upgrade || upgrade.raceId !== troop.raceId) {
    return false;
  }

  const definition = composeBaseTroopDefinition(troop.raceId, troop.unitClassId);
  return upgrade.effects.some((effect) => {
    if (effect.kind === 'addAbility') {
      return canAbilityAffectTroop(effect.abilityId, troop) && !definition.abilities.some((ability) => ability.id === getAbility(effect.abilityId).id);
    }

    if (effect.kind === 'addAttribute') {
      return !definition.attributes.includes(effect.attribute);
    }

    if (effect.unitFilter === 'nonMelee' && definition.attributes.includes('melee')) {
      return false;
    }

    const modified = applyStatModifier(definition.stats, effect.statModifiers, definition.attributes);
    return Object.keys(effect.statModifiers).some((stat) => modified[stat as keyof typeof modified] !== definition.stats[stat as keyof typeof definition.stats]);
  });
}

function troopClassUpgradeAffectsTroop(upgradeId: UpgradeId, troop: TroopInstance): boolean {
  const upgrade = TROOP_CLASS_UPGRADES[upgradeId];
  if (!upgrade || upgrade.unitClassId !== troop.unitClassId) {
    return false;
  }

  const definition = composeBaseTroopDefinition(troop.raceId, troop.unitClassId);
  return upgrade.effects.some((effect) => {
    if (effect.kind === 'addAbility') {
      return !definition.abilities.some((ability) => ability.id === getAbility(effect.abilityId).id);
    }

    if (effect.kind === 'replaceAbility') {
      return definition.abilities.some((ability) => ability.id === effect.removeAbilityId)
        && !definition.abilities.some((ability) => ability.id === effect.addAbilityId);
    }

    if (effect.kind === 'addAttribute') {
      return !definition.attributes.includes(effect.attribute);
    }

    if (effect.kind === 'removeAttribute') {
      return definition.attributes.includes(effect.attribute);
    }

    if (effect.kind === 'setRole') {
      return definition.role !== effect.role;
    }

    const modified = applyStatModifier(definition.stats, effect.statModifiers, definition.attributes);
    return Object.keys(effect.statModifiers).some((stat) => modified[stat as keyof typeof modified] !== definition.stats[stat as keyof typeof definition.stats]);
  });
}

export function upgradeAffectsTroop(upgradeId: UpgradeId, troop: TroopInstance): boolean {
  if (upgradeId in RACE_UPGRADES) {
    return raceUpgradeAffectsTroop(upgradeId, troop);
  }
  return troopClassUpgradeAffectsTroop(upgradeId, troop);
}
