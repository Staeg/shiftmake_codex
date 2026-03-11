# WORKFLOW.md

Codex working checklist for this repository.

## Mandatory Pre-Flight (Every Coding Task)

1. Read `CLAUDE.md` for project guidance and constraints.
2. Read `TECHNICAL.md` before writing or changing code.
3. Keep `src/engine/` pure TypeScript with zero DOM/rendering dependencies.
4. Put game logic in engine modules, not in Svelte/Pixi layers.
5. Validate changes with tests/build when relevant.

## Decision Rules

- If a change touches game rules, state transitions, battle outcomes, rift logic, or upgrades, implement it in `src/engine/`.
- If a change is visual-only, keep behavior unchanged and avoid leaking logic into UI/rendering.
- Prefer deterministic, testable engine functions that return new state rather than mutating in place.

## Source of Truth

- Design intent: `design documents/Overview.md`, `design documents/Unit details.md`, `design documents/Battle details.md`, `design documents/Overworld.md`, `design documents/Rifts.md`
- Project guidance: `CLAUDE.md`
- Technical architecture/spec: `TECHNICAL.md`
