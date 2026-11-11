#!/usr/bin/env python3
"""E2 / FACE BASE PILOT - eye_l_closed-B ONLY.

Technical pilot, not final art and not rig integration.

Pipeline (all deterministic, hand-specified geometry; NO generative AI,
NO inpainting, NO generative fill, NO diffusion / content-aware tool):

  1. A read-only COPY of IMG_4038_rig-pose.webp is the base frame.
  2. The OPEN left eye is removed by MANUAL skin reconstruction: inside a
     hand-drawn eye-shaped polygon (following the hair fringe diagonal) every
     pixel is repainted with an authored skin field interpolated between 13
     hand-picked, real skin samples around the eye, plus a soft eyelid shadow
     and a small deterministic grain. A 3 px feather blends the border.
     Nothing outside the polygon is touched.
  3. A NEW alpha matte for the approved element eye_l_closed-B is a fitted,
     soft-edged LID LENS: it follows the eye shape, excludes brow, hair fringe,
     central hair strand, cheek skin, nose line and nose highlight, and is
     feathered. The clean base underneath guarantees that no open-eye ink can
     show through at the semi-transparent edge.
  4. A REJECTED alternative (stroke-only matte) is kept under variants/ with
     its visible defect, for an honest comparison. It is NOT the pilot result.
  5. Overlay = clean base + masked element. Full-size frame, 1:1 face crop,
     4x / 8x zooms and comparison sheets are written for visual checking.
  6. Protected zones are verified pixel-for-pixel against the original.

All writes go into this pilot folder. Sources are read-only copies.
"""

import sys

sys.dont_write_bytecode = True

import hashlib
import json
import math
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
VARIANTS = ROOT / "variants"
VARIANTS.mkdir(exist_ok=True)
W, H = 848, 1264
SOURCE = ROOT / "source-frame.webp"
ELEMENT = ROOT / "element-eye_l_closed-B.png"
E1_LAYER = ROOT / "e1-layer-14_eye_l_open.png"

# ---------------------------------------------------------------- hand geometry
# Open eye, bounded on the left by the DIAGONAL hair fringe edge, above by the
# brow, on the right by the central hair strand, below by the cheek contour.
EYE_POLY = [
    (395, 150), (399, 150), (404, 151), (408, 155), (408, 162),
    (408, 168), (405, 173), (400, 176), (393, 177), (386, 176),
    (380, 173), (377, 169), (380, 166), (385, 162), (390, 157), (393, 153),
]

# Fitted soft lid lens for the approved closed-eye element. Deliberately
# smaller than the published solid zone ellipse (rx30/ry24 at 397,162).
LENS_POLY = [
    (378, 168), (382, 161), (388, 155), (394, 151), (400, 150),
    (405, 152), (409, 157), (410, 164), (408, 170), (403, 175),
    (396, 177), (388, 176), (381, 173),
]

# Rejected alternative: only the dark strokes of the element are composited.
STROKE_POLY = [
    (374, 164), (378, 158), (386, 155), (396, 154), (404, 156),
    (410, 160), (411, 168), (407, 174), (398, 177), (388, 177),
    (380, 174), (375, 170),
]

# Hand-picked clean skin sample points read directly from the untouched
# original. No invented colours - every anchor is an actual pixel.
SKIN_ANCHORS = [
    (380, 178), (384, 181), (386, 178), (390, 182), (390, 186),
    (397, 182), (404, 181), (408, 186), (410, 178), (414, 176),
    (418, 172), (418, 162), (418, 155),
]
IDW_SOFTEN = 9.0

# Explicit protected features. All lie OUTSIDE the eye / lens polygons.
PROTECTED = {
    "brow":            (392, 136, 416, 149),
    "hair_fringe":     (352, 130, 376, 200),
    "hair_tip":        (374, 143, 385, 157),
    "hair_strand":     (412, 130, 417, 172),
    "cheek_skin":      (382, 182, 432, 210),
    "nose_line":       (412, 178, 418, 200),
    "nose_highlight":  (419, 178, 426, 192),
}

BASE_FEATHER = 3.0
LENS_FEATHER = 3.5
# plain AI skin is mixed with the manually restored base; ink stays opaque
LENS_SKIN_MIX = 0.55
STROKE_FEATHER = 1.5
FACE_CROP = "200x150+340+105"
ZOOM_CROP = "80x70+355+125"


