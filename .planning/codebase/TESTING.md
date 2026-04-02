# Testing Patterns

**Analysis Date:** 2026-04-02

## Test Framework

**Runner:**
- Vitest `^2.0.5` is declared in `package.json` and currently executes as Vitest `2.1.9` in the local run.
- Config is implicit. No dedicated `vitest.config.*` file is present; tests inherit from the Vite setup in `vite.config.mts`.

**Assertion Library:**
- Vitest built-in `expect` API.

**Run Commands:**
```bash
npm run test        # Run all tests once via `vitest run`
npm run test:watch  # Watch mode via `vitest`
```

## Test File Organization

**Location:**
- Tests are co-located with the code they cover.
- Engine tests live beside engine modules: `src/engine/battle.test.ts`, `src/engine/campaign.test.ts`, `src/engine/simulationHarness.test.ts`.
- Store tests live beside store modules: `src/store/gameStore.test.ts`, `src/store/saveSlots.test.ts`, `src/store/replayNavigation.test.ts`.
- UI helper tests live beside pure UI helpers, not Svelte components: `src/ui/battleRecap.test.ts`.

**Naming:**
- Use `*.test.ts`.
- Suite titles mirror the target module or behavior area: `'battleRecap'`, `'campaign progression'`, `'save slot repository'`.

**Structure:**
```text
src/
  engine/
    *.ts
    *.test.ts
  store/
    *.ts
    *.test.ts
  ui/
    pure-helper.ts
    pure-helper.test.ts
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from 'vitest';
import { nextPlayableStep, previousPlayableStep } from './replayNavigation';

function makeStep(index: number, kind: BattleStep['kind']): BattleStep {
  return {
    index,
    kind,
    actorIds: [],
    targetIds: [],
    message: `${kind} ${index}`,
    snapshot: { units: [] },
  };
}

describe('replayNavigation', () => {
  it('skips beat steps while moving forward and backward', () => {
    const replay = makeReplay([makeStep(0, 'beat'), makeStep(1, 'attack')]);

    expect(nextPlayableStep(-1, replay)).toBe(1);
    expect(previousPlayableStep(1, replay)).toBe(1);
  });
});
```

**Patterns:**
- Keep arrange-act-assert inside each `it()` block with minimal indirection. `src/engine/campaign.test.ts` and `src/engine/simulationHarness.test.ts` are representative.
- Use top-level helper builders in the test file for reusable fixtures instead of external fixture folders: `makeReplay()` in `src/ui/battleRecap.test.ts`, `makeReplayPayload()` in `src/store/gameStore.test.ts`, `makeResolutionRecord()` in `src/engine/campaign.test.ts`.
- Group related assertions into multiple `describe()` blocks inside a large module test rather than splitting by every function. `src/engine/battle.test.ts` uses `troop composition`, `selection cost helpers`, `resolveDebugBattle`, and `ability mechanics`.
- Name tests by behavior and invariant, not implementation detail. The current suite uses explicit sentences such as `it('retaliate only answers normal attacks once instead of looping indefinitely', ...)` in `src/engine/battle.test.ts`.

## Mocking

**Framework:** No `vi.mock()` usage detected in repository-owned tests.

**Patterns:**
```typescript
class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new MemoryStorage(),
    configurable: true,
  });
  gameStore.initialize();
});
```

**What to Mock:**
- Browser storage boundaries with simple in-memory classes: `MemoryStorage` and `QuotaStorage` in `src/store/gameStore.test.ts`, `MemoryStorage` in `src/store/saveSlots.test.ts`.
- Input objects and replay payloads using real domain shapes rather than framework mocks: `makeReplay()` in `src/ui/battleRecap.test.ts`, `makeBattleCombatant()` in `src/engine/battle.test.ts`.

**What NOT to Mock:**
- Core engine behavior. Tests call real functions from `src/engine/battle.ts`, `src/engine/game.ts`, `src/engine/permutationReport.ts`, and `src/engine/simulationHarness.ts`.
- Store update flow. `src/store/gameStore.test.ts` exercises the real `gameStore` with a fake storage implementation rather than mocking Svelte stores.

## Fixtures and Factories

**Test Data:**
```typescript
function makeReplay(recordId: string, riftId: string, outcome: 'victory' | 'defeat'): BattleReplay {
  return {
    id: recordId,
    seed: 1,
    riftId,
    tier: 1,
    mutatorIds: [],
    mapRadius: 3,
    saturation: 3,
    initial: { units: [] },
    steps: [],
    outcome,
    troopLabels: {},
    troopProfiles: [],
    aliveCounts: [{ player: outcome === 'victory' ? 1 : 0, enemy: outcome === 'victory' ? 0 : 1, byTroopLabel: {} }],
    summary: {
      playerTroops: ['Test Troop'],
      enemyTroops: ['Enemy Troop'],
      finalPlayerAlive: outcome === 'victory' ? 1 : 0,
      finalEnemyAlive: outcome === 'victory' ? 0 : 1,
    },
  };
}
```

