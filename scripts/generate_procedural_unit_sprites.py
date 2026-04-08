from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Callable

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "assets" / "new_sprites" / "unit sprites"
REVIEW_DIR = ROOT / "tmp" / "sprites" / "review"
FRAME_SIZE = 32
SCALE = 4

OUTLINE = "#17131f"
SHADOW = "#2a2231"
STEEL = "#9aa0aa"
STEEL_DARK = "#626773"
BONE = "#ddd1bb"
BONE_DARK = "#9a8d78"
WOOD = "#7c5132"
WOOD_DARK = "#4d3325"
EYE = "#fff3b0"
BLACK = "#08070b"


UNIT_ORDER = [
    "archer",
    "avenger",
    "beastmaster",
    "champion",
    "druid",
    "elemental",
    "elementalist",
    "knight",
    "militia",
    "necromancer",
    "priest",
    "ranger",
    "shaman",
    "skeleton",
    "soldier",
    "wizard",
    "wolf",
]


UNIT_RECOLOR_RULES: dict[str, dict[str, list[str]]] = {
    "soldier": {"primary": ["#6E3541", "#89484E", "#A84543", "#BA5349"], "secondary": ["#92A463"]},
    "champion": {"primary": ["#5D5068", "#59465D", "#7B5149", "#AB5F45"], "secondary": ["#EEF6F6"]},
    "avenger": {"primary": ["#572C38", "#8E3F3A", "#CD5044"], "secondary": ["#C9B077", "#EBE0A9"]},
    "druid": {"primary": ["#3F775D", "#60A251", "#9DD249"], "secondary": ["#743A5D", "#B94864"], "glow": ["#F9FCE9"]},
    "knight": {"primary": ["#665E7C", "#767090", "#A3A0B7"], "secondary": ["#F0D260"]},
    "militia": {"primary": ["#592A40", "#7D2947", "#BD525F", "#E57370"], "secondary": ["#4D8488"]},
    "archer": {"primary": ["#571743", "#71374C", "#B1434B"], "secondary": ["#688174", "#8A998A", "#B9CCC6"]},
    "beastmaster": {"primary": ["#69323F", "#934554", "#D67B61"], "secondary": ["#7D6241", "#C19557", "#F0D99D"]},
    "wizard": {"primary": ["#47304E", "#7D5B82"], "secondary": ["#DB9253", "#FBCF7C"], "glow": ["#558398", "#63ADC7", "#63F1D1"]},
    "priest": {"primary": ["#5B4A64", "#8A6C94", "#D8BDD8"], "secondary": ["#A47D44", "#D7AF63", "#F5E2B5"], "glow": ["#D7E7F0", "#EFFAFB"]},
    "ranger": {"primary": ["#3C4C33", "#668055", "#A6C17A"], "secondary": ["#5B4046", "#9D6264", "#D89A7B"]},
    "necromancer": {"primary": ["#3A304A", "#62557D", "#AEA4C8"], "secondary": ["#6B5A44", "#A68A62", "#E1D0A3"], "glow": ["#548F8D", "#8ED4CD", "#D8FBF5"]},
    "shaman": {"primary": ["#583844", "#783646", "#D34945"], "secondary": ["#373E69", "#4AA0C8", "#82E1E0"], "glow": ["#BFF9E7", "#E2FEE8"]},
    "elemental": {"primary": ["#5A445C", "#7A627D", "#B8A2B9"], "secondary": ["#5C6F64", "#89A391", "#C7E2D0"], "glow": ["#6FAFB6", "#ACEEF1", "#E7FFFF"]},
    "elementalist": {"primary": ["#4D385E", "#775A91", "#B899D8"], "secondary": ["#875D46", "#D69463", "#F7D39B"], "glow": ["#6EC1C3", "#A9F3ED", "#F0FFFF"]},
    "skeleton": {"primary": ["#726F6A", "#A49E93", "#E0D7C7"], "secondary": ["#5C434A", "#88626C", "#C799A4"]},
    "wolf": {"primary": ["#524E58", "#7F7A89", "#C8C4D0"], "secondary": ["#83603F", "#B89159", "#E6CAA0"]},
}


