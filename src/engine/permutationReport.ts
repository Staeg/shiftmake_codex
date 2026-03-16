import { buildSimulationBattleInput, createSeedRange, createUnitTypeCombatant, sweepBattleSeeds } from './simulationHarness';
import { fixed } from './fixed';
import { UNIT_TYPES, getUnitType } from './unitCatalog';
import type { BattleOutcome, UnitTypeId } from './types';

export type PermutationTeamSize = 2 | 3;

export interface PermutationTroopInfo {
  troopId: UnitTypeId;
  label: string;
  quantity: number;
}

export interface PermutationTeam {
  troopIds: UnitTypeId[];
  key: string;
  label: string;
}

export interface PermutationMatchup {
  key: string;
  left: PermutationTeam;
  right: PermutationTeam;
  index: number;
}

export interface PermutationRecord {
  wins: number;
  losses: number;
  draws: number;
  samples: number;
}

export interface PermutationMatrixEntry extends PermutationRecord {
  troopId: UnitTypeId;
  label: string;
  quantity: number;
  decisiveWinRate: number;
  drawRate: number;
}

export interface PermutationOverallEntry extends PermutationMatrixEntry {}

export interface PermutationTroopSection {
  troopId: UnitTypeId;
  label: string;
  quantity: number;
  entries: PermutationMatrixEntry[];
}

export interface PermutationAggregate {
  troopIds: UnitTypeId[];
  quantities: Record<string, number>;
  labels: Record<string, string>;
  overall: Record<string, PermutationRecord>;
  against: Record<string, Record<string, PermutationRecord>>;
  alongside: Record<string, Record<string, PermutationRecord>>;
}

export interface FinalizedPermutationReportData {
  mode: `permutations-${PermutationTeamSize}v${PermutationTeamSize}`;
  teamSize: PermutationTeamSize;
  runCount: number;
  troopCount: number;
  teamCount: number;
  matchupCount: number;
  elapsedMs: number;
  generatedAt: string;
  troops: PermutationTroopInfo[];
  overall: PermutationOverallEntry[];
  against: PermutationTroopSection[];
  alongside: PermutationTroopSection[];
}

export interface PermutationRunResult {
  matchupKey: string;
  record: {
    playerWins: number;
    enemyWins: number;
    draws: number;
    samples: number;
  };
}

function compareTroopIds(left: UnitTypeId, right: UnitTypeId): number {
  return left.localeCompare(right);
}

function choose<T>(items: T[], size: number, start = 0, prefix: T[] = [], result: T[][] = []): T[][] {
  if (prefix.length === size) {
    result.push([...prefix]);
    return result;
  }

  for (let index = start; index <= items.length - (size - prefix.length); index += 1) {
    prefix.push(items[index] as T);
    choose(items, size, index + 1, prefix, result);
    prefix.pop();
  }

  return result;
}

function emptyRecord(): PermutationRecord {
  return {
    wins: 0,
    losses: 0,
    draws: 0,
    samples: 0,
  };
}

function cloneRecord(record?: PermutationRecord): PermutationRecord {
  return {
    wins: record?.wins ?? 0,
    losses: record?.losses ?? 0,
    draws: record?.draws ?? 0,
    samples: record?.samples ?? 0,
  };
}

export function getEligiblePermutationUnitTypeIds(): UnitTypeId[] {
  return filterEligiblePermutationUnitTypeIds((Object.values(UNIT_TYPES) as Array<(typeof UNIT_TYPES)[string]>).map((unitType) => unitType.id));
}

export function filterEligiblePermutationUnitTypeIds(unitTypeIds: UnitTypeId[]): UnitTypeId[] {
  return (Object.values(UNIT_TYPES) as Array<(typeof UNIT_TYPES)[string]>)
    .filter((unitType) => unitTypeIds.includes(unitType.id))
    .filter((unitType) => !unitType.attributes.includes('summoned'))
    .map((unitType) => unitType.id)
    .sort(compareTroopIds);
}

export function resolvePermutationQuantity(unitTypeId: UnitTypeId): number {
  return Math.max(1, Math.round(120 / getUnitType(unitTypeId).cost));
}

export function resolvePermutationTroops(unitTypeIds: UnitTypeId[] = getEligiblePermutationUnitTypeIds()): PermutationTroopInfo[] {
  return [...unitTypeIds].sort(compareTroopIds).map((troopId) => ({
    troopId,
    label: getUnitType(troopId).label,
    quantity: resolvePermutationQuantity(troopId),
  }));
}

