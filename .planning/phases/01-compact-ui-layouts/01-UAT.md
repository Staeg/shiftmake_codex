---
status: complete
phase: 01-compact-ui-layouts
source:
  - 01-01-SUMMARY.md
  - 01-02-SUMMARY.md
  - 01-03-SUMMARY.md
started: 2026-04-02T22:16:04.2153015+02:00
updated: 2026-04-02T22:26:40.0000000+02:00
---

## Current Test

[testing complete]

## Tests

### 1. Main Menu Single-Screen Fit
expected: Open the main menu at 1366x768. All three save-slot cards and the primary actions should be visible together without page scrolling, and the menu should feel compact rather than padded with dead space.
result: pass

### 2. Overworld Planning Shell Fit
expected: Open a normal populated overworld planning screen. The topbar, left inspect panel, center browsing region, right support or archive rail, and end-cycle action should all remain visible together outside extreme dense states, without needing page scroll.
result: issue
reported: "You missed the campaign start screen, which fits, but barely. The Rifts screen fits, but the Factions & Troops screen doesn't fit while hovering/selecting a unit. It also maintains the selected target from the Rifts screen, which it shouldn't. It's a disaster when selecting an Unlock and hovering over a troop - the name of the troop barely even makes it onto the screen, and scrolling down to see the unit removes the panel. There's also a bunch of dead space in the middle."
severity: major

### 3. Replay Compact Layout
expected: Open a replay at 1366x768. The battlefield should remain dominant while the left focus panel, replay controls, alive counts, and event-log toggle all stay visible together on one screen.
result: issue
reported: "It does, but the + - Reset Zoom oval shape is distinctly too large, there is some dead space below the main display, and somehow selecting a unit by clicking on it on the board does a different thing than clicking on it in the timeline - the former can lock while the latter can't, whereas the latter draws a circle around the unit but doesn't lock."
severity: major

### 4. Internal Scroll Boundaries
expected: In dense states such as archive lists, event logs, or the battle recap, scrolling should happen inside the relevant panel or modal rather than pushing the whole page shell taller.
result: pass

## Summary

total: 4
passed: 2
issues: 2
pending: 0
skipped: 0
blocked: 0

## Gaps

- truth: "Open a normal populated overworld planning screen. The topbar, left inspect panel, center browsing region, right support or archive rail, and end-cycle action should all remain visible together outside extreme dense states, without needing page scroll."
  status: failed
  reason: "User reported: You missed the campaign start screen, which fits, but barely. The Rifts screen fits, but the Factions & Troops screen doesn't fit while hovering/selecting a unit. It also maintains the selected target from the Rifts screen, which it shouldn't. It's a disaster when selecting an Unlock and hovering over a troop - the name of the troop barely even makes it onto the screen, and scrolling down to see the unit removes the panel. There's also a bunch of dead space in the middle."
  severity: major
  test: 2
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
- truth: "Open a replay at 1366x768. The battlefield should remain dominant while the left focus panel, replay controls, alive counts, and event-log toggle all stay visible together on one screen."
  status: failed
  reason: "User reported: It does, but the + - Reset Zoom oval shape is distinctly too large, there is some dead space below the main display, and somehow selecting a unit by clicking on it on the board does a different thing than clicking on it in the timeline - the former can lock while the latter can't, whereas the latter draws a circle around the unit but doesn't lock."
  severity: major
  test: 3
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
