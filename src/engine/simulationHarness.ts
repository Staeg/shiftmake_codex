import { resolveBattle } from './battle';
import { fixed, fixedAdd } from './fixed';
import { footprintsTouchOrOverlap } from './hex';
import { clampStat, getAbility, getTroopDefinitionOrThrow, getUnitClass } from './unitCatalog';
import type {
  AbilityDefinition,
  BattleInput,
  BattleOutcome,
  BattleReplay,
  BattleStateSnapshot,
  BattleStep,
  RaceId,
  ResolvedCombatantDefinition,
  RoleId,
  RoleIntentId,
  SideId,
  UnitStats,
  UnitClassId,
} from './types';

type NumericPercentiles = {
  p10: number;
  median: number;
  p90: number;
};

export type RoleScenarioId = 'frontline-screen' | 'pusher-breach' | 'backline-spacing';

export interface RoleIntentStepFilter {
  actorSide?: SideId;
  actorRole?: RoleId;
  roleIntent?: RoleIntentId | RoleIntentId[];
  targetRole?: RoleId;
}

export interface SyntheticCombatantOptions {
  combatantId: string;
  label: string;
  side: SideId;
  role: RoleId;
  unitClassTag: string;
  stats: UnitStats;
  unitClassId?: UnitClassId;
  raceId?: RaceId;
  troopInstanceId?: string | null;
  attributes?: string[];
  abilities?: AbilityDefinition[];
  quantity?: number;
  cost?: number;
}

export interface CatalogCombatantOptions {
  combatantId?: string;
  quantity?: number;
  side: SideId;
}

export interface UnitClassCombatantOptions extends CatalogCombatantOptions {
  raceId?: RaceId;
  label?: string;
  stats?: Partial<UnitStats>;
  attributes?: string[];
  abilities?: AbilityDefinition[];
  includeBaseAbilities?: boolean;
}

export interface AbilityNetImpact {
  damageDealt: number;
  hpHealed: number;
  unitsSummoned: number;
  buffsApplied: number;
  redirects: number;
}

export interface SimulationMetrics {
  outcome: BattleOutcome;
  beatsToEnd: number;
  firstContactBeat: number | null;
  firstBacklineThreatBeat: number | null;
  backlineBreached: boolean;
  ownTurnsTakenPerUnit: number;
  playerSurvivors: number;
  enemySurvivors: number;
  damagePer100Beats: number;
  effectiveHpPreserved: number;
  summonUptimeBeats: number;
  summonRealizedValue: number;
  scalingValueRealized: number;
  drawRate: number;
  abilitySuccessfulApplications: Record<string, number>;
  abilityNetImpact: Record<string, AbilityNetImpact>;
}

export interface SimulationSweepEntry {
  seed: number;
  replayId: string;
  metrics: SimulationMetrics;
}

export interface SimulationSweepSummary {
  battles: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  drawRate: number;
  average: {
    beatsToEnd: number;
    firstContactBeat: number | null;
    firstBacklineThreatBeat: number | null;
    ownTurnsTakenPerUnit: number;
    summonUptimeBeats: number;
    summonRealizedValue: number;
    scalingValueRealized: number;
    damagePer100Beats: number;
    effectiveHpPreserved: number;
  };
  percentiles: {
    beatsToEnd: NumericPercentiles;
    firstContactBeat: NumericPercentiles | null;
    firstBacklineThreatBeat: NumericPercentiles | null;
  };
}

export interface SimulationSweepResult {
  entries: SimulationSweepEntry[];
  summary: SimulationSweepSummary;
}

function cloneStats(stats: UnitStats): UnitStats {
  return {
    health: clampStat('health', stats.health),
    damage: clampStat('damage', stats.damage),
    rate: clampStat('rate', stats.rate),
    move: clampStat('move', stats.move),
    range: clampStat('range', stats.range),
    armor: clampStat('armor', stats.armor),
    size: clampStat('size', stats.size),
    capacity: clampStat('capacity', stats.capacity),
  };
}

function emptyImpact(): AbilityNetImpact {
  return {
    damageDealt: 0,
    hpHealed: 0,
    unitsSummoned: 0,
    buffsApplied: 0,
    redirects: 0,
  };
}