FACTION_PALETTES: dict[str, dict[str, tuple[int, int, int]]] = {
    "human": {"primary": (0x4E2331, 0x935066, 0xE29B8B), "secondary": (0x6C4F1F, 0xC08C37, 0xF5D37C), "glow": (0x24415A, 0x4D82A8, 0xB9DEF6)},
    "elf": {"primary": (0x18362D, 0x2F7D64, 0x8DE0B4), "secondary": (0x45626D, 0x8AA8B5, 0xE2F5F2), "glow": (0x1F5B5E, 0x4AB6AE, 0xC5FFF5)},
    "goblin": {"primary": (0x3A2808, 0x8C5C12, 0xD4A030), "secondary": (0x5F2C1D, 0xB35731, 0xF2A06B), "glow": (0x403A0A, 0x908812, 0xE8E030)},
    "troll": {"primary": (0x2A224A, 0x6259AF, 0xB6B0F1), "secondary": (0x6C431D, 0xB77734, 0xF1C97A), "glow": (0x1D5364, 0x2D9AAA, 0x9DE8E2)},
}


@dataclass(frozen=True)
class SpriteContext:
    image: Image.Image
    draw: ImageDraw.ImageDraw
    unit: str

    def color(self, role: str, index: int = -1) -> str:
        colors = UNIT_RECOLOR_RULES[self.unit][role]
        return colors[index]


def hex_rgb(hex_color: str) -> tuple[int, int, int]:
    raw = hex_color.lstrip("#")
    return int(raw[0:2], 16), int(raw[2:4], 16), int(raw[4:6], 16)


def rgb_hex(rgb: tuple[int, int, int]) -> str:
    return f"#{rgb[0]:02X}{rgb[1]:02X}{rgb[2]:02X}"


def luminance(hex_color: str) -> float:
    r, g, b = hex_rgb(hex_color)
    return r * 0.299 + g * 0.587 + b * 0.114


def sample_ramp(ramp: tuple[int, int, int], index: int, count: int) -> str:
    def unpack(color: int) -> tuple[int, int, int]:
        return (color >> 16) & 0xFF, (color >> 8) & 0xFF, color & 0xFF

    if count <= 1:
        return rgb_hex(unpack(ramp[1]))
    t = index / (count - 1)
    if t <= 0.5:
        local = t / 0.5
        start = unpack(ramp[0])
        end = unpack(ramp[1])
    else:
        local = (t - 0.5) / 0.5
        start = unpack(ramp[1])
        end = unpack(ramp[2])
    return rgb_hex(tuple(round(start[i] + (end[i] - start[i]) * local) for i in range(3)))


def build_color_map(unit: str, faction: str) -> dict[str, str]:
    color_map: dict[str, str] = {}
    for role, colors in UNIT_RECOLOR_RULES[unit].items():
        sorted_colors = sorted(colors, key=luminance)
        for index, source in enumerate(sorted_colors):
            color_map[source.upper()] = sample_ramp(FACTION_PALETTES[faction][role], index, len(sorted_colors))
    return color_map


def recolor(image: Image.Image, unit: str, faction: str) -> Image.Image:
    color_map = {hex_rgb(source): hex_rgb(target) for source, target in build_color_map(unit, faction).items()}
    out = image.copy().convert("RGBA")
    pixels = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = pixels[x, y]
            if a == 0:
                continue
            replacement = color_map.get((r, g, b))
            if replacement:
                pixels[x, y] = (*replacement, a)
    return out


def rect(ctx: SpriteContext, xy: tuple[int, int, int, int], fill: str, outline: str | None = OUTLINE) -> None:
    ctx.draw.rectangle(xy, fill=fill, outline=outline)


def poly(ctx: SpriteContext, xy: list[tuple[int, int]], fill: str, outline: str | None = OUTLINE) -> None:
    ctx.draw.polygon(xy, fill=fill)
    if outline:
        ctx.draw.line([*xy, xy[0]], fill=outline, width=1)


def ellipse(ctx: SpriteContext, xy: tuple[int, int, int, int], fill: str, outline: str | None = OUTLINE) -> None:
    ctx.draw.ellipse(xy, fill=fill, outline=outline)


def line(ctx: SpriteContext, xy: list[tuple[int, int]], fill: str, width: int = 1) -> None:
    ctx.draw.line(xy, fill=fill, width=width)


