# Tutorial Implementation Guidelines

Maintain these rules for every current and future Shiftmake tutorial step.

## Interaction Rules

- Tutorial steps must use concise, technical language.
- When a step asks the player to perform an action, progression must wait until that action is observed.
- Normal UI inspection and gameplay controls must keep working during the tutorial.
- Only controls that switch between tutorial scenes or major views may be intercepted while the guided sequence is incomplete.
- Intercepted scene-switch controls must remain visible, appear greyed out, and show `Follow the tutorial!` when clicked.
- A tutorial-controlled scene switch must still work when that scene switch is the requested action for the current step.
- The previous-step `<-` control must remain available in every tutorial popup.
- Previous-step and Resume Tutorial must restore the major view that corresponds to the resulting tutorial step.

## Popup Placement

- Popups must appear close to the object the step is discussing or the control the player must use.
- Placement must avoid covering target controls and avoid covering other important UI surfaces as much as feasible.
- Popup text and framing must not intercept normal UI input underneath them; only popup navigation controls should capture pointer input.
- Prefer nearby empty space around the current target over fixed screen corners.
- Re-evaluate placement when the view changes, when the viewport changes, and when a step reveals a new target.
- Popup re-anchoring must be debounced and stable; minor pointer movement or unrelated UI updates must not move the popup between placements.

## Target Arrows

- Action steps must draw thin golden arrows to the requested click or hover target.
- Informational steps should target the UI surface they are explaining when a concrete surface exists.
- Arrows must stop at the nearest edge of each target, not at the target center.
- Multiple arrows from the same popup side must use distinct edge lanes so their stems do not overlap.
- When several controls can satisfy a step, draw arrows to the three closest visible valid targets.
- If different kinds of visible target can satisfy the same step, draw at least one arrow to each kind even when that exceeds three arrows.
- Prefer an uncovered equivalent target when popup placement covers one of several valid target choices.
- Fallback target types should disappear when the primary requested target type is visible.
- Arrow targets must be defined from stable UI selectors or explicit tutorial target attributes, not copy text parsing.

## Current Coverage Boundary

The current tutorial covers:

1. Battle Archive replay entry.
2. Battle Replay inspection, playback, timeline, roles, engagements, and ability inspection as categories.
3. Singleplayer Contest vs AI game start.
4. Opening Faction and included starter Troop selection through `Begin`.
5. Essence as the primary progress resource and the Factions & Troops view.
6. Unlock Draft reveal, one Troop choice, one Upgrade choice, and Upgrade affected-Troop icons.
7. Rift board return, enemy Troop inspection, Modifier inspection, and assignment constraints.
8. Troop assignment, cycle ending, Contest vs AI battle structure, Battle Archive detail inspection, and Rival Info.

Future tutorial work should extend this document before adding coverage for Campaign-only systems, scheduled faction unlocks, scheduled troop type unlocks, game-over scoring, or advanced replay comparisons.
