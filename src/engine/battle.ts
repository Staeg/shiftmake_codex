import { equalsHex, hexDistance, hexKey, inRadius, neighbors } from './hex';
import { fixed, fixedAdd, fixedClamp, fixedMax, fixedMul, fixedSub, fixedSum, formatFixed } from './fixed';
import { createRng, type Rng } from './rng';
import { clampStat, composeBaseTroopDefinition, composeSummonedTroopDefinition, getAbility, getMutator, getTroopDefinitionOrThrow } from './unitCatalog';
import { createTroopInstance, resolveTroopCombatant } from './army';
import type {
  AbilityAllegiance,
  BattleAbilityExplanation,
  BattleDamageExplanation,
  AbilityDefinition,
  AbilityEffectDefinition,
  AbilityTargetDefinition,
  AbilityTiming,
  BattleMovementExplanation,
  BattleInput,
  BattleReplay,
  BattleStepMetadata,
  BattleStepExplanation,
  EffectDisposition,
  RoleIntentId,
  ReplayTroopProfile,
  BattleStateSnapshot,
  BattleStep,
  BattleStepKind,
  HexCoord,
  ResolvedCombatantDefinition,
  RoleId,
  SideId,
} from './types';
import type { BattleDebugInput } from './debugTypes';

type RuntimeAbilityState = {
  definition: AbilityDefinition;
  triggerCount: number;
  usesRemaining: number | null;
};

type ActiveTimedEffect =
  | {
      effectKind: 'bolster';
      sourceAbilityId: string;
      sourceUnitId: string;
      remainingTurns: number;
      maxApplied: number;
      hpApplied: number;
    }
  | {
      effectKind: 'haste' | 'ramp';
      sourceAbilityId: string;
      sourceUnitId: string;
      remainingTurns: number;
      amountApplied: number;
    }
  | {
      effectKind: 'statDelta';
      sourceAbilityId: string;
      sourceUnitId: string;
      remainingTurns: number;
      stat: 'damage' | 'speed' | 'armor' | 'range' | 'capacity';
      amountApplied: number;
    }
  | {
      effectKind: 'rangeset';
      sourceAbilityId: string;
      sourceUnitId: string;
      remainingTurns: number;
      previousValue: number;
    }
  | {
      effectKind: 'roleset';
      sourceAbilityId: string;
      sourceUnitId: string;
      remainingTurns: number;
      previousRole: RoleId;
    };

type InternalUnit = {
  id: string;
  troopInstanceId: string | null;
  troopLabel: string;
  unitTypeId: string;
  factionId: string;
  side: SideId;
  summonerUnitId: string | null;
  role: RoleId;
  type: string;
  attributes: string[];
  position: HexCoord;
  hp: number;
  maxHp: number;
  initiative: number;
  alive: boolean;
  engagedWith: Set<string>;
  resolvedStats: {
    health: number;
    damage: number;
    speed: number;
    range: number;
    armor: number;
    size: number;
    capacity: number;
  };
  resolvedAbilities: RuntimeAbilityState[];
  activeTimedEffects: ActiveTimedEffect[];
  committedBacklineTargetId: string | null;
  graveVigorBlockedSides: Set<SideId>;
  mercyBeforeDawnUsed: boolean;
  stonebloodUsed: boolean;
  fadeIntoShadowUsed: boolean;
  glamourUsed: boolean;
  brambleSnareStacks: number;
  bonusStrikeCharges: number;
  scavengersHungerKills: number;
  sentinelRunesTriggered: boolean;
  berserkDeathPending: boolean;
  berserkTurnsUntilDeath: number;
};

type AbilityTriggerEvent = {
  timing: AbilityTiming;
  attackTarget?: InternalUnit;
  fallenUnit?: InternalUnit;
  appliedEffect?: {
    effect: AbilityEffectDefinition;
    target: InternalUnit;
    disposition: EffectDisposition;
  };
};

type AttackCategory = 'normal' | 'retaliation' | 'strike';

type AttackContext = {
  mode: 'melee' | 'ranged' | 'blast';
  category: AttackCategory;
};

interface InternalState {
  units: Map<string, InternalUnit>;
  pendingDiggyHoleCombatants: Record<SideId, ResolvedCombatantDefinition[]>;
  copiousAleAppliedTroopKeys: Set<string>;
  corpses: Map<string, HexCoord>;
  summonedProfiles: Map<string, ReplayTroopProfile>;
  steps: BattleStep[];
  mapRadius: number;
  saturation: number;
  rng: Rng;
  beatCount: number;
  effects: {
    initiativeBonusPerBeat: number;
    rangedDamageMultiplier: number;
    removeFading: boolean;
    armorCap: number | null;
    randomMoveEveryBeats: number | null;
    decayDamagePerBeat: number;
  };
  replayId: string;
  input: BattleInput;
  currentTurnUnitId: string | null;
  changelingTriggeredSides: Set<SideId>;
  pendingGraveVigorBlocks: Array<{ unitId: string; side: SideId }>;
}

interface SpawnContext {
  units: Map<string, InternalUnit>;
  rng: Rng;
  saturation: number;
}

const BASE_MAP_RADIUS = 3;
const DEFAULT_SATURATION = 10;
const MAX_BEATS = 1000;

