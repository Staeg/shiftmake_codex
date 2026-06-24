# Icon Generation

This document describes the repeatable workflow for generating Shiftmake upgrade, ability, and Rift-mutator icons from the engine catalog.

## Goal

The image model should receive enough gameplay meaning to invent good visual metaphors without requiring bespoke art direction for every icon.

The source of truth is `src/engine/unitCatalog.ts`. Do not manually maintain a parallel list of upgrades or abilities.

Runtime icon lookup and fallback icon metadata live in `src/presentation/iconAssets.ts` so both Svelte UI and Pixi rendering code can use the same assets without creating a renderer-to-UI dependency.

## Generated Inputs

Run:

```bash
npm run icons:prompts
```

This creates:

- `assets/icons/icon-style-bible.md`
- `assets/icons/icon-manifest.generated.json`
- `assets/icons/prompts/contact-sheets.generated.md`
- `assets/icons/prompts/individual-prompts.generated.md`
- `assets/icons/review-checklist.md`

## Generation Strategy

Start with contact sheets grouped by race, troop class, base ability, and Rift mutator. Contact sheets are for choosing a visual language, not final production.

Once a family looks right, generate final icons one at a time or in small batches using the individual prompts. Save each approved PNG to its manifest `outputPath`.

## Prompting Principles

- Give the style bible once per batch.
- Provide mechanic data as structured JSON.
- Let gameplay tags guide the metaphor.
- Forbid text in every prompt.
- Prefer one strong symbol over a tiny battle scene.
- Judge the icon at 32x32 and 64x64, not only at full generation size.

## What Counts As Relevant

The manifest includes:

- all race upgrades
- all troop-class upgrades
- base abilities currently attached to units or races
- upgrade-granted abilities
- Rift mutators

Summon-only helper abilities are included when they are directly granted by an upgrade or part of a base unit ability chain.
