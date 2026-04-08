from __future__ import annotations

from pathlib import Path

from _sprite_pipeline_common import ensure_parent, make_parser, resolve_unit_paths, run_plugin_script


def main() -> None:
    parser = make_parser("Build a large transparent edit canvas around an existing Shiftmake seed sprite.")
    parser.add_argument("--seed", help="Optional explicit seed sprite path. Defaults to assets/unit sprites/<unit>.png.")
    parser.add_argument("--out", help="Optional explicit output path. Defaults to tmp/sprites/<unit>/edit-canvas.png.")
    parser.add_argument("--frames", type=int, default=1, help="Horizontal frame count to reserve. Default: 1.")
    parser.add_argument("--slot-size", type=int, default=256, help="Edit slot size in pixels. Default: 256.")
    parser.add_argument("--canvas-size", type=int, default=1024, help="Overall transparent canvas size in pixels. Default: 1024.")
    args = parser.parse_args()

    unit_paths = resolve_unit_paths(args.unit)
    seed_path = unit_paths.seed_sprite if args.seed is None else Path(args.seed)
    out_path = unit_paths.edit_canvas_path if args.out is None else Path(args.out)
    ensure_parent(out_path)

    run_plugin_script(
        "build_sprite_edit_canvas.py",
        [
            "--seed",
            str(seed_path),
            "--out",
            str(out_path),
            "--frames",
            str(args.frames),
            "--slot-size",
            str(args.slot_size),
            "--canvas-size",
            str(args.canvas_size),
        ],
    )


if __name__ == "__main__":
    main()
