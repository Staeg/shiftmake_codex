import { cpus } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { createHash } from 'node:crypto';
import {
  createEmptyPermutationAggregate,
  filterEligiblePermutationUnitTypeIds,
  finalizePermutationAggregate,
  generatePermutationMatchups,
  generatePermutationTeams,
  getEligiblePermutationUnitTypeIds,
  renderPermutationReport,
  resolvePermutationTroops,
  runPermutationBatch,
  serializePermutationAggregate,
  mergePermutationAggregates,
  type FinalizedPermutationReportData,
  type PermutationAggregate,
  type PermutationMatchup,
  type PermutationTeamSize,
} from '../src/engine/permutationReport';
import type { UnitTypeId } from '../src/engine/types';

const DEFAULT_RUN_COUNT = 10;
const DEFAULT_BATCH_SIZE: Record<PermutationTeamSize, number> = {
  2: 25,
  3: 10,
};

interface ScriptOptions {
  outputDir: string;
  runCount: number;
  workerCount: number;
  resume: boolean;
  unitTypeIds?: UnitTypeId[];
}

interface CheckpointFile {
  configHash: string;
  teamSize: PermutationTeamSize;
  runCount: number;
  unitTypeIds: UnitTypeId[];
  completedMatchupKeys: string[];
  aggregate: PermutationAggregate;
}

interface BatchResult {
  aggregate: PermutationAggregate;
  results: Array<{
    matchupKey: string;
    record: {
      playerWins: number;
      enemyWins: number;
      draws: number;
      samples: number;
    };
  }>;
}

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  const workersArg = args.find((arg) => arg.startsWith('--workers='));
  const runsArg = args.find((arg) => arg.startsWith('--runs='));
  const outputDirArg = args.find((arg) => arg.startsWith('--outputDir='));
  const unitTypeIdsArg = args.find((arg) => arg.startsWith('--unitTypeIds='));

  return {
    outputDir: outputDirArg ? outputDirArg.slice('--outputDir='.length) : resolve(process.cwd(), 'balance_results'),
    runCount: runsArg ? Math.max(1, Number.parseInt(runsArg.slice('--runs='.length), 10) || DEFAULT_RUN_COUNT) : DEFAULT_RUN_COUNT,
    workerCount: workersArg ? Math.max(1, Number.parseInt(workersArg.slice('--workers='.length), 10) || 1) : 1,
    resume: args.includes('--resume'),
    ...(unitTypeIdsArg
      ? {
          unitTypeIds: unitTypeIdsArg
            .slice('--unitTypeIds='.length)
            .split(',')
            .map((unitTypeId) => unitTypeId.trim())
            .filter((unitTypeId): unitTypeId is UnitTypeId => unitTypeId.length > 0),
        }
      : {}),
  };
}

function chunkMatchups(matchups: PermutationMatchup[], batchSize: number): PermutationMatchup[][] {
  const chunks: PermutationMatchup[][] = [];
  for (let index = 0; index < matchups.length; index += batchSize) {
    chunks.push(matchups.slice(index, index + batchSize));
  }
  return chunks;
}

function createConfigHash(teamSize: PermutationTeamSize, runCount: number, unitTypeIds: UnitTypeId[]): string {
  return createHash('sha1').update(JSON.stringify({ teamSize, runCount, unitTypeIds })).digest('hex');
}

async function readCheckpoint(checkpointPath: string): Promise<CheckpointFile | null> {
  try {
    const content = await readFile(checkpointPath, 'utf8');
    return JSON.parse(content) as CheckpointFile;
  } catch {
    return null;
  }
}

async function writeCheckpoint(
  checkpointPath: string,
  configHash: string,
  teamSize: PermutationTeamSize,
  runCount: number,
  unitTypeIds: UnitTypeId[],
  completedMatchupKeys: Set<string>,
  aggregate: PermutationAggregate,
): Promise<void> {
  const payload: CheckpointFile = {
    configHash,
    teamSize,
    runCount,
    unitTypeIds,
    completedMatchupKeys: [...completedMatchupKeys].sort(),
    aggregate: serializePermutationAggregate(aggregate),
  };
  await writeFile(checkpointPath, JSON.stringify(payload, null, 2), 'utf8');
}

async function runBatchInWorker(
  workerPath: string,
  teamSize: PermutationTeamSize,
  runCount: number,
  unitTypeIds: UnitTypeId[],
  matchups: PermutationMatchup[],
): Promise<BatchResult> {
  return new Promise((resolvePromise, rejectPromise) => {
    const worker = new Worker(workerPath);
    worker.once('message', (result: BatchResult) => {
      worker.terminate().catch(() => undefined);
      resolvePromise(result);
    });
    worker.once('error', (error) => {
      worker.terminate().catch(() => undefined);
      rejectPromise(error);
    });
    worker.postMessage({
      teamSize,
      runCount,
      unitTypeIds,
      matchups,
    });
  });
}

