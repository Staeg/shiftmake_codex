# Coding Conventions

**Analysis Date:** 2026-04-02

## Naming Patterns

**Files:**
- Use lower camel case for TypeScript modules: `src/engine/unitCatalog.ts`, `src/store/gameStore.ts`, `src/ui/battleRecap.ts`.
- Use PascalCase only for Svelte components and class-style renderer modules: `src/ui/App.svelte`, `src/ui/BattleControls.svelte`, `src/rendering/BattleRenderer.ts`.
- Co-locate tests with the implementation file and name them `*.test.ts`: `src/engine/battle.test.ts`, `src/store/gameStore.test.ts`, `src/ui/battleRecap.test.ts`.

**Functions:**
- Use lower camel case for exported and local functions: `resolveBattle()` in `src/engine/battle.ts`, `persistReplayPayloadWrites()` in `src/store/gameStore.ts`, `buildBattleRecap()` in `src/ui/battleRecap.ts`.
- Prefer verb-led names for behavior and builder names for object construction: `applyCycleOutcomes()`, `createTroopInstance()`, `buildSimulationBattleInput()`.
- Predicate helpers are named as booleans: `isQuotaExceeded()` in `src/store/gameStore.ts`, `isFactionUnited()` in `src/engine/army.ts`, `isUnitAliveAtStep()` in `src/ui/battleRecap.ts`.

**Variables:**
- Use lower camel case throughout, including state snapshots and derived values: `nextReplayIndex`, `selectedReplayId`, `activeCells`, `factionRosterIds`.
- Prefix future-state values with `next` and previous-state values with `before`/`previous` when transforming immutable data: `nextStats` in `src/engine/army.ts`, `beforeReload` in `src/store/gameStore.test.ts`.
- Use explicit domain names instead of generic `data`/`item` when the type matters: `troopUnlockId`, `replayWriteResult`, `blockingIssues`.

**Types:**
- Use PascalCase for interfaces, aliases, and imported engine types: `StoreState` in `src/store/gameStore.ts`, `ResolvedCombatantDefinition` in `src/engine/types.ts`, `BattleRecapTroopEntry` in `src/ui/App.svelte`.
- Use string-literal unions for domain states and modes instead of enums: `ScreenMode` and `CenterMode` in `src/store/gameStore.ts`.

## Code Style

**Formatting:**
- No formatter config is checked in. There is no detected `.prettierrc`, `eslint.config.*`, `.eslintrc*`, or `biome.json` at the repo root.
- Follow the existing style from `src/engine/battle.ts`, `src/store/gameStore.ts`, and `src/ui/App.svelte`:
  - 2-space indentation.
  - Semicolons enabled.
  - Single quotes.
  - Trailing commas in multiline object and array literals.
  - Long import lists and object literals are wrapped vertically.

