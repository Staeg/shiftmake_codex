import { parentPort } from 'node:worker_threads';
import { runPermutationBatch, type PermutationMatchup, type PermutationTeamSize } from '../src/engine/permutationReport';
import type { UnitClassId } from '../src/engine/types';

interface WorkerMessage {
  teamSize: PermutationTeamSize;
  runCount: number;
  unitClassIds: UnitClassId[];
  matchups: PermutationMatchup[];
}

if (!parentPort) {
  throw new Error('Permutation worker requires a parent port.');
}

parentPort.on('message', (message: WorkerMessage) => {
  const result = runPermutationBatch(message.teamSize, message.matchups, message.runCount, message.unitClassIds);
  parentPort?.postMessage(result);
});
