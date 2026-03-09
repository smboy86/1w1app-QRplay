#!/usr/bin/env python3
"""Generate Google Play listing assets for the QRPlay Android app."""

from __future__ import annotations

import textwrap
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT_DIR = Path(__file__).resolve().parent.parent
SOURCE_ICON_PATH = ROOT_DIR / "assets" / "icon.png"
OUTPUT_DIR = ROOT_DIR / "docs" / "play-store" / "assets"

FONT_CANDIDATES = [
    "/System/Library/Fonts/AppleSDGothicNeo.ttc",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
    "/System/Library/Fonts/SFNS.ttf",
]

BRAND_BLUE = "#2B84E0"
BRAND_SKY = "#6EC9FF"
BRAND_MINT = "#86E1C6"
BRAND_YELLOW = "#FFD665"
BRAND_ORANGE = "#FF9E63"
BRAND_ROSE = "#FF7FB1"
TEXT_DARK = "#143247"
TEXT_MUTED = "#5F7283"
CARD_WHITE = "#FFFFFF"
SCREEN_BG = "#EEF4FA"


@dataclass(frozen=True)
class ScreenshotSpec:
    title: str
    subtitle: str
    filename: str
    screen_kind: str


SCREENSHOT_SPECS = [
    ScreenshotSpec(
        title="QR만 비추면 바로 재생",
        subtitle="카메라로 QR을 읽고 단일 영상 재생 화면으로 빠르게 전환합니다.",
        filename="01-qr-scan",
        screen_kind="scanner",
    ),
    ScreenshotSpec(
        title="짧은 링크도 자동으로 해석",
        subtitle="리다이렉트 주소를 풀어 최종 재생 가능한 영상 링크를 찾습니다.",
        filename="02-link-resolve",
        screen_kind="player",
    ),
    ScreenshotSpec(
        title="재생 기록을 한눈에 확인",
        subtitle="성공·실패 상태와 재생 횟수를 보고 같은 QR을 다시 실행할 수 있습니다.",
        filename="03-history",
        screen_kind="history",
    ),
    ScreenshotSpec(
        title="복잡한 설정 없이 바로 사용",
        subtitle="앱 버전, 개인정보처리방침, 문의 메뉴를 간단한 목록으로 제공합니다.",
        filename="04-settings",
        screen_kind="settings",
    ),
]

SIZE_VARIANTS = {
    "phone": (1920, 1080),
    "tablet-7": (1920, 1080),
    "tablet-10": (2560, 1440),
}


# Returns the first available system font for the requested size.
def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in FONT_CANDIDATES:
        if Path(candidate).exists():
            index = 1 if bold and candidate.endswith(".ttc") else 0
            try:
                return ImageFont.truetype(candidate, size=size, index=index)
            except OSError:
                continue
    return ImageFont.load_default()


# Converts a hex color to a three-channel tuple.
def hex_to_rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


# Blends two RGB colors by the supplied progress value.
def blend_color(start: str, end: str, t: float) -> tuple[int, int, int]:
    left = hex_to_rgb(start)
    right = hex_to_rgb(end)
    return tuple(int(left[i] + (right[i] - left[i]) * t) for i in range(3))


# Creates a vertical gradient background for the given size.
def make_gradient(size: tuple[int, int], top: str, bottom: str) -> Image.Image:
    width, height = size
    image = Image.new("RGB", size, bottom)
    pixels = image.load()

    for y in range(height):
        color = blend_color(top, bottom, y / max(height - 1, 1))
        for x in range(width):
            pixels[x, y] = color

    return image


