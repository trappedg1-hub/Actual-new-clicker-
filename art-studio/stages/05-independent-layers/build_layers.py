#!/usr/bin/env python3
"""
HEROINE-01 / stage 05 / E1 — contour masks and independent RGBA layers.

Reads ONLY committed repository files:
  art-studio/references/originals/IMG_4038_rig-pose.webp       (RGB source, read-only)
  art-studio/stages/04-slicing-prep/cutouts/work-cutout.png    (alpha silhouette)
  art-studio/stages/04-slicing-prep/build_crops.py             (slot names/z/pivot)

Writes 20 full-canvas (848x1264) RGBA layers with CONTOUR alpha. The contour is
built from an anatomical polygon + colour class + silhouette alpha. NO rectangular
window is used as a clipping boundary: rect values in layer-map.json are
informational bounding boxes only.

NO AI generation. NO repaint / inpainting / new artistic pixels. Every output
RGB value is copied verbatim from the source frame; only the alpha channel is
built. Hidden/occluded zones are deliberately NOT filled (E2, separately gated).

Quality decision (quality over formal slot count):
  A pure RGB classifier cannot separate dark hair shadows from navy fabric, or
  shadowed skin from stockings (measured L1 distance 25-37 vs background on
  stage 04). Therefore we subtract ONLY unambiguously foreign colour classes,
  keep every ambiguous/transition pixel in its anatomical zone, and report the
  residual overlap honestly instead of hiding it. A final coverage pass assigns
  leftover silhouette pixels to the containing zone, so no part of the
  character is accidentally deleted.
"""
from __future__ import annotations

import json
import subprocess
import sys
from collections import deque
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
STAGE = ROOT / "art-studio" / "stages" / "05-independent-layers"
STAGE04 = ROOT / "art-studio" / "stages" / "04-slicing-prep"
SRC = ROOT / "art-studio" / "references" / "originals" / "IMG_4038_rig-pose.webp"
CUTOUT = STAGE04 / "cutouts" / "work-cutout.png"
LAYERS = STAGE / "layers"

W, H = 848, 1264

sys.dont_write_bytecode = True   # never create __pycache__ inside stage 04
sys.path.insert(0, str(STAGE04))
from build_crops import SLOTS  # noqa: E402  (names / z / pivot only)

# ---------------------------------------------------------------------------
# Anatomical zones. Polygon edges follow visible contours where possible
# (jaw line, collar V, skirt trapezoid, fringe shape). They are deliberately
# wider than the detail itself and do NOT clip it: the visible contour comes
# from the colour class + silhouette alpha, not from a straight rectangle.
# ---------------------------------------------------------------------------
ZONES = {
    1:  [[(132,385),(325,405),(312,718),(148,705)],
         [(523,405),(716,385),(700,705),(536,718)]],
    2:  [[(152,285),(320,190),(338,445),(190,470)],
         [(528,190),(696,285),(658,470),(510,445)]],
    3:  [[(272,658),(398,658),(362,985),(308,1188),(182,1262),
          (188,1195),(242,895)]],
    4:  [[(450,658),(576,658),(606,895),(660,1195),(666,1262),
          (540,1188),(486,985)]],
    5:  [[(268,272),(580,272),(592,478),(560,508),(288,508),(256,478)]],
    6:  [[(262,318),(332,352),(262,512),(156,612),(92,652),
          (98,598),(192,428)]],
    7:  [[(586,318),(516,352),(586,512),(692,612),(756,652),
          (750,598),(656,428)]],
    8:  [[(266,272),(582,272),(594,478),(558,504),(290,504),(254,478)]],
    9:  [[(312,232),(536,232),(540,328),(424,402),(308,328)]],
    10: [[(382,308),(466,308),(468,468),(424,484),(380,468)]],
    11: [[(268,466),(580,466),(594,590),(254,590)]],
    12: [[(254,556),(594,556),(582,694),(266,694)]],
    13: [[(318,88),(530,88),(526,238),(472,286),(424,298),
          (376,286),(322,238)]],
    14: [[(427, 162), (426, 169), (421, 176), (415, 181), (406, 185), (397, 186), (388, 185), (379, 181), (373, 176), (368, 169), (367, 162), (368, 155), (373, 148), (379, 143), (388, 139), (397, 138), (406, 139), (415, 143), (421, 148), (426, 155)]],
    15: [[(487, 162), (486, 169), (481, 176), (475, 181), (466, 185), (457, 186), (448, 185), (439, 181), (433, 176), (428, 169), (427, 162), (428, 155), (433, 148), (439, 143), (448, 139), (457, 138), (466, 139), (475, 143), (481, 148), (486, 155)]],
    16: [[(448, 199), (447, 204), (443, 209), (437, 213), (430, 215), (422, 216), (414, 215), (407, 213), (401, 209), (397, 204), (396, 199), (397, 194), (401, 189), (407, 185), (414, 183), (422, 182), (430, 183), (437, 185), (443, 189), (447, 194)]],
    17: [[(310,82),(402,82),(398,300),(348,314),(310,232)]],
    18: [[(446,82),(538,82),(538,232),(500,314),(450,300)]],
    19: [[(328,32),(452,32),(458,172),(400,192),(328,150)]],
    20: [[(394,32),(522,32),(528,202),(456,208),(394,150)]],
}