function percentile(sortedValues: number[], value: number): number {
  const exactIndex = (sortedValues.length - 1) * value;
  const lower = Math.floor(exactIndex);
  const upper = Math.ceil(exactIndex);
  if (lower === upper) {
    return sortedValues[lower] ?? 0;
  }
  const lowerValue = sortedValues[lower] ?? 0;
  const upperValue = sortedValues[upper] ?? 0;
  const weight = exactIndex - lower;
  return fixed(lowerValue + (upperValue - lowerValue) * weight);
}

function buildPercentiles(values: number[]): NumericPercentiles {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p10: percentile(sorted, 0.1),
    median: percentile(sorted, 0.5),
    p90: percentile(sorted, 0.9),
  };
}

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return fixed(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function averageNullable(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) {
    return null;
  }
  return average(present);
}

function buildNullablePercentiles(values: Array<number | null>): NumericPercentiles | null {
  const present = values.filter((value): value is number => value !== null);
  if (present.length === 0) {
    return null;
  }
  return buildPercentiles(present);
}

function getSnapshotUnit(snapshot: BattleStateSnapshot, unitId: string) {
  return snapshot.units.find((unit) => unit.id === unitId);
}

function isRoleIntentStep(step: BattleStep): boolean {
  return (step.kind === 'move' || step.kind === 'engage') && typeof step.metadata?.roleIntent === 'string';
}

function matchesRoleIntentFilter(replay: BattleReplay, step: BattleStep, filter: RoleIntentStepFilter): boolean {
  if (!isRoleIntentStep(step)) {
    return false;
  }

  const actor = step.actorIds.map((actorId) => getSnapshotUnit(step.snapshot, actorId)).find((unit) => Boolean(unit));
  if (!actor) {
    return false;
  }

  if (filter.actorSide && actor.side !== filter.actorSide) {
    return false;
  }
  if (filter.actorRole && actor.role !== filter.actorRole) {
    return false;
  }

  const intents = filter.roleIntent ? (Array.isArray(filter.roleIntent) ? filter.roleIntent : [filter.roleIntent]) : null;
  if (intents && !intents.includes(step.metadata!.roleIntent as RoleIntentId)) {
    return false;
  }

  if (filter.targetRole && step.metadata?.targetRole !== filter.targetRole) {
    return false;
  }

  return true;
}

function stepBeat(step: BattleStep, fallbackBeat: number): number {
  if (step.kind === 'beat' && typeof step.metadata?.beat === 'number') {
    return step.metadata.beat;
  }
  return fallbackBeat;
}

function countFutureTurns(clusterStartsByActor: Map<string, number[]>, actorId: string, stepIndex: number): number {
  const starts = clusterStartsByActor.get(actorId) ?? [];
  let count = 0;
  starts.forEach((start) => {
    if (start > stepIndex) {
      count += 1;
    }
  });
  return count;
}

function isSummonStep(step: BattleStep): boolean {
  return step.kind === 'buff' && step.metadata?.effect === 'summon';
}

export function createSyntheticCombatant(options: SyntheticCombatantOptions): ResolvedCombatantDefinition {
  return {
    combatantId: options.combatantId,
    raceId: options.raceId ?? 'simulation',
    unitClassId: options.unitClassId ?? options.unitClassTag,
    troopInstanceId: options.troopInstanceId ?? null,
    label: options.label,
    role: options.role,
    unitClassTag: options.unitClassTag,
    attributes: [...(options.attributes ?? [])],
    stats: cloneStats(options.stats),
    abilities: [...(options.abilities ?? [])],
    quantity: options.quantity ?? 1,
    cost: options.cost ?? 0,
    side: options.side,
  };
}

export function createCatalogTroopCombatant(troopId: string, options: CatalogCombatantOptions): ResolvedCombatantDefinition {
  const troop = getTroopDefinitionOrThrow(troopId);
  return {
    combatantId: options.combatantId ?? `${options.side}-${troopId}`,
    raceId: troop.raceId,
    unitClassId: troop.unitClassId,
    troopInstanceId: null,
    label: troop.label,
    role: troop.role,
    unitClassTag: troop.unitClassTag,
    attributes: [...troop.attributes],
    stats: cloneStats(troop.stats),
    abilities: [...troop.abilities],
    quantity: options.quantity ?? troop.quantity,
    cost: troop.cost,
    side: options.side,
  };
}

