---
phase: 01-compact-ui-layouts
plan: 04
subsystem: ui
tags: [svelte, css, overworld-ui, layout-density, state-repair]
requires: [01-02-PLAN.md]
provides:
  - Explicit troop-mode entry path that clears stale Rift selection before troop browsing
  - Tighter opening unlock and overworld planning shells with internal panel scrolling
  - Bounded inspect/detail presentation for dense opening and troop-hover states
affects: [phase-01-ui-density]
tech-stack:
  added: []
  patterns: [state-safe-center-mode-switching, viewport-bounded-overworld-shell, bounded-inspect-panels]
key-files:
  created: [.planning/phases/01-compact-ui-layouts/01-04-SUMMARY.md]
  modified: [src/ui/App.svelte]
key-decisions:
  - "Kept the existing gameStore center-mode API and added a UI-owned troop-mode entry helper that clears stale Rift selection."
  - "Spent fit budget by shrinking shell gaps and side rails, then moved overflow into the left, center, and right panels instead of the page."
  - "Bounded opening unlock and overworld inspect panels with internal scrolling so dense hover and pinned detail states remain usable."
duration: 1 task pass
completed: 2026-04-02
---

# Phase 1 Plan 4: Overworld Gap Closure Summary

**Closed the remaining overworld UAT gaps by resetting stale Rift context on troop-mode entry and retuning the planning shell so dense inspect states stay inside bounded panels.**

## Accomplishments

- Added explicit `setTroopCenterMode()` and `setRiftCenterMode()` helpers in `src/ui/App.svelte` so the `Factions & Troops` path clears stale `selectedRiftId` while preserving the existing `gameStore.setCenterMode(...)` interaction model.
- Reused that troop-mode reset path for the topbar toggle and troop/faction selection flows so troop assignment starts from troop-owned state instead of a previously browsed Rift.
- Tightened the opening unlock and overworld desktop shells with smaller gaps, narrower support rails, and fixed-height viewport-bounded layouts that push scrolling into the active panels instead of the page.
- Bounded dense inspect content by making the opening and overworld detail panels internally scrollable and capping ability-list overflow inside those panels.
- Repacked troop browsing with denser faction-card and troop-list spacing so the center region carries more active content and less dead space.

## Verification

- `npm run build` passed.
- Build still reports the pre-existing Vite large-chunk warning for the main bundle.

## Deviations from Plan

None. The changes stayed inside `src/ui/App.svelte` and preserved the existing store and engine boundaries.

## Known Risks

- The fit changes are tuned for the documented desktop target and compile cleanly, but they were not manually visually verified in-browser in this run.

