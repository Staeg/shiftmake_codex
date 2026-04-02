# Codebase Structure

**Analysis Date:** 2026-04-02

## Directory Layout

```text
[project-root]/
├── src/                 # Browser app source: engine, stores, UI, rendering, CSS, imported sprites
├── scripts/             # Node entrypoints for permutation and balance reporting
├── assets/              # Runtime-loaded PNG/JPG faction, unit, and rift art
├── design documents/    # Game design reference docs
├── test/                # Non-unit-test artifact area; currently `test/balance/`
├── dist/                # Vite production build output
├── dist-scripts/        # Generated Node bundles for report scripts
├── balance_results/     # Generated permutation/balance report output
├── .planning/codebase/  # Planner reference docs
├── TECHNICAL.md         # Current technical spec and architecture constraints
├── AGENTS.md            # Repository-specific agent instructions
├── package.json         # npm scripts and dependency manifest
└── vite.config.mts      # Vite config
```

## Directory Purposes

**`src/engine/`:**
- Purpose: Pure TypeScript gameplay and simulation domain.
- Contains: Campaign state transitions, battle resolution, rift generation, typed models, save serialization, deterministic RNG, stat math, and analysis helpers.
- Key files: `src/engine/game.ts`, `src/engine/battle.ts`, `src/engine/unitCatalog.ts`, `src/engine/types.ts`, `src/engine/army.ts`, `src/engine/rift.ts`

**`src/store/`:**
- Purpose: Svelte-facing orchestration and persistence layer.
- Contains: Singleton writable stores, replay step navigation, save-slot adapters, and debug battle store state.
- Key files: `src/store/gameStore.ts`, `src/store/saveSlots.ts`, `src/store/replayNavigation.ts`, `src/store/debugBattleStore.ts`

**`src/ui/`:**
- Purpose: DOM/Svelte presentation layer.
- Contains: `App.svelte`, focused replay/planning components, and read-only display helpers.
- Key files: `src/ui/App.svelte`, `src/ui/BattleControls.svelte`, `src/ui/EventLog.svelte`, `src/ui/StatBreakdownGrid.svelte`, `src/ui/UnitTooltip.svelte`, `src/ui/battleRecap.ts`, `src/ui/inspectText.ts`

**`src/rendering/`:**
- Purpose: Pixi-specific replay rendering.
- Contains: Canvas renderer implementation and texture-loading helpers.
- Key files: `src/rendering/BattleRenderer.ts`, `src/rendering/unitVisuals.ts`

**`src/assets/`:**
- Purpose: Small source-controlled SVG assets imported from TypeScript.
- Contains: Projectile and sprite SVGs used by Pixi rendering.
- Key files: `src/assets/sprites/projectile.svg`, `src/assets/sprites/archer.svg`

**`assets/`:**
- Purpose: Larger runtime art assets imported by Vite from outside `src/`.
- Contains: `assets/unit sprites/`, `assets/faction sprites/`, `assets/rift sprites/`
- Key files: `assets/unit sprites/archer.png`, `assets/faction sprites/human.png`, `assets/rift sprites/rift1.jpg`

**`scripts/`:**
- Purpose: Node-only utilities for permutation analysis and report generation.
- Contains: CLI wrappers, a worker entrypoint, shared report orchestration, and Node typing shims.
- Key files: `scripts/reportPermutations2v2.ts`, `scripts/reportPermutations3v3.ts`, `scripts/reportPermutationsCommon.ts`, `scripts/permutationWorker.ts`

**`design documents/`:**
- Purpose: Non-code design reference material.
- Contains: Gameplay design docs named by system area.
- Key files: `design documents/Overview.md`, `design documents/Battle details.md`, `design documents/Overworld.md`

**`test/`:**
- Purpose: Non-source test/support directory.
- Contains: `test/balance/` only; the main automated test suite is co-located under `src/`
- Key files: Not applicable

**`dist/`:**
- Purpose: Generated browser build output.
- Contains: Bundled HTML, CSS, JS, and copied assets from Vite.
- Key files: `dist/index.html`

**`dist-scripts/`:**
- Purpose: Generated Node bundles for report scripts.
- Contains: Compiled engine and script outputs referenced by npm report commands.
- Key files: `dist-scripts/scripts/reportPermutations2v2.js`, `dist-scripts/scripts/permutationWorker.js`

**`balance_results/`:**
- Purpose: Generated balance report output.
- Contains: Markdown, JSON, and checkpoint files when report scripts are run.
- Key files: Generated at runtime; treat as output, not source

## Key File Locations

**Entry Points:**
- `src/main.ts`: Browser bootstrap for the production app
- `src/ui/App.svelte`: Root Svelte screen and runtime coordinator
- `scripts/reportPermutations2v2.ts`: 2v2 balance report entrypoint
- `scripts/reportPermutations3v3.ts`: 3v3 balance report entrypoint

