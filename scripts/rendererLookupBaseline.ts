import { deepStrictEqual } from 'node:assert';
import { performance } from 'node:perf_hooks';
import { resolveBattle } from '../src/engine/battle';
import type { BattleReplay, BattleUnit } from '../src/engine/types';
import { REPLAY_REFERENCE_NAMES, replayReferenceInput } from './replayBaselineFixtures';

type Lookup = (units: BattleUnit[], id: string) => BattleUnit | undefined;
const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

// Mirrors only playStepEffect's ID lookup branches, not Pixi/layout/frame work.
function traverse(replay: BattleReplay, lookup: Lookup): string[] {
  const found: string[] = [];
  const remember = (unit: BattleUnit | undefined) => { if (unit) found.push(unit.id); };
  replay.steps.forEach((step, index) => {
    const prev = index ? replay.steps[index - 1]!.snapshot.units : replay.initial.units;
    const next = step.snapshot.units;
    if (step.kind === 'death') {
      step.targetIds.forEach(id => remember(lookup(prev, id) ?? lookup(next, id)));
    } else if (step.kind === 'attack') {
      const actor = lookup(prev, step.actorIds[0] ?? '') ?? lookup(next, step.actorIds[0] ?? '');
      if (!actor) return;
      remember(actor);
      step.targetIds.forEach(id => remember(lookup(prev, id) ?? lookup(next, id)));
    } else if (step.kind === 'move') {
      remember(lookup(prev, step.actorIds[0] ?? ''));
      remember(lookup(next, step.actorIds[0] ?? ''));
    }
  });
  return found;
}

function mapLookup(): Lookup {
  const cache = new WeakMap<BattleUnit[], Map<string, BattleUnit>>();
  return (units, id) => {
    let map = cache.get(units);
    if (!map) {
      map = new Map(units.map(unit => [unit.id, unit]));
      cache.set(units, map);
    }
    return map.get(id);
  };
}

const rows = [...REPLAY_REFERENCE_NAMES, 'army' as const].map(name => {
  const input = replayReferenceInput(name === 'army' ? 'ordinary' : name);
  if (name === 'army') {
    input.playerCombatants[0]!.quantity = 12;
    input.enemyCombatants[0]!.quantity = 12;
  }
  const replay = resolveBattle(input);
  const scan: Lookup = (units, id) => units.find(unit => unit.id === id);
  const reference = traverse(replay, scan);
  deepStrictEqual(traverse(replay, mapLookup()), reference);
  let calls = 0;
  let comparisons = 0;
  traverse(replay, (units, id) => {
    calls++;
    return units.find(unit => { comparisons++; return unit.id === id; });
  });
  const timings = ['scan', 'cold-map', 'warm-map'].map(mode => {
    const samples: number[] = [];
    let checksum = 0;
    const warm = mapLookup();
    traverse(replay, warm);
    for (let sample = 0; sample < 7; sample++) {
      const start = performance.now();
      for (let pass = 0; pass < 100; pass++) {
        checksum += traverse(replay, mode === 'scan' ? scan : mode === 'cold-map' ? mapLookup() : warm).length;
      }
      samples.push((performance.now() - start) / 100);
    }
    return { mode, medianTraversalMs: +median(samples).toFixed(4), checksum };
  });
  return { name, steps: replay.steps.length, calls, comparisons, timings, verifiedLookupResults: true };
});
console.log(JSON.stringify({ node: process.version, samples: 7, passes: 100,
  scope: 'Sequential renderer effect ID query model; excludes resolve, GPU, layout and animation', rows }, null, 2));