function randomSeed(): number {
  return (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
}

function makeReplayId(seed: number, riftId: string | null): string {
  return `${riftId ?? 'debug'}-${seed}`;
}

function buildEffects(mutatorIds: string[]): InternalState['effects'] {
  return mutatorIds.reduce(
    (effects, mutatorId) => {
      const definition = getMutator(mutatorId);
      return {
        initiativeBonusPerBeat: effects.initiativeBonusPerBeat + (definition.initiativeBonusPerBeat ?? 0),
        rangedDamageMultiplier: effects.rangedDamageMultiplier * (definition.rangedDamageMultiplier ?? 1),
        removeFading: effects.removeFading || Boolean(definition.removeFading),
        armorCap:
          typeof definition.armorCap === 'number'
            ? effects.armorCap === null
              ? definition.armorCap
              : Math.min(effects.armorCap, definition.armorCap)
            : effects.armorCap,
        randomMoveEveryBeats:
          typeof definition.randomMoveEveryBeats === 'number'
            ? effects.randomMoveEveryBeats === null
              ? definition.randomMoveEveryBeats
              : Math.min(effects.randomMoveEveryBeats, definition.randomMoveEveryBeats)
            : effects.randomMoveEveryBeats,
        decayDamagePerBeat: effects.decayDamagePerBeat + (definition.decayDamagePerBeat ?? 0),
      };
    },
    { initiativeBonusPerBeat: 0, rangedDamageMultiplier: 1, removeFading: false, armorCap: null, randomMoveEveryBeats: null, decayDamagePerBeat: 0 },
  );
}

function filterMutatorBlockedAbilities<T extends AbilityDefinition | RuntimeAbilityState>(
  abilities: T[],
  effects: InternalState['effects'],
): T[] {
  if (!effects.removeFading) {
    return abilities;
  }
  return abilities.filter((entry) => ('definition' in entry ? entry.definition.id : entry.id) !== 'fading');
}

function applyArmorCap(value: number, effects: InternalState['effects']): number {
  if (effects.armorCap === null) {
    return value;
  }
  return Math.min(value, effects.armorCap);
}

function applyMutatorAdjustmentsToUnit(unit: InternalUnit, effects: InternalState['effects']): void {
  unit.resolvedAbilities = filterMutatorBlockedAbilities(unit.resolvedAbilities, effects);
  unit.resolvedStats.armor = applyArmorCap(unit.resolvedStats.armor, effects);
}

function getSideFactionUpgradeIds(state: InternalState, side: SideId): string[] {
  return side === 'player' ? (state.input.playerFactionUpgradeIds ?? []) : (state.input.enemyFactionUpgradeIds ?? []);
}

function getSideTroopTypeUpgradeIds(state: InternalState, side: SideId): string[] {
  return side === 'player' ? (state.input.playerTroopTypeUpgradeIds ?? []) : (state.input.enemyTroopTypeUpgradeIds ?? []);
}

function sideHasFactionUpgrade(state: InternalState, side: SideId, upgradeId: string): boolean {
  return getSideFactionUpgradeIds(state, side).includes(upgradeId);
}

function inputSideHasFactionUpgrade(input: BattleInput, side: SideId, upgradeId: string): boolean {
  return (side === 'player' ? (input.playerFactionUpgradeIds ?? []) : (input.enemyFactionUpgradeIds ?? [])).includes(upgradeId);
}

function sideHasTroopTypeUpgrade(state: InternalState, side: SideId, upgradeId: string): boolean {
  return getSideTroopTypeUpgradeIds(state, side).includes(upgradeId);
}

function cloneSnapshot(units: Map<string, InternalUnit>): BattleStateSnapshot {
  return {
    units: [...units.values()].map((unit) => ({
      id: unit.id,
      troopInstanceId: unit.troopInstanceId,
      troopId: `${unit.factionId}/${unit.unitTypeId}`,
      troopLabel: unit.troopLabel,
      unitTypeId: unit.unitTypeId,
      factionId: unit.factionId,
      side: unit.side,
      role: unit.role,
      type: unit.type,
      attributes: [...unit.attributes],
      position: { ...unit.position },
      stats: { ...unit.resolvedStats },
      hp: fixed(unit.hp),
      maxHp: fixed(unit.maxHp),
      initiative: fixed(unit.initiative),
      alive: unit.alive,
      engagedWithIds: [...unit.engagedWith],
    })),
  };
}

function createAliveCount(snapshot: BattleStateSnapshot): BattleReplay['aliveCounts'][number] {
  const byTroopLabel: Record<string, number> = {};
  let player = 0;
  let enemy = 0;

  snapshot.units.forEach((unit) => {
    if (!unit.alive) {
      return;
    }
    if (unit.side === 'player') {
      player += 1;
    } else {
      enemy += 1;
    }
    byTroopLabel[unit.troopLabel] = (byTroopLabel[unit.troopLabel] ?? 0) + 1;
  });

  return { player, enemy, byTroopLabel };
}

function cloneAbilityDefinition(ability: AbilityDefinition): AbilityDefinition {
  return {
    ...ability,
    trigger: { ...ability.trigger, fallen: ability.trigger.fallen ? { ...ability.trigger.fallen } : undefined },
    duration: { ...ability.duration },
    target: ability.target
      ? {
          ...ability.target,
          filters: ability.target.filters
            ? {
                notTypes: ability.target.filters.notTypes ? [...ability.target.filters.notTypes] : undefined,
                onlyTypes: ability.target.filters.onlyTypes ? [...ability.target.filters.onlyTypes] : undefined,
                prioritizeTypes: ability.target.filters.prioritizeTypes ? [...ability.target.filters.prioritizeTypes] : undefined,
                unengaged: ability.target.filters.unengaged,
              }
            : undefined,
        }
      : undefined,
    effects: ability.effects.map((effect) => ({ ...effect })),
  };
}

function createRuntimeAbilityState(ability: AbilityDefinition): RuntimeAbilityState {
  return {
    definition: cloneAbilityDefinition(ability),
    triggerCount: 0,
    usesRemaining: ability.trigger.maxUses ?? null,
  };
}

function countsTowardAllySaturationFromAbilities(abilities: AbilityDefinition[] | RuntimeAbilityState[]): boolean {
  return !abilities.some((entry) => ('definition' in entry ? entry.definition.id : entry.id) === 'scurry');
}

function buildTroopProfiles(
  input: BattleInput,
  summonedProfiles: Map<string, ReplayTroopProfile>,
  effects: InternalState['effects'],
): ReplayTroopProfile[] {
  const seen = new Set<string>();
  const profiles: ReplayTroopProfile[] = [];

  [...input.playerCombatants, ...input.enemyCombatants].forEach((combatant) => {
    const key = `${combatant.side}:${combatant.label}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    const stats = { ...combatant.stats, armor: applyArmorCap(combatant.stats.armor, effects) };
    const abilities = filterMutatorBlockedAbilities(combatant.abilities, effects).map(cloneAbilityDefinition);
    const statBreakdowns =
      combatant.statBreakdowns
        ? {
            ...combatant.statBreakdowns,
            armor:
              stats.armor === combatant.stats.armor
                ? combatant.statBreakdowns.armor
                : {
                    ...combatant.statBreakdowns.armor,
                    finalValue: stats.armor,
                    lines: [
                      ...combatant.statBreakdowns.armor.lines,
                      { label: 'Corrosion', value: fixedSub(stats.armor, combatant.stats.armor), kind: 'delta' as const },
                    ],
                  },
          }
        : undefined;
    profiles.push({
      side: combatant.side,
      troopLabel: combatant.label,
      unitTypeId: combatant.unitTypeId,
      factionId: combatant.factionId,
      role: combatant.role,
      type: combatant.type,
      attributes: [...combatant.attributes],
      stats,
      abilities,
      statBreakdowns:
        statBreakdowns ??
        {
          health: { stat: 'health', finalValue: stats.health, lines: [{ label: 'Resolved', value: stats.health, kind: 'base' }] },
          damage: { stat: 'damage', finalValue: stats.damage, lines: [{ label: 'Resolved', value: stats.damage, kind: 'base' }] },
          speed: { stat: 'speed', finalValue: stats.speed, lines: [{ label: 'Resolved', value: stats.speed, kind: 'base' }] },
          armor: { stat: 'armor', finalValue: stats.armor, lines: [{ label: 'Resolved', value: stats.armor, kind: 'base' }] },
          range: { stat: 'range', finalValue: stats.range, lines: [{ label: 'Resolved', value: stats.range, kind: 'base' }] },
          capacity: { stat: 'capacity', finalValue: stats.capacity, lines: [{ label: 'Resolved', value: stats.capacity, kind: 'base' }] },
          size: { stat: 'size', finalValue: stats.size, lines: [{ label: 'Resolved', value: stats.size, kind: 'base' }] },
        },
    });
  });

  summonedProfiles.forEach((profile, key) => {
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    profiles.push(profile);
  });

  return profiles;
}

function buildStep(
  state: InternalState,
  kind: BattleStepKind,
  actorIds: string[],
  targetIds: string[],
  message: string,
  metadata?: BattleStepMetadata,
): void {
  const enrichedMetadata = enrichStepMetadata(state, kind, actorIds, targetIds, metadata);
  const formattedMessage = appendSourceContext(state, actorIds, message, enrichedMetadata);
  const previous = state.steps[state.steps.length - 1];
  if (previous && tryMergeStep(state, previous, kind, actorIds, targetIds, formattedMessage, enrichedMetadata)) {
    return;
  }
  state.steps.push({
    index: state.steps.length,
    kind,
    actorIds,
    targetIds,
    message: formattedMessage,
    metadata: enrichedMetadata,
    snapshot: cloneSnapshot(state.units),
  });
}

function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function mergeUniqueIds(left: string[], right: string[]): string[] {
  const seen = new Set(left);
  const merged = [...left];
  right.forEach((id) => {
    if (!seen.has(id)) {
      seen.add(id);
      merged.push(id);
    }
  });
  return merged;
}

function canMergeStep(previous: BattleStep, kind: BattleStepKind, actorIds: string[], metadata?: BattleStepMetadata): boolean {
  const previousMetadata = previous.metadata;
  if (!previousMetadata || !metadata || previous.kind !== kind || !sameIds(previous.actorIds, actorIds)) {
    return false;
  }
  if (!metadata.sourceAbilityId || previousMetadata.sourceAbilityId !== metadata.sourceAbilityId) {
    return false;
  }
  if (previousMetadata.effect !== metadata.effect) {
    return false;
  }
  return (
    previousMetadata.stat === metadata.stat &&
    previousMetadata.temporary === metadata.temporary &&
    previousMetadata.expired === metadata.expired &&
    previousMetadata.abilityId === metadata.abilityId &&
    previousMetadata.role === metadata.role &&
    previousMetadata.unitTypeId === metadata.unitTypeId
  );
}

function mergedNumericValue(left: unknown, right: unknown): number | undefined {
  return typeof left === 'number' && typeof right === 'number' ? fixedAdd(left, right) : undefined;
}

function unitLabelsForIds(state: InternalState, targetIds: string[]): string[] {
  return targetIds.map((id) => state.units.get(id)?.troopLabel).filter((label): label is string => Boolean(label));
}

function formatTargetSubject(state: InternalState, targetIds: string[]): string {
  const labels = [...new Set(unitLabelsForIds(state, targetIds))];
  if (labels.length === 0) {
    return 'Targets';
  }
  if (labels.length === 1) {
    return labels[0]!;
  }
  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }
  return `${labels[0]} and ${labels.length - 1} others`;
}

function subjectVerb(subject: string, singularVerb: string, pluralVerb: string): string {
  return subject.includes(' and ') ? pluralVerb : singularVerb;
}

function rebuildBatchedMessage(state: InternalState, step: BattleStep): string {
  const metadata = step.metadata;
  if (!metadata) {
    return step.message;
  }
  const targetSubject = formatTargetSubject(state, step.targetIds);
  const amount = typeof metadata.amount === 'number' ? metadata.amount : undefined;
  const sourceSuffix = sourceLabelForStep(state, step.actorIds, metadata);
  const finish = (base: string) => (sourceSuffix ? `${base} from the ${sourceSuffix}.` : `${base}.`);
  const untilEndOfTurn = metadata.temporary === true && metadata.expired !== true ? ' until end of turn' : '';
  const verb = metadata.expired === true || (typeof amount === 'number' && amount < 0) ? 'loses' : 'gains';
  const signedAmount = typeof amount === 'number' ? (verb === 'gains' ? formatSigned(amount) : formatSigned(Math.abs(amount))) : null;

  if ((metadata.effect === 'ramp' || (metadata.effect === 'statDelta' && metadata.stat === 'damage')) && signedAmount) {
    return finish(`${targetSubject} ${subjectVerb(targetSubject, verb, verb === 'gains' ? 'gain' : 'lose')} ${signedAmount} damage${untilEndOfTurn}`);
  }
  if ((metadata.effect === 'haste' || (metadata.effect === 'statDelta' && metadata.stat === 'speed')) && signedAmount) {
    return finish(`${targetSubject} ${subjectVerb(targetSubject, verb, verb === 'gains' ? 'gain' : 'lose')} ${signedAmount} speed${untilEndOfTurn}`);
  }
  if (metadata.effect === 'bolster' && signedAmount) {
    return finish(`${targetSubject} ${subjectVerb(targetSubject, verb, verb === 'gains' ? 'gain' : 'lose')} ${signedAmount} health${untilEndOfTurn}`);
  }
  if (metadata.effect === 'initiativeDelta' && signedAmount) {
    return finish(`${targetSubject} ${subjectVerb(targetSubject, verb, verb === 'gains' ? 'gain' : 'lose')} ${signedAmount} initiative`);
  }
  if (metadata.effect === 'summon') {
    const actor = step.actorIds.length === 1 ? state.units.get(step.actorIds[0]!) ?? null : null;
    const summonedLabels = [...new Set(unitLabelsForIds(state, step.targetIds))];
    const summonedLabel = summonedLabels.length === 1 ? summonedLabels[0]! : `${step.targetIds.length} units`;
    const countSuffix = step.targetIds.length > 1 && summonedLabels.length === 1 ? ` x${step.targetIds.length}` : '';
    return finish(`${actor?.troopLabel ?? 'A unit'} summons ${summonedLabel}${countSuffix}`);
  }
  if (metadata.effect === 'heal' && typeof metadata.amount === 'number') {
    const actor = step.actorIds.length === 1 ? state.units.get(step.actorIds[0]!) ?? null : null;
    return finish(`${actor?.troopLabel ?? 'A unit'} heals ${targetSubject} for ${formatFixed(metadata.amount)}`);
  }
  if (kindIsAttackStep(step) && typeof metadata.damage === 'number') {
    const actor = step.actorIds.length === 1 ? state.units.get(step.actorIds[0]!) ?? null : null;
    const mode = metadata.mode === 'blast' ? 'blast damage to' : 'damage to';
    return finish(`${actor?.troopLabel ?? 'A unit'} deals ${formatFixed(metadata.damage)} ${mode} ${targetSubject}`);
  }
  return step.message;
}

function kindIsAttackStep(step: BattleStep): boolean {
  return step.kind === 'attack';
}

function tryMergeStep(
  state: InternalState,
  previous: BattleStep,
  kind: BattleStepKind,
  actorIds: string[],
  targetIds: string[],
  _message: string,
  metadata?: BattleStepMetadata,
): boolean {
  if (!canMergeStep(previous, kind, actorIds, metadata)) {
    return false;
  }
  const repeatsExistingTargets = targetIds.length > 0 && targetIds.every((id) => previous.targetIds.includes(id));
  previous.targetIds = mergeUniqueIds(previous.targetIds, targetIds);
  const previousMetadata = previous.metadata!;
  if (repeatsExistingTargets || targetIds.length === 0) {
    const amount = mergedNumericValue(previousMetadata.amount, metadata!.amount);
    if (typeof amount === 'number') {
      previousMetadata.amount = amount;
    }
    const damage = mergedNumericValue(previousMetadata.damage, metadata!.damage);
    if (typeof damage === 'number') {
      previousMetadata.damage = damage;
      previousMetadata.finalDamage = damage;
    }
  }
  previousMetadata.batchCount = ((typeof previousMetadata.batchCount === 'number' ? previousMetadata.batchCount : 1) + 1);
  previous.snapshot = cloneSnapshot(state.units);
  previous.metadata = enrichStepMetadata(state, previous.kind, previous.actorIds, previous.targetIds, previousMetadata);
  previous.message = rebuildBatchedMessage(state, previous);
  return true;
}

function buildAbilityExplanation(metadata: BattleStepMetadata): BattleAbilityExplanation | undefined {
  if (!metadata.sourceAbilityId && !metadata.sourceAbilityLabel) {
    return undefined;
  }

  return {
    abilityId: metadata.sourceAbilityId ?? 'battle-resolution',
    abilityLabel: metadata.sourceAbilityLabel,
    effect: typeof metadata.effect === 'string' ? metadata.effect : undefined,
  };
}

function buildMovementExplanation(kind: 'move' | 'engage', actor: InternalUnit | null, metadata: BattleStepMetadata): BattleMovementExplanation | undefined {
  const hasDestination = typeof metadata.toQ === 'number' && typeof metadata.toR === 'number';
  const hasRoleDecision = typeof metadata.roleIntent === 'string' && typeof metadata.reasonCode === 'string';
  const effect = typeof metadata.effect === 'string' ? metadata.effect : undefined;

  if (!hasDestination && !hasRoleDecision && !effect && kind !== 'engage') {
    return undefined;
  }

  const movementKind =
    hasRoleDecision ? 'objective' : effect === 'fadeIntoShadow' || effect === 'skirmishersStep' ? 'ability' : effect ? 'retreat' : 'generic';
  const movementPhase =
    effect === 'fadeIntoShadow' || effect === 'skirmishersStep'
      ? 'ability'
      : effect
        ? 'withdraw'
        : kind === 'engage'
          ? 'commit'
          : hasDestination || hasRoleDecision
            ? 'approach'
            : 'generic';

  return {
    stepKind: kind,
    movementKind,
    movementPhase,
    unitRole: actor?.role,
    roleIntent: metadata.roleIntent,
    reasonCode: metadata.reasonCode,
    targetRole: metadata.targetRole,
    targetHex:
      typeof metadata.targetHexQ === 'number' && typeof metadata.targetHexR === 'number'
        ? { q: metadata.targetHexQ, r: metadata.targetHexR }
        : undefined,
    destination: hasDestination ? { q: metadata.toQ as number, r: metadata.toR as number } : undefined,
    keepEnemyInRange: effect === 'skirmishersStep' ? true : undefined,
  };
}

function buildDamageExplanation(metadata: BattleStepMetadata): BattleDamageExplanation | undefined {
  if (typeof metadata.damage !== 'number' || typeof metadata.mode !== 'string' || typeof metadata.category !== 'string') {
    return undefined;
  }

  return {
    mode: metadata.mode,
    category: metadata.category,
    baseDamage: typeof metadata.baseDamage === 'number' ? metadata.baseDamage : metadata.damage,
    attackDamageBeforeArmor: typeof metadata.attackDamageBeforeArmor === 'number' ? metadata.attackDamageBeforeArmor : metadata.damage,
    finalDamage: metadata.damage,
    heartseekerMultiplier: typeof metadata.heartseekerMultiplier === 'number' ? metadata.heartseekerMultiplier : undefined,
    distanceBonus: typeof metadata.distanceBonus === 'number' ? metadata.distanceBonus : undefined,
    armorBefore: typeof metadata.armorBefore === 'number' ? metadata.armorBefore : undefined,
    armorReduction: typeof metadata.armorReduction === 'number' ? metadata.armorReduction : undefined,
    armorApplied: typeof metadata.armorApplied === 'number' ? metadata.armorApplied : undefined,
    armorInteraction: metadata.armorIgnored ? 'ignored' : 'normal',
    rangedMultiplier: typeof metadata.rangedMultiplier === 'number' ? metadata.rangedMultiplier : undefined,
  };
}

function enrichStepMetadata(
  state: InternalState,
  kind: BattleStepKind,
  actorIds: string[],
  targetIds: string[],
  metadata?: BattleStepMetadata,
): BattleStepMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  const activeUnitId = metadata.activeUnitId ?? actorIds[0] ?? targetIds[0];
  const secondaryUnitIds = metadata.secondaryUnitIds ?? [...new Set([...actorIds, ...targetIds].filter((id) => id !== activeUnitId))];
  const participationMetadata = {
    ...metadata,
    activeUnitId,
    secondaryUnitIds,
  };

  if (metadata.explanation) {
    return participationMetadata;
  }

  const actor = actorIds.length === 1 ? state.units.get(actorIds[0]!) ?? null : null;
  const explanation: BattleStepExplanation = {};

  if (kind === 'beat' && typeof metadata.beat === 'number') {
    explanation.beat = {
      beat: metadata.beat,
      initiativeBonus: typeof metadata.initiativeBonus === 'number' ? metadata.initiativeBonus : 0,
      initiativePurposeHint: 'Initiative fills until a unit reaches 100 and takes a turn.',
    };
  }

  if (kind === 'move' || kind === 'engage') {
    const movement = buildMovementExplanation(kind, actor, metadata);
    if (movement) {
      explanation.movement = movement;
    }
  }

  if (kind === 'attack') {
    const damage = buildDamageExplanation(metadata);
    if (damage) {
      explanation.damage = damage;
    }
  }

  if (kind === 'buff' || kind === 'heal' || kind === 'death' || kind === 'engage' || kind === 'move' || kind === 'attack') {
    const ability = buildAbilityExplanation(metadata);
    if (ability) {
      explanation.ability = ability;
    }
  }

  return Object.keys(explanation).length > 0 ? { ...participationMetadata, explanation } : participationMetadata;
}

function emitRoleIntentStep(
  state: InternalState,
  kind: 'move' | 'engage',
  actor: InternalUnit,
  targets: InternalUnit[],
  message: string,
  metadata: BattleStepMetadata,
): void {
  buildStep(state, kind, [actor.id], targets.map((target) => target.id), message, metadata);
}

function startingCorner(side: SideId, radius: number): HexCoord {
  return side === 'player' ? { q: -radius, r: 0 } : { q: radius, r: 0 };
}

function meleeStart(side: SideId, radius: number): HexCoord {
  return side === 'player' ? { q: -radius + 1, r: 0 } : { q: radius - 1, r: 0 };
}

function expandSpawnCells(
  side: SideId,
  origin: HexCoord,
  radius: number,
  activeCells: HexCoord[],
  forbidden: Set<string>,
): boolean {
  const enemyCorner = startingCorner(side === 'player' ? 'enemy' : 'player', radius);
  const originEnemyDistance = hexDistance(origin, enemyCorner);
  const frontier = new Map<string, HexCoord>();
  const baseCells = activeCells.length > 0 ? activeCells : [origin];

  baseCells.forEach((cell) => {
    neighbors(cell)
      .filter((neighbor) => inRadius(neighbor, radius))
      .forEach((neighbor) => {
        const key = hexKey(neighbor);
        if (forbidden.has(key) || activeCells.some((active) => equalsHex(active, neighbor))) {
          return;
        }
        frontier.set(key, neighbor);
      });
  });

  if (frontier.size === 0) {
    return false;
  }

  const candidates = [...frontier.values()];
  const bestDelta = Math.min(...candidates.map((cell) => Math.abs(hexDistance(cell, enemyCorner) - originEnemyDistance)));
  const nextCells = candidates.filter((cell) => Math.abs(hexDistance(cell, enemyCorner) - originEnemyDistance) === bestDelta);

  nextCells.forEach((cell) => {
    if (!activeCells.some((active) => equalsHex(active, cell))) {
      activeCells.push(cell);
    }
  });

  return nextCells.length > 0;
}

function placeUnitWithExpandableCells(
  combatant: ResolvedCombatantDefinition,
  side: SideId,
  origin: HexCoord,
  radius: number,
  activeCells: HexCoord[],
  context: SpawnContext,
  forbidden: Set<string>,
  occupancy: Map<string, number>,
): HexCoord | null {
  const size = countsTowardAllySaturationFromAbilities(combatant.abilities) ? combatant.stats.size : 0;
  if (size > context.saturation) {
    return null;
  }

  while (true) {
    const candidates = activeCells
      .map((cell) => {
        const key = hexKey(cell);
        if (forbidden.has(key)) {
          return null;
        }
        const used = occupancy.get(key) ?? 0;
        if (fixedAdd(used, size) > context.saturation) {
          return null;
        }
        return { cell, used, utilization: fixed(used / context.saturation) };
      })
      .filter((item): item is { cell: HexCoord; used: number; utilization: number } => item !== null);

    if (candidates.length > 0) {
      const minUtilization = Math.min(...candidates.map((item) => item.utilization));
      const finalists = candidates.filter((item) => item.utilization === minUtilization);
      const minUsed = Math.min(...finalists.map((item) => item.used));
      const selected = context.rng.pick(finalists.filter((item) => item.used === minUsed)).cell;
      const key = hexKey(selected);
      occupancy.set(key, fixedAdd(occupancy.get(key) ?? 0, size));
      return selected;
    }

    if (!expandSpawnCells(side, origin, radius, activeCells, forbidden)) {
      return null;
    }
  }
}

function spawnGroup(
  side: SideId,
  combatants: ResolvedCombatantDefinition[],
  origin: HexCoord,
  radius: number,
  context: SpawnContext,
  forbidden: Set<string>,
): Set<string> | null {
  if (combatants.length === 0) {
    return new Set<string>();
  }

  const totalGroupSize = fixedSum(
    combatants.map((combatant) => (countsTowardAllySaturationFromAbilities(combatant.abilities) ? combatant.stats.size : 0)),
  );
  const targetCellCount = Math.max(1, Math.ceil(totalGroupSize / context.saturation));
  const activeCells: HexCoord[] = forbidden.has(hexKey(origin)) ? [] : [origin];
  const occupancy = new Map<string, number>();
  const usedHexes = new Set<string>();

  while (activeCells.length < targetCellCount) {
    if (!expandSpawnCells(side, origin, radius, activeCells, forbidden)) {
      break;
    }
  }

  combatants.forEach((combatant, index) => {
    const slot = placeUnitWithExpandableCells(combatant, side, origin, radius, activeCells, context, forbidden, occupancy);
    if (!slot) {
      throw new Error('Failed to spawn combatant');
    }

    const unitId = `${side}_${combatant.combatantId}_${index}`;
    usedHexes.add(hexKey(slot));
    context.units.set(unitId, {
      id: unitId,
      troopInstanceId: combatant.troopInstanceId,
      troopLabel: combatant.label,
      unitTypeId: combatant.unitTypeId,
      factionId: combatant.factionId,
      side,
      summonerUnitId: null,
      role: combatant.role,
      type: combatant.type,
      attributes: [...combatant.attributes],
      position: { ...slot },
      hp: combatant.stats.health,
      maxHp: combatant.stats.health,
      initiative: fixed(context.rng.int(11)),
      alive: true,
      engagedWith: new Set<string>(),
      resolvedStats: { ...combatant.stats },
      resolvedAbilities: combatant.abilities.map(createRuntimeAbilityState),
      activeTimedEffects: [],
      committedBacklineTargetId: null,
      graveVigorBlockedSides: new Set<SideId>(),
      mercyBeforeDawnUsed: false,
      stonebloodUsed: false,
      fadeIntoShadowUsed: false,
      glamourUsed: false,
      brambleSnareStacks: 0,
      bonusStrikeCharges: 0,
      scavengersHungerKills: 0,
      sentinelRunesTriggered: false,
      berserkDeathPending: false,
      berserkTurnsUntilDeath: 0,
    });
  });

  return usedHexes;
}

function expandCombatants(combatants: ResolvedCombatantDefinition[]): ResolvedCombatantDefinition[] {
  return combatants.flatMap((combatant) =>
    Array.from({ length: combatant.quantity }, (_, index) => ({
      ...combatant,
      quantity: 1,
      combatantId: `${combatant.combatantId}-${index + 1}`,
    })),
  );
}

function spawnUnitsForSide(
  side: SideId,
  combatants: ResolvedCombatantDefinition[],
  radius: number,
  context: SpawnContext,
  placementSide: SideId = side,
): boolean {
  const ranged = combatants.filter((combatant) => combatant.stats.range > 0);
  const melee = combatants.filter((combatant) => combatant.stats.range === 0);
  const meleeForbidden = new Set<string>();

  const rangedHexes = spawnGroup(side, ranged, startingCorner(placementSide, radius), radius, context, new Set<string>());
  if (!rangedHexes) {
    return false;
  }
  rangedHexes.forEach((key) => meleeForbidden.add(key));
  const meleeHexes = spawnGroup(side, melee, meleeStart(placementSide, radius), radius, context, meleeForbidden);
  return meleeHexes !== null;
}

function shouldDelayForDiggyHole(input: BattleInput, combatant: ResolvedCombatantDefinition): boolean {
  return combatant.factionId === 'dwarf' && inputSideHasFactionUpgrade(input, combatant.side, 'dwarf-diggy-hole');
}

function initializeUnits(input: BattleInput, rng: Rng): { units: Map<string, InternalUnit>; mapRadius: number; pendingDiggyHoleCombatants: Record<SideId, ResolvedCombatantDefinition[]> } {
  let radius = BASE_MAP_RADIUS;
  const playerExpanded = expandCombatants(input.playerCombatants);
  const enemyExpanded = expandCombatants(input.enemyCombatants);
  const pendingDiggyHoleCombatants = {
    player: playerExpanded.filter((combatant) => shouldDelayForDiggyHole(input, combatant)),
    enemy: enemyExpanded.filter((combatant) => shouldDelayForDiggyHole(input, combatant)),
  };
  const playerUnits = playerExpanded.filter((combatant) => !shouldDelayForDiggyHole(input, combatant));
  const enemyUnits = enemyExpanded.filter((combatant) => !shouldDelayForDiggyHole(input, combatant));
  const saturation = input.saturation ?? DEFAULT_SATURATION;

  while (true) {
    const units = new Map<string, InternalUnit>();
    const context: SpawnContext = { units, rng, saturation };
    const playerOk = spawnUnitsForSide('player', playerUnits, radius, context);
    const enemyOk = playerOk && spawnUnitsForSide('enemy', enemyUnits, radius, context);
    if (playerOk && enemyOk) {
      return { units, mapRadius: radius, pendingDiggyHoleCombatants };
    }
    radius += 1;
  }
}

function getAliveUnits(state: InternalState, side?: SideId): InternalUnit[] {
  return [...state.units.values()].filter((unit) => unit.alive && (!side || unit.side === side));
}

function hasPendingDiggyHoleUnits(state: InternalState, side: SideId): boolean {
  return state.pendingDiggyHoleCombatants[side].length > 0;
}

function resolveBattleOutcome(state: InternalState): 'victory' | 'defeat' | 'draw' {
  const playerAlive = getAliveUnits(state, 'player').length > 0;
  const enemyAlive = getAliveUnits(state, 'enemy').length > 0;
  if (playerAlive && !enemyAlive) return 'victory';
  if (!playerAlive && enemyAlive) return 'defeat';
  return 'draw';
}

function clearStaleEngagements(state: InternalState): void {
  state.units.forEach((unit) => {
    unit.engagedWith.forEach((enemyId) => {
      const enemy = state.units.get(enemyId);
      if (!enemy?.alive || !equalsHex(enemy.position, unit.position)) {
        unit.engagedWith.delete(enemyId);
      }
    });
  });
}

function availableCapacity(state: InternalState, unit: InternalUnit): number {
  const used = fixedSum(
    [...unit.engagedWith]
      .map((enemyId) => state.units.get(enemyId))
      .filter((enemy): enemy is InternalUnit => Boolean(enemy))
      .map((enemy) => enemy.resolvedStats.size),
  );
  return fixedMax(fixedSub(unit.resolvedStats.capacity, used), 0);
}

function enemyUnitsOnHex(state: InternalState, unit: InternalUnit): InternalUnit[] {
  return getAliveUnits(state).filter((other) => other.side !== unit.side && equalsHex(other.position, unit.position));
}

function nonEngagedEnemiesOnHex(state: InternalState, unit: InternalUnit): InternalUnit[] {
  return enemyUnitsOnHex(state, unit).filter((enemy) => enemy.engagedWith.size === 0);
}

function removeAllEngagements(state: InternalState, unit: InternalUnit): void {
  [...unit.engagedWith].forEach((enemyId) => {
    const enemy = state.units.get(enemyId);
    if (enemy) {
      enemy.engagedWith.delete(unit.id);
    }
    unit.engagedWith.delete(enemyId);
  });
}

function createEngagement(state: InternalState, actor: InternalUnit, target: InternalUnit): void {
  actor.engagedWith.add(target.id);
  target.engagedWith.add(actor.id);
  if (
    !target.fadeIntoShadowUsed &&
    hasAbility(target, 'fade-into-shadow') &&
    target.role === 'backline' &&
    target.attributes.includes('elf')
  ) {
    target.fadeIntoShadowUsed = true;
    retreatFromEngagement(state, target, actor, `${target.troopLabel} fades into shadow.`, 'fadeIntoShadow');
  }
  if (actor.alive && target.alive && actor.engagedWith.has(target.id) && hasAbility(actor, 'first-blood')) {
    attack(state, actor, target, actor.resolvedStats.range > 0 ? 'ranged' : 'melee', true, 0, 'normal');
  }
}

function engageEnemiesOnHex(
  state: InternalState,
  actor: InternalUnit,
  roles: RoleId[] = [],
  includeAlreadyEngaged = false,
): InternalUnit[] {
  let remainingCapacity = availableCapacity(state, actor);
  const engagedTargets: InternalUnit[] = [];
  const candidates = enemyUnitsOnHex(state, actor)
    .filter((enemy) => matchesRoleFilter(enemy, roles))
    .filter((enemy) => !actor.engagedWith.has(enemy.id))
    .filter((enemy) => includeAlreadyEngaged || enemy.engagedWith.size === 0);
  const candidatesByPriority = [
    ...state.rng.shuffle(candidates.filter((enemy) => enemy.engagedWith.size === 0)),
    ...state.rng.shuffle(candidates.filter((enemy) => enemy.engagedWith.size > 0)),
  ];

  if (remainingCapacity <= 0 || candidatesByPriority.length === 0) {
    return engagedTargets;
  }

  candidatesByPriority.forEach((enemy) => {
    if (enemy.resolvedStats.size <= remainingCapacity && enemy.alive && !actor.engagedWith.has(enemy.id)) {
      createEngagement(state, actor, enemy);
      if (enemy.alive && actor.engagedWith.has(enemy.id)) {
        remainingCapacity = fixedSub(remainingCapacity, enemy.resolvedStats.size);
        engagedTargets.push(enemy);
      }
    }
  });

  return engagedTargets;
}

function matchesRoleFilter(unit: InternalUnit, roles: RoleId[]): boolean {
  return roles.length === 0 || roles.includes(unit.role);
}

function getDistinctFriendlyUnitTypes(state: InternalState, unit: InternalUnit): string[] {
  return [...new Set(getAliveUnits(state, unit.side).map((entry) => entry.type))];
}

function formatSigned(value: number): string {
  return value >= 0 ? `+${formatFixed(value)}` : formatFixed(value);
}

function formatPossessive(label: string): string {
  return `${label}'s`;
}

function sourceLabelForStep(state: InternalState, actorIds: string[], metadata?: BattleStepMetadata): string | null {
  const sourceAbilityId = metadata?.sourceAbilityId;
  if (!sourceAbilityId) {
    return null;
  }
  if (sourceAbilityId === 'battle-resolution') {
    return metadata?.sourceAbilityLabel ?? 'Battle resolution';
  }
  const actor = actorIds.length === 1 ? state.units.get(actorIds[0]!) ?? null : null;
  let abilityLabel = metadata?.sourceAbilityLabel ?? sourceAbilityId;
  if (!metadata?.sourceAbilityLabel) {
    try {
      abilityLabel = getAbility(sourceAbilityId).label;
    } catch {
      try {
        abilityLabel = getMutator(sourceAbilityId).label;
      } catch {
        abilityLabel = sourceAbilityId;
      }
    }
  }
  return actor ? `${formatPossessive(actor.troopLabel)} ${abilityLabel} ability` : `${abilityLabel} ability`;
}

function appendSourceContext(state: InternalState, actorIds: string[], message: string, metadata?: BattleStepMetadata): string {
  const sourceLabel = sourceLabelForStep(state, actorIds, metadata);
  if (!sourceLabel) {
    return message;
  }
  const trimmed = message.trim();
  const withoutPeriod = trimmed.endsWith('.') ? trimmed.slice(0, -1) : trimmed;
  return `${withoutPeriod} from the ${sourceLabel}.`;
}

function hasAbility(unit: InternalUnit, abilityId: string): boolean {
  return unit.resolvedAbilities.some((runtime) => runtime.definition.id === abilityId);
}

function isDwarf(unit: InternalUnit): boolean {
  return unit.factionId === 'dwarf' || unit.attributes.includes('dwarf');
}

function isFae(unit: InternalUnit): boolean {
  return unit.factionId === 'fae' || unit.attributes.includes('fae');
}

function canTakeDamage(unit: InternalUnit): boolean {
  return !unit.berserkDeathPending;
}

function isRangedOrCaster(unit: InternalUnit): boolean {
  return unit.attributes.includes('ranged') || unit.attributes.includes('caster');
}

function shouldTubthump(target: InternalUnit, stat: 'speed' | 'damage', amount: number): boolean {
  return amount < 0 && hasAbility(target, 'tubthumping') && (stat === 'speed' || stat === 'damage');
}

function findProtectingPriest(state: InternalState, target: InternalUnit): InternalUnit | null {
  const priests = getAliveUnits(state, target.side).filter(
    (ally) => hasAbility(ally, 'mercy-before-dawn') && hexDistance(ally.position, target.position) <= ally.resolvedStats.range,
  );
  return pickNearestUnit(state, target, priests);
}

function saveUnitFromDeath(
  state: InternalState,
  source: InternalUnit,
  target: InternalUnit,
  hp: number,
  effect: string,
  message: string,
  sourceAbilityId: string,
): boolean {
  target.hp = hp;
  buildStep(state, 'buff', [source.id], [target.id], message, {
    effect,
    amount: hp,
    sourceAbilityId,
    sourceAbilityLabel: getAbility(sourceAbilityId).label,
  });
  return true;
}

function healUnitToHp(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  targetHp: number,
  message: string,
  effectId: string,
): boolean {
  if (!target.alive || target.hp >= targetHp) {
    return false;
  }
  const nextHp = fixedClamp(targetHp, 0, target.maxHp);
  const actual = fixedSub(nextHp, target.hp);
  target.hp = nextHp;
  buildStep(state, 'heal', [actor.id], [target.id], message, {
    amount: actual,
    effect: effectId,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  if (actual > 0) {
    maybeApplyRowdyRegrowth(state, target);
  }
  maybeApplyBolsteringLight(state, actor, target, actual);
  maybeApplyOverflowingGrace(state, actor, target, actual);
  triggerUnitAbilities(state, actor, {
    timing: 'onEffectApplied',
    appliedEffect: {
      effect: { kind: 'heal', amount: actual, mode: 'flat', disposition: 'beneficial' },
      target,
      disposition: 'beneficial',
    },
  });
  return true;
}

function preventDeath(state: InternalState, actor: InternalUnit, target: InternalUnit): boolean {
  const protectingPriest = !target.mercyBeforeDawnUsed ? findProtectingPriest(state, target) : null;
  if (protectingPriest) {
    target.mercyBeforeDawnUsed = true;
    return healUnitToHp(
      state,
      protectingPriest,
      target,
      createRuntimeAbilityState(getAbility('mercy-before-dawn')),
      1,
      `${protectingPriest.troopLabel} preserves ${target.troopLabel} at 1 HP.`,
      'mercyBeforeDawn',
    );
  }

  if (!target.stonebloodUsed && hasAbility(target, 'stoneblood')) {
    target.stonebloodUsed = true;
    target.resolvedAbilities = target.resolvedAbilities.filter((runtime) => runtime.definition.id !== 'regen-5');
    return saveUnitFromDeath(state, target, target, 25, 'stoneblood', `${target.troopLabel} refuses to fall and stays at 25 HP.`, 'stoneblood');
  }

  if (!target.berserkDeathPending && hasAbility(target, 'berserk')) {
    target.berserkDeathPending = true;
    target.berserkTurnsUntilDeath = state.currentTurnUnitId === target.id ? 2 : 1;
    target.initiative = 0;
    return saveUnitFromDeath(state, target, target, 1, 'berserk', `${target.troopLabel} goes berserk and refuses damage until its next turn ends.`, 'berserk');
  }

  return false;
}

function getDistanceDamageBonus(actor: InternalUnit, target: InternalUnit, context: AttackContext): { damage: number; initiative: number } {
  if (context.mode !== 'ranged' || !hasAbility(actor, 'long-shot-doctrine') || !isRangedOrCaster(actor)) {
    return { damage: 0, initiative: 0 };
  }
  const distance = hexDistance(actor.position, target.position);
  return { damage: distance, initiative: distance * 2 };
}

function hasMatchingIdentityTag(unit: InternalUnit, tags: string[]): boolean {
  return tags.some((tag) => unit.type === tag || unit.attributes.includes(tag));
}

function evaluateScaledAmount(base: number, amount: number, mode: 'flat' | 'percent'): number {
  return mode === 'percent' ? fixedMul(base, amount / 100) : amount;
}

function amplifyPositiveAmount(target: InternalUnit, amount: number): number {
  if (amount <= 0 || !hasAbility(target, 'anointed')) {
    return amount;
  }
  return fixedMul(amount, 2);
}

function maybeApplyRowdyRegrowth(state: InternalState, target: InternalUnit): void {
  if (!hasAbility(target, 'rowdy-regrowth')) {
    return;
  }
  target.initiative = fixedAdd(target.initiative, 20);
  buildStep(state, 'buff', [target.id], [target.id], `${target.troopLabel} gains 20 initiative from Rowdy Regrowth.`, {
    effect: 'rowdyRegrowth',
    amount: 20,
    value: target.initiative,
    sourceAbilityId: 'rowdy-regrowth',
    sourceAbilityLabel: getAbility('rowdy-regrowth').label,
  });
}

function maybeApplyOverflowingGrace(state: InternalState, actor: InternalUnit, target: InternalUnit, actualHeal: number): void {
  if (!hasAbility(actor, 'overflowing-grace') || actualHeal <= 0 || target.hp < target.maxHp) {
    return;
  }
  target.initiative = fixedAdd(target.initiative, 40);
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} gains 40 initiative from Overflowing Grace.`, {
    effect: 'overflowingGrace',
    amount: 40,
    value: target.initiative,
    sourceAbilityId: 'overflowing-grace',
    sourceAbilityLabel: getAbility('overflowing-grace').label,
  });
}

function maybeApplyBolsteringLight(state: InternalState, actor: InternalUnit, target: InternalUnit, actualHeal: number): void {
  if (!hasAbility(actor, 'bolstering-light') || actualHeal <= 0) {
    return;
  }
  const runtime = createRuntimeAbilityState(getAbility('bolstering-light'));
  if (target.hp >= target.maxHp) {
    applyHaste(state, actor, target, runtime, { kind: 'haste', amount: 1, mode: 'flat', disposition: 'beneficial' });
    applyRamp(state, actor, target, runtime, { kind: 'ramp', amount: 1, mode: 'flat', disposition: 'beneficial' });
    return;
  }
  applyInitiativeDelta(state, actor, target, runtime, {
    kind: 'initiativeDelta',
    amount: 40,
    disposition: 'beneficial',
  });
}

function maybeGrantStaticCharge(state: InternalState, actor: InternalUnit, runtime: RuntimeAbilityState, target: InternalUnit, effect: AbilityEffectDefinition): void {
  if (!hasAbility(actor, 'static-charge') || effect.kind !== 'haste' || (runtime.definition.id !== 'enhance-1' && runtime.definition.id !== 'war-drums')) {
    return;
  }
  target.bonusStrikeCharges += 1;
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} is charged for 1 extra strike on its next normal attack.`, {
    effect: 'staticCharge',
    amount: 1,
    sourceAbilityId: 'static-charge',
    sourceAbilityLabel: getAbility('static-charge').label,
  });
}

function effectDisposition(effect: AbilityEffectDefinition): EffectDisposition {
  return effect.disposition ?? 'neutral';
}

function isGraveVigorBeneficialEffect(actor: InternalUnit, target: InternalUnit, effect: AbilityEffectDefinition): boolean {
  return hasAbility(actor, 'grave-vigor') && actor.side === target.side && effectDisposition(effect) === 'beneficial';
}

function isBlockedByGraveVigor(actor: InternalUnit, target: InternalUnit, effect: AbilityEffectDefinition): boolean {
  return isGraveVigorBeneficialEffect(actor, target, effect) && target.graveVigorBlockedSides.has(actor.side);
}

function markGraveVigorRecipient(state: InternalState, actor: InternalUnit, target: InternalUnit, effect: AbilityEffectDefinition): void {
  if (isGraveVigorBeneficialEffect(actor, target, effect)) {
    state.pendingGraveVigorBlocks.push({ unitId: target.id, side: actor.side });
  }
}

function flushPendingGraveVigorBlocks(state: InternalState): void {
  state.pendingGraveVigorBlocks.splice(0).forEach((entry) => {
    state.units.get(entry.unitId)?.graveVigorBlockedSides.add(entry.side);
  });
}

function applyPostEffectReactions(
  state: InternalState,
  actor: InternalUnit,
  runtime: RuntimeAbilityState,
  target: InternalUnit,
  effect: AbilityEffectDefinition,
): void {
  maybeGrantStaticCharge(state, actor, runtime, target, effect);
  markGraveVigorRecipient(state, actor, target, effect);
  triggerUnitAbilities(state, actor, {
    timing: 'onEffectApplied',
    appliedEffect: {
      effect,
      target,
      disposition: effectDisposition(effect),
    },
  });
}

function applyBolster(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'bolster' }>,
): boolean {
  const maxIncrease = amplifyPositiveAmount(target, evaluateScaledAmount(target.maxHp, effect.amount, effect.mode));
  const currentIncrease = amplifyPositiveAmount(target, evaluateScaledAmount(target.hp, effect.amount, effect.mode));
  if (maxIncrease <= 0 && currentIncrease <= 0) {
    return false;
  }
  target.maxHp = fixedAdd(target.maxHp, maxIncrease);
  target.hp = fixedClamp(fixedAdd(target.hp, currentIncrease), 0, target.maxHp);
  target.resolvedStats.health = target.maxHp;
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(maxIncrease)} health.`, {
    amount: maxIncrease,
    effect: 'bolster',
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  return true;
}

function applyRamp(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'ramp' }>,
): boolean {
  let increase = evaluateScaledAmount(target.resolvedStats.damage, effect.amount, effect.mode);
  if (shouldTubthump(target, 'damage', increase)) {
    increase = 1;
  }
  increase = amplifyPositiveAmount(target, increase);
  if (increase === 0) {
    return false;
  }
  target.resolvedStats.damage = fixedMax(fixedAdd(target.resolvedStats.damage, increase), 0);
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} ${increase >= 0 ? 'gains' : 'loses'} ${increase >= 0 ? formatSigned(increase) : formatFixed(Math.abs(increase))} damage.`, {
    amount: increase,
    effect: 'ramp',
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  return true;
}

function applyHaste(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'haste' }>,
): boolean {
  let increase = evaluateScaledAmount(target.resolvedStats.speed, effect.amount, effect.mode);
  if (shouldTubthump(target, 'speed', increase)) {
    increase = 1;
  }
  increase = amplifyPositiveAmount(target, increase);
  if (increase === 0) {
    return false;
  }
  target.resolvedStats.speed = fixedClamp(fixedAdd(target.resolvedStats.speed, increase), 1, 100);
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} ${increase >= 0 ? 'gains' : 'loses'} ${increase >= 0 ? formatSigned(increase) : formatFixed(Math.abs(increase))} speed.`, {
    amount: increase,
    effect: 'haste',
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  return true;
}

function healUnit(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'heal' }>,
): boolean {
  if (!target.alive) {
    return false;
  }
  const missing = fixedSub(target.maxHp, target.hp);
  const amount = amplifyPositiveAmount(target, effect.mode === 'percent' ? fixedMul(missing, effect.amount / 100) : effect.amount);
  const nextHp = fixedClamp(fixedAdd(target.hp, amount), 0, target.maxHp);
  const actual = fixedSub(nextHp, target.hp);
  target.hp = nextHp;
  buildStep(state, 'heal', [actor.id], [target.id], `${actor.troopLabel} heals ${target.troopLabel} for ${formatFixed(actual)}.`, {
    amount: actual,
    effect: 'heal',
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  if (actual > 0) {
    maybeApplyRowdyRegrowth(state, target);
  }
  maybeApplyBolsteringLight(state, actor, target, actual);
  maybeApplyOverflowingGrace(state, actor, target, actual);
  return true;
}

function applyStatDelta(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'statDelta' }>,
): boolean {
  if (!target.alive) {
    return false;
  }

  if (effect.stat === 'health') {
    const delta = amplifyPositiveAmount(target, evaluateScaledAmount(target.maxHp, effect.amount, effect.mode));
    if (delta === 0) {
      return false;
    }
    target.maxHp = fixedAdd(target.maxHp, delta);
    target.hp = fixedClamp(fixedAdd(target.hp, delta), 0, target.maxHp);
    target.resolvedStats.health = target.maxHp;
    buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} ${delta >= 0 ? 'gains' : 'loses'} ${formatFixed(Math.abs(delta))} health.`, {
      amount: delta,
      effect: 'statDelta',
      stat: effect.stat,
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
    });
    return true;
  }

  const currentValue = target.resolvedStats[effect.stat];
  let delta = evaluateScaledAmount(currentValue, effect.amount, effect.mode);
  if ((effect.stat === 'speed' || effect.stat === 'damage') && shouldTubthump(target, effect.stat, delta)) {
    delta = 1;
  }
  delta = amplifyPositiveAmount(target, delta);
  if (delta === 0) {
    return false;
  }
  const nextValue =
    effect.stat === 'armor'
      ? applyArmorCap(clampStat(effect.stat, fixedAdd(currentValue, delta)), state.effects)
      : clampStat(effect.stat, fixedAdd(currentValue, delta));
  const actual = fixedSub(nextValue, currentValue);
  if (actual === 0) {
    return false;
  }
  target.resolvedStats[effect.stat] = nextValue;
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} ${actual >= 0 ? 'gains' : 'loses'} ${actual >= 0 ? formatSigned(actual) : formatFixed(Math.abs(actual))} ${effect.stat}.`, {
    amount: actual,
    effect: 'statDelta',
    stat: effect.stat,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  return true;
}

function applyInitiativeDelta(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'initiativeDelta' }>,
): boolean {
  if (!target.alive || effect.amount === 0) {
    return false;
  }
  target.initiative = fixedMax(fixedAdd(target.initiative, effect.amount), 0);
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} ${effect.amount >= 0 ? 'gains' : 'loses'} ${formatFixed(Math.abs(effect.amount))} initiative.`, {
    effect: 'initiativeDelta',
    value: target.initiative,
    amount: effect.amount,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  return true;
}