export function createUnitClassCombatant(unitClassId: UnitClassId, options: UnitClassCombatantOptions): ResolvedCombatantDefinition {
  const unitClass = getUnitClass(unitClassId);
  const abilities =
    options.abilities ??
    (options.includeBaseAbilities === false ? [] : unitClass.abilityIds.map((abilityId) => getAbility(abilityId)));

  return createSyntheticCombatant({
    combatantId: options.combatantId ?? `${options.side}-${unitClassId}`,
    raceId: options.raceId ?? 'simulation',
    unitClassId,
    label: options.label ?? unitClass.label,
    side: options.side,
    role: unitClass.role,
    unitClassTag: unitClass.unitClassTag,
    attributes: options.attributes ?? [...unitClass.attributes],
    stats: { ...unitClass.stats, ...options.stats },
    abilities,
    quantity: options.quantity ?? unitClass.quantity,
    cost: unitClass.cost,
  });
}

export function buildSimulationBattleInput(
  seed: number,
  playerCombatants: ResolvedCombatantDefinition[],
  enemyCombatants: ResolvedCombatantDefinition[],
  mutatorIds: string[] = [],
): BattleInput {
  return {
    seed,
    riftId: null,
    tier: null,
    mutatorIds,
    playerCombatants,
    enemyCombatants,
  };
}

export function createSeedRange(count: number, start = 0): number[] {
  return Array.from({ length: count }, (_, index) => start + index);
}

export function buildRoleScenarioBattleInput(scenarioId: RoleScenarioId, seed: number): BattleInput {
  switch (scenarioId) {
    case 'frontline-screen':
      return buildSimulationBattleInput(
        seed,
        [
          createCatalogTroopCombatant('human/soldier', {
            combatantId: 'player-frontline',
            side: 'player',
            quantity: 1,
          }),
          createCatalogTroopCombatant('elf/archer', {
            combatantId: 'player-backline',
            side: 'player',
            quantity: 1,
          }),
        ],
        [
          createCatalogTroopCombatant('human/soldier', {
            combatantId: 'enemy-frontline',
            side: 'enemy',
            quantity: 1,
          }),
          createCatalogTroopCombatant('elf/archer', {
            combatantId: 'enemy-backline',
            side: 'enemy',
            quantity: 1,
          }),
        ],
      );
    case 'pusher-breach':
      return buildSimulationBattleInput(
        seed,
        [
          createUnitClassCombatant('militia', {
            combatantId: 'player-pusher',
            label: 'Benchmark Pusher',
            side: 'player',
            stats: { health: 100, rate: 50, size: 1 },
            quantity: 1,
          }),
        ],
        [
          createUnitClassCombatant('soldier', {
            combatantId: 'enemy-screen',
            raceId: 'human',
            label: 'Human Soldier',
            side: 'enemy',
            attributes: ['melee', 'human'],
            stats: { health: 99, damage: 11, rate: 1, move: 1, armor: 5, size: 1, capacity: 3 },
            quantity: 1,
          }),
          createUnitClassCombatant('archer', {
            combatantId: 'enemy-backline',
            raceId: 'elf',
            label: 'Elven Archer',
            side: 'enemy',
            attributes: ['ranged', 'elf'],
            stats: { health: 27, damage: 12.1, rate: 13.2, move: 4, size: 1 },
            quantity: 1,
          }),
        ],
      );
    case 'backline-spacing':
      return buildSimulationBattleInput(
        seed,
        [
          createCatalogTroopCombatant('elf/archer', {
            combatantId: 'player-backline',
            side: 'player',
            quantity: 1,
          }),
        ],
        [
          createCatalogTroopCombatant('human/knight', {
            combatantId: 'enemy-pursuer',
            side: 'enemy',
            quantity: 1,
          }),
        ],
      );
  }
}

export function countRoleIntentSteps(replay: BattleReplay, filter: RoleIntentStepFilter): number {
  return replay.steps.filter((step) => matchesRoleIntentFilter(replay, step, filter)).length;
}

export function findFirstRoleIntentBeat(replay: BattleReplay, filter: RoleIntentStepFilter): number | null {
  let currentBeat = 0;

  for (const step of replay.steps) {
    currentBeat = stepBeat(step, currentBeat);
    if (matchesRoleIntentFilter(replay, step, filter)) {
      return currentBeat;
    }
  }

  return null;
}

