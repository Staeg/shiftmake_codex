# Shiftmake

## What This Is

Shiftmake is a browser-based singleplayer turn-based strategy game where the player manages a patchwork army across a series of Rift battles. The current project focus is tightening the existing experience so the interface feels clean and readable, battlefield roles behave intuitively, and a full run stays tense and fair from opening to late cycles.

## Core Value

The game should feel strategically legible and satisfying from moment to moment, with clear UI, intuitive unit behavior, and campaign pacing that stays engaging across the whole run.

## Requirements

### Validated

- [x] Player can start and play a browser-based singleplayer campaign run with local save slots and replayable battles - existing
- [x] Player can assign troops to visible Rifts and resolve deterministic auto-battles with observable replays - existing
- [x] Player can recruit from faction and troop offers, apply upgrades, and progress through a 10-cycle campaign structure - existing
- [x] Frontline, chaff, and backline roles now behave with engine-authored intent that matches their names and replay presentation - validated in Phase 2: Intuitive Battlefield Roles

### Active

- [ ] Tighten the UI so main screens fit cleanly on one screen in normal use, with minimal dead space and no routine scrolling
- [ ] Rebalance campaign progression so both early and late-game runs feel challenging without turning into a steamroll or an impossible wall

### Out of Scope

- Multiplayer features - not part of the current priority, which is improving the singleplayer core loop first
- Mobile ports and platform expansion - worthwhile later, but they would distract from fixing usability, combat behavior, and campaign balance in the browser build
- Backend or cloud-save infrastructure - current persistence is local and this milestone is focused on gameplay quality rather than service expansion

## Context

Shiftmake already has a functioning brownfield browser implementation built with a pure TypeScript engine, a Svelte store/application layer, and Pixi-based replay rendering. The current codebase map highlights a large root UI component in `src/ui/App.svelte`, a heavily concentrated battle runtime in `src/engine/battle.ts`, and a store layer that mixes persistence policy with UI flow.

The milestone order remains:
1. Improve the UI and remove layout friction
2. Rework role behavior so unit intent fully matches what the role names imply
3. Run a broader balance pass across campaign pacing, including Rift army composition and progression rewards such as Essence and unlock flow

Phase 2 is now complete. The battle engine emits typed role-intent metadata, deterministic role-behavior tests and seed sweeps are in place, and replay consumers surface role intent directly from engine-authored data. The next active work is the campaign pacing and economy pass in Phase 3.

## Constraints

- Tech stack: TypeScript + Vite + Svelte + PixiJS
- Architecture: `src/engine/` must remain pure TypeScript with zero DOM or rendering dependencies
- Product scope: Primary target remains the browser singleplayer experience
- Persistence: Current save and replay storage uses `localStorage`

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Prioritize UI improvements before role and balance work | Better layout and readability will make later gameplay and balance iteration easier to observe and evaluate | Pending |
| Treat role behavior as an intuition and readability problem, not just a bug backlog | The goal is for unit roles to feel obviously correct in play, not merely to patch a few edge cases | Phase 2 completed with engine-owned role intent, deterministic role tests, and replay-driven presentation |
| Aim the balance pass at full-run pacing rather than isolated matchup tuning | The desired outcome is healthy campaign progression from opening through late cycles | Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

After each phase transition:
1. Move validated requirements from Active to Validated.
2. Update current context to reflect the latest completed phase.
3. Record important decisions that changed implementation direction.

After each milestone:
1. Review all sections for drift.
2. Reconfirm the core value and current priority order.
3. Update context with the latest project state.

---
*Last updated: 2026-04-02 after Phase 2 completion*
