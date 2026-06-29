# Codebase Audit

Audit date: 2026-06-29. No code was changed — findings only.

---

## 1. Dead / Deprecated Code

### 1.1 `makeAbility` is a no-op pass-through
**File:** `src/engine/unitCatalog.ts`, lines ~26–28

```ts
function makeAbility(definition: AbilityDefinition): AbilityDefinition {
  return definition;
}
```

Called in ~98 places. The function adds zero transformation. Either give it real validation behaviour or remove it and use object literals directly.

---

### 1.2 `VICTORY_RECOVERY` and `DEFEAT_RECOVERY` are both `1`
**File:** `src/engine/army.ts`, lines ~30–31

```ts
export const VICTORY_RECOVERY = 1;
export const DEFEAT_RECOVERY = 1;
```

Both constants are identical, making the distinction meaningless. All call sites in `game.ts` behave the same for victory and defeat. Consolidate to a single `BATTLE_RECOVERY = 1` or give them different values to match design intent.

---

### 1.3 `PermutationOverallEntry` is an empty alias
**File:** `src/engine/permutationReport.ts`, line ~42

```ts
export interface PermutationOverallEntry extends PermutationMatrixEntry {}
```

Structurally identical to `PermutationMatrixEntry` with no additional properties. Remove and use `PermutationMatrixEntry` directly.

---

### 1.4 `REPLAY_IDENTITY_KEY` is defined but never called
**File:** `src/store/gameStore.ts`, line ~150

```ts
const REPLAY_IDENTITY_KEY = (replayId: string): string => replayId;
```

An arrow function that returns its argument unchanged, with no call sites found. Dead code.

---

### 1.5 Legacy save-key helpers accumulate without a removal plan
**File:** `src/store/saveSlots.ts`, lines ~58–82

Four legacy prefix functions (`getLegacyUnversionedReplayPrefix`, `getLegacyV30ReplayPrefix`, `getLegacyV2ReplayPrefix`, `getLegacyV3ReplayPrefix`) exist alongside the current `REPLAY_STORAGE_VERSION = 'v3.19'`. Every load scans all five prefixes per slot. Without a concrete plan to drop old-format support, these will stay indefinitely. Consider an explicit migration-and-delete pass at startup so the legacy readers can eventually be removed.

---

### 1.6 `isKnownTroopClassUpgradeId` is duplicated in two files
**Files:** `src/engine/ladder.ts` lines ~35–45, `src/engine/save.ts` lines ~75–88

Both contain near-identical try/catch implementations. The canonical version belongs in `src/engine/unitCatalog.ts` where the catalog lives, exported and shared.

---

### 1.7 `APP_VERSION` is hardcoded to `'0.1.0'` in two report builders
**Files:** `src/engine/battleReport.ts` line ~7, `src/engine/campaignReport.ts` line ~7

Every generated report claims to be version 0.1.0, making version-based bug triage useless. Inject via Vite's `define` or import from `package.json`.

---

### 1.8 `buildEqualCostBundle` is production dead code
**File:** `src/engine/simulationHarness.ts**, lines ~332–395

This O(n²) brute-force bundle finder is exported from the harness but only referenced in `simulationHarness.test.ts`. Move it into the test file or a test-only utility module.

---

### 1.9 `'chaff'` role normalization in `compat.ts` may be permanently dead
**File:** `src/engine/compat.ts`, lines ~5–8

The `'chaff'` → `'pusher'` rename migration was presumably completed before the current save version (v3). If no live data from before the rename can still appear, this branch is dead. Confirm and remove.

---

### 1.10 `uniqueInOrder` is a trivial one-liner wrapper
**File:** `src/engine/multiplayerContest.ts**, line ~338

```ts
function uniqueInOrder<T>(items: T[]): T[] {
  return [...new Set(items)];
}
```

No value over inlining `[...new Set(items)]` at the call site. If kept as a utility, move it to a shared helpers module.

---