**Linting:**
- TypeScript strictness is the main enforced style gate. `tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `verbatimModuleSyntax`.
- Preserve explicit null handling and optional chaining patterns that exist across `src/store/gameStore.ts` and `src/ui/App.svelte`.

## Import Organization

**Order:**
1. External packages first: `svelte/store` in `src/store/gameStore.ts`, `vite` in `vite.config.mts`, `vitest` in test files.
2. Relative runtime imports next, grouped by subsystem: engine imports before store or UI helpers in `src/ui/App.svelte`.
3. `import type` statements after value imports from the same area: `src/engine/army.ts`, `src/store/gameStore.ts`, `src/ui/battleRecap.test.ts`.

**Path Aliases:**
- Not used. All imports are relative paths such as `./game`, `../engine/types`, and `./BattleControls.svelte`.

## Error Handling

**Patterns:**
- Throw plain `Error` objects for invariant violations in pure modules: `getTroopById()` in `src/engine/army.ts`, spawn failure in `src/engine/battle.ts`.
- Return discriminated result objects for recoverable persistence and parsing flows: `deserializeGameState()` usage in `src/engine/campaign.test.ts`, `ReplayWriteResult` in `src/store/gameStore.ts`.
- Catch storage-layer failures close to the boundary and convert them to user-facing messages: `endCycle()` in `src/store/gameStore.ts`.
- Prefer narrow error classification helpers instead of stringly typed branches spread everywhere: `isQuotaExceeded()` in `src/store/gameStore.ts`.

## Logging

**Framework:** None detected.

**Patterns:**
- Runtime code does not use `console.*` in `src/engine`, `src/store`, or `src/ui`.
- Surface diagnostics through typed return data, replay steps, or store state instead of console logging.

## Comments

**When to Comment:**
- Keep comments sparse and only add them for domain rules or non-obvious invariants.
- Existing comments explain battle-order semantics and test intent, not line-by-line mechanics:
  - start-of-battle phase ordering in `src/engine/battle.ts`
  - ability mechanic setup notes in `src/engine/battle.test.ts`
  - helper intent in `src/engine/battle.test.ts`

**JSDoc/TSDoc:**
- Not used in the sampled code. Prefer well-typed signatures and descriptive names over block documentation.

## Function Design

**Size:**
- Most engine and store helpers are small, single-purpose functions even inside large modules like `src/engine/battle.ts` and `src/store/gameStore.ts`.
- Large files are organized as many focused helpers plus a small exported surface. Follow that pattern instead of adding more logic into one monolithic function.

**Parameters:**
- Pass typed domain objects or narrow `Pick<>` slices instead of broad mutable state: `resolveTroopCombatant()` and `getTroopById()` in `src/engine/army.ts`.
- Prefer explicit primitives over option bags when the call sites stay readable: `resolveEnemyCombatant()` in `src/engine/army.ts`.
- Use default parameters for optional behavior toggles: `endCycle(force = false)` in `src/store/gameStore.ts`, `makeReplayIndexEntry(replayId, summaryOnly = false)` in `src/store/gameStore.test.ts`.

**Return Values:**
- Engine functions generally return new objects instead of mutating caller-owned state: `claimOpeningTroop()` and `applyCycleOutcomes()` usage in `src/engine/campaign.test.ts`.
- Store actions wrap immutable updates inside Svelte `update()`/`set()` calls in `src/store/gameStore.ts`.
- Helper builders return fully shaped test or runtime objects so callers do not assemble partial records repeatedly: `makeReplay()` in `src/ui/battleRecap.test.ts`, `makeReplayPayload()` in `src/store/gameStore.test.ts`.

## Module Design

**Exports:**
- Prefer named exports throughout. `src/engine/army.ts`, `src/engine/battle.ts`, `src/store/gameStore.ts`, and `src/ui/battleRecap.ts` all export named functions or constants.
- Keep the public API near the bottom of large modules when there is a long chain of private helpers, as in `src/engine/battle.ts`.

**Barrel Files:**
- None detected in `src/`. Import directly from concrete files.

## Svelte-Specific Patterns

- Put orchestration and view-model shaping in the `<script lang="ts">` block and keep markup declarative: `src/ui/App.svelte`.
- Use reactive `$:` statements for derived UI state, selection repair, and playback synchronization in `src/ui/App.svelte`.
- Import store state directly and drive behavior through store methods rather than embedding engine rules in components: `src/ui/App.svelte` with `src/store/gameStore.ts`.

## Practical Guidance

- Put gameplay rules in `src/engine/` only. `TECHNICAL.md` and the import boundaries in `src/store/gameStore.ts` and `src/ui/App.svelte` reinforce that `src/ui/` and `src/rendering/` consume resolved engine data.
- When adding a new engine rule, model it in typed data first and reuse existing helper pipelines such as `resolveTroopCombatant()` in `src/engine/army.ts` or the ability runtime in `src/engine/battle.ts`.
- When adding UI behavior, prefer new derived values and small helper functions in `src/ui/App.svelte` or a dedicated UI helper like `src/ui/battleRecap.ts` instead of pushing logic into markup blocks.
- When adding persistence or replay behavior, keep browser-specific concerns in `src/store/` and pure transformations in `src/engine/`.

---

*Convention analysis: 2026-04-02*
