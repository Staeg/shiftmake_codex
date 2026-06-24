import { readFile } from 'node:fs/promises';
import { battleReportDecodeErrorMessage, decodeBattleReport, replayFromBattleReport } from '../src/engine/battleReport';
import type { BattleReplay, BattleStep, BattleUnit } from '../src/engine/types';

type CliOptions = {
  file?: string;
  report?: string;
  step?: number;
};

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {};
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];
    if (arg === '--file' && next) {
      options.file = next;
      index += 1;
    } else if (arg === '--report' && next) {
      options.report = next;
      index += 1;
    } else if (arg === '--step' && next) {
      options.step = Number.parseInt(next, 10);
      index += 1;
    }
  }
  return options;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.from(chunks.map((chunk) => chunk.toString()).join(''), 'utf8').toString();
}

async function readReportInput(options: CliOptions): Promise<string> {
  if (options.report) {
    return options.report;
  }
  if (options.file) {
    return readFile(options.file, 'utf8');
  }
  return readStdin();
}

function describeUnit(unit: BattleUnit): string {
  return [
    unit.id,
    `${unit.side} ${unit.troopLabel}`,
    `${unit.raceId}/${unit.unitClassId}`,
    `hp=${unit.hp}/${unit.maxHp}`,
    `alive=${unit.alive}`,
    `pos=${unit.position.q},${unit.position.r}`,
    `initiative=${unit.initiative}`,
  ].join(' | ');
}

function printStep(replay: BattleReplay, stepIndex: number): void {
  const step = replay.steps[stepIndex] as BattleStep | undefined;
  if (!step) {
    console.log(`Step ${stepIndex} is outside replay range 0-${Math.max(0, replay.steps.length - 1)}.`);
    return;
  }

  const previousSnapshot = stepIndex > 0 ? replay.steps[stepIndex - 1]?.snapshot ?? replay.initial : replay.initial;
  const relevantIds = new Set([...step.actorIds, ...step.targetIds]);
  const previousUnits = previousSnapshot.units.filter((unit) => relevantIds.has(unit.id));
  const nextUnits = step.snapshot.units.filter((unit) => relevantIds.has(unit.id));

  console.log('');
  console.log(`Step ${stepIndex}`);
  console.log(`kind: ${step.kind}`);
  console.log(`message: ${step.message}`);
  console.log(`actors: ${step.actorIds.join(', ') || '(none)'}`);
  console.log(`targets: ${step.targetIds.join(', ') || '(none)'}`);
  if (step.metadata) {
    console.log(`metadata: ${JSON.stringify(step.metadata, null, 2)}`);
  }
  console.log('before:');
  previousUnits.forEach((unit) => console.log(`  ${describeUnit(unit)}`));
  console.log('after:');
  nextUnits.forEach((unit) => console.log(`  ${describeUnit(unit)}`));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);
  const rawReport = await readReportInput(options);
  const decoded = decodeBattleReport(rawReport);
  if (!decoded.ok) {
    console.error(battleReportDecodeErrorMessage(decoded.error));
    process.exitCode = 1;
    return;
  }

  const replay = replayFromBattleReport(decoded.payload);
  console.log(`reportId: ${decoded.payload.reportId}`);
  console.log(`createdAt: ${decoded.payload.createdAt}`);
  console.log(`replayId: ${replay.id}`);
  console.log(`seed: ${replay.seed}`);
  console.log(`riftId: ${replay.riftId ?? '(none)'}`);
  console.log(`outcome: ${replay.outcome}`);
  console.log(`steps: ${replay.steps.length}`);
  console.log(`player: ${replay.summary.playerTroops.join(', ') || '(none)'}`);
  console.log(`enemy: ${replay.summary.enemyTroops.join(', ') || '(none)'}`);
  console.log(`diagnostics: ${decoded.payload.diagnostics.length}`);
  decoded.payload.diagnostics.forEach((diagnostic) => {
    console.log(`  [${diagnostic.severity}] ${diagnostic.source}/${diagnostic.code}: ${diagnostic.message}`);
  });

  if (typeof options.step === 'number' && Number.isFinite(options.step)) {
    printStep(replay, options.step);
  } else if (typeof decoded.payload.summary.currentStep === 'number') {
    printStep(replay, decoded.payload.summary.currentStep);
  }
}

void main();