# Pastes a soft circular glow to add depth behind important artwork.
def add_glow(base: Image.Image, center: tuple[int, int], radius: int, color: str, alpha: int) -> None:
    width, height = base.size
    glow = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(glow)
    glow_color = (*hex_to_rgb(color), alpha)
    x, y = center
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=glow_color)
    glow = glow.filter(ImageFilter.GaussianBlur(radius // 3))
    base.alpha_composite(glow)


# Draws the brand's floating orb shapes used across the app UI.
def add_background_orbs(base: Image.Image) -> None:
    width, height = base.size
    overlay = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    draw.ellipse((-int(width * 0.08), int(height * 0.55), int(width * 0.18), int(height * 1.05)), fill=(134, 225, 198, 55))
    draw.ellipse((int(width * 0.77), -int(height * 0.12), int(width * 1.06), int(height * 0.42)), fill=(255, 214, 101, 75))
    draw.ellipse((int(width * 0.55), int(height * 0.1), int(width * 0.79), int(height * 0.48)), fill=(110, 201, 255, 38))
    overlay = overlay.filter(ImageFilter.GaussianBlur(max(width, height) // 50))
    base.alpha_composite(overlay)


# Wraps text so that it fits inside the requested max width.
def wrap_text(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_width: int) -> list[str]:
    words = text.split()
    lines: list[str] = []
    current = ""

    for word in words:
        candidate = f"{current} {word}".strip()
        if draw.textlength(candidate, font=font) <= max_width:
            current = candidate
            continue

        if current:
            lines.append(current)
            current = word
            continue

        fragments = textwrap.wrap(word, width=max(len(word) // 2, 1))
        lines.extend(fragments[:-1])
        current = fragments[-1]

    if current:
        lines.append(current)

    return lines


# Draws multiline text with controlled line spacing.
def draw_multiline(
    draw: ImageDraw.ImageDraw,
    position: tuple[int, int],
    text: str,
    font: ImageFont.ImageFont,
    fill: str,
    max_width: int,
    line_spacing: int,
) -> int:
    lines = wrap_text(draw, text, font, max_width)
    x, y = position
    bbox = draw.textbbox((0, 0), "한", font=font)
    line_height = bbox[3] - bbox[1]

    for index, line in enumerate(lines):
        draw.text((x, y + index * (line_height + line_spacing)), line, font=font, fill=fill)

    return y + len(lines) * (line_height + line_spacing)


# Resizes the source icon and trims transparent margins for artwork reuse.
def load_trimmed_icon() -> Image.Image:
    icon = Image.open(SOURCE_ICON_PATH).convert("RGBA")
    alpha = icon.getchannel("A")
    bbox = alpha.getbbox()
    if bbox:
        icon = icon.crop(bbox)
    return icon


# Creates the square Play Store app icon with a full-bleed background.
def create_app_icon(trimmed_icon: Image.Image) -> Path:
    image = make_gradient((512, 512), "#EAF6FF", "#FFE5CD").convert("RGBA")
    add_glow(image, (256, 256), 200, BRAND_SKY, 90)
    add_glow(image, (392, 108), 96, BRAND_YELLOW, 88)

    backdrop = Image.new("RGBA", (512, 512), (0, 0, 0, 0))
    draw = ImageDraw.Draw(backdrop)
    draw.rounded_rectangle((36, 36, 476, 476), radius=110, fill=(255, 255, 255, 208))
    draw.rounded_rectangle((56, 56, 456, 456), radius=100, outline=(255, 255, 255, 140), width=6)
    backdrop = backdrop.filter(ImageFilter.GaussianBlur(2))
    image.alpha_composite(backdrop)

    artwork = trimmed_icon.resize((430, 430), Image.Resampling.LANCZOS)
    image.alpha_composite(artwork, ((512 - artwork.width) // 2, (512 - artwork.height) // 2))

    output_path = OUTPUT_DIR / "app-icon-512.png"
    image.convert("RGB").save(output_path, optimize=True)
    return output_path


# Creates the 1024x500 Play Store feature graphic.
def create_feature_graphic(trimmed_icon: Image.Image) -> Path:
    image = make_gradient((1024, 500), "#ECF8FF", "#FFF0DA").convert("RGBA")
    add_glow(image, (764, 230), 210, BRAND_ROSE, 58)
    add_glow(image, (694, 160), 170, BRAND_SKY, 92)
    add_background_orbs(image)

    artwork = trimmed_icon.resize((440, 440), Image.Resampling.LANCZOS)
    artwork = artwork.crop((40, 40, 430, 430)).resize((390, 390), Image.Resampling.LANCZOS)
    image.alpha_composite(artwork, (598, 55))

    draw = ImageDraw.Draw(image)
    title_font = load_font(74, bold=True)
    subtitle_font = load_font(28)
    pill_font = load_font(24, bold=True)

    draw.rounded_rectangle((72, 74, 230, 118), radius=22, fill="#FFFFFF")
    draw.text((103, 84), "QRPlay", font=load_font(24, bold=True), fill=TEXT_DARK)
    draw.text((72, 154), "QR 스캔으로 이어지는", font=title_font, fill=TEXT_DARK)
    draw.text((72, 236), "간편 영상 플레이", font=title_font, fill=TEXT_DARK)
    draw_multiline(
        draw,
        (74, 324),
        "아이와 함께 QR을 비추고 단일 영상을 빠르게 재생하세요.",
        subtitle_font,
        TEXT_MUTED,
        420,
        8,
    )

    pill_items = [("QR 스캔", BRAND_BLUE), ("링크 해석", BRAND_YELLOW), ("히스토리", BRAND_MINT)]
    pill_x = 72
    pill_y = 408
    for label, color in pill_items:
        pill_width = int(draw.textlength(label, font=pill_font)) + 46
        draw.rounded_rectangle((pill_x, pill_y, pill_x + pill_width, pill_y + 46), radius=23, fill=color)
        draw.text((pill_x + 23, pill_y + 10), label, font=pill_font, fill="#173042")
        pill_x += pill_width + 14

    output_path = OUTPUT_DIR / "feature-graphic-1024x500.png"
    image.convert("RGB").save(output_path, optimize=True)
    return output_path


# Adds the small app brand chip used at the top of screenshots.
def draw_brand_chip(canvas: Image.Image, icon: Image.Image, width: int, variant_scale: float) -> None:
    draw = ImageDraw.Draw(canvas)
    chip_x = int(width * 0.05)
    chip_y = int(48 * variant_scale)
    chip_height = int(72 * variant_scale)
    chip_width = int(240 * variant_scale)
    draw.rounded_rectangle((chip_x, chip_y, chip_x + chip_width, chip_y + chip_height), radius=int(28 * variant_scale), fill="#FFFFFF")

    icon_size = int(44 * variant_scale)
    chip_icon = icon.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    canvas.alpha_composite(chip_icon, (chip_x + int(14 * variant_scale), chip_y + int(14 * variant_scale)))

    name_font = load_font(int(28 * variant_scale), bold=True)
    sub_font = load_font(int(15 * variant_scale))
    draw.text((chip_x + int(72 * variant_scale), chip_y + int(14 * variant_scale)), "QRPlay", font=name_font, fill=TEXT_DARK)
    draw.text((chip_x + int(72 * variant_scale), chip_y + int(42 * variant_scale)), "Android", font=sub_font, fill=TEXT_MUTED)


# Draws the headline block above each screenshot mockup.
def draw_screenshot_header(
    draw: ImageDraw.ImageDraw,
    width: int,
    spec: ScreenshotSpec,
    variant_scale: float,
) -> None:
    title_font = load_font(int(58 * variant_scale), bold=True)
    subtitle_font = load_font(int(23 * variant_scale))
    header_x = int(width * 0.05)
    header_y = int(144 * variant_scale)
    max_width = int(width * 0.48)
    draw.text((header_x, header_y), spec.title, font=title_font, fill=TEXT_DARK)
    draw_multiline(
        draw,
        (header_x, header_y + int(86 * variant_scale)),
        spec.subtitle,
        subtitle_font,
        TEXT_MUTED,
        max_width,
        int(8 * variant_scale),
    )


# Draws a small QR finder graphic used on the scanner screen.
def draw_qr_target(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], scale: float) -> None:
    left, top, right, bottom = box
    center_x = (left + right) // 2
    center_y = (top + bottom) // 2
    size = int(min(right - left, bottom - top) * 0.28)
    stroke = max(int(12 * scale), 6)
    frame = (
        center_x - size,
        center_y - size,
        center_x + size,
        center_y + size,
    )
    draw.rounded_rectangle(frame, radius=int(28 * scale), outline="#FFFFFF", width=stroke)

    qr_size = int(size * 1.12)
    qr_left = center_x - qr_size // 2
    qr_top = center_y - qr_size // 2
    qr_colors = [BRAND_BLUE, "#FFFFFF", BRAND_YELLOW, "#FFFFFF", BRAND_MINT]
    cell = qr_size // 9
    for row in range(9):
        for col in range(9):
            if (row + col) % 2 == 0 or (row in {0, 1, 7, 8} and col in {0, 1, 7, 8}):
                color = qr_colors[(row + col) % len(qr_colors)]
                draw.rounded_rectangle(
                    (
                        qr_left + col * cell,
                        qr_top + row * cell,
                        qr_left + (col + 1) * cell - 2,
                        qr_top + (row + 1) * cell - 2,
                    ),
                    radius=max(int(4 * scale), 2),
                    fill=color,
                )


# Renders the scanner screen based on the app's current camera layout.
def render_scanner_screen(canvas: Image.Image, box: tuple[int, int, int, int], scale: float) -> None:
    overlay = ImageDraw.Draw(canvas)
    left, top, right, bottom = box
    overlay.rounded_rectangle(box, radius=int(36 * scale), fill="#0C1320")

    camera_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    camera_draw = ImageDraw.Draw(camera_layer)
    for index in range(20):
        alpha = 18 + index * 3
        inset = int(index * 14 * scale)
        camera_draw.rounded_rectangle(
            (left + inset, top + inset, right - inset, bottom - inset),
            radius=int(40 * scale),
            outline=(40, 120 + index * 3, 170 + index * 2, alpha),
            width=max(int(2 * scale), 1),
        )
    camera_draw.ellipse((left - 140, top + 80, left + 160, top + 380), fill=(58, 138, 224, 55))
    camera_draw.ellipse((right - 200, top + 40, right + 80, top + 320), fill=(255, 214, 102, 60))
    camera_draw.ellipse((left + 180, bottom - 250, left + 540, bottom + 40), fill=(134, 225, 198, 55))
    camera_layer = camera_layer.filter(ImageFilter.GaussianBlur(max(int(12 * scale), 4)))
    canvas.alpha_composite(camera_layer)

    top_button = (
        left + int(26 * scale),
        top + int(26 * scale),
        left + int(290 * scale),
        top + int(92 * scale),
    )
    overlay.rounded_rectangle(top_button, radius=int(18 * scale), fill=(0, 0, 0, 150))
    overlay.text((top_button[0] + int(22 * scale), top_button[1] + int(12 * scale)), "⟳  후면 카메라", font=load_font(int(26 * scale), bold=True), fill="#FFFFFF")

    hint_box = (
        left + int(28 * scale),
        bottom - int(170 * scale),
        right - int(28 * scale),
        bottom - int(28 * scale),
    )
    overlay.rounded_rectangle(hint_box, radius=int(22 * scale), fill=(0, 0, 0, 160))
    overlay.text((hint_box[0] + int(26 * scale), hint_box[1] + int(18 * scale)), "QR을 비춰 주세요", font=load_font(int(32 * scale), bold=True), fill="#FFFFFF")
    draw_multiline(
        overlay,
        (hint_box[0] + int(26 * scale), hint_box[1] + int(70 * scale)),
        "한 번에 하나의 영상만 재생하며, 종료되면 자동으로 스캔 화면으로 돌아옵니다.",
        load_font(int(23 * scale)),
        "#F3F4F6",
        int((hint_box[2] - hint_box[0]) - 52 * scale),
        int(7 * scale),
    )
    draw_qr_target(overlay, box, scale)


# Renders the player screen with a video area and playback controls.
def render_player_screen(canvas: Image.Image, box: tuple[int, int, int, int], scale: float, icon: Image.Image) -> None:
    draw = ImageDraw.Draw(canvas)
    left, top, right, bottom = box
    draw.rounded_rectangle(box, radius=int(36 * scale), fill="#05080F")

    video_height = int((right - left) * 9 / 16)
    video_box = (left, top, right, top + video_height)
    draw.rounded_rectangle(video_box, radius=int(36 * scale), fill="#111827")

    preview = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    preview_draw = ImageDraw.Draw(preview)
    preview_draw.ellipse((left + int(80 * scale), top + int(40 * scale), left + int(480 * scale), top + int(440 * scale)), fill=(44, 132, 224, 120))
    preview_draw.ellipse((right - int(480 * scale), top + int(20 * scale), right - int(80 * scale), top + int(420 * scale)), fill=(255, 214, 102, 105))
    preview = preview.filter(ImageFilter.GaussianBlur(max(int(16 * scale), 4)))
    canvas.alpha_composite(preview)

    preview_icon = icon.resize((int(250 * scale), int(250 * scale)), Image.Resampling.LANCZOS)
    canvas.alpha_composite(preview_icon, (left + int(44 * scale), top + int(28 * scale)))
    draw.rounded_rectangle((right - int(250 * scale), top + int(36 * scale), right - int(34 * scale), top + int(102 * scale)), radius=int(22 * scale), fill=(0, 0, 0, 120))
    draw.text((right - int(228 * scale), top + int(52 * scale)), "단일 영상 재생", font=load_font(int(24 * scale), bold=True), fill="#FFFFFF")

    play_ring = (left + int((right - left) * 0.5) - int(66 * scale), top + int(video_height * 0.48) - int(66 * scale), left + int((right - left) * 0.5) + int(66 * scale), top + int(video_height * 0.48) + int(66 * scale))
    draw.ellipse(play_ring, fill=(255, 255, 255, 230))
    triangle = [
        (play_ring[0] + int(50 * scale), play_ring[1] + int(36 * scale)),
        (play_ring[0] + int(50 * scale), play_ring[1] + int(96 * scale)),
        (play_ring[0] + int(102 * scale), play_ring[1] + int(66 * scale)),
    ]
    draw.polygon(triangle, fill=BRAND_BLUE)

    controls_top = top + video_height + int(28 * scale)
    primary_button = (left + int(26 * scale), controls_top, left + int((right - left) * 0.58), controls_top + int(92 * scale))
    secondary_button = (primary_button[2] + int(20 * scale), controls_top, right - int(26 * scale), controls_top + int(92 * scale))
    draw.rounded_rectangle(primary_button, radius=int(22 * scale), fill=BRAND_BLUE)
    draw.rounded_rectangle(secondary_button, radius=int(22 * scale), fill="#4B5563")
    draw.text((primary_button[0] + int(102 * scale), primary_button[1] + int(28 * scale)), "일시정지", font=load_font(int(30 * scale), bold=True), fill="#FFFFFF")
    draw.text((secondary_button[0] + int(90 * scale), secondary_button[1] + int(28 * scale)), "종료", font=load_font(int(30 * scale), bold=True), fill="#FFFFFF")


# Draws one row card in the history screen.
def draw_history_card(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], order: int, status: str, url: str, count: int, scale: float) -> None:
    left, top, right, bottom = box
    status_ok = status == "성공"
    draw.rounded_rectangle(box, radius=int(28 * scale), fill=(255, 255, 255, 220))
    draw.rounded_rectangle((left + int(16 * scale), top + int(16 * scale), left + int(112 * scale), top + int(52 * scale)), radius=int(18 * scale), fill="#EAF1F8")
    draw.text((left + int(28 * scale), top + int(22 * scale)), f"No. {order}", font=load_font(int(18 * scale), bold=True), fill=TEXT_DARK)

    badge_left = left + int(16 * scale)
    badge_top = top + int(68 * scale)
    badge_right = badge_left + int(96 * scale)
    badge_bottom = badge_top + int(42 * scale)
    badge_fill = "#D8F7EC" if status_ok else "#FFE2E2"
    badge_text = "#0F7A4B" if status_ok else "#C24141"
    draw.rounded_rectangle((badge_left, badge_top, badge_right, badge_bottom), radius=int(20 * scale), fill=badge_fill)
    draw.text((badge_left + int(22 * scale), badge_top + int(10 * scale)), status, font=load_font(int(18 * scale), bold=True), fill=badge_text)

    draw.text((left + int(134 * scale), top + int(28 * scale)), "QR Read URL", font=load_font(int(18 * scale), bold=True), fill=TEXT_MUTED)
    url_font = load_font(int(24 * scale), bold=True)
    meta_font = load_font(int(18 * scale))
    shortened = url if len(url) <= 44 else f"{url[:41]}..."
    draw.text((left + int(134 * scale), top + int(56 * scale)), shortened, font=url_font, fill=TEXT_DARK)
    draw.text((left + int(134 * scale), top + int(96 * scale)), "탭해서 다시 재생 · 03/09 11:30", font=meta_font, fill=TEXT_MUTED)

    bubble = (right - int(86 * scale), top + int(26 * scale), right - int(22 * scale), top + int(92 * scale))
    draw.ellipse(bubble, fill="#F3F7FB")
    count_font = load_font(int(26 * scale), bold=True)
    count_text = str(count)
    tw = draw.textlength(count_text, font=count_font)
    draw.text((bubble[0] + (bubble[2] - bubble[0] - tw) / 2, bubble[1] + int(10 * scale)), count_text, font=count_font, fill=TEXT_DARK)
    draw.text((bubble[0] + int(24 * scale), bubble[1] + int(38 * scale)), "회", font=load_font(int(14 * scale), bold=True), fill=TEXT_MUTED)


# Renders the history tab layout based on the current React Native screen.
def render_history_screen(canvas: Image.Image, box: tuple[int, int, int, int], scale: float) -> None:
    screen = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(screen)
    left, top, right, bottom = box
    draw.rounded_rectangle(box, radius=int(36 * scale), fill=SCREEN_BG)
    draw.ellipse((right - int(260 * scale), top - int(90 * scale), right + int(40 * scale), top + int(180 * scale)), fill=(255, 209, 102, 68))
    draw.ellipse((left - int(120 * scale), bottom - int(240 * scale), left + int(160 * scale), bottom + int(20 * scale)), fill=(111, 214, 190, 40))
    screen = screen.filter(ImageFilter.GaussianBlur(max(int(4 * scale), 2)))
    canvas.alpha_composite(screen)

    draw = ImageDraw.Draw(canvas)
    draw.text((left + int(44 * scale), top + int(48 * scale)), "QR스캔 히스토리", font=load_font(int(42 * scale), bold=True), fill=TEXT_DARK)
    draw_multiline(
        draw,
        (left + int(44 * scale), top + int(108 * scale)),
        "최근 QR 재생 주소를 순서대로 모아두었습니다. 카드를 터치하면 스캔 탭에서 같은 재생 방식으로 다시 실행됩니다.",
        load_font(int(20 * scale)),
        TEXT_MUTED,
        int((right - left) - 90 * scale),
        int(6 * scale),
    )

    card_top = top + int(210 * scale)
    card_height = int(140 * scale)
    gap = int(18 * scale)
    draw_history_card(draw, (left + int(40 * scale), card_top, right - int(40 * scale), card_top + card_height), 3, "성공", "https://youtu.be/dQw4w9WgXcQ", 4, scale)
    draw_history_card(draw, (left + int(40 * scale), card_top + card_height + gap, right - int(40 * scale), card_top + card_height * 2 + gap), 2, "실패", "https://example.com/short/qrplay-book", 1, scale)
    draw_history_card(draw, (left + int(40 * scale), card_top + (card_height + gap) * 2, right - int(40 * scale), card_top + card_height * 3 + gap * 2), 1, "성공", "https://www.youtube.com/watch?v=Zi_XLOBDo_Y", 2, scale)


# Draws one settings row that matches the app's settings list.
def draw_settings_row(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], label: str, value: str | None, scale: float) -> None:
    left, top, right, bottom = box
    draw.text((left + int(24 * scale), top + int(22 * scale)), label, font=load_font(int(24 * scale), bold=True), fill=TEXT_DARK)
    if value:
        tw = draw.textlength(value, font=load_font(int(22 * scale), bold=True))
        draw.text((right - int(74 * scale) - tw, top + int(22 * scale)), value, font=load_font(int(22 * scale), bold=True), fill=TEXT_MUTED)
    draw.ellipse((right - int(52 * scale), top + int(18 * scale), right - int(18 * scale), top + int(52 * scale)), fill="#F3F7FB")
    draw.text((right - int(41 * scale), top + int(18 * scale)), ">", font=load_font(int(20 * scale), bold=True), fill="#8A98A7")


# Renders the settings tab layout based on the current React Native screen.
def render_settings_screen(canvas: Image.Image, box: tuple[int, int, int, int], scale: float, icon: Image.Image) -> None:
    draw = ImageDraw.Draw(canvas)
    left, top, right, bottom = box
    draw.rounded_rectangle(box, radius=int(36 * scale), fill=SCREEN_BG)
    draw.ellipse((right - int(220 * scale), top - int(70 * scale), right + int(36 * scale), top + int(178 * scale)), fill=(255, 214, 102, 72))
    draw.ellipse((left - int(138 * scale), bottom - int(280 * scale), left + int(160 * scale), bottom + int(20 * scale)), fill=(96, 161, 255, 34))

    intro = (left + int(44 * scale), top + int(44 * scale), right - int(44 * scale), top + int(230 * scale))
    draw.rounded_rectangle(intro, radius=int(32 * scale), fill=(255, 255, 255, 230))
    icon_shell = (intro[0] + int(28 * scale), intro[1] + int(36 * scale), intro[0] + int(148 * scale), intro[1] + int(156 * scale))
    draw.rounded_rectangle(icon_shell, radius=int(26 * scale), fill="#FFFFFF")
    icon_size = int(90 * scale)
    icon_art = icon.resize((icon_size, icon_size), Image.Resampling.LANCZOS)
    canvas.alpha_composite(icon_art, (icon_shell[0] + int(15 * scale), icon_shell[1] + int(15 * scale)))
    draw.rounded_rectangle((intro[0] + int(174 * scale), intro[1] + int(46 * scale), intro[0] + int(264 * scale), intro[1] + int(82 * scale)), radius=int(18 * scale), fill=BRAND_YELLOW)
    draw.text((intro[0] + int(194 * scale), intro[1] + int(54 * scale)), "QRPlay", font=load_font(int(18 * scale), bold=True), fill="#4F4200")
    draw.text((intro[0] + int(174 * scale), intro[1] + int(96 * scale)), "앱 소개", font=load_font(int(38 * scale), bold=True), fill=TEXT_DARK)
    draw.text((intro[0] + int(174 * scale), intro[1] + int(148 * scale)), "아이와 함께하는 QR플레이북", font=load_font(int(24 * scale)), fill=TEXT_MUTED)

    list_box = (left + int(44 * scale), top + int(258 * scale), right - int(44 * scale), bottom - int(44 * scale))
    draw.rounded_rectangle(list_box, radius=int(30 * scale), fill=(255, 255, 255, 235))

    row_height = int(96 * scale)
    labels = [
        ("설정", None),
        ("개인정보처리방침", None),
        ("앱 버전", "1.0.0"),
        ("제작자에게 문의하기", None),
    ]
    for index, (label, value) in enumerate(labels):
        row_top = list_box[1] + index * row_height
        row_box = (list_box[0], row_top, list_box[2], row_top + row_height)
        draw_settings_row(draw, row_box, label, value, scale)
        if index < len(labels) - 1:
            draw.line((list_box[0] + int(24 * scale), row_box[3], list_box[2] - int(24 * scale), row_box[3]), fill=(92, 113, 132, 32), width=max(int(2 * scale), 1))


# Builds one screenshot image with a marketing header and app-like mock UI.
def create_screenshot(spec: ScreenshotSpec, size: tuple[int, int], icon: Image.Image) -> Image.Image:
    width, height = size
    scale = width / 1920
    image = make_gradient(size, "#EAF7FF", "#FFF1DE").convert("RGBA")
    add_background_orbs(image)
    add_glow(image, (int(width * 0.78), int(height * 0.28)), int(190 * scale), BRAND_SKY, 64)

    draw = ImageDraw.Draw(image)
    draw_brand_chip(image, icon, width, scale)
    draw_screenshot_header(draw, width, spec, scale)

    card_left = int(width * 0.52)
    card_top = int(82 * scale)
    card_right = width - int(width * 0.05)
    card_bottom = height - int(82 * scale)
    shadow = Image.new("RGBA", size, (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.rounded_rectangle((card_left + int(8 * scale), card_top + int(18 * scale), card_right + int(8 * scale), card_bottom + int(18 * scale)), radius=int(44 * scale), fill=(41, 71, 102, 46))
    shadow = shadow.filter(ImageFilter.GaussianBlur(max(int(18 * scale), 4)))
    image.alpha_composite(shadow)

    draw.rounded_rectangle((card_left, card_top, card_right, card_bottom), radius=int(42 * scale), fill=(255, 255, 255, 248), outline=(255, 255, 255, 180), width=max(int(3 * scale), 1))
    screen_box = (
        card_left + int(18 * scale),
        card_top + int(18 * scale),
        card_right - int(18 * scale),
        card_bottom - int(18 * scale),
    )

    if spec.screen_kind == "scanner":
        render_scanner_screen(image, screen_box, scale)
    elif spec.screen_kind == "player":
        render_player_screen(image, screen_box, scale, icon)
    elif spec.screen_kind == "history":
        render_history_screen(image, screen_box, scale)
    else:
        render_settings_screen(image, screen_box, scale, icon)

    return image


# Writes the screenshot sets for phone, 7-inch, and 10-inch tablet categories.
def create_screenshot_sets(icon: Image.Image) -> list[Path]:
    output_paths: list[Path] = []

    for variant, size in SIZE_VARIANTS.items():
        variant_dir = OUTPUT_DIR / variant
        variant_dir.mkdir(parents=True, exist_ok=True)
        for spec in SCREENSHOT_SPECS:
            image = create_screenshot(spec, size, icon)
            output_path = variant_dir / f"{spec.filename}.png"
            image.convert("RGB").save(output_path, optimize=True)
            output_paths.append(output_path)

    return output_paths


# Creates the output directories used by the generated assets.
def ensure_output_dirs() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)


# Runs the Play Store asset generation workflow end to end.
def main() -> None:
    ensure_output_dirs()
    trimmed_icon = load_trimmed_icon()
    create_app_icon(trimmed_icon)
    create_feature_graphic(trimmed_icon)
    create_screenshot_sets(trimmed_icon)
    print(f"Generated Play Store assets in: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