function applyInitiativeSet(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'initiativeSet' }>,
): boolean {
  if (!target.alive || target.initiative === effect.value) {
    return false;
  }
  target.initiative = fixed(effect.value);
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} sets initiative to ${formatFixed(target.initiative)}.`, {
    effect: 'initiativeSet',
    value: target.initiative,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  return true;
}

function applyGrantAbility(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'grantAbility' }>,
): boolean {
  if (state.effects.removeFading && effect.abilityId === 'fading') {
    return false;
  }
  if (target.resolvedAbilities.some((entry) => entry.definition.id === effect.abilityId)) {
    return false;
  }
  target.resolvedAbilities.push(createRuntimeAbilityState(getAbility(effect.abilityId)));
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} gains ${getAbility(effect.abilityId).label}.`, {
    effect: 'grantAbility',
    abilityId: effect.abilityId,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  return true;
}

function applyRangeSet(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'rangeset' }>,
): boolean {
  if (target.resolvedStats.range === effect.value) {
    return false;
  }
  target.resolvedStats.range = fixedMax(effect.value, 0);
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} sets range to ${formatFixed(target.resolvedStats.range)}.`, {
    value: target.resolvedStats.range,
    effect: 'rangeset',
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  return true;
}

function applyRoleSet(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'roleset' }>,
): boolean {
  if (target.role === effect.role) {
    return false;
  }
  target.role = effect.role;
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} becomes ${effect.role}.`, {
    effect: 'roleset',
    role: effect.role,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  return true;
}