**Configuration:**
- `package.json`: Scripts, dependencies, and report command wiring
- `vite.config.mts`: Vite config
- `tsconfig.json`: Main TypeScript config
- `tsconfig.scripts.json`: Script-specific TypeScript config
- `svelte.config.js`: Svelte integration config
- `TECHNICAL.md`: Authoritative architectural guardrails for engine/UI separation

**Core Logic:**
- `src/engine/types.ts`: Shared type model for game, battle, replay, and persistence
- `src/engine/unitCatalog.ts`: Declarative content catalog and composition helpers
- `src/engine/army.ts`: Troop resolution and recovery/stat helpers
- `src/engine/game.ts`: Campaign lifecycle and cycle resolution
- `src/engine/battle.ts`: Deterministic battle simulator and replay generator
- `src/engine/rift.ts`: Rift generation rules

**Testing:**
- `src/engine/*.test.ts`: Engine and simulation tests
- `src/store/*.test.ts`: Store and persistence tests
- `src/ui/battleRecap.test.ts`: Pure UI helper test

## Naming Conventions

**Files:**
- Runtime modules use lower camel case or descriptive Pascal-less names, for example `gameStore.ts`, `replayNavigation.ts`, `battleRecap.ts`
- Svelte components use PascalCase `.svelte`, for example `App.svelte`, `BattleControls.svelte`, `UnitTooltip.svelte`
- Tests are co-located as `*.test.ts`, for example `src/engine/battle.test.ts`

**Directories:**
- Source directories are short lowercase nouns by layer, for example `src/engine/`, `src/store/`, `src/ui/`, `src/rendering/`
- Asset directories use descriptive names with spaces outside `src/`, for example `assets/unit sprites/`

## Where to Add New Code

**New Engine Mechanic or Rule:**
- Primary code: `src/engine/`
- Tests: co-locate as `src/engine/<feature>.test.ts`
- Guidance: Put shared shape changes in `src/engine/types.ts`, declarative content in `src/engine/unitCatalog.ts`, and transition/simulation logic in the most specific engine module rather than `src/ui/` or `src/store/`

**New Campaign / Overworld Behavior:**
- Primary code: `src/engine/game.ts`, `src/engine/rift.ts`, or a new pure module under `src/engine/`
- UI wiring: `src/store/gameStore.ts` and `src/ui/App.svelte`
- Tests: `src/engine/campaign.test.ts` or a new adjacent engine/store test file

**New Replay or Battle Presentation:**
- Renderer implementation: `src/rendering/`
- Replay controls/panels: `src/ui/`
- Guidance: Consume `BattleReplay` and replay steps directly; do not recompute battle outcomes in the renderer or component layer

**New Persistent UI State or User Action:**
- Implementation: `src/store/gameStore.ts`
- Storage helpers: `src/store/saveSlots.ts` if it changes save/replay persistence
- Tests: `src/store/gameStore.test.ts` or `src/store/saveSlots.test.ts`

**New Reusable Display Helper:**
- Shared helpers: `src/ui/inspectText.ts`, `src/ui/battleRecap.ts`, or a new pure module in `src/ui/`
- Guidance: Keep it presentation-only; if it starts changing rules or campaign state, move it to `src/engine/`

**New Balance / Analysis Tooling:**
- Implementation: `scripts/` plus pure helpers in `src/engine/simulationHarness.ts` or `src/engine/permutationReport.ts`
- Output: `balance_results/`
- Guidance: Keep Node APIs out of `src/engine/` modules that are consumed by the browser runtime unless they are script-only helpers invoked from `scripts/`

## Special Directories

**`dist/`:**
- Purpose: Browser production bundle
- Generated: Yes
- Committed: Yes in current workspace state

**`dist-scripts/`:**
- Purpose: Bundled Node report scripts and compiled engine dependencies
- Generated: Yes
- Committed: Yes in current workspace state

**`balance_results/`:**
- Purpose: Balance-report artifacts and checkpoints
- Generated: Yes
- Committed: Present in repo state; treat as output

**`.planning/codebase/`:**
- Purpose: Planner/reference documentation for future automated phases
- Generated: Yes
- Committed: Intended planning artifact area

## Practical Placement Rules

- Add browser gameplay logic to `src/engine/`, not `src/ui/` or `src/rendering/`. `TECHNICAL.md` explicitly treats `src/engine/` as the only rules layer.
- Add stateful UI actions to `src/store/gameStore.ts` before touching `src/ui/App.svelte`; `App.svelte` already acts as a thin dispatcher over store methods.
- Keep `src/ui/App.svelte` from growing more rule branches. Extract new pure display helpers into `src/ui/` or new action methods into `src/store/`.
- Extend `src/engine/types.ts` first when a new feature needs shared data across engine, store, and UI layers.
- Place new tests next to the code they verify. The repo’s active pattern is co-located tests inside `src/`, not a separate global test tree.
- Do not add source edits to `dist/`, `dist-scripts/`, or `balance_results/`; regenerate those from source and scripts instead.

---

*Structure analysis: 2026-04-02*
