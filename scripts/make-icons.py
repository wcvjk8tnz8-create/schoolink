#!/usr/bin/env python3
"""Generate Schoolink PWA icons from the smiling four-leaf clover (no external deps beyond Pillow)."""
from PIL import Image, ImageDraw
import os, math

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT, exist_ok=True)


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size, c1, c2):
    im = Image.new("RGB", (size, size))
    p = im.load()
    for y in range(size):
        for x in range(size):
            p[x, y] = lerp(c1, c2, (x + y) / (2 * size))
    return im.convert("RGBA")


def clover(size, scale=1.0, maskable=False):
    S = size
    base = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    if maskable:
        # maskable: full-bleed background, artwork inside the 80% safe zone
        bg = gradient(S, (86, 76, 235), (42, 122, 255))
        base.alpha_composite(bg)
    c = S / 2
    r = S * 0.155 * scale          # leaf rx
    h = S * 0.20 * scale          # leaf ry
    cy = c - S * 0.20 * scale     # leaf center offset

    for deg in (0, 90, 180, 270):
        layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
        d = ImageDraw.Draw(layer)
        d.ellipse([c - r, cy - h, c + r, cy + h], fill=(123, 108, 250, 255))
        layer = layer.rotate(deg, center=(c, c), resample=Image.BICUBIC)
        base.alpha_composite(layer)

    d = ImageDraw.Draw(base)
    fr = S * 0.19 * scale
    d.ellipse([c - fr, c - fr, c + fr, c + fr], fill=(47, 40, 130, 255))

    w = max(2, int(S * 0.032 * scale))
    # wink: ›
    d.line([(c - fr * .55, c - fr * .28), (c - fr * .25, c),
            (c - fr * .55, c + fr * .28)], fill=(255, 255, 255, 255), width=w, joint="curve")
    # right eye
    er = S * 0.026 * scale
    d.ellipse([c + fr * .42 - er, c - fr * .10 - er,
               c + fr * .42 + er, c - fr * .10 + er], fill=(255, 255, 255, 255))
    # smile: arc via sampled polyline
    pts = []
    for i in range(25):
        t = i / 24
        x = c - fr * .48 + fr * .96 * t
        y = c + fr * .38 + math.sin(math.pi * t) * fr * .42
        pts.append((x, y))
    d.line(pts, fill=(255, 255, 255, 255), width=w, joint="curve")
    # cheeks
    cr = S * 0.022 * scale
    for cx in (c - fr * .78, c + fr * .78):
        d.ellipse([cx - cr, c + fr * .22 - cr, cx + cr, c + fr * .22 + cr],
                  fill=(255, 157, 187, 190))
    return base


for size, name, sc, mask in [
    (192, "icon-192.png", 1.0, False),
    (512, "icon-512.png", 1.0, False),
    (512, "icon-maskable.png", 0.72, True),
    (180, "apple-touch-icon.png", 1.0, True),
]:
    im = clover(size, sc, mask)
    im.convert("RGB" if mask else "RGBA").save(os.path.join(OUT, name))
    print("✓", name, im.size)
