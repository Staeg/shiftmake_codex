# Shiftmake Icons

This folder contains the generation inputs and final output locations for upgrade, ability, and Rift-mutator icons.

## Files

- `icon-style-bible.md`: shared art direction to include with every image-generation request.
- `icon-manifest.generated.json`: generated mechanic manifest from `src/engine/unitCatalog.ts`.
- `prompts/individual-prompts.generated.md`: one prompt per icon.
- `prompts/contact-sheets.generated.md`: grouped prompts for early visual exploration.
- `review-checklist.md`: quick QA checklist for generated results.
- `final/`: expected location for approved PNGs, grouped by icon kind.

## Refreshing The Manifest

Run:

```bash
npm run icons:prompts
```

The generated files should be refreshed after adding, removing, or renaming abilities, upgrades, or Rift mutators in the engine catalog.

## Suggested Workflow

1. Generate contact sheets from `prompts/contact-sheets.generated.md`.
2. Pick a visual direction that works at small UI sizes.
3. Generate final icons from `prompts/individual-prompts.generated.md`.
4. Save approved PNGs to the `outputPath` listed for each manifest item.
5. Use `review-checklist.md` before wiring icons into the UI.
