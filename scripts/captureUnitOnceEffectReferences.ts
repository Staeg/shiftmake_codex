import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { resolveBattle } from '../src/engine/battle';
import { UNIT_ONCE_EFFECT_FIXTURES, unitOnceEffectInput } from '../src/engine/__fixtures__/unitOnceEffectInputs';

// Captured before the Milestone 5 migration; do not regenerate to hide regressions.
const directory = 'src/engine/__fixtures__/unit-once-effects';
mkdirSync(directory, {recursive: true});
for (const name of UNIT_ONCE_EFFECT_FIXTURES) {
  writeFileSync(`${directory}/${name}.json.gz`, gzipSync(JSON.stringify(resolveBattle(unitOnceEffectInput(name)))));
}
