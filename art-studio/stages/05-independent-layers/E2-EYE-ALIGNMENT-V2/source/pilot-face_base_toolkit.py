#!/usr/bin/env python3
"""Reusable low-level procedures for the E2 full face-base stage.

Generalised from the published pilot 504d1f7 (`E2-FACE-BASE-PILOT/
build_pilot.py`): the same deterministic manual raster reconstruction,
fitted soft hybrid mattes, pixel verification and labelled comparison
sheets are exposed as parameterised procedures so the right eye and the
mouth can reuse them with their own hand-drawn geometry.

NO generative AI, NO inpainting, NO generative fill, NO diffusion and NO
content-aware tool is used. Every new colour is interpolated from real,
hand-verified skin pixels of the untouched source frame. Sources are
read-only copies; every write stays inside this stage folder.

Only the Python standard library and ImageMagick `convert` are required
(numpy / PIL are not available in this environment).
"""

import sys

sys.dont_write_bytecode = True

import hashlib
import json
import math
import subprocess
from pathlib import Path

W, H = 848, 1264
FONT = "DejaVu-Sans"          # helvetica is not installed here
BG = "#f2f2f2"
INK = "#1b1b1b"


# --------------------------------------------------------------- raw pixels
def run(args, data=None):
    p = subprocess.run([str(a) for a in args], input=data, capture_output=True)
    if p.returncode != 0:
        raise RuntimeError(" ".join(map(str, args)) + "\n" +
                           p.stderr.decode("utf-8", "replace"))
    return p.stdout


def read_rgb(path):
    b = run(["convert", path, "-alpha", "off", "-depth", "8", "rgb:-"])
    assert len(b) == W * H * 3, (path, len(b))
    return b


def write_rgb(path, buf):
    assert len(buf) == W * H * 3
    run(["convert", "-size", f"{W}x{H}", "-depth", "8", "rgb:-", path], buf)


def read_gray(path):
    b = run(["convert", path, "-depth", "8", "gray:-"])
    assert len(b) == W * H, (path, len(b))
    return b


def write_gray(path, buf):
    assert len(buf) == W * H
    run(["convert", "-size", f"{W}x{H}", "-depth", "8", "gray:-",
         "-type", "Grayscale", path], buf)


def read_rgba(path):
    b = run(["convert", path, "-depth", "8", "rgba:-"])
    assert len(b) == W * H * 4, (path, len(b))
    return b


def write_rgba(path, buf):
    assert len(buf) == W * H * 4
    run(["convert", "-size", f"{W}x{H}", "-depth", "8", "rgba:-",
         "PNG32:" + str(path)], buf)


def lum(r, g, b):
    return (r * 299 + g * 587 + b * 114) // 1000


def clamp255(v):
    return 0 if v < 0 else 255 if v > 255 else int(round(v))


def texture(x, y):
    """Deterministic tiny grain; identical to the published pilot."""
    h = (x * 73856093 ^ y * 19349663 ^ 0x9E3779B9) & 0xFFFF
    return ((h & 7) - 3, ((h >> 3) & 7) - 3, ((h >> 6) & 7) - 3)


# --------------------------------------------------------------- geometry
def point_in_poly(poly, x, y):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def signed_distance(poly, x, y):
    best = 1e9
    n = len(poly)
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        dx, dy = bx - ax, by - ay
        d2 = dx * dx + dy * dy
        t = 0.0 if d2 == 0 else max(0.0, min(1.0, ((x - ax) * dx + (y - ay) * dy) / d2))
        px, py = ax + t * dx, ay + t * dy
        best = min(best, math.hypot(x - px, y - py))
    return best if point_in_poly(poly, x, y) else -best


def band_alpha(poly, x, y, feather):
    d = signed_distance(poly, x, y)
    return max(0.0, min(1.0, (d + feather) / feather))


def poly_bbox(poly):
    xs = [p[0] for p in poly]
    ys = [p[1] for p in poly]
    return min(xs), min(ys), max(xs), max(ys)


def rect_contains(r, x, y):
    return r[0] <= x <= r[2] and r[1] <= y <= r[3]


def in_rects(rects, x, y):
    return any(rect_contains(r, x, y) for r in rects)


