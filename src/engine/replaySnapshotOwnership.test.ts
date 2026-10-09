import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import type { BattleReplay } from './types';
import { REPLAY_REFERENCE_NAMES, replayReferenceInput } from '../../scripts/replayBaselineFixtures';
import { resolveBattle } from './battle';
import { battleUnitChanged } from './battleUnitComparison';

describe('replay snapshot ownership', () => {
  it.each(REPLAY_REFERENCE_NAMES)('shares only unchanged, deeply frozen %s units', (name) => {
    const replay = resolveBattle(replayReferenceInput(name));
    const snapshots = [replay.initial, ...replay.steps.map(step => step.snapshot)];
    let shared = 0;
    for (let index = 0; index < snapshots.length; index++) {
      const snapshot = snapshots[index]!;
      const previous = index ? snapshots[index - 1]! : null;
      if (previous) expect(snapshot.units).not.toBe(previous.units);
      for (const unit of snapshot.units) {
        for (const value of [unit, unit.stats, unit.position, unit.attributes,
          unit.engagedWithIds, unit.occupiedHexes, ...unit.occupiedHexes]) {
          expect(Object.isFrozen(value)).toBe(true);
        }
        const prior = previous?.units.find(candidate => candidate.id === unit.id);
        if (prior && !battleUnitChanged(prior, unit)) {
          expect(unit).toBe(prior);
          shared++;
        } else if (prior) {
          expect(unit).not.toBe(prior);
        }
      }
    }
    expect(shared).toBeGreaterThan(0);
  });

  it.each(REPLAY_REFERENCE_NAMES)('preserves %s snapshots under forward, backward and random access', (name) => {
    const replay = resolveBattle(replayReferenceInput(name));
    const reference = JSON.parse(gunzipSync(readFileSync(new URL(
      `./__fixtures__/replay-reference/${name}.json.gz`, import.meta.url))).toString()) as BattleReplay;
    const order = replay.steps.map((_, index) => index);
    for (const index of [...order, ...[...order].reverse(), ...order.map(index => (index * 7919) % order.length)]) {
      expect(replay.steps[index]!.snapshot).toEqual(reference.steps[index]!.snapshot);
    }
    expect(replay.initial).toEqual(reference.initial);
  });

  it('rejects nested mutations without changing history or another resolution', () => {
    const input = replayReferenceInput('summons');
    const inputBefore = JSON.stringify(input);
    const replay = resolveBattle(input);
    const before = JSON.stringify(replay);
    const unit = replay.initial.units[0]!;
    for (const mutate of [
      () => { unit.hp = 0; },
      () => { unit.position.q = 999; },
      () => { unit.stats.health = 0; },
      () => { unit.occupiedHexes[0]!.r = 999; },
      () => unit.occupiedHexes.push({ q: 999, r: 999 }),
      () => unit.attributes.push('changed'),
      () => unit.engagedWithIds.push('changed'),
    ]) expect(mutate).toThrow(TypeError);
    expect(JSON.stringify(replay)).toBe(before);
    expect(JSON.stringify(input)).toBe(inputBefore);
    const other = resolveBattle(input);
    expect(other.initial.units[0]).not.toBe(unit);
    expect(JSON.stringify(other)).toBe(before);
    const historicalArray = replay.initial.units;
    historicalArray.pop();
    expect(replay.steps[0]!.snapshot.units.length).toBeGreaterThan(historicalArray.length);
  });
});
