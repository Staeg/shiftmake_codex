---
phase: 01-compact-ui-layouts
plan: 5
status: completed
---

# 01-05 Summary

## Completed

- Tightened the replay shell by moving replay actions into the left header, shrinking the zoom cluster, and reducing reserved space under the battlefield.
- Compacted replay support chrome in `BattleControls.svelte`, `EventLog.svelte`, and `UnitTooltip.svelte` without replacing the bounded side-panel model.
- Unified explicit replay unit selection around one shared lock path in `App.svelte` so board clicks, alive-roster clicks, roster cycling, and recap unit clicks all lock or clear focus consistently.
- Kept timeline and event-log selection as highlight-driven preview behavior rather than a competing lock model.

## Files Changed

- `src/ui/App.svelte`
- `src/ui/BattleControls.svelte`
- `src/ui/EventLog.svelte`
- `src/ui/UnitTooltip.svelte`
- `.planning/phases/01-compact-ui-layouts/01-05-SUMMARY.md`

## Verification

- `npm run build`
  - Passed
  - Existing Vite chunk-size warning remains

## Deviations

- None. The plan was executed within the requested file scope.
