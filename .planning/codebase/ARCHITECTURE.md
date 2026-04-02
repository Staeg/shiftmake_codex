# Architecture

**Analysis Date:** 2026-04-02

## Pattern Overview

**Overall:** Layered frontend application with a pure simulation engine, a thin state-orchestration store layer, and presentation-specific Svelte and Pixi consumers.

**Key Characteristics:**
- `src/engine/` is the authoritative domain layer. It owns campaign rules, battle simulation, typed data models, deterministic RNG, save serialization, and content catalogs.
- `src/store/` is the application boundary. It translates UI actions into engine calls, persists `GameState` and replay payloads in `localStorage`, and manages screen/replay state.
- `src/ui/` and `src/rendering/` are read-mostly presentation layers. They render resolved engine data and should not introduce gameplay rules or duplicate battle logic.

## Layers

**Boot Layer:**
- Purpose: Start the browser app and attach the root component.
- Location: `src/main.ts`
- Contains: CSS import and `new App(...)` bootstrap only.
- Depends on: `src/app.css`, `src/ui/App.svelte`
- Used by: Vite entry from `index.html`

**Engine Domain Layer:**
- Purpose: Define game rules, battle resolution, campaign progression, rift generation, troop resolution, persistence shapes, and analysis helpers.
- Location: `src/engine/`
- Contains: Core modules such as `src/engine/types.ts`, `src/engine/game.ts`, `src/engine/battle.ts`, `src/engine/army.ts`, `src/engine/rift.ts`, `src/engine/unitCatalog.ts`, `src/engine/save.ts`
- Depends on: Other `src/engine/` modules only
- Used by: `src/store/`, selected pure UI helpers in `src/ui/`, offline scripts in `scripts/`

**Store / Application Layer:**
- Purpose: Hold app session state, bridge engine functions to UI events, manage save slots, replay persistence, and replay navigation.
- Location: `src/store/`
- Contains: `src/store/gameStore.ts`, `src/store/saveSlots.ts`, `src/store/replayNavigation.ts`, `src/store/debugBattleStore.ts`
- Depends on: `src/engine/`, `svelte/store`, browser `localStorage`
- Used by: `src/ui/App.svelte` and any future interactive UI entrypoints

**UI Component Layer:**
- Purpose: Build the DOM application shell, menus, planning screen, overlays, tooltips, and replay side panels.
- Location: `src/ui/`
- Contains: Root screen `src/ui/App.svelte` plus focused components and pure formatting helpers like `src/ui/inspectText.ts`, `src/ui/battleRecap.ts`, `src/ui/riftVisuals.ts`
- Depends on: `src/store/`, selected read-only engine helpers, `src/rendering/BattleRenderer.ts`
- Used by: `src/main.ts`

**Replay Rendering Layer:**
- Purpose: Draw and animate battle replay state on a Pixi canvas.
- Location: `src/rendering/`
- Contains: `src/rendering/BattleRenderer.ts`, `src/rendering/unitVisuals.ts`
- Depends on: `pixi.js`, battle replay types from `src/engine/types.ts`, asset imports from `assets/` and `src/assets/`
- Used by: `src/ui/App.svelte`

**Offline Analysis Layer:**
- Purpose: Run heavy permutation and balance-report jobs outside the browser runtime.
- Location: `scripts/` and engine helpers `src/engine/permutationReport.ts`, `src/engine/simulationHarness.ts`
- Contains: worker-based report runners such as `scripts/reportPermutations2v2.ts`, `scripts/reportPermutations3v3.ts`, `scripts/permutationWorker.ts`
- Depends on: Node APIs, compiled output in `dist-scripts/`, pure engine modules
- Used by: `npm run report:2v2`, `npm run report:3v3`

## Data Flow

**Campaign UI Flow:**

1. `src/ui/App.svelte` reads `$gameStore` and renders either `main_menu`, `overworld`, or `replay`.
2. User actions call methods on `src/store/gameStore.ts` such as `claimOpeningTroop`, `assignTroopToRift`, `endCycle`, or `openReplay`.
3. `src/store/gameStore.ts` invokes pure engine functions from `src/engine/game.ts` and related helpers, then persists the resulting `GameState` through `src/store/saveSlots.ts`.
4. The UI re-renders from the updated store snapshot and uses engine read helpers like `getTroopEffectiveDefinition()` for display-only derived data.

**Cycle Resolution Flow:**

1. `src/store/gameStore.ts:endCycle()` validates with `validateAssignments()` from `src/engine/game.ts`.
2. `src/engine/game.ts:resolveAssignedRifts()` turns assigned troops into resolved combatants via `src/engine/army.ts`, builds `BattleInput`, and runs `resolveBattle()` from `src/engine/battle.ts`.
3. `src/engine/game.ts:applyCycleOutcomes()` updates troops, rifts, replay index, victory points, and next-cycle rifts.
4. `src/store/gameStore.ts` persists the next save plus replay payloads, with quota-aware eviction handled by `persistReplayPayloadWrites()`.