function applyTemporaryEffect(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'bolster' | 'haste' | 'ramp' | 'statDelta' | 'rangeset' | 'roleset' }>,
): boolean {
  const turns = runtime.definition.duration.kind === 'turns' ? runtime.definition.duration.turns : 0;
  if (turns <= 0) {
    return false;
  }

  if (effect.kind === 'bolster') {
    const maxApplied = amplifyPositiveAmount(target, evaluateScaledAmount(target.maxHp, effect.amount, effect.mode));
    const hpApplied = amplifyPositiveAmount(target, evaluateScaledAmount(target.hp, effect.amount, effect.mode));
    if (maxApplied <= 0 && hpApplied <= 0) {
      return false;
    }
    target.maxHp = fixedAdd(target.maxHp, maxApplied);
    target.hp = fixedClamp(fixedAdd(target.hp, hpApplied), 0, target.maxHp);
    target.resolvedStats.health = target.maxHp;
    target.activeTimedEffects.push({
      effectKind: 'bolster',
      sourceAbilityId: runtime.definition.id,
      sourceUnitId: actor.id,
      remainingTurns: turns,
      maxApplied,
      hpApplied,
    });
    buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(maxApplied)} health until end of turn.`, {
      amount: maxApplied,
      effect: 'bolster',
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
      temporary: true,
    });
    return true;
  }

  if (effect.kind === 'haste') {
    const amountApplied = amplifyPositiveAmount(target, evaluateScaledAmount(target.resolvedStats.speed, effect.amount, effect.mode));
    if (amountApplied <= 0) {
      return false;
    }
    target.resolvedStats.speed = fixedClamp(fixedAdd(target.resolvedStats.speed, amountApplied), 1, 100);
    target.activeTimedEffects.push({
      effectKind: 'haste',
      sourceAbilityId: runtime.definition.id,
      sourceUnitId: actor.id,
      remainingTurns: turns,
      amountApplied,
    });
    buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(amountApplied)} speed until end of turn.`, {
      amount: amountApplied,
      effect: 'haste',
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
      temporary: true,
    });
    return true;
  }

  if (effect.kind === 'ramp') {
    const amountApplied = amplifyPositiveAmount(target, evaluateScaledAmount(target.resolvedStats.damage, effect.amount, effect.mode));
    if (amountApplied <= 0) {
      return false;
    }
    target.resolvedStats.damage = fixedAdd(target.resolvedStats.damage, amountApplied);
    target.activeTimedEffects.push({
      effectKind: 'ramp',
      sourceAbilityId: runtime.definition.id,
      sourceUnitId: actor.id,
      remainingTurns: turns,
      amountApplied,
    });
    buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(amountApplied)} damage until end of turn.`, {
      amount: amountApplied,
      effect: 'ramp',
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
      temporary: true,
    });
    return true;
  }

  if (effect.kind === 'statDelta') {
    if (effect.stat === 'health' || effect.stat === 'size') {
      return false;
    }
    const currentValue = target.resolvedStats[effect.stat];
    const amountApplied = amplifyPositiveAmount(target, evaluateScaledAmount(currentValue, effect.amount, effect.mode));
    if (amountApplied === 0) {
      return false;
    }
    const nextValue =
      effect.stat === 'armor'
        ? applyArmorCap(clampStat(effect.stat, fixedAdd(currentValue, amountApplied)), state.effects)
        : clampStat(effect.stat, fixedAdd(currentValue, amountApplied));
    const actual = fixedSub(nextValue, currentValue);
    if (actual === 0) {
      return false;
    }
    target.resolvedStats[effect.stat] = nextValue;
    target.activeTimedEffects.push({
      effectKind: 'statDelta',
      sourceAbilityId: runtime.definition.id,
      sourceUnitId: actor.id,
      remainingTurns: turns,
      stat: effect.stat,
      amountApplied: actual,
    });
    buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} gains ${formatSigned(actual)} ${effect.stat} until end of turn.`, {
      amount: actual,
      effect: 'statDelta',
      stat: effect.stat,
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
      temporary: true,
    });
    return true;
  }

  if (effect.kind === 'rangeset') {
    if (target.resolvedStats.range === effect.value) {
      return false;
    }
    const previousValue = target.resolvedStats.range;
    target.resolvedStats.range = fixedMax(effect.value, 0);
    target.activeTimedEffects.push({
      effectKind: 'rangeset',
      sourceAbilityId: runtime.definition.id,
      sourceUnitId: actor.id,
      remainingTurns: turns,
      previousValue,
    });
    buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} sets range to ${formatFixed(target.resolvedStats.range)} until end of turn.`, {
      value: target.resolvedStats.range,
      effect: 'rangeset',
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
      temporary: true,
    });
    return true;
  }

  if (target.role === effect.role) {
    return false;
  }
  const previousRole = target.role;
  target.role = effect.role;
  target.activeTimedEffects.push({
    effectKind: 'roleset',
    sourceAbilityId: runtime.definition.id,
    sourceUnitId: actor.id,
    remainingTurns: turns,
    previousRole,
  });
  buildStep(state, 'buff', [actor.id], [target.id], `${target.troopLabel} becomes ${effect.role} until end of turn.`, {
    effect: 'roleset',
    role: effect.role,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
    temporary: true,
  });
  return true;
}

function expireTimedEffects(state: InternalState, unit: InternalUnit): void {
  const remaining: ActiveTimedEffect[] = [];
  unit.activeTimedEffects.forEach((effect) => {
    const nextTurns = effect.remainingTurns - 1;
    if (nextTurns > 0) {
      remaining.push({ ...effect, remainingTurns: nextTurns } as ActiveTimedEffect);
      return;
    }

    if (effect.effectKind === 'bolster') {
      unit.maxHp = fixedMax(fixedSub(unit.maxHp, effect.maxApplied), 1);
      unit.hp = fixedClamp(fixedSub(unit.hp, effect.hpApplied), 0, unit.maxHp);
      unit.resolvedStats.health = unit.maxHp;
      buildStep(state, 'buff', [effect.sourceUnitId], [unit.id], `${unit.troopLabel} loses ${formatSigned(effect.maxApplied)} health.`, {
        amount: effect.maxApplied,
        effect: 'bolster',
        sourceAbilityId: effect.sourceAbilityId,
        expired: true,
      });
      return;
    }

    if (effect.effectKind === 'haste') {
      unit.resolvedStats.speed = fixedClamp(fixedSub(unit.resolvedStats.speed, effect.amountApplied), 1, 100);
      buildStep(state, 'buff', [effect.sourceUnitId], [unit.id], `${unit.troopLabel} loses ${formatSigned(effect.amountApplied)} speed.`, {
        amount: effect.amountApplied,
        effect: 'haste',
        sourceAbilityId: effect.sourceAbilityId,
        expired: true,
      });
      return;
    }

    if (effect.effectKind === 'ramp') {
      unit.resolvedStats.damage = fixedMax(fixedSub(unit.resolvedStats.damage, effect.amountApplied), 0);
      buildStep(state, 'buff', [effect.sourceUnitId], [unit.id], `${unit.troopLabel} loses ${formatSigned(effect.amountApplied)} damage.`, {
        amount: effect.amountApplied,
        effect: 'ramp',
        sourceAbilityId: effect.sourceAbilityId,
        expired: true,
      });
      return;
    }

    if (effect.effectKind === 'statDelta') {
      unit.resolvedStats[effect.stat] = clampStat(effect.stat, fixedSub(unit.resolvedStats[effect.stat], effect.amountApplied));
      buildStep(state, 'buff', [effect.sourceUnitId], [unit.id], `${unit.troopLabel} loses ${formatSigned(effect.amountApplied)} ${effect.stat}.`, {
        amount: effect.amountApplied,
        effect: 'statDelta',
        stat: effect.stat,
        sourceAbilityId: effect.sourceAbilityId,
        expired: true,
      });
      return;
    }

    if (effect.effectKind === 'rangeset') {
      unit.resolvedStats.range = fixedMax(effect.previousValue, 0);
      buildStep(state, 'buff', [effect.sourceUnitId], [unit.id], `${unit.troopLabel} resets range to ${formatFixed(unit.resolvedStats.range)}.`, {
        value: unit.resolvedStats.range,
        effect: 'rangeset',
        sourceAbilityId: effect.sourceAbilityId,
        expired: true,
      });
      return;
    }

    unit.role = effect.previousRole;
    buildStep(state, 'buff', [effect.sourceUnitId], [unit.id], `${unit.troopLabel} returns to ${effect.previousRole}.`, {
      role: effect.previousRole,
      effect: 'roleset',
      sourceAbilityId: effect.sourceAbilityId,
      expired: true,
    });
  });
  unit.activeTimedEffects = remaining;
}

function matchesFallenTrigger(unit: InternalUnit, fallenUnit: InternalUnit, allegiance: AbilityAllegiance): boolean {
  if (unit.id === fallenUnit.id) {
    return false;
  }
  if (allegiance === 'all') {
    return true;
  }
  return allegiance === 'ally' ? unit.side === fallenUnit.side : unit.side !== fallenUnit.side;
}

function filterTargetCandidates(candidates: InternalUnit[], filters?: AbilityTargetDefinition['filters']): InternalUnit[] {
  if (!filters) {
    return candidates;
  }
  return candidates.filter((candidate) => {
    if (filters.onlyTypes && !hasMatchingIdentityTag(candidate, filters.onlyTypes)) {
      return false;
    }
    if (filters.notTypes && hasMatchingIdentityTag(candidate, filters.notTypes)) {
      return false;
    }
    if (filters.unengaged && candidate.engagedWith.size > 0) {
      return false;
    }
    return true;
  });
}

function prioritizeCandidates(candidates: InternalUnit[], filters?: AbilityTargetDefinition['filters']): InternalUnit[] {
  if (!filters?.prioritizeTypes?.length) {
    return candidates;
  }
  const prioritized = candidates.filter((candidate) => hasMatchingIdentityTag(candidate, filters.prioritizeTypes ?? []));
  return prioritized.length > 0 ? prioritized : candidates;
}

// Default target resolution for effects that don't have an explicit target definition.
// Each effect kind that needs context from the trigger event gets its own named helper,
// keeping that semantic knowledge co-located with the effect rather than buried in a
// generic dispatch function.

function getBlastDefaultTargets(state: InternalState, actor: InternalUnit, event: AbilityTriggerEvent): InternalUnit[] {
  if (!event.attackTarget) {
    return [];
  }
  return getAliveUnits(state).filter((unit) => unit.side !== actor.side && equalsHex(unit.position, event.attackTarget!.position));
}

function blastTargetsOnHex(state: InternalState, actor: InternalUnit, coord: HexCoord): InternalUnit[] {
  return getAliveUnits(state).filter((unit) => unit.side !== actor.side && equalsHex(unit.position, coord));
}

function chooseAdjacentBlastHex(state: InternalState, actor: InternalUnit, origin: HexCoord, visited: Set<string>): HexCoord | null {
  const options = neighbors(origin)
    .filter((coord) => inRadius(coord, state.mapRadius))
    .filter((coord) => !visited.has(hexKey(coord)))
    .filter((coord) => blastTargetsOnHex(state, actor, coord).length > 0);
  return options.length > 0 ? pickRandomHex(state, options) : null;
}

function getStrikeDefaultTarget(event: AbilityTriggerEvent): InternalUnit[] {
  return event.attackTarget?.alive ? [event.attackTarget] : [];
}

function getHealDefaultTargets(
  state: InternalState,
  actor: InternalUnit,
  target: AbilityTargetDefinition | undefined,
): InternalUnit[] {
  const candidates = getAliveUnits(state, actor.side)
    .filter((unit) => hexDistance(actor.position, unit.position) <= actor.resolvedStats.range)
    .filter((unit) => unit.hp < unit.maxHp);
  const filtered = prioritizeCandidates(filterTargetCandidates(candidates, target?.filters), target?.filters);
  if (filtered.length === 0) {
    return [];
  }
  const mostMissing = Math.max(...filtered.map((unit) => fixedSub(unit.maxHp, unit.hp)));
  return filtered.filter((unit) => fixedSub(unit.maxHp, unit.hp) === mostMissing);
}

function getAppliedEffectDefaultTarget(event: AbilityTriggerEvent): InternalUnit[] {
  return event.appliedEffect?.target ? [event.appliedEffect.target] : [];
}

function getAttackDefaultTarget(event: AbilityTriggerEvent): InternalUnit[] {
  return event.attackTarget?.alive ? [event.attackTarget] : [];
}

export function resolveAbilityTargetRadius(actor: { resolvedStats: { range: number } }, target: AbilityTargetDefinition | undefined): number {
  if (!target) {
    return 0;
  }
  if (target.radiusSource === 'selfRange') {
    return actor.resolvedStats.range;
  }
  return target.radius ?? 0;
}

function resolveFallenTriggerRadius(actor: { resolvedStats: { range: number } }, trigger: AbilityDefinition['trigger']): number {
  if (!trigger.fallen) {
    return 0;
  }
  if (trigger.fallen.radiusSource === 'selfRange') {
    return actor.resolvedStats.range;
  }
  return trigger.fallen.radius;
}

function getTargetCandidates(
  state: InternalState,
  actor: InternalUnit,
  ability: AbilityDefinition,
  effect: AbilityEffectDefinition,
  event: AbilityTriggerEvent,
): InternalUnit[] {
  const target = ability.target;
  if (target?.mode === 'self') {
    return [actor];
  }

  if (target?.mode === 'default') {
    if (event.timing === 'onAttack') {
      return getAttackDefaultTarget(event);
    }
    if (event.timing === 'onEffectApplied') {
      return getAppliedEffectDefaultTarget(event);
    }
  }

  if (target?.mode === 'random' || target?.mode === 'aoe') {
    const radius = resolveAbilityTargetRadius(actor, target);
    const allegiance = target.allegiance ?? 'ally';
    const candidates = getAliveUnits(state).filter((unit) => {
      if (allegiance === 'ally' && unit.side !== actor.side) return false;
      if (allegiance === 'enemy' && unit.side === actor.side) return false;
      return hexDistance(actor.position, unit.position) <= radius;
    });
    return prioritizeCandidates(filterTargetCandidates(candidates, target.filters), target.filters);
  }

  if (effect.kind === 'blast') return getBlastDefaultTargets(state, actor, event);
  if (effect.kind === 'strike') return getStrikeDefaultTarget(event);
  if (effect.kind === 'heal') return getHealDefaultTargets(state, actor, target);
  return [actor];
}

function resolveTargets(
  state: InternalState,
  actor: InternalUnit,
  ability: AbilityDefinition,
  effect: AbilityEffectDefinition,
  event: AbilityTriggerEvent,
): InternalUnit[] {
  const candidates = getTargetCandidates(state, actor, ability, effect, event).filter(
    (candidate) =>
      (candidate.alive || (candidate.id === actor.id && event.timing === 'onDeath' && effect.kind === 'summon')) &&
      !isBlockedByGraveVigor(actor, candidate, effect),
  );
  if (candidates.length === 0) {
    return [];
  }
  if (ability.target?.mode === 'random') {
    return [state.rng.pick(candidates)];
  }
  if (effect.kind === 'heal' && ability.target?.mode !== 'aoe') {
    return [state.rng.pick(candidates)];
  }
  return candidates;
}

function canTriggerAbility(state: InternalState, actor: InternalUnit, runtime: RuntimeAbilityState, event: AbilityTriggerEvent): boolean {
  const trigger = runtime.definition.trigger;
  if (trigger.timing !== event.timing) {
    return false;
  }
  if (runtime.usesRemaining !== null && runtime.usesRemaining <= 0) {
    return false;
  }
  if (trigger.condition === 'forsaken' && getDistinctFriendlyUnitTypes(state, actor).length > 1) {
    return false;
  }
  if (trigger.fallen && event.fallenUnit) {
    if (!matchesFallenTrigger(actor, event.fallenUnit, trigger.fallen.allegiance)) {
      return false;
    }
    if (hexDistance(actor.position, event.fallenUnit.position) > resolveFallenTriggerRadius(actor, trigger)) {
      return false;
    }
  }
  if (trigger.effectApplication) {
    if (!event.appliedEffect) {
      return false;
    }
    if (
      trigger.effectApplication.effectKinds?.length &&
      !trigger.effectApplication.effectKinds.includes(event.appliedEffect.effect.kind)
    ) {
      return false;
    }
    if (
      trigger.effectApplication.dispositions?.length &&
      !trigger.effectApplication.dispositions.includes(event.appliedEffect.disposition)
    ) {
      return false;
    }
  }
  return true;
}

function getAbilityRepeatCount(state: InternalState, actor: InternalUnit, runtime: RuntimeAbilityState): number {
  if (runtime.definition.trigger.repeatPerDistinctFriendlyTroopType) {
    return Math.max(0, getDistinctFriendlyUnitTypes(state, actor).filter((type) => type !== actor.type).length);
  }
  if (runtime.definition.trigger.repeatPerOtherFriendlyUnitOnHex) {
    return getAliveUnits(state, actor.side).filter((ally) => ally.id !== actor.id && equalsHex(ally.position, actor.position)).length;
  }
  return 1;
}

function recordSummonedProfile(state: InternalState, unit: InternalUnit): void {
  const key = `${unit.side}:${unit.troopLabel}`;
  if (state.summonedProfiles.has(key)) {
    return;
  }
  state.summonedProfiles.set(key, {
    side: unit.side,
    troopLabel: unit.troopLabel,
    unitTypeId: unit.unitTypeId,
    factionId: unit.factionId,
    role: unit.role,
    type: unit.type,
    attributes: [...unit.attributes],
    stats: { ...unit.resolvedStats },
    abilities: unit.resolvedAbilities.map((runtime) => cloneAbilityDefinition(runtime.definition)),
    statBreakdowns: {
      health: { stat: 'health', finalValue: unit.resolvedStats.health, lines: [{ label: 'Summoned', value: unit.resolvedStats.health, kind: 'base' }] },
      damage: { stat: 'damage', finalValue: unit.resolvedStats.damage, lines: [{ label: 'Summoned', value: unit.resolvedStats.damage, kind: 'base' }] },
      speed: { stat: 'speed', finalValue: unit.resolvedStats.speed, lines: [{ label: 'Summoned', value: unit.resolvedStats.speed, kind: 'base' }] },
      armor: { stat: 'armor', finalValue: unit.resolvedStats.armor, lines: [{ label: 'Summoned', value: unit.resolvedStats.armor, kind: 'base' }] },
      range: { stat: 'range', finalValue: unit.resolvedStats.range, lines: [{ label: 'Summoned', value: unit.resolvedStats.range, kind: 'base' }] },
      capacity: { stat: 'capacity', finalValue: unit.resolvedStats.capacity, lines: [{ label: 'Summoned', value: unit.resolvedStats.capacity, kind: 'base' }] },
      size: { stat: 'size', finalValue: unit.resolvedStats.size, lines: [{ label: 'Summoned', value: unit.resolvedStats.size, kind: 'base' }] },
    },
  });
}

function tryFindSummonHex(state: InternalState, actor: InternalUnit, origin: HexCoord, size: number): HexCoord | null {
  const candidatePool = [origin, ...state.rng.shuffle(neighbors(origin).filter((coord) => inRadius(coord, state.mapRadius)))];
  const valid = candidatePool.filter(
    (coord) => fixedAdd(allySizeOnHex(state, actor.side, coord), size) <= state.saturation,
  );
  if (valid.length === 0) {
    return null;
  }
  return valid[0] ?? null;
}

function applyCarrionChoir(state: InternalState, actor: InternalUnit, corpsePosition: HexCoord): void {
  if (!hasAbility(actor, 'carrion-choir')) {
    return;
  }
  getAliveUnits(state)
    .filter((unit) => unit.side !== actor.side && hexDistance(unit.position, corpsePosition) <= 1)
    .forEach((unit) => {
      unit.resolvedStats.armor = clampStat('armor', fixedSub(unit.resolvedStats.armor, 1));
      unit.resolvedStats.damage = fixedMax(fixedSub(unit.resolvedStats.damage, 1), 0);
      buildStep(state, 'buff', [actor.id], [unit.id], `${unit.troopLabel} loses 1 armor and 1 damage.`, {
        effect: 'carrionChoir',
        amount: -1,
        sourceAbilityId: 'carrion-choir',
        sourceAbilityLabel: getAbility('carrion-choir').label,
      });
    });
}

function summonUnit(
  state: InternalState,
  actor: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: Extract<AbilityEffectDefinition, { kind: 'summon' }>,
  origin: HexCoord,
): boolean {
  const troop = composeSummonedTroopDefinition(actor.factionId, effect.unitTypeId);
  const summonHex = tryFindSummonHex(state, actor, origin, troop.stats.size);
  if (!summonHex) {
    return false;
  }
  const summonIndex = [...state.units.values()].filter((unit) => unit.side === actor.side && unit.troopLabel === troop.label).length + 1;
  const unitId = `${actor.id}-summon-${effect.unitTypeId}-${summonIndex}`;
  const grantedAbilities = (effect.grantedAbilityIds ?? []).map(getAbility);
  const mergedAbilities = [...troop.abilities];
  grantedAbilities.forEach((ability) => {
    if (!mergedAbilities.some((entry) => entry.id === ability.id)) {
      mergedAbilities.push(ability);
    }
  });
  const summonedUnit: InternalUnit = {
    id: unitId,
    troopInstanceId: null,
    troopLabel: troop.label,
    unitTypeId: troop.unitTypeId,
    factionId: troop.factionId,
    side: actor.side,
    summonerUnitId: actor.id,
    role: troop.role,
    type: troop.type,
    attributes: [...troop.attributes],
    position: { ...summonHex },
    hp: troop.stats.health,
    maxHp: troop.stats.health,
    initiative: fixedMax(effect.initialInitiative ?? (hasAbility(actor, 'early-riser') && effect.unitTypeId === 'skeleton' ? 100 : 0), 0),
    alive: true,
    engagedWith: new Set<string>(),
    resolvedStats: { ...troop.stats },
    resolvedAbilities: mergedAbilities.map(createRuntimeAbilityState),
    activeTimedEffects: [],
    committedBacklineTargetId: null,
    graveVigorBlockedSides: new Set<SideId>(),
    mercyBeforeDawnUsed: false,
    stonebloodUsed: false,
    fadeIntoShadowUsed: false,
    glamourUsed: false,
    brambleSnareStacks: 0,
    bonusStrikeCharges: 0,
    scavengersHungerKills: 0,
    sentinelRunesTriggered: false,
    berserkDeathPending: false,
    berserkTurnsUntilDeath: 0,
  };
  applyMutatorAdjustmentsToUnit(summonedUnit, state.effects);
  state.units.set(unitId, summonedUnit);
  recordSummonedProfile(state, summonedUnit);
  buildStep(state, 'buff', [actor.id], [unitId], `${actor.troopLabel} summons ${troop.label}.`, {
    effect: 'summon',
    unitTypeId: troop.unitTypeId,
    sourceAbilityId: runtime.definition.id,
    sourceAbilityLabel: runtime.definition.label,
  });
  return true;
}

function summonUnitsAtHex(
  state: InternalState,
  actor: InternalUnit,
  sourceAbilityId: string,
  unitTypeId: string,
  count: number,
  origin: HexCoord,
  grantedAbilityIds: string[] = [],
  initialInitiative?: number,
): boolean {
  const runtime = createRuntimeAbilityState(getAbility(sourceAbilityId));
  const effect: Extract<AbilityEffectDefinition, { kind: 'summon' }> = {
    kind: 'summon',
    unitTypeId,
    count: 1,
    grantedAbilityIds,
    initialInitiative,
  };
  let summonedAny = false;
  for (let index = 0; index < count; index += 1) {
    summonedAny = summonUnit(state, actor, runtime, effect, origin) || summonedAny;
  }
  return summonedAny;
}

function triggerSentinelRunes(state: InternalState, knight: InternalUnit, origin: HexCoord, message: string): void {
  if (knight.sentinelRunesTriggered || !hasAbility(knight, 'sentinel-runes')) {
    return;
  }
  if (summonUnitsAtHex(state, knight, 'sentinel-runes', 'elemental', 2, origin)) {
    knight.sentinelRunesTriggered = true;
    buildStep(state, 'buff', [knight.id], [], message, {
      effect: 'sentinelRunes',
      sourceAbilityId: 'sentinel-runes',
      sourceAbilityLabel: getAbility('sentinel-runes').label,
    });
  }
}

function handleMoveOffKnightHex(state: InternalState, mover: InternalUnit, from: HexCoord, to: HexCoord): void {
  getAliveUnits(state)
    .filter((unit) => unit.side !== mover.side && equalsHex(unit.position, from) && hasAbility(unit, 'sentinel-runes'))
    .forEach((knight) => {
      triggerSentinelRunes(state, knight, to, `${knight.troopLabel} triggers Sentinel Runes.`);
    });
}

function relocateUnit(state: InternalState, actor: InternalUnit, destination: HexCoord): void {
  const previousPosition = { ...actor.position };
  removeAllEngagements(state, actor);
  actor.position = { ...destination };
  if (!equalsHex(previousPosition, destination)) {
    handleMoveOffKnightHex(state, actor, previousPosition, destination);
  }
}

function applyBlastSequence(
  state: InternalState,
  actor: InternalUnit,
  runtime: RuntimeAbilityState,
  amount: number,
  origin: HexCoord,
  visited: Set<string>,
): boolean {
  const key = hexKey(origin);
  if (visited.has(key)) {
    return false;
  }
  visited.add(key);
  const targets = blastTargetsOnHex(state, actor, origin);
  if (targets.length === 0) {
    return false;
  }

  const totalAmount =
    hasAbility(actor, 'lightning-rods') ?
      fixedAdd(
        amount,
        getAliveUnits(state).filter((unit) => unit.type === 'elemental' && equalsHex(unit.position, origin)).length,
      )
    : amount;

  let applied = false;
  targets.forEach((target) => {
    const damage = fixedMax(totalAmount, 0);
    const inflictedDamage = canTakeDamage(target) ? damage : 0;
    if (inflictedDamage > 0) {
      target.hp = fixedSub(target.hp, inflictedDamage);
    }
    buildStep(state, 'attack', [actor.id], [target.id], `${actor.troopLabel} splashes ${formatFixed(inflictedDamage)} blast damage.`, {
      damage: inflictedDamage,
      mode: 'blast',
      category: 'strike',
      baseDamage: totalAmount,
      attackDamageBeforeArmor: totalAmount,
      armorIgnored: true,
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
    });
    applied = true;
    if (target.hp <= 0 && target.alive) {
      handleDeath(state, actor, target, { mode: 'blast', category: 'strike' });
    } else if (target.alive && canTakeDamage(target)) {
      triggerUnitAbilities(state, target, { timing: 'onDamaged' });
      if (inflictedDamage > 0) {
        applyWhimsy(state, target);
      }
    }
  });

  if (applied && hasAbility(actor, 'spell-echo')) {
    const nextHex = chooseAdjacentBlastHex(state, actor, origin, visited);
    if (nextHex) {
      applyBlastSequence(state, actor, runtime, amount, nextHex, visited);
    }
  }

  return applied;
}

type PerTargetEffectHandler = (
  state: InternalState,
  actor: InternalUnit,
  runtime: RuntimeAbilityState,
  target: InternalUnit,
  effect: AbilityEffectDefinition,
  event: AbilityTriggerEvent,
) => boolean;

// Registry of handlers for effects that operate on resolved targets.
// Adding a new effect kind only requires adding an entry here — the dispatch in
// executeAbilityEffect does not need to change.
// 'taunt' is absent: it bypasses target resolution and uses engageEnemiesOnHex directly.
// 'pack' is absent: it is a passive bonus computed in getPackBonus, not a triggered effect.
const PER_TARGET_EFFECT_HANDLERS: Partial<Record<AbilityEffectDefinition['kind'], PerTargetEffectHandler>> = {
  bolster: (state, actor, runtime, target, effect) => applyBolster(state, actor, target, runtime, effect as Extract<AbilityEffectDefinition, { kind: 'bolster' }>),
  haste: (state, actor, runtime, target, effect) => applyHaste(state, actor, target, runtime, effect as Extract<AbilityEffectDefinition, { kind: 'haste' }>),
  heal: (state, actor, runtime, target, effect) => healUnit(state, actor, target, runtime, effect as Extract<AbilityEffectDefinition, { kind: 'heal' }>),
  ramp: (state, actor, runtime, target, effect) => applyRamp(state, actor, target, runtime, effect as Extract<AbilityEffectDefinition, { kind: 'ramp' }>),
  statDelta: (state, actor, runtime, target, effect) =>
    applyStatDelta(state, actor, target, runtime, effect as Extract<AbilityEffectDefinition, { kind: 'statDelta' }>),
  rangeset: (state, actor, runtime, target, effect) => applyRangeSet(state, actor, target, runtime, effect as Extract<AbilityEffectDefinition, { kind: 'rangeset' }>),
  roleset: (state, actor, runtime, target, effect) => applyRoleSet(state, actor, target, runtime, effect as Extract<AbilityEffectDefinition, { kind: 'roleset' }>),
  initiativeSet: (state, actor, runtime, target, effect) =>
    applyInitiativeSet(state, actor, target, runtime, effect as Extract<AbilityEffectDefinition, { kind: 'initiativeSet' }>),
  initiativeDelta: (state, actor, runtime, target, effect) =>
    applyInitiativeDelta(state, actor, target, runtime, effect as Extract<AbilityEffectDefinition, { kind: 'initiativeDelta' }>),
  grantAbility: (state, actor, runtime, target, effect) =>
    applyGrantAbility(state, actor, target, runtime, effect as Extract<AbilityEffectDefinition, { kind: 'grantAbility' }>),
  summon: (state, actor, runtime, _target, effect, event) => {
    const summon = effect as Extract<AbilityEffectDefinition, { kind: 'summon' }>;
    const origin = summon.consumeFallenUnitCorpse ? event.fallenUnit?.position : actor.position;
    if (!origin) {
      return false;
    }
  if (summon.consumeFallenUnitCorpse && event.fallenUnit) {
      if (!state.corpses.has(event.fallenUnit.id)) {
        if (!hasAbility(actor, 'alternate-fuel-10') || actor.hp <= 10) {
          return false;
        }
        actor.hp = fixedSub(actor.hp, 10);
        buildStep(state, 'buff', [actor.id], [], `${actor.troopLabel} spends 10 health instead of a corpse.`, {
          effect: 'alternateFuel',
          sourceAbilityId: runtime.definition.id,
          sourceAbilityLabel: runtime.definition.label,
        });
      }
    }
    let summonedAny = false;
    for (let index = 0; index < summon.count; index += 1) {
      summonedAny = summonUnit(state, actor, runtime, summon, origin) || summonedAny;
    }
    if (summonedAny && summon.consumeFallenUnitCorpse && event.fallenUnit) {
      applyCarrionChoir(state, actor, event.fallenUnit.position);
      state.corpses.delete(event.fallenUnit.id);
    }
    return summonedAny;
  },
  strike: (state, actor, _runtime, target, effect) => {
    const e = effect as Extract<AbilityEffectDefinition, { kind: 'strike' }>;
    const strikeCount = Math.max(0, Math.floor(e.amount));
    if (strikeCount > 0 && target.alive) {
      for (let i = 0; i < strikeCount; i += 1) {
        attack(state, actor, target, actor.resolvedStats.range > 0 ? 'ranged' : 'melee', false, 0, 'strike');
        if (!target.alive) {
          break;
        }
      }
      return true;
    }
    return false;
  },
  redirect: (state, actor, runtime, target, effect) => {
    const redirectEffect = effect as Extract<AbilityEffectDefinition, { kind: 'redirect' }>;
    if (!target.alive || (!redirectEffect.allowAlreadyEngaged && target.engagedWith.size > 0) || actor.engagedWith.has(target.id)) {
      return false;
    }
    if (target.resolvedStats.size > availableCapacity(state, actor)) {
      return false;
    }
    createEngagement(state, actor, target);
    buildStep(state, 'engage', [actor.id], [target.id], `${actor.troopLabel} redirects ${target.troopLabel}.`, {
      effect: 'redirect',
      sourceAbilityId: runtime.definition.id,
      sourceAbilityLabel: runtime.definition.label,
    });
    return true;
  },
};

function executeAbilityEffect(
  state: InternalState,
  actor: InternalUnit,
  runtime: RuntimeAbilityState,
  effect: AbilityEffectDefinition,
  event: AbilityTriggerEvent,
): boolean {
  const handler = PER_TARGET_EFFECT_HANDLERS[effect.kind];
  if (effect.kind === 'blast') {
    const targets = resolveTargets(state, actor, runtime.definition, effect, event);
    const firstTarget = targets[0];
    if (!firstTarget) {
      return false;
    }
    return applyBlastSequence(state, actor, runtime, (effect as Extract<AbilityEffectDefinition, { kind: 'blast' }>).amount, firstTarget.position, new Set<string>());
  }

  if (!handler) {
    return false;
  }

  const targets = resolveTargets(state, actor, runtime.definition, effect, event);
  if (targets.length === 0) {
    return false;
  }

  let applied = false;
  targets.forEach((target) => {
    if (!target.alive && !(target.id === actor.id && event.timing === 'onDeath' && effect.kind === 'summon') && effect.kind !== 'strike') {
      return;
    }
    if (isBlockedByGraveVigor(actor, target, effect)) {
      return;
    }
    let appliedToTarget = false;
    if (
      runtime.definition.duration.kind === 'turns' &&
      (effect.kind === 'bolster' ||
        effect.kind === 'haste' ||
        effect.kind === 'ramp' ||
        effect.kind === 'statDelta' ||
        effect.kind === 'rangeset' ||
        effect.kind === 'roleset')
    ) {
      appliedToTarget = applyTemporaryEffect(state, actor, target, runtime, effect);
      applied = appliedToTarget || applied;
      if (appliedToTarget) {
        applyPostEffectReactions(state, actor, runtime, target, effect);
      }
      return;
    }
    appliedToTarget = handler(state, actor, runtime, target, effect, event);
    applied = appliedToTarget || applied;
    if (appliedToTarget) {
      applyPostEffectReactions(state, actor, runtime, target, effect);
    }
  });

  return applied;
}

function triggerUnitAbilities(
  state: InternalState,
  actor: InternalUnit,
  event: AbilityTriggerEvent,
  filter?: (runtime: RuntimeAbilityState) => boolean,
): void {
  actor.resolvedAbilities.forEach((runtime) => {
    if (filter && !filter(runtime)) {
      return;
    }
    if (!canTriggerAbility(state, actor, runtime, event)) {
      return;
    }
    runtime.triggerCount += 1;
    if (runtime.definition.trigger.chargeEvery && runtime.triggerCount % runtime.definition.trigger.chargeEvery !== 0) {
      return;
    }
    const repeats = getAbilityRepeatCount(state, actor, runtime);
    if (repeats <= 0) {
      return;
    }
    let applied = false;
    for (let repeat = 0; repeat < repeats; repeat += 1) {
      runtime.definition.effects.forEach((effect) => {
        applied = executeAbilityEffect(state, actor, runtime, effect, event) || applied;
      });
      flushPendingGraveVigorBlocks(state);
    }
    if (applied && runtime.usesRemaining !== null) {
      runtime.usesRemaining -= 1;
    }
    if (applied) {
      handleShapeshiftTriggers(state, actor, runtime);
    }
  });
}

function isArmyCompositionAbility(runtime: RuntimeAbilityState): boolean {
  return !!(runtime.definition.trigger.condition || runtime.definition.trigger.repeatPerDistinctFriendlyTroopType);
}

function executeStartOfBattleAbilities(state: InternalState): void {
  const initialUnits = getAliveUnits(state);
  // Phase 1: abilities that check army composition (forsaken, combined-arms) must fire before
  // any startOfBattle summons alter the unit roster.
  initialUnits.forEach((unit) => {
    triggerUnitAbilities(state, unit, { timing: 'startOfBattle' }, isArmyCompositionAbility);
  });
  // Phase 2: all other startOfBattle abilities (e.g. summons).
  initialUnits.forEach((unit) => {
    triggerUnitAbilities(state, unit, { timing: 'startOfBattle' }, (r) => !isArmyCompositionAbility(r));
  });
}

function applyCopiousAle(state: InternalState): void {
  (['player', 'enemy'] as SideId[]).forEach((side) => {
    if (!sideHasFactionUpgrade(state, side, 'dwarf-ale-and-hearty')) {
      return;
    }
    const byTroop = new Map<string, InternalUnit[]>();
    getAliveUnits(state, side)
      .filter((unit) => isDwarf(unit) && hasAbility(unit, 'ale-and-hearty'))
      .forEach((unit) => {
        const key = `${side}:${unit.troopLabel}`;
        if (state.copiousAleAppliedTroopKeys.has(key)) {
          return;
        }
        byTroop.set(key, [...(byTroop.get(key) ?? []), unit]);
      });

    byTroop.forEach((units, key) => {
      const target = state.rng.pick(units);
      state.copiousAleAppliedTroopKeys.add(key);
      const previousSpeed = target.resolvedStats.speed;
      target.resolvedStats.speed = 1;
      buildStep(state, 'buff', [target.id], [target.id], `${target.troopLabel} has too much ale and slows to 1 speed.`, {
        effect: 'copiousAle',
        stat: 'speed',
        amount: fixedSub(1, previousSpeed),
        sourceAbilityId: 'ale-and-hearty',
        sourceAbilityLabel: getAbility('ale-and-hearty').label,
      });
    });
  });
}

function performBrace(state: InternalState, actor: InternalUnit): void {
  if (!hasAbility(actor, 'brace') || actor.engagedWith.size === 0 || availableCapacity(state, actor) !== 0) {
    return;
  }
  applyTemporaryEffect(state, actor, actor, createRuntimeAbilityState(getAbility('brace')), {
    kind: 'statDelta',
    stat: 'armor',
    amount: 5,
    mode: 'flat',
    disposition: 'beneficial',
  });
}

function performLivingCircuit(state: InternalState, actor: InternalUnit): void {
  if (!hasAbility(actor, 'living-circuit')) {
    return;
  }
  const elementals = getAliveUnits(state, actor.side).filter(
    (unit) => unit.type === 'elemental' && hexDistance(actor.position, unit.position) <= actor.resolvedStats.range,
  );
  if (elementals.length === 0) {
    return;
  }
  applyInitiativeDelta(state, actor, actor, createRuntimeAbilityState(getAbility('living-circuit')), {
    kind: 'initiativeDelta',
    amount: 15,
    disposition: 'beneficial',
  });
  elementals.forEach((elemental) => {
    applyInitiativeDelta(state, actor, elemental, createRuntimeAbilityState(getAbility('living-circuit')), {
      kind: 'initiativeDelta',
      amount: 15,
      disposition: 'beneficial',
    });
  });
}

function performThrillOfTheHunt(state: InternalState, actor: InternalUnit): void {
  if (!hasAbility(actor, 'thrill-of-the-hunt')) {
    return;
  }
  getAliveUnits(state, actor.side)
    .filter((unit) => unit.type === 'wolf' && equalsHex(unit.position, actor.position))
    .forEach((wolf) => {
      applyInitiativeDelta(state, actor, wolf, createRuntimeAbilityState(getAbility('thrill-of-the-hunt')), {
        kind: 'initiativeDelta',
        amount: 10,
        disposition: 'beneficial',
      });
    });
}

function handleShapeshiftTriggers(state: InternalState, actor: InternalUnit, runtime: RuntimeAbilityState): void {
  if (runtime.definition.id !== 'shapeshift-bear' && runtime.definition.id !== 'shapeshift-bear-2') {
    return;
  }
  if (hasAbility(actor, 'bramble-snare')) {
    actor.brambleSnareStacks += 1;
    buildStep(state, 'buff', [actor.id], [actor.id], `${actor.troopLabel} empowers Bramble Snare.`, {
      effect: 'brambleSnare',
      amount: actor.brambleSnareStacks,
      sourceAbilityId: 'bramble-snare',
      sourceAbilityLabel: getAbility('bramble-snare').label,
    });
  }
  if (hasAbility(actor, 'wild-call') || hasAbility(actor, 'forest-friends')) {
    summonUnitsAtHex(state, actor, hasAbility(actor, 'forest-friends') ? 'forest-friends' : 'wild-call', 'wolf', 2, actor.position);
  }
}

function performPackmastersWhistle(state: InternalState, actor: InternalUnit): void {
  if (!hasAbility(actor, 'packmasters-whistle') || actor.engagedWith.size === 0) {
    return;
  }
  const wolf = getAliveUnits(state, actor.side).find((ally) => ally.type === 'wolf' && equalsHex(ally.position, actor.position));
  const engagedTarget = [...actor.engagedWith].map((unitId) => state.units.get(unitId)).find((unit): unit is InternalUnit => Boolean(unit?.alive));
  if (!wolf || !engagedTarget || wolf.engagedWith.has(engagedTarget.id) || engagedTarget.resolvedStats.size > availableCapacity(state, wolf)) {
    return;
  }
  createEngagement(state, wolf, engagedTarget);
  wolf.hp = fixedClamp(fixedAdd(wolf.hp, 10), 0, wolf.maxHp);
  buildStep(state, 'engage', [wolf.id], [engagedTarget.id], `${wolf.troopLabel} answers ${actor.troopLabel}'s whistle.`, {
    effect: 'packmastersWhistle',
    amount: 10,
    sourceAbilityId: 'packmasters-whistle',
    sourceAbilityLabel: getAbility('packmasters-whistle').label,
  });
}