export function generatePermutationTeams(teamSize: PermutationTeamSize, unitTypeIds: UnitTypeId[]): PermutationTeam[] {
  return choose([...unitTypeIds].sort(compareTroopIds), teamSize).map((troopIds) => ({
    troopIds,
    key: troopIds.join('+'),
    label: troopIds.map((troopId) => getUnitType(troopId).label).join(' + '),
  }));
}

export function generatePermutationMatchups(teams: PermutationTeam[]): PermutationMatchup[] {
  const ordered = [...teams].sort((left, right) => left.key.localeCompare(right.key));
  const matchups: PermutationMatchup[] = [];

  for (let leftIndex = 0; leftIndex < ordered.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < ordered.length; rightIndex += 1) {
      const left = ordered[leftIndex] as PermutationTeam;
      const right = ordered[rightIndex] as PermutationTeam;
      matchups.push({
        key: `${left.key}__vs__${right.key}`,
        left,
        right,
        index: matchups.length,
      });
    }
  }

  return matchups;
}

export function createPermutationSeeds(teamSize: PermutationTeamSize, matchupIndex: number, runCount: number): number[] {
  return createSeedRange(runCount, teamSize * 1_000_000 + matchupIndex * runCount);
}

export function createEmptyPermutationAggregate(unitTypeIds: UnitTypeId[]): PermutationAggregate {
  const troopIds = [...unitTypeIds].sort(compareTroopIds);
  const quantities = Object.fromEntries(troopIds.map((troopId) => [troopId, resolvePermutationQuantity(troopId)]));
  const labels = Object.fromEntries(troopIds.map((troopId) => [troopId, getUnitType(troopId).label]));
  const overall = Object.fromEntries(troopIds.map((troopId) => [troopId, emptyRecord()]));
  const matrix = Object.fromEntries(
    troopIds.map((troopId) => [
      troopId,
      Object.fromEntries(troopIds.filter((otherTroopId) => otherTroopId !== troopId).map((otherTroopId) => [otherTroopId, emptyRecord()])),
    ]),
  );

  return {
    troopIds,
    quantities,
    labels,
    overall,
    against: matrix,
    alongside: Object.fromEntries(
      troopIds.map((troopId) => [
        troopId,
        Object.fromEntries(troopIds.filter((otherTroopId) => otherTroopId !== troopId).map((otherTroopId) => [otherTroopId, emptyRecord()])),
      ]),
    ),
  };
}

function applyOutcomeToSide(record: PermutationRecord, outcome: BattleOutcome, side: 'winner' | 'loser' | 'draw'): void {
  record.samples += 1;
  if (outcome === 'draw') {
    record.draws += 1;
    return;
  }
  if (side === 'winner') {
    record.wins += 1;
    return;
  }
  record.losses += 1;
}

export function applyPermutationOutcome(
  aggregate: PermutationAggregate,
  leftTroopIds: UnitTypeId[],
  rightTroopIds: UnitTypeId[],
  outcome: BattleOutcome,
): void {
  const leftWon = outcome === 'victory';
  const rightWon = outcome === 'defeat';

  leftTroopIds.forEach((troopId) => {
    const record = aggregate.overall[troopId] as PermutationRecord;
    applyOutcomeToSide(record, outcome, leftWon ? 'winner' : rightWon ? 'loser' : 'draw');
  });
  rightTroopIds.forEach((troopId) => {
    const record = aggregate.overall[troopId] as PermutationRecord;
    applyOutcomeToSide(record, outcome, rightWon ? 'winner' : leftWon ? 'loser' : 'draw');
  });

  leftTroopIds.forEach((troopId) => {
    rightTroopIds.forEach((otherTroopId) => {
      const record = aggregate.against[troopId]?.[otherTroopId];
      if (record) {
        applyOutcomeToSide(record, outcome, leftWon ? 'winner' : rightWon ? 'loser' : 'draw');
      }
    });
  });
  rightTroopIds.forEach((troopId) => {
    leftTroopIds.forEach((otherTroopId) => {
      const record = aggregate.against[troopId]?.[otherTroopId];
      if (record) {
        applyOutcomeToSide(record, outcome, rightWon ? 'winner' : leftWon ? 'loser' : 'draw');
      }
    });
  });

  leftTroopIds.forEach((troopId) => {
    leftTroopIds.forEach((teammateTroopId) => {
      if (troopId === teammateTroopId) {
        return;
      }
      const record = aggregate.alongside[troopId]?.[teammateTroopId];
      if (record) {
        applyOutcomeToSide(record, outcome, leftWon ? 'winner' : rightWon ? 'loser' : 'draw');
      }
    });
  });
  rightTroopIds.forEach((troopId) => {
    rightTroopIds.forEach((teammateTroopId) => {
      if (troopId === teammateTroopId) {
        return;
      }
      const record = aggregate.alongside[troopId]?.[teammateTroopId];
      if (record) {
        applyOutcomeToSide(record, outcome, rightWon ? 'winner' : leftWon ? 'loser' : 'draw');
      }
    });
  });
}