def humanoid_base(ctx: SpriteContext, robe: bool = False, head: str = BONE) -> None:
    if robe:
        poly(ctx, [(11, 14), (21, 14), (24, 30), (8, 30)], ctx.color("primary", -1))
        rect(ctx, (12, 17, 20, 25), ctx.color("primary", 0), None)
    else:
        rect(ctx, (12, 15, 20, 25), ctx.color("primary", -1))
        rect(ctx, (11, 25, 15, 30), ctx.color("primary", 0))
        rect(ctx, (17, 25, 21, 30), ctx.color("primary", 0))
    ellipse(ctx, (12, 8, 20, 15), head)
    line(ctx, [(14, 12), (15, 12)], EYE)
    line(ctx, [(18, 12), (19, 12)], EYE)


def draw_soldier(ctx: SpriteContext) -> None:
    humanoid_base(ctx)
    rect(ctx, (8, 16, 14, 25), ctx.color("primary", 1))
    rect(ctx, (9, 17, 13, 22), ctx.color("secondary", 0), None)
    line(ctx, [(22, 9), (22, 29)], WOOD_DARK)
    line(ctx, [(23, 9), (23, 29)], WOOD)
    poly(ctx, [(21, 8), (24, 8), (22, 4)], STEEL)


def draw_militia(ctx: SpriteContext) -> None:
    rect(ctx, (13, 17, 19, 26), ctx.color("primary", -1))
    rect(ctx, (11, 24, 14, 30), ctx.color("primary", 0))
    rect(ctx, (18, 24, 21, 30), ctx.color("primary", 1))
    ellipse(ctx, (13, 10, 19, 16), BONE)
    poly(ctx, [(8, 18), (12, 16), (13, 24), (9, 26)], ctx.color("secondary", 0))
    line(ctx, [(22, 12), (15, 27)], WOOD)
    poly(ctx, [(22, 11), (25, 10), (23, 8)], STEEL)


def draw_knight(ctx: SpriteContext) -> None:
    poly(ctx, [(10, 13), (22, 13), (25, 29), (7, 29)], ctx.color("primary", -1))
    rect(ctx, (11, 17, 21, 26), ctx.color("primary", 1), None)
    rect(ctx, (7, 16, 14, 27), ctx.color("secondary", 0))
    rect(ctx, (12, 7, 20, 14), STEEL)
    poly(ctx, [(13, 7), (19, 7), (16, 3)], ctx.color("primary", 0))
    line(ctx, [(23, 8), (23, 30)], STEEL_DARK)
    poly(ctx, [(22, 8), (25, 8), (24, 4)], STEEL)


def draw_champion(ctx: SpriteContext) -> None:
    humanoid_base(ctx)
    poly(ctx, [(10, 14), (22, 14), (20, 25), (12, 25)], ctx.color("primary", 2))
    rect(ctx, (13, 10, 19, 13), ctx.color("secondary", 0), None)
    line(ctx, [(24, 6), (8, 27)], STEEL_DARK, 2)
    line(ctx, [(25, 5), (20, 9)], STEEL, 2)
    line(ctx, [(18, 12), (24, 6)], WOOD_DARK)


def draw_avenger(ctx: SpriteContext) -> None:
    humanoid_base(ctx, robe=True, head=BONE_DARK)
    poly(ctx, [(10, 13), (5, 8), (10, 10)], ctx.color("primary", 0))
    poly(ctx, [(22, 13), (27, 8), (22, 10)], ctx.color("primary", 0))
    line(ctx, [(24, 6), (17, 15), (27, 25)], STEEL_DARK, 2)
    line(ctx, [(23, 5), (28, 4), (27, 8)], STEEL)
    rect(ctx, (10, 21, 22, 24), ctx.color("secondary", 0), None)


def draw_archer(ctx: SpriteContext) -> None:
    humanoid_base(ctx)
    poly(ctx, [(10, 15), (20, 14), (23, 24), (11, 25)], ctx.color("primary", -1))
    line(ctx, [(8, 8), (5, 16), (7, 25)], WOOD, 2)
    line(ctx, [(8, 8), (7, 25)], ctx.color("secondary", -1))
    line(ctx, [(8, 17), (24, 16)], WOOD_DARK)
    poly(ctx, [(24, 16), (21, 14), (21, 18)], STEEL)


