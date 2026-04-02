---
phase: 01-compact-ui-layouts
plan: 01
subsystem: ui
tags: [svelte, css, compact-layout, replay-ui]
requires: []
provides:
  - Shared compact spacing, typography, shell, and panel tokens in `src/app.css`
  - Token-driven shell, panel, and bounded overflow rules in `src/ui/App.svelte`
affects: [01-02-PLAN.md, 01-03-PLAN.md, phase-01-ui-density]
tech-stack:
  added: []
  patterns: [shared-css-tokens, token-driven-shell-layout, bounded-panel-overflow]
key-files:
  created: [.planning/phases/01-compact-ui-layouts/01-01-SUMMARY.md]
  modified: [src/app.css, src/ui/App.svelte]
key-decisions:
  - "Centralized the Phase 1 density contract in `src/app.css` so later screen passes can consume one compact token set."
  - "Reduced shell and replay chrome by switching shared layout rules in `App.svelte` to token-driven spacing, radii, and bounded overflow."
patterns-established:
  - "Compact UI tokens live in `src/app.css` and are consumed from feature CSS instead of repeating ad hoc spacing values."
  - "Gameplay shells keep page-level fit by preferring internal overflow in dense panels and replay side rails."
requirements-completed: [UI-04]
duration: 9min
completed: 2026-04-02
---

# Phase 1 Plan 1: Compact UI Layouts Summary

**Compact Phase 1 shell tokens with token-driven panel chrome and bounded replay-side overflow for the existing menu, overworld, and replay navigation model**

## Performance

- **Duration:** 9 min
- **Started:** 2026-04-02T16:32:00+02:00
- **Completed:** 2026-04-02T16:41:34+02:00
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Centralized the approved spacing, typography, shell sizing, panel radius, and palette contract in `src/app.css`.
- Retuned the shared shell, topbar, panel, grid, and replay layout rules in `src/ui/App.svelte` to consume compact tokens instead of larger one-off values.
- Tightened replay viewport and side-rail overflow behavior so dense content prefers bounded internal scrolling over shell growth.

## Task Commits

Each task was committed atomically:

1. **Task 1: Move the UI-spec spacing and typography contract into shared CSS tokens** - `570a8a8` (`feat`)
2. **Task 2: Tighten the shared shell, panel, and overflow rules in App.svelte** - `a0a4f5a` (`feat`)

## Files Created/Modified
- `.planning/phases/01-compact-ui-layouts/01-01-SUMMARY.md` - Execution record for plan `01-01`.
- `src/app.css` - Compact typography, spacing, shell, panel, and palette tokens aligned to the approved UI spec.
- `src/ui/App.svelte` - Shared shell, panel, card, replay viewport, and overflow rules updated to consume the compact tokens.

## Decisions Made
- Centralized the layout density contract in `src/app.css` instead of adding more one-off values inside `App.svelte`, so follow-up Phase 1 plans can reuse the same scale.
- Kept the existing `main_menu`, `overworld`, and `replay` branches intact and limited this plan to shared CSS compaction, which matches the brownfield baseline scope.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `vite build` still reports the pre-existing large chunk warning for the main bundle, but the build completed successfully after both tasks.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `01-02` can focus on menu, opening unlock, and overworld screen fit using the new token baseline instead of reopening shell-level spacing decisions.
- `01-03` can focus on replay-specific density and recap fit on top of the tighter shared shell and bounded side-rail overflow rules established here.

## Self-Check: PASSED

- Verified `.planning/phases/01-compact-ui-layouts/01-01-SUMMARY.md` exists.
- Verified task commits `570a8a8` and `a0a4f5a` exist in git history.
- Verified `src/app.css` and `src/ui/App.svelte` do not contain new stub placeholder patterns tracked by the execution workflow.
