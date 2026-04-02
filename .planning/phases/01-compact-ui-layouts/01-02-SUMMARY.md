---
phase: 01-compact-ui-layouts
plan: 02
subsystem: ui
tags: [svelte, css, compact-layout, menu-ui, overworld-ui]
requires: [01-01-PLAN.md]
provides:
  - Compact main menu slot presentation with all primary actions visible together
  - Denser opening-unlock split view with sticky inspect panel and tighter choice cards
  - Tighter overworld support surfaces and bounded archive/detail density
affects: [01-03-PLAN.md, phase-01-ui-density]
tech-stack:
  added: []
  patterns: [desktop-fit-layout, sticky-inspect-panel, compact-stat-cards]
key-files:
  created: [.planning/phases/01-compact-ui-layouts/01-02-SUMMARY.md]
  modified: [src/ui/App.svelte, src/ui/StatBreakdownGrid.svelte]
key-decisions:
  - "Kept the existing menu, opening unlock, and overworld interaction model intact while compressing chrome and card sizing."
  - "Used denser stat cards and bounded archive/support surfaces instead of introducing new overlays or navigation patterns."
patterns-established:
  - "Desktop-fit screens favor tighter shell composition, compact card chrome, and internal scrolling in dense support panels."
  - "Inspect-heavy surfaces can stay persistent by reducing spacing before removing information."
requirements-completed: [UI-01, UI-02, UI-03, UI-04]
duration: 14min
completed: 2026-04-02
---

# Phase 1 Plan 2: Compact UI Layouts Summary

**Compacted the menu, opening unlock, and overworld planning flows so key actions and support information stay visible together without changing the existing interaction model**

## Performance

- **Duration:** 14 min
- **Completed:** 2026-04-02T16:58:00+02:00
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Shortened and tightened the main menu shell so the save slot grid remains the focal point and slot metadata/actions fit more compactly.
- Converted the opening unlock screen into a denser split layout with a sticky inspect panel and tighter troop/faction card rhythm.
- Rebalanced the overworld shell toward a more compact desktop fit, including tighter archive, warning, assignment, faction, and rift surfaces.
- Reduced stat-card padding and typography in `StatBreakdownGrid.svelte` so inspect/detail panels carry more information in the same space.

## Files Created/Modified

- `.planning/phases/01-compact-ui-layouts/01-02-SUMMARY.md` - execution summary and self-check for plan `01-02`
- `src/ui/App.svelte` - compact menu, opening unlock, and overworld layout refinements
- `src/ui/StatBreakdownGrid.svelte` - denser stat-card spacing and typography for inspect surfaces

## Decisions Made

- Kept the existing left/center/right overworld model, persistent inspect behavior, and archive-in-right-rail pattern intact.
- Tightened spacing and card density before hiding information or introducing any new navigation surface.

## Deviations from Plan

None. The plan stayed within the intended brownfield UI scope.

## Issues Encountered

- `npm run build` passed twice. The only remaining warning is the existing Vite large-chunk warning for the main bundle.
- A transient unused CSS selector warning appeared during the first build and was removed before the final verification run.

## User Setup Required

None.

## Next Phase Readiness

- `01-03` can now focus on replay-specific fit and recap compaction on top of the tighter menu/overworld baseline.

## Self-Check: PASSED

- Verified `.planning/phases/01-compact-ui-layouts/01-02-SUMMARY.md` exists.
- Verified `src/ui/App.svelte` preserves the existing `main_menu`, `overworld`, and `replay` branches.
- Verified `src/ui/StatBreakdownGrid.svelte` remains reusable and layout-only.
- Verified `npm run build` passes after the final Wave 2 edits.
