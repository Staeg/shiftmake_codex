import { resolveBattle } from '../../engine/battle';
import type { ReplayIndexEntry, StoredReplayPayload } from '../../engine/types';
import { replayReferenceInput } from '../../../scripts/replayBaselineFixtures';

export function archiveFixture() {
  const input = replayReferenceInput('ordinary');
  const replay = resolveBattle(input);
  const payload: StoredReplayPayload = { version: 1, input };
  const entry: ReplayIndexEntry = { id: replay.id, replayId: replay.id, riftId: null,
    cycleNumber: 1, battleSeed: input.seed, outcome: replay.outcome,
    playerTroopLabels: replay.summary.playerTroops, mutatorIds: [], summary: replay.outcome, estimatedBytes: 0 };
  return { input, replay, payload, entry };
}

export function archiveEntries(count: number): ReplayIndexEntry[] {
  return Array.from({ length: count }, (_, index) => ({ id: `qa-${index}`, replayId: `qa-${index}`,
    riftId: null, cycleNumber: 1, battleSeed: index, outcome: 'victory', playerTroopLabels: [],
    mutatorIds: [], summary: 'Victory', estimatedBytes: 0 }));
}