export function mergePermutationAggregates(base: PermutationAggregate, incoming: PermutationAggregate): PermutationAggregate {
  base.troopIds.forEach((troopId) => {
    const baseOverall = base.overall[troopId] as PermutationRecord;
    const incomingOverall = incoming.overall[troopId] as PermutationRecord;
    baseOverall.wins += incomingOverall.wins;
    baseOverall.losses += incomingOverall.losses;
    baseOverall.draws += incomingOverall.draws;
    baseOverall.samples += incomingOverall.samples;

    base.troopIds.forEach((otherTroopId) => {
      if (troopId === otherTroopId) {
        return;
      }
      const baseAgainst = base.against[troopId]?.[otherTroopId];
      const incomingAgainst = incoming.against[troopId]?.[otherTroopId];
      if (baseAgainst && incomingAgainst) {
        baseAgainst.wins += incomingAgainst.wins;
        baseAgainst.losses += incomingAgainst.losses;
        baseAgainst.draws += incomingAgainst.draws;
        baseAgainst.samples += incomingAgainst.samples;
      }

      const baseAlongside = base.alongside[troopId]?.[otherTroopId];
      const incomingAlongside = incoming.alongside[troopId]?.[otherTroopId];
      if (baseAlongside && incomingAlongside) {
        baseAlongside.wins += incomingAlongside.wins;
        baseAlongside.losses += incomingAlongside.losses;
        baseAlongside.draws += incomingAlongside.draws;
        baseAlongside.samples += incomingAlongside.samples;
      }
    });
  });

  return base;
}

function finalizeRecord(record: PermutationRecord, troopId: UnitTypeId, quantity: number): PermutationMatrixEntry {
  const decisiveSamples = record.wins + record.losses;
  return {
    troopId,
    label: getUnitType(troopId).label,
    quantity,
    wins: record.wins,
    losses: record.losses,
    draws: record.draws,
    samples: record.samples,
    decisiveWinRate: decisiveSamples === 0 ? 0 : fixed(record.wins / decisiveSamples),
    drawRate: record.samples === 0 ? 0 : fixed(record.draws / record.samples),
  };
}

function sortMatrixEntries(entries: PermutationMatrixEntry[]): PermutationMatrixEntry[] {
  return [...entries].sort(
    (left, right) =>
      right.decisiveWinRate - left.decisiveWinRate ||
      right.drawRate - left.drawRate ||
      left.troopId.localeCompare(right.troopId),
  );
}

export function finalizePermutationAggregate(
  aggregate: PermutationAggregate,
  teamSize: PermutationTeamSize,
  teamCount: number,
  matchupCount: number,
  runCount: number,
  elapsedMs: number,
  generatedAt = new Date().toISOString(),
): FinalizedPermutationReportData {
  const troops = aggregate.troopIds.map((troopId) => ({
    troopId,
    label: aggregate.labels[troopId] as string,
    quantity: aggregate.quantities[troopId] as number,
  }));

  return {
    mode: `permutations-${teamSize}v${teamSize}`,
    teamSize,
    runCount,
    troopCount: aggregate.troopIds.length,
    teamCount,
    matchupCount,
    elapsedMs,
    generatedAt,
    troops,
    overall: sortMatrixEntries(
      aggregate.troopIds.map((troopId) => finalizeRecord(aggregate.overall[troopId] as PermutationRecord, troopId, aggregate.quantities[troopId] as number)),
    ),
    against: aggregate.troopIds.map((troopId) => ({
      troopId,
      label: aggregate.labels[troopId] as string,
      quantity: aggregate.quantities[troopId] as number,
      entries: sortMatrixEntries(
        aggregate.troopIds
          .filter((otherTroopId) => otherTroopId !== troopId)
          .map((otherTroopId) => finalizeRecord(aggregate.against[troopId]?.[otherTroopId] ?? emptyRecord(), otherTroopId, aggregate.quantities[otherTroopId] as number)),
      ),
    })),
    alongside: aggregate.troopIds.map((troopId) => ({
      troopId,
      label: aggregate.labels[troopId] as string,
      quantity: aggregate.quantities[troopId] as number,
      entries: sortMatrixEntries(
        aggregate.troopIds
          .filter((otherTroopId) => otherTroopId !== troopId)
          .map((otherTroopId) => finalizeRecord(aggregate.alongside[troopId]?.[otherTroopId] ?? emptyRecord(), otherTroopId, aggregate.quantities[otherTroopId] as number)),
      ),
    })),
  };
}

