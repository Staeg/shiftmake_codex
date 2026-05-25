import { fixed, fixedClamp, formatFixed } from './fixed';
import {
  applyStatModifier,
  clampStat,
  composeBaseTroopDefinition,
  getAbility,
  getFaction,
  getFactionUpgrade,
  getTroopQuantityForCost,
  getTroopTypeUpgrade,
  getTroopUnlockId,
  getUnitType,
} from './unitCatalog';
import type {
  AbilityDefinition,
  ExplainedStatKey,
  FactionId,
  GameState,
  ResolvedCombatantDefinition,
  RiftInstance,
  RoleId,
  StatBreakdown,
  StatBreakdownLine,
  TroopId,
  TroopInstance,
  UnitStats,
  UnitTypeId,
} from './types';

export const VICTORY_RECOVERY = 1;
export const DEFEAT_RECOVERY = 1;
const EXPLAINED_STAT_KEYS: ExplainedStatKey[] = ['health', 'damage', 'speed', 'armor', 'range', 'capacity', 'size'];

export function createTroopInstance(factionId: FactionId, unitTypeId: UnitTypeId): TroopInstance {
  return {
    id: getTroopUnlockId(factionId, unitTypeId),
    factionId,
    unitTypeId,
    recoveryCyclesRemaining: 0,
    assignmentRiftId: null,
  };
}

export function getTroopById(state: Pick<GameState, 'troops'>, troopId: TroopId): TroopInstance {
  const troop = state.troops.find((entry) => entry.id === troopId);
  if (!troop) {
    throw new Error(`Unknown troop instance ${troopId}`);
  }
  return troop;
}

export function getTroopsAssignedToRift(state: Pick<GameState, 'troops'>, riftId: string): TroopInstance[] {
  return state.troops.filter((troop) => troop.assignmentRiftId === riftId);
}

export function isFactionUnited(state: Pick<GameState, 'factionUpgradeIds'>, factionId: FactionId): boolean {
  return state.factionUpgradeIds
    .map(getFactionUpgrade)
    .filter((upgrade) => upgrade.factionId === factionId)
    .some((upgrade) => upgrade.effects.some((effect) => effect.kind === 'addAbility' && getAbility(effect.abilityId).overworldEffectId === 'united'));
}

function applyTierScaling(stats: UnitStats, tier: number | null): UnitStats {
  if (tier === null || tier < 4) {
    return stats;
  }
  const multiplier = 1.2;
  return {
    ...stats,
    health: fixed(stats.health * multiplier),
    damage: fixed(stats.damage * multiplier),
    speed: fixedClamp(fixed(stats.speed * multiplier), 1, 100),
  };
}

function canFactionUpgradeAbilityApply(abilityId: string, role: RoleId, attributes: string[]): boolean {
  if (abilityId === 'fade-into-shadow') {
    return role === 'backline';
  }
  if (abilityId === 'long-shot-doctrine' || abilityId === 'silver-distance') {
    return attributes.includes('ranged') || attributes.includes('caster');
  }
  return true;
}

function applyFactionUpgradeEffects(
  state: Pick<GameState, 'factionUpgradeIds'>,
  factionId: FactionId,
  role: RoleId,
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
          if (canFactionUpgradeAbilityApply(effect.abilityId, role, nextAttributes) && !nextAbilities.some((entry) => entry.id === ability.id)) {
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

        if (effect.unitFilter === 'nonMelee' && nextAttributes.includes('melee')) {
          return;
        }

        nextStats = applyStatModifier(nextStats, effect.statModifiers, nextAttributes);
      });
    });

  return { stats: nextStats, abilities: nextAbilities, attributes: nextAttributes };
}

type UpgradeStatContributions = Partial<Record<ExplainedStatKey, StatBreakdownLine[]>>;

function pushContribution(contributions: UpgradeStatContributions, stat: ExplainedStatKey, line: StatBreakdownLine): void {
  if (!contributions[stat]) {
    contributions[stat] = [];
  }
  contributions[stat]?.push(line);
}