### 1.11 `InternalUnit.hexedStacks` may be unimplemented
**File:** `src/engine/battle.ts**, line ~136

The field exists on `InternalUnit` and is initialised to `0` in `createPlacedUnit`, but no ability with `id === 'hexed'` or any code that increments `hexedStacks` was found. Either the ability is in an unread portion of `unitCatalog.ts` (verify) or this is a speculative field for an unimplemented feature that should be removed.

---

### 1.12 `LEGACY_SAVE_KEY = 'shiftmake:save:v1'` still read at startup
**File:** `src/store/saveSlots.ts**, line ~43

If no users with v1 saves are expected, the `migrateLegacySave` path, `LEGACY_SAVE_KEY`, and `LEGACY_REPLAY_PREFIX` constants can all be removed, simplifying startup.

---

## 2. Bugs / Concerning Logic

### 2.1 `writeTutorialCycleRewindGame` double-serializes state
**File:** `src/store/gameStore.ts**, lines ~332–334

```ts
localStorage.setItem(TUTORIAL_CYCLE_REWIND_KEY, JSON.stringify(serializeGameState(game)));
```

`serializeGameState` already returns a `string` (it calls `JSON.stringify` internally). Wrapping it in another `JSON.stringify` produces a doubly-escaped JSON string. The corresponding reader calls `JSON.parse` → `deserializeGameState`, which happens to cancel the double-encode — but only by accident. Any change to `serializeGameState`'s return type would silently corrupt tutorial rewind saves. Fix: `localStorage.setItem(key, serializeGameState(game))`.

---

### 2.2 `clearStaleEngagements` mutates a `Set` while iterating a sibling `Set`
**File:** `src/engine/battle.ts**, lines ~1204–1214

```ts
unit.engagedWith.forEach((enemyId) => {
  const enemy = state.units.get(enemyId);
  if (!enemy?.alive ...) {
    unit.engagedWith.delete(enemyId);      // safe — own set
    enemy?.engagedWith.delete(unit.id);    // modifies enemy's set, which may be mid-iteration
  }
});
```

Deleting from `enemy.engagedWith` while `state.units.forEach` may later iterate that enemy and call `forEach` on the same set can produce missed-deletion bugs. Collect removals in a scratch list and apply after the traversal.

---

### 2.3 `preventDeath` constructs a fresh `RuntimeAbilityState`, bypassing live ability tracking
**File:** `src/engine/battle.ts**, lines ~1480–1485

```ts
healUnitToHp(state, protectingPriest, target,
  createRuntimeAbilityState(getAbility('mercy-before-dawn')), ...);
```

A brand-new state is constructed here, ignoring the Priest's actual `resolvedAbilities` entry (which tracks `usesRemaining`, `triggerCount`, etc.). If the ability has limited uses or stores per-battle trigger data, the trigger won't deduct from the live counter. The correct reference is `protectingPriest.resolvedAbilities.find(r => r.definition.id === 'mercy-before-dawn')`.

---

### 2.4 Draft choice loop guard of 20 can incorrectly reject legal submissions
**File:** `src/engine/multiplayerContest.ts**, lines ~439–479

```ts
if (guard > 20) {
  return rejectSubmission('Too many draft choices were submitted.');
}
```

A player who bought 10 troops and 10 upgrades legally requires up to 20 loop iterations. The guard should be at least `Math.max(troopChoices.length + upgradeChoices.length + 5, 30)` or simply a higher constant.

---

### 2.5 Multiplayer cycle animation uses `tier` as `victoryPoints` and an empty `recoveryMap`
**File:** `src/store/gameStore.ts**, lines ~186–195

```ts
victoryPoints: payload.input.tier ?? 0,   // tier ≠ VP in general
recoveryMap: {},                           // always empty → troops not recovered
```

High-tier rifts can award VP values that differ from their tier number. Also, `recoveryMap: {}` means no troop recovery is applied when building the animation from a server payload, potentially leaving troops in an incorrectly assigned state.

---

### 2.6 `isKnownTroopClassUpgradeId` uses `try/catch` as normal control flow
**Files:** `src/engine/save.ts` ~75–88, `src/engine/ladder.ts` ~35–45

```ts
try { getTroopClassUpgrade(value); return true; } catch { return false; }
```

Throwing and catching as a membership test deoptimises the JIT on the miss path. Replace with `value in TROOP_CLASS_UPGRADES` (or equivalent direct catalog check).

---

### 2.7 `formatPossessive` produces incorrect English for names ending in `'s'`
**File:** `src/engine/battle.ts**, line ~1341