def run(args, data=None):
    p = subprocess.run(args, input=data, capture_output=True)
    if p.returncode != 0:
        raise RuntimeError(" ".join(map(str, args)) + "\n" + p.stderr.decode("utf-8", "replace"))
    return p.stdout


def read_rgb(path):
    b = run(["convert", str(path), "-alpha", "off", "-depth", "8", "rgb:-"])
    assert len(b) == W * H * 3, (path, len(b))
    return b


def write_rgb(path, buf):
    assert len(buf) == W * H * 3
    run(["convert", "-size", f"{W}x{H}", "-depth", "8", "rgb:-", str(path)], buf)


def write_gray(path, buf):
    assert len(buf) == W * H
    run(["convert", "-size", f"{W}x{H}", "-depth", "8", "gray:-",
         "-type", "Grayscale", str(path)], buf)


def write_rgba(path, buf):
    assert len(buf) == W * H * 4
    run(["convert", "-size", f"{W}x{H}", "-depth", "8", "rgba:-",
         "PNG32:" + str(path)], buf)


def lum(r, g, b):
    return (r * 299 + g * 587 + b * 114) // 1000


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


def skin_anchors(src):
    out = []
    for x, y in SKIN_ANCHORS:
        i = (y * W + x) * 3
        c = (src[i], src[i + 1], src[i + 2])
        assert lum(*c) >= 120, ((x, y), c)  # never sample ink / hair
        out.append((x, y, c))
    return out


def skin_field(anchors, x, y):
    acc = [0.0, 0.0, 0.0]
    wsum = 0.0
    for ax, ay, c in anchors:
        d2 = (x - ax) ** 2 + (y - ay) ** 2
        w = 1.0 / (d2 + IDW_SOFTEN ** 2)
        for k in range(3):
            acc[k] += w * c[k]
        wsum += w
    return [v / wsum for v in acc]


def texture(x, y):
    h = (x * 73856093 ^ y * 19349663 ^ 0x9E3779B9) & 0xFFFF
    return ((h & 7) - 3, ((h >> 3) & 7) - 3, ((h >> 6) & 7) - 3)


def rect_contains(r, x, y):
    return r[0] <= x <= r[2] and r[1] <= y <= r[3]


def in_any_protected(x, y):
    return any(rect_contains(r, x, y) for r in PROTECTED.values())


def clamp255(v):
    return 0 if v < 0 else 255 if v > 255 else int(round(v))


# ---------------------------------------------------------------- 1. clean base
def build_clean_base(src):
    anchors = skin_anchors(src)
    x0, y0, x1, y1 = poly_bbox(EYE_POLY)
    cols = {}
    for x in range(x0 - 4, x1 + 5):
        ys = [y for y in range(y0 - 4, y1 + 5) if point_in_poly(EYE_POLY, x, y)]
        cols[x] = (min(ys), max(ys)) if ys else None

    out = bytearray(src)
    painted = 0
    for x in range(x0 - 4, x1 + 5):
        if cols[x] is None:
            continue
        ytop, ybot = cols[x]
        span = max(1, ybot - ytop)
        for y in range(y0 - 4, y1 + 5):
            a = band_alpha(EYE_POLY, x, y, BASE_FEATHER)
            if a <= 0.0 or in_any_protected(x, y):
                continue
            t = max(0.0, min(1.0, (y - ytop) / span))
            col = skin_field(anchors, x, y)
            # authored shading: darker eyelid skin under the fringe, matching
            # the original cheek skin at the bottom of the polygon
            shade = 0.80 + 0.20 * t
            shade *= 1.0 - 0.035 * math.exp(-((t - 0.18) / 0.22) ** 2)
            tx, ty, tz = texture(x, y)
            col = [col[k] * shade + (tx, ty, tz)[k] for k in range(3)]
            i = (y * W + x) * 3
            for k in range(3):
                out[i + k] = clamp255(src[i + k] * (1 - a) + col[k] * a)
            painted += 1
    write_rgb(ROOT / "01-clean-base.png", bytes(out))
    return bytes(out), {"skinAnchorCount": len(anchors),
                        "skinAnchorCoords": SKIN_ANCHORS,
                        "skinField": "inverse-distance interpolation, soften=9px",
                        "cleanBaseFeatherPx": BASE_FEATHER,
                        "cleanBasePixelsRepainted": painted}


