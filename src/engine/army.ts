import { fixed, fixedClamp, formatFixed } from './fixed';
import {
  applyStatModifier,
  clampStat,
  composeBaseTroopDefinition,
  getAbility,
  getRace,
  getRaceUpgrade,
  getTroopQuantityForCost,
  getTroopClassUpgrade,
  getTroopUnlockId,
  getUnitClass,
} from './unitCatalog';
import type {
  AbilityDefinition,
  ExplainedStatKey,
  RaceId,
  GameState,
  ResolvedCombatantDefinition,
  RiftInstance,
  RoleId,
  StatBreakdown,
  StatBreakdownLine,
  TroopId,
  TroopInstance,
  UnitStats,
  UnitClassId,
} from './types';

export const BATTLE_RECOVERY = 1;
const EXPLAINED_STAT_KEYS: ExplainedStatKey[] = ['health', 'damage', 'speed', 'move', 'armor', 'range', 'capacity', 'size'];

export function createTroopInstance(raceId: RaceId, unitClassId: UnitClassId): TroopInstance {
  return {
    id: getTroopUnlockId(raceId, unitClassId),
    raceId,
    unitClassId,
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

export function isRaceUnited(state: Pick<GameState, 'raceUpgradeIds'>, raceId: RaceId): boolean {
  return state.raceUpgradeIds
    .map(getRaceUpgrade)
    .filter((upgrade) => upgrade.raceId === raceId)
    .some((upgrade) => upgrade.effects.some((effect) => effect.kind === 'addAbility' && getAbility(effect.abilityId).overworldEffectId === 'united'));
}

export function isUnitClassUnited(state: Pick<GameState, 'troopClassUpgradeIds'>, unitClassId: UnitClassId): boolean {
  return state.troopClassUpgradeIds
    .map(getTroopClassUpgrade)
    .filter((upgrade) => upgrade.unitClassId === unitClassId)
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

function canRaceUpgradeAbilityApply(abilityId: string, role: RoleId, attributes: string[]): boolean {
  if (abilityId === 'fade-into-shadow') {
    return role === 'backline';
  }
  if (abilityId === 'long-shot-doctrine' || abilityId === 'silver-distance') {
    return attributes.includes('ranged') || attributes.includes('caster');
  }
  return true;
}

function applyRaceUpgradeEffects(
  state: Pick<GameState, 'raceUpgradeIds'>,
  raceId: RaceId,
  role: RoleId,
  stats: UnitStats,
  abilities: AbilityDefinition[],
  attributes: string[],
): { stats: UnitStats; abilities: AbilityDefinition[]; attributes: string[] } {
  let nextStats = { ...stats };
  const nextAbilities = [...abilities];
  const nextAttributes = [...attributes];

  state.raceUpgradeIds
    .map(getRaceUpgrade)
    .filter((upgrade) => upgrade.raceId === raceId)
    .forEach((upgrade) => {
      upgrade.effects.forEach((effect) => {
        if (effect.kind === 'addAbility') {
          const ability = getAbility(effect.abilityId);
          if (canRaceUpgradeAbilityApply(effect.abilityId, role, nextAttributes) && !nextAbilities.some((entry) => entry.id === ability.id)) {
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

function applyRaceUpgradeEffectsDetailed(
  state: Pick<GameState, 'raceUpgradeIds'>,
  raceId: RaceId,
  role: RoleId,
  stats: UnitStats,
  abilities: AbilityDefinition[],
  attributes: string[],
): { stats: UnitStats; abilities: AbilityDefinition[]; attributes: string[]; statContributions: UpgradeStatContributions } {
  let nextStats = { ...stats };
  const nextAbilities = [...abilities];
  const nextAttributes = [...attributes];
  const statContributions: UpgradeStatContributions = {};

  state.raceUpgradeIds
    .map(getRaceUpgrade)
    .filter((upgrade) => upgrade.raceId === raceId)
    .forEach((upgrade) => {
      upgrade.effects.forEach((effect) => {
        if (effect.kind === 'addAbility') {
          const ability = getAbility(effect.abilityId);
          if (canRaceUpgradeAbilityApply(effect.abilityId, role, nextAttributes) && !nextAbilities.some((entry) => entry.id === ability.id)) {
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

function applyTroopClassUpgradeEffects(
  state: Pick<GameState, 'troopClassUpgradeIds'>,
  role: RoleId,
  unitClassId: UnitClassId,
  stats: UnitStats,
  abilities: AbilityDefinition[],
  attributes: string[],
): { role: RoleId; stats: UnitStats; abilities: AbilityDefinition[]; attributes: string[] } {
  let nextRole = role;
  let nextStats = { ...stats };
  let nextAbilities = [...abilities];
  let nextAttributes = [...attributes];

  state.troopClassUpgradeIds
    .map(getTroopClassUpgrade)
    .filter((upgrade) => upgrade.unitClassId === unitClassId)
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

        if (effect.kind === 'removeAttribute') {
          nextAttributes = nextAttributes.filter((attribute) => attribute !== effect.attribute);
          return;
        }

        if (effect.kind === 'setRole') {
          nextRole = effect.role;
          return;
        }

        nextStats = applyStatModifier(nextStats, effect.statModifiers, nextAttributes);
      });
    });

  return { role: nextRole, stats: nextStats, abilities: nextAbilities, attributes: nextAttributes };
}

function applyTroopClassUpgradeEffectsDetailed(
  state: Pick<GameState, 'troopClassUpgradeIds'>,
  role: RoleId,
  unitClassId: UnitClassId,
  stats: UnitStats,
  abilities: AbilityDefinition[],
  attributes: string[],
): { role: RoleId; stats: UnitStats; abilities: AbilityDefinition[]; attributes: string[]; statContributions: UpgradeStatContributions } {
  let nextRole = role;
  let nextStats = { ...stats };
  let nextAbilities = [...abilities];
  let nextAttributes = [...attributes];
  const statContributions: UpgradeStatContributions = {};

  state.troopClassUpgradeIds
    .map(getTroopClassUpgrade)
    .filter((upgrade) => upgrade.unitClassId === unitClassId)
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

        if (effect.kind === 'removeAttribute') {
          nextAttributes = nextAttributes.filter((attribute) => attribute !== effect.attribute);
          return;
        }

        if (effect.kind === 'setRole') {
          nextRole = effect.role;
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

  return { role: nextRole, stats: nextStats, abilities: nextAbilities, attributes: nextAttributes, statContributions };
}

function buildStatBreakdowns(
  troop: TroopInstance,
  side: 'player' | 'enemy',
  enemyTier: number | null,
  baseStats: UnitStats,
  raceStats: UnitStats,
  tierStats: UnitStats,
  finalStats: UnitStats,
  troopClassUpgradeContributions: UpgradeStatContributions,
  raceUpgradeContributions: UpgradeStatContributions,
): Record<ExplainedStatKey, StatBreakdown> {
  const race = getRace(troop.raceId);
  const unitClass = getUnitClass(troop.unitClassId);

  return Object.fromEntries(
    EXPLAINED_STAT_KEYS.map((stat) => {
      const lines: StatBreakdownLine[] = [{ label: `${unitClass.label} base`, value: baseStats[stat], kind: 'base' }];
      const raceDelta = fixed(raceStats[stat] - baseStats[stat]);
      if (raceDelta !== 0) {
        lines.push({ label: race.label, value: raceDelta, kind: 'delta' });
      }

      const tierDelta = fixed(tierStats[stat] - raceStats[stat]);
      if (tierDelta !== 0 && side === 'enemy' && enemyTier !== null && enemyTier > 1) {
        lines.push({ label: `Enemy Rift Tier ${enemyTier}`, value: tierDelta, kind: 'delta' });
      }

      troopClassUpgradeContributions[stat]?.forEach((line) => lines.push(line));
      raceUpgradeContributions[stat]?.forEach((line) => lines.push(line));

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
  state: Pick<GameState, 'raceUpgradeIds' | 'troopClassUpgradeIds'>,
  troop: TroopInstance,
  side: 'player' | 'enemy',
  enemyTier: number | null = null,
): Record<ExplainedStatKey, StatBreakdown> {
  const unitClass = getUnitClass(troop.unitClassId);
  const base = composeBaseTroopDefinition(troop.raceId, troop.unitClassId);
  const baseUnitStats = {
    health: clampStat('health', unitClass.stats.health),
    damage: clampStat('damage', unitClass.stats.damage),
    speed: clampStat('speed', unitClass.stats.speed),
    move: clampStat('move', unitClass.stats.move),
    armor: clampStat('armor', unitClass.stats.armor),
    range: clampStat('range', unitClass.stats.range),
    capacity: clampStat('capacity', unitClass.stats.capacity),
    size: clampStat('size', unitClass.stats.size),
  };
  const tierStats = applyTierScaling(base.stats, side === 'enemy' ? enemyTier : null);
  const troopClassDetailed = applyTroopClassUpgradeEffectsDetailed(state, base.role, troop.unitClassId, tierStats, base.abilities, base.attributes);
  const raceDetailed = applyRaceUpgradeEffectsDetailed(
    state,
    troop.raceId,
    troopClassDetailed.role,
    troopClassDetailed.stats,
    troopClassDetailed.abilities,
    troopClassDetailed.attributes,
  );

  return buildStatBreakdowns(
    troop,
    side,
    enemyTier,
    baseUnitStats,
    base.stats,
    tierStats,
    raceDetailed.stats,
    troopClassDetailed.statContributions,
    raceDetailed.statContributions,
  );
}

export function getTroopQuantityBreakdown(troop: Pick<TroopInstance, 'raceId' | 'unitClassId'>): StatBreakdown {
  const race = getRace(troop.raceId);
  const unitClass = getUnitClass(troop.unitClassId);
  const baseQuantity = getTroopQuantityForCost(unitClass.cost);
  const base = composeBaseTroopDefinition(troop.raceId, troop.unitClassId);
  const lines: StatBreakdownLine[] = [{ label: `${unitClass.label} base cost ${formatFixed(unitClass.cost)}`, value: baseQuantity, kind: 'base' }];

  const costMultiplier = race.statAdjustments.cost?.multiplier ?? 1;
  const costFlat = race.statAdjustments.cost?.flat ?? 0;
  if (costMultiplier !== 1 || costFlat !== 0) {
    const costText = costMultiplier !== 1
      ? `Cost x${formatFixed(costMultiplier)}`
      : `Cost ${costFlat > 0 ? '+' : ''}${formatFixed(costFlat)}`;
    lines.push({
      label: `${race.label} ${costText} -> quantity x${formatFixed(base.quantity / baseQuantity)}`,
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
  raceId: RaceId,
  unitClassId: UnitClassId,
  tier: number,
): Record<ExplainedStatKey, StatBreakdown> {
  return getResolvedStatBreakdowns(
    { raceUpgradeIds: [], troopClassUpgradeIds: [] },
    createTroopInstance(raceId, unitClassId),
    'enemy',
    tier,
  );
}

export function resolveTroopCombatant(
  state: Pick<GameState, 'raceUpgradeIds' | 'troopClassUpgradeIds'>,
  troop: TroopInstance,
  side: 'player' | 'enemy',
  enemyTier: number | null = null,
  combatantId = troop.id,
): ResolvedCombatantDefinition {
  const base = composeBaseTroopDefinition(troop.raceId, troop.unitClassId);
  const scaled = applyTierScaling(base.stats, side === 'enemy' ? enemyTier : null);
  const withTroopClassEffects = applyTroopClassUpgradeEffects(state, base.role, troop.unitClassId, scaled, base.abilities, base.attributes);
  const withRaceEffects = applyRaceUpgradeEffects(
    state,
    troop.raceId,
    withTroopClassEffects.role,
    withTroopClassEffects.stats,
    withTroopClassEffects.abilities,
    withTroopClassEffects.attributes,
  );

  return {
    combatantId,
    raceId: troop.raceId,
    unitClassId: troop.unitClassId,
    troopInstanceId: troop.id,
    label: base.label,
    role: withTroopClassEffects.role,
    unitClassTag: base.unitClassTag,
    attributes: withRaceEffects.attributes,
    stats: withRaceEffects.stats,
    abilities: withRaceEffects.abilities,
    quantity: base.quantity,
    cost: base.cost,
    side,
    statBreakdowns: getResolvedStatBreakdowns(state, troop, side, enemyTier),
  };
}

export function resolveEnemyCombatant(
  raceUpgradeIds: string[],
  troopClassUpgradeIds: string[],
  raceId: RaceId,
  unitClassId: UnitClassId,
  tier: number,
  combatantId: string,
): ResolvedCombatantDefinition {
  return resolveTroopCombatant(
    { raceUpgradeIds, troopClassUpgradeIds },
    createTroopInstance(raceId, unitClassId),
    'enemy',
    tier,
    combatantId,
  );
}

export function getTroopEffectiveDefinition(state: Pick<GameState, 'raceUpgradeIds' | 'troopClassUpgradeIds' | 'troops'>, troopId: TroopId): ResolvedCombatantDefinition {
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

export function getRaceTroops(state: Pick<GameState, 'troops'>, raceId: RaceId): TroopInstance[] {
  return state.troops.filter((troop) => troop.raceId === raceId);
}

export function tickRecovery(troops: TroopInstance[]): TroopInstance[] {
  return troops.map((troop) => ({
    ...troop,
    recoveryCyclesRemaining: Math.max(0, troop.recoveryCyclesRemaining - 1),
  }));
}

export function getRiftSummaryTroops(state: Pick<GameState, 'troops'>, rift: RiftInstance): string[] {
  return getTroopsAssignedToRift(state, rift.id).map((troop) => composeBaseTroopDefinition(troop.raceId, troop.unitClassId).label);
}
