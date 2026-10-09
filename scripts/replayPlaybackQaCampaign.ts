import { mkdirSync, writeFileSync } from 'node:fs';
import { resolveBattle } from '../src/engine/battle';
import { buildCampaignReportPayload, encodeCampaignReport } from '../src/engine/campaignReport';
import { applyCycleOutcomes, claimRaceUnlockOffer, claimOpeningTroop, getOpeningRaceOptionIds, getOpeningRaceStarterTroopUnlockIds, startNewGame, startOpeningCampaign } from '../src/engine/game';
import type { ReplayIndexEntry, StoredReplayPayload } from '../src/engine/types';
import { getRaceNativeTroopUnlockIds } from '../src/engine/unitCatalog';
import { replayReferenceInput } from './replayBaselineFixtures';
import { rivalInfoFixture } from '../src/ui/__fixtures__/rivalInfo';

let game = startNewGame(49);
const starters = getOpeningRaceStarterTroopUnlockIds(game);
const firstRace = getOpeningRaceOptionIds(game)[0]!;
const first = starters[firstRace]!;
const secondRace = getOpeningRaceOptionIds(game).find((race) => race !== firstRace && starters[race]?.split('/')[1] !== first.split('/')[1])!;
for (const troop of [first, starters[secondRace]!]) {
  game = claimOpeningTroop(game, troop);
}
game = startOpeningCampaign(game);

const replayIndex: ReplayIndexEntry[] = [];
const replayPayloads: Record<string, StoredReplayPayload> = {};
for (const name of ['ordinary', 'summons', 'long'] as const) {
  const input = { ...replayReferenceInput(name), riftId: `qa-${name}`, tier: 1 };
  const replay = resolveBattle(input);
  const payload: StoredReplayPayload = { version: 1, input };
  replayPayloads[replay.id] = payload;
  replayIndex.push({
    id: replay.id, replayId: replay.id, riftId: input.riftId, cycleNumber: 1, battleSeed: input.seed,
    outcome: replay.outcome, playerTroopLabels: replay.summary.playerTroops, mutatorIds: [],
    summary: `${replay.outcome.toUpperCase()} ${replay.summary.finalPlayerAlive}-${replay.summary.finalEnemyAlive}`,
    estimatedBytes: new TextEncoder().encode(JSON.stringify(payload)).byteLength,
  });
}
const report = buildCampaignReportPayload({
  game: { ...game, replayIndex }, replayPayloads, missingReplayIds: [], createdAt: '2026-10-08T00:00:00.000Z',
  uiContext: { screen: 'overworld', centerMode: 'rifts', selectedRiftId: null, selectedTroopId: null,
    selectedReplayId: null, currentReplayStep: null, systemMessage: null, validationMessages: [] },
});
mkdirSync('artifacts', { recursive: true });
writeFileSync('artifacts/replay-playback-qa-campaign.txt', encodeCampaignReport(report));
const gameOverReport = buildCampaignReportPayload({
  game: { ...game, phase: 'game_over', cycleNumber: 10, victoryPoints: 37, postgameDismissed: false },
  replayPayloads: {}, missingReplayIds: [], createdAt: '2026-10-08T00:00:00.000Z',
  uiContext: report.uiContext,
});
writeFileSync('artifacts/overworld-game-over-qa-campaign.txt', encodeCampaignReport(gameOverReport));
process.stdout.write(`Wrote replay playback QA campaign with ${replayIndex.length} archived battles.\n`);
process.stdout.write('Wrote constructed game-over UI fixture (37 VP, no battle simulation).\n');
const cycleThree = applyCycleOutcomes({ ...game, cycleNumber: 2, phase: 'planning' }, { records: [] }).nextState;
const withRace = claimRaceUnlockOffer(cycleThree, cycleThree.activeRaceUnlockOffer!.optionRaceIds[0]!);
const cycleSeven = applyCycleOutcomes({ ...withRace, cycleNumber: 6, phase: 'planning' }, { records: [] }).nextState;
for (const scheduledGame of [cycleThree, cycleSeven]) {
  const scheduledReport = buildCampaignReportPayload({ game: scheduledGame, replayPayloads: {}, missingReplayIds: [],
    createdAt: '2026-10-08T00:00:00.000Z', uiContext: report.uiContext });
  writeFileSync(`artifacts/scheduled-unlock-cycle-${scheduledGame.cycleNumber}-qa.txt`, encodeCampaignReport(scheduledReport));
}
process.stdout.write('Wrote engine-generated cycle 3/7 offers from constructed cycle contexts (no battle simulation).\n');
const legacyRaceId = cycleThree.activeRaceUnlockOffer!.optionRaceIds[0]!;
const legacyTroopReport = buildCampaignReportPayload({
  game: { ...cycleThree, phase: 'troop_class_unlock', activeRaceUnlockOffer: null,
    unlockedRaceIds: [...cycleThree.unlockedRaceIds, legacyRaceId],
    activeTroopClassUnlockOffer: { kind: 'troop_class_unlock', cycleNumber: 3, raceId: legacyRaceId,
      remainingChoices: 2, optionTroopUnlockIds: getRaceNativeTroopUnlockIds(legacyRaceId) } },
  replayPayloads: {}, missingReplayIds: [], createdAt: '2026-10-08T00:00:00.000Z', uiContext: report.uiContext,
});
writeFileSync('artifacts/scheduled-legacy-troop-qa.txt', encodeCampaignReport(legacyTroopReport));
process.stdout.write('Wrote constructed legacy troop-unlock UI fixture.\n');

const pagedArchive = Array.from({ length: 13 }, (_, index): ReplayIndexEntry => ({
  ...replayIndex[index % replayIndex.length]!,
  id: `qa-archive-${index}`, replayId: `qa-archive-${index}`, riftId: `qa-archive-${index}`,
  summaryOnly: true,
}));
const archiveReport = buildCampaignReportPayload({
  game: { ...game, replayIndex: [...replayIndex, ...pagedArchive] }, replayPayloads,
  missingReplayIds: pagedArchive.map(entry => entry.replayId),
  createdAt: '2026-10-08T00:00:00.000Z', uiContext: report.uiContext,
});
writeFileSync('artifacts/archive-pagination-qa.txt', encodeCampaignReport(archiveReport));
process.stdout.write('Wrote archive pagination fixture with 3 playable and 13 summary-only entries.\n');
const rivalReport = buildCampaignReportPayload({ game: rivalInfoFixture(), replayPayloads: {}, missingReplayIds: [],
  createdAt: '2026-10-09T00:00:00.000Z', uiContext: { ...report.uiContext, centerMode: 'contest' } });
writeFileSync('artifacts/rival-info-qa.txt', encodeCampaignReport(rivalReport));
process.stdout.write('Wrote constructed rival snapshot with one holding and one mobile troop.\n');
