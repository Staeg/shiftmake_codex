# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Shiftmake** is a browser-based, primarily singleplayer turn-based strategy game with light pixel art graphics. The design documents are in `design documents/Overview.md`, `design documents/Unit details.md`, `design documents/Battle details.md`, `design documents/Overworld.md`, and `design documents/Rifts.md`. The full technical spec is in `TECHNICAL.md` - read it before writing any code.

### Core Concept

The player commands a patchwork army of multiple factions/races. **Rifts** (portals to new worlds) open periodically — the player chooses which faction's troop to send through each Rift, knowing the reward and the enemy composition in advance. Only one troop per faction can enter a Rift at a time.

Battles are auto-resolved but fully observable (the player can replay exactly how they played out). Skill expression comes from resource efficiency and building synergies.

### Key Game Loops

1. **Strategic layer**: Select which troop to send into each available Rift, balancing risk vs. reward and faction availability.
2. **Upgrade layer**: Spend conquered resources to enlist new factions, form new troops, increase troop size, or upgrade factions/unit types globally.
3. **Battle layer**: Auto-resolved; both victories and defeats trigger a recovery period (defeats take longer). Units do not permanently die.

### Faction & Unit System

- **Factions** (e.g., Elves, Trolls) each have default recruitable troop types.
- **Troops** are a specific unit type within a faction (e.g., Elven Archers, Troll Berserkers).
- Rifts can unlock unorthodox faction+unit combinations not available through normal recruitment.
- Upgrades apply either across all units in a faction, or across all factions for a given unit type.

### Platform Targets

- **Primary**: Browser (web)
- **Stretch goals**: Multiplayer, Android/iOS ports

## Stack

TypeScript + Vite + Svelte + PixiJS. See `TECHNICAL.md` for full rationale and conventions.

## Build Commands

```bash
npm install
npm run dev       # Vite dev server
npm run build     # Production build
npm run test      # Vitest (engine unit tests)
npm run preview   # Preview production build
```

## Critical Architecture Rule

`src/engine/` is pure TypeScript with zero rendering or DOM dependencies. All game logic lives here. Svelte components and PixiJS code must never contain game logic. See `TECHNICAL.md` for the full architecture.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Shiftmake**

Shiftmake is a browser-based singleplayer turn-based strategy game where the player manages a patchwork army across a series of Rift battles. The current project focus is not inventing a new game direction, but tightening the existing experience so the interface feels clean and readable, battlefield roles behave intuitively, and a full run stays tense and fair from opening to late cycles.

**Core Value:** The game should feel strategically legible and satisfying from moment to moment, with clear UI, intuitive unit behavior, and campaign pacing that stays engaging across the whole run.

### Constraints