```ts
function formatPossessive(label: string): string { return `${label}'s`; }
```

"Trolls's" instead of "Trolls'". Should be `label.endsWith('s') ? \`${label}'\` : \`${label}'s\``.

---

### 2.8 `deserializeGameState(JSON.stringify(parsed.game))` round-trips through JSON unnecessarily
**File:** `src/engine/campaignReport.ts**, line ~127

`parsed.game` was just decoded from JSON. Passing it back through `JSON.stringify` then into a function that calls `JSON.parse` is redundant serialization. `deserializeGameState` should accept a plain object, or a separate normalisation entry point should be exposed.

---

### 2.9 `expandedMapHexes` generates a bounding rectangle, not a valid hex grid
**File:** `src/engine/battle.ts**, lines ~511–529

```ts
for (let q = minQ; q <= maxQ; q += 1)
  for (let r = minR; r <= maxR; r += 1)
    next.add(hexKey({ q, r }));
```

This expands to all (q, r) pairs in a rectangle, which includes geometrically invalid axial hex coordinates far outside the battlefield. If emergency overflow placement is the intent, a comment explaining that is needed.

---

### 2.10 `rosterCanFitOpenRifts` ignores occupied contest rift slots
**File:** `src/engine/game.ts**, lines ~385–412

The function filters for `state === 'discovered'` rifts only. In contest mode, already-occupied rift slots also constrain troop assignments (same-race rule). A troop unlock violating the constraint for an occupied slot is not caught, potentially producing invalid roster states that surface only at validation time.

---

### 2.11 `REQUIRED_ABILITY_VERIFICATION_IDS` has no exhaustiveness check against scenario `coveredAbilityIds`
**File:** `src/engine/abilityVerificationCatalog.ts**, lines ~36–61

24 required abilities are listed, but there is no compile-time or runtime assertion that every required ID has a matching scenario entry. Adding or removing an ability without updating the other side is a silent gap. A runtime check in the test suite (`coveredAbilityIds` set ⊇ `REQUIRED_ABILITY_VERIFICATION_IDS`) would catch this.

---

## 3. Performance Issues

### 3.1 `cloneSnapshot` deep-copies all units on every battle step
**File:** `src/engine/battle.ts**, lines ~685–709

For a battle with 40 units and 2,000 steps this produces ~80,000 object spreads and ~240,000 array copies. Most snapshots are only read during replay playback. A structural-sharing / copy-on-write approach — snapshot only mutated units per step, reconstruct full state on read — would substantially reduce allocation pressure for long battles.

---

### 3.2 `getAliveUnits` does a full linear scan on every call
**File:** `src/engine/battle.ts**, lines ~1182–1184

```ts
function getAliveUnits(state, side?): InternalUnit[] {
  return [...state.units.values()].filter(u => u.alive && (!side || u.side === side));
}
```

Called dozens of times per beat from movement, engagement, targeting, and ability resolution. A pair of `Set<UnitId>` alive-unit indexes (one per side), updated on each death, would make the common side-filtered case O(1) instead of O(n).

---

### 3.3 `sortedMapAnchors` re-sorts the same list on every combatant placement
**File:** `src/engine/battle.ts**, lines ~297–306

`buildCandidatePlacements` calls `.sort(...)` on the map hex list for each combatant and for each placement mode (strict and relaxed). The list is the same for every combatant on the same side. Cache the sorted anchors per `(mapHexes, side)` pair.

---

### 3.4 `footprintDistance` has no early exit
**File:** `src/engine/hex.ts**, lines ~115–126

```ts
left.forEach(leftHex => right.forEach(rightHex => {
  best = Math.min(best, hexDistance(leftHex, rightHex));
}));
```