async function processBatches(
  workerPath: string,
  teamSize: PermutationTeamSize,
  runCount: number,
  workerCount: number,
  unitTypeIds: UnitTypeId[],
  batches: PermutationMatchup[][],
  aggregate: PermutationAggregate,
  completedMatchupKeys: Set<string>,
  checkpointPath: string,
  configHash: string,
): Promise<void> {
  const pendingBatches = [...batches];
  const totalBatches = batches.length;
  const progressInterval = Math.max(1, Math.floor(totalBatches / 100));
  let completedBatches = 0;
  let useWorkers = workerCount > 1;

  const runNext = async (): Promise<void> => {
    const batch = pendingBatches.shift();
    if (!batch) {
      return;
    }

    let result: BatchResult;
    if (!useWorkers) {
      result = runPermutationBatch(teamSize, batch, runCount, unitTypeIds);
    } else {
      try {
        result = await runBatchInWorker(workerPath, teamSize, runCount, unitTypeIds, batch);
      } catch (error) {
        console.warn(`Worker startup failed for ${teamSize}v${teamSize}; falling back to serial execution.`, error);
        useWorkers = false;
        result = runPermutationBatch(teamSize, batch, runCount, unitTypeIds);
      }
    }

    mergePermutationAggregates(aggregate, result.aggregate);
    result.results.forEach((entry) => completedMatchupKeys.add(entry.matchupKey));
    completedBatches += 1;
    await writeCheckpoint(checkpointPath, configHash, teamSize, runCount, unitTypeIds, completedMatchupKeys, aggregate);
    if (completedBatches === 1 || completedBatches === totalBatches || completedBatches % progressInterval === 0) {
      console.log(
        `[${teamSize}v${teamSize}] Completed ${completedBatches}/${totalBatches} batches, ${completedMatchupKeys.size} / ${
          completedMatchupKeys.size + pendingBatches.reduce((sum, entry) => sum + entry.length, 0)
        } matchups.`,
      );
    }
    await runNext();
  };

  const runners = Array.from({ length: Math.min(useWorkers ? workerCount : 1, batches.length || 1) }, () => runNext());
  await Promise.all(runners);
}

export async function generatePermutationReportFiles(teamSize: PermutationTeamSize): Promise<FinalizedPermutationReportData> {
  const options = parseArgs();
  const outputDir = resolve(options.outputDir);
  const stem = `permutations-${teamSize}v${teamSize}`;
  const markdownPath = resolve(outputDir, `${stem}.md`);
  const jsonPath = resolve(outputDir, `${stem}.json`);
  const checkpointPath = resolve(outputDir, `${stem}.checkpoint.json`);
  const workerPath = resolve(process.cwd(), 'dist-scripts', 'scripts', 'permutationWorker.js');
  const eligibleTroops = options.unitTypeIds ? filterEligiblePermutationUnitTypeIds(options.unitTypeIds) : getEligiblePermutationUnitTypeIds();
  const configHash = createConfigHash(teamSize, options.runCount, eligibleTroops);
  const teams = generatePermutationTeams(teamSize, eligibleTroops);
  const matchups = generatePermutationMatchups(teams);
  const startedAt = Date.now();

  await mkdir(outputDir, { recursive: true });

  let aggregate = createEmptyPermutationAggregate(eligibleTroops);
  let completedMatchupKeys = new Set<string>();

  if (options.resume) {
    const checkpoint = await readCheckpoint(checkpointPath);
    if (
      checkpoint &&
      checkpoint.configHash === configHash &&
      checkpoint.teamSize === teamSize &&
      checkpoint.runCount === options.runCount &&
      JSON.stringify(checkpoint.unitTypeIds) === JSON.stringify(eligibleTroops)
    ) {
      aggregate = checkpoint.aggregate;
      completedMatchupKeys = new Set(checkpoint.completedMatchupKeys);
    }
  }

  const pendingMatchups = matchups.filter((matchup) => !completedMatchupKeys.has(matchup.key));
  const batches = chunkMatchups(pendingMatchups, DEFAULT_BATCH_SIZE[teamSize]);

  console.log(
    `Starting ${teamSize}v${teamSize} permutation report with ${eligibleTroops.length} troops, ${teams.length} teams, ${matchups.length} matchups, ${options.runCount} runs each, ${options.workerCount} worker(s).`,
  );
  if (completedMatchupKeys.size > 0) {
    console.log(`Resuming from checkpoint with ${completedMatchupKeys.size} completed matchups already recorded.`);
  }

  if (batches.length > 0) {
    await processBatches(
      workerPath,
      teamSize,
      options.runCount,
      options.workerCount,
      eligibleTroops,
      batches,
      aggregate,
      completedMatchupKeys,
      checkpointPath,
      configHash,
    );
  }

  const finalized = finalizePermutationAggregate(
    aggregate,
    teamSize,
    teams.length,
    matchups.length,
    options.runCount,
    Date.now() - startedAt,
  );
  const markdown = renderPermutationReport(finalized);

  await writeFile(markdownPath, markdown, 'utf8');
  await writeFile(jsonPath, JSON.stringify(finalized, null, 2), 'utf8');
  console.log(`Finished ${teamSize}v${teamSize} report.`);
  console.log(`Markdown: ${markdownPath}`);
  console.log(`JSON: ${jsonPath}`);
  console.log(`Checkpoint: ${checkpointPath}`);

  return finalized;
}

export function getPermutationScriptConfigPreview(teamSize: PermutationTeamSize): {
  eligibleTroopCount: number;
  teamCount: number;
  matchupCount: number;
  runCount: number;
} {
  const options = parseArgs();
  const eligibleTroops = options.unitTypeIds ? filterEligiblePermutationUnitTypeIds(options.unitTypeIds) : getEligiblePermutationUnitTypeIds();
  const teams = generatePermutationTeams(teamSize, eligibleTroops);
  const matchups = generatePermutationMatchups(teams);
  return {
    eligibleTroopCount: eligibleTroops.length,
    teamCount: teams.length,
    matchupCount: matchups.length,
    runCount: options.runCount,
  };
}
