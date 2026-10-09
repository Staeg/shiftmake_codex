# Replay Viewer Extraction

Milestone 7 completed 2026-10-08 after the recap, viewport and full viewer were
extracted and verified in sequence.

## Current Owners

| Concern | Owner |
| --- | --- |
| Resolved replay, provenance, position, event selection, play state, rate | Atomic game store and distinct read-only playback view |
| Canvas host, renderer init/release, frame-loop wiring, controls, zoom | `ReplayViewport.svelte` using the Milestone 6 lifecycle/controller |
| Recap totals, profile lookup, side scale, expansion and modal CSS | `ReplayRecap.svelte` using `battleRecap.ts` |
| Inspection lock/hover/profile, event pin, focus panel, health overview, event log | `ReplayViewer.svelte` |
| Mutator detail and ability rails/tooltips | `ReplayViewer.svelte`, slotted into the viewport without added DOM wrappers |
| Recap visibility and pause/rewind/lock action | `ReplayViewer.svelte` |
| Tutorial routing, scene guards, action recording and prompts | `App.svelte` / tutorial store; viewer receives a cohesive request/action contract |
| Report diagnostics shared with asset preloading and debug export | `App.svelte`; viewer forwards renderer diagnostics |

The viewport subscribes to the existing read-only views, not a second writable
copy. Mount enables scheduling and renderer initialization; unmount disables it
before disposing both owners. Session route checks remain in asynchronous guards.
Renderer identity is compared by reference, not replay ID. The canvas and control
styles moved with their elements, including the existing 1280px breakpoint; the
outer viewport shell and remaining screen styles moved into the full viewer.

## Component Boundary

`ReplayViewportInspection` groups read/hover/select/reset/before-navigation
callbacks. Its read method sees the latest inspection state synchronously, which
preserves immediate renderer feedback inside hover/click and event callbacks.
`navigationKind` is bound between the viewer and its viewport;
the viewport sets automatic/reset/manual-step kinds and consumes the kind after
rendering a changed step. Control signals go through App's existing tutorial action
handler. No engine decisions move into the component.

The contract is internal to `ReplayViewer.svelte`, not a bag of App-owned local
state. App supplies portrait lookup, guarded exit, shared diagnostics and tutorial
requests/action callbacks. Tutorial requests include a revision so revisiting the
same step still resets inspection and chooses its event-log surface. Requests are
ignored outside an active tutorial. App retains a reset method for cross-screen
zone transitions, not a mirror of selection state.

Roster/profile caches are bounded to one replay reference. A different object with
the same replay ID cannot reuse stale data. Replay replacement clears local locks,
event pins, recap and tooltips; closing clears cached replay references. Resolved
engine data remains authoritative. `getDetailInspectLabel` moved to the existing
detail-card module for reuse by App and the viewer without duplicating its rules.

## Verification

Recap: two SSR tests verify totals, scaling, collapsed units and empty sides.
Desktop checks verify expansion, alive/dead labels, focus and last-alive rewind,
close/reopen reset, button/backdrop dismissal and another archive. Full suite at
that step: 403 tests in 40 files passed (25.63s); build passed (15.99s).

Viewport: two SSR tests verify the authoritative playback view, control/tutorial/
zoom selectors, empty disabled controls and no renderer/inspection initialization
while server rendering. The 17 controller/lifecycle tests remain green. Desktop
checks at 1440x900 verified manual beat-skipping steps, play/pause, rate changes,
forward/backward event selection, reset clearing the explanation, actual field-unit
clicks, and renderer teardown during active playback. Exit left zero canvases;
opening the summons archive created one paused canvas at step zero. Tutorial resume
on the isolated localhost origin displayed the Battlefield instruction, one
canvas, and the preserved control targets. Console errors/warnings were absent
after reload against the current source. Existing saves on port 5173's 127.0.0.1
origin were untouched.

Full suite after viewport extraction: 405 tests in 41 files passed (27.71s).
Production build passed (18.66s) with the existing large-chunk warning. No gameplay,
replay/save schema, live multiplayer connection UX, or mobile redesign changes.

## Final Acceptance

Three full-viewer SSR tests cover empty presentation, resolved health/portrait data
and tutorial requests selecting the event log. App no longer computes viewer
snapshots, rosters, health, abilities, focus profiles or explanations; its remaining
playback reads serve tutorial orchestration and diagnostic provenance.

The assembled desktop viewer was checked at 1440x900 against the existing layout:
ordinary, summons and long archives opened correctly; manual steps preserved beat
skipping; play/pause and rate changes worked; event selection sought from 23 to 10
and reset to zero while clearing the explanation. A field-unit click opened its
inspector. Recap inspection rewound a dead unit from step 140 to 139 and closed the
modal. Leaving the long replay with Pause visible removed all canvases. Opening
the summons archive created one paused canvas at step zero with fresh inspection.

Tutorial resume retained the Battlefield instruction and control targets;
inspection hover/unhover advanced to Unit Lock. The guarded Return to Rifts action
kept the tutorial replay open and displayed its prompt. Design mode exposed
extracted labels and selected the Replay controls overlay without changing any
styling. Console errors/warnings were absent. Existing 127.0.0.1:5173 saves were
untouched; QA used separate origins.

Final full suite: 408 tests in 42 files passed (27.64s). Production build passed
(15.95s), retaining only the existing large-chunk warning. Complete replay
references remain unchanged. Existing responsive rules moved with their owning
elements; mobile and live multiplayer connection UI were not tested or redesigned.
Repository-wide type checking retains its previously documented errors; this
milestone does not claim a clean full type check.
