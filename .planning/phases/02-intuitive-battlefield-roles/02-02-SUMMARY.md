---
phase: 02-intuitive-battlefield-roles
plan: 02
subsystem: testing
tags: [battle, simulation, replay, vitest, typescript]
requires:
  - phase: 02-01
    provides: typed replay role-intent metadata and role heuristics in the battle engine
provides:
  - canonical role-behavior benchmark battles for screening, breach, and spacing
  - replay intent counters and first-beat helpers for deterministic seed sweeps
  - multi-seed regression coverage for frontline screen timing, chaff commitment, and backline spacing
affects: [02-03 replay presentation, battle recap consumers, future balance harnesses]
tech-stack:
  added: []
  patterns: [canonical simulation scenario builders, replay-metadata seed sweeps, intent-count regression checks]
key-files:
  created: []
  modified: [src/engine/simulationHarness.ts, src/engine/simulationHarness.test.ts]
key-decisions:
  - "Canonical role scenarios stay in the existing simulation harness instead of introducing a separate benchmark DSL."
  - "Seed-sweep assertions are tied to replay intent metadata and threat timing so regressions stay readable and deterministic."
patterns-established:
  - "Role behavior regressions are measured across fixed seed ranges, not only single curated replays."
  - "Replay intent counters in the harness are the preferred hook for future phase-level tactical benchmarks."
requirements-completed: [ROLE-01, ROLE-03, ROLE-04, ROLE-05]
duration: 5min
completed: 2026-04-02
---

# Phase 2 Plan 2: Role Benchmark Sweep Summary

**Canonical role benchmark inputs plus replay-intent seed sweeps now guard frontline screening, chaff backline commitment, and ranged spacing over deterministic multi-seed runs**

## Performance

- **Duration:** 5 min
- **Started:** 2026-04-02T13:36:30Z
- **Completed:** 2026-04-02T13:41:23Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Added reusable harness builders for the three Phase 2 benchmark battles: `frontline-screen`, `chaff-breach`, and `backline-spacing`.
- Added `countRoleIntentSteps()` and `findFirstRoleIntentBeat()` so tests can assert role behavior from replay metadata instead of manual replay reading.
- Added deterministic seed-sweep tests that quantify screening, breach commitment, and spacing behavior across a fixed eight-seed range.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add reusable role-benchmark builders and replay-intent counters** - `aaecc6a` (feat)
2. **Task 2: Add deterministic seed-sweep regression tests for screen, breach, commitment, and spacing** - `c5d0772` (test)

**Plan metadata:** pending docs commit

## Files Created/Modified
- `src/engine/simulationHarness.ts` - Adds canonical role scenario builders and replay-intent counting helpers for benchmark analysis.
- `src/engine/simulationHarness.test.ts` - Adds the `role behavior seed sweeps` regression block covering screening, breach/hold, and spacing expectations.

## Decisions Made
- Reused existing catalog and unit-type combatant builders so the benchmark scenarios stay close to real troop definitions.
- Kept the sweep assertions strict and deterministic by checking replay intent presence and `firstBacklineThreatBeat` timing directly.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The shared worktree already had `src/ui/inspectText.ts` staged, so Task 1's commit `aaecc6a` unintentionally included that concurrent file alongside the harness change. No additional edits were made to that UI file in this plan.
- Final `npm run test` verification surfaced an unrelated concurrent failure in `src/ui/battleRecap.test.ts` for role-summary mapping. That issue was logged to `.planning/phases/02-intuitive-battlefield-roles/deferred-items.md` and left untouched because this plan only changes engine harness files.
- The Task 2 RED step passed immediately after the tests were written, which confirmed the new harness helpers and existing role runtime already satisfied the chosen sweep thresholds.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `02-03` can consume the benchmarked replay metadata knowing the engine now has reusable seed-sweep coverage.
- Future balance or heuristic plans can add more deterministic tactical scenarios by extending `buildRoleScenarioBattleInput()` rather than re-creating battle setups in individual tests.

## Known Stubs

None.

## Self-Check: PASSED

- Found `.planning/phases/02-intuitive-battlefield-roles/02-02-SUMMARY.md`
- Found commit `aaecc6a`
- Found commit `c5d0772`

---
*Phase: 02-intuitive-battlefield-roles*
*Completed: 2026-04-02*