- **Tech stack**: TypeScript + Vite + Svelte + PixiJS - preserve the established stack and work within the current browser client architecture
- **Architecture**: `src/engine/` must remain pure TypeScript with zero DOM or rendering dependencies - gameplay logic cannot leak into Svelte components or Pixi rendering code
- **Product scope**: Primary target remains the browser singleplayer experience - this milestone should improve the shipped core loop before expanding platform or mode scope
- **Persistence**: Current save and replay storage uses `localStorage` - progression and archive changes should respect existing browser-local storage limits unless storage work becomes explicitly in scope
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.5.x - application code in `src/`, Node-side report scripts in `scripts/`, and tests in `src/**/*.test.ts` per `package.json` and `tsconfig.json`
- JavaScript (ES modules) - Svelte/Vite config in `svelte.config.js`
- CSS - global app styling in `src/app.css`
- HTML - Vite entry shell in `index.html`
## Runtime
- Browser runtime for the shipped game client, bootstrapped from `src/main.ts`
- Node.js runtime for development tooling, tests, Vite builds, and permutation-report scripts in `scripts/reportPermutationsCommon.ts`
- npm
- Lockfile: present in `package-lock.json` (lockfileVersion 3)
## Frameworks
- Vite 5.4.x - dev server and production bundler, configured in `vite.config.mts`
- Svelte 4.2.x - UI layer mounted from `src/main.ts` and implemented under `src/ui/`
- PixiJS 7.4.x - battle rendering layer in `src/rendering/BattleRenderer.ts` and `src/rendering/unitVisuals.ts`
- Vitest 2.0.x - test runner used by `npm run test` / `npm run test:watch` from `package.json`
- `@sveltejs/vite-plugin-svelte` 3.1.x - Svelte integration for Vite in `vite.config.mts`
- `@tsconfig/svelte` 5.0.x - base TypeScript config extended by `tsconfig.json`
- esbuild - used indirectly from `package.json` report scripts to bundle `scripts/reportPermutations2v2.ts`, `scripts/reportPermutations3v3.ts`, and `scripts/permutationWorker.ts` into `dist-scripts/scripts/`
## Key Dependencies
- `svelte` - component runtime for `src/ui/App.svelte`, `src/ui/BattleControls.svelte`, `src/ui/EventLog.svelte`, and related UI files
- `pixi.js` - rendering engine for battle playback in `src/rendering/BattleRenderer.ts`
- `typescript` - strict typing across the pure engine in `src/engine/` and stores in `src/store/`
- `vite` - required for `npm run dev`, `npm run build`, and `npm run preview`
- `vitest` - covers engine, store, and selected UI helper behavior in files such as `src/engine/battle.test.ts`, `src/store/gameStore.test.ts`, and `src/ui/battleRecap.test.ts`
- Browser `localStorage` - persistence layer for saves and replay payloads in `src/store/saveSlots.ts` and `src/store/gameStore.ts`
- Node built-ins (`node:fs/promises`, `node:path`, `node:os`, `node:worker_threads`, `node:crypto`) - report generation and checkpointing in `scripts/reportPermutationsCommon.ts` and `scripts/permutationWorker.ts`
## Configuration
- No `.env` files were detected at the repository root during this analysis
- No `process.env` or `import.meta.env` usage was detected in `src/`, `scripts/`, or `test/`
- Runtime behavior is configured in code and package scripts rather than external environment variables
- `package.json` defines the supported commands: `dev`, `build`, `preview`, `test`, `test:watch`, `report:2v2`, and `report:3v3`
- `vite.config.mts` enables the Svelte plugin and otherwise keeps Vite close to default configuration
- `svelte.config.js` enables `vitePreprocess()`
- `tsconfig.json` enforces strict typing, `moduleResolution: "Bundler"`, `target: "ES2022"`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`
- `tsconfig.scripts.json` exists for script-side TypeScript compilation context
## Platform Requirements
- Node.js and npm are required to run the Vite dev server, Vitest, and the Node report scripts declared in `package.json`
- A modern browser is required to run the client built from `src/main.ts`
- Static web deployment target: `npm run build` emits browser assets into `dist/`
- No backend service, database server, or API gateway is required by the current app code in `src/`
## Practical Notes
- Keep gameplay logic in the pure TypeScript engine under `src/engine/`; the architecture rule is documented in `TECHNICAL.md` and reflected by the import boundaries in `src/`
- Treat `scripts/` as a separate Node-only toolchain. Those scripts write analysis artifacts to `balance_results/` and compiled helpers to `dist-scripts/`
- Persistence is browser-only and local. Any future cloud save, telemetry, or multiplayer work would be a new integration rather than an extension of an existing service layer
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- Use lower camel case for TypeScript modules: `src/engine/unitCatalog.ts`, `src/store/gameStore.ts`, `src/ui/battleRecap.ts`.
- Use PascalCase only for Svelte components and class-style renderer modules: `src/ui/App.svelte`, `src/ui/BattleControls.svelte`, `src/rendering/BattleRenderer.ts`.
- Co-locate tests with the implementation file and name them `*.test.ts`: `src/engine/battle.test.ts`, `src/store/gameStore.test.ts`, `src/ui/battleRecap.test.ts`.
- Use lower camel case for exported and local functions: `resolveBattle()` in `src/engine/battle.ts`, `persistReplayPayloadWrites()` in `src/store/gameStore.ts`, `buildBattleRecap()` in `src/ui/battleRecap.ts`.
- Prefer verb-led names for behavior and builder names for object construction: `applyCycleOutcomes()`, `createTroopInstance()`, `buildSimulationBattleInput()`.
- Predicate helpers are named as booleans: `isQuotaExceeded()` in `src/store/gameStore.ts`, `isFactionUnited()` in `src/engine/army.ts`, `isUnitAliveAtStep()` in `src/ui/battleRecap.ts`.
- Use lower camel case throughout, including state snapshots and derived values: `nextReplayIndex`, `selectedReplayId`, `activeCells`, `factionRosterIds`.
- Prefix future-state values with `next` and previous-state values with `before`/`previous` when transforming immutable data: `nextStats` in `src/engine/army.ts`, `beforeReload` in `src/store/gameStore.test.ts`.
- Use explicit domain names instead of generic `data`/`item` when the type matters: `troopUnlockId`, `replayWriteResult`, `blockingIssues`.
- Use PascalCase for interfaces, aliases, and imported engine types: `StoreState` in `src/store/gameStore.ts`, `ResolvedCombatantDefinition` in `src/engine/types.ts`, `BattleRecapTroopEntry` in `src/ui/App.svelte`.
- Use string-literal unions for domain states and modes instead of enums: `ScreenMode` and `CenterMode` in `src/store/gameStore.ts`.
## Code Style
- No formatter config is checked in. There is no detected `.prettierrc`, `eslint.config.*`, `.eslintrc*`, or `biome.json` at the repo root.
- Follow the existing style from `src/engine/battle.ts`, `src/store/gameStore.ts`, and `src/ui/App.svelte`:
- TypeScript strictness is the main enforced style gate. `tsconfig.json` enables `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `verbatimModuleSyntax`.
- Preserve explicit null handling and optional chaining patterns that exist across `src/store/gameStore.ts` and `src/ui/App.svelte`.
## Import Organization
- Not used. All imports are relative paths such as `./game`, `../engine/types`, and `./BattleControls.svelte`.
## Error Handling
- Throw plain `Error` objects for invariant violations in pure modules: `getTroopById()` in `src/engine/army.ts`, spawn failure in `src/engine/battle.ts`.
- Return discriminated result objects for recoverable persistence and parsing flows: `deserializeGameState()` usage in `src/engine/campaign.test.ts`, `ReplayWriteResult` in `src/store/gameStore.ts`.
- Catch storage-layer failures close to the boundary and convert them to user-facing messages: `endCycle()` in `src/store/gameStore.ts`.
- Prefer narrow error classification helpers instead of stringly typed branches spread everywhere: `isQuotaExceeded()` in `src/store/gameStore.ts`.
## Logging
- Runtime code does not use `console.*` in `src/engine`, `src/store`, or `src/ui`.
- Surface diagnostics through typed return data, replay steps, or store state instead of console logging.
## Comments
- Keep comments sparse and only add them for domain rules or non-obvious invariants.
- Existing comments explain battle-order semantics and test intent, not line-by-line mechanics:
- Not used in the sampled code. Prefer well-typed signatures and descriptive names over block documentation.
## Function Design
- Most engine and store helpers are small, single-purpose functions even inside large modules like `src/engine/battle.ts` and `src/store/gameStore.ts`.
- Large files are organized as many focused helpers plus a small exported surface. Follow that pattern instead of adding more logic into one monolithic function.
- Pass typed domain objects or narrow `Pick<>` slices instead of broad mutable state: `resolveTroopCombatant()` and `getTroopById()` in `src/engine/army.ts`.
- Prefer explicit primitives over option bags when the call sites stay readable: `resolveEnemyCombatant()` in `src/engine/army.ts`.
- Use default parameters for optional behavior toggles: `endCycle(force = false)` in `src/store/gameStore.ts`, `makeReplayIndexEntry(replayId, summaryOnly = false)` in `src/store/gameStore.test.ts`.
- Engine functions generally return new objects instead of mutating caller-owned state: `claimOpeningTroop()` and `applyCycleOutcomes()` usage in `src/engine/campaign.test.ts`.
- Store actions wrap immutable updates inside Svelte `update()`/`set()` calls in `src/store/gameStore.ts`.
- Helper builders return fully shaped test or runtime objects so callers do not assemble partial records repeatedly: `makeReplay()` in `src/ui/battleRecap.test.ts`, `makeReplayPayload()` in `src/store/gameStore.test.ts`.
## Module Design
- Prefer named exports throughout. `src/engine/army.ts`, `src/engine/battle.ts`, `src/store/gameStore.ts`, and `src/ui/battleRecap.ts` all export named functions or constants.
- Keep the public API near the bottom of large modules when there is a long chain of private helpers, as in `src/engine/battle.ts`.
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
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- `src/engine/` is the authoritative domain layer. It owns campaign rules, battle simulation, typed data models, deterministic RNG, save serialization, and content catalogs.
- `src/store/` is the application boundary. It translates UI actions into engine calls, persists `GameState` and replay payloads in `localStorage`, and manages screen/replay state.
- `src/ui/` and `src/rendering/` are read-mostly presentation layers. They render resolved engine data and should not introduce gameplay rules or duplicate battle logic.
## Layers
- Purpose: Start the browser app and attach the root component.
- Location: `src/main.ts`
- Contains: CSS import and `new App(...)` bootstrap only.
- Depends on: `src/app.css`, `src/ui/App.svelte`
- Used by: Vite entry from `index.html`
- Purpose: Define game rules, battle resolution, campaign progression, rift generation, troop resolution, persistence shapes, and analysis helpers.
- Location: `src/engine/`
- Contains: Core modules such as `src/engine/types.ts`, `src/engine/game.ts`, `src/engine/battle.ts`, `src/engine/army.ts`, `src/engine/rift.ts`, `src/engine/unitCatalog.ts`, `src/engine/save.ts`
- Depends on: Other `src/engine/` modules only
- Used by: `src/store/`, selected pure UI helpers in `src/ui/`, offline scripts in `scripts/`
- Purpose: Hold app session state, bridge engine functions to UI events, manage save slots, replay persistence, and replay navigation.
- Location: `src/store/`
- Contains: `src/store/gameStore.ts`, `src/store/saveSlots.ts`, `src/store/replayNavigation.ts`, `src/store/debugBattleStore.ts`
- Depends on: `src/engine/`, `svelte/store`, browser `localStorage`
- Used by: `src/ui/App.svelte` and any future interactive UI entrypoints
- Purpose: Build the DOM application shell, menus, planning screen, overlays, tooltips, and replay side panels.
- Location: `src/ui/`
- Contains: Root screen `src/ui/App.svelte` plus focused components and pure formatting helpers like `src/ui/inspectText.ts`, `src/ui/battleRecap.ts`, `src/ui/riftVisuals.ts`
- Depends on: `src/store/`, selected read-only engine helpers, `src/rendering/BattleRenderer.ts`
- Used by: `src/main.ts`
- Purpose: Draw and animate battle replay state on a Pixi canvas.
- Location: `src/rendering/`
- Contains: `src/rendering/BattleRenderer.ts`, `src/rendering/unitVisuals.ts`
- Depends on: `pixi.js`, battle replay types from `src/engine/types.ts`, asset imports from `assets/` and `src/assets/`
- Used by: `src/ui/App.svelte`
- Purpose: Run heavy permutation and balance-report jobs outside the browser runtime.
- Location: `scripts/` and engine helpers `src/engine/permutationReport.ts`, `src/engine/simulationHarness.ts`
- Contains: worker-based report runners such as `scripts/reportPermutations2v2.ts`, `scripts/reportPermutations3v3.ts`, `scripts/permutationWorker.ts`
- Depends on: Node APIs, compiled output in `dist-scripts/`, pure engine modules
- Used by: `npm run report:2v2`, `npm run report:3v3`
## Data Flow
- Global runtime state lives in the singleton `gameStore` from `src/store/gameStore.ts`.
- Debug-only replay state lives separately in `src/store/debugBattleStore.ts`.
- Engine functions return plain data and new objects instead of mutating UI state directly.
## Key Abstractions
- Purpose: Provide a single contract for campaign, battle, replay, upgrade, and persistence data.
- Examples: `src/engine/types.ts`
- Pattern: Centralized TypeScript interfaces/types imported throughout the codebase
- Purpose: Store unit, faction, ability, mutator, and upgrade content separately from runtime resolution logic.
- Examples: `src/engine/unitCatalog.ts`
- Pattern: Large typed lookup tables plus composition helpers such as `composeBaseTroopDefinition()` and `getTroopUnlockId()`
- Purpose: Treat replay output as authoritative presentation data and enable reconstruction from seed/input.
- Examples: `src/engine/battle.ts`, `src/store/saveSlots.ts`
- Pattern: Pure resolver `resolveBattle(input)` returning `BattleReplay`, with replay payload storage reduced to deterministic `BattleInput`
- Purpose: Advance runs through opening unlock, planning, and game-over phases without UI-owned rule branches.
- Examples: `src/engine/game.ts`
- Pattern: Pure transition functions operating on `GameState`
- Purpose: Hide storage, replay persistence, validation warnings, and screen transitions from Svelte markup.
- Examples: `src/store/gameStore.ts`
- Pattern: Module-scoped `writable()` store wrapped in imperative methods
## Entry Points
- Location: `src/main.ts`
- Triggers: Browser page load through Vite
- Responsibilities: Import global CSS and mount `src/ui/App.svelte`
- Location: `src/ui/App.svelte`
- Triggers: Every user-visible browser interaction
- Responsibilities: Read store state, dispatch store actions, manage replay renderer lifecycle, and assemble the full UI
- Location: `src/engine/game.ts`
- Triggers: Store actions such as new campaign creation, offer claims, troop assignment, and cycle resolution
- Responsibilities: Own `GameState` transitions and battle launch/orchestration
- Location: `src/engine/battle.ts`
- Triggers: Campaign cycle resolution, debug battle runs, replay reconstruction
- Responsibilities: Expand combatants, place units, execute turn logic, emit snapshots/steps, and return `BattleReplay`
- Location: `scripts/reportPermutations2v2.ts`, `scripts/reportPermutations3v3.ts`
- Triggers: `npm run report:2v2`, `npm run report:3v3`
- Responsibilities: Kick off Node-based balance report generation using `src/engine/permutationReport.ts`
## Error Handling
- Engine accessors throw on impossible states, for example `src/engine/army.ts:getTroopById()` and many lookup helpers in `src/engine/unitCatalog.ts`.
- Save loading and replay loading use tolerant parsing and return `null` or structured result objects, for example `src/engine/save.ts` and `src/store/saveSlots.ts`.
- `src/store/gameStore.ts` catches replay-storage quota failures and degrades archived battles to summary-only entries instead of crashing the app.
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
