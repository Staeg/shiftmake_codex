import { applyStatModifier, composeBaseTroopDefinition, FACTION_UPGRADES, getAbility, getFactionNativeTroopUnlockIds, TROOP_TYPE_UPGRADES } from './unitCatalog';
import type { AbilityId, FactionId, GameState, TroopInstance, TroopUnlockId, UpgradeId } from './types';

export function getAllUpgradeIds(): UpgradeId[] {
  return [...Object.keys(FACTION_UPGRADES), ...Object.keys(TROOP_TYPE_UPGRADES)];
}

export function getUnownedUpgradeIds(state: Pick<GameState, 'factionUpgradeIds' | 'troopTypeUpgradeIds'>): UpgradeId[] {
  return getAllUpgradeIds().filter(
    (upgradeId) => !state.factionUpgradeIds.includes(upgradeId) && !state.troopTypeUpgradeIds.includes(upgradeId),
  );
}

export function getClaimableTroopUnlockIds(state: Pick<GameState, 'unlockedFactionIds' | 'unlockedTroopUnlockIds'>): TroopUnlockId[] {
  const unlockedFactionIds = new Set(state.unlockedFactionIds);
  const nativeTroopUnlockIds = state.unlockedFactionIds.flatMap((factionId) => getFactionNativeTroopUnlockIds(factionId));
  const latentTroopUnlockIds = state.unlockedTroopUnlockIds.filter((troopUnlockId) => {
    const [factionId] = troopUnlockId.split('/') as [FactionId, string];
    return unlockedFactionIds.has(factionId);
  });

  return [...new Set([...nativeTroopUnlockIds, ...latentTroopUnlockIds])];
}

export function getOwnedTroopUnlockIds(state: Pick<GameState, 'troops'>): TroopUnlockId[] {
  return state.troops.map((troop) => `${troop.factionId}/${troop.unitTypeId}`);
}

export function getAvailableTroopUnlockIds(
  state: Pick<GameState, 'troops' | 'unlockedFactionIds' | 'unlockedTroopUnlockIds'>,
): TroopUnlockId[] {
  const ownedTroopUnlockIds = new Set(getOwnedTroopUnlockIds(state));
  return getClaimableTroopUnlockIds(state).filter((troopUnlockId) => !ownedTroopUnlockIds.has(troopUnlockId));
}

export function describeTroopUnlock(troopUnlockId: TroopUnlockId): string {
  const [factionId, unitTypeId] = troopUnlockId.split('/') as [FactionId, string];
  return composeBaseTroopDefinition(factionId, unitTypeId).label;
}

function hasRangedOrCasterTag(troop: TroopInstance): boolean {
  const definition = composeBaseTroopDefinition(troop.factionId, troop.unitTypeId);
  return definition.attributes.includes('ranged') || definition.attributes.includes('caster');
}

function canAbilityAffectTroop(abilityId: AbilityId, troop: TroopInstance): boolean {
  const definition = composeBaseTroopDefinition(troop.factionId, troop.unitTypeId);
  if (abilityId === 'fade-into-shadow') {
    return definition.role === 'backline';
  }
  if (abilityId === 'long-shot-doctrine' || abilityId === 'silver-distance') {
    return hasRangedOrCasterTag(troop);
  }
  return true;
}

function factionUpgradeAffectsTroop(upgradeId: UpgradeId, troop: TroopInstance): boolean {
  const upgrade = FACTION_UPGRADES[upgradeId];
  if (!upgrade || upgrade.factionId !== troop.factionId) {
    return false;
  }

  const definition = composeBaseTroopDefinition(troop.factionId, troop.unitTypeId);
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

function troopTypeUpgradeAffectsTroop(upgradeId: UpgradeId, troop: TroopInstance): boolean {
  const upgrade = TROOP_TYPE_UPGRADES[upgradeId];
  if (!upgrade || upgrade.unitTypeId !== troop.unitTypeId) {
    return false;
  }

  const definition = composeBaseTroopDefinition(troop.factionId, troop.unitTypeId);
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

    const modified = applyStatModifier(definition.stats, effect.statModifiers, definition.attributes);
    return Object.keys(effect.statModifiers).some((stat) => modified[stat as keyof typeof modified] !== definition.stats[stat as keyof typeof definition.stats]);
  });
}

export function upgradeAffectsTroop(upgradeId: UpgradeId, troop: TroopInstance): boolean {
  if (upgradeId in FACTION_UPGRADES) {
    return factionUpgradeAffectsTroop(upgradeId, troop);
  }
  return troopTypeUpgradeAffectsTroop(upgradeId, troop);
}
