#!/usr/bin/env python3
"""Build the visual-check sheets for the eye_l_closed-B face-base pilot.

Only ImageMagick is used (no numpy/PIL in this environment). Font is
DejaVu-Sans because helvetica is not installed. All labels are ASCII.
"""

import sys

sys.dont_write_bytecode = True

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "comparison"
OUT.mkdir(exist_ok=True)
FONT = "DejaVu-Sans"
BG = "#f2f2f2"
INK = "#1b1b1b"

FACE_CROP = "200x150+340+105"
ZOOM_CROP = "80x70+355+125"
FACE_SCALE = "400%"
ZOOM_SCALE = "800%"

PROTECTED = {
    "brow": (392, 136, 416, 149),
    "hair_fringe": (352, 130, 376, 200),
    "hair_tip": (374, 143, 385, 157),
    "hair_strand": (412, 130, 417, 172),
    "cheek_skin": (382, 182, 432, 210),
    "nose_line": (412, 178, 418, 200),
    "nose_highlight": (419, 178, 426, 192),
}
LENS_POLY = [
    (378, 168), (382, 161), (388, 155), (394, 151), (400, 150),
    (405, 152), (409, 157), (410, 164), (408, 170), (403, 175),
    (396, 177), (388, 176), (381, 173),
]


def run(args):
    p = subprocess.run(args, capture_output=True)
    if p.returncode != 0:
        raise RuntimeError(" ".join(map(str, args)) + "\n" + p.stderr.decode("utf-8", "replace"))
    return p.stdout


def panel(src, crop, scale, label, tmp, w, h):
    """Crop + nearest-neighbour upscale + label bar on top."""
    bar = 34
    run(["convert", str(src), "-alpha", "off", "-crop", crop, "+repage",
         "-filter", "Point", "-resize", scale, "-depth", "8",
         str(tmp)])
    run(["convert", str(tmp), "-gravity", "north", "-background", "#ffffff",
         "-splice", f"0x{bar}", "-fill", INK, "-font", FONT, "-pointsize", "19",
         "-gravity", "northwest", "-annotate", "+10+6", label,
         "-bordercolor", "#bdbdbd", "-border", "1",
         "-depth", "8", str(tmp)])
    return w + 2, h + bar + 2