# --------------------------------------------------------------- skin field
def skin_like(c):
    """Real skin of this artwork: warm orange, not hair / not ink / not white."""
    r, g, b = c
    L = lum(*c)
    return (120 <= L <= 210 and r >= g + 20 and g >= b + 8
            and b < 150 and r - b < 160)


def auto_ring_anchors(src, poly, protected, offsets=(4.0, 7.0), step=3):
    """Real skin samples on a ring just OUTSIDE the hand-drawn polygon.

    This is what removes seams: the interpolation is anchored to the exact
    local skin tone at the border instead of a flat invented gradient.
    """
    cx = sum(p[0] for p in poly) / len(poly)
    cy = sum(p[1] for p in poly) / len(poly)
    out = []
    seen = set()
    n = len(poly)
    for i in range(n):
        ax, ay = poly[i]
        bx, by = poly[(i + 1) % n]
        dx, dy = bx - ax, by - ay
        length = math.hypot(dx, dy)
        if length == 0:
            continue
        nx, ny = dy / length, -dx / length
        mx, my = (ax + bx) / 2.0, (ay + by) / 2.0
        # point the normal away from the polygon centre
        if nx * (cx - mx) + ny * (cy - my) > 0:
            nx, ny = -nx, -ny
        for t in range(0, int(length) + 1, step):
            px, py = ax + dx * t / length, ay + dy * t / length
            for off in offsets:
                x, y = int(round(px + nx * off)), int(round(py + ny * off))
                if not (0 <= x < W and 0 <= y < H) or (x, y) in seen:
                    continue
                if in_rects(protected, x, y):
                    continue
                k = (y * W + x) * 3
                c = (src[k], src[k + 1], src[k + 2])
                if skin_like(c):
                    seen.add((x, y))
                    out.append((x, y, c))
    return out


def collect_anchors(src, poly, protected, hand_picked, max_n=48):
    """Hand-verified samples first, then an automatic real-skin border ring.

    Hand candidates that happen to be ink / hair / a protected feature are
    skipped instead of being trusted: only real, clean skin is ever used.
    """
    out = []
    seen = set()
    skipped = []
    for x, y in hand_picked:
        if (x, y) in seen or in_rects(protected, x, y):
            skipped.append((x, y))
            continue
        k = (y * W + x) * 3
        c = (src[k], src[k + 1], src[k + 2])
        if not skin_like(c):
            skipped.append((x, y))
            continue
        seen.add((x, y))
        out.append((x, y, c))
    for a in auto_ring_anchors(src, poly, protected):
        if a[0:2] in seen:
            continue
        seen.add(a[0:2])
        out.append(a)
        if len(out) >= max_n:
            break
    assert len(out) >= 12, ("too few real skin anchors", len(out))
    return out, skipped


def skin_field(anchors, x, y, soften=7.0):
    acc = [0.0, 0.0, 0.0]
    wsum = 0.0
    for ax, ay, c in anchors:
        d2 = (x - ax) ** 2 + (y - ay) ** 2
        w = 1.0 / (d2 + soften * soften)
        acc[0] += w * c[0]
        acc[1] += w * c[1]
        acc[2] += w * c[2]
        wsum += w
    return [v / wsum for v in acc]


def build_clean_delta(src, poly, protected, hand_picked, feather=3.0,
                      soften=7.0, shade=None, grain=True, ink_cleanup=False):
    """Repaint only the hand-drawn polygon; return a full-frame delta image.

    `delta` equals `src` everywhere outside the polygon (and inside every
    protected rectangle). The returned `changed` set is the exact pixel
    ownership of this zone, used later for expression switching.
    """
    anchors, skipped = collect_anchors(src, poly, protected, hand_picked)
    x0, y0, x1, y1 = poly_bbox(poly)
    span = max(1, y1 - y0)
    out = bytearray(src)
    changed = set()
    # Iterate the whole feathered bbox: band_alpha() handles the soft border.
    # (A point-in-poly column test would skip the exact rightmost boundary
    #  column and leave a 1px line of open-eye ink behind.)
    for x in range(x0 - 5, x1 + 6):
        for y in range(y0 - 5, y1 + 6):
            a = band_alpha(poly, x, y, feather)
            if a <= 0.0 or in_rects(protected, x, y):
                continue
            i0 = (y * W + x) * 3
            if ink_cleanup and lum(src[i0], src[i0 + 1], src[i0 + 2]) < 110:
                # fully erase dark open-eye ink even on the feathered border;
                # bright hair / skin is never repainted this way
                a = max(a, 0.95)
            t = max(0.0, min(1.0, (y - y0) / span))
            col = skin_field(anchors, x, y, soften)
            if shade is not None:
                s = shade(t)
                col = [col[k] * s for k in range(3)]
            if grain:
                tx = texture(x, y)
                col = [col[k] + tx[k] for k in range(3)]
            i = (y * W + x) * 3
            for k in range(3):
                out[i + k] = clamp255(src[i + k] * (1 - a) + col[k] * a)
            changed.add(y * W + x)
    return bytes(out), changed, anchors, skipped