# ONLY unambiguously foreign classes are subtracted. Ambiguous classes
# (navy / stocking / dark_line / other / skin_hl) are deliberately kept.
EXCLUDE = {
    1:  ("skin", "white", "eye_green"),
    2:  ("skin", "white", "eye_green"),
    3:  ("hair", "white", "eye_green"),
    4:  ("hair", "white", "eye_green"),
    5:  ("hair", "eye_green"),
    6:  ("hair", "white", "eye_green"),
    7:  ("hair", "white", "eye_green"),
    8:  ("hair", "skin", "skin_hl", "eye_green"),
    9:  ("hair", "skin", "eye_green"),
    10: ("hair", "skin", "eye_green"),
    11: ("hair", "skin", "skin_hl", "eye_green"),
    12: ("hair", "skin", "skin_hl", "eye_green"),
    13: ("white", "stocking"),
    14: ("hair", "white", "navy", "stocking"),
    15: ("hair", "white", "navy", "stocking"),
    16: ("hair", "white", "navy", "stocking", "eye_green"),
    17: ("skin", "white", "eye_green"),
    18: ("skin", "white", "eye_green"),
    19: ("skin", "white", "eye_green"),
    20: ("skin", "white", "eye_green"),
}

KNOWN_LIMITS = {
    1: "Back hair is baked together with shoulders/forearms/hands; dark hair "
       "shadows are RGB-indistinguishable from navy fabric. Clean separation "
       "needs E2 occlusion repair.",
    2: "Upper back hair overlaps shoulders and collar; same dark-shadow ambiguity.",
    3: "Thigh/stocking/shoe are one continuous painted mass; no separate foot anchor.",
    4: "Same as leg_l.",
    5: "Torso contains the baked V-neck skin and blouse folds; hidden zones at "
       "top/bottom appear at ±6° breath.",
    6: "Hair strands lie over the forearm/hand; pixels underneath do not exist. "
       "Shoulder 'cap' is not painted.",
    7: "Same as arm_l.",
    8: "Blouse shares navy sleeve stripes with collar and lies under the ribbon; "
       "wide overlap with torso is expected until E2 separates them.",
    9: "Collar is baked onto the V-neck skin and blouse; hidden neck/clavicle "
       "zone appears when head tilts ±12° and collar does NOT follow.",
    10: "Ribbon knot is baked onto the blouse; no underlay.",
    11: "Split between skirt_01 / skirt_02 is a provisional horizontal line, "
       "not an anatomical boundary; phase shift 80–150 ms opens a seam.",
    12: "Hem is baked onto thighs; under-hem content does not exist.",
    13: "HEAD STILL CONTAINS the open eyes and neutral mouth. Blink/expression "
       "switching by visibility cannot work until a clean face base is painted (E2/E3).",
    14: "A front hair strand crosses the left eye in the source frame; eye "
       "cannot be fully isolated without repaint.",
    15: "Right eye crop nearly touches the ear; closed state does not exist.",
    16: "Only neutral mouth exists; open/smile states need a separate art pass.",
    17: "Face lock crosses eyebrow/cheek/eye; underlying face pixels absent.",
    18: "Same as hair_side_l.",
    19: "Fringe is baked onto the forehead/hairline; hairline underneath absent.",
    20: "Overlaps hair_front_01; the split is provisional, not anatomical.",
}

