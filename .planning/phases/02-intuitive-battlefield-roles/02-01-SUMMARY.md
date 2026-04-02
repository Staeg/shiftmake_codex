---
phase: 02-intuitive-battlefield-roles
plan: 01
subsystem: engine
tags: [battle, replay, heuristics, vitest, typescript]
requires:
  - phase: 01-compact-ui-layouts
    provides: readable replay and battle surfaces that consume engine output
provides:
  - deterministic role-behavior scenario coverage for frontline, chaff, and backline
  - typed battle replay metadata for role intent, reason codes, and target hexes
  - engine-owned frontline screening, chaff commitment, and backline retreat heuristics
affects: [02-02 simulation benchmarks, 02-03 replay presentation, battle replay consumers]
tech-stack:
  added: []
  patterns: [typed replay metadata contracts, role-specific objective helpers, transient battle-only commitment state]
key-files:
  created: [src/engine/roleBehavior.test.ts]
  modified: [src/engine/types.ts, src/engine/battle.ts]
key-decisions:
  - "Role intent stays engine-authored through typed replay metadata instead of UI-side interpretation."
  - "Chaff backline commitment is transient battle runtime state on internal units, not persisted game state."
patterns-established:
  - "Scenario tests pin tactical role behavior with fixed seeds before refactoring battle heuristics."
  - "Role move and engage steps emit readable intent metadata directly from battle.ts."
requirements-completed: [ROLE-01, ROLE-02, ROLE-03, ROLE-04, ROLE-05, ROLE-06]
duration: 9min
completed: 2026-04-02
---

# Phase 2 Plan 1: Engine Role Contract Summary

**Typed replay role intent with deterministic frontline screening, chaff backline commitment, and backline spacing heuristics in the pure battle engine**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-02T13:27:00Z
- **Completed:** 2026-04-02T13:35:59Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Added a dedicated `roleBehavior.test.ts` suite that locks Phase 2 role expectations with fixed-seed scenarios.
- Replaced generic `BattleStep.metadata` with a typed replay contract covering role intent, reason codes, target roles, and target hex coordinates.
- Refactored `battle.ts` around explicit role objective helpers, deterministic retreat scoring, and chaff backline commitment memory.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add role-behavior scenario tests before touching the runtime** - `29ec7c5` (test)
2. **Task 2: Define typed replay role-intent metadata in the engine contracts** - `ff3c338` (feat)
3. **Task 3: Replace generic pursuit and retreat decisions with role-specific heuristics** - `683e903` (feat)

**Plan metadata:** pending docs commit

## Files Created/Modified
- `src/engine/roleBehavior.test.ts` - Adds fixed-seed role behavior scenarios and replay intent assertions.
- `src/engine/types.ts` - Defines `RoleIntentId` and `BattleStepMetadata` for typed replay intent fields.
- `src/engine/battle.ts` - Adds role objective pickers, intent step emission, retreat scoring, and chaff commitment memory.

## Decisions Made
- Typed metadata now carries replay intent fields so later UI work can consume structured engine output instead of parsing prose.
- Chaff commitment is stored only in internal battle state and cleared when the committed backline target is no longer legal.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- A direct `node --input-type=module` import path was not usable for quick battle probing because the repo relies on Vite/TS resolution. Full `npm run test` remained the reliable validation path and was used throughout.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The engine now exposes stable role-intent data for simulation benchmarking in `02-02` and replay presentation work in `02-03`.
- No blockers remain from this plan; the next plans can build directly on the new tests and metadata contract.

## Self-Check: PASSED

- Found `.planning/phases/02-intuitive-battlefield-roles/02-01-SUMMARY.md`
- Found commit `29ec7c5`
- Found commit `ff3c338`
- Found commit `683e903`

---
*Phase: 02-intuitive-battlefield-roles*
*Completed: 2026-04-02*