Called for every movement candidate, engagement check, and placement attempt. Short-circuiting when `best === 0` (overlap) or `best === 1` (adjacent) would eliminate most comparisons for the common cases.

---

### 3.5 `initializeUnits` can attempt up to ~10,000 placements in pathological cases
**File:** `src/engine/battle.ts**, lines ~1168–1180

The outer radius retry loop runs up to 101 times; the inner placement loop also retries up to 100 times per radius. No timeout or logging surfaces when many retries occur. Large battles with many size-4/5 units could cause noticeable startup latency with no diagnostic output.

---

### 3.6 `sweepBattleSeeds` blocks the event loop from the main thread
**File:** `src/engine/simulationHarness.ts**, lines ~690–730

`runPermutationBatch` calls `sweepBattleSeeds` for every matchup without yield points or chunking. The AI worker (`contestAiWorker.ts`) runs off-thread, but the permutation runner appears to be called from the main thread, freezing the UI for the full sweep duration.

---

### 3.7 `buildContestAiPlanKey` serializes full `ResolvedCombatantDefinition` objects as the cache key
**File:** `src/store/contestAiPlanner.ts**, lines ~21–38

The key includes the full `enemyArmy` of every open rift, which contains nested `AbilityDefinition[]` arrays. The resulting string can be tens of KB. A short hash of the seed, tier, mutatorIds, and guardian IDs would suffice.

---

## 4. Refactor Opportunities

### 4.1 Four upgrade-effect functions are pairwise duplicates
**File:** `src/engine/army.ts**, lines ~93–320

`applyRaceUpgradeEffects` / `applyRaceUpgradeEffectsDetailed` and `applyTroopClassUpgradeEffects` / `applyTroopClassUpgradeEffectsDetailed` share identical loop structure and branch logic. The only difference is that the `Detailed` variants record `statContributions` deltas. Merge each pair: the plain variant should call the detailed variant and discard the breakdowns.

---

### 4.2 `resolveTroopCombatant` runs the full upgrade pipeline twice
**File:** `src/engine/army.ts**, lines ~446–481

`resolveTroopCombatant` applies upgrade effects and then calls `getResolvedStatBreakdowns`, which independently re-runs `composeBaseTroopDefinition`, `applyTierScaling`, and both upgrade functions for the same troop. All four operations execute twice per combatant resolution. Compute the `Detailed` variants once and extract both final stats and breakdowns from a single pass.

---

### 4.3 `filterEligiblePermutationUnitClassIds` traverses `UNIT_CLASSES` twice
**File:** `src/engine/permutationReport.ts**, lines ~122–132

`getEligiblePermutationUnitClassIds` passes all IDs from `UNIT_CLASSES` into `filterEligiblePermutationUnitClassIds`, which then re-reads `Object.values(UNIT_CLASSES)` and re-filters. The outer function can apply the predicate directly without the round-trip.

---

### 4.4 `footprintsCollide` in `battle.ts` duplicates `footprintsOverlap` from `hex.ts`
**File:** `src/engine/battle.ts**, line ~228 vs `src/engine/hex.ts**

Remove the local copy and import the shared export.

---

### 4.5 `mergePermutationAggregates` mutates its first argument while pretending to return a new value
**File:** `src/engine/permutationReport.ts**, lines ~277–311

The function signature implies a pure merge but mutates `base` in place. Either document the mutation clearly or return a genuinely new object.

---

### 4.6 `BASE_STEP_MS` is defined in two separate rendering files
**Files:** `src/rendering/BattleRenderer.ts** line ~24, `src/rendering/battlePresentationTimeline.ts** line ~3

Both define `const BASE_STEP_MS = 500`. Extract to a shared `renderingConstants.ts` so timing tuning is a single-file change.

---

### 4.7 `ContestState.players` only has an `ai` key; human state lives on root `GameState`
**File:** `src/engine/types.ts**, lines ~715–719

The asymmetry between human state (root-level fields) and AI state (`contest.players.ai`) makes multiplayer symmetry code (`swapContestPerspective`, `projectContestStateForPlayer`) significantly more complex. A cleaner design would store both sides under `contest.players.human` and `contest.players.ai`.

