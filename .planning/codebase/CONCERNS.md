# Codebase Concerns

**Analysis Date:** 2026-04-02

## Tech Debt

**Root UI composition in `App.svelte`:**
- Issue: `src/ui/App.svelte` is a 2,500+ line root component that owns menu flow, overworld selection, replay controls, tooltip/detail-card assembly, Pixi renderer lifecycle, and large amounts of derived UI state in one file.
- Files: `src/ui/App.svelte`
- Impact: Small UI changes have a wide blast radius, replay and overworld concerns are hard to reason about independently, and component-level testing is discouraged by the current shape.
- Fix approach: Split `src/ui/App.svelte` by screen and responsibility first, not by visual fragments. Extract replay-state selectors, detail-card builders, and slot/overworld sections into focused modules or components with narrow props.

**Battle runtime concentrated in one module:**
- Issue: `src/engine/battle.ts` combines map setup, spawn placement, targeting, movement, engagement rules, ability execution, temporary effect expiry, death handling, replay generation, and debug battle assembly in one 1,800+ line file.
- Files: `src/engine/battle.ts`
- Impact: Rule changes are risky because combat behavior is coupled through shared mutable internal state. New abilities are likely to introduce regressions outside their intended mechanic.
- Fix approach: Preserve the pure-engine boundary, but split the file into runtime submodules such as spawn/setup, targeting, ability resolution, turn execution, and replay assembly. Add tests at those seams before large mechanical additions.

**Store layer mixes persistence policy with UI control flow:**
- Issue: `src/store/gameStore.ts` owns screen state, replay playback state, cycle-end confirmation UX, replay retention behavior, and direct `localStorage` writes/removals. `src/store/saveSlots.ts` also embeds migration and replay reconstruction policy.
- Files: `src/store/gameStore.ts`, `src/store/saveSlots.ts`
- Impact: Storage changes and UI-flow changes are tightly coupled. It is easy to break save behavior while editing replay UX, and vice versa.
- Fix approach: Introduce a persistence service around `src/store/saveSlots.ts`, keep replay-retention decisions out of Svelte store actions, and leave `gameStore` responsible for view state plus engine calls.

## Known Bugs

**Archived replay history can drift after engine or balance changes:**
- Symptoms: Old archived battles are not immutable. The same archived entry can produce a different replay after changes to combat logic, unit stats, targeting rules, or mutators.
- Files: `src/engine/game.ts`, `src/store/saveSlots.ts`, `src/engine/battle.ts`
- Trigger: `src/engine/game.ts` stores only `{ version: 1, input }` in `StoredReplayPayload`, and `src/store/saveSlots.ts` reconstructs archives by calling `resolveBattle(parsed.input)` when a replay is opened.
- Workaround: None in-app. A stable archive requires storing resolved replay output or a version-pinned combat interpreter.

**Legacy replay payloads are copied forward but not cleaned up:**
- Symptoms: Migrating an old save leaves legacy replay keys behind in browser storage, consuming quota even though the slot now has copied replay payloads under the v2 slot namespace.
- Files: `src/store/saveSlots.ts`
- Trigger: `migrateLegacySave()` copies keys from the `shiftmake:replay:` namespace via `copyLegacyReplaysToSlot()` and removes `shiftmake:save:v1`, but it does not remove the original legacy replay keys afterward.
- Workaround: Manual localStorage cleanup outside the app.

**Corrupted replay payloads are reported as summary-only battles:**
- Symptoms: A missing payload, malformed JSON payload, replay reconstruction error, and an intentionally summary-only archive all collapse to the same user outcome: “This archived battle is only available as a summary.”
- Files: `src/store/saveSlots.ts`, `src/store/gameStore.ts`
- Trigger: `readSlotReplay()` catches parse/reconstruction failures and returns `null`, and `openReplay()` maps `null` to the summary-only message.
- Workaround: None in-app. Browser storage must be inspected manually to tell corruption from intentional eviction.

## Security Considerations

