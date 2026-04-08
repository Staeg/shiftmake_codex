from __future__ import annotations

from pathlib import Path

from _sprite_pipeline_common import DEFAULT_FRAME_SIZE, ensure_dir, make_parser, resolve_unit_paths, run_plugin_script


def main() -> None:
    parser = make_parser("Normalize a generated horizontal strip into Shiftmake-ready review frames.")
    parser.add_argument("--input", required=True, help="Path to the raw strip PNG to normalize.")
    parser.add_argument(
        "--out-dir",
        help="Optional explicit output directory. Defaults to tmp/sprites/<unit>/normalized/.",
    )
    parser.add_argument("--frames", required=True, type=int, help="Number of horizontal frames in the strip.")
    parser.add_argument("--frame-size", type=int, default=DEFAULT_FRAME_SIZE, help="Normalized frame size. Default: 32.")
    parser.add_argument(
        "--anchor",
        help="Optional explicit anchor sprite. Defaults to the current shipped sprite for the same unit.",
    )
    parser.add_argument(
        "--lock-frame1",
        action="store_true",
        help="Replace normalized frame 01 with the anchor frame after normalization.",
    )
    parser.add_argument(
        "--alpha-threshold",
        type=int,
        default=8,
        help="Pixels above this alpha value count as visible sprite content. Default: 8.",
    )
    args = parser.parse_args()

    unit_paths = resolve_unit_paths(args.unit)
    out_dir = unit_paths.normalized_dir if args.out_dir is None else Path(args.out_dir)
    ensure_dir(out_dir)

    plugin_args = [
        "--input",
        args.input,
        "--out-dir",
        str(out_dir),
        "--frames",
        str(args.frames),
        "--frame-size",
        str(args.frame_size),
        "--anchor",
        str(unit_paths.seed_sprite if args.anchor is None else Path(args.anchor)),
        "--alpha-threshold",
        str(args.alpha_threshold),
    ]
    if args.lock_frame1:
        plugin_args.append("--lock-frame1")

    run_plugin_script("normalize_sprite_strip.py", plugin_args)


if __name__ == "__main__":
    main()