# ---------------------------------------------------------------- 2. masks
def build_lens_mask(elem, base):
    alpha = bytearray(W * H)
    x0, y0, x1, y1 = poly_bbox(LENS_POLY)
    for y in range(y0 - 5, y1 + 6):
        for x in range(x0 - 5, x1 + 6):
            if in_any_protected(x, y):
                continue
            band = band_alpha(LENS_POLY, x, y, LENS_FEATHER)
            if band <= 0.0:
                continue
            i = (y * W + x) * 3
            el = lum(elem[i], elem[i + 1], elem[i + 2])
            bl = lum(base[i], base[i + 1], base[i + 2])
            ink = max(0.0, min(1.0, (bl - el - 10.0) / 50.0))
            strength = LENS_SKIN_MIX + (1.0 - LENS_SKIN_MIX) * ink
            alpha[y * W + x] = clamp255(band * strength * 255)
    return bytes(alpha)


def build_stroke_mask(elem, base):
    alpha = bytearray(W * H)
    x0, y0, x1, y1 = poly_bbox(STROKE_POLY)
    for y in range(y0 - 3, y1 + 4):
        for x in range(x0 - 3, x1 + 4):
            if in_any_protected(x, y):
                continue
            ba = band_alpha(STROKE_POLY, x, y, STROKE_FEATHER)
            if ba <= 0.0:
                continue
            i = (y * W + x) * 3
            er, eg, eb = elem[i], elem[i + 1], elem[i + 2]
            br, bg, bb = base[i], base[i + 1], base[i + 2]
            el, bl = lum(er, eg, eb), lum(br, bg, bb)
            ink = max(0.0, min(1.0, (bl - el - 14.0) / 42.0))
            dark = max(0.0, min(1.0, (178.0 - el) / 48.0))
            alpha[y * W + x] = clamp255(ink * dark * ba * 255)
    return bytes(alpha)


def mask_stats(alpha):
    nz = sum(1 for v in alpha if v)
    full = sum(1 for v in alpha if v == 255)
    return {"maskNonZeroPixels": nz, "maskFullyOpaquePixels": full,
            "maskPartialPixels": nz - full}


def save_mask_and_layer(name, alpha, elem, prefix):
    write_gray(ROOT / f"{prefix}-mask-{name}.png", alpha)
    rgba = bytearray(W * H * 4)
    for p in range(W * H):
        rgba[p * 4:p * 4 + 3] = elem[p * 3:p * 3 + 3]
        rgba[p * 4 + 3] = alpha[p]
    write_rgba(ROOT / f"{prefix}-masked-element-{name}.png", bytes(rgba))


# ---------------------------------------------------------------- 3. overlay
def composite(base, elem, alpha):
    out = bytearray(base)
    touched = 0
    for y in range(140, 190):
        for x in range(365, 425):
            p = y * W + x
            a = alpha[p] / 255.0
            if a <= 0:
                continue
            i = p * 3
            for k in range(3):
                out[i + k] = clamp255(base[i + k] * (1 - a) + elem[i + k] * a)
            touched += 1
    return bytes(out), {"overlayPixelsTouched": touched}


# ---------------------------------------------------------------- 4. verification
def diff_stats(a, b, rect):
    x0, y0, x1, y1 = rect
    n = 0
    total = 0
    mx = 0
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            i = (y * W + x) * 3
            d = max(abs(a[i + k] - b[i + k]) for k in range(3))
            total += d
            mx = max(mx, d)
            n += 1
    return {"pixels": n, "meanMaxChannelDiff": round(total / n, 6), "maxDiff": mx}


def seam_rmse(a, b, poly, inner=1.0, outer=4.0):
    x0, y0, x1, y1 = poly_bbox(poly)
    acc = 0
    n = 0
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


