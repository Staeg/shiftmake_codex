import { parentPort } from 'node:worker_threads';
import { runPermutationBatch, type PermutationMatchup, type PermutationTeamSize } from '../src/engine/permutationReport';
import type { UnitTypeId } from '../src/engine/types';

interface WorkerMessage {
  teamSize: PermutationTeamSize;
  runCount: number;
  unitTypeIds: UnitTypeId[];
  matchups: PermutationMatchup[];
}

if (!parentPort) {
  throw new Error('Permutation worker requires a parent port.');
}

parentPort.on('message', (message: WorkerMessage) => {
  const result = runPermutationBatch(message.teamSize, message.matchups, message.runCount, message.unitTypeIds);
  parentPort?.postMessage(result);
});