function performForestFriends(state: InternalState, actor: InternalUnit): void {
  if (!hasAbility(actor, 'forest-friends')) {
    return;
  }
  const runtime = createRuntimeAbilityState(getAbility('forest-friends'));
  const targets = [actor, ...getAliveUnits(state, actor.side).filter((unit) => unit.summonerUnitId === actor.id && hasAbility(unit, 'bonded'))];
  targets.forEach((target) => {
    healUnit(state, actor, target, runtime, { kind: 'heal', amount: 20, mode: 'flat', disposition: 'beneficial' });
  });
}

function performWarDrums(state: InternalState, actor: InternalUnit): void {
  if (!hasAbility(actor, 'war-drums')) {
    return;
  }
  const hasteEffect: Extract<AbilityEffectDefinition, { kind: 'haste' }> = { kind: 'haste', amount: 1, mode: 'flat', disposition: 'beneficial' };
  const rampEffect: Extract<AbilityEffectDefinition, { kind: 'ramp' }> = { kind: 'ramp', amount: 1, mode: 'flat', disposition: 'beneficial' };
  const eligible = prioritizeCandidates(
    getAliveUnits(state, actor.side).filter(
      (unit) =>
        hexDistance(actor.position, unit.position) <= actor.resolvedStats.range &&
        !hasMatchingIdentityTag(unit, ['caster']) &&
        (!isBlockedByGraveVigor(actor, unit, hasteEffect) || !isBlockedByGraveVigor(actor, unit, rampEffect)),
    ),
  );
  if (eligible.length === 0) {
    return;
  }
  const target = state.rng.pick(eligible);
  getAliveUnits(state, actor.side)
    .filter((unit) => equalsHex(unit.position, target.position))
    .forEach((unit) => {
      const runtime = createRuntimeAbilityState(getAbility('war-drums'));
      if (!isBlockedByGraveVigor(actor, unit, hasteEffect) && applyHaste(state, actor, unit, runtime, hasteEffect)) {
        applyPostEffectReactions(state, actor, runtime, unit, hasteEffect);
      }
      if (!isBlockedByGraveVigor(actor, unit, rampEffect) && applyRamp(state, actor, unit, runtime, rampEffect)) {
        applyPostEffectReactions(state, actor, runtime, unit, rampEffect);
      }
    });
  flushPendingGraveVigorBlocks(state);
}

