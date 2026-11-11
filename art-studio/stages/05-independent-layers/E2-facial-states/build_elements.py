#!/usr/bin/env python3
"""E2 / facial states: turn AI candidate patches into isolated RGBA elements.

Technical step only. No new artistic pixels are created here.

  1. The AI-produced RGB patch is crop-to-filled to the 4:3 context crop and
     downscaled to 80x60 (the exact context crop used as reference).
  2. A registration offset is measured against the ORIGINAL context crop by
     minimising RGB error over the surrounding annulus (hair, brow, skin,
     nose highlight), with the feature itself excluded from the comparison.
  3. The patch is placed on the 848x1264 canvas at the registered origin.
  4. The alpha matte is the SOLID zone ellipse from layer-map.json (rect and
     pivot identical to the slot), NOT the sparse ink-shaped E1 alpha.

The sparse E1 alpha (1224 / 1537 / 1362 opaque px) was tried first and is
wrong here: it follows the shape of the OPEN eye's ink, so the original green
iris showed through the closed-eye state. Kept as a documented dead end.

No writes into references, stage 04, E1 layers or originals.
"""

import sys

sys.dont_write_bytecode = True

import hashlib
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[3]
LAYER_MAP = REPO / "art-studio/stages/05-independent-layers/layer-map.json"
ORIGINAL = REPO / "art-studio/references/originals/IMG_4038_rig-pose.webp"
CANDS = ROOT / "candidates"
ELEMENTS = ROOT / "elements"
PREVIEWS = ROOT / "previews"
REFS = ROOT / "references"
ELEMENTS.mkdir(exist_ok=True)
PREVIEWS.mkdir(exist_ok=True)

FACE_CROP = "200x150+340+105"
# state -> (context crop origin, E1 slot z, original context zoom)
STATES = {
    "eye_l_closed": ((357, 132), 14, REFS / "eye_l_open-zoom.png"),
    "eye_r_closed": ((417, 132), 15, REFS / "eye_r_open-zoom.png"),
    "mouth_closed": ((382, 172), 16, REFS / "mouth_neutral-zoom.png"),
    "mouth_open": ((382, 172), 16, REFS / "mouth_neutral-zoom.png"),
    "mouth_smile": ((382, 172), 16, REFS / "mouth_neutral-zoom.png"),
}

_polys = {}
for _s in json.loads(LAYER_MAP.read_text(encoding="utf-8"))["slots"]:
    _polys[_s["z"]] = _s["zonePolygon"][0]


