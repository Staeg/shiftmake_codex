from __future__ import annotations

from pathlib import Path

from _sprite_pipeline_common import (
    DEFAULT_FRAME_SIZE,
    Image,
    check_no_overwrite,
    compose_bottom_centered,
    crop_to_content,
    ensure_file,
    ensure_parent,
    make_parser,
    resolve_unit_paths,
)


def main() -> None:
    parser = make_parser("Finalize a static sprite into a Shiftmake-ready 32x32 transparent PNG.")
    parser.add_argument("--input", required=True, help="Path to the raw generated PNG to finalize.")
    parser.add_argument(
        "--out",
        help="Optional explicit output path. Defaults to assets/new_sprites/unit sprites/<unit>.png.",
    )
    parser.add_argument("--frame-size", type=int, default=DEFAULT_FRAME_SIZE, help="Final square frame size. Default: 32.")
    parser.add_argument(
        "--alpha-threshold",
        type=int,
        default=8,
        help="Pixels above this alpha value count as visible sprite content. Default: 8.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Allow overwriting an existing finalized sprite.",
    )
    args = parser.parse_args()

    unit_paths = resolve_unit_paths(args.unit)
    input_path = Path(args.input)
    out_path = unit_paths.final_sprite_path if args.out is None else Path(args.out)

    ensure_file(input_path, "Input sprite")
    ensure_parent(out_path)
    check_no_overwrite(out_path, args.overwrite)

    image = Image.open(input_path).convert("RGBA")
    cropped = crop_to_content(image, args.alpha_threshold)
    finalized = compose_bottom_centered(cropped, args.frame_size)
    finalized.save(out_path)


if __name__ == "__main__":
    main()