---

### 4.8 `BattleStepMetadata` index signature weakens type safety
**File:** `src/engine/types.ts**, line ~414

```ts
[key: string]: number | string | string[] | boolean | BattleStepExplanation | undefined;
```

This index signature allows any string key, defeating TypeScript's property-level type checking for explicitly defined fields. Typos in property names produce no error. Use `extra?: Record<string, unknown>` for genuinely dynamic fields and remove the index signature.

---

### 4.9 `backlineBreachRate` is binary per battle but named like a continuous rate
**File:** `src/engine/simulationHarness.ts**, line ~667

```ts
backlineBreachRate: firstBacklineThreatBeat === null ? 0 : 1,
```

The per-battle value is always exactly 0 or 1 (a boolean). Rename to `backlineBreached: boolean` at the per-battle level; compute the rate only when aggregating across a sweep.

---

## Summary Table

| Priority | Category | Finding |
|---|---|---|
| High | Bug | 2.1 — Tutorial rewind state double-serialised; accidentally works, fragile |
| High | Bug | 2.3 — `preventDeath` ignores live ability tracking for `mercy-before-dawn` |
| High | Bug | 2.2 — `clearStaleEngagements` mutates Set during sibling iteration |
| High | Bug | 2.4 — Draft choice loop guard=20 can reject legal 10-troop + 10-upgrade submissions |
| High | Bug | 2.5 — Multiplayer cycle animation uses `tier` as VP and empty `recoveryMap` |
| Medium | Bug | 2.6 — `isKnownTroopClassUpgradeId` uses try/catch as membership test |
| Medium | Bug | 2.10 — `rosterCanFitOpenRifts` ignores occupied contest rift slots |
| Medium | Perf | 3.1 — Deep-clone all units on every step: O(units × steps) allocations |
| Medium | Perf | 3.2 — `getAliveUnits` linear scan called dozens of times per beat |
| Medium | Perf | 3.3 — Map anchor re-sort on every combatant placement |
| Medium | Perf | 3.4 — `footprintDistance` no early exit for distance 0 or 1 |
| Medium | Refactor | 4.1 — Four pairwise-duplicate upgrade-effect functions |
| Medium | Refactor | 4.2 — Full upgrade pipeline runs twice per combatant resolution |
| Low | Bug | 2.7 — `formatPossessive` produces "Trolls's" |
| Low | Bug | 2.8 — `deserializeGameState(JSON.stringify(parsed.game))` redundant round-trip |
| Low | Bug | 2.9 — `expandedMapHexes` generates a rectangle, not a valid hex grid |
| Low | Perf | 3.6 — Permutation sweep blocks main thread |
| Low | Perf | 3.7 — AI plan cache key serialises full `ResolvedCombatantDefinition` arrays |
| Low | Dead code | 1.1 — `makeAbility` no-op (98 call sites) |
| Low | Dead code | 1.2 — `VICTORY_RECOVERY` and `DEFEAT_RECOVERY` both equal 1 |
| Low | Dead code | 1.3 — `PermutationOverallEntry` empty alias |
| Low | Dead code | 1.4 — `REPLAY_IDENTITY_KEY` unused |
| Low | Dead code | 1.6 — `isKnownTroopClassUpgradeId` duplicated in two files |
| Low | Dead code | 1.7 — `APP_VERSION` hardcoded to `'0.1.0'` in two files |
| Low | Dead code | 1.8 — `buildEqualCostBundle` test-only but exported from production harness |
| Low | Refactor | 4.4 — `footprintsCollide` duplicates `footprintsOverlap` |
| Low | Refactor | 4.5 — `mergePermutationAggregates` mutates first arg without documenting it |
| Low | Refactor | 4.6 — `BASE_STEP_MS` defined in two rendering files |
| Low | Refactor | 4.7 — `ContestState.players` asymmetry complicates multiplayer symmetry code |
| Low | Refactor | 4.8 — `BattleStepMetadata` index signature defeats property-level type safety |