function executeEndOfTurnAbilities(state: InternalState, actor: InternalUnit): void {
  performPackmastersWhistle(state, actor);
  performForestFriends(state, actor);
  performWarDrums(state, actor);
  performLivingCircuit(state, actor);
  performThrillOfTheHunt(state, actor);
  triggerUnitAbilities(state, actor, { timing: 'endOfTurn' });
}

function executeStartOfTurnAbilities(state: InternalState, actor: InternalUnit): void {
  performBrace(state, actor);
  triggerUnitAbilities(state, actor, { timing: 'startOfTurn' });
}

function performHoldTheStandard(state: InternalState, fallen: InternalUnit): void {
  if (hasAbility(fallen, 'fading')) {
    return;
  }
  getAliveUnits(state, fallen.side)
    .filter((unit) => hasAbility(unit, 'hold-the-standard') && equalsHex(unit.position, fallen.position))
    .forEach((unit) => {
      healUnit(state, unit, unit, createRuntimeAbilityState(getAbility('hold-the-standard')), {
        kind: 'heal',
        amount: 15,
        mode: 'flat',
        disposition: 'beneficial',
      });
    });
}

function performLootFrenzy(state: InternalState, actor: InternalUnit, position: HexCoord): void {
  getAliveUnits(state, actor.side)
    .filter((unit) => equalsHex(unit.position, position))
    .forEach((unit) => {
      healUnit(state, actor, unit, createRuntimeAbilityState(getAbility('loot-frenzy')), {
        kind: 'heal',
        amount: 10,
        mode: 'flat',
        disposition: 'beneficial',
      });
      applyInitiativeDelta(state, actor, unit, createRuntimeAbilityState(getAbility('loot-frenzy')), {
        kind: 'initiativeDelta',
        amount: 30,
        disposition: 'beneficial',
      });
    });
}

function performThrillKillBuff(state: InternalState, actor: InternalUnit, position: HexCoord): void {
  getAliveUnits(state, actor.side)
    .filter((unit) => equalsHex(unit.position, position))
    .forEach((unit) => {
      applyRamp(state, actor, unit, createRuntimeAbilityState(getAbility('thrill-of-the-hunt')), {
        kind: 'ramp',
        amount: 2,
        mode: 'flat',
        disposition: 'beneficial',
      });
    });
}

function performLastWitness(state: InternalState, killer: InternalUnit, fallen: InternalUnit): void {
  getAliveUnits(state, fallen.side)
    .filter((unit) => unit.id !== fallen.id && hasAbility(unit, 'last-witness') && equalsHex(unit.position, fallen.position))
    .forEach((unit) => {
      if (!killer.alive || !equalsHex(killer.position, fallen.position)) {
        return;
      }
      attack(state, unit, killer, 'melee', false, 1, 'strike');
    });
}

function getScavengersHungerLimit(actor: InternalUnit): number {
  if (hasAbility(actor, 'scavengers-hunger-2')) {
    return 2;
  }
  return hasAbility(actor, 'scavengers-hunger') ? 3 : 0;
}

function performScavengersHunger(state: InternalState, actor: InternalUnit, target: InternalUnit): void {
  const summonLimit = getScavengersHungerLimit(actor);
  if (summonLimit <= 0 || hasAbility(target, 'fading') || actor.scavengersHungerKills >= summonLimit) {
    return;
  }
  actor.scavengersHungerKills += 1;
  state.corpses.delete(target.id);
  summonUnitsAtHex(state, actor, hasAbility(actor, 'scavengers-hunger-2') ? 'scavengers-hunger-2' : 'scavengers-hunger', 'wolf', 1, target.position);
}

function handleDeath(state: InternalState, actor: InternalUnit, target: InternalUnit, context: AttackContext = { mode: 'melee', category: 'normal' }): void {
  if (!target.alive) {
    return;
  }
  if (preventDeath(state, actor, target)) {
    return;
  }
  target.alive = false;
  target.hp = 0;
  removeAllEngagements(state, target);
  if (!hasAbility(target, 'fading')) {
    state.corpses.set(target.id, { ...target.position });
  }
  buildStep(state, 'death', [actor.id], [target.id], `${target.troopLabel} is killed.`, {
    effect: 'death',
    sourceAbilityId: 'battle-resolution',
    sourceAbilityLabel: 'Battle resolution',
  });

  if (hasAbility(target, 'sentinel-runes') && !target.sentinelRunesTriggered) {
    triggerSentinelRunes(state, target, target.position, `${target.troopLabel} releases Sentinel Runes in death.`);
  }

  const bondedDependents = getAliveUnits(state, target.side).filter(
    (unit) => unit.summonerUnitId === target.id && hasAbility(unit, 'bonded'),
  );

  triggerUnitAbilities(state, actor, { timing: 'onKill', fallenUnit: target });
  performScavengersHunger(state, actor, target);
  if (hasAbility(actor, 'snatch-the-moment')) {
    getAliveUnits(state)
      .filter((unit) => unit.side !== actor.side && equalsHex(unit.position, target.position))
      .forEach((unit) => {
        unit.initiative = fixedMax(fixedSub(unit.initiative, 20), 0);
        buildStep(state, 'buff', [actor.id], [unit.id], `${unit.troopLabel} loses 20 initiative.`, {
          effect: 'snatchTheMoment',
          amount: -20,
          sourceAbilityId: 'snatch-the-moment',
          sourceAbilityLabel: getAbility('snatch-the-moment').label,
        });
      });
  }
  if (hasAbility(actor, 'loot-frenzy')) {
    performLootFrenzy(state, actor, target.position);
  }
  if (actor.type === 'wolf' && sideHasTroopTypeUpgrade(state, actor.side, 'beastmaster-thrill-of-the-hunt')) {
    performThrillKillBuff(state, actor, target.position);
  }
  if (hasAbility(actor, 'crushing-sweep') && context.mode === 'melee') {
    const splash = actor.resolvedStats.size * 5;
    getAliveUnits(state)
      .filter((unit) => unit.side !== actor.side && equalsHex(unit.position, target.position))
      .forEach((unit) => {
        const inflictedSplash = canTakeDamage(unit) ? splash : 0;
        if (inflictedSplash > 0) {
          unit.hp = fixedSub(unit.hp, inflictedSplash);
        }
        buildStep(state, 'attack', [actor.id], [unit.id], `${actor.troopLabel} crushes nearby enemies for ${formatFixed(inflictedSplash)}.`, {
          damage: inflictedSplash,
          mode: 'melee',
          category: context.category,
          baseDamage: splash,
          attackDamageBeforeArmor: splash,
          armorIgnored: true,
          sourceAbilityId: 'crushing-sweep',
          sourceAbilityLabel: getAbility('crushing-sweep').label,
        });
        if (unit.hp <= 0 && unit.alive) {
          handleDeath(state, actor, unit, context);
        } else if (unit.alive && canTakeDamage(unit)) {
          triggerUnitAbilities(state, unit, { timing: 'onDamaged' });
          if (inflictedSplash > 0) {
            applyWhimsy(state, unit);
          }
        }
      });
  }
  performLastWitness(state, actor, target);
  performHoldTheStandard(state, target);
  triggerUnitAbilities(state, target, { timing: 'onDeath', fallenUnit: target });
  getAliveUnits(state).forEach((unit) => {
    if (unit.id !== target.id) {
      triggerUnitAbilities(state, unit, { timing: 'onFallen', fallenUnit: target });
      if (target.type === 'elemental' && hasAbility(unit, 'arc-conductor') && unit.side === actor.side) {
        applyBlastSequence(state, unit, createRuntimeAbilityState(getAbility('arc-conductor-blast-8')), 8, target.position, new Set<string>());
      }
    }
  });
  bondedDependents.forEach((unit) =>
    handleEnvironmentalDeath(state, unit, 'bonded', getAbility('bonded').label, `${unit.troopLabel} is destroyed when its summoner falls.`, true),
  );
}

function handleEnvironmentalDeath(
  state: InternalState,
  target: InternalUnit,
  effectId: string,
  effectLabel: string,
  message: string,
  bypassPrevention = false,
): void {
  if (!target.alive) {
    return;
  }
  if (!bypassPrevention && preventDeath(state, target, target)) {
    return;
  }
  target.alive = false;
  target.hp = 0;
  removeAllEngagements(state, target);
  if (!hasAbility(target, 'fading')) {
    state.corpses.set(target.id, { ...target.position });
  }
  buildStep(state, 'death', [], [target.id], message, {
    effect: effectId,
    sourceAbilityId: effectId,
    sourceAbilityLabel: effectLabel,
  });

  if (hasAbility(target, 'sentinel-runes') && !target.sentinelRunesTriggered) {
    triggerSentinelRunes(state, target, target.position, `${target.troopLabel} releases Sentinel Runes in death.`);
  }

  const bondedDependents = getAliveUnits(state, target.side).filter(
    (unit) => unit.summonerUnitId === target.id && hasAbility(unit, 'bonded'),
  );

  performHoldTheStandard(state, target);
  triggerUnitAbilities(state, target, { timing: 'onDeath', fallenUnit: target });
  getAliveUnits(state).forEach((unit) => {
    if (unit.id !== target.id) {
      triggerUnitAbilities(state, unit, { timing: 'onFallen', fallenUnit: target });
      if (target.type === 'elemental' && hasAbility(unit, 'arc-conductor') && unit.side === target.side) {
        applyBlastSequence(state, unit, createRuntimeAbilityState(getAbility('arc-conductor-blast-8')), 8, target.position, new Set<string>());
      }
    }
  });
  bondedDependents.forEach((unit) =>
    handleEnvironmentalDeath(state, unit, 'bonded', getAbility('bonded').label, `${unit.troopLabel} is destroyed when its summoner falls.`, true),
  );
}

function chooseAttackTarget(state: InternalState, actor: InternalUnit, candidates: InternalUnit[]): InternalUnit {
  if (hasAbility(actor, 'executioner')) {
    const lowestHp = Math.min(...candidates.map((enemy) => enemy.hp));
    const lowest = candidates.filter((enemy) => enemy.hp === lowestHp);
    return state.rng.pick(lowest);
  }
  return state.rng.pick(candidates);
}

function tryApplyGlamour(state: InternalState, actor: InternalUnit, target: InternalUnit, mode: 'melee' | 'ranged', category: AttackCategory): boolean {
  if (category !== 'normal' || target.glamourUsed || !hasAbility(target, 'glamour') || !isFae(target)) {
    return false;
  }
  const candidates = getAliveUnits(state)
    .filter((unit) => unit.side !== target.side && unit.id !== target.id)
    .filter((unit) => hexDistance(target.position, unit.position) <= target.resolvedStats.range);
  if (candidates.length === 0) {
    return false;
  }
  target.glamourUsed = true;
  const redirectedTarget = state.rng.pick(candidates);
  buildStep(state, 'buff', [target.id], [redirectedTarget.id], `${target.troopLabel} glamours the attack toward ${redirectedTarget.troopLabel}.`, {
    effect: 'glamour',
    sourceAbilityId: 'glamour',
    sourceAbilityLabel: getAbility('glamour').label,
  });
  attack(state, target, redirectedTarget, target.resolvedStats.range > 0 ? 'ranged' : mode, true, 0, 'normal');
  return true;
}

function applyStallWarts(state: InternalState, unit: InternalUnit): void {
  if (!unit.alive || !hasAbility(unit, 'stall-warts')) {
    return;
  }
  const runtime = createRuntimeAbilityState(getAbility('stall-warts'));
  applyStatDelta(state, unit, unit, runtime, {
    kind: 'statDelta',
    stat: 'armor',
    amount: 1,
    mode: 'flat',
    disposition: 'beneficial',
  });
  applyStatDelta(state, unit, unit, runtime, {
    kind: 'statDelta',
    stat: 'speed',
    amount: -1,
    mode: 'flat',
    disposition: 'harmful',
  });
}