def draw_ranger(ctx: SpriteContext) -> None:
    humanoid_base(ctx, robe=True)
    poly(ctx, [(9, 13), (16, 9), (23, 13), (21, 30), (11, 30)], ctx.color("primary", -1))
    poly(ctx, [(12, 9), (20, 9), (16, 5)], ctx.color("secondary", -1))
    line(ctx, [(25, 5), (28, 17), (25, 29)], WOOD, 2)
    line(ctx, [(25, 5), (25, 29)], ctx.color("secondary", 0))
    line(ctx, [(10, 17), (26, 15)], WOOD_DARK)


def draw_beastmaster(ctx: SpriteContext) -> None:
    humanoid_base(ctx)
    poly(ctx, [(9, 14), (14, 10), (18, 14), (15, 20)], ctx.color("secondary", -1))
    poly(ctx, [(17, 14), (22, 10), (24, 17), (20, 22)], ctx.color("secondary", 1))
    line(ctx, [(7, 19), (4, 15), (8, 12), (11, 15)], WOOD_DARK)
    line(ctx, [(22, 15), (28, 10), (30, 14), (25, 18)], ctx.color("primary", 0))
    rect(ctx, (12, 20, 20, 26), ctx.color("primary", -1), None)


def draw_druid(ctx: SpriteContext) -> None:
    humanoid_base(ctx, robe=True)
    line(ctx, [(13, 8), (10, 4), (8, 5)], WOOD)
    line(ctx, [(19, 8), (22, 4), (24, 5)], WOOD)
    line(ctx, [(25, 8), (25, 29)], WOOD_DARK)
    poly(ctx, [(23, 9), (27, 8), (25, 5)], ctx.color("glow", 0))
    poly(ctx, [(11, 18), (7, 16), (10, 22)], ctx.color("secondary", -1))
    poly(ctx, [(21, 18), (25, 16), (22, 22)], ctx.color("secondary", 0))


def draw_elemental(ctx: SpriteContext) -> None:
    poly(ctx, [(13, 9), (20, 7), (25, 14), (23, 25), (16, 30), (8, 25), (7, 15)], ctx.color("primary", 1))
    poly(ctx, [(15, 12), (20, 14), (19, 22), (14, 23), (12, 17)], ctx.color("glow", 1))
    poly(ctx, [(6, 19), (2, 23), (7, 25)], ctx.color("secondary", 1))
    poly(ctx, [(25, 16), (30, 13), (28, 21)], ctx.color("secondary", 0))
    rect(ctx, (13, 26, 18, 30), ctx.color("primary", 0), None)


def draw_elementalist(ctx: SpriteContext) -> None:
    humanoid_base(ctx, robe=True)
    poly(ctx, [(11, 15), (21, 15), (23, 30), (9, 30)], ctx.color("primary", 1))
    ellipse(ctx, (21, 4, 28, 11), ctx.color("glow", 1))
    poly(ctx, [(23, 2), (27, 7), (23, 12), (19, 7)], ctx.color("secondary", -1))
    line(ctx, [(8, 11), (8, 29)], WOOD_DARK)
    poly(ctx, [(6, 11), (10, 11), (8, 7)], ctx.color("glow", 0))


def draw_necromancer(ctx: SpriteContext) -> None:
    poly(ctx, [(10, 13), (20, 11), (25, 30), (8, 30)], ctx.color("primary", 1))
    ellipse(ctx, (12, 7, 20, 15), BONE_DARK)
    rect(ctx, (14, 10, 18, 13), BLACK, None)
    line(ctx, [(24, 8), (24, 30)], WOOD_DARK)
    ellipse(ctx, (21, 4, 27, 10), BONE)
    line(ctx, [(22, 7), (23, 7)], BLACK)
    line(ctx, [(25, 7), (26, 7)], BLACK)
    rect(ctx, (10, 23, 22, 26), ctx.color("secondary", 1), None)
    poly(ctx, [(7, 15), (4, 17), (8, 21)], ctx.color("glow", 1))