export function extractSimulationMetrics(replay: BattleReplay): SimulationMetrics {
  const unitSide = new Map<string, SideId>();
  const unitRole = new Map<string, RoleId>();
  const initialUnitIds = new Set(replay.initial.units.map((unit) => unit.id));
  const clusterStartsByActor = new Map<string, number[]>();
  const summonSpawnBeat = new Map<string, number>();
  const summonDeathBeat = new Map<string, number>();
  const summonedUnitIds = new Set<string>();
  const abilitySuccessfulApplications: Record<string, number> = {};
  const abilityNetImpact: Record<string, AbilityNetImpact> = {};
  let currentBeat = 0;
  let firstContactBeat: number | null = null;
  let firstBacklineThreatBeat: number | null = null;
  let preventedByArmor = 0;
  let totalDamage = 0;
  let summonDamageDealt = 0;
  let summonDamageAbsorbed = 0;
  let summonEngagementsCreated = 0;
  let scalingValueRealized = 0;

  const rememberSnapshot = (snapshot: BattleStateSnapshot) => {
    snapshot.units.forEach((unit) => {
      unitSide.set(unit.id, unit.side);
      unitRole.set(unit.id, unit.role);
    });
  };

  rememberSnapshot(replay.initial);

  let lastClusterActor: string | null = null;
  replay.steps.forEach((step, index) => {
    currentBeat = stepBeat(step, currentBeat);
    rememberSnapshot(step.snapshot);

    const actorId = step.actorIds[0] ?? null;
    if (step.kind === 'beat' || !actorId) {
      lastClusterActor = null;
    } else if (actorId !== lastClusterActor) {
      const starts = clusterStartsByActor.get(actorId) ?? [];
      starts.push(index);
      clusterStartsByActor.set(actorId, starts);
      lastClusterActor = actorId;
    }
  });

  currentBeat = 0;
  replay.steps.forEach((step, index) => {
    currentBeat = stepBeat(step, currentBeat);
    const actorId = step.actorIds[0] ?? null;

    if (firstBacklineThreatBeat === null) {
      const aliveBackline = step.snapshot.units.filter((unit) => unit.alive && unit.role === 'backline');
      const breached = aliveBackline.some((backline) =>
        step.snapshot.units.some(
          (other) => other.alive && other.side !== backline.side && footprintsTouchOrOverlap(other.occupiedHexes, backline.occupiedHexes),
        ),
      );
      if (breached) {
        firstBacklineThreatBeat = currentBeat;
      }
    }

    const sourceAbilityId = typeof step.metadata?.sourceAbilityId === 'string' ? step.metadata.sourceAbilityId : null;
    if (sourceAbilityId) {
      const applicationCount = typeof step.metadata?.batchCount === 'number' ? step.metadata.batchCount : 1;
      abilitySuccessfulApplications[sourceAbilityId] = (abilitySuccessfulApplications[sourceAbilityId] ?? 0) + applicationCount;
      if (!abilityNetImpact[sourceAbilityId]) {
        abilityNetImpact[sourceAbilityId] = emptyImpact();
      }
    }

    if (isSummonStep(step)) {
      step.targetIds.forEach((unitId) => {
        summonedUnitIds.add(unitId);
        summonSpawnBeat.set(unitId, currentBeat);
      });
      if (sourceAbilityId) {
        abilityNetImpact[sourceAbilityId].unitsSummoned += step.targetIds.length;
      }
    }

    if (step.kind === 'death') {
      step.targetIds.forEach((unitId) => {
        if (summonedUnitIds.has(unitId)) {
          summonDeathBeat.set(unitId, currentBeat);
        }
      });
    }

    if (step.kind === 'engage') {
      if (actorId && summonedUnitIds.has(actorId)) {
        summonEngagementsCreated += step.targetIds.length;
      }
      if (sourceAbilityId && step.metadata?.effect === 'redirect') {
        abilityNetImpact[sourceAbilityId].redirects += step.targetIds.length;
      }
    }

    if (step.kind === 'heal') {
      const amount = typeof step.metadata?.amount === 'number' ? step.metadata.amount : 0;
      if (sourceAbilityId) {
        abilityNetImpact[sourceAbilityId].hpHealed = fixedAdd(abilityNetImpact[sourceAbilityId].hpHealed, amount);
      }
      return;
    }

    if (step.kind === 'buff') {
      const amount = typeof step.metadata?.amount === 'number' ? step.metadata.amount : 0;
      const effect = typeof step.metadata?.effect === 'string' ? step.metadata.effect : null;
      if (sourceAbilityId && effect && !step.metadata?.expired) {
        abilityNetImpact[sourceAbilityId].buffsApplied += 1;
      }
      if (sourceAbilityId && amount > 0 && effect && (effect === 'ramp' || effect === 'haste' || effect === 'bolster')) {
        const targetId = step.targetIds[0];
        if (targetId) {
          scalingValueRealized = fixedAdd(
            scalingValueRealized,
            fixed(amount * countFutureTurns(clusterStartsByActor, targetId, index)),
          );
        }
      }
      return;
    }

    if (step.kind !== 'attack') {
      return;
    }

    const damage = typeof step.metadata?.damage === 'number' ? step.metadata.damage : 0;
    const mode = typeof step.metadata?.mode === 'string' ? step.metadata.mode : 'melee';
    totalDamage = fixedAdd(totalDamage, damage);

    const targetId = step.targetIds[0];
    const actorUnit = actorId ? getSnapshotUnit(step.snapshot, actorId) : undefined;
    const targetUnit = targetId ? getSnapshotUnit(step.snapshot, targetId) : undefined;

    if (mode === 'melee' && damage > 0 && firstContactBeat === null) {
      firstContactBeat = currentBeat;
    }

    if (actorId && summonedUnitIds.has(actorId)) {
      summonDamageDealt = fixedAdd(summonDamageDealt, damage);
    }
    if (targetId && summonedUnitIds.has(targetId)) {
      summonDamageAbsorbed = fixedAdd(summonDamageAbsorbed, damage);
    }

    if (sourceAbilityId) {
      abilityNetImpact[sourceAbilityId].damageDealt = fixedAdd(abilityNetImpact[sourceAbilityId].damageDealt, damage);
    }

    if ((mode === 'melee' || mode === 'ranged') && actorUnit && targetUnit) {
      const mitigated = Math.max(Math.min(actorUnit.stats.damage, targetUnit.stats.armor), 0);
      preventedByArmor = fixedAdd(preventedByArmor, mitigated);
    }
  });

  const summonUptimes = [...summonedUnitIds].map((unitId) => {
    const spawnBeat = summonSpawnBeat.get(unitId) ?? replay.steps.length;
    const deathBeat = summonDeathBeat.get(unitId) ?? currentBeat;
    return Math.max(0, deathBeat - spawnBeat);
  });
  const summonRealizedValue = fixed(summonDamageDealt + summonDamageAbsorbed + summonEngagementsCreated);
  const beatsToEnd = replay.steps.filter((step) => step.kind === 'beat').length;
  const initialUnitCount = Math.max(replay.initial.units.length, 1);
  const totalTurnsTaken = [...clusterStartsByActor.values()].reduce((sum, starts) => sum + starts.length, 0);
  const finalAlive = replay.aliveCounts[replay.aliveCounts.length - 1] ?? { player: 0, enemy: 0 };

  return {
    outcome: replay.outcome,
    beatsToEnd,
    firstContactBeat,
    firstBacklineThreatBeat,
    backlineBreached: firstBacklineThreatBeat !== null,
    ownTurnsTakenPerUnit: fixed(totalTurnsTaken / initialUnitCount),
    playerSurvivors: finalAlive.player,
    enemySurvivors: finalAlive.enemy,
    damagePer100Beats: beatsToEnd === 0 ? 0 : fixed((totalDamage * 100) / beatsToEnd),
    effectiveHpPreserved: preventedByArmor,
    summonUptimeBeats: average(summonUptimes),
    summonRealizedValue,
    scalingValueRealized,
    drawRate: replay.outcome === 'draw' ? 1 : 0,
    abilitySuccessfulApplications,
    abilityNetImpact,
  };
}

