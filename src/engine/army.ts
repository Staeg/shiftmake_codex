import { fixed, fixedClamp, fixedMax, fixedMul } from './fixed';
import {
  applyPercentageUpgrade,
  applyStatModifier,
  composeBaseTroopDefinition,
  getAbility,
  getFaction,
  getFactionUpgrade,
  getTroopSelectionCost,
  getUnitType,
  getUpgradeableStatsForUnitType,
} from './unitCatalog';
import type {
  AbilityDefinition,
  FactionId,
  GameState,
  ResolvedCombatantDefinition,
  RiftInstance,
  TroopId,
  TroopInstance,
  TroopStatKey,
  UnitStats,
  UnitTypeId,
} from './types';

export const VICTORY_RECOVERY = 1;
export const DEFEAT_RECOVERY = 2;

function withDefaultStatLevels(levels?: Partial<Record<TroopStatKey, number>>): Record<TroopStatKey, number> {
  return {
    health: levels?.health ?? 0,
    damage: levels?.damage ?? 0,
    speed: levels?.speed ?? 0,
    armor: levels?.armor ?? 0,
    range: levels?.range ?? 0,
    capacity: levels?.capacity ?? 0,
  };
}

export function createTroopInstance(factionId: FactionId, unitTypeId: UnitTypeId, index: number): TroopInstance {
  const base = composeBaseTroopDefinition(factionId, unitTypeId);
  return {
    id: `${factionId}-${unitTypeId}-${index}`,
    factionId,
    unitTypeId,
    quantity: base.quantity,
    unlocked: true,
    statUpgradeLevels: withDefaultStatLevels(),
    recoveryCyclesRemaining: 0,
    assignmentRiftId: null,
  };
}

export function getTroopById(state: GameState, troopId: TroopId): TroopInstance {
  const troop = state.troops.find((entry) => entry.id === troopId);
  if (!troop) {
    throw new Error(`Unknown troop instance ${troopId}`);
  }
  return troop;
}

export function getTroopsAssignedToRift(state: GameState, riftId: string): TroopInstance[] {
  return state.troops.filter((troop) => troop.assignmentRiftId === riftId);
}

export function isFactionUnited(state: GameState, factionId: FactionId): boolean {
  return state.factionUpgradeIds
    .map(getFactionUpgrade)
    .filter((upgrade) => upgrade.factionId === factionId)
    .some((upgrade) => upgrade.effects.some((effect) => effect.kind === 'addAbility' && getAbility(effect.abilityId).overworldEffectId === 'united'));
}

export function canUpgradeStat(unitTypeId: UnitTypeId, stat: TroopStatKey): boolean {
  return getUpgradeableStatsForUnitType(unitTypeId).includes(stat);
}

function applyTierScaling(stats: UnitStats, tier: number | null): UnitStats {
  if (tier === null || tier <= 1) {
    return stats;
  }
  const multiplier = fixed(1 + 0.2 * (tier - 1));
  return {
    ...stats,
    health: fixedMul(stats.health, multiplier),
    damage: fixedMul(stats.damage, multiplier),
    speed: fixedClamp(fixedMul(stats.speed, multiplier), 1, 100),
  };
}

function applyUpgradeLevels(base: UnitStats, troop: TroopInstance): UnitStats {
  const levels = withDefaultStatLevels(troop.statUpgradeLevels);
  const next = { ...base };
  next.health = applyPercentageUpgrade(next.health, levels.health);
  next.damage = applyPercentageUpgrade(next.damage, levels.damage);
  next.speed = fixedClamp(applyPercentageUpgrade(next.speed, levels.speed), 1, 100);
  next.armor = fixed(next.armor + levels.armor);
  next.range = fixedMax(next.range + levels.range, 0);
  next.capacity = fixedMax(next.capacity + levels.capacity, 0);
  return next;
}

function applyFactionUpgradeEffects(
  state: GameState | Pick<GameState, 'factionUpgradeIds'>,
  factionId: FactionId,
  unitTypeId: UnitTypeId,
  stats: UnitStats,
  abilities: AbilityDefinition[],
  attributes: string[],
): { stats: UnitStats; abilities: AbilityDefinition[]; attributes: string[] } {
  let nextStats = { ...stats };
  const nextAbilities = [...abilities];
  const nextAttributes = [...attributes];

  state.factionUpgradeIds
    .map(getFactionUpgrade)
    .filter((upgrade) => upgrade.factionId === factionId)
    .forEach((upgrade) => {
      upgrade.effects.forEach((effect) => {
        if (effect.kind === 'addAbility') {
          const ability = getAbility(effect.abilityId);
          if (!nextAbilities.some((entry) => entry.id === ability.id)) {
            nextAbilities.push(ability);
          }
          return;
        }

        if (effect.kind === 'addAttribute') {
          if (!nextAttributes.includes(effect.attribute)) {
            nextAttributes.push(effect.attribute);
          }
          return;
        }

        if (effect.unitFilter === 'nonMelee' && getUnitType(unitTypeId).stats.range === 0) {
          return;
        }

        nextStats = applyStatModifier(nextStats, effect.statModifiers);
      });
    });

  return { stats: nextStats, abilities: nextAbilities, attributes: nextAttributes };
}