def draw_priest(ctx: SpriteContext) -> None:
    humanoid_base(ctx, robe=True)
    ellipse(ctx, (11, 4, 21, 9), ctx.color("glow", -1))
    rect(ctx, (12, 16, 20, 29), ctx.color("primary", -1), None)
    rect(ctx, (15, 16, 17, 28), ctx.color("secondary", -1), None)
    line(ctx, [(24, 9), (24, 30)], WOOD_DARK)
    line(ctx, [(21, 12), (27, 12)], ctx.color("glow", 0))
    line(ctx, [(24, 9), (24, 15)], ctx.color("glow", 0))


def draw_shaman(ctx: SpriteContext) -> None:
    humanoid_base(ctx, robe=True, head=ctx.color("secondary", -1))
    rect(ctx, (12, 8, 20, 15), ctx.color("secondary", 1))
    line(ctx, [(13, 11), (14, 11)], BLACK)
    line(ctx, [(18, 11), (19, 11)], BLACK)
    line(ctx, [(6, 10), (6, 30)], WOOD_DARK)
    rect(ctx, (3, 10, 9, 16), ctx.color("glow", 0))
    line(ctx, [(3, 13), (9, 13)], ctx.color("secondary", 1))
    rect(ctx, (21, 19, 28, 26), ctx.color("primary", 0))
    line(ctx, [(22, 22), (27, 22)], ctx.color("glow", -1))


def draw_wizard(ctx: SpriteContext) -> None:
    humanoid_base(ctx, robe=True)
    poly(ctx, [(11, 9), (21, 9), (16, 3)], ctx.color("secondary", -1))
    rect(ctx, (12, 15, 20, 29), ctx.color("primary", -1), None)
    line(ctx, [(24, 7), (24, 30)], WOOD_DARK)
    poly(ctx, [(24, 3), (26, 7), (30, 7), (27, 10), (28, 14), (24, 12), (20, 14), (21, 10), (18, 7), (22, 7)], ctx.color("glow", 1))


def draw_skeleton(ctx: SpriteContext) -> None:
    ellipse(ctx, (12, 7, 20, 15), ctx.color("primary", -1))
    line(ctx, [(14, 11), (15, 11)], BLACK)
    line(ctx, [(18, 11), (19, 11)], BLACK)
    rect(ctx, (14, 16, 18, 24), ctx.color("primary", 1))
    line(ctx, [(9, 17), (23, 17)], ctx.color("primary", 0), 2)
    line(ctx, [(10, 20), (6, 25)], ctx.color("primary", 0), 2)
    line(ctx, [(22, 20), (26, 25)], ctx.color("primary", 0), 2)
    line(ctx, [(14, 24), (11, 30)], ctx.color("primary", 0), 2)
    line(ctx, [(18, 24), (21, 30)], ctx.color("primary", 0), 2)
    rect(ctx, (8, 25, 24, 27), ctx.color("secondary", 1), None)


def draw_wolf(ctx: SpriteContext) -> None:
    poly(ctx, [(6, 21), (10, 15), (21, 15), (27, 20), (24, 26), (11, 27)], ctx.color("primary", 1))
    poly(ctx, [(21, 14), (25, 9), (27, 16)], ctx.color("primary", -1))
    poly(ctx, [(25, 16), (30, 17), (27, 20)], ctx.color("secondary", -1))
    poly(ctx, [(7, 20), (2, 17), (5, 24)], ctx.color("primary", 0))
    line(ctx, [(12, 25), (10, 30)], ctx.color("primary", 0), 2)
    line(ctx, [(20, 25), (22, 30)], ctx.color("primary", 0), 2)
    line(ctx, [(25, 15), (26, 15)], EYE)
    line(ctx, [(29, 19), (30, 19)], BONE)


DRAWERS: dict[str, Callable[[SpriteContext], None]] = {
    "archer": draw_archer,
    "avenger": draw_avenger,
    "beastmaster": draw_beastmaster,
    "champion": draw_champion,
    "druid": draw_druid,
    "elemental": draw_elemental,
    "elementalist": draw_elementalist,
    "knight": draw_knight,
    "militia": draw_militia,
    "necromancer": draw_necromancer,
    "priest": draw_priest,
    "ranger": draw_ranger,
    "shaman": draw_shaman,
    "skeleton": draw_skeleton,
    "soldier": draw_soldier,
    "wizard": draw_wizard,
    "wolf": draw_wolf,
}


