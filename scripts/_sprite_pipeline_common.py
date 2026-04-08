from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence


try:
    from PIL import Image
except ImportError as exc:  # pragma: no cover
    raise SystemExit("Pillow is required. Install it with `python -m pip install pillow`.") from exc


SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
ASSETS_DIR = REPO_ROOT / "assets"
SOURCE_UNIT_SPRITES_DIR = ASSETS_DIR / "unit sprites"
NEW_UNIT_SPRITES_DIR = ASSETS_DIR / "new_sprites" / "unit sprites"
TMP_SPRITES_DIR = REPO_ROOT / "tmp" / "sprites"
DEFAULT_FRAME_SIZE = 32


@dataclass(frozen=True)
class UnitPaths:
    unit_id: str
    seed_sprite: Path
    temp_dir: Path
    normalized_dir: Path
    preview_path: Path
    edit_canvas_path: Path
    final_sprite_path: Path


def make_parser(description: str) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("unit", help="Unit id matching an existing sprite filename, for example `soldier`.")
    return parser


def get_known_unit_ids() -> list[str]:
    return sorted(path.stem for path in SOURCE_UNIT_SPRITES_DIR.glob("*.png"))


def resolve_unit_paths(unit_id: str) -> UnitPaths:
    known_unit_ids = get_known_unit_ids()
    if unit_id not in known_unit_ids:
        available = ", ".join(known_unit_ids)
        raise SystemExit(f"Unknown unit `{unit_id}`. Expected one of: {available}")

    unit_temp_dir = TMP_SPRITES_DIR / unit_id
    return UnitPaths(
        unit_id=unit_id,
        seed_sprite=SOURCE_UNIT_SPRITES_DIR / f"{unit_id}.png",
        temp_dir=unit_temp_dir,
        normalized_dir=unit_temp_dir / "normalized",
        preview_path=unit_temp_dir / "preview.png",
        edit_canvas_path=unit_temp_dir / "edit-canvas.png",
        final_sprite_path=NEW_UNIT_SPRITES_DIR / f"{unit_id}.png",
    )


def ensure_parent(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)


def ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def ensure_file(path: Path, label: str) -> None:
    if not path.is_file():
        raise SystemExit(f"{label} was not found: {path}")


def nontransparent_bbox(image: Image.Image, alpha_threshold: int = 8) -> tuple[int, int, int, int] | None:
    alpha = image.getchannel("A").point(lambda value: 255 if value > alpha_threshold else 0)
    return alpha.getbbox()


def crop_to_content(image: Image.Image, alpha_threshold: int = 8) -> Image.Image:
    bbox = nontransparent_bbox(image, alpha_threshold)
    if bbox is None:
        raise SystemExit("No visible sprite pixels were detected in the input image.")
    return image.crop(bbox)


def compose_bottom_centered(image: Image.Image, frame_size: int = DEFAULT_FRAME_SIZE) -> Image.Image:
    if frame_size < 1:
        raise SystemExit("--frame-size must be positive.")

    canvas = Image.new("RGBA", (frame_size, frame_size), (0, 0, 0, 0))
    width_scale = frame_size / image.width
    height_scale = frame_size / image.height
    scale = min(width_scale, height_scale)
    width = max(1, int(round(image.width * scale)))
    height = max(1, int(round(image.height * scale)))
    resized = image.resize((width, height), Image.Resampling.NEAREST)
    offset_x = (frame_size - width) // 2
    offset_y = frame_size - height
    canvas.alpha_composite(resized, (offset_x, offset_y))
    return canvas


def check_no_overwrite(path: Path, overwrite: bool) -> None:
    if path.exists() and not overwrite:
        raise SystemExit(f"Refusing to overwrite existing file without --overwrite: {path}")


def find_python_executable() -> str:
    return sys.executable or shutil.which("python") or "python"


def locate_game_studio_plugin_root() -> Path:
    env_path = None
    if "SHIFTMAKE_GAME_STUDIO_PLUGIN_ROOT" in os.environ:
        env_path = Path(os.environ["SHIFTMAKE_GAME_STUDIO_PLUGIN_ROOT"]).expanduser()
        if env_path.is_dir():
            return env_path
        raise SystemExit(
            "SHIFTMAKE_GAME_STUDIO_PLUGIN_ROOT is set but does not point to an existing directory: "
            f"{env_path}"
        )

    plugin_root_base = Path.home() / ".codex" / "plugins" / "cache" / "openai-curated" / "game-studio"
    if not plugin_root_base.is_dir():
        raise SystemExit(
            "Unable to locate the Game Studio plugin cache. "
            "Install the plugin or set SHIFTMAKE_GAME_STUDIO_PLUGIN_ROOT."
        )

    candidates = sorted((path for path in plugin_root_base.iterdir() if path.is_dir()), key=lambda path: path.name, reverse=True)
    for candidate in candidates:
        script_dir = candidate / "scripts"
        if script_dir.is_dir():
            return candidate

    raise SystemExit(
        "Found the Game Studio plugin cache, but no plugin version contained a `scripts` directory."
    )


def locate_plugin_script(script_name: str) -> Path:
    script_path = locate_game_studio_plugin_root() / "scripts" / script_name
    ensure_file(script_path, f"Required plugin script `{script_name}`")
    return script_path


def run_plugin_script(script_name: str, args: Sequence[str]) -> None:
    script_path = locate_plugin_script(script_name)
    command = [find_python_executable(), str(script_path), *args]
    result = subprocess.run(command, cwd=REPO_ROOT, check=False)
    if result.returncode != 0:
        raise SystemExit(result.returncode)
