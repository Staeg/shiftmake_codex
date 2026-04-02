---
phase: 01-compact-ui-layouts
plan: 3
status: completed
commit: pending
---

# 01-03 Summary

## Completed

- Tightened the replay shell so the left focus rail, central viewport, and right support rail fit together more reliably on common desktop heights.
- Added explicit replay control labels, including `Play`, `Pause`, `Previous Step`, `Next Step`, `Open Battle Recap`, and a real `Reset Zoom` action.
- Reduced replay chrome and panel padding across the docked unit tooltip, event log, replay transport controls, and recap modal.
- Kept replay support surfaces scroll-bounded so the shell stays fixed while dense content scrolls internally.

## Files Changed

- `src/ui/App.svelte`
- `src/ui/BattleControls.svelte`
- `src/ui/EventLog.svelte`
- `src/ui/UnitTooltip.svelte`
- `src/rendering/BattleRenderer.ts`

## Verification

- `npm run build`
  - Passed
  - Existing Vite chunk-size warning remains

## Notes

- `BattleRenderer` gained a small `resetZoom()` method so the new reset control restores the fit-to-battle framing instead of only repainting the viewport.