def apply_delta(buf, delta, changed):
    """Copy only this zone's owned pixels into `buf` (zones are disjoint)."""
    out = bytearray(buf)
    for p in changed:
        i = p * 3
        out[i:i + 3] = delta[i:i + 3]
    return bytes(out)


def strip_delta(buf, src, changed):
    """Return to the neutral original for exactly this zone's pixels."""
    out = bytearray(buf)
    for p in changed:
        i = p * 3
        out[i:i + 3] = src[i:i + 3]
    return bytes(out)


# --------------------------------------------------------------- mattes
def build_hybrid_mask(elem, base, lens, protected, feather=3.0,
                      skin_mix=0.40, ink_low=12.0, ink_span=44.0):
    """Fitted soft lens + ink-aware strength.

    Dark strokes / saturated lip ink stay essentially opaque; the plain AI
    skin is mostly replaced by the manually restored base. Colour difference
    (not luminance alone) is used so pink lips of mouth_open-A and the faint
    mid-tone line of mouth_smile-A are detected correctly.
    """
    alpha = bytearray(W * H)
    x0, y0, x1, y1 = poly_bbox(lens)
    for y in range(y0 - 6, y1 + 7):
        for x in range(x0 - 6, x1 + 7):
            if in_rects(protected, x, y):
                continue
            band = band_alpha(lens, x, y, feather)
            if band <= 0.0:
                continue
            i = (y * W + x) * 3
            d = max(abs(elem[i + k] - base[i + k]) for k in range(3))
            el = lum(elem[i], elem[i + 1], elem[i + 2])
            bl = lum(base[i], base[i + 1], base[i + 2])
            ink = max(0.0, min(1.0, (d - ink_low) / ink_span))
            # extra safeguard for genuinely dark ink (lashes, open mouth)
            ink = max(ink, max(0.0, min(1.0, (bl - el - 12.0) / 52.0)))
            strength = skin_mix + (1.0 - skin_mix) * ink
            alpha[y * W + x] = clamp255(band * strength * 255)
    return bytes(alpha)


def mask_stats(alpha):
    nz = sum(1 for v in alpha if v)
    full = sum(1 for v in alpha if v == 255)
    return {"maskNonZeroPixels": nz, "maskFullyOpaquePixels": full,
            "maskPartialPixels": nz - full}


def mask_bbox(alpha):
    xs, ys = [], []
    for y in range(H):
        row = alpha[y * W:(y + 1) * W]
        if any(row):
            ys.append(y)
            xs += [x for x, v in enumerate(row) if v]
    if not xs:
        return None
    return [min(xs), min(ys), max(xs), max(ys)]


def save_mask_and_layer(mask_path, layer_path, alpha, elem):
    write_gray(mask_path, alpha)
    rgba = bytearray(W * H * 4)
    for p in range(W * H):
        rgba[p * 4:p * 4 + 3] = elem[p * 3:p * 3 + 3]
        rgba[p * 4 + 3] = alpha[p]
    write_rgba(layer_path, bytes(rgba))


def composite(base, elem, alpha):
    out = bytearray(base)
    touched = 0
    for p in range(W * H):
        a = alpha[p]
        if a == 0:
            continue
        f = a / 255.0
        i = p * 3
        for k in range(3):
            out[i + k] = clamp255(base[i + k] * (1 - f) + elem[i + k] * f)
        touched += 1
    return bytes(out), touched