export function resolveTroopCombatant(
  state: Pick<GameState, 'factionUpgradeIds'>,
  troop: TroopInstance,
  side: 'player' | 'enemy',
  enemyTier: number | null = null,
  combatantId = troop.id,
): ResolvedCombatantDefinition {
  const base = composeBaseTroopDefinition(troop.factionId, troop.unitTypeId);
  const scaled = applyTierScaling(base.stats, side === 'enemy' ? enemyTier : null);
  const upgraded = applyUpgradeLevels(scaled, troop);
  const withFactionEffects = applyFactionUpgradeEffects(state, troop.factionId, troop.unitTypeId, upgraded, base.abilities, base.attributes);

  return {
    combatantId,
    factionId: troop.factionId,
    unitTypeId: troop.unitTypeId,
    troopInstanceId: troop.id,
    label: base.label,
    role: base.role,
    type: base.type,
    attributes: withFactionEffects.attributes,
    stats: withFactionEffects.stats,
    abilities: withFactionEffects.abilities,
    quantity: troop.quantity,
    cost: base.cost,
    side,
  };
}

export function resolveEnemyCombatant(
  factionUpgradeIds: string[],
  factionId: FactionId,
  unitTypeId: UnitTypeId,
  quantity: number,
  tier: number,
  combatantId: string,
): ResolvedCombatantDefinition {
  const fakeState = { factionUpgradeIds };
  const troop: TroopInstance = {
    id: combatantId,
    factionId,
    unitTypeId,
    quantity,
    unlocked: true,
    statUpgradeLevels: withDefaultStatLevels(),
    recoveryCyclesRemaining: 0,
    assignmentRiftId: null,
  };
  return resolveTroopCombatant(fakeState, troop, 'enemy', tier, combatantId);
}

export function getTroopAddUnitCost(troop: TroopInstance): number {
  const troopId = `${troop.factionId}/${troop.unitTypeId}`;
  const currentCost = getTroopSelectionCost(troopId, troop.quantity);
  const nextCost = getTroopSelectionCost(troopId, troop.quantity + 1);
  return fixed(nextCost - currentCost);
}

export function getTroopStatUpgradeCost(troop: TroopInstance, stat: TroopStatKey): number {
  if (!canUpgradeStat(troop.unitTypeId, stat)) {
    return Number.POSITIVE_INFINITY;
  }
  const base = composeBaseTroopDefinition(troop.factionId, troop.unitTypeId);
  const levels = troop.statUpgradeLevels[stat] ?? 0;
  const unitType = getUnitType(troop.unitTypeId);

  if (stat === 'health' || stat === 'damage' || stat === 'speed') {
    return fixed((base.cost / 10) * (levels + 1));
  }

  if (stat === 'armor') {
    return fixed((base.cost / 20 + unitType.stats.armor) * (levels + 1));
  }

  const starting = stat === 'range' ? unitType.stats.range : unitType.stats.capacity;
  const safeStarting = Math.max(1, starting);
  return fixed((base.cost * (levels + safeStarting)) / (safeStarting * 2));
}

export function getFactionUnlockCost(state: GameState): number {
  return 100 * state.unlockedFactionIds.length;
}

export function getTroopUnlockCost(state: GameState, factionId: FactionId, unitTypeId: UnitTypeId): number {
  const unitType = getUnitType(unitTypeId);
  const unlockedNonSoldiers = state.troops.filter((troop) => troop.factionId === factionId && troop.unlocked && troop.unitTypeId !== 'soldier').length;
  return fixed(unitType.cost + (unitTypeId === 'soldier' ? 0 : 100 * unlockedNonSoldiers));
}

export function getTroopEffectiveDefinition(state: GameState, troopId: TroopId): ResolvedCombatantDefinition {
  return resolveTroopCombatant(state, getTroopById(state, troopId), 'player');
}

export function getTroopStatusCounts(state: GameState): { active: number; recovering: number; idle: number } {
  let active = 0;
  let recovering = 0;
  let idle = 0;
  state.troops.filter((troop) => troop.unlocked).forEach((troop) => {
    if (troop.assignmentRiftId) {
      active += 1;
    } else if (troop.recoveryCyclesRemaining > 0) {
      recovering += 1;
    } else {
      idle += 1;
    }
  });
  return { active, recovering, idle };
}

export function getFactionTroops(state: GameState, factionId: FactionId): TroopInstance[] {
  return state.troops.filter((troop) => troop.factionId === factionId);
}

export function getAvailableFactionTroopUnlocks(state: GameState, factionId: FactionId): UnitTypeId[] {
  const faction = getFaction(factionId);
  return faction.defaultUnitTypeIds.filter(
    (unitTypeId) => !state.troops.some((troop) => troop.factionId === factionId && troop.unitTypeId === unitTypeId),
  );
}

export function tickRecovery(troops: TroopInstance[]): TroopInstance[] {
  return troops.map((troop) => ({
    ...troop,
    recoveryCyclesRemaining: Math.max(0, troop.recoveryCyclesRemaining - 1),
    assignmentRiftId: troop.assignmentRiftId,
  }));
}

export function getRiftSummaryTroops(state: GameState, rift: RiftInstance): string[] {
  return getTroopsAssignedToRift(state, rift.id).map((troop) => composeBaseTroopDefinition(troop.factionId, troop.unitTypeId).label);
}