function renderTable(entries: PermutationMatrixEntry[]): string[] {
  return [
    '| Troop | Qty | Win % | Draw % | Wins | Losses | Draws | Samples |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    ...entries.map(
      (entry) =>
        `| ${entry.label} | ${entry.quantity} | ${entry.decisiveWinRate.toFixed(3)} | ${entry.drawRate.toFixed(3)} | ${entry.wins} | ${entry.losses} | ${entry.draws} | ${entry.samples} |`,
    ),
  ];
}

export function renderPermutationReport(data: FinalizedPermutationReportData): string {
  return [
    `# ${data.teamSize}v${data.teamSize} Permutation Report`,
    '',
    `- Generated: ${data.generatedAt}`,
    `- Eligible troops: ${data.troopCount}`,
    `- Teams: ${data.teamCount}`,
    `- Matchups: ${data.matchupCount}`,
    `- Runs per matchup: ${data.runCount}`,
    `- Elapsed ms: ${data.elapsedMs}`,
    '',
    '## Overall troop winrates',
    '',
    ...renderTable(data.overall),
    '',
    '## Against every troop type',
    '',
    ...data.against.flatMap((section) => [
      `### ${section.label}`,
      '',
      ...renderTable(section.entries),
      '',
    ]),
    '## Alongside every troop type',
    '',
    ...data.alongside.flatMap((section) => [
      `### ${section.label}`,
      '',
      ...renderTable(section.entries),
      '',
    ]),
  ].join('\n');
}

export function runPermutationBatch(
  teamSize: PermutationTeamSize,
  matchups: PermutationMatchup[],
  runCount: number,
  unitTypeIds: UnitTypeId[],
): { aggregate: PermutationAggregate; results: PermutationRunResult[] } {
  const aggregate = createEmptyPermutationAggregate(unitTypeIds);
  const quantities = Object.fromEntries(unitTypeIds.map((troopId) => [troopId, resolvePermutationQuantity(troopId)]));
  const results = matchups.map((matchup) => {
    const sweep = sweepBattleSeeds(
      (seed) =>
        buildSimulationBattleInput(
          seed,
          matchup.left.troopIds.map((troopId, index) =>
            createUnitTypeCombatant(troopId, {
              side: 'player',
              quantity: quantities[troopId] as number,
              combatantId: `player-${matchup.index}-${index}-${troopId}`,
            }),
          ),
          matchup.right.troopIds.map((troopId, index) =>
            createUnitTypeCombatant(troopId, {
              side: 'enemy',
              quantity: quantities[troopId] as number,
              combatantId: `enemy-${matchup.index}-${index}-${troopId}`,
            }),
          ),
        ),
      createPermutationSeeds(teamSize, matchup.index, runCount),
    );

    sweep.entries.forEach((entry) => {
      applyPermutationOutcome(aggregate, matchup.left.troopIds, matchup.right.troopIds, entry.metrics.outcome);
    });

    return {
      matchupKey: matchup.key,
      record: {
        playerWins: sweep.summary.wins,
        enemyWins: sweep.summary.losses,
        draws: sweep.summary.draws,
        samples: sweep.summary.battles,
      },
    };
  });

  return { aggregate, results };
}

export function serializePermutationAggregate(aggregate: PermutationAggregate): PermutationAggregate {
  return {
    troopIds: [...aggregate.troopIds],
    quantities: Object.fromEntries(Object.entries(aggregate.quantities)),
    labels: Object.fromEntries(Object.entries(aggregate.labels)),
    overall: Object.fromEntries(aggregate.troopIds.map((troopId) => [troopId, cloneRecord(aggregate.overall[troopId])])),
    against: Object.fromEntries(
      aggregate.troopIds.map((troopId) => [
        troopId,
        Object.fromEntries(
          aggregate.troopIds
            .filter((otherTroopId) => otherTroopId !== troopId)
            .map((otherTroopId) => [otherTroopId, cloneRecord(aggregate.against[troopId]?.[otherTroopId])]),
        ),
      ]),
    ),
    alongside: Object.fromEntries(
      aggregate.troopIds.map((troopId) => [
        troopId,
        Object.fromEntries(
          aggregate.troopIds
            .filter((otherTroopId) => otherTroopId !== troopId)
            .map((otherTroopId) => [otherTroopId, cloneRecord(aggregate.alongside[troopId]?.[otherTroopId])]),
        ),
      ]),
    ),
  };
}