**Save and replay integrity is easy to tamper with:**
- Risk: Campaign data and archived battle inputs are stored as plain JSON in browser `localStorage` without integrity checks.
- Files: `src/engine/save.ts`, `src/store/saveSlots.ts`, `src/store/gameStore.ts`
- Current mitigation: `deserializeGameState()` checks top-level version and a few top-level arrays.
- Recommendations: Validate nested shapes before accepting stored state, reject impossible enum values and malformed replay index entries, and add a checksum or schema version gate for replay payloads.

**Malformed stored state can reach runtime code paths with minimal validation:**
- Risk: `deserializeGameState()` accepts any object with `version === 2` plus array-shaped `troops`, `openRifts`, and `replayIndex`, then casts it directly to `GameState`.
- Files: `src/engine/save.ts`
- Current mitigation: Invalid JSON and obvious version mismatches are rejected.
- Recommendations: Add full structural validation for troop instances, rifts, offers, replay index entries, and phase strings before loading into the store.

## Performance Bottlenecks

**Cycle-end persistence is synchronous and serialization-heavy:**
- Problem: Ending a cycle serializes each replay payload, writes each payload into `localStorage`, may delete older payloads, then saves the entire campaign and refreshes slot summaries synchronously on the main thread.
- Files: `src/store/gameStore.ts`, `src/engine/game.ts`, `src/store/saveSlots.ts`
- Cause: `persistReplayPayloadWrites()` uses `JSON.stringify()` plus repeated `storage.setItem()` attempts, and `saveActiveCampaign()` immediately calls `listSaveSlots(localStorage)` after every save.
- Improvement path: Cache slot summaries in memory, avoid reparsing every slot after every write, and move replay-size accounting away from repeated runtime serialization if archive volume grows.

**Replay opening cost scales with resolver complexity:**
- Problem: Opening an archived battle can require a full call to `resolveBattle()` before the replay UI can render.
- Files: `src/store/saveSlots.ts`, `src/engine/battle.ts`
- Cause: Replays are stored as battle inputs rather than resolved outputs.
- Improvement path: Persist resolved replay snapshots for shipped archives, or cache reconstructed results after first open per session.

**Permutation analysis grows combinatorially with roster size:**
- Problem: Balance-report generation scales very quickly as more unit types are added.
- Files: `src/engine/permutationReport.ts`, `scripts/reportPermutationsCommon.ts`, `scripts/permutationWorker.ts`
- Cause: `generatePermutationTeams()` creates combinations of all eligible unit types, then `generatePermutationMatchups()` compares every team pair. With the currently documented 17 non-summoned unit types, `3v3` already implies 680 teams and 230,860 pairings before multiplying by run count.
- Improvement path: Keep these scripts off the interactive path, add hard previews/guards before large runs, and consider sampling or pruning strategies instead of exhaustive pair generation.

## Fragile Areas

**Svelte-to-Pixi replay synchronization is hand-managed:**
- Files: `src/ui/App.svelte`, `src/rendering/BattleRenderer.ts`
- Why fragile: Replay state is mirrored across Svelte reactivity and imperative renderer state using `ensureRenderer()`, `syncRenderer()`, interval playback, hover locks, highlight keys, and window resize hooks. Ordering mistakes can produce stale visuals or stuck selection state.
- Safe modification: Change replay data flow in one direction only. Prefer deriving data in Svelte and pushing minimal commands into `BattleRenderer` instead of adding more bidirectional state.
- Test coverage: No automated tests cover `src/rendering/BattleRenderer.ts` or the replay interactions inside `src/ui/App.svelte`.

**Catalog edits have broad downstream effects:**
- Files: `src/engine/unitCatalog.ts`, `src/engine/army.ts`, `src/engine/battle.ts`, `src/engine/game.ts`
- Why fragile: The catalog is the source of truth for abilities, faction modifiers, costs, unlockability, and battle mutators. A single content edit can affect recruitment quantities, draft-offer buckets, combat resolution, and balance scripts at once.
- Safe modification: Treat catalog edits like code changes. Re-run engine tests plus any relevant permutation scripts when changing abilities, costs, or unlockability rules.
- Test coverage: Engine tests cover many ability behaviors, but there is no dedicated golden-data suite for full catalog regression snapshots.

