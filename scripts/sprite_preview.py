from __future__ import annotations

import argparse
from pathlib import Path

from _sprite_pipeline_common import ensure_parent, resolve_unit_paths, run_plugin_script


def main() -> None:
    parser = argparse.ArgumentParser(description="Render a preview contact sheet from normalized sprite frames.")
    parser.add_argument("unit", nargs="?", help="Optional unit id used to resolve default review paths.")
    parser.add_argument(
        "--frames-dir",
        help="Directory containing normalized PNG frames. Defaults to tmp/sprites/<unit>/normalized/.",
    )
    parser.add_argument("--out", help="Optional output path. Defaults to tmp/sprites/<unit>/preview.png.")
    parser.add_argument("--columns", type=int, default=4, help="Preview column count. Default: 4.")
    parser.add_argument("--gap", type=int, default=8, help="Preview gap in pixels. Default: 8.")
    args = parser.parse_args()

    if args.unit is None and args.frames_dir is None:
        raise SystemExit("Provide either a unit id or --frames-dir.")
    if args.unit is None and args.out is None:
        raise SystemExit("When no unit id is provided, --out is required.")

    unit_paths = resolve_unit_paths(args.unit) if args.unit is not None else None
    frames_dir = unit_paths.normalized_dir if args.frames_dir is None else Path(args.frames_dir)
    out_path = unit_paths.preview_path if args.out is None else Path(args.out)
    ensure_parent(out_path)

    run_plugin_script(
        "render_sprite_preview_sheet.py",
        [
            "--frames-dir",
            str(frames_dir),
            "--out",
            str(out_path),
            "--columns",
            str(args.columns),
            "--gap",
            str(args.gap),
        ],
    )


if __name__ == "__main__":
    main()