function applyFactionUpgradeEffectsDetailed(
  state: Pick<GameState, 'factionUpgradeIds'>,
  factionId: FactionId,
  role: RoleId,
  stats: UnitStats,
  abilities: AbilityDefinition[],
  attributes: string[],
): { stats: UnitStats; abilities: AbilityDefinition[]; attributes: string[]; statContributions: UpgradeStatContributions } {
  let nextStats = { ...stats };
  const nextAbilities = [...abilities];
  const nextAttributes = [...attributes];
  const statContributions: UpgradeStatContributions = {};

  state.factionUpgradeIds
    .map(getFactionUpgrade)
    .filter((upgrade) => upgrade.factionId === factionId)
    .forEach((upgrade) => {
      upgrade.effects.forEach((effect) => {
        if (effect.kind === 'addAbility') {
          const ability = getAbility(effect.abilityId);
          if (canFactionUpgradeAbilityApply(effect.abilityId, role, nextAttributes) && !nextAbilities.some((entry) => entry.id === ability.id)) {
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

        if (effect.unitFilter === 'nonMelee' && nextAttributes.includes('melee')) {
          return;
        }

        const before = nextStats;
        nextStats = applyStatModifier(nextStats, effect.statModifiers, nextAttributes);
        EXPLAINED_STAT_KEYS.forEach((stat) => {
          const delta = fixed(nextStats[stat] - before[stat]);
          if (delta !== 0) {
            pushContribution(statContributions, stat, { label: upgrade.label, value: delta, kind: 'delta' });
          }
        });
      });
    });

  return { stats: nextStats, abilities: nextAbilities, attributes: nextAttributes, statContributions };
}

function applyTroopTypeUpgradeEffects(
  state: Pick<GameState, 'troopTypeUpgradeIds'>,
  unitTypeId: UnitTypeId,
  stats: UnitStats,
  abilities: AbilityDefinition[],
  attributes: string[],
): { stats: UnitStats; abilities: AbilityDefinition[]; attributes: string[] } {
  let nextStats = { ...stats };
  let nextAbilities = [...abilities];
  const nextAttributes = [...attributes];

  state.troopTypeUpgradeIds
    .map(getTroopTypeUpgrade)
    .filter((upgrade) => upgrade.unitTypeId === unitTypeId)
    .forEach((upgrade) => {
      upgrade.effects.forEach((effect) => {
        if (effect.kind === 'addAbility') {
          const ability = getAbility(effect.abilityId);
          if (!nextAbilities.some((entry) => entry.id === ability.id)) {
            nextAbilities.push(ability);
          }
          return;
        }

        if (effect.kind === 'replaceAbility') {
          nextAbilities = nextAbilities.filter((entry) => entry.id !== effect.removeAbilityId);
          const replacement = getAbility(effect.addAbilityId);
          if (!nextAbilities.some((entry) => entry.id === replacement.id)) {
            nextAbilities.push(replacement);
          }
          return;
        }

        if (effect.kind === 'addAttribute') {
          if (!nextAttributes.includes(effect.attribute)) {
            nextAttributes.push(effect.attribute);
          }
          return;
        }

        nextStats = applyStatModifier(nextStats, effect.statModifiers, nextAttributes);
      });
    });

  return { stats: nextStats, abilities: nextAbilities, attributes: nextAttributes };
}

function applyTroopTypeUpgradeEffectsDetailed(
  state: Pick<GameState, 'troopTypeUpgradeIds'>,
  unitTypeId: UnitTypeId,
  stats: UnitStats,
  abilities: AbilityDefinition[],
  attributes: string[],
): { stats: UnitStats; abilities: AbilityDefinition[]; attributes: string[]; statContributions: UpgradeStatContributions } {
  let nextStats = { ...stats };
  let nextAbilities = [...abilities];
  const nextAttributes = [...attributes];
  const statContributions: UpgradeStatContributions = {};

  state.troopTypeUpgradeIds
    .map(getTroopTypeUpgrade)
    .filter((upgrade) => upgrade.unitTypeId === unitTypeId)
    .forEach((upgrade) => {
      upgrade.effects.forEach((effect) => {
        if (effect.kind === 'addAbility') {
          const ability = getAbility(effect.abilityId);
          if (!nextAbilities.some((entry) => entry.id === ability.id)) {
            nextAbilities.push(ability);
          }
          return;
        }

        if (effect.kind === 'replaceAbility') {
          nextAbilities = nextAbilities.filter((entry) => entry.id !== effect.removeAbilityId);
          const replacement = getAbility(effect.addAbilityId);
          if (!nextAbilities.some((entry) => entry.id === replacement.id)) {
            nextAbilities.push(replacement);
          }
          return;
        }

        if (effect.kind === 'addAttribute') {
          if (!nextAttributes.includes(effect.attribute)) {
            nextAttributes.push(effect.attribute);
          }
          return;
        }

        const before = nextStats;
        nextStats = applyStatModifier(nextStats, effect.statModifiers, nextAttributes);
        EXPLAINED_STAT_KEYS.forEach((stat) => {
          const delta = fixed(nextStats[stat] - before[stat]);
          if (delta !== 0) {
            pushContribution(statContributions, stat, { label: upgrade.label, value: delta, kind: 'delta' });
          }
        });
      });
    });

  return { stats: nextStats, abilities: nextAbilities, attributes: nextAttributes, statContributions };
}

function buildStatBreakdowns(
  troop: TroopInstance,
  side: 'player' | 'enemy',
  enemyTier: number | null,
  baseStats: UnitStats,
  factionStats: UnitStats,
  tierStats: UnitStats,
  finalStats: UnitStats,
  troopTypeUpgradeContributions: UpgradeStatContributions,
  factionUpgradeContributions: UpgradeStatContributions,
): Record<ExplainedStatKey, StatBreakdown> {
  const faction = getFaction(troop.factionId);
  const unitType = getUnitType(troop.unitTypeId);

  return Object.fromEntries(
    EXPLAINED_STAT_KEYS.map((stat) => {
      const lines: StatBreakdownLine[] = [{ label: `${unitType.label} base`, value: baseStats[stat], kind: 'base' }];
      const factionDelta = fixed(factionStats[stat] - baseStats[stat]);
      if (factionDelta !== 0) {
        lines.push({ label: faction.label, value: factionDelta, kind: 'delta' });
      }

      const tierDelta = fixed(tierStats[stat] - factionStats[stat]);
      if (tierDelta !== 0 && side === 'enemy' && enemyTier !== null && enemyTier > 1) {
        lines.push({ label: `Enemy Rift Tier ${enemyTier}`, value: tierDelta, kind: 'delta' });
      }

      troopTypeUpgradeContributions[stat]?.forEach((line) => lines.push(line));
      factionUpgradeContributions[stat]?.forEach((line) => lines.push(line));

      return [
        stat,
        {
          stat,
          finalValue: finalStats[stat],
          lines,
        } satisfies StatBreakdown,
      ];
    }),
  ) as Record<ExplainedStatKey, StatBreakdown>;
}

export function getResolvedStatBreakdowns(
  state: Pick<GameState, 'factionUpgradeIds' | 'troopTypeUpgradeIds'>,
  troop: TroopInstance,
  side: 'player' | 'enemy',
  enemyTier: number | null = null,
): Record<ExplainedStatKey, StatBreakdown> {
  const unitType = getUnitType(troop.unitTypeId);
  const base = composeBaseTroopDefinition(troop.factionId, troop.unitTypeId);
  const baseUnitStats = {
    health: clampStat('health', unitType.stats.health),
    damage: clampStat('damage', unitType.stats.damage),
    speed: clampStat('speed', unitType.stats.speed),
    armor: clampStat('armor', unitType.stats.armor),
    range: clampStat('range', unitType.stats.range),
    capacity: clampStat('capacity', unitType.stats.capacity),
    size: clampStat('size', unitType.stats.size),
  };
  const tierStats = applyTierScaling(base.stats, side === 'enemy' ? enemyTier : null);
  const troopTypeDetailed = applyTroopTypeUpgradeEffectsDetailed(state, troop.unitTypeId, tierStats, base.abilities, base.attributes);
  const factionDetailed = applyFactionUpgradeEffectsDetailed(
    state,
    troop.factionId,
    base.role,
    troopTypeDetailed.stats,
    troopTypeDetailed.abilities,
    troopTypeDetailed.attributes,
  );

  return buildStatBreakdowns(
    troop,
    side,
    enemyTier,
    baseUnitStats,
    base.stats,
    tierStats,
    factionDetailed.stats,
    troopTypeDetailed.statContributions,
    factionDetailed.statContributions,
  );
}

export function getTroopQuantityBreakdown(troop: Pick<TroopInstance, 'factionId' | 'unitTypeId'>): StatBreakdown {
  const faction = getFaction(troop.factionId);
  const unitType = getUnitType(troop.unitTypeId);
  const baseQuantity = getTroopQuantityForCost(unitType.cost);
  const base = composeBaseTroopDefinition(troop.factionId, troop.unitTypeId);
  const lines: StatBreakdownLine[] = [{ label: `${unitType.label} base cost ${formatFixed(unitType.cost)}`, value: baseQuantity, kind: 'base' }];

  const costMultiplier = faction.statAdjustments.cost?.multiplier ?? 1;
  const costFlat = faction.statAdjustments.cost?.flat ?? 0;
  if (costMultiplier !== 1 || costFlat !== 0) {
    const costText = costMultiplier !== 1
      ? `Cost x${formatFixed(costMultiplier)}`
      : `Cost ${costFlat > 0 ? '+' : ''}${formatFixed(costFlat)}`;
    lines.push({
      label: `${faction.label} ${costText} -> quantity x${formatFixed(base.quantity / baseQuantity)}`,
      value: fixed(base.quantity - baseQuantity),
      kind: 'delta',
    });
  }

  return {
    stat: 'quantity',
    finalValue: base.quantity,
    lines,
  };
}

export function getEnemyStatBreakdowns(
  factionId: FactionId,
  unitTypeId: UnitTypeId,
  tier: number,
): Record<ExplainedStatKey, StatBreakdown> {
  return getResolvedStatBreakdowns(
    { factionUpgradeIds: [], troopTypeUpgradeIds: [] },
    createTroopInstance(factionId, unitTypeId),
    'enemy',
    tier,
  );
}

export function resolveTroopCombatant(
  state: Pick<GameState, 'factionUpgradeIds' | 'troopTypeUpgradeIds'>,
  troop: TroopInstance,
  side: 'player' | 'enemy',
  enemyTier: number | null = null,
  combatantId = troop.id,
): ResolvedCombatantDefinition {
  const base = composeBaseTroopDefinition(troop.factionId, troop.unitTypeId);
  const scaled = applyTierScaling(base.stats, side === 'enemy' ? enemyTier : null);
  const withTroopTypeEffects = applyTroopTypeUpgradeEffects(state, troop.unitTypeId, scaled, base.abilities, base.attributes);
  const withFactionEffects = applyFactionUpgradeEffects(
    state,
    troop.factionId,
    base.role,
    withTroopTypeEffects.stats,
    withTroopTypeEffects.abilities,
    withTroopTypeEffects.attributes,
  );

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
    quantity: base.quantity,
    cost: base.cost,
    side,
    statBreakdowns: getResolvedStatBreakdowns(state, troop, side, enemyTier),
  };
}

export function resolveEnemyCombatant(
  factionUpgradeIds: string[],
  troopTypeUpgradeIds: string[],
  factionId: FactionId,
  unitTypeId: UnitTypeId,
  tier: number,
  combatantId: string,
): ResolvedCombatantDefinition {
  return resolveTroopCombatant(
    { factionUpgradeIds, troopTypeUpgradeIds },
    createTroopInstance(factionId, unitTypeId),
    'enemy',
    tier,
    combatantId,
  );
}

export function getTroopEffectiveDefinition(state: Pick<GameState, 'factionUpgradeIds' | 'troopTypeUpgradeIds' | 'troops'>, troopId: TroopId): ResolvedCombatantDefinition {
  return resolveTroopCombatant(state, getTroopById(state, troopId), 'player');
}

export function getTroopStatusCounts(state: Pick<GameState, 'troops'>): { active: number; recovering: number; idle: number } {
  let active = 0;
  let recovering = 0;
  let idle = 0;

  state.troops.forEach((troop) => {
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

export function getFactionTroops(state: Pick<GameState, 'troops'>, factionId: FactionId): TroopInstance[] {
  return state.troops.filter((troop) => troop.factionId === factionId);
}

export function tickRecovery(troops: TroopInstance[]): TroopInstance[] {
  return troops.map((troop) => ({
    ...troop,
    recoveryCyclesRemaining: Math.max(0, troop.recoveryCyclesRemaining - 1),
  }));
}

export function getRiftSummaryTroops(state: Pick<GameState, 'troops'>, rift: RiftInstance): string[] {
  return getTroopsAssignedToRift(state, rift.id).map((troop) => composeBaseTroopDefinition(troop.factionId, troop.unitTypeId).label);
}