CLASS_NAMES = ["skin_hl", "eye_green", "hair", "skin", "white",
               "navy", "stocking", "dark_line", "other"]
CLASS_ID = {name: i for i, name in enumerate(CLASS_NAMES)}
BG = 255


def colour_class(r: int, g: int, b: int) -> str:
    m = (r + g + b) / 3
    if r > 200 and g > 175 and b > 175 and r - g > 20 and b - g < 20:
        return "skin_hl"        # warm skin highlight AND bright hair sheen
    if g > r + 15 and g > b + 15 and g > 25:
        return "eye_green"
    if r - g > 15 and b - g > 15 and m > 90:
        return "hair"           # lavender: R and B clearly above G
    if r - g > 25 and g - b > 15 and r > 140:
        return "skin"           # tanned: R > G > B, warm
    if min(r, g, b) > 175 and max(r, g, b) - min(r, g, b) < 45:
        return "white"
    if b > r + 8 and b > g + 8 and r < 120:
        return "navy"           # navy fabric AND dark hair shadows (ambiguous)
    if r > g > b and r - b > 15 and m < 150:
        return "stocking"       # stockings AND shadowed skin (ambiguous)
    if m < 70:
        return "dark_line"
    return "other"              # transitions; always kept in its zone


def in_poly(x: float, y: float, poly) -> bool:
    inside = False
    j = len(poly) - 1
    for i in range(len(poly)):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def zone_contains(z: int, x: int, y: int) -> bool:
    return any(in_poly(x + 0.5, y + 0.5, p) for p in ZONES[z])


def read_rgba(path: Path) -> bytes:
    return subprocess.check_output(["convert", str(path), "-depth", "8", "rgba:-"])


def feather(alpha: bytearray, pts: list[int], cut: bytes) -> bytearray:
    """1 px 3x3 box blur on the OUTER contour only.

    Internal seams between adjacent layers stay fully opaque: blurring those
    would create semi-transparent double-drawn seams and visible over-bright
    artefacts when two layers overlap the same source pixels.
    """
    out = bytearray(alpha)
    for i in pts:
        y, x = divmod(i, W)
        outer = False
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                yy, xx = y + dy, x + dx
                if 0 <= yy < H and 0 <= xx < W and cut[(yy*W+xx)*4+3] < 128:
                    outer = True; break
            if outer:
                break
        if not outer:
            out[i] = 255
            continue
        s = n = 0
        for dy in (-1, 0, 1):
            yy = y + dy
            if 0 <= yy < H:
                for dx in (-1, 0, 1):
                    xx = x + dx
                    if 0 <= xx < W:
                        s += alpha[yy * W + xx]; n += 1
        out[i] = int(s / n)
    return out


def internal_holes(mask: bytearray, zone_pts: list[int]) -> int:
    """Transparent components fully enclosed by opaque pixels (real defects)."""
    zone = set(zone_pts)
    holes = 0
    seen = set()
    for start in zone_pts:
        if start in seen or mask[start] > 127:
            continue
        q = deque([start]); seen.add(start); comp = 0; border = False
        while q:
            k = q.popleft(); cy, cx = divmod(k, W); comp += 1
            if cx in (0, W-1) or cy in (0, H-1):
                border = True
            for nb in (k-1 if cx > 0 else -1, k+1 if cx < W-1 else -1,
                       k-W if cy > 0 else -1, k+W if cy < H-1 else -1):
                if nb >= 0 and nb in zone and nb not in seen and mask[nb] <= 127:
                    seen.add(nb); q.append(nb)
        if not border and comp > 4:
            holes += 1
    return holes