def make_sprite(unit: str) -> Image.Image:
    image = Image.new("RGBA", (FRAME_SIZE, FRAME_SIZE), (0, 0, 0, 0))
    ctx = SpriteContext(image=image, draw=ImageDraw.Draw(image), unit=unit)
    DRAWERS[unit](ctx)
    return image


def save_contact_sheet(images: dict[str, Image.Image], path: Path) -> None:
    font = ImageFont.load_default()
    cell_w = 176
    cell_h = 168
    cols = 4
    rows = (len(UNIT_ORDER) + cols - 1) // cols
    sheet = Image.new("RGBA", (cols * cell_w, rows * cell_h), "#f0f2f5")
    draw = ImageDraw.Draw(sheet)
    for idx, unit in enumerate(UNIT_ORDER):
        x = (idx % cols) * cell_w
        y = (idx // cols) * cell_h
        draw.rectangle((x, y, x + cell_w - 1, y + cell_h - 1), outline="#c2c7d0")
        sprite = images[unit]
        sheet.alpha_composite(sprite, (x + 8, y + 8))
        sheet.alpha_composite(sprite.resize((FRAME_SIZE * SCALE, FRAME_SIZE * SCALE), Image.Resampling.NEAREST), (x + 32, y + 8))
        draw.text((x + 8, y + 140), unit, fill="#222222", font=font)
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path)


def save_recolor_sheet(images: dict[str, Image.Image], path: Path) -> None:
    font = ImageFont.load_default()
    factions = ["human", "elf", "goblin", "troll"]
    cell_w = 88
    cell_h = 62
    cols = 1 + len(factions)
    rows = 1 + len(UNIT_ORDER)
    sheet = Image.new("RGBA", (cols * cell_w, rows * cell_h), "#f0f2f5")
    draw = ImageDraw.Draw(sheet)
    draw.text((8, 22), "unit", fill="#222222", font=font)
    for c, faction in enumerate(factions, start=1):
        draw.text((c * cell_w + 8, 22), faction, fill="#222222", font=font)
    for r, unit in enumerate(UNIT_ORDER, start=1):
        y = r * cell_h
        draw.text((8, y + 22), unit, fill="#222222", font=font)
        for c, faction in enumerate(factions, start=1):
            sprite = recolor(images[unit], unit, faction).resize((FRAME_SIZE * 2, FRAME_SIZE * 2), Image.Resampling.NEAREST)
            sheet.alpha_composite(sprite, (c * cell_w + 12, y - 1))
    for c in range(cols):
        for r in range(rows):
            draw.rectangle((c * cell_w, r * cell_h, (c + 1) * cell_w - 1, (r + 1) * cell_h - 1), outline="#c2c7d0")
    path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(path)


def validate_sprite(unit: str, image: Image.Image) -> None:
    if image.size != (FRAME_SIZE, FRAME_SIZE):
        raise SystemExit(f"{unit} is {image.size}, expected 32x32.")
    if image.mode != "RGBA":
        raise SystemExit(f"{unit} is {image.mode}, expected RGBA.")
    alpha = image.getchannel("A")
    bbox = alpha.getbbox()
    if bbox is None:
        raise SystemExit(f"{unit} is blank.")
    if bbox[3] < 28:
        raise SystemExit(f"{unit} is not bottom-aligned enough; alpha bounds are {bbox}.")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    REVIEW_DIR.mkdir(parents=True, exist_ok=True)
    images: dict[str, Image.Image] = {}
    for unit in UNIT_ORDER:
        image = make_sprite(unit)
        validate_sprite(unit, image)
        images[unit] = image
        image.save(OUT_DIR / f"{unit}.png")

    save_contact_sheet(images, REVIEW_DIR / "procedural-neutral-contact-sheet.png")
    save_recolor_sheet(images, REVIEW_DIR / "procedural-faction-recolor-sheet.png")
    print(f"Wrote {len(UNIT_ORDER)} sprites to {OUT_DIR}")
    print(f"Wrote review sheets to {REVIEW_DIR}")


if __name__ == "__main__":
    main()
