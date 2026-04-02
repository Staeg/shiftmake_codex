# Shiftmake

## What This Is

Shiftmake is a browser-based singleplayer turn-based strategy game where the player manages a patchwork army across a series of Rift battles. The current project focus is not inventing a new game direction, but tightening the existing experience so the interface feels clean and readable, battlefield roles behave intuitively, and a full run stays tense and fair from opening to late cycles.

## Core Value

The game should feel strategically legible and satisfying from moment to moment, with clear UI, intuitive unit behavior, and campaign pacing that stays engaging across the whole run.

## Requirements

### Validated

- ✓ Player can start and play a browser-based singleplayer campaign run with local save slots and replayable battles - existing
- ✓ Player can assign troops to visible Rifts and resolve deterministic auto-battles with observable replays - existing
- ✓ Player can recruit from faction and troop offers, apply upgrades, and progress through a 10-cycle campaign structure - existing

### Active

- [ ] Tighten the UI so main screens fit cleanly on one screen in normal use, with minimal dead space and no routine scrolling
- [ ] Rework battlefield role behavior so frontline, chaff, and backline units consistently act in ways that match player intuition
- [ ] Rebalance campaign progression so both early and late-game runs feel challenging without turning into a steamroll or an impossible wall

### Out of Scope

- Multiplayer features - not part of the current priority, which is improving the singleplayer core loop first
- Mobile ports and platform expansion - worthwhile later, but they would distract from fixing usability, combat behavior, and campaign balance in the browser build
- Backend or cloud-save infrastructure - current persistence is local and this milestone is focused on gameplay quality rather than service expansion

## Context

Shiftmake already has a functioning brownfield browser implementation built with a pure TypeScript engine, a Svelte store/application layer, and Pixi-based replay rendering. The current codebase map highlights a large root UI component in `src/ui/App.svelte`, a heavily concentrated battle runtime in `src/engine/battle.ts`, and a store layer that mixes persistence policy with UI flow.

The next milestone is explicitly ordered:
1. Improve the UI and remove the wonky layout behavior first
2. Rework role behavior so unit intent fully matches what the role names imply
3. Run a broader balance pass across campaign pacing, including Rift army composition and progression rewards such as Essence and unlock flow

The most important UI pain point is dead space and popup behavior that pushes important information off-screen and makes scrolling necessary in situations where it should not be. The role work is broader than isolated bug fixes: frontline units should absorb attention and protect the backline, chaff should overrun or spill into the backline whenever possible, and backline units should try to keep their distance. The balance goal is broad campaign health, where the beginning and end of a run are both viable and interesting rather than trivial or oppressive.

## Constraints

- **Tech stack**: TypeScript + Vite + Svelte + PixiJS - preserve the established stack and work within the current browser client architecture
- **Architecture**: `src/engine/` must remain pure TypeScript with zero DOM or rendering dependencies - gameplay logic cannot leak into Svelte components or Pixi rendering code
- **Product scope**: Primary target remains the browser singleplayer experience - this milestone should improve the shipped core loop before expanding platform or mode scope
- **Persistence**: Current save and replay storage uses `localStorage` - progression and archive changes should respect existing browser-local storage limits unless storage work becomes explicitly in scope

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Prioritize UI improvements before role and balance work | Better layout and readability will make later gameplay and balance iteration easier to observe and evaluate | - Pending |
| Treat role behavior as an intuition and readability problem, not just a bug backlog | The goal is for unit roles to feel obviously correct in play, not merely to patch a few edge cases | - Pending |
| Aim the balance pass at full-run pacing rather than isolated matchup tuning | The desired outcome is healthy campaign progression from opening through late cycles | - Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `$gsd-transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `$gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check - still the right priority?
3. Audit Out of Scope - reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-02 after initialization*