def main() -> None:
    LAYERS.mkdir(parents=True, exist_ok=True)
    src = read_rgba(SRC)
    cut = read_rgba(CUTOUT)
    assert len(src) == len(cut) == W * H * 4

    classes = bytearray(W * H)
    counts: dict[str, int] = {}
    sil_pts: list[int] = []
    for y in range(H):
        for x in range(W):
            i = y * W + x
            if cut[i*4+3] < 128:
                classes[i] = BG
                continue
            sil_pts.append(i)
            j = i * 4
            c = colour_class(src[j], src[j+1], src[j+2])
            classes[i] = CLASS_ID[c]
            counts[c] = counts.get(c, 0) + 1

    # Build zone pixel lists once.
    zone_pts: dict[int, list[int]] = {}
    for z in ZONES:
        xs = [p[0] for poly in ZONES[z] for p in poly]
        ys = [p[1] for poly in ZONES[z] for p in poly]
        x0, x1 = max(0, min(xs)-2), min(W, max(xs)+3)
        y0, y1 = max(0, min(ys)-2), min(H, max(ys)+3)
        zone_pts[z] = [y*W+x for y in range(y0, y1) for x in range(x0, x1)
                       if zone_contains(z, x, y)]

    # ---- Winner-takes-all ownership by z-order -------------------------
    # Each silhouette pixel belongs to EXACTLY ONE layer: the highest-z slot
    # whose anatomical zone contains it and whose colour class is not foreign.
    # This is the drawOrder of ANIMATION-SPEC.md §3. No overlapping copies means
    # the composite of all 20 layers equals the source frame exactly, with no
    # over-bright double-drawn seams.
    zbbox = {}
    for z in ZONES:
        xs = [p[0] for poly in ZONES[z] for p in poly]
        ys = [p[1] for poly in ZONES[z] for p in poly]
        zbbox[z] = (min(xs), min(ys), max(xs), max(ys))
    by_z_desc = sorted(SLOTS, key=lambda s: -s[0])
    owner: dict[int, int] = {}
    fallback = 0
    unresolvable = 0
    for i in sil_pts:
        y, x = divmod(i, W)
        c = classes[i]
        chosen = None
        for z, *_rest in by_z_desc:
            if c in {CLASS_ID[n] for n in EXCLUDE[z]}:
                continue
            if zone_contains(z, x, y):
                chosen = z
                break
        if chosen is None:
            # pixel outside every polygon (fingertips, fine strands, shoe edges)
            best = None
            for z, *_rest in by_z_desc:
                if c in {CLASS_ID[n] for n in EXCLUDE[z]}:
                    continue
                bx0, by0, bx1, by1 = zbbox[z]
                d = max(bx0-x, 0, x-bx1)**2 + max(by0-y, 0, y-by1)**2
                if best is None or d < best[0]:
                    best = (d, z)
            if best:
                chosen = best[1]
                fallback += 1
            else:
                unresolvable += 1
                continue
        owner[i] = chosen

    masks = {z: bytearray(W * H) for z in ZONES}
    for i, z in owner.items():
        masks[z][i] = 255
    coverage = bytearray(W * H)
    for i in owner:
        coverage[i] = 1
    reassigned = fallback
    still_unassigned = unresolvable

    entries = []
    for z, slot, group, _rect, _polys, pivot, states, _present in SLOTS:
        binary = masks[z]
        # Iterate the WHOLE canvas, not just zone_pts: nearest-zone fallback
        # pixels (fingertips, fine strands, shoe edges) lie outside every
        # polygon and must still be written to the layer file.
        pts = [i for i in range(W * H) if binary[i]]
        alpha = feather(binary, pts, cut)

        buf = bytearray(W * H * 4)
        for i in pts:
            a = alpha[i]
            if a == 0:
                continue
            j = i * 4
            buf[j:j+4] = bytes((src[j], src[j+1], src[j+2], a))
        out = LAYERS / f"{z:02d}_{slot}.png"
        subprocess.run(
            ["convert", "-size", f"{W}x{H}", "-depth", "8", "rgba:-", str(out)],
            input=bytes(buf), check=True,
        )

        coords = [divmod(i, W) for i in pts]
        ys = [c[0] for c in coords]; xs = [c[1] for c in coords]
        tight = (min(xs), min(ys), max(xs)+1, max(ys)+1) if pts else (0, 0, W, H)

        holes = internal_holes(alpha, zone_pts[z])  # info only: underlay, not a defect
        # Longest straight horizontal run of opaque pixels at a contour edge:
        # a direct indicator of a rectangular cut. Natural waist/hem lines are
        # reported as information, not auto-rejected.
        longest = 0
        for y in range(tight[1], tight[3]):
            run = 0
            for x in range(tight[0], tight[2]):
                if alpha[y*W+x] > 127:
                    run += 1; longest = max(longest, run)
                else:
                    run = 0

        entries.append({
            "z": z, "slot": slot, "group": group,
            "file": f"layers/{z:02d}_{slot}.png",
            "canvas": [W, H],
            "tightRect": {"x": tight[0], "y": tight[1],
                          "w": tight[2]-tight[0], "h": tight[3]-tight[1]},
            "pivotAbsolute": {"x": pivot[0], "y": pivot[1]},
            "pivotLocal": {"x": pivot[0]-tight[0], "y": pivot[1]-tight[1]},
            "zonePolygon": ZONES[z],
            "excludedClasses": list(EXCLUDE[z]),
            "opaquePixels": len(pts),
            "internalTransparentRegions": holes,
            "longestOpaqueRunPx": longest,
            "states": states,
            "knownLimit": KNOWN_LIMITS[z],
            "independent": False,
            "independentNote": "contour RGBA of visible fragments only; hidden "
                               "zones require E2 (separate permission)",
        })
        print(f"z{z:02d} {slot:18s} opaque={len(pts):7d} holes={holes:3d} "
              f"longestRun={longest:4d} tight={tight}")

    silhouette = len(sil_pts)
    covered = sum(1 for i in sil_pts if coverage[i] > 0)
    overlap = sum(1 for i in sil_pts if coverage[i] > 1)

    layer_map = {
        "stage": "05 / E1 - contour masks and independent RGBA layers",
        "sourceFrame": "art-studio/references/originals/IMG_4038_rig-pose.webp",
        "alphaSource": "art-studio/stages/04-slicing-prep/cutouts/work-cutout.png",
        "geometrySource": "art-studio/stages/04-slicing-prep/build_crops.py (names/z/pivot only)",
        "canvas": [W, H],
        "method": "anatomical polygon ∩ colour class ∩ silhouette alpha; "
                  "winner-takes-all ownership by z-order (no duplicate pixels); "
                  "1px alpha feather on the OUTER contour only; RGB copied verbatim",
        "rectangularClipping": False,
        "generation": False,
        "repaint": False,
        "hiddenZonesFilled": False,
        "graphicSlots": len(entries),
        "visualStatesTotal": 24,
        "visualStatesPresent": 20,
        "visualStatesMissing": ["eye_l_closed", "eye_r_closed", "mouth_open", "mouth_smile"],
        "coverage": {
            "silhouettePixels": silhouette,
            "coveredByAtLeastOneLayer": covered,
            "coverageRatio": round(covered / silhouette, 6),
            "unassignedPixels": silhouette - covered,
            "assignedByNearestZoneFallback": fallback,
            "unresolvablePixels": still_unassigned,
            "overlapPixels": overlap,
            "overlapMeaning": "0 by construction: each pixel belongs to exactly one layer. "
                              "Hidden zones still need E2 — moving a layer exposes "
                              "transparent gaps underneath.",
        },
        "classCounts": counts,
        "gates": {
            "originalsModified": False,
            "controlVersion": "f13ed9e7fae4961cdb010e7cde58f5e13ac2e1bd",
            "e2Started": False,
            "atlas": False,
            "code": False,
            "deployment": False,
        },
        "slots": entries,
    }
    (STAGE / "layer-map.json").write_text(
        json.dumps(layer_map, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print()
    print(f"coverage {covered}/{silhouette} = {covered/silhouette:.6f} | "
          f"unassigned {silhouette-covered} | reassigned {reassigned} | overlap {overlap}")


if __name__ == "__main__":
    main()
