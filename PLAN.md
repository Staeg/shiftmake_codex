# AUDIT.md Implementation Plan

Status legend: `Done`, `Pending`, `Deferred`, `Verified no-op`.

## Summary

Implement `AUDIT.md` with correctness and low-risk simplifications first. Large engine/state rewrites are tracked as explicit follow-up milestones so they are not mixed into smaller fixes.

Compatibility policy: old v1 save migration and older replay-prefix readers may be removed. Current save-slot and replay storage remain supported.

## Correctness Fixes

- Done: Fix tutorial rewind storage to write `serializeGameState(game)` directly and read both corrected and previously double-encoded shapes.
- Done: Refactor `clearStaleEngagements` to collect bidirectional removals before mutating sets.
- Done: Make `preventDeath` use and decrement the protecting Priest's live `mercy-before-dawn` runtime ability state.
- Done: Raise the multiplayer draft loop guard to `Math.max(troopChoices.length + upgradeChoices.length + 5, 30)`.
- Done: Build multiplayer cycle animation records with real Rift `victoryPoints` and a recovery map for assigned troops.
- Done: Fix `formatPossessive` for labels ending in `s`.
- Done: Make `rosterCanFitOpenRifts` count discovered Rifts plus occupied contest slots.
- Done: Document intentional emergency overflow behavior in `expandedMapHexes`.

## Dead Code And Compatibility Cleanup

- Done: Give `makeAbility` real catalog validation behavior.
- Done: Replace `VICTORY_RECOVERY` / `DEFEAT_RECOVERY` with one `BATTLE_RECOVERY = 1`.
- Done: Remove `PermutationOverallEntry`; use `PermutationMatrixEntry`.
- Done: Remove `REPLAY_IDENTITY_KEY`; use an inline identity default.
- Done: Remove v1 save migration, `LEGACY_SAVE_KEY`, `LEGACY_REPLAY_PREFIX`, and old slot replay-prefix readers.
- Done: Move shared upgrade-id membership helper to `unitCatalog.ts`; use direct catalog membership instead of `try/catch`.
- Done: Remove `buildEqualCostBundle` from production `simulationHarness.ts`; keep it in the test file.
- Done: Remove dead `chaff` role normalization after confirming no current `src` fixtures require it.
- Done: Inline `uniqueInOrder` in `multiplayerContest.ts`.
- Verified no-op: Keep `InternalUnit.hexedStacks`; it is used by `final-hex`.
- Verified no-op: Keep ability verification coverage test; current tests already compare covered IDs to required IDs.

## Low-Risk Performance And Refactors

- Done: Cache sorted placement anchors per map/side during battle initialization.
- Done: Add early exit to `footprintDistance` for overlapping footprints.
- Pending: Add placement retry diagnostics or bounded failure metadata in `initializeUnits`.
- Done: Replace local `footprintsCollide` with shared `footprintsOverlap`.
- Done: Simplify permutation unit-class filtering.
- Done: Document mutating `mergePermutationAggregates`.
- Done: Extract shared replay timing constants for renderer, timeline, controls, and mini replay.
- Done: Shorten `buildContestAiPlanKey` to stable compact guardian identities instead of full resolved combatants.
- Done: Rename per-battle `backlineBreachRate` to `backlineBreached`.
- Pending: Merge duplicate upgrade-effect functions and make `resolveTroopCombatant` compute final stats and stat breakdowns in one pass.

## Public Interfaces And Docs

- Done: Update `TECHNICAL.md` persistence notes after legacy readers are removed.
- Done: Update this file as fixes land.
- Done: Keep engine purity intact: battle/game/report changes stay in `src/engine`; localStorage changes stay in `src/store`.

## Deferred Large Milestones

- Done: Contest protocol cleanup renamed seat IDs from `human` / `ai` to `playerOne` / `playerTwo` across engine state, multiplayer protocol, reconnect identity validation, room seating, replay metadata projection, and tests. Battle `SideId = 'player' | 'enemy'` remains unchanged.
- Done: Contest state symmetry now stores both seats under `contest.players.playerOne` and `contest.players.playerTwo`, projects multiplayer clients with root progress as "my player", keeps local vs AI using `playerTwo` for the AI-controlled seat, and repairs old v3 Contest saves from `human` / `ai` into the new seats without a version bump.
- Done: Battle replay recording now keeps the public `BattleReplay.initial`, `BattleStep.snapshot`, and `aliveCounts` shape while storing internal per-step unit deltas and materializing full snapshots at replay assembly.
- Done: Alive-unit indexes are maintained in `InternalState` with side-specific sets, summon/delayed-spawn/death/side-conversion helpers, indexed alive lookups, and DEV validation.
- Done: Permutation sweeps now expose chunked async APIs (`sweepBattleSeedsChunked`, `runPermutationBatchChunked`) with `chunkSize`, `yieldMs`, `AbortSignal`, and progress callbacks while keeping the synchronous APIs for tests and CLI scripts.

## Test Plan

- Done: Run `npm.cmd run test` after the deferred milestones; all 289 tests pass.
- Done: Run `npm.cmd run build` after the deferred milestones.
- Done: Existing multiplayer server, E2E, projection, campaign, battle, tutorial, and store tests were updated for `playerOne` / `playerTwo`. Existing deterministic battle and permutation tests pass against the replay recorder, alive indexes, and chunked API additions.