**Storage failure handling is lossy:**
- Files: `src/store/gameStore.ts`, `src/store/saveSlots.ts`
- Why fragile: Quota problems, parse failures, and missing payloads are collapsed into broad user-facing messages and `null` returns. That keeps the app moving, but it hides whether the underlying issue is eviction, corruption, or code regression.
- Safe modification: Add explicit failure types from storage helpers before changing replay retention behavior.
- Test coverage: `src/store/gameStore.test.ts` covers quota fallback paths, but not corrupted payload handling or end-to-end browser storage failure scenarios.

## Scaling Limits

**Replay archive retention is intentionally capped by browser storage:**
- Current capacity: `src/engine/game.ts` keeps at most 40 replay index entries and enforces an aggregate soft cap of roughly 4 MB based on `estimatedBytes`.
- Limit: Additional archived battles are reduced to summary-only entries or have older payloads evicted when storage pressure rises.
- Scaling path: Move replay storage out of `localStorage`, or separate immutable archives from the active campaign save with a storage backend that can hold resolved replay data.

**Browser-only persistence constrains long-running campaigns and future platforms:**
- Current capacity: Save slots and archive payloads depend on browser `localStorage` from `src/store/gameStore.ts` and `src/store/saveSlots.ts`.
- Limit: There is no sync, no cross-device recovery, and no abstraction ready for mobile or multiplayer persistence.
- Scaling path: Introduce a persistence interface before platform expansion so storage policy is not hard-coded into the Svelte store.

## Dependencies at Risk

**No immediate dependency-specific blocker detected:**
- Risk: The current main risk comes from custom monolithic modules rather than a single failing package.
- Impact: Most future migration cost will come from internal coupling in `src/ui/App.svelte`, `src/engine/battle.ts`, and `src/store/gameStore.ts`.
- Migration plan: Reduce internal coupling first, then evaluate framework/runtime upgrades after module boundaries are cleaner.

## Missing Critical Features

**No forward migration path for saves or archived replays:**
- Problem: `src/engine/save.ts` rejects older game versions, and archived replays are stored with a payload version but no migration path or compatibility strategy.
- Blocks: Safe evolution of campaign schema and reliable preservation of historical battle archives across content updates.

**No runtime diagnostics for production-only storage or renderer failures:**
- Problem: The browser app has no structured logging, crash capture, or telemetry around Pixi initialization, archive reconstruction, or storage corruption.
- Blocks: Fast diagnosis of field failures once behavior diverges from local test coverage.

## Test Coverage Gaps

**Main UI flows are largely untested:**
- What's not tested: Save-slot interactions, opening unlock flow rendering, troop/rift selection behavior, replay panel state, tooltip/detail-card behavior, and cycle-end confirmation UX as rendered in Svelte.
- Files: `src/ui/App.svelte`
- Risk: Regressions in interaction wiring can ship even while engine and store tests remain green.
- Priority: High

**Renderer behavior has no automated safety net:**
- What's not tested: Pixi asset loading, viewport reset/zoom behavior, pointer interactions, unit highlighting, drag behavior, and replay-step rendering in `BattleRenderer`.
- Files: `src/rendering/BattleRenderer.ts`, `src/rendering/unitVisuals.ts`
- Risk: Visual regressions and input bugs will only surface through manual playtesting.
- Priority: High

**Corruption and migration edge cases are under-tested:**
- What's not tested: Malformed nested save data, corrupted replay payloads, legacy replay-key cleanup, and differentiation between summary-only entries and failed replay reconstruction.
- Files: `src/engine/save.ts`, `src/store/saveSlots.ts`, `src/store/gameStore.ts`
- Risk: Browser storage edge cases can silently degrade saves and archives without a clear failure signal.
- Priority: Medium

---

*Concerns audit: 2026-04-02*