export function runBattleWithMetrics(input: BattleInput): { replay: BattleReplay; metrics: SimulationMetrics } {
  const replay = resolveBattle(input);
  return {
    replay,
    metrics: extractSimulationMetrics(replay),
  };
}

function summarizeSimulationEntries(entries: SimulationSweepEntry[]): SimulationSweepResult['summary'] {
  const wins = entries.filter((entry) => entry.metrics.outcome === 'victory').length;
  const losses = entries.filter((entry) => entry.metrics.outcome === 'defeat').length;
  const draws = entries.filter((entry) => entry.metrics.outcome === 'draw').length;

  return {
    battles: entries.length,
    wins,
    losses,
    draws,
    winRate: entries.length === 0 ? 0 : fixed(wins / entries.length),
    drawRate: entries.length === 0 ? 0 : fixed(draws / entries.length),
    average: {
      beatsToEnd: average(entries.map((entry) => entry.metrics.beatsToEnd)),
      firstContactBeat: averageNullable(entries.map((entry) => entry.metrics.firstContactBeat)),
      firstBacklineThreatBeat: averageNullable(entries.map((entry) => entry.metrics.firstBacklineThreatBeat)),
      ownTurnsTakenPerUnit: average(entries.map((entry) => entry.metrics.ownTurnsTakenPerUnit)),
      summonUptimeBeats: average(entries.map((entry) => entry.metrics.summonUptimeBeats)),
      summonRealizedValue: average(entries.map((entry) => entry.metrics.summonRealizedValue)),
      scalingValueRealized: average(entries.map((entry) => entry.metrics.scalingValueRealized)),
      damagePer100Beats: average(entries.map((entry) => entry.metrics.damagePer100Beats)),
      effectiveHpPreserved: average(entries.map((entry) => entry.metrics.effectiveHpPreserved)),
    },
    percentiles: {
      beatsToEnd: buildPercentiles(entries.map((entry) => entry.metrics.beatsToEnd)),
      firstContactBeat: buildNullablePercentiles(entries.map((entry) => entry.metrics.firstContactBeat)),
      firstBacklineThreatBeat: buildNullablePercentiles(entries.map((entry) => entry.metrics.firstBacklineThreatBeat)),
    },
  };
}