**Location:**
- Fixtures stay inside the owning test file near the top of the file.
- There is no shared `test/`, `fixtures/`, or `__mocks__/` directory.

## Coverage

**Requirements:** No coverage threshold or coverage command is configured in `package.json`.

**View Coverage:**
```bash
npx vitest run --coverage
```

Use this only if coverage tooling is added to the workspace. It is not part of the checked-in scripts today.

## Test Types

**Unit Tests:**
- Pure engine logic dominates the suite: `src/engine/army.test.ts`, `src/engine/battle.test.ts`, `src/engine/rift.test.ts`, `src/engine/permutationReport.test.ts`.
- These tests validate deterministic math, battle sequencing, typed data composition, and rule interactions with exact expectations.

**Integration Tests:**
- Lightweight store and persistence integration tests exist in `src/store/gameStore.test.ts` and `src/store/saveSlots.test.ts`.
- They combine multiple modules with fake storage to verify save/load behavior, replay eviction, and cycle progression.

**E2E Tests:**
- Not used.
- No browser automation or Svelte component-render tests were detected.

## Common Patterns

**Determinism Testing:**
```typescript
const first = runPermutationBatch(2, matchups, 1, ['archer', 'champion', 'militia', 'soldier']);
const second = runPermutationBatch(2, matchups, 1, ['archer', 'champion', 'militia', 'soldier']);

expect(first.results).toEqual(second.results);
```

This pattern appears in `src/engine/permutationReport.test.ts` and similar seed-based checks appear in `src/engine/battle.test.ts`.

**Boundary and Invariant Testing:**
```typescript
expect(maxTotal - minTotal).toBeLessThanOrEqual(1);
expect(Math.min(...enemyArmorHistory)).toBeLessThan(0);
expect(result.summary.wins + result.summary.losses + result.summary.draws).toBe(5);
```

Prefer asserting the rule that matters instead of reproducing the full algorithm. `src/engine/battle.test.ts` and `src/engine/simulationHarness.test.ts` follow this well.

**Store State Sampling:**
```typescript
function currentStoreState<T>(): T {
  let value: T | undefined;
  const unsubscribe = gameStore.subscribe((state) => {
    value = state as T;
  });
  unsubscribe();
  return value as T;
}
```

`src/store/gameStore.test.ts` uses this pattern to inspect Svelte store state synchronously after action calls.

**Error and Fallback Testing:**
```typescript
const result = persistReplayPayloadWrites(storage, [makeReplayIndexEntry(latestKey)], [latestWrite]);

expect(storage.getItem(latestKey)).toBeNull();
expect(result.failedReplayIds.has(latestKey)).toBe(true);
expect(result.replayIndex.find((entry) => entry.replayId === latestKey)?.summaryOnly).toBe(true);
```

Prefer asserting both the direct failure signal and the fallback state mutation. `src/store/gameStore.test.ts` is the reference.

## Current Suite Inventory

- `src/engine/army.test.ts`: troop composition and stat-scaling checks.
- `src/engine/battle.test.ts`: battle resolution, spawn rules, replay payloads, and ability runtime.
- `src/engine/campaign.test.ts`: campaign progression, offers, save round-trips, and postgame flow.
- `src/engine/permutationReport.test.ts`: permutation generation, aggregate math, and markdown sections.
- `src/engine/rift.test.ts`: Rift generation, mutator selection, and VP rules.
- `src/engine/simulationHarness.test.ts`: simulation input builders and aggregate metrics.
- `src/store/gameStore.test.ts`: replay persistence fallback and store progression behavior.
- `src/store/replayNavigation.test.ts`: playable-step navigation.
- `src/store/saveSlots.test.ts`: slot summaries, overwrite behavior, and legacy migration.
- `src/ui/battleRecap.test.ts`: replay recap aggregation helpers.

## Practical Guidance

- Add tests next to the module you change. Do not create a separate centralized test folder unless the repo structure changes.
- Favor pure-function tests first. If new UI logic can be extracted into a helper like `src/ui/battleRecap.ts`, test that helper instead of the Svelte component.
- Use explicit seeded inputs for battle and simulation logic so failures are reproducible: `seed: 17`, `seed: 22`, `createSeedRange(5, 100)`.
- Build minimal valid domain objects in fixtures and keep them local to the spec file.
- For persistence work, stub `localStorage` with small purpose-built classes instead of broad mocks.
- If you add a new store action, test the action by calling the real store method and then reading store state, following `src/store/gameStore.test.ts`.

## Current Verification Status

- `npm run test` passed on 2026-04-02.
- Result: 10 test files passed, 80 tests passed, 0 failures.

---

*Testing analysis: 2026-04-02*