def main():
    src = read_rgb(SOURCE)
    elem = read_rgb(ELEMENT)

    base, base_meta = build_clean_base(src)
    lens = build_lens_mask(elem, base)
    stroke = build_stroke_mask(elem, base)

    save_mask_and_layer("eye_l_closed-B", lens, elem, "02")
    write_gray(VARIANTS / "mask-stroke-only-REJECTED.png", stroke)
    stroke_rgba = bytearray(W * H * 4)
    for p in range(W * H):
        stroke_rgba[p * 4:p * 4 + 3] = elem[p * 3:p * 3 + 3]
        stroke_rgba[p * 4 + 3] = stroke[p]
    write_rgba(VARIANTS / "masked-element-stroke-only-REJECTED.png", bytes(stroke_rgba))

    overlay, overlay_meta = composite(base, elem, lens)
    write_rgb(ROOT / "03-overlay-full.png", overlay)
    stroke_overlay, stroke_meta = composite(base, elem, stroke)
    write_rgb(VARIANTS / "overlay-stroke-only-REJECTED.png", stroke_overlay)

    # published E2 solid-ellipse overlay, recomposed at full canvas
    e2_full = run(["convert", str(SOURCE), "-alpha", "off", str(ELEMENT),
                   "-compose", "Over", "-composite", "-depth", "8", "rgb:-"])

    protected = {}
    for name, rect in PROTECTED.items():
        protected[name] = {
            "rect": list(rect),
            "cleanBase_vs_original": diff_stats(base, src, rect),
            "pilotOverlay_vs_original": diff_stats(overlay, src, rect),
            "pilotOverlay_vs_cleanBase": diff_stats(overlay, base, rect),
            "strokeVariant_vs_original": diff_stats(stroke_overlay, src, rect),
            "publishedE2Overlay_vs_original": diff_stats(e2_full, src, rect),
            "pilotMaskNonZeroPixels": sum(
                1 for y in range(rect[1], rect[3] + 1)
                for x in range(rect[0], rect[2] + 1) if lens[y * W + x] > 0),
        }

    report = {
        "stage": "E2-FACE-BASE-PILOT",
        "pilotArea": "eye_l_closed-B",
        "method": "manual skin reconstruction + fitted soft hybrid lid-lens alpha matte",
        "generativeAI": False,
        "inpainting": False,
        "generativeFill": False,
        "sourcesAreReadOnlyCopies": True,
        "handDrawnGeometry": {
            "eyePolygon": EYE_POLY, "lidLensPolygon": LENS_POLY,
            "rejectedStrokeBandPolygon": STROKE_POLY,
            "cleanBaseFeatherPx": BASE_FEATHER, "lensFeatherPx": LENS_FEATHER,
            "lensPlainSkinMix": LENS_SKIN_MIX,
        },
        "protectedZones": PROTECTED,
        "cleanBase": base_meta,
        "mask": mask_stats(lens),
        "overlay": overlay_meta,
        "rejectedVariant": {
            "reason": "stroke-only matte leaves a visibly flat skin patch",
            "mask": mask_stats(stroke), "overlay": stroke_meta,
        },
        "verification": protected,
        "seamRMSE": {
            "pilotOverlay_vs_original_aroundEye": seam_rmse(overlay, src, EYE_POLY),
            "strokeVariant_vs_original_aroundEye": seam_rmse(stroke_overlay, src, EYE_POLY),
            "publishedE2SolidEllipse_vs_original_aroundEye": seam_rmse(e2_full, src, EYE_POLY),
        },
        "sourceSHA256": {
            "source-frame.webp": sha256(SOURCE),
            "element-eye_l_closed-B.png": sha256(ELEMENT),
            "e1-layer-14_eye_l_open.png": sha256(E1_LAYER),
        },
    }
    (ROOT / "E2-face-base-pilot.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "cleanBase": base_meta, "mask": mask_stats(lens), "overlay": overlay_meta,
        "seamRMSE": report["seamRMSE"],
        "protected": {k: {
            "cleanBase_vs_original": v["cleanBase_vs_original"]["maxDiff"],
            "pilotOverlay_vs_original": v["pilotOverlay_vs_original"]["maxDiff"],
            "strokeVariant_vs_original": v["strokeVariant_vs_original"]["maxDiff"],
            "publishedE2Overlay_vs_original": v["publishedE2Overlay_vs_original"]["maxDiff"],
            "pilotMaskNonZeroPixels": v["pilotMaskNonZeroPixels"]}
            for k, v in protected.items()}}, indent=2))


if __name__ == "__main__":
    main()