def run(args):
    proc = subprocess.run(args, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(
            " ".join(str(a) for a in args) + "\n" + proc.stderr.decode("utf-8", "replace")
        )
    return proc.stdout


def im(args):
    return ["convert", "-depth", "8"] + args


def gray_grid(args, w=100, h=75):
    """Small RGB grid for registration / seam metrics."""
    raw = run(args + ["-resize", f"{w}x{h}!", "-depth", "8", "rgb:-"])
    return [tuple(raw[i : i + 3]) for i in range(0, len(raw), 3)], w, h


def orig_grid(path):
    return gray_grid(["convert", str(path)])


def cand_grid(path):
    return gray_grid(
        [
            "convert",
            str(path),
            "-resize",
            "400x300^",
            "-gravity",
            "center",
            "-extent",
            "400x300",
        ]
    )


def register(a, b, w, h, feature_cx, feature_cy):
    """Best integer shift in the 100x75 grid, comparing only surrounding pixels."""
    points = []
    for y in range(h):
        for x in range(w):
            # exclude the feature itself, keep the surrounding context
            if abs(x - feature_cx) < 17 and abs(y - feature_cy) < 13:
                continue
            points.append((x, y))
    best = None
    for dy in range(-9, 10):
        for dx in range(-9, 10):
            total = 0
            n = 0
            for x, y in points:
                sx, sy = x - dx, y - dy
                if not (0 <= sx < w and 0 <= sy < h):
                    continue
                p = a[y * w + x]
                q = b[sy * w + sx]
                total += (
                    (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2
                )
                n += 1
            if n < 500:
                continue
            score = total / n
            if best is None or score < best[0]:
                best = (score, dx, dy)
    # 100x75 grid -> 400x300 (x4) -> 80x60 (x0.2) = x0.8
    return best[0], round(best[1] * 0.8), round(best[2] * 0.8)


def zone_mask(z):
    pts = _polys[z]
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    cx, cy = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2
    rx, ry = (max(xs) - min(xs)) / 2, (max(ys) - min(ys)) / 2
    draw = f"ellipse {cx:.1f},{cy:.1f} {rx:.1f},{ry:.1f} 0,360"
    return draw, (cx, cy, rx, ry)


def make_patch(candidate, tmp):
    run(
        im(
            [
                str(candidate),
                "-resize",
                "400x300^",
                "-gravity",
                "center",
                "-extent",
                "400x300",
                "-resize",
                "80x60!",
                str(tmp),
            ]
        )
    )


def build(state, variant):
    (ox, oy), z, original_zoom = STATES[state]
    cand = CANDS / f"{state}-{variant}.png"
    if not cand.exists():
        return None
    tag = f"{state}-{variant}"
    tmp_patch = ROOT / f".tmp-{tag}-patch.png"
    tmp_canvas = ROOT / f".tmp-{tag}-canvas.png"
    tmp_mask = ROOT / f".tmp-{tag}-mask.png"
    elem = ELEMENTS / f"{tag}.png"

    # registration against the untouched original context crop
    og, w, h = orig_grid(original_zoom)
    cg, _, _ = cand_grid(cand)
    # feature centre in the 100x75 grid: (40,30) of 80x60 -> (50,37.5)
    score, dx, dy = register(og, cg, w, h, 50, 37)
    px, py = ox + dx, oy + dy

    make_patch(cand, tmp_patch)
    run(
        im(
            [
                "-size",
                "848x1264",
                "xc:none",
                str(tmp_patch),
                "-geometry",
                f"+{px}+{py}",
                "-compose",
                "Over",
                "-composite",
                str(tmp_canvas),
            ]
        )
    )
    draw, geom = zone_mask(z)
    run(
        im(
            [
                "-size",
                "848x1264",
                "xc:black",
                "-fill",
                "white",
                "-stroke",
                "none",
                "-draw",
                draw,
                "-blur",
                "0x0.4",
                str(tmp_mask),
            ]
        )
    )
    run(
        im(
            [
                str(tmp_canvas),
                "-alpha",
                "off",
                str(tmp_mask),
                "-compose",
                "CopyOpacity",
                "-composite",
                "-alpha",
                "on",
                "PNG32:" + str(elem),
            ]
        )
    )

    on_face = PREVIEWS / f"{tag}-on-face.png"
    run(
        im(
            [
                str(ORIGINAL),
                str(elem),
                "-compose",
                "Over",
                "-composite",
                "-crop",
                FACE_CROP,
                "+repage",
                "-resize",
                "400%",
                str(on_face),
            ]
        )
    )

    isolated = PREVIEWS / f"{tag}-element.png"
    run(
        im(
            [
                "-size",
                "848x1264",
                "pattern:checkerboard",
                "-crop",
                FACE_CROP,
                "+repage",
                "-resize",
                "400%",
                "(",
                str(elem),
                "-crop",
                FACE_CROP,
                "+repage",
                "-resize",
                "400%",
                ")",
                "-compose",
                "Over",
                "-composite",
                str(isolated),
            ]
        )
    )

    alpha_raw = run(
        ["convert", str(elem), "-alpha", "extract", "-depth", "8", "gray:-"]
    )
    opaque = sum(1 for b in alpha_raw if b >= 128)
    for t in (tmp_patch, tmp_canvas, tmp_mask):
        t.unlink(missing_ok=True)
    return {
        "state": state,
        "variant": variant,
        "candidate": f"candidates/{cand.name}",
        "element": f"elements/{elem.name}",
        "slotZ": z,
        "alphaMethod": "solid zone ellipse from layer-map.json zonePolygon",
        "zoneEllipse": [round(v, 1) for v in geom],
        "contextCropOrigin": [ox, oy],
        "registeredOrigin": [px, py],
        "registrationShiftPx": [dx, dy],
        "registrationAnnulusMSE": round(score, 1),
        "opaquePixels": opaque,
        "alphaSha256": hashlib.sha256(alpha_raw).hexdigest(),
        "onFacePreview": f"previews/{on_face.name}",
        "isolatedPreview": f"previews/{isolated.name}",
    }


def main():
    results = []
    for state in STATES:
        for variant in ("A", "B"):
            r = build(state, variant)
            if r:
                results.append(r)
    (ROOT / "E2-alignment.json").write_text(
        json.dumps(
            {
                "stage": "E2-facial-states / technical matting",
                "status": "candidates only - NOT approved, NOT integrated",
                "method": "AI RGB patch + registered placement + solid zone ellipse alpha",
                "deadEnd": (
                    "Copying the sparse E1 ink-shaped alpha verbatim left the original "
                    "green iris visible through its holes; rejected."
                ),
                "elements": results,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    for r in results:
        print(
            f"{r['state']:14s} {r['variant']}  shift={r['registrationShiftPx']} "
            f"annulusMSE={r['registrationAnnulusMSE']:8.1f} opaque={r['opaquePixels']}"
        )


if __name__ == "__main__":
    main()
