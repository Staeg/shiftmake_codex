import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { REPLAY_REFERENCE_NAMES, replayReferenceInput } from '../../scripts/replayBaselineFixtures';
import { resolveBattle } from './battle';

describe('pre-audit complete replay references', () => {
  it.each(REPLAY_REFERENCE_NAMES)('preserves %s replay data', (name) => {
    const reference = JSON.parse(gunzipSync(readFileSync(new URL(`./__fixtures__/replay-reference/${name}.json.gz`, import.meta.url))).toString());
    const replay = resolveBattle(replayReferenceInput(name));
    expect(JSON.parse(JSON.stringify(replay))).toEqual(reference);
    if (name === 'summons') {
      const initialIds = new Set(replay.initial.units.map((unit) => unit.id));
      expect(replay.steps.some((step) => step.snapshot.units.some((unit) => !initialIds.has(unit.id)))).toBe(true);
    }
    if (name === 'death-prevention') expect(replay.steps.some((step) => step.metadata?.sourceAbilityId === 'stoneblood')).toBe(true);
    if (name === 'timed-effects') expect(replay.steps.some((step) => step.metadata?.expired)).toBe(true);
    if (name === 'long') {
      expect(replay.outcome).toBe('draw');
      expect(replay.steps.filter((step) => step.kind === 'beat')).toHaveLength(1000);
    }
  });
});