# --------------------------------------------------------------- checks
def diff_stats(a, b, rect):
    x0, y0, x1, y1 = rect
    n = total = mx = 0
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            i = (y * W + x) * 3
            d = max(abs(a[i + k] - b[i + k]) for k in range(3))
            total += d
            mx = max(mx, d)
            n += 1
    return {"pixels": n, "meanMaxChannelDiff": round(total / n, 6),
            "maxDiff": mx}


def diff_bbox(a, b):
    x0, y0, x1, y1 = W, H, -1, -1
    n = 0
    for y in range(H):
        for x in range(W):
            i = (y * W + x) * 3
            if a[i] != b[i] or a[i + 1] != b[i + 1] or a[i + 2] != b[i + 2]:
                x0, y0, x1, y1 = min(x0, x), min(y0, y), max(x1, x), max(y1, y)
                n += 1
    return {"changedPixels": n, "bbox": [x0, y0, x1, y1] if n else None}


def outside_rect_count(a, b, rect):
    x0, y0, x1, y1 = rect
    n = 0
    for y in range(H):
        for x in range(W):
            if rect_contains(rect, x, y):
                continue
            i = (y * W + x) * 3
            if a[i] != b[i] or a[i + 1] != b[i + 1] or a[i + 2] != b[i + 2]:
                n += 1
    return n


def seam_rmse(a, b, poly, inner=1.0, outer=4.0):
    x0, y0, x1, y1 = poly_bbox(poly)
    acc = n = 0
    for y in range(y0 - 6, y1 + 7):
        for x in range(x0 - 6, x1 + 7):
            d = signed_distance(poly, x, y)
            if not (-outer <= d <= inner):
                continue
            i = (y * W + x) * 3
            for k in range(3):
                acc += (a[i + k] - b[i + k]) ** 2
            n += 3
    return round(math.sqrt(acc / n), 4) if n else None


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def write_json(path, obj):
    Path(path).write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n",
                          encoding="utf-8")


# --------------------------------------------------------------- sheets
def crop_zoom(path, src, crop, scale, label=None, bar=34):
    tmp = Path(str(path) + ".tmp.png")
    run(["convert", src, "-alpha", "off", "-crop", crop, "+repage",
         "-filter", "Point", "-resize", scale, "-depth", "8", str(tmp)])
    if label:
        args = ["convert", str(tmp), "-gravity", "north", "-background", "#ffffff",
                "-splice", f"0x{bar}", "-fill", INK, "-font", FONT, "-pointsize", "18",
                "-gravity", "northwest", "-annotate", "+10+6", label,
                "-bordercolor", "#bdbdbd", "-border", "1", "PNG32:" + str(path)]
        run(args)
        tmp.unlink(missing_ok=True)
    else:
        tmp.replace(path)
    return path


def sheet(path, panels, cols=2, gap=12):
    """`panels` = list of (png path, caption). iPhone-friendly: <=1200 px wide."""
    tmp = Path(str(path) + ".tmp.png")
    made = []
    for i, (src, label) in enumerate(panels):
        dst = Path(str(path) + f".p{i}.png")
        run(["convert", src, "-gravity", "north", "-background", "#ffffff",
             "-splice", "0x32", "-fill", INK, "-font", FONT, "-pointsize", "17",
             "-gravity", "northwest", "-annotate", "+8+6", label,
             "-bordercolor", "#bdbdbd", "-border", "1", "PNG32:" + str(dst)])
        made.append(dst)
    dims = [tuple(int(v) for v in run(["identify", "-format", "%w %h", p])
                  .decode().split()) for p in made]
    pw, ph = max(d[0] for d in dims), max(d[1] for d in dims)
    rows = (len(made) + cols - 1) // cols
    Wc, Hc = cols * pw + (cols + 1) * gap, rows * ph + (rows + 1) * gap
    args = ["convert", "-size", f"{Wc}x{Hc}", f"xc:{BG}", "-depth", "8"]
    for i, p in enumerate(made):
        x = gap + (i % cols) * (pw + gap)
        y = gap + (i // cols) * (ph + gap)
        args += [str(p), "-geometry", f"+{x}+{y}", "-compose", "Over", "-composite"]
    args += ["PNG32:" + str(path)]
    run(args)
    for p in made:
        p.unlink()
    tmp.unlink(missing_ok=True)
    return [Wc, Hc]