export interface SweepBattleSeedsChunkedOptions {
  chunkSize?: number;
  yieldMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: {
    completed: number;
    total: number;
    partial: SimulationSweepResult;
  }) => void;
}

function waitForChunkYield(yieldMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, yieldMs);
  });
}

function runSimulationSeed(makeInput: (seed: number) => BattleInput, seed: number): SimulationSweepEntry {
  const { replay, metrics } = runBattleWithMetrics(makeInput(seed));
  return {
    seed,
    replayId: replay.id,
    metrics,
  };
}

export function sweepBattleSeeds(makeInput: (seed: number) => BattleInput, seeds: number[]): SimulationSweepResult {
  const entries = seeds.map((seed) => runSimulationSeed(makeInput, seed));
  return {
    entries,
    summary: summarizeSimulationEntries(entries),
  };
}

export async function sweepBattleSeedsChunked(
  makeInput: (seed: number) => BattleInput,
  seeds: number[],
  options: SweepBattleSeedsChunkedOptions = {},
): Promise<SimulationSweepResult> {
  const chunkSize = Math.max(1, Math.floor(options.chunkSize ?? 25));
  const yieldMs = Math.max(0, options.yieldMs ?? 0);
  const entries: SimulationSweepEntry[] = [];

  for (let index = 0; index < seeds.length; index += chunkSize) {
    if (options.signal?.aborted) {
      throw new DOMException('Battle seed sweep aborted.', 'AbortError');
    }
    const chunk = seeds.slice(index, index + chunkSize);
    chunk.forEach((seed) => {
      if (options.signal?.aborted) {
        throw new DOMException('Battle seed sweep aborted.', 'AbortError');
      }
      entries.push(runSimulationSeed(makeInput, seed));
    });
    options.onProgress?.({
      completed: entries.length,
      total: seeds.length,
      partial: { entries: [...entries], summary: summarizeSimulationEntries(entries) },
    });
    if (index + chunkSize < seeds.length && yieldMs > 0) {
      await waitForChunkYield(yieldMs);
    }
  }

  return {
    entries,
    summary: summarizeSimulationEntries(entries),
  };
}
