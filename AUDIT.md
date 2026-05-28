# Shiftmake Architecture & Performance Audit

**Date:** 2026-05-28  
**Scope:** `src/engine/`, `src/rendering/`, `src/store/`, `src/ui/`

---

## Architecture Compliance

**Result: PASS.** Layer boundaries are clean:

- `src/engine/` — no DOM or PixiJS imports detected
- `src/rendering/` — only PixiJS and type imports from engine
- `src/ui/` — no game logic in Svelte components
- `src/store/` — delegates to engine functions correctly

---

## High Severity

### 1. O(N²) Cell Lookup in Spawn Algorithm
**File:** `src/engine/battle.ts:735, 751`

`activeCells` is an array, so the `Array.some()` check used to detect duplicates is O(n) per call, executed inside expansion loops that visit every candidate cell.

```typescript
// line 735
if (forbidden.has(key) || activeCells.some((active) => equalsHex(active, neighbor))) { … }
// line 751
if (!activeCells.some((active) => equalsHex(active, cell))) { activeCells.push(cell); }
```

`forbidden` already uses a Set for O(1) lookup. `activeCells` should too. With 50+ units per side this becomes quadratic. Fix: maintain a parallel `activeCellKeys = new Set<string>()` alongside `activeCells[]` and gate on `activeCellKeys.has(key)`.

---

### 2. Repeated Intermediate Array Allocations in `tryFindSummonHex`
**File:** `src/engine/battle.ts:2090–2091`

```typescript
const candidatePool = [origin, ...state.rng.shuffle(neighbors(origin).filter(…))];
const valid = candidatePool.filter((coord) => fixedAdd(allySizeOnHex(state, actor.side, coord), size) <= state.saturation);
```

Every summon call allocates 2–3 intermediate arrays and invokes `allySizeOnHex()` once per candidate inside the filter. Swarm-type abilities that trigger many summons chain this overhead linearly.

---

### 3. Redundant Multi-Pass Array Work in `placeUnitWithExpandableCells`
**File:** `src/engine/battle.ts:790–793`

```typescript
const minUtilization = Math.min(...candidates.map((item) => item.utilization));
const finalists = candidates.filter((item) => item.utilization === minUtilization);
const minUsed = Math.min(...finalists.map((item) => item.used));
const selected = context.rng.pick(finalists.filter((item) => item.used === minUsed)).cell;
```

Four passes over `candidates` to find a single cell. Called inside a `while` loop (line 774) during unit placement for every unit spawned. A single-pass reduce would eliminate three of the four iterations.

---

### 4. Missing Memoization for `getDistinctFriendlyUnitTypes`
**File:** `src/engine/battle.ts:1046, 2053, 2056`

```typescript
function getDistinctFriendlyUnitTypes(state: InternalState, unit: InternalUnit): string[] {
  return [...new Set(getAliveUnits(state, unit.side).map((entry) => entry.type))];
}
```

Filters all alive units, maps, deduplicates, and spreads into a new array on every call. Called in `canTriggerAbility()` and `getAbilityRepeatCount()`, which run for every ability trigger attempt every turn. The result is stable until a unit dies or is summoned. Cache it per side per resolution phase and invalidate on unit death/spawn events.

---

### 5. `computeDisplayLayout` Called Twice per Step
**File:** `src/rendering/BattleRenderer.ts:729–730`

```typescript
const prevLayout = this.computeDisplayLayout(prevUnits);
const nextLayout = this.computeDisplayLayout(nextUnits);
```

`computeDisplayLayout` (line ~597) builds three Maps and runs nested forEach/sort/forEach over all units. It is called twice for every step effect, including non-move steps where neither layout differs from adjacent steps. For 20–40 units × 50–100 steps this produces 2,000–8,000 layout calculations per replay. Fix: cache the layout keyed by step index, recompute only when the unit-position snapshot differs from the previous one.

---

## Medium Severity

### 6. New `Set` Allocated on Every Highlight Update
**File:** `src/rendering/BattleRenderer.ts:345–346`

```typescript
setHighlights(strongIds: string[], faintIds: string[]): void {
  this.strongHighlightIds = new Set(strongIds);
  this.faintHighlightIds = new Set(faintIds.filter((id) => !this.strongHighlightIds.has(id)));
  this.applyHighlights();
}
```

No comparison against previous state, so new Set objects are allocated on every pointer-over event regardless of whether the set changed. Minor GC churn during rapid interactions.

---

