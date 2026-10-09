import { deepStrictEqual } from 'node:assert';
import { mkdirSync, writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { spawnSync } from 'node:child_process';
import { serialize } from 'node:v8';
import { resolveBattle } from '../src/engine/battle';
import { battleUnitChanged } from '../src/engine/battleUnitComparison';
import type { BattleReplay, BattleStateSnapshot, BattleStep, BattleUnit } from '../src/engine/types';
import { REPLAY_REFERENCE_NAMES, replayReferenceInput } from './replayBaselineFixtures';

const modes = ['materialized', 'shared', 'deltas', 'keyframes'] as const;
type Mode = typeof modes[number];
const names = [...REPLAY_REFERENCE_NAMES, 'army'] as const;
type Name = typeof names[number];
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
function inputFor(name: Name) {
  const input = replayReferenceInput(name === 'army' ? 'ordinary' : name);
  if (name === 'army') {
    input.playerCombatants[0]!.quantity = 12;
    input.enemyCombatants[0]!.quantity = 12;
  }
  return input;
}
function freezeUnit(unit: BattleUnit): BattleUnit {
  Object.freeze(unit.attributes);
  Object.freeze(unit.position);
  unit.occupiedHexes.forEach(Object.freeze);
  Object.freeze(unit.occupiedHexes);
  Object.freeze(unit.stats);
  Object.freeze(unit.engagedWithIds);
  return Object.freeze(unit);
}

function cloneUnit(unit: BattleUnit): BattleUnit {
  return { ...unit, attributes: [...unit.attributes], position: { ...unit.position },
    occupiedHexes: unit.occupiedHexes.map(hex => ({ ...hex })), stats: { ...unit.stats },
    engagedWithIds: [...unit.engagedWithIds] };
}
type DeltaStep = { event: Omit<BattleStep, 'snapshot'>; updates: BattleUnit[] };
interface Model {
  payload: unknown;
  steps: number;
  snapshot(index: number): BattleStateSnapshot;
  reconstruct(): BattleReplay;
}
function modelFor(replay: BattleReplay, mode: Mode): Model {
  if (mode === 'materialized' || mode === 'shared') {
    if (mode === 'materialized') {
      replay.initial.units = replay.initial.units.map(cloneUnit);
      replay.steps.forEach(step => { step.snapshot.units = step.snapshot.units.map(cloneUnit); });
    }
    return { payload: replay, steps: replay.steps.length,
      snapshot: index => index < 0 ? replay.initial : replay.steps[index]!.snapshot,
      reconstruct: () => replay };
  }
  const { steps: originals, ...base } = replay;
  const current = new Map(base.initial.units.map(unit => [unit.id, freezeUnit(unit)]));
  const steps: DeltaStep[] = [];
  const keyframes: BattleStateSnapshot[] = [];
  const interval = mode === 'keyframes' ? 64 : 0;
  originals.forEach(({ snapshot, ...event }, index) => {
    const updates = snapshot.units.filter(unit => battleUnitChanged(current.get(unit.id), unit)).map(freezeUnit);
    updates.forEach(unit => current.set(unit.id, unit));
    steps.push({ event, updates });
    if (interval && (index + 1) % interval === 0) keyframes.push({ units: [...current.values()] });
  });
  return compactModel(base, steps, keyframes, interval);
}

// A separate factory prevents V8's closure context retaining the source replay.
function compactModel(base: Omit<BattleReplay, 'steps'>, steps: DeltaStep[], keyframes: BattleStateSnapshot[], interval: number): Model {
  const snapshot = (index: number): BattleStateSnapshot => {
    if (index < 0) return base.initial;
    const frame = interval ? Math.floor((index + 1) / interval) - 1 : -1;
    const start = frame < 0 ? base.initial : keyframes[frame]!;
    const units = new Map(start.units.map(unit => [unit.id, unit]));
    for (let i = frame < 0 ? 0 : (frame + 1) * interval; i <= index; i++) {
      steps[i]!.updates.forEach(unit => units.set(unit.id, unit));
    }
    return { units: [...units.values()] };
  };
  const payload = { base, steps, keyframes, interval };
  return { payload, steps: steps.length, snapshot,
    reconstruct: () => ({ ...base, steps: steps.map(({ event }, index) => ({ ...event, snapshot: snapshot(index) })) }) };
}

if (process.argv.includes('--all')) {
  const rows = [];
  for (const name of names) {
    for (const mode of modes) {
      const result = spawnSync(process.execPath, ['--expose-gc', 'node_modules/vite-node/vite-node.mjs',
        'scripts/replayMemory.ts', '--fixture', name, '--mode', mode], { encoding: 'utf8' });
      if (result.status !== 0) throw new Error(result.stderr || result.stdout);
      rows.push(JSON.parse(result.stdout));
      process.stderr.write(`Measured ${name}/${mode}\n`);
    }
  }
  const report = { node: process.version, samples: 3, seeks: 10000, keyframeInterval: 64,
    ownership: 'shared uses the resolver; materialized reproduces unshared records; compact factories exclude source graphs',
    timing: 'Creation includes resolution plus representation conversion; heap is retained JS heap, not JSON size', rows };
  mkdirSync('artifacts', { recursive: true });
  writeFileSync('artifacts/replay-memory-baseline.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} else {
  const name = process.argv[process.argv.indexOf('--fixture') + 1] as Name;
  const mode = process.argv[process.argv.indexOf('--mode') + 1] as Mode;
  if (!names.includes(name) || !modes.includes(mode)) throw new Error('Provide --all or --fixture NAME --mode MODE');
  const gc = (globalThis as unknown as { gc?: () => void }).gc;
  if (!gc) throw new Error('Run Node with --expose-gc');
  const collect = gc;
  const create = () => modelFor(resolveBattle(inputFor(name)), mode);
  const expected = resolveBattle(inputFor(name));
  const candidate = create();
  // Includes every snapshot plus event, profile, map, outcome and metadata field.
  deepStrictEqual(candidate.reconstruct(), expected);
  const steps = candidate.steps;
  const graphBytes = serialize(candidate.payload).byteLength;
  const jsonBytes = new TextEncoder().encode(JSON.stringify(expected)).byteLength;
  const references = expected.initial.units.length + expected.steps.reduce((sum, step) => sum + step.snapshot.units.length, 0);
  const copies = name === 'army' ? 3 : 12;
  const heapSamples: number[] = [];
  const createSamples: number[] = [];
  const seekSamples: number[] = [];
  let checksum = 0;
  function measureSample() {
    collect();
    const before = process.memoryUsage().heapUsed;
    const start = performance.now();
    const retained = Array.from({ length: copies }, create);
    createSamples.push((performance.now() - start) / copies);
    collect();
    heapSamples.push((process.memoryUsage().heapUsed - before) / copies);
    const replay = retained[0]!;
    const seekStart = performance.now();
    for (let seek = 0; seek < 10000; seek++) {
      checksum += replay.snapshot((seek * 7919) % replay.steps).units.length;
    }
    seekSamples.push(performance.now() - seekStart);
  }
  for (let sample = 0; sample < 3; sample++) {
    measureSample();
    collect();
  }
  console.log(JSON.stringify({ name, mode, copies, steps, references, graphBytes, jsonBytes,
    retainedHeapBytes: Math.round(median(heapSamples)), heapSamples: heapSamples.map(Math.round),
    createMedianMs: +median(createSamples).toFixed(3), seek10000MedianMs: +median(seekSamples).toFixed(3),
    checksum, verifiedCompleteReplay: true }));
}