function attack(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  mode: 'melee' | 'ranged',
  allowOnAttackAbilities = true,
  strikeCount = 0,
  category: AttackCategory = 'normal',
): void {
  if (tryApplyGlamour(state, actor, target, mode, category)) {
    return;
  }
  const attackContext: AttackContext = { mode, category };
  let attackDamage = actor.resolvedStats.damage;
  const distanceToTarget = hexDistance(actor.position, target.position);
  const heartseekerActive = hasAbility(actor, 'heartseeker') && target.engagedWith.size === 0;
  if (heartseekerActive) {
    attackDamage = fixedMul(attackDamage, 2);
  }
  const distanceBonus = getDistanceDamageBonus(actor, target, attackContext);
  attackDamage = fixedAdd(attackDamage, distanceBonus.damage);
  const armorReduction = 0;
  const armorAfterMods = fixedSub(target.resolvedStats.armor, armorReduction);
  const baseDamage = fixedSub(attackDamage, armorAfterMods);
  const modifiedDamage = mode === 'ranged' ? fixedMul(baseDamage, state.effects.rangedDamageMultiplier) : baseDamage;
  const shieldDrillDamageCap = mode === 'ranged' && hasAbility(target, 'shield-drill') ? 1 : null;
  const damage = fixedMax(shieldDrillDamageCap === null ? modifiedDamage : Math.min(modifiedDamage, shieldDrillDamageCap), 0);
  const damageRecipients = [target];
  const damagePerRecipient = damage;
  const inflictedDamage = fixedSum(damageRecipients.map((recipient) => (canTakeDamage(recipient) ? damagePerRecipient : 0)));
  damageRecipients.forEach((recipient) => {
    if (canTakeDamage(recipient)) {
      recipient.hp = fixedSub(recipient.hp, damagePerRecipient);
    }
  });
  if (distanceBonus.initiative > 0) {
    actor.initiative = fixedAdd(actor.initiative, distanceBonus.initiative);
  }

  buildStep(
    state,
    'attack',
    [actor.id],
    damageRecipients.map((recipient) => recipient.id),
    `${actor.troopLabel} hits ${target.troopLabel} for ${formatFixed(inflictedDamage)}.`,
    {
    damage: inflictedDamage,
    mode,
    category,
    baseDamage: actor.resolvedStats.damage,
    attackDamageBeforeArmor: attackDamage,
    heartseekerMultiplier: heartseekerActive ? 2 : undefined,
    distanceBonus: distanceBonus.damage || undefined,
    armorBefore: target.resolvedStats.armor,
    armorReduction: armorReduction || undefined,
    armorApplied: armorAfterMods,
    rangedMultiplier: mode === 'ranged' ? state.effects.rangedDamageMultiplier : undefined,
    },
  );

  if (allowOnAttackAbilities) {
    triggerUnitAbilities(state, actor, { timing: 'onAttack', attackTarget: target });
  }

  if (mode === 'melee' && hasAbility(actor, 'bramble-snare') && actor.brambleSnareStacks > 0 && target.alive) {
    applyStatDelta(state, actor, target, createRuntimeAbilityState(getAbility('bramble-snare')), {
      kind: 'statDelta',
      stat: 'speed',
      amount: actor.brambleSnareStacks * -2,
      mode: 'flat',
      disposition: 'harmful',
    });
  }

  if (mode === 'ranged' && hasAbility(actor, 'silver-distance') && distanceToTarget === actor.resolvedStats.range && target.alive) {
    applyInitiativeDelta(state, actor, target, createRuntimeAbilityState(getAbility('silver-distance')), {
      kind: 'initiativeDelta',
      amount: -30,
      disposition: 'harmful',
    });
  }

  damageRecipients.forEach((recipient) => {
    if (category === 'normal') {
      applyStallWarts(state, recipient);
    }
  });

  const deadRecipients = damageRecipients.filter((recipient) => recipient.hp <= 0 && recipient.alive);
  deadRecipients.forEach((recipient) => handleDeath(state, actor, recipient, attackContext));
  damageRecipients.forEach((recipient) => {
    if (recipient.alive && canTakeDamage(recipient)) {
      triggerUnitAbilities(state, recipient, { timing: 'onDamaged' });
      if (damagePerRecipient > 0) {
        applyWhimsy(state, recipient);
      }
    }
  });
  if (target.alive) {
    if (category === 'normal' && hasAbility(target, 'thornhide') && target.role === 'frontline' && target.resolvedStats.range === 0 && target.alive) {
      const thornDamage = canTakeDamage(actor) ? 6 : 0;
      if (thornDamage > 0) {
        actor.hp = fixedSub(actor.hp, thornDamage);
      }
      buildStep(state, 'attack', [target.id], [actor.id], `${target.troopLabel} thorns ${actor.troopLabel} for ${formatFixed(thornDamage)}.`, {
        damage: thornDamage,
        mode: 'blast',
        category: 'strike',
        baseDamage: 6,
        attackDamageBeforeArmor: 6,
        armorIgnored: true,
        sourceAbilityId: 'thornhide',
        sourceAbilityLabel: getAbility('thornhide').label,
      });
      if (actor.hp <= 0 && actor.alive) {
        handleDeath(state, target, actor, { mode: 'blast', category: 'strike' });
      }
    }
    if (category === 'normal' && hasAbility(target, 'retaliate') && target.alive && target.engagedWith.size > 0 && availableCapacity(state, target) === 0) {
      attack(state, target, actor, target.resolvedStats.range > 0 ? 'ranged' : 'melee', true, 0, 'retaliation');
    }
  }

  if (mode === 'ranged' && allowOnAttackAbilities && actor.alive && hasAbility(actor, 'skirmishers-step') && actor.engagedWith.size === 0) {
    skirmisherRetreat(state, actor);
  }

  const bonusStrikeCount =
    (category === 'normal' && actor.bonusStrikeCharges > 0 ? 1 : 0) +
    (category === 'normal' && mode === 'melee' && hasAbility(actor, 'dogpile') && target.engagedWith.size >= 3 ? 1 : 0);
  if (category === 'normal' && actor.bonusStrikeCharges > 0) {
    actor.bonusStrikeCharges -= 1;
  }
  if (bonusStrikeCount > 0 && target.alive) {
    strikeCount += bonusStrikeCount;
  }

  if (strikeCount > 0 && target.alive) {
    for (let i = 0; i < strikeCount; i += 1) {
      attack(state, actor, target, mode, false, 0, 'strike');
      if (!target.alive) {
        break;
      }
    }
  }
}

function pileOn(state: InternalState, actor: InternalUnit): boolean {
  const candidates = enemyUnitsOnHex(state, actor);
  if (candidates.length === 0) {
    return false;
  }
  const prioritized = candidates.filter((enemy) =>
    getAliveUnits(state, actor.side)
      .filter((ally) => ally.id !== actor.id && equalsHex(ally.position, actor.position))
      .some((ally) => ally.engagedWith.has(enemy.id)),
  );
  attack(state, actor, chooseAttackTarget(state, actor, prioritized.length > 0 ? prioritized : candidates), 'melee');
  return true;
}

function fight(state: InternalState, actor: InternalUnit): boolean {
  const engagedEnemies = [...actor.engagedWith]
    .map((enemyId) => state.units.get(enemyId))
    .filter((enemy): enemy is InternalUnit => Boolean(enemy?.alive));
  if (engagedEnemies.length > 0) {
    attack(state, actor, chooseAttackTarget(state, actor, engagedEnemies), 'melee');
    return true;
  }
  return pileOn(state, actor);
}

function drawAttention(state: InternalState, actor: InternalUnit, roles: RoleId[] = []): boolean {
  const engagedTargets = engageEnemiesOnHex(state, actor, roles);

  if (engagedTargets.length > 0) {
    buildStep(state, 'engage', [actor.id], engagedTargets.map((target) => target.id), `${actor.troopLabel} engages enemies.`, {
      targetRole: engagedTargets[0]?.role,
      targetHexQ: engagedTargets[0]?.position.q,
      targetHexR: engagedTargets[0]?.position.r,
    });
  }

  return fight(state, actor) || engagedTargets.length > 0;
}

function allySizeOnHex(state: InternalState, side: SideId, coord: HexCoord, exceptId?: string): number {
  return fixedSum(
    getAliveUnits(state, side)
      .filter((unit) => equalsHex(unit.position, coord) && unit.id !== exceptId && countsTowardAllySaturationFromAbilities(unit.resolvedAbilities))
      .map((unit) => unit.resolvedStats.size),
  );
}

function validMovementHexes(state: InternalState, actor: InternalUnit): HexCoord[] {
  return neighbors(actor.position)
    .filter((coord) => inRadius(coord, state.mapRadius))
    .filter((coord) => fixedAdd(allySizeOnHex(state, actor.side, coord, actor.id), actor.resolvedStats.size) <= state.saturation);
}

function getEnemyUnits(state: InternalState, actor: InternalUnit, roles: RoleId[] = []): InternalUnit[] {
  return getAliveUnits(state)
    .filter((unit) => unit.side !== actor.side)
    .filter((unit) => matchesRoleFilter(unit, roles));
}

function getAlliedBackline(state: InternalState, actor: InternalUnit): InternalUnit[] {
  return getAliveUnits(state, actor.side).filter((unit) => unit.id !== actor.id && unit.role === 'backline');
}

function pickNearestUnit(state: InternalState, actor: InternalUnit, candidates: InternalUnit[]): InternalUnit | null {
  if (candidates.length === 0) {
    return null;
  }
  const nearestDistance = Math.min(...candidates.map((candidate) => hexDistance(actor.position, candidate.position)));
  return state.rng.pick(candidates.filter((candidate) => hexDistance(actor.position, candidate.position) === nearestDistance));
}

function countFriendlyFrontlineUnitsOnHex(state: InternalState, actor: InternalUnit, coord: HexCoord): number {
  return getAliveUnits(state, actor.side).filter((unit) => unit.id !== actor.id && unit.role === 'frontline' && equalsHex(unit.position, coord)).length;
}

function countFriendlyUnitsOnHex(state: InternalState, actor: InternalUnit, coord: HexCoord): number {
  return getAliveUnits(state, actor.side).filter((unit) => unit.id !== actor.id && equalsHex(unit.position, coord)).length;
}

function pickRandomHex(state: InternalState, candidates: HexCoord[]): HexCoord {
  return candidates.length === 1 ? candidates[0]! : state.rng.pick(candidates);
}

function pickBestMovementHex(
  state: InternalState,
  actor: InternalUnit,
  candidates: HexCoord[],
  scoreHex: (coord: HexCoord) => number,
): HexCoord | null {
  if (candidates.length === 0) {
    return null;
  }

  const scored = candidates.map((coord) => ({
    coord,
    score: scoreHex(coord),
    friendlyOccupancy: countFriendlyUnitsOnHex(state, actor, coord),
  }));
  const bestScore = Math.max(...scored.map((entry) => entry.score));
  const bestScoreCandidates = scored.filter((entry) => entry.score === bestScore);
  const lowestOccupancy = Math.min(...bestScoreCandidates.map((entry) => entry.friendlyOccupancy));
  const finalists = bestScoreCandidates
    .filter((entry) => entry.friendlyOccupancy === lowestOccupancy)
    .map((entry) => entry.coord);
  return pickRandomHex(state, finalists);
}

function allMapHexes(radius: number): HexCoord[] {
  const coords: HexCoord[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    for (let r = -radius; r <= radius; r += 1) {
      const coord = { q, r };
      if (inRadius(coord, radius)) {
        coords.push(coord);
      }
    }
  }
  return coords;
}

function randomLegalRelocationHex(state: InternalState, actor: InternalUnit): HexCoord | null {
  const candidates = allMapHexes(state.mapRadius).filter(
    (coord) => !equalsHex(coord, actor.position) && fixedAdd(allySizeOnHex(state, actor.side, coord, actor.id), actor.resolvedStats.size) <= state.saturation,
  );
  if (candidates.length === 0) {
    return null;
  }
  return pickRandomHex(state, candidates);
}

function applyWhimsy(state: InternalState, actor: InternalUnit): void {
  if (!actor.alive || !hasAbility(actor, 'whimsy') || !isFae(actor)) {
    return;
  }
  const destination = randomLegalRelocationHex(state, actor);
  if (!destination) {
    return;
  }
  relocateUnit(state, actor, destination);
  buildStep(state, 'move', [actor.id], [], `${actor.troopLabel} is carried away by Whimsy.`, {
    effect: 'whimsy',
    sourceAbilityId: 'whimsy',
    sourceAbilityLabel: getAbility('whimsy').label,
    toQ: actor.position.q,
    toR: actor.position.r,
  });
}

function getScreenPriority(state: InternalState, actor: InternalUnit, candidate: InternalUnit): number {
  const alliedBackline = getAlliedBackline(state, actor);
  if (alliedBackline.length === 0) {
    return hexDistance(actor.position, candidate.position);
  }
  const backlineDistance = Math.min(...alliedBackline.map((unit) => hexDistance(unit.position, candidate.position)));
  const actorDistance = hexDistance(actor.position, candidate.position);
  return backlineDistance * 100 + actorDistance;
}

function formatRoleIntentMessage(roleIntent: RoleIntentId): string {
  return {
    'screen-frontline': 'screens the front',
    'fallback-backline': 'falls through to the backline',
    'breach-backline': 'breaches toward the backline',
    'hold-backline': 'holds pressure on the backline',
    'retreat-range': 'retreats to preserve range',
    'advance-range': 'advances to keep range',
  }[roleIntent];
}

type RoleObjective = {
  target: InternalUnit;
  roleIntent: RoleIntentId;
  reasonCode: string;
  targetRole: RoleId;
};

function pickFrontlineObjective(state: InternalState, actor: InternalUnit): RoleObjective | null {
  const screeningTargets = getEnemyUnits(state, actor, ['frontline', 'chaff']);
  if (screeningTargets.length > 0) {
    const bestPriority = Math.min(...screeningTargets.map((target) => getScreenPriority(state, actor, target)));
    const priorityTiedTargets = screeningTargets.filter((target) => getScreenPriority(state, actor, target) === bestPriority);
    const target = pickNearestUnit(state, actor, priorityTiedTargets)!;
    return {
      target,
      roleIntent: 'screen-frontline',
      reasonCode: 'block-access',
      targetRole: target.role,
    };
  }
  const backlineTarget = pickNearestUnit(state, actor, getEnemyUnits(state, actor, ['backline']));
  if (!backlineTarget) {
    return null;
  }
  return {
    target: backlineTarget,
    roleIntent: 'fallback-backline',
    reasonCode: 'no-frontline-target',
    targetRole: backlineTarget.role,
  };
}

function pickChaffObjective(state: InternalState, actor: InternalUnit): RoleObjective | null {
  const committedTarget = actor.committedBacklineTargetId ? state.units.get(actor.committedBacklineTargetId) : null;
  if (committedTarget?.alive && committedTarget.side !== actor.side && committedTarget.role === 'backline') {
    return {
      target: committedTarget,
      roleIntent: 'hold-backline',
      reasonCode: 'maintain-backline-commitment',
      targetRole: committedTarget.role,
    };
  }
  const backlineTarget = pickNearestUnit(state, actor, getEnemyUnits(state, actor, ['backline']));
  if (backlineTarget) {
    actor.committedBacklineTargetId = backlineTarget.id;
    return {
      target: backlineTarget,
      roleIntent: 'breach-backline',
      reasonCode: 'opened-backline-lane',
      targetRole: backlineTarget.role,
    };
  }
  actor.committedBacklineTargetId = null;
  const fallbackTarget = pickNearestUnit(state, actor, getEnemyUnits(state, actor));
  if (!fallbackTarget) {
    return null;
  }
  return {
    target: fallbackTarget,
    roleIntent: 'screen-frontline',
    reasonCode: 'no-backline-target',
    targetRole: fallbackTarget.role,
  };
}

function findClosestEnemy(state: InternalState, actor: InternalUnit, preferredRoles: RoleId[], nonEngagedOnly: boolean): InternalUnit | null {
  const enemies = getAliveUnits(state).filter(
    (unit) =>
      unit.side !== actor.side &&
      (preferredRoles.length === 0 || preferredRoles.includes(unit.role)) &&
      (!nonEngagedOnly || unit.engagedWith.size === 0),
  );
  if (enemies.length === 0) {
    return null;
  }
  return pickNearestUnit(state, actor, enemies);
}

function moveToward(
  state: InternalState,
  actor: InternalUnit,
  target: InternalUnit,
  roleIntent?: RoleIntentId,
  reasonCode?: string,
  targetRole?: RoleId,
): boolean {
  const options = validMovementHexes(state, actor);
  if (options.length === 0) {
    return false;
  }
  const currentDistance = hexDistance(actor.position, target.position);
  const scored = options.map((coord) => {
    const enemiesHere = getAliveUnits(state).filter((unit) => unit.side !== actor.side && equalsHex(unit.position, coord));
    return {
      coord,
      distance: hexDistance(coord, target.position),
      nonEngagedEnemies: enemiesHere.filter((unit) => unit.engagedWith.size === 0).length,
    };
  });
  const progressMoves = scored.filter((entry) => entry.distance < currentDistance);
  const pool = progressMoves.length > 0 ? progressMoves : scored;
  const minDistance = Math.min(...pool.map((entry) => entry.distance));
  const byDistance = pool.filter((entry) => entry.distance === minDistance);
  const minEnemies = Math.min(...byDistance.map((entry) => entry.nonEngagedEnemies));
  let finalists = byDistance.filter((entry) => entry.nonEngagedEnemies === minEnemies);
  if (actor.role === 'frontline' && roleIntent === 'fallback-backline' && finalists.length > 1) {
    const minFrontlineSupport = Math.min(...finalists.map((entry) => countFriendlyFrontlineUnitsOnHex(state, actor, entry.coord)));
    finalists = finalists.filter((entry) => countFriendlyFrontlineUnitsOnHex(state, actor, entry.coord) === minFrontlineSupport);
  }
  const selected = state.rng.pick(finalists);
  if (equalsHex(selected.coord, actor.position)) {
    return false;
  }
  relocateUnit(state, actor, selected.coord);
  if (roleIntent && reasonCode && targetRole) {
    emitRoleIntentStep(state, 'move', actor, [target], `${actor.troopLabel} ${formatRoleIntentMessage(roleIntent)}.`, {
      roleIntent,
      reasonCode,
      targetRole,
      targetHexQ: target.position.q,
      targetHexR: target.position.r,
      toQ: actor.position.q,
      toR: actor.position.r,
    });
  } else {
    buildStep(state, 'move', [actor.id], [], `${actor.troopLabel} moves.`, { toQ: actor.position.q, toR: actor.position.r });
  }
  return true;
}

function enemiesInRange(state: InternalState, actor: InternalUnit): InternalUnit[] {
  return getAliveUnits(state).filter((enemy) => enemy.side !== actor.side && hexDistance(actor.position, enemy.position) <= actor.resolvedStats.range);
}

function nearestEnemyDistance(state: InternalState, actor: InternalUnit): number | null {
  const enemies = getEnemyUnits(state, actor);
  if (enemies.length === 0) {
    return null;
  }
  return Math.min(...enemies.map((enemy) => hexDistance(actor.position, enemy.position)));
}

function engageObjective(state: InternalState, actor: InternalUnit, objective: RoleObjective): boolean {
  const preferredRoles = objective.targetRole === 'backline' ? ['backline'] : ['frontline', 'chaff'];
  if (enemyUnitsOnHex(state, actor).some((enemy) => matchesRoleFilter(enemy, preferredRoles))) {
    const engagedTargets = engageEnemiesOnHex(state, actor, preferredRoles);
    if (engagedTargets.length > 0) {
      emitRoleIntentStep(state, 'engage', actor, engagedTargets, `${actor.troopLabel} ${formatRoleIntentMessage(objective.roleIntent)}.`, {
        roleIntent: objective.roleIntent,
        reasonCode: objective.reasonCode,
        targetRole: objective.targetRole,
        targetHexQ: objective.target.position.q,
        targetHexR: objective.target.position.r,
      });
    }
    return fight(state, actor) || engagedTargets.length > 0;
  }

  const moved = moveToward(state, actor, objective.target, objective.roleIntent, objective.reasonCode, objective.targetRole);
  const enemiesOnCell = enemyUnitsOnHex(state, actor);
  if (enemiesOnCell.length === 0) {
    return moved;
  }
  if (enemiesOnCell.some((enemy) => matchesRoleFilter(enemy, preferredRoles))) {
    const engagedTargets = engageEnemiesOnHex(state, actor, preferredRoles);
    if (engagedTargets.length > 0) {
      emitRoleIntentStep(state, 'engage', actor, engagedTargets, `${actor.troopLabel} ${formatRoleIntentMessage(objective.roleIntent)}.`, {
        roleIntent: objective.roleIntent,
        reasonCode: objective.reasonCode,
        targetRole: objective.targetRole,
        targetHexQ: objective.target.position.q,
        targetHexR: objective.target.position.r,
      });
    }
    return fight(state, actor) || engagedTargets.length > 0 || moved;
  }
  return drawAttention(state, actor) || moved;
}