### 7. Linear Search for Troop Profile Per Sprite Mount
**File:** `src/rendering/BattleRenderer.ts:494`

```typescript
const profile = this.replay?.troopProfiles.find(
  (entry) => entry.side === unit.side && entry.troopLabel === unit.troopLabel
);
```

O(n) over `troopProfiles` per unit sprite at replay load. `troopProfiles` is small in practice; converting it to a `Map<string, TroopProfile>` keyed by `${side}:${troopLabel}` would make this O(1) and eliminate the concern entirely.

---

### 8. Direct Mutation of `InternalUnit` State
**File:** `src/engine/battle.ts` throughout

Units are mutated in-place (`unit.hp = …`, `unit.initiative = …`). This is fast but fragile: an unexpected mutation anywhere in the call chain corrupts the live state and any snapshot that shares the reference. The pattern is currently mitigated by `cloneSnapshot()` at key checkpoints (line ~3861), but the discipline required to maintain correctness is high and bugs are hard to detect at runtime.

---

### 9. `localeCompare` Sort Inside Layout Per Hex
**File:** `src/rendering/BattleRenderer.ts:637`

```typescript
groupUnits.sort((a, b) => a.id.localeCompare(b.id));
```

Called once per hex per layout calculation. Groups are typically 1–3 elements so the cost is negligible, but `localeCompare` is significantly slower than a simple numeric or byte comparison. Unit IDs are likely deterministic strings that can be compared with `<`/`>`.

---

## Low Severity

### 10. DOM Style Mutations Called Every Step
**File:** `src/rendering/BattleRenderer.ts:696–710`

`syncTutorialUnitTargets()` writes `style.left/top/width/height` for every tutorial target on every `showStep()` call. DOM writes are batched by the browser so jank is unlikely, but this mixes imperative DOM access with PixiJS rendering. Moving tutorial overlays into PixiJS containers or using CSS `transform` would keep the render path consistent.

---

### 11. Exception-Based Catalog Lookup in `sourceLabelForStep`
**File:** `src/engine/battle.ts:1068–1075`

```typescript
try {
  abilityLabel = getAbility(sourceAbilityId).label;
} catch {
  try {
    abilityLabel = getMutator(sourceAbilityId).label;
  } catch {
    abilityLabel = sourceAbilityId;
  }
}
```

Exceptions used for control flow. Only runs during step enrichment so performance is not a concern, but it obscures intent. Prefer an optional-return lookup (`getAbility(id) ?? getMutator(id)`) and surface a warning for unknown IDs.

---

## Code Quality Observations

**Strengths:**
- Immutable `BattleInput`/`BattleReplay` types prevent accidental state corruption at the API boundary
- Snapshot-based replay architecture ensures deterministic playback
- Strong TypeScript coverage eliminates large categories of runtime errors
- Ability trigger/effect model is composable and consistent

**Weaknesses:**
- `battle.ts` is very large (~3900+ lines, 120+ functions). Navigation and onboarding friction is high; consider splitting by domain (spawning, ability effects, step enrichment, replay serialization)
- Constants (`MAX_BEATS`, `BASE_STEP_MS`, saturation limits) are scattered; a central `constants.ts` would reduce search-and-replace risk
- Complex nested conditions in `applyPostEffectReactions` and similar ability hooks would benefit from a comment explaining the invariant being maintained

---

## Priority Summary

| # | File | Lines | Severity | Effort to Fix |
|---|------|-------|----------|---------------|
| 1 | `battle.ts` | 735, 751 | High | Low — swap array for Set |
| 2 | `battle.ts` | 2090–2091 | High | Low — reuse neighbors result |
| 3 | `battle.ts` | 790–793 | High | Low — single-pass reduce |
| 4 | `battle.ts` | 1046, 2053 | High | Medium — per-phase cache |
| 5 | `BattleRenderer.ts` | 729–730 | High | Medium — step-indexed cache |
| 6 | `BattleRenderer.ts` | 345–346 | Medium | Low — equality check before alloc |
| 7 | `BattleRenderer.ts` | 494 | Medium | Low — build Map at load time |
| 8 | `battle.ts` | throughout | Medium | High — discipline / audit |
| 9 | `BattleRenderer.ts` | 637 | Medium | Trivial — replace localeCompare |
| 10 | `BattleRenderer.ts` | 696–710 | Low | Medium — PixiJS overlay refactor |
| 11 | `battle.ts` | 1068–1075 | Low | Low — optional-return lookup |
