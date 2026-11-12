"""Erzeugt die App-Icons der PWA in frontend/public/ (python scripts/gen_icons.py, braucht Pillow)."""
from pathlib import Path

from PIL import Image, ImageDraw

BG_TOP = "#262B33"      # Verlauf oben (etwas heller) …
BG = "#14171C"          # … nach unten zum App-Grundton im Dunkelmodus
ACCENT = "#C09537"
POS = "#22c55e"


def _mix(c1: str, c2: str, t: float) -> str:
    """Farbe c2 zu Anteil t über c1 legen (Pillow überblendet beim Zeichnen nicht)."""
    a = [int(c1[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(c2[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{round(x + (y - x) * t):02x}" for x, y in zip(a, b))


BAR = _mix(_mix(BG, BG_TOP, 0.4), ACCENT, 0.35)
OUT = Path(__file__).resolve().parent.parent / "frontend" / "public"

# Kurslinie im Einheitsquadrat (0..1), y nach unten
LINE = [(0.14, 0.70), (0.32, 0.52), (0.46, 0.60), (0.64, 0.36), (0.86, 0.24)]
BARS = [(0.18, 0.80), (0.34, 0.74), (0.50, 0.77), (0.66, 0.70), (0.82, 0.66)]  # (x, oberkante)


def draw(size: int, safe: float = 1.0, rounded: bool = True) -> Image.Image:
    """safe < 1 verkleinert das Motiv (für maskable Icons mit Sicherheitszone)."""
    scale = 4  # supersampling für glatte Kanten
    s = size * scale
    # Hintergrund: senkrechter Verlauf, dann auf die (abgerundete) Form zuschneiden
    gradient = Image.new("RGBA", (1, s))
    for y in range(s):
        c = _mix(BG_TOP, BG, y / (s - 1))
        gradient.putpixel((0, y), tuple(int(c[i:i + 2], 16) for i in (1, 3, 5)) + (255,))
    gradient = gradient.resize((s, s))
    mask = Image.new("L", (s, s), 0)
    radius = int(s * 0.22) if rounded else 0
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=255)
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    img.paste(gradient, (0, 0), mask)
    d = ImageDraw.Draw(img)

    def p(x, y):
        off = (1 - safe) / 2
        return (s * (off + x * safe), s * (off + y * safe))

    bar_w = s * 0.07 * safe
    for x, top in BARS:
        x0, y0 = p(x, top)
        _, y1 = p(x, 0.86)
        d.rectangle([x0 - bar_w / 2, y0, x0 + bar_w / 2, y1], fill=BAR)
    pts = [p(x, y) for x, y in LINE]
    d.line(pts, fill=ACCENT, width=int(s * 0.06 * safe), joint="curve")
    r = s * 0.055 * safe
    x, y = pts[-1]
    d.ellipse([x - r, y - r, x + r, y + r], fill=POS)
    return img.resize((size, size), Image.LANCZOS)


def svg() -> str:
    pts = " ".join(f"{x * 64:.1f},{y * 64:.1f}" for x, y in LINE)
    bars = "".join(
        f'<rect x="{(x - 0.035) * 64:.1f}" y="{top * 64:.1f}" width="{0.07 * 64:.1f}" height="{(0.86 - top) * 64:.1f}" fill="{BAR}"/>'
        for x, top in BARS
    )
    ex, ey = LINE[-1]
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">'
        f'<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{BG_TOP}"/><stop offset="1" stop-color="{BG}"/></linearGradient></defs>'
        f'<rect width="64" height="64" rx="14" fill="url(#bg)"/>{bars}'
        f'<polyline points="{pts}" fill="none" stroke="{ACCENT}" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round"/>'
        f'<circle cx="{ex * 64:.1f}" cy="{ey * 64:.1f}" r="3.5" fill="{POS}"/></svg>\n'
    )


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    draw(192).save(OUT / "icon-192.png")
    draw(512).save(OUT / "icon-512.png")
    draw(512, safe=0.72, rounded=False).save(OUT / "icon-maskable-512.png")
    # iOS rundet selbst ab und mag keine Transparenz
    draw(180, rounded=False).convert("RGB").save(OUT / "apple-touch-icon.png")
    (OUT / "favicon.svg").write_text(svg(), encoding="utf-8")
    print(f"Icons in {OUT} erzeugt")
