# Sprite Wrapper Workflow

This repo now owns a thin wrapper layer around the Game Studio plugin's sprite-pipeline scripts so sprite prep work can be run from Shiftmake without baking plugin cache paths into day-to-day commands.

## Dependency

These scripts require Pillow:

```bash
python -m pip install pillow
```

## Plugin discovery

The wrappers look for the Game Studio plugin under the local Codex plugin cache and then call the plugin scripts from there.

If the plugin is installed in a custom location, set:

```bash
SHIFTMAKE_GAME_STUDIO_PLUGIN_ROOT=/absolute/path/to/game-studio-plugin
```

Normal project work should call the wrappers in this directory, not the plugin scripts directly.

## Folder conventions

- Source unit sprites: [`assets/unit sprites`](C:/Users/staeg/shiftmake%20-%20Codex/assets/unit%20sprites)
- Final replacement sprites: [`assets/new_sprites/unit sprites`](C:/Users/staeg/shiftmake%20-%20Codex/assets/new_sprites/unit%20sprites)
- Temp work area: `tmp/sprites/<unit>/`
- Normalized review frames: `tmp/sprites/<unit>/normalized/`
- Preview sheets: `tmp/sprites/<unit>/preview.png`

## Static sprite workflow

For deterministic interim placeholders, generate the full replacement-ready set:

```bash
python scripts/generate_procedural_unit_sprites.py
```

This writes final static PNGs to [`assets/new_sprites/unit sprites`](C:/Users/staeg/shiftmake%20-%20Codex/assets/new_sprites/unit%20sprites) and review sheets to `tmp/sprites/review/`.

1. Build an edit canvas from the shipped sprite seed:

```bash
python scripts/sprite_make_edit_canvas.py soldier
```

2. Generate or edit the replacement sprite externally and save a raw PNG into the unit temp folder, for example `tmp/sprites/soldier/raw.png`.

3. Finalize the raw sprite into a transparent `32x32` production asset:

```bash
python scripts/sprite_finalize_static.py soldier --input tmp/sprites/soldier/raw.png
```

4. Review the final output in [`assets/new_sprites/unit sprites`](C:/Users/staeg/shiftmake%20-%20Codex/assets/new_sprites/unit%20sprites) and compare it against the original sprite plus race-tinted mockups before approving it for runtime use.

5. Repeat for the rest of the unit roster.

## Strip workflow for future animation

If the project later moves to animation strips:

1. Reserve multiple frame slots on the edit canvas:

```bash
python scripts/sprite_make_edit_canvas.py soldier --frames 4
```

2. Normalize the generated strip into `32x32` review frames:

```bash
python scripts/sprite_normalize_strip.py soldier --input tmp/sprites/soldier/raw-strip.png --frames 4 --lock-frame1
```

3. Render a quick contact sheet:

```bash
python scripts/sprite_preview.py soldier
```

## Script summary

- `sprite_make_edit_canvas.py <unit>`: create a large transparent working canvas around the current shipped seed frame
- `sprite_finalize_static.py <unit> --input <png>`: scale and bottom-align a static sprite into the tracked `32x32` output
- `sprite_normalize_strip.py <unit> --input <png> --frames <n>`: normalize a horizontal strip into a review frame directory
- `sprite_preview.py <unit>`: render a preview sheet from normalized frames
- `generate_procedural_unit_sprites.py`: generate all 17 deterministic interim sprites and review sheets

## Guardrails

- Unit ids must match an existing file in [`assets/unit sprites`](C:/Users/staeg/shiftmake%20-%20Codex/assets/unit%20sprites)
- Static finalization refuses to overwrite an existing final by default
- Blank or fully transparent source images fail with a clear error
- Temp artifacts are written outside tracked asset folders by default