**Replay Flow:**

1. `src/store/saveSlots.ts:readSlotReplay()` loads a stored replay payload from `localStorage`.
2. If the payload is stored as `StoredReplayPayload`, `src/store/saveSlots.ts` reconstructs the full replay by calling `resolveBattle()` again.
3. `src/store/gameStore.ts:openReplay()` switches screen mode and exposes the loaded `BattleReplay`.
4. `src/ui/App.svelte` passes the replay to `src/rendering/BattleRenderer.ts` and auxiliary components like `src/ui/EventLog.svelte` and `src/ui/battleRecap.ts`.

**State Management:**
- Global runtime state lives in the singleton `gameStore` from `src/store/gameStore.ts`.
- Debug-only replay state lives separately in `src/store/debugBattleStore.ts`.
- Engine functions return plain data and new objects instead of mutating UI state directly.

## Key Abstractions

**Typed Shared Model:**
- Purpose: Provide a single contract for campaign, battle, replay, upgrade, and persistence data.
- Examples: `src/engine/types.ts`
- Pattern: Centralized TypeScript interfaces/types imported throughout the codebase

**Declarative Content Catalog:**
- Purpose: Store unit, faction, ability, mutator, and upgrade content separately from runtime resolution logic.
- Examples: `src/engine/unitCatalog.ts`
- Pattern: Large typed lookup tables plus composition helpers such as `composeBaseTroopDefinition()` and `getTroopUnlockId()`

**Deterministic Battle Replay:**
- Purpose: Treat replay output as authoritative presentation data and enable reconstruction from seed/input.
- Examples: `src/engine/battle.ts`, `src/store/saveSlots.ts`
- Pattern: Pure resolver `resolveBattle(input)` returning `BattleReplay`, with replay payload storage reduced to deterministic `BattleInput`

**Campaign State Machine:**
- Purpose: Advance runs through opening unlock, planning, and game-over phases without UI-owned rule branches.
- Examples: `src/engine/game.ts`
- Pattern: Pure transition functions operating on `GameState`

**Application Store Facade:**
- Purpose: Hide storage, replay persistence, validation warnings, and screen transitions from Svelte markup.
- Examples: `src/store/gameStore.ts`
- Pattern: Module-scoped `writable()` store wrapped in imperative methods

## Entry Points

**Browser App Entry:**
- Location: `src/main.ts`
- Triggers: Browser page load through Vite
- Responsibilities: Import global CSS and mount `src/ui/App.svelte`

**Root Screen Controller:**
- Location: `src/ui/App.svelte`
- Triggers: Every user-visible browser interaction
- Responsibilities: Read store state, dispatch store actions, manage replay renderer lifecycle, and assemble the full UI

**Campaign Engine Entry:**
- Location: `src/engine/game.ts`
- Triggers: Store actions such as new campaign creation, offer claims, troop assignment, and cycle resolution
- Responsibilities: Own `GameState` transitions and battle launch/orchestration

**Battle Engine Entry:**
- Location: `src/engine/battle.ts`
- Triggers: Campaign cycle resolution, debug battle runs, replay reconstruction
- Responsibilities: Expand combatants, place units, execute turn logic, emit snapshots/steps, and return `BattleReplay`

**Offline Reporting Entry:**
- Location: `scripts/reportPermutations2v2.ts`, `scripts/reportPermutations3v3.ts`
- Triggers: `npm run report:2v2`, `npm run report:3v3`
- Responsibilities: Kick off Node-based balance report generation using `src/engine/permutationReport.ts`

## Error Handling

**Strategy:** Fail fast inside the engine for invalid internal assumptions, but convert storage/runtime failures into user-visible messages at the store layer.

**Patterns:**
- Engine accessors throw on impossible states, for example `src/engine/army.ts:getTroopById()` and many lookup helpers in `src/engine/unitCatalog.ts`.
- Save loading and replay loading use tolerant parsing and return `null` or structured result objects, for example `src/engine/save.ts` and `src/store/saveSlots.ts`.
- `src/store/gameStore.ts` catches replay-storage quota failures and degrades archived battles to summary-only entries instead of crashing the app.

## Cross-Cutting Concerns

**Logging:** Minimal. Browser runtime mostly avoids logging; offline scripts in `scripts/reportPermutationsCommon.ts` use `console.log()` / `console.warn()` for progress and worker fallback reporting.

**Validation:** Campaign validation is centralized in `src/engine/game.ts:validateAssignments()`. UI warnings should call this or consume store-produced messages rather than re-implementing constraints.

**Authentication:** Not applicable. The app is single-user browser runtime with `localStorage` persistence and no backend.

---

*Architecture analysis: 2026-04-02*
