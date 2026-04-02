# External Integrations

**Analysis Date:** 2026-04-02

## APIs & External Services

**Gameplay / Backend Services:**
- None detected in the current application code under `src/`
  - SDK/Client: Not applicable
  - Auth: Not applicable

**HTTP / Network Calls:**
- No `fetch`, `XMLHttpRequest`, `WebSocket`, or similar browser/network client usage was detected in `src/`, `scripts/`, or `test/`
  - SDK/Client: Not applicable
  - Auth: Not applicable

**Package Registry During Development:**
- npm registry access is required only when installing dependencies from `package-lock.json`
  - SDK/Client: npm CLI
  - Auth: Not applicable for normal public-package installs

## Data Storage

**Databases:**
- None
  - Connection: Not applicable
  - Client: Not applicable

**File Storage:**
- Local filesystem only
  - Browser app assets are bundled from `assets/`, `src/assets/`, and referenced by files such as `src/rendering/unitVisuals.ts` and `src/ui/riftVisuals.ts`
  - Node report scripts write markdown, JSON, and checkpoint files under `balance_results/` via `scripts/reportPermutationsCommon.ts`
  - Report-script bundles are emitted to `dist-scripts/scripts/` by the `report:2v2` and `report:3v3` commands in `package.json`

**Caching:**
- Browser `localStorage` acts as the only persistent client-side cache/state store
  - Save-slot metadata and saves: `src/store/saveSlots.ts`
  - Replay payload persistence and eviction handling: `src/store/gameStore.ts`

## Authentication & Identity

**Auth Provider:**
- None
  - Implementation: Not applicable

## Monitoring & Observability

**Error Tracking:**
- None detected

**Logs:**
- Browser app: user-facing messages are stored in Svelte state inside `src/store/gameStore.ts`; dedicated remote logging is not present
- Node report scripts: progress and fallback logging uses `console.log`, `console.warn`, and `console.error` in `scripts/reportPermutationsCommon.ts`, `scripts/reportPermutations2v2.ts`, and `scripts/reportPermutations3v3.ts`

## CI/CD & Deployment

**Hosting:**
- Not detected
- The build output is static web content in `dist/`, which implies the app is ready for static hosting, but no provider-specific config is present in the repository root

**CI Pipeline:**
- Not detected
- No repository-level `.github/workflows/`, Docker deployment files, or other CI config were found outside dependencies

## Environment Configuration

**Required env vars:**
- None detected
- No `.env` files were present at the repository root during this analysis
- No `process.env` or `import.meta.env` lookups were found in `src/`, `scripts/`, or `test/`

**Secrets location:**
- Not applicable in the current codebase

## Webhooks & Callbacks

**Incoming:**
- None

**Outgoing:**
- None

## Browser / Platform Integrations

**Web Platform APIs:**
- DOM mount target: `src/main.ts` mounts Svelte into the `#app` element declared in `index.html`
- `localStorage`: save/load and replay archive persistence in `src/store/saveSlots.ts` and `src/store/gameStore.ts`

**Graphics Runtime:**
- PixiJS is the only notable runtime integration beyond core browser APIs
  - Rendering entrypoint: `src/rendering/BattleRenderer.ts`
  - Texture loading: `src/rendering/unitVisuals.ts`

**Node Worker Threads:**
- The report-generation toolchain parallelizes offline analysis with `node:worker_threads`
  - Worker launcher and checkpointing: `scripts/reportPermutationsCommon.ts`
  - Worker implementation: `scripts/permutationWorker.ts`

## Practical Guidance For Future Work

- Add new third-party services behind a dedicated boundary instead of mixing them into `src/engine/`; the current codebase has no existing service layer to extend
- If cloud persistence or analytics is introduced, document the new env vars and keep browser-only save behavior in `src/store/saveSlots.ts` as a clear fallback or migration path
- If CI/CD is added, anchor it to the existing npm commands in `package.json` so planning and execution tooling can rely on one command surface

---

*Integration audit: 2026-04-02*
