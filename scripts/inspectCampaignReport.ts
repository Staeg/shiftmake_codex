import { readFile } from 'node:fs/promises';
import { resolveBattle } from '../src/engine/battle';
import { campaignReportDecodeErrorMessage, decodeCampaignReport } from '../src/engine/campaignReport';
import { validateAssignments } from '../src/engine/game';

type CliOptions = {
  file?: string;
  report?: string;
  replayId?: string;
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
    } else if (arg === '--replay' && next) {
      options.replayId = next;
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

async function main(): Promise<void> {
  const options = parseArgs(process.argv);
  const rawReport = await readReportInput(options);
  const decoded = decodeCampaignReport(rawReport);
  if (!decoded.ok) {
    console.error(campaignReportDecodeErrorMessage(decoded.error));
    process.exitCode = 1;
    return;
  }

  const { payload } = decoded;
  const validation = validateAssignments(payload.game);
  const assignedTroops = payload.game.troops.filter((troop) => troop.assignmentRiftId);
  const discoveredRifts = payload.game.openRifts.filter((rift) => rift.state === 'discovered');

  console.log(`reportId: ${payload.reportId}`);
  console.log(`createdAt: ${payload.createdAt}`);
  console.log(`campaignSeed: ${payload.summary.campaignSeed}`);
  console.log(`cycle: ${payload.summary.cycleNumber}`);
  console.log(`phase: ${payload.summary.phase}`);
  console.log(`victoryPoints: ${payload.summary.victoryPoints}`);
  console.log(`troops: ${payload.summary.troopCount}`);
  console.log(`openRifts: ${discoveredRifts.length}`);
  console.log(`archiveEntries: ${payload.summary.replayIndexCount}`);
  console.log(`replayPayloads: ${payload.summary.replayPayloadCount}`);
  console.log(`missingReplays: ${payload.missingReplayIds.join(', ') || '(none)'}`);
  console.log(`ui: ${payload.uiContext.screen} / ${payload.uiContext.centerMode}`);
  console.log(`selected: rift=${payload.uiContext.selectedRiftId ?? '(none)'} troop=${payload.uiContext.selectedTroopId ?? '(none)'} replay=${payload.uiContext.selectedReplayId ?? '(none)'}`);
  console.log(`validation: ${validation.ok ? 'ok' : validation.issues.length}`);
  validation.issues.forEach((issue) => console.log(`  [${issue.kind}] ${issue.message}`));
  console.log(`assignedTroops: ${assignedTroops.length}`);
  assignedTroops.forEach((troop) => console.log(`  ${troop.id} -> ${troop.assignmentRiftId}`));
  console.log(`offers: troop=${payload.game.activeTroopOffer ? payload.game.activeTroopOffer.optionTroopUnlockIds.join(', ') : '(none)'} upgrade=${payload.game.activeUpgradeOffer ? payload.game.activeUpgradeOffer.optionUpgradeIds.join(', ') : '(none)'}`);
  console.log(`upgrades: race=${payload.game.raceUpgradeIds.join(', ') || '(none)'} troopClass=${payload.game.troopClassUpgradeIds.join(', ') || '(none)'}`);

  if (options.replayId) {
    const replayPayload = payload.replayPayloads[options.replayId];
    if (!replayPayload) {
      console.log(`replay ${options.replayId}: missing from campaign report`);
      return;
    }
    const replay = resolveBattle(replayPayload.input);
    console.log(`replay ${options.replayId}:`);
    console.log(`  resolvedId: ${replay.id}`);
    console.log(`  seed: ${replay.seed}`);
    console.log(`  outcome: ${replay.outcome}`);
    console.log(`  steps: ${replay.steps.length}`);
    console.log(`  player: ${replay.summary.playerTroops.join(', ') || '(none)'}`);
    console.log(`  enemy: ${replay.summary.enemyTroops.join(', ') || '(none)'}`);
  }
}

void main();