function scoreRetreatHex(state: InternalState, actor: InternalUnit, coord: HexCoord): number {
  const enemies = getEnemyUnits(state, actor);
  if (enemies.length === 0) {
    return 0;
  }
  const nearestEnemy = Math.min(...enemies.map((enemy) => hexDistance(coord, enemy.position)));
  const totalEnemyDistance = enemies.reduce((sum, enemy) => sum + hexDistance(coord, enemy.position), 0);
  return nearestEnemy * 100 + totalEnemyDistance;
}

function retreatFromEngagement(
  state: InternalState,
  actor: InternalUnit,
  threat: InternalUnit | null,
  message: string,
  effect: string,
  requireEnemyInRange = false,
): boolean {
  const options = validMovementHexes(state, actor).filter(
    (coord) =>
      getAliveUnits(state).filter((unit) => unit.side !== actor.side && equalsHex(unit.position, coord)).length === 0 &&
      (!requireEnemyInRange || getEnemyUnits(state, actor).some((enemy) => hexDistance(coord, enemy.position) <= actor.resolvedStats.range)),
  );
  if (options.length === 0) {
    return false;
  }
  const selected = pickBestMovementHex(state, actor, options, (coord) => scoreRetreatHex(state, actor, coord));
  if (!selected) {
    return false;
  }
  relocateUnit(state, actor, selected);
  buildStep(state, 'move', [actor.id], threat ? [threat.id] : [], message, {
    effect,
    toQ: actor.position.q,
    toR: actor.position.r,
    sourceAbilityId:
      effect === 'skirmishersStep' ? 'skirmishers-step' : effect === 'fadeIntoShadow' ? 'fade-into-shadow' : undefined,
    sourceAbilityLabel:
      effect === 'skirmishersStep'
        ? getAbility('skirmishers-step').label
        : effect === 'fadeIntoShadow'
          ? getAbility('fade-into-shadow').label
          : undefined,
  });
  return true;
}

function skirmisherRetreat(state: InternalState, actor: InternalUnit): boolean {
  const nearestThreat = pickNearestUnit(state, actor, getEnemyUnits(state, actor));
  return retreatFromEngagement(
    state,
    actor,
    nearestThreat,
    `${actor.troopLabel} steps back to keep a firing lane.`,
    'skirmishersStep',
    true,
  );
}

function retreat(state: InternalState, actor: InternalUnit): boolean {
  const target = pickNearestUnit(state, actor, getEnemyUnits(state, actor));
  const options = validMovementHexes(state, actor).filter(
    (coord) => getAliveUnits(state).filter((unit) => unit.side !== actor.side && equalsHex(unit.position, coord)).length === 0,
  );
  if (options.length > 0) {
    const selected = pickBestMovementHex(state, actor, options, (coord) => scoreRetreatHex(state, actor, coord));
    if (!selected) {
      return false;
    }
    relocateUnit(state, actor, selected);
    if (target) {
      emitRoleIntentStep(state, 'move', actor, [target], `${actor.troopLabel} retreats to preserve range.`, {
        roleIntent: 'retreat-range',
        reasonCode: 'increase-threat-distance',
        targetRole: target.role,
        targetHexQ: target.position.q,
        targetHexR: target.position.r,
        toQ: actor.position.q,
        toR: actor.position.r,
      });
    } else {
      buildStep(state, 'move', [actor.id], [], `${actor.troopLabel} retreats.`, { toQ: actor.position.q, toR: actor.position.r });
    }
    return true;
  }
  const sameHexEnemies = enemyUnitsOnHex(state, actor);
  if (sameHexEnemies.length > 0) {
    attack(state, actor, chooseAttackTarget(state, actor, sameHexEnemies), 'melee');
    return true;
  }
  return false;
}

function carefulAdvance(state: InternalState, actor: InternalUnit): boolean {
  const target = findClosestEnemy(state, actor, [], false);
  if (!target) {
    return false;
  }
  const options = validMovementHexes(state, actor).filter((coord) => {
    const becomesCloser = hexDistance(coord, target.position) < hexDistance(actor.position, target.position);
    if (!becomesCloser) {
      return false;
    }
    const alliesOnTarget = getAliveUnits(state, actor.side).filter((ally) => equalsHex(ally.position, coord));
    return alliesOnTarget.every((ally) => ally.resolvedStats.range >= actor.resolvedStats.range);
  });
  if (options.length === 0) {
    return false;
  }
  const currentDistance = hexDistance(actor.position, target.position);
  const selected = pickBestMovementHex(
    state,
    actor,
    options,
    (coord) => currentDistance - hexDistance(coord, target.position),
  );
  if (!selected) {
    return false;
  }
  relocateUnit(state, actor, selected);
  emitRoleIntentStep(state, 'move', actor, [target], `${actor.troopLabel} advances to keep range.`, {
    roleIntent: 'advance-range',
    reasonCode: 'maintain-firing-lane',
    targetRole: target.role,
    targetHexQ: target.position.q,
    targetHexR: target.position.r,
    toQ: actor.position.q,
    toR: actor.position.r,
  });
  return true;
}

function applyQuakes(state: InternalState): void {
  if (!state.effects.randomMoveEveryBeats || state.effects.randomMoveEveryBeats <= 0) {
    return;
  }
  if (state.beatCount % state.effects.randomMoveEveryBeats !== 0) {
    return;
  }

  state.rng.shuffle(getAliveUnits(state)).forEach((unit) => {
    const options = validMovementHexes(state, unit);
    if (options.length === 0) {
      return;
    }
    const destination = pickRandomHex(state, options);
    relocateUnit(state, unit, destination);
    buildStep(state, 'move', [unit.id], [], `${unit.troopLabel} is displaced by quakes.`, {
      effect: 'quakes',
      sourceAbilityId: 'quakes',
      sourceAbilityLabel: getMutator('quakes').label,
      toQ: unit.position.q,
      toR: unit.position.r,
    });
  });
}

function applyDecay(state: InternalState): void {
  if (state.effects.decayDamagePerBeat <= 0) {
    return;
  }

  getAliveUnits(state).forEach((unit) => {
    const damage = canTakeDamage(unit) ? state.effects.decayDamagePerBeat : 0;
    if (damage > 0) {
      unit.hp = fixedSub(unit.hp, damage);
    }
    buildStep(state, 'attack', [], [unit.id], `${unit.troopLabel} loses ${formatFixed(damage)} HP to Decay.`, {
      damage,
      mode: 'blast',
      category: 'strike',
      baseDamage: state.effects.decayDamagePerBeat,
      attackDamageBeforeArmor: state.effects.decayDamagePerBeat,
      armorIgnored: true,
      effect: 'decay',
      sourceAbilityId: 'decay',
      sourceAbilityLabel: getMutator('decay').label,
    });
    if (unit.hp <= 0 && unit.alive) {
      handleEnvironmentalDeath(state, unit, 'decay', getMutator('decay').label, `${unit.troopLabel} is consumed by Decay.`);
    } else if (unit.alive && canTakeDamage(unit)) {
      triggerUnitAbilities(state, unit, { timing: 'onDamaged' });
      if (damage > 0) {
        applyWhimsy(state, unit);
      }
    }
  });
}

function spawnPendingDiggyHoleUnits(state: InternalState): void {
  if (state.beatCount !== 10) {
    return;
  }

  (['player', 'enemy'] as SideId[]).forEach((side) => {
    const pending = state.pendingDiggyHoleCombatants[side];
    if (pending.length === 0) {
      return;
    }

    const before = new Set(state.units.keys());
    const context: SpawnContext = { units: state.units, rng: state.rng, saturation: state.saturation };
    const placementSide: SideId = side === 'player' ? 'enemy' : 'player';
    while (!spawnUnitsForSide(side, pending, state.mapRadius, context, placementSide)) {
      state.mapRadius += 1;
    }
    state.pendingDiggyHoleCombatants[side] = [];
    const spawned = [...state.units.values()].filter((unit) => !before.has(unit.id));
    spawned.forEach((unit) => applyMutatorAdjustmentsToUnit(unit, state.effects));
    buildStep(
      state,
      'move',
      spawned.map((unit) => unit.id),
      [],
      `Diggy Hole opens beneath enemy lines for ${side === 'player' ? 'player' : 'enemy'} Dwarves.`,
      {
        effect: 'diggyHole',
        sourceAbilityId: 'diggy-hole',
        sourceAbilityLabel: getAbility('diggy-hole').label,
      },
    );
  });

  applyCopiousAle(state);
}

function combatantWasBrought(input: BattleInput, side: SideId, factionId: string): boolean {
  const combatants = side === 'player' ? input.playerCombatants : input.enemyCombatants;
  return combatants.some((combatant) => combatant.factionId === factionId);
}

function applyChangeling(state: InternalState): void {
  if (state.beatCount !== 12) {
    return;
  }
  (['player', 'enemy'] as SideId[]).forEach((side) => {
    if (state.changelingTriggeredSides.has(side) || !sideHasFactionUpgrade(state, side, 'fae-changeling') || !combatantWasBrought(state.input, side, 'fae')) {
      return;
    }
    const enemySide: SideId = side === 'player' ? 'enemy' : 'player';
    const byTroop = new Map<string, InternalUnit[]>();
    getAliveUnits(state, enemySide).forEach((unit) => {
      const key = unit.troopInstanceId ?? unit.troopLabel;
      byTroop.set(key, [...(byTroop.get(key) ?? []), unit]);
    });
    const changed: InternalUnit[] = [];
    byTroop.forEach((units) => {
      const unit = state.rng.pick(units);
      removeAllEngagements(state, unit);
      unit.side = side;
      unit.initiative = 0;
      changed.push(unit);
    });
    state.changelingTriggeredSides.add(side);
    if (changed.length > 0) {
      buildStep(
        state,
        'buff',
        [],
        changed.map((unit) => unit.id),
        `Changeling turns ${changed.length} enemy ${changed.length === 1 ? 'unit' : 'units'}.`,
        {
          effect: 'changeling',
          sourceAbilityId: 'changeling',
          sourceAbilityLabel: getAbility('changeling').label,
        },
      );
    }
  });
}

function applyBeatMutators(state: InternalState): void {
  spawnPendingDiggyHoleUnits(state);
  applyChangeling(state);
  applyQuakes(state);
  applyDecay(state);
}

function executeTurnActions(state: InternalState, actor: InternalUnit): void {
  clearStaleEngagements(state);
  if (actor.committedBacklineTargetId) {
    const committedTarget = state.units.get(actor.committedBacklineTargetId);
    if (!committedTarget?.alive || committedTarget.side === actor.side || committedTarget.role !== 'backline') {
      actor.committedBacklineTargetId = null;
    }
  }
  const engagedEnemies = [...actor.engagedWith]
    .map((enemyId) => state.units.get(enemyId))
    .filter((enemy): enemy is InternalUnit => Boolean(enemy?.alive));
  if (engagedEnemies.length > 0) {
    attack(state, actor, chooseAttackTarget(state, actor, engagedEnemies), 'melee');
    return;
  }

  if (actor.role === 'frontline') {
    const objective = pickFrontlineObjective(state, actor);
    if (objective) {
      engageObjective(state, actor, objective);
    }
    return;
  }

  if (actor.role === 'chaff') {
    const sameHexEnemies = enemyUnitsOnHex(state, actor);
    if (sameHexEnemies.length > 0) {
      const preferredTargets = sameHexEnemies.filter((enemy) => enemy.role === 'backline');
      attack(state, actor, chooseAttackTarget(state, actor, preferredTargets.length > 0 ? preferredTargets : sameHexEnemies), 'melee');
      return;
    }
    const objective = pickChaffObjective(state, actor);
    if (objective) {
      engageObjective(state, actor, objective);
    }
    return;
  }

  const nearestThreatDistance = nearestEnemyDistance(state, actor);
  if ((nearestThreatDistance ?? Number.MAX_SAFE_INTEGER) <= 1) {
    retreat(state, actor);
    return;
  }
  const inRange = enemiesInRange(state, actor);
  if (inRange.length > 0) {
    attack(state, actor, chooseAttackTarget(state, actor, inRange), 'ranged');
    return;
  }
  carefulAdvance(state, actor);
}

function executeTurn(state: InternalState, actor: InternalUnit): void {
  if (!actor.alive) {
    return;
  }
  state.currentTurnUnitId = actor.id;
  executeStartOfTurnAbilities(state, actor);
  if (!actor.alive) {
    state.currentTurnUnitId = null;
    return;
  }
  executeTurnActions(state, actor);
  executeEndOfTurnAbilities(state, actor);
  expireTimedEffects(state, actor);
  if (actor.alive && actor.berserkDeathPending) {
    actor.berserkTurnsUntilDeath = Math.max(0, actor.berserkTurnsUntilDeath - 1);
    if (actor.berserkTurnsUntilDeath === 0) {
      handleEnvironmentalDeath(state, actor, 'berserk', getAbility('berserk').label, `${actor.troopLabel} burns out after going berserk.`, true);
    }
  }
  state.currentTurnUnitId = null;
}

function isBattleOver(state: InternalState): boolean {
  const playerPresent = getAliveUnits(state, 'player').length > 0 || hasPendingDiggyHoleUnits(state, 'player');
  const enemyPresent = getAliveUnits(state, 'enemy').length > 0 || hasPendingDiggyHoleUnits(state, 'enemy');
  return !playerPresent || !enemyPresent;
}

export function resolveBattle(input: BattleInput): BattleReplay {
  const seed = input.seed ?? randomSeed();
  const rng = createRng(seed);
  const init = initializeUnits(input, rng);
  const saturation = input.saturation ?? DEFAULT_SATURATION;
  const state: InternalState = {
    units: init.units,
    pendingDiggyHoleCombatants: init.pendingDiggyHoleCombatants,
    copiousAleAppliedTroopKeys: new Set<string>(),
    corpses: new Map<string, HexCoord>(),
    summonedProfiles: new Map<string, ReplayTroopProfile>(),
    steps: [],
    mapRadius: init.mapRadius,
    saturation,
    rng,
    beatCount: 0,
    effects: buildEffects(input.mutatorIds),
    replayId: makeReplayId(seed, input.riftId),
    input,
    currentTurnUnitId: null,
    changelingTriggeredSides: new Set<SideId>(),
    pendingGraveVigorBlocks: [],
  };
  state.units.forEach((unit) => applyMutatorAdjustmentsToUnit(unit, state.effects));

  const troopLabels = Object.fromEntries(
    [...input.playerCombatants, ...input.enemyCombatants].map((combatant) => [combatant.combatantId, combatant.label]),
  );
  const initial = cloneSnapshot(state.units);
  executeStartOfBattleAbilities(state);
  applyCopiousAle(state);

  while (!isBattleOver(state) && state.beatCount < MAX_BEATS) {
    state.beatCount += 1;
    getAliveUnits(state).forEach((unit) => {
      unit.initiative = fixedAdd(unit.initiative, fixedAdd(unit.resolvedStats.speed, state.effects.initiativeBonusPerBeat));
    });
    buildStep(state, 'beat', [], [], `Beat ${state.beatCount}: initiative increases for all units.`, {
      beat: state.beatCount,
      initiativeBonus: state.effects.initiativeBonusPerBeat,
    });
    applyBeatMutators(state);
    const ready = getAliveUnits(state).filter((unit) => unit.initiative >= 100).map((unit) => unit.id);
    state.rng.shuffle(ready).forEach((unitId) => {
      const unit = state.units.get(unitId);
      if (!unit?.alive) {
        return;
      }
      unit.initiative = fixedSub(unit.initiative, 100);
      executeTurn(state, unit);
    });
  }

  const snapshots = [initial, ...state.steps.map((step) => step.snapshot)];
  const finalCounts = createAliveCount(snapshots[snapshots.length - 1] ?? initial);

  return {
    id: state.replayId,
    seed,
    riftId: input.riftId,
    tier: input.tier,
    mutatorIds: [...input.mutatorIds],
    mapRadius: state.mapRadius,
    saturation: state.saturation,
    initial,
    steps: state.steps,
    outcome: resolveBattleOutcome(state),
    troopLabels,
    troopProfiles: buildTroopProfiles(input, state.summonedProfiles, state.effects),
    aliveCounts: snapshots.map(createAliveCount),
    summary: {
      playerTroops: input.playerCombatants.map((combatant) => combatant.label),
      enemyTroops: input.enemyCombatants.map((combatant) => combatant.label),
      finalPlayerAlive: finalCounts.player,
      finalEnemyAlive: finalCounts.enemy,
    },
  };
}

export function resolveDebugBattle(input: BattleDebugInput): BattleReplay {
  const playerFactionUpgradeIds = input.playerFactionUpgradeIds ?? [];
  const playerTroopTypeUpgradeIds = input.playerTroopTypeUpgradeIds ?? [];
  const enemyFactionUpgradeIds = input.enemyFactionUpgradeIds ?? [];
  const enemyTroopTypeUpgradeIds = input.enemyTroopTypeUpgradeIds ?? [];
  const playerCombatants = Object.entries(input.player)
    .filter(([, quantity]) => quantity > 0)
    .map(([troopId, quantity]) => {
      const troop = getTroopDefinitionOrThrow(troopId);
      const resolved = resolveTroopCombatant(
        { factionUpgradeIds: playerFactionUpgradeIds, troopTypeUpgradeIds: playerTroopTypeUpgradeIds },
        createTroopInstance(troop.factionId, troop.unitTypeId),
        'player',
        null,
        `debug-player-${troopId}`,
      );
      return {
        ...resolved,
        troopInstanceId: null,
        quantity,
      };
    });
  const enemyCombatants = Object.entries(input.enemy)
    .filter(([, quantity]) => quantity > 0)
    .map(([troopId, quantity]) => {
      const troop = getTroopDefinitionOrThrow(troopId);
      const resolved = resolveTroopCombatant(
        { factionUpgradeIds: enemyFactionUpgradeIds, troopTypeUpgradeIds: enemyTroopTypeUpgradeIds },
        createTroopInstance(troop.factionId, troop.unitTypeId),
        'enemy',
        null,
        `debug-enemy-${troopId}`,
      );
      return {
        ...resolved,
        troopInstanceId: null,
        quantity,
      };
    });

  return resolveBattle({
    seed: input.seed ?? randomSeed(),
    riftId: null,
    tier: null,
    mutatorIds: [],
    playerFactionUpgradeIds,
    playerTroopTypeUpgradeIds,
    enemyFactionUpgradeIds,
    enemyTroopTypeUpgradeIds,
    playerCombatants,
    enemyCombatants,
  });
}

export function buildBattleInputFromResolvedCombatants(
  seed: number,
  riftId: string | null,
  tier: number | null,
  mutatorIds: string[],
  saturation: number | undefined,
  playerFactionUpgradeIds: string[],
  playerTroopTypeUpgradeIds: string[],
  enemyFactionUpgradeIds: string[],
  enemyTroopTypeUpgradeIds: string[],
  playerCombatants: ResolvedCombatantDefinition[],
  enemyCombatants: ResolvedCombatantDefinition[],
): BattleInput {
  return {
    seed,
    riftId,
    tier,
    mutatorIds,
    saturation,
    playerFactionUpgradeIds,
    playerTroopTypeUpgradeIds,
    enemyFactionUpgradeIds,
    enemyTroopTypeUpgradeIds,
    playerCombatants,
    enemyCombatants,
  };
}
