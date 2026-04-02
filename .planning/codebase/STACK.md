# Technology Stack

**Analysis Date:** 2026-04-02

## Languages

**Primary:**
- TypeScript 5.5.x - application code in `src/`, Node-side report scripts in `scripts/`, and tests in `src/**/*.test.ts` per `package.json` and `tsconfig.json`

**Secondary:**
- JavaScript (ES modules) - Svelte/Vite config in `svelte.config.js`
- CSS - global app styling in `src/app.css`
- HTML - Vite entry shell in `index.html`

## Runtime

**Environment:**
- Browser runtime for the shipped game client, bootstrapped from `src/main.ts`
- Node.js runtime for development tooling, tests, Vite builds, and permutation-report scripts in `scripts/reportPermutationsCommon.ts`

**Package Manager:**
- npm
- Lockfile: present in `package-lock.json` (lockfileVersion 3)

## Frameworks

**Core:**
- Vite 5.4.x - dev server and production bundler, configured in `vite.config.mts`
- Svelte 4.2.x - UI layer mounted from `src/main.ts` and implemented under `src/ui/`
- PixiJS 7.4.x - battle rendering layer in `src/rendering/BattleRenderer.ts` and `src/rendering/unitVisuals.ts`

**Testing:**
- Vitest 2.0.x - test runner used by `npm run test` / `npm run test:watch` from `package.json`

**Build/Dev:**
- `@sveltejs/vite-plugin-svelte` 3.1.x - Svelte integration for Vite in `vite.config.mts`
- `@tsconfig/svelte` 5.0.x - base TypeScript config extended by `tsconfig.json`
- esbuild - used indirectly from `package.json` report scripts to bundle `scripts/reportPermutations2v2.ts`, `scripts/reportPermutations3v3.ts`, and `scripts/permutationWorker.ts` into `dist-scripts/scripts/`

## Key Dependencies

**Critical:**
- `svelte` - component runtime for `src/ui/App.svelte`, `src/ui/BattleControls.svelte`, `src/ui/EventLog.svelte`, and related UI files
- `pixi.js` - rendering engine for battle playback in `src/rendering/BattleRenderer.ts`
- `typescript` - strict typing across the pure engine in `src/engine/` and stores in `src/store/`
- `vite` - required for `npm run dev`, `npm run build`, and `npm run preview`
- `vitest` - covers engine, store, and selected UI helper behavior in files such as `src/engine/battle.test.ts`, `src/store/gameStore.test.ts`, and `src/ui/battleRecap.test.ts`

**Infrastructure:**
- Browser `localStorage` - persistence layer for saves and replay payloads in `src/store/saveSlots.ts` and `src/store/gameStore.ts`
- Node built-ins (`node:fs/promises`, `node:path`, `node:os`, `node:worker_threads`, `node:crypto`) - report generation and checkpointing in `scripts/reportPermutationsCommon.ts` and `scripts/permutationWorker.ts`

## Configuration

**Environment:**
- No `.env` files were detected at the repository root during this analysis
- No `process.env` or `import.meta.env` usage was detected in `src/`, `scripts/`, or `test/`
- Runtime behavior is configured in code and package scripts rather than external environment variables

**Build:**
- `package.json` defines the supported commands: `dev`, `build`, `preview`, `test`, `test:watch`, `report:2v2`, and `report:3v3`
- `vite.config.mts` enables the Svelte plugin and otherwise keeps Vite close to default configuration
- `svelte.config.js` enables `vitePreprocess()`
- `tsconfig.json` enforces strict typing, `moduleResolution: "Bundler"`, `target: "ES2022"`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`
- `tsconfig.scripts.json` exists for script-side TypeScript compilation context

## Platform Requirements

**Development:**
- Node.js and npm are required to run the Vite dev server, Vitest, and the Node report scripts declared in `package.json`
- A modern browser is required to run the client built from `src/main.ts`

**Production:**
- Static web deployment target: `npm run build` emits browser assets into `dist/`
- No backend service, database server, or API gateway is required by the current app code in `src/`

## Practical Notes

- Keep gameplay logic in the pure TypeScript engine under `src/engine/`; the architecture rule is documented in `TECHNICAL.md` and reflected by the import boundaries in `src/`
- Treat `scripts/` as a separate Node-only toolchain. Those scripts write analysis artifacts to `balance_results/` and compiled helpers to `dist-scripts/`
- Persistence is browser-only and local. Any future cloud save, telemetry, or multiplayer work would be a new integration rather than an extension of an existing service layer

---

*Stack analysis: 2026-04-02*
