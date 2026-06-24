import { parentPort } from 'node:worker_threads';
import { runPermutationBatch } from '../src/engine/permutationReport';
if (!parentPort) {
    throw new Error('Permutation worker requires a parent port.');
}
parentPort.on('message', (message) => {
    const result = runPermutationBatch(message.teamSize, message.matchups, message.runCount, message.unitClassIds);
    parentPort?.postMessage(result);
});
//# sourceMappingURL=permutationWorker.js.map