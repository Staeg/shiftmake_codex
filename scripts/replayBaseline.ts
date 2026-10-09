import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { performance } from 'node:perf_hooks';
import { resolveBattle } from '../src/engine/battle';
import { nextPlayableStep, previousPlayableStep } from '../src/store/replayNavigation';
import { REPLAY_REFERENCE_NAMES, replayReferenceInput } from './replayBaselineFixtures';

const capture = process.argv.includes('--capture');
const directory = 'src/engine/__fixtures__/replay-reference';
if (capture) mkdirSync(directory, { recursive: true });
const median = (samples: number[]) => [...samples].sort((a, b) => a - b)[Math.floor(samples.length / 2)]!;
const rows = [];
for (const name of REPLAY_REFERENCE_NAMES) {
  const input = replayReferenceInput(name);
  const payload = JSON.stringify({ version: 1, input });
  resolveBattle(input);
  const resolveTimes: number[] = [];
  const openTimes: number[] = [];
  for (let run = 0; run < 3; run += 1) {
    let start = performance.now();
    resolveBattle(input);
    resolveTimes.push(performance.now() - start);
    start = performance.now();
    resolveBattle(JSON.parse(payload).input);
    openTimes.push(performance.now() - start);
  }
  const replay = resolveBattle(input);
  const serialized = JSON.stringify(replay);
  if (capture) writeFileSync(`${directory}/${name}.json.gz`, gzipSync(serialized));
  let checksum = 0;
  const start = performance.now();
  for (let index = 0; index < 10_000; index += 1) {
    const position = (index * 7919) % replay.steps.length;
    checksum += replay.steps[position]!.snapshot.units.length;
    checksum += nextPlayableStep(position, replay) + previousPlayableStep(position, replay);
  }
  rows.push({ name, outcome: replay.outcome, steps: replay.steps.length,
    replayJsonBytes: new TextEncoder().encode(serialized).length, inputJsonBytes: new TextEncoder().encode(payload).length,
    resolveMedianMs: +median(resolveTimes).toFixed(3), openMedianMs: +median(openTimes).toFixed(3),
    seek10000Ms: +(performance.now() - start).toFixed(3), checksum });
}
console.log(JSON.stringify({ node: process.version, samples: 3, warmups: 1, rows }, null, 2));
