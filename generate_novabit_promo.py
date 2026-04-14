from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parent
WIDTH = 960
HEIGHT = 540
FRAME_COUNT = 48
FRAME_DURATION_MS = 150

OUTPUT = ROOT / "tfxc.pro" / "temp" / "custom" / "media" / "novabit-commercial.png"
PHONE_PATH = ROOT / "images" / "cdc_producthero_onchain_global.webp"
LOGO_PATH = ROOT / "tfxc.pro" / "temp" / "custom" / "img" / "novabit-logo-wordmark.png"

FONT_REGULAR = Path(r"C:\Windows\Fonts\segoeui.ttf")
FONT_SEMIBOLD = Path(r"C:\Windows\Fonts\segoeuib.ttf")

BG_TOP = (6, 18, 38, 255)
BG_BOTTOM = (9, 28, 54, 255)
WHITE = (247, 249, 252, 255)
TEXT_SOFT = (183, 195, 208, 255)
TEXT_MUTED = (141, 156, 173, 255)
BLUE = (0, 113, 227, 255)
CYAN = (108, 223, 255, 255)
TEAL = (49, 197, 181, 255)


def font(path: Path, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(str(path), size=size)


def mix(a: float, b: float, t: float) -> float:
    return a + (b - a) * t


def mix_rgba(c1: tuple[int, int, int, int], c2: tuple[int, int, int, int], t: float) -> tuple[int, int, int, int]:
    return tuple(int(mix(c1[i], c2[i], t)) for i in range(4))


def vertical_gradient(size: tuple[int, int], top: tuple[int, int, int, int], bottom: tuple[int, int, int, int]) -> Image.Image:
    image = Image.new("RGBA", size)
    draw = ImageDraw.Draw(image)
    width, height = size
    for y in range(height):
        t = y / max(1, height - 1)
        draw.line((0, y, width, y), fill=mix_rgba(top, bottom, t))
    return image


def draw_glow(base: Image.Image, center: tuple[float, float], radius: float, color: tuple[int, int, int, int], blur: int) -> None:
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    x, y = center
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=color)
    base.alpha_composite(layer.filter(ImageFilter.GaussianBlur(blur)))


def text_size(draw: ImageDraw.ImageDraw, text: str, font_obj: ImageFont.FreeTypeFont) -> tuple[int, int]:
    box = draw.textbbox((0, 0), text, font=font_obj)
    return box[2] - box[0], box[3] - box[1]


def draw_pill(draw: ImageDraw.ImageDraw, x: int, y: int, text: str, font_obj: ImageFont.FreeTypeFont) -> None:
    tw, th = text_size(draw, text, font_obj)
    box = (x, y, x + tw + 32, y + 34)
    draw.rounded_rectangle(box, radius=17, fill=(11, 26, 50, 178), outline=(255, 255, 255, 20))
    draw.text((x + 16, y + 7), text, font=font_obj, fill=(233, 240, 247, 255))


def sharpen_phone(phone: Image.Image) -> Image.Image:
    phone = ImageEnhance.Contrast(phone).enhance(1.06)
    phone = ImageEnhance.Sharpness(phone).enhance(1.18)
    return phone


def make_background(frame_index: int) -> Image.Image:
    base = vertical_gradient((WIDTH, HEIGHT), BG_TOP, BG_BOTTOM)
    phase = frame_index / FRAME_COUNT

    draw_glow(base, (WIDTH * 0.18, HEIGHT * 0.12), 150, (0, 113, 227, 58), 74)
    draw_glow(base, (WIDTH * 0.78, HEIGHT * 0.22), 170, (64, 210, 255, 82), 94)
    draw_glow(base, (WIDTH * 0.76, HEIGHT * 0.82), 190, (0, 113, 227, 48), 110)

    haze = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    hdraw = ImageDraw.Draw(haze)

    sweep_x = mix(-240, WIDTH + 160, phase)
    hdraw.polygon(
        [
            (sweep_x - 120, -40),
            (sweep_x + 20, -40),
            (sweep_x + 220, HEIGHT + 40),
            (sweep_x + 80, HEIGHT + 40),
        ],
        fill=(255, 255, 255, 16),
    )

    second_x = mix(WIDTH + 220, -180, phase)
    hdraw.polygon(
        [
            (second_x - 40, -40),
            (second_x + 60, -40),
            (second_x - 140, HEIGHT + 40),
            (second_x - 240, HEIGHT + 40),
        ],
        fill=(93, 211, 255, 12),
    )

    haze = haze.filter(ImageFilter.GaussianBlur(30))
    base.alpha_composite(haze)

    lines = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    ldraw = ImageDraw.Draw(lines)
    for y in range(388, HEIGHT, 38):
        ldraw.line((0, y, WIDTH, y), fill=(255, 255, 255, 10), width=1)
    base.alpha_composite(lines)

    return base