def sheet(name, panels, crop, scale, cols=2, pw=800, ph=600):
    bar = 36
    tmp = ROOT / ".tmp-panel.png"
    made = []
    for src, label in panels:
        w, h = panel(src, crop, scale, label, tmp, pw, ph)
        made.append((ROOT / f".tmp-{len(made)}.png", w, h))
        run(["convert", str(tmp), str(made[-1][0])])
    w = max(m[1] for m in made)
    h = max(m[2] for m in made)
    rows = (len(made) + cols - 1) // cols
    gap = 14
    W = cols * w + (cols + 1) * gap
    H = rows * h + (rows + 1) * gap
    args = ["convert", "-size", f"{W}x{H}", f"xc:{BG}", "-depth", "8"]
    for i, (path, _, _) in enumerate(made):
        x = gap + (i % cols) * (w + gap)
        y = gap + (i // cols) * (h + gap)
        args += [str(path), "-geometry", f"+{x}+{y}", "-compose", "Over", "-composite"]
    args += ["PNG32:" + str(OUT / name)]
    run(args)
    for path, _, _ in made:
        path.unlink()
    tmp.unlink(missing_ok=True)
    print(name, f"{W}x{H}")


def protection_map():
    """Pilot overlay at 8x with protected rectangles and the lens outline."""
    tmp = ROOT / ".tmp-prot.png"
    run(["convert", str(ROOT / "03-overlay-full.png"), "-alpha", "off",
         "-crop", ZOOM_CROP, "+repage", "-filter", "Point", "-resize", ZOOM_SCALE,
         "-depth", "8", str(tmp)])
    args = ["convert", str(tmp), "-strokewidth", "2"]
    for rect in PROTECTED.values():
        x0, y0, x1, y1 = rect
        sx0, sy0 = (x0 - 355) * 8, (y0 - 125) * 8
        sx1, sy1 = (x1 - 355) * 8, (y1 - 125) * 8
        args += ["-stroke", "rgba(0,235,120,0.95)", "-fill", "none",
                 "-draw", f"rectangle {sx0},{sy0} {sx1},{sy1}"]
    pts = " ".join(f"{(x - 355) * 8},{(y - 125) * 8}" for x, y in LENS_POLY)
    args += ["-stroke", "rgba(255,30,30,0.95)", "-fill", "none",
             "-draw", f"polygon {pts}",
             "-stroke", "none", "-fill", INK, "-font", FONT, "-pointsize", "17",
             "-annotate", "+8+18", "GREEN = protected (pixel-identical)   RED = lid-lens mask",
             "PNG32:" + str(OUT / "05-protection-map.png")]
    run(args)
    tmp.unlink(missing_ok=True)
    print("05-protection-map.png 640x560")


def mask_sheet():
    """Mask and protection map side by side."""
    a = ROOT / ".tmp-mask-a.png"
    b = ROOT / ".tmp-mask-b.png"
    run(["convert", str(ROOT / "02-mask-eye_l_closed-B.png"), "-crop", ZOOM_CROP,
         "+repage", "-filter", "Point", "-resize", ZOOM_SCALE, "-colorspace", "sRGB",
         "-type", "TrueColor", "-gravity", "north", "-background", "white",
         "-splice", "0x36", "-fill", INK, "-font", FONT, "-pointsize", "19",
         "-gravity", "northwest", "-annotate", "+10+6",
         "PILOT MASK (hybrid lid lens)", "-bordercolor", "#bdbdbd", "-border", "1",
         "PNG32:" + str(a)])
    run(["convert", str(OUT / "05-protection-map.png"), "-bordercolor", "#bdbdbd",
         "-border", "1", "PNG32:" + str(b)])
    run(["convert", "-size", "1318x610", f"xc:{BG}",
         str(a), "-geometry", "+14+14", "-compose", "Over", "-composite",
         str(b), "-geometry", "+664+14", "-compose", "Over", "-composite",
         "PNG32:" + str(OUT / "05-mask-and-protection.png")])
    a.unlink()
    b.unlink()
    print("05-mask-and-protection.png 1318x610")


def full_size_pair():
    """Native 848x1264 original vs pilot overlay, no upscaling."""
    a = ROOT / ".tmp-full-a.png"
    b = ROOT / ".tmp-full-b.png"
    for src, label, dst in ((ROOT / "source-frame.webp", "ORIGINAL 848x1264", a),
                            (ROOT / "03-overlay-full.png", "PILOT OVERLAY 848x1264", b)):
        run(["convert", str(src), "-alpha", "off", "-gravity", "north",
             "-background", "white", "-splice", "0x36", "-fill", INK,
             "-font", FONT, "-pointsize", "19", "-gravity", "northwest",
             "-annotate", "+10+6", label, "-bordercolor", "#bdbdbd", "-border", "1",
             "PNG32:" + str(dst)])
    run(["convert", "-size", "1726x1318", f"xc:{BG}",
         str(a), "-geometry", "+14+14", "-compose", "Over", "-composite",
         str(b), "-geometry", "+864+14", "-compose", "Over", "-composite",
         "PNG32:" + str(OUT / "04-comparison-full-size.png")])
    a.unlink()
    b.unlink()
    print("04-comparison-full-size.png 1726x1318")


def main():
    # intermediate comparison inputs kept in comparison/ for reproducibility
    inputs = {
        "original-face-4x.png": (ROOT / "source-frame.webp", FACE_CROP, FACE_SCALE),
        "clean-base-face-4x.png": (ROOT / "01-clean-base.png", FACE_CROP, FACE_SCALE),
        "published-E2-face-4x.png": (ROOT / "00-e2-overlay-full.png", FACE_CROP, FACE_SCALE),
        "pilot-face-4x.png": (ROOT / "03-overlay-full.png", FACE_CROP, FACE_SCALE),
        "original-zoom-8x.png": (ROOT / "source-frame.webp", ZOOM_CROP, ZOOM_SCALE),
        "clean-base-zoom-8x.png": (ROOT / "01-clean-base.png", ZOOM_CROP, ZOOM_SCALE),
        "published-E2-zoom-8x.png": (ROOT / "00-e2-overlay-full.png", ZOOM_CROP, ZOOM_SCALE),
        "pilot-zoom-8x.png": (ROOT / "03-overlay-full.png", ZOOM_CROP, ZOOM_SCALE),
    }
    for name, (src, crop, scale) in inputs.items():
        run(["convert", str(src), "-alpha", "off", "-crop", crop, "+repage",
             "-filter", "Point", "-resize", scale, "-depth", "8",
             "PNG32:" + str(OUT / name)])

    sheet("04-comparison-face.png", [
        (ROOT / "source-frame.webp", "A  ORIGINAL (open eye)"),
        (ROOT / "01-clean-base.png", "B  CLEAN BASE (manual skin)"),
        (ROOT / "00-e2-overlay-full.png", "C  PUBLISHED E2 (solid ellipse)"),
        (ROOT / "03-overlay-full.png", "D  PILOT (soft lid lens)"),
    ], FACE_CROP, FACE_SCALE, pw=800, ph=600)

    sheet("04-comparison-zoom.png", [
        (ROOT / "source-frame.webp", "A  ORIGINAL  x8"),
        (ROOT / "01-clean-base.png", "B  CLEAN BASE  x8"),
        (ROOT / "00-e2-overlay-full.png", "C  PUBLISHED E2  x8"),
        (ROOT / "03-overlay-full.png", "D  PILOT  x8"),
    ], ZOOM_CROP, ZOOM_SCALE, pw=640, ph=560)

    protection_map()
    mask_sheet()
    full_size_pair()


if __name__ == "__main__":
    main()