def make_card_highlight(size: tuple[int, int], phase: float) -> Image.Image:
    width, height = size
    layer = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    start = mix(-width * 0.6, width * 1.2, phase)
    draw.polygon(
        [
            (start - 80, -20),
            (start + 20, -20),
            (start + 180, height + 20),
            (start + 80, height + 20),
        ],
        fill=(255, 255, 255, 28),
    )
    return layer.filter(ImageFilter.GaussianBlur(28))


def make_frame(frame_index: int, phone_asset: Image.Image, logo_asset: Image.Image, fonts: dict[str, ImageFont.FreeTypeFont]) -> Image.Image:
    phase = frame_index / FRAME_COUNT
    frame = make_background(frame_index)
    draw = ImageDraw.Draw(frame)

    logo = logo_asset.copy()
    logo.thumbnail((232, 86))
    frame.alpha_composite(logo, (60, 54))

    draw.text((62, 154), "FOR LONG-TERM INVESTORS", font=fonts["eyebrow"], fill=(116, 222, 255, 255))
    draw.text((60, 186), "Invest with", font=fonts["title"], fill=WHITE)
    draw.text((60, 260), "clarity.", font=fonts["title"], fill=WHITE)
    draw.text((62, 340), "Crypto, equities and ETFs in", font=fonts["body"], fill=TEXT_SOFT)
    draw.text((62, 374), "one guided platform.", font=fonts["body"], fill=TEXT_SOFT)

    divider_y = 424
    draw.line((62, divider_y, 274, divider_y), fill=(255, 255, 255, 26), width=2)
    draw.text((62, divider_y + 18), "Clean tools. Disciplined execution. Modern access.", font=fonts["micro"], fill=TEXT_MUTED)

    pill_y = 474
    draw_pill(draw, 62, pill_y, "Crypto", fonts["pill"])
    draw_pill(draw, 166, pill_y, "Equities", fonts["pill"])
    draw_pill(draw, 290, pill_y, "ETFs", fonts["pill"])

    card_box = (528, 50, 902, 492)
    card_layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    cdraw = ImageDraw.Draw(card_layer)
    cdraw.rounded_rectangle(card_box, radius=42, fill=(255, 255, 255, 12), outline=(255, 255, 255, 28), width=2)
    cdraw.rounded_rectangle((548, 70, 882, 472), radius=34, fill=(255, 255, 255, 8), outline=(255, 255, 255, 20), width=1)
    frame.alpha_composite(card_layer)

    highlight = make_card_highlight((card_box[2] - card_box[0], card_box[3] - card_box[1]), phase)
    frame.alpha_composite(highlight, (card_box[0], card_box[1]))

    phone_float_y = math.sin(phase * math.tau) * 8
    phone_float_x = math.cos(phase * math.tau * 0.5) * 4
    phone = sharpen_phone(phone_asset.copy())
    target_height = 462
    phone = ImageOps.contain(phone, (360, target_height))
    phone_x = int(560 + phone_float_x)
    phone_y = int(74 + phone_float_y)

    shadow_layer = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow_layer)
    sdraw.ellipse((600, 416, 844, 474), fill=(0, 0, 0, 72))
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(22))
    frame.alpha_composite(shadow_layer)
    frame.alpha_composite(phone, (phone_x, phone_y))

    info = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    idraw = ImageDraw.Draw(info)
    strip = (564, 390, 850, 436)
    idraw.rounded_rectangle(strip, radius=24, fill=(9, 24, 47, 212), outline=(255, 255, 255, 20))
    idraw.text((590, 403), "One account. Multiple markets.", font=fonts["strip"], fill=WHITE)
    frame.alpha_composite(info)

    return frame


def main() -> None:
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    phone_asset = Image.open(PHONE_PATH).convert("RGBA")
    logo_asset = Image.open(LOGO_PATH).convert("RGBA")

    fonts = {
        "eyebrow": font(FONT_SEMIBOLD, 16),
        "title": font(FONT_SEMIBOLD, 62),
        "body": font(FONT_REGULAR, 24),
        "micro": font(FONT_REGULAR, 17),
        "pill": font(FONT_SEMIBOLD, 15),
        "strip": font(FONT_SEMIBOLD, 17),
    }

    frames = [make_frame(i, phone_asset, logo_asset, fonts) for i in range(FRAME_COUNT)]
    frames[0].save(
        OUTPUT,
        save_all=True,
        append_images=frames[1:],
        duration=[FRAME_DURATION_MS] * FRAME_COUNT,
        loop=0,
        optimize=True,
        disposal=2,
    )
    print(f"Created {OUTPUT}")


if __name__ == "__main__":
    main()
