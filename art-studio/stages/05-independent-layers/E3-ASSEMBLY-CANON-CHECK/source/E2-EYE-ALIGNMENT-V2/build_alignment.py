#!/usr/bin/env python3
"""E2 / EYE ALIGNMENT V2 - targeted vertical correction of the RIGHT eye.

Findings (measured on the untouched HEROINE-01 source and the approved
elements, see 00-measurements.json):

  original green-iris centroid   LEFT y=163.01   RIGHT y=163.11  -> level
  approved closed-lid centroid    LEFT y=168.24   RIGHT y=159.03
  offset from own iris            LEFT +5.23      RIGHT -4.08

A closed lid must sit slightly BELOW the iris centre, as it does on the
left. The right eye is therefore the displaced one: its approved element
is registered ~9 px too high. The left eye and everything else stay
byte-identical to v1 (569f984).

Correction: a PURE INTEGER VERTICAL TRANSLATION of +9 px applied ONLY to
the right-eye expression ink, with no resampling, no scaling, no rotation,
no change of colour, line thickness, shape or tilt. The AI brow/context
above the lid is deliberately NOT translated (that would create a second
brow). The support is clipped to the already-cleaned right-eye zone, so
no skin outside that zone is touched.

This is a separate version: nothing in E2-FACE-BASE-FULL/ is overwritten.
No generative AI / inpainting / generative fill. No rig integration.
"""

import sys
sys.dont_write_bytecode = True

import json
import shutil
from pathlib import Path

V1 = Path(__file__).resolve().parent.parent / "E2-FACE-BASE-FULL"
sys.path.insert(0, str(V1))
import face_base_toolkit as T          # noqa: E402  (reused v1 toolkit)
import build_full as B                 # noqa: E402  (reused v1 geometry)

ROOT = Path(__file__).resolve().parent
SRC_DIR = ROOT / "source"
BASE = ROOT / "base"
MASKS = ROOT / "masks"
LAYERS = ROOT / "layers"
STATES = ROOT / "states"
CMP = ROOT / "comparison"
PANELS = CMP / "panels"
MOBILE = CMP / "mobile"
for d in (BASE, MASKS, LAYERS, STATES, CMP, PANELS, MOBILE):
    d.mkdir(parents=True, exist_ok=True)

# Names of the v1 assets that must be carried into v2 byte-for-byte.
CARRIED_BASE = ["00-clean-face-base-full.png", "00-neutral-original.png",
                "01-clean-base-eye_l.png", "02-clean-base-eye_r.png",
                "03-clean-base-mouth.png", "visual-reference-mouth_closed-A.png"]
CARRIED_MASKS = ["mask-eye_l_closed-B.png", "mask-mouth_open-A.png",
                 "mask-mouth_smile-A.png"]
CARRIED_LAYERS = ["layer-eye_l_closed-B.png", "layer-mouth_open-A.png",
                  "layer-mouth_smile-A.png"]


def prepare_version():
    """Copy every unchanged v1 asset into the new version (never edit v1)."""
    for n in CARRIED_BASE:
        shutil.copy2(V1 / "base" / n, BASE / n)
    for n in CARRIED_MASKS:
        shutil.copy2(V1 / "masks" / n, MASKS / n)
    for n in CARRIED_LAYERS:
        shutil.copy2(V1 / "layers" / n, LAYERS / n)
    for name in B.STATES:
        shutil.copy2(V1 / "states" / f"{name}-state-base.png",
                     STATES / f"{name}-state-base.png")

DELTA = 9                 # px DOWN, integer only (no resampling)
SRC_ROW_MIN = 153         # first source row of the closed-eye drawing
SRC_ROW_MAX = 175         # last  source row of the closed-eye drawing
SKIN_MIX = 0.40           # identical to v1 right-eye hybrid matte
INK_LOW, INK_SPAN = 12.0, 44.0
FEATHER = 3.2
TAPER_FROM, TAPER_TO = 174, 180   # soft bottom fade (clean base ends y=179)

FACE_CROP = "200x150+340+105"     # 1:1 face
BOTH_CROP = "130x50+355+140"      # both eyes, close-up
RIGHT_CROP = "80x70+420+130"      # right eye, close-up

LENS_V2 = [(x, y + DELTA) for x, y in B.EYE_R_LENS]
PROTECTED_LIST = list(B.PROTECTED.values())


# --------------------------------------------------------------- measurements
def green(v):
    return v[1] > v[0] * 1.15 and v[1] > v[2] * 1.05 and v[1] > 65


def iris_centroid(src, x0, x1):
    pts = [(x, y) for y in range(150, 178) for x in range(x0, x1)
           if green(src[(y * T.W + x) * 3:(y * T.W + x) * 3 + 3])]
    return round(sum(y for x, y in pts) / len(pts), 3), len(pts)


def lid_centroid_element(rgba, x0, x1, y0, y1):
    rows = {}
    for y in range(y0, y1):
        n = 0
        for x in range(x0, x1):
            i = (y * T.W + x) * 4
            if rgba[i + 3] > 128 and T.lum(*tuple(rgba[i:i + 3])) < 112:
                n += 1
        rows[y] = n
    peak = max(rows, key=lambda y: rows[y])
    pts = [(x, y) for y in range(peak - 3, peak + 4) for x in range(x0, x1)
           if y in rows and 0 <= y and
           rgba[(y * T.W + x) * 4 + 3] > 128 and
           T.lum(*tuple(rgba[(y * T.W + x) * 4:(y * T.W + x) * 4 + 3])) < 112]
    return {"peakRow": peak, "peakDarkPixels": rows[peak],
            "centroidY": round(sum(y for x, y in pts) / len(pts), 3),
            "darkPixelsInBand": len(pts)}


def lid_centroid_state(rgb, x0, x1, y0, y1):
    rows = {y: sum(1 for x in range(x0, x1)
                   if T.lum(*tuple(rgb[(y * T.W + x) * 3:(y * T.W + x) * 3 + 3])) < 112)
            for y in range(y0, y1)}
    peak = max(rows, key=lambda y: rows[y])
    pts = [(x, y) for y in range(peak - 3, peak + 4) for x in range(x0, x1)
           if y0 <= y < y1 and
           T.lum(*tuple(rgb[(y * T.W + x) * 3:(y * T.W + x) * 3 + 3])) < 112]
    return {"peakRow": peak, "peakDarkPixels": rows[peak],
            "centroidY": round(sum(y for x, y in pts) / len(pts), 3),
            "darkPixelsInBand": len(pts)}


def measurements():
    src = T.read_rgb(SRC_DIR / "source-frame.webp")
    el_l = T.read_rgba(SRC_DIR / "element-eye_l_closed-B.png")
    el_r = T.read_rgba(SRC_DIR / "element-eye_r_closed-B.png")
    ly, ln = iris_centroid(src, 380, 412)
    ry, rn = iris_centroid(src, 435, 470)
    l_lid = lid_centroid_element(el_l, 373, 410, 150, 178)
    r_lid = lid_centroid_element(el_r, 433, 470, 148, 175)
    v1_both = T.read_rgb(SRC_DIR / "state-05-both-eyes-closed-v1.png")
    v1_l = lid_centroid_state(v1_both, 373, 410, 150, 178)
    v1_r = lid_centroid_state(v1_both, 433, 470, 148, 178)
    return {
        "reference": "HEROINE-01 untouched source frame IMG_4038_rig-pose.webp",
        "method": "green-iris centroid for anatomy; dark closed-lid ink centroid in a +-3 px band around the peak row",
        "originalIris": {
            "left": {"centroidY": ly, "greenPixels": ln, "xRange": [380, 412]},
            "right": {"centroidY": ry, "greenPixels": rn, "xRange": [435, 470]},
            "verticalDifferencePx": round(abs(ly - ry), 3),
            "conclusion": "both eyes are level in the original anatomy",
        },
        "approvedElements": {
            "eye_l_closed-B": {**l_lid, "offsetFromOwnIris": round(l_lid["centroidY"] - ly, 3)},
            "eye_r_closed-B": {**r_lid, "offsetFromOwnIris": round(r_lid["centroidY"] - ry, 3)},
        },
        "displacedEye": "eye_r_closed-B (right eye)",
        "diagnosis": ("left lid sits +5.23 px below its iris (natural); "
                      "right lid sits -4.08 px ABOVE its iris, i.e. in the upper-lash/crease zone. "
                      "The right element is registered too high; the left element is correctly registered."),
        "v1BothClosedState": {"left": v1_l, "right": v1_r,
                              "asymmetryPx": round(v1_l["centroidY"] - v1_r["centroidY"], 3)},
        "correction": {
            "deltaPxDown": DELTA,
            "type": "pure integer vertical translation, no resampling",
            "appliedTo": "only eye_r_closed-B expression ink + its fitted lens",
            "notAppliedTo": ["eye_l_closed-B", "mouth_open-A", "mouth_smile-A",
                             "neutral", "clean bases", "skin", "hair", "protected zones",
                             "AI brow/context above the lid"],
            "expectedRightLidCentroidY": round(r_lid["centroidY"] + DELTA, 3),
            "expectedResidualAsymmetryPx": round(l_lid["centroidY"] - r_lid["centroidY"] - DELTA, 3),
        },
        "publishedE2AndV1Agree": True,
        "note": "v1 (569f984) faithfully reproduced the approved element; the shift is inherent to the element registration, not introduced by the v1 pipeline.",
    }


# --------------------------------------------------------------- correction
def build_corrected_layer(src, base_r, elem_r, v1_mask):
    """Translate the closed-eye drawing down; keep all other pixels neutral."""
    # allowed = pixels already owned by the right-eye clean base / v1 matte
    clean_changed = {p for p in range(T.W * T.H)
                     if any(base_r[p * 3 + k] != src[p * 3 + k] for k in range(3))}
    allowed = set(clean_changed)
    allowed.update(p for p in range(T.W * T.H) if v1_mask[p] > 0)

    reg = bytearray(T.W * T.H * 3)
    for y in range(T.H):
        sy = y - DELTA
        take = SRC_ROW_MIN <= sy <= SRC_ROW_MAX
        for x in range(T.W):
            i = (y * T.W + x) * 3
            if take:
                reg[i:i + 3] = elem_r[sy * T.W * 3 + x * 3:sy * T.W * 3 + x * 3 + 3]
            else:
                reg[i:i + 3] = base_r[i:i + 3]
    reg = bytes(reg)

    alpha = bytearray(T.W * T.H)
    x0, y0, x1, y1 = T.poly_bbox(LENS_V2)
    for y in range(y0 - 6, y1 + 7):
        for x in range(x0 - 6, x1 + 7):
            p = y * T.W + x
            if p not in allowed or T.in_rects(PROTECTED_LIST, x, y):
                continue
            band = T.band_alpha(LENS_V2, x, y, FEATHER)
            if band <= 0.0:
                continue
            i = p * 3
            d = max(abs(reg[i + k] - base_r[i + k]) for k in range(3))
            el = T.lum(reg[i], reg[i + 1], reg[i + 2])
            bl = T.lum(base_r[i], base_r[i + 1], base_r[i + 2])
            ink = max(0.0, min(1.0, (d - INK_LOW) / INK_SPAN))
            ink = max(ink, max(0.0, min(1.0, (bl - el - 12.0) / 52.0)))
            strength = SKIN_MIX + (1.0 - SKIN_MIX) * ink
            a = band * strength * 255
            if y >= TAPER_FROM:
                a *= max(0.0, min(1.0, (TAPER_TO - y) / (TAPER_TO - TAPER_FROM)))
            alpha[p] = T.clamp255(a)
    return reg, bytes(alpha), allowed


def main():
    prepare_version()
    src = T.read_rgb(SRC_DIR / "source-frame.webp")
    base_r = T.read_rgb(SRC_DIR / "clean-base-eye_r-v1.png")
    elem_r = T.read_rgb(SRC_DIR / "element-eye_r_closed-B.png")
    v1_mask = T.read_gray(SRC_DIR / "mask-eye_r_closed-B-v1.png")

    m = measurements()
    T.write_json(ROOT / "00-measurements.json", m)

    reg, alpha, allowed = build_corrected_layer(src, base_r, elem_r, v1_mask)
    T.write_rgb(ROOT / "01-re-registered-element-eye_r_closed-B.png", reg)
    T.write_gray(MASKS / "mask-eye_r_closed-B-v2.png", alpha)
    rgba = bytearray(T.W * T.H * 4)
    for p in range(T.W * T.H):
        rgba[p * 4:p * 4 + 3] = reg[p * 3:p * 3 + 3]
        rgba[p * 4 + 3] = alpha[p]
    T.write_rgba(LAYERS / "layer-eye_r_closed-B-v2.png", bytes(rgba))

    # all 10 states; only those containing the right eye are recomposed
    layers = {e: T.read_rgba(SRC_DIR / f"layer-{e}-v1.png")
              for e in ("eye_l_closed-B", "mouth_open-A", "mouth_smile-A")}
    layers["eye_r_closed-B"] = bytes(rgba)
    # RGB for compositing is taken from each layer's own RGB channels
    state_info = {}
    for name, exprs in B.STATES.items():
        sb = T.read_rgb(SRC_DIR / f"statebase-{name}-v1.png")
        buf = sb
        if "eye_r_closed-B" not in exprs:
            out = bytes(T.read_rgb(SRC_DIR / f"state-{name}-v1.png"))
            status = "byte-identical to v1"
        else:
            for e in exprs:
                lay = layers[e]
                lay_rgb = bytes(v for p in range(T.W * T.H)
                                for v in lay[p * 4:p * 4 + 3])
                lay_a = bytes(lay[p * 4 + 3] for p in range(T.W * T.H))
                buf, _ = T.composite(buf, lay_rgb, lay_a)
            out = buf
            status = "recomposed with corrected right-eye layer"
        T.write_rgb(STATES / f"{name}.png", out)
        state_info[name] = {"expressions": exprs, "status": status,
                            "diffFromV1": T.diff_bbox(
                                out, T.read_rgb(SRC_DIR / f"state-{name}-v1.png"))}

    # ---------------------------------------------------------- comparisons
    def panel(path, buf, crop, scale, label=None):
        tmp = ROOT / f".p-{path.stem}.png"
        T.write_rgb(tmp, buf)
        T.crop_zoom(path, tmp, crop, scale)   # caption is added by sheet()
        tmp.unlink(missing_ok=True)
        return path

    v1_both = T.read_rgb(SRC_DIR / "state-05-both-eyes-closed-v1.png")
    v2_both = T.read_rgb(STATES / "05-both-eyes-closed.png")
    v1_r = T.read_rgb(SRC_DIR / "state-02-eye_r_closed-B-v1.png")
    v2_r = T.read_rgb(STATES / "02-eye_r_closed-B.png")
    neutral = T.read_rgb(STATES / "00-neutral.png")

    def sheet(name, items, cols=2):
        return T.sheet(CMP / name, items, cols=cols)

    # 1:1 (no scaling) BEFORE / AFTER, both eyes closed
    a = panel(PANELS / "v1-both-1x.png", v1_both, FACE_CROP, "100%", "BEFORE v1")
    b = panel(PANELS / "v2-both-1x.png", v2_both, FACE_CROP, "100%", "AFTER v2")
    sheet("01-before-after-1x.png", [(a, "A  BEFORE 569f984 (1:1)"),
                                     (b, "B  AFTER v2 (1:1)")])
    # 4x face
    a = panel(PANELS / "v1-both-4x.png", v1_both, FACE_CROP, "400%", "BEFORE v1 x4")
    b = panel(PANELS / "v2-both-4x.png", v2_both, FACE_CROP, "400%", "AFTER v2 x4")
    sheet("02-before-after-4x.png", [(a, "A  BEFORE (face x4)"),
                                     (b, "B  AFTER (face x4)")])
    # 8x both eyes close-up
    a = panel(PANELS / "v1-both-8x.png", v1_both, BOTH_CROP, "800%", "BEFORE both eyes x8")
    b = panel(PANELS / "v2-both-8x.png", v2_both, BOTH_CROP, "800%", "AFTER both eyes x8")
    sheet("03-both-eyes-closeup-8x.png", [(a, "A  BEFORE both eyes x8"),
                                          (b, "B  AFTER both eyes x8")])
    # 8x right eye close-up
    a = panel(PANELS / "v1-right-8x.png", v1_r, RIGHT_CROP, "800%", "BEFORE right eye x8")
    b = panel(PANELS / "v2-right-8x.png", v2_r, RIGHT_CROP, "800%", "AFTER right eye x8")
    sheet("04-right-eye-closeup-8x.png", [(a, "A  BEFORE right eye x8"),
                                          (b, "B  AFTER right eye x8")])
    # 8x right eye: original / v1 / v2
    c = panel(PANELS / "orig-right-8x.png", src, RIGHT_CROP, "800%", "ORIGINAL open eye x8")
    sheet("05-original-before-after-right-8x.png",
          [(c, "A  ORIGINAL (anatomy) x8"),
           (a, "B  BEFORE v1 x8"),
           (b, "C  AFTER v2 x8")], cols=2)

    # guide-line diagram at 4x face: y=163 iris level, y=168 lid level
    def guides(path, buf, lines, label, scale="400%"):
        """Horizontal level lines + a non-overlapping legend (iPhone-readable)."""
        tmp = ROOT / f".g-{path.stem}.png"
        T.write_rgb(tmp, buf)
        factor = int(scale.rstrip("%")) / 100.0
        T.run(["convert", tmp, "-crop", FACE_CROP, "+repage", "-filter", "Point",
               "-resize", scale, "-depth", "8", str(tmp)])
        w, h = int(200 * factor), int(150 * factor)
        args = ["convert", tmp, "-gravity", "NorthWest", "-strokewidth", "2"]
        for yy, col, txt in lines:
            sy = int(round((yy - 105) * factor))
            args += ["-stroke", col, "-fill", "none",
                     "-draw", f"line 0,{sy} {w},{sy}"]
        # white backing for the heading (the crop corner is dark navy)
        args += ["-stroke", "none", "-fill", "rgba(255,255,255,0.88)",
                 "-draw", f"rectangle 4,4 {min(w - 4, int(w * 0.62))},34"]
        # compact legend, one row per line, no overlapping inline captions
        lx, ly = 8, h - 12 - 22 * len(lines)
        lw = int(w * 0.66)
        args += ["-stroke", "none", "-fill", "rgba(255,255,255,0.86)",
                 "-draw", f"rectangle {lx-4},{ly-6} {lw},{h-6}"]
        for i, (yy, col, txt) in enumerate(lines):
            ry = ly + i * 22
            args += ["-fill", col, "-draw", f"rectangle {lx},{ry+3} {lx+14},{ry+15}",
                     "-fill", T.INK, "-font", T.FONT, "-pointsize", "14",
                     "-annotate", f"+{lx+20}+{ry+15}", txt]
        args += ["-stroke", "none", "-fill", T.INK, "-font", T.FONT,
                 "-pointsize", "16", "-annotate", "+8+20", label,
                 "PNG32:" + str(path)]
        T.run(args)
        tmp.unlink(missing_ok=True)

    iris_y = m["originalIris"]["left"]["centroidY"]
    lid_l = m["approvedElements"]["eye_l_closed-B"]["centroidY"]
    lid_r_before = m["approvedElements"]["eye_r_closed-B"]["centroidY"]
    guides(PANELS / "guides-neutral.png", neutral,
           [(iris_y, "rgba(0,220,255,0.9)", f"IRIS y={iris_y} (both eyes level)")],
           "NEUTRAL: original anatomy")
    guides(PANELS / "guides-before.png", v1_both,
           [(iris_y, "rgba(0,220,255,0.9)", f"IRIS y={iris_y}"),
            (lid_l, "rgba(0,235,120,0.9)", f"LEFT lid y={lid_l}"),
            (lid_r_before, "rgba(255,40,40,0.9)", f"RIGHT lid y={lid_r_before} TOO HIGH")],
           "BEFORE: right lid above iris")
    guides(PANELS / "guides-after.png", v2_both,
           [(iris_y, "rgba(0,220,255,0.9)", f"IRIS y={iris_y}"),
            (lid_l, "rgba(0,235,120,0.9)", f"LEFT lid y={lid_l}"),
            (lid_r_before + DELTA, "rgba(0,235,120,0.9)",
             f"RIGHT lid y={lid_r_before + DELTA} CORRECTED")],
           "AFTER: both lids level")
    sheet("06-eye-level-diagram.png",
          [(PANELS / "guides-neutral.png", "A  NEUTRAL (original)"),
           (PANELS / "guides-before.png", "B  BEFORE"),
           (PANELS / "guides-after.png", "C  AFTER")], cols=2)

    # neutral vs both closed, v2, 1:1
    a = panel(PANELS / "v2-neutral-1x.png", neutral, FACE_CROP, "100%", "NEUTRAL v2")
    b = panel(PANELS / "v2-both-closed-1x.png", v2_both, FACE_CROP, "100%", "BOTH CLOSED v2")
    sheet("07-neutral-vs-both-closed-1x.png",
          [(a, "A  NEUTRAL (unchanged original)"),
           (b, "B  BOTH EYES CLOSED v2")])

    # masks before/after
    ma = PANELS / "mask-v1-8x.png"
    T.run(["convert", SRC_DIR / "mask-eye_r_closed-B-v1.png", "-crop", RIGHT_CROP,
           "+repage", "-filter", "Point", "-resize", "800%", "-colorspace", "sRGB",
           "-type", "TrueColor", "PNG32:" + str(ma)])
    mb = PANELS / "mask-v2-8x.png"
    T.run(["convert", MASKS / "mask-eye_r_closed-B-v2.png", "-crop", RIGHT_CROP,
           "+repage", "-filter", "Point", "-resize", "800%", "-colorspace", "sRGB",
           "-type", "TrueColor", "PNG32:" + str(mb)])
    T.sheet(CMP / "08-mask-before-after-8x.png",
            [(ma, "A  MASK v1"), (mb, "B  MASK v2 (shifted +9 px)")])

    # ---------------------------------------------------------- verification
    v2_l = lid_centroid_state(v2_both, 373, 410, 150, 178)
    v2_r_lid = lid_centroid_state(v2_both, 433, 470, 148, 178)
    v2_r_single = lid_centroid_state(v2_r, 433, 470, 148, 178)
    neutral_l = lid_centroid_state(neutral, 373, 410, 150, 178)
    neutral_r = lid_centroid_state(neutral, 433, 470, 148, 178)
    checks = {}

    def chk(k, ok, detail=None):
        checks[k] = {"pass": bool(ok), "detail": detail}

    chk("only_right_eye_translated",
        abs(v2_l["centroidY"] - m["v1BothClosedState"]["left"]["centroidY"]) < 0.01,
        {"leftBefore": m["v1BothClosedState"]["left"]["centroidY"], "leftAfter": v2_l["centroidY"]})
    chk("right_lid_lowered_by_integer_delta",
        abs(v2_r_lid["centroidY"] - m["v1BothClosedState"]["right"]["centroidY"] - DELTA) < 1.0,
        {"before": m["v1BothClosedState"]["right"]["centroidY"],
         "after": v2_r_lid["centroidY"], "delta": DELTA})
    chk("eyes_level_after_correction",
        abs(v2_l["centroidY"] - v2_r_lid["centroidY"]) < 1.0,
        {"left": v2_l["centroidY"], "right": v2_r_lid["centroidY"],
         "residualPx": round(abs(v2_l["centroidY"] - v2_r_lid["centroidY"]), 3)})
    chk("neutral_state_unchanged",
        neutral == src and neutral == T.read_rgb(SRC_DIR / "state-00-neutral-v1.png"),
        {"neutralEqualsOriginal": neutral == src})
    chk("left_eye_region_byte_identical_in_both_closed",
        all(v2_both[p * 3 + k] == v1_both[p * 3 + k]
            for y in range(140, 190) for x in range(360, 420)
            for k in range(3) for p in [y * T.W + x]), None)
    chk("mouth_and_skin_untouched",
        all(all(v2_both[(y * T.W + x) * 3 + k] == v1_both[(y * T.W + x) * 3 + k]
                for k in range(3))
            for y in range(190, 240) for x in range(340, 540)), None)
    prot = {}
    for name, r in B.PROTECTED.items():
        prot[name] = T.diff_stats(v2_both, src, r)["maxDiff"]
    chk("all_16_protected_zones_pixel_identical",
        all(v == 0 for v in prot.values()), prot)
    mask_prot = {name: sum(1 for y in range(r[1], r[3] + 1)
                           for x in range(r[0], r[2] + 1)
                           if alpha[y * T.W + x] > 0)
                 for name, r in B.PROTECTED.items()}
    chk("v2_mask_has_zero_pixels_in_protected_zones",
        all(v == 0 for v in mask_prot.values()), mask_prot)
    outside = sum(1 for p in range(T.W * T.H)
                  if p not in allowed and
                  any(v2_both[p * 3 + k] != v1_both[p * 3 + k] for k in range(3)))
    chk("no_changes_outside_right_eye_owned_pixels", outside == 0,
        {"changedOutside": outside, "ownedPixels": len(allowed)})

    # v1 files must be untouched
    before = {}
    for line in (SRC_DIR / "v1-SHA256-before.txt").read_text().splitlines():
        h, name = line.split("  ", 1)
        before[name] = h
    after = {}
    for name in before:
        p = V1 / name
        after[name] = T.sha256(p) if p.exists() else None
    v1_bad = [n for n in before if before[n] != after[n]]
    chk("v1_569f984_files_untouched", not v1_bad,
        {"changed": v1_bad, "checked": len(before)})

    # unchanged states byte-identical
    same = {}
    for name, exprs in B.STATES.items():
        if "eye_r_closed-B" not in exprs:
            same[name] = (T.read_rgb(STATES / f"{name}.png") ==
                          T.read_rgb(SRC_DIR / f"state-{name}-v1.png"))
    chk("states_without_right_eye_byte_identical", all(same.values()), same)

    # shape / tilt / thickness / colour preservation
    v1_el = T.read_rgb(SRC_DIR / "element-eye_r_closed-B.png")
    shifted_ink = []
    for y in range(SRC_ROW_MIN, SRC_ROW_MAX + 1):
        for x in range(433, 470):
            if T.lum(*tuple(v1_el[(y * T.W + x) * 3:(y * T.W + x) * 3 + 3])) < 112:
                shifted_ink.append((x, y))
    preserved = all(
        T.lum(*tuple(reg[((y + DELTA) * T.W + x) * 3:((y + DELTA) * T.W + x) * 3 + 3])) < 112
        for x, y in shifted_ink)
    chk("ink_shape_thickness_tilt_colour_preserved", preserved,
        {"darkInkPixelsChecked": len(shifted_ink),
         "method": "every dark source pixel reappears at exactly (x, y+9)"})

    # ---- every carried v1 asset is byte-identical in v2
    carried = {}
    for n in CARRIED_BASE:
        carried[f"base/{n}"] = T.sha256(BASE / n) == T.sha256(V1 / "base" / n)
    for n in CARRIED_MASKS:
        carried[f"masks/{n}"] = T.sha256(MASKS / n) == T.sha256(V1 / "masks" / n)
    for n in CARRIED_LAYERS:
        carried[f"layers/{n}"] = T.sha256(LAYERS / n) == T.sha256(V1 / "layers" / n)
    for name in B.STATES:
        carried[f"states/{name}-state-base.png"] = (
            T.sha256(STATES / f"{name}-state-base.png") ==
            T.sha256(V1 / "states" / f"{name}-state-base.png"))
    chk("all_carried_v1_assets_byte_identical", all(carried.values()),
        {"checked": len(carried), "changed": [k for k, v in carried.items() if not v]})

    # ---- exact RGB translation: colour, thickness, shape, tilt, no resampling
    band_exact = all(
        reg[((y + DELTA) * T.W + x) * 3 + k] == v1_el[(y * T.W + x) * 3 + k]
        for y in range(SRC_ROW_MIN, SRC_ROW_MAX + 1)
        for x in range(T.W) for k in range(3))
    chk("translated_band_rgb_is_byte_exact", band_exact,
        {"rows": [SRC_ROW_MIN, SRC_ROW_MAX], "delta": DELTA,
         "pixelsChecked": (SRC_ROW_MAX - SRC_ROW_MIN + 1) * T.W,
         "meaning": "pure integer row copy: x unchanged; no scaling, rotation or interpolation"})

    # ---- expression switching with the v2 mask / layer
    all_states = {name: T.read_rgb(STATES / f"{name}.png") for name in B.STATES}
    CLEAN = {
        "eye_l": T.read_rgb(BASE / "01-clean-base-eye_l.png"),
        "eye_r": T.read_rgb(BASE / "02-clean-base-eye_r.png"),
        "mouth": T.read_rgb(BASE / "03-clean-base-mouth.png"),
    }
    CHANGED = {z: {p for p in range(T.W * T.H)
                   if any(CLEAN[z][p * 3 + k] != src[p * 3 + k] for k in range(3))}
               for z in CLEAN}
    MASKS_V2 = {
        "eye_l_closed-B": T.read_gray(MASKS / "mask-eye_l_closed-B.png"),
        "eye_r_closed-B": alpha,
        "mouth_open-A": T.read_gray(MASKS / "mask-mouth_open-A.png"),
        "mouth_smile-A": T.read_gray(MASKS / "mask-mouth_smile-A.png"),
    }

    def layer_rgb(path):
        b = T.read_rgba(path)
        return bytes(v for p in range(T.W * T.H) for v in b[p * 4:p * 4 + 3])

    ELEMS_V2 = {
        "eye_l_closed-B": layer_rgb(LAYERS / "layer-eye_l_closed-B.png"),
        "eye_r_closed-B": reg,
        "mouth_open-A": layer_rgb(LAYERS / "layer-mouth_open-A.png"),
        "mouth_smile-A": layer_rgb(LAYERS / "layer-mouth_smile-A.png"),
    }

    def zone_owned(zone):
        owned = set(CHANGED[zone])
        for e, a in MASKS_V2.items():
            if B.EXPR[e] == zone:
                owned.update(p for p in range(T.W * T.H) if a[p] > 0)
        return owned

    def switch_apply(buf, zone, expr):
        out = bytearray(buf)
        for p in zone_owned(zone):
            i = p * 3
            out[i:i + 3] = src[i:i + 3]
        for p in CHANGED[zone]:
            i = p * 3
            out[i:i + 3] = CLEAN[zone][i:i + 3]
        out, _ = T.composite(bytes(out), ELEMS_V2[expr], MASKS_V2[expr])
        return bytes(out)

    def switch_remove(buf, zone):
        out = bytearray(buf)
        for p in zone_owned(zone):
            i = p * 3
            out[i:i + 3] = src[i:i + 3]
        return bytes(out)

    sw = {}
    sw["neutral_is_original"] = (all_states["00-neutral"] == src)
    sw["neutral_apply_eye_l_equals_state01"] = (
        switch_apply(all_states["00-neutral"], "eye_l", "eye_l_closed-B") ==
        all_states["01-eye_l_closed-B"])
    sw["neutral_apply_eye_r_equals_state02"] = (
        switch_apply(all_states["00-neutral"], "eye_r", "eye_r_closed-B") ==
        all_states["02-eye_r_closed-B"])
    sw["state01_apply_eye_r_equals_state05"] = (
        switch_apply(all_states["01-eye_l_closed-B"], "eye_r", "eye_r_closed-B") ==
        all_states["05-both-eyes-closed"])
    sw["state05_remove_eye_r_equals_state01"] = (
        switch_remove(all_states["05-both-eyes-closed"], "eye_r") ==
        all_states["01-eye_l_closed-B"])
    sw["state05_remove_eye_l_equals_state02"] = (
        switch_remove(all_states["05-both-eyes-closed"], "eye_l") ==
        all_states["02-eye_r_closed-B"])
    sw["neutral_apply_mouth_open_equals_state03"] = (
        switch_apply(all_states["00-neutral"], "mouth", "mouth_open-A") ==
        all_states["03-mouth_open-A"])
    sw["state03_replace_with_smile_equals_state04"] = (
        switch_apply(all_states["03-mouth_open-A"], "mouth", "mouth_smile-A") ==
        all_states["04-mouth_smile-A"])
    sw["state03_remove_mouth_equals_neutral"] = (
        switch_remove(all_states["03-mouth_open-A"], "mouth") ==
        all_states["00-neutral"])
    sw["state05_apply_smile_equals_state06"] = (
        switch_apply(all_states["05-both-eyes-closed"], "mouth", "mouth_smile-A") ==
        all_states["06-both-eyes-closed-smile"])
    sw["state02_apply_mouth_open_equals_state09"] = (
        switch_apply(all_states["02-eye_r_closed-B"], "mouth", "mouth_open-A") ==
        all_states["09-eye_r_closed-mouth_open"])
    z6 = all_states["06-both-eyes-closed-smile"]
    for z in ("eye_l", "eye_r", "mouth"):
        z6 = switch_remove(z6, z)
    sw["state06_remove_all_equals_neutral"] = (z6 == all_states["00-neutral"])
    sw["left_eye_state_equals_v1"] = (
        all_states["01-eye_l_closed-B"] ==
        T.read_rgb(SRC_DIR / "state-01-eye_l_closed-B-v1.png"))
    chk("expression_switching_round_trips_v2", all(sw.values()), sw)

    # ---- v2 switch matrix
    matrix = {
        "semantics": "v2: right-eye closed lid re-registered +9 px down; neutral = untouched source; ON = clean zone + approved expression; OFF = restore source over all zone-owned pixels.",
        "states": {},
    }
    for name, exprs in B.STATES.items():
        sb = T.read_rgb(STATES / f"{name}-state-base.png")
        matrix["states"][name] = {
            "expressions": exprs,
            "cleanZones": sorted({B.EXPR[e] for e in exprs}),
            "diffFromOriginal": T.diff_bbox(all_states[name], src),
            "diffFromOwnStateBase": T.diff_bbox(all_states[name], sb),
        }
    T.write_json(STATES / "switch-matrix.json", matrix)

    # ---- all 10 states: protected zones, untouched regions, owned-pixel boundary
    prot_all = {}
    for name, buf in all_states.items():
        prot_all[name] = {rname: T.diff_stats(buf, src, r)["maxDiff"]
                          for rname, r in B.PROTECTED.items()}
    chk("all_10_states_16_protected_zones_pixel_identical",
        all(v == 0 for d in prot_all.values() for v in d.values()), prot_all)
    UNTOUCHED = [(340, 120, 378, 250), (360, 140, 420, 190),
                 (390, 190, 460, 232), (471, 120, 510, 250),
                 (340, 232, 540, 270)]
    reg_all = {}
    for name, buf in all_states.items():
        v1buf = T.read_rgb(SRC_DIR / f"state-{name}-v1.png")
        reg_all[name] = [T.diff_stats(buf, v1buf, r)["maxDiff"] for r in UNTOUCHED]
    chk("all_10_states_mouth_skin_hair_left_eye_unchanged",
        all(v == 0 for row in reg_all.values() for v in row), reg_all)
    outside_all = {}
    for name, exprs in B.STATES.items():
        if "eye_r_closed-B" in exprs:
            v1buf = T.read_rgb(SRC_DIR / f"state-{name}-v1.png")
            outside_all[name] = sum(
                1 for p in range(T.W * T.H)
                if p not in allowed and
                any(all_states[name][p * 3 + k] != v1buf[p * 3 + k] for k in range(3)))
    chk("right_eye_states_change_only_owned_pixels",
        all(v == 0 for v in outside_all.values()), outside_all)

    # ---- seam metrics (known-defect evidence, not a success claim)
    seam_v1 = T.seam_rmse(v1_r, src, B.EYE_R_LENS)
    seam_v2 = T.seam_rmse(v2_r, src, LENS_V2)

    # ---- PNG decode + full-frame dimensions
    core = [p for p in ROOT.rglob("*.png")
            if p.relative_to(ROOT).parts[0] in ("base", "masks", "layers", "states")
            or p.name.startswith("01-re-registered-element")]
    decode_errors, wrong_dim = [], {}
    for p in core:
        rel = str(p.relative_to(ROOT))
        try:
            dim = T.run(["identify", "-format", "%w %h", str(p)]).decode().strip()
        except Exception as e:
            decode_errors.append(rel)
            continue
        if dim != "848 1264":
            wrong_dim[rel] = dim
    chk("png_decode_and_full_frame_dimensions",
        not decode_errors and not wrong_dim,
        {"checked": len(core), "decodeErrors": decode_errors, "wrongDimensions": wrong_dim})

    # ---------------------------------------------------------- mobile sheets
    def make_mobile():
        a = panel(MOBILE / "m01a-before-1x.png", v1_both, FACE_CROP, "100%")
        b = panel(MOBILE / "m01b-after-1x.png", v2_both, FACE_CROP, "100%")
        T.sheet(MOBILE / "01-before-after-1x.png",
                [(a, "A  ДО 569f984 (1:1)"), (b, "B  ПОСЛЕ v2 (1:1)")], cols=2)

        a = panel(MOBILE / "m02a-before-4x.png", v1_both, FACE_CROP, "400%")
        b = panel(MOBILE / "m02b-after-4x.png", v2_both, FACE_CROP, "400%")
        T.sheet(MOBILE / "02-before-after-4x-stacked.png",
                [(a, "A  ДО (лицо x4)"), (b, "B  ПОСЛЕ (лицо x4)")], cols=1)

        a = panel(MOBILE / "m03a-before-8x.png", v1_both, BOTH_CROP, "800%")
        b = panel(MOBILE / "m03b-after-8x.png", v2_both, BOTH_CROP, "800%")
        T.sheet(MOBILE / "03-both-eyes-closeup-8x-stacked.png",
                [(a, "A  ДО оба глаза x8"), (b, "B  ПОСЛЕ оба глаза x8")], cols=1)

        a = panel(MOBILE / "m04a-before-8x.png", v1_r, RIGHT_CROP, "800%")
        b = panel(MOBILE / "m04b-after-8x.png", v2_r, RIGHT_CROP, "800%")
        T.sheet(MOBILE / "04-right-eye-closeup-8x-stacked.png",
                [(a, "A  ДО правый глаз x8"), (b, "B  ПОСЛЕ правый глаз x8")], cols=1)

        c = panel(MOBILE / "m05a-original-6x.png", src, RIGHT_CROP, "600%")
        a = panel(MOBILE / "m05b-before-6x.png", v1_r, RIGHT_CROP, "600%")
        b = panel(MOBILE / "m05c-after-6x.png", v2_r, RIGHT_CROP, "600%")
        T.sheet(MOBILE / "05-original-before-after-right-6x-stacked.png",
                [(c, "A  ОРИГИНАЛ (анатомия) x6"), (a, "B  ДО x6"),
                 (b, "C  ПОСЛЕ x6")], cols=1)

        guides(MOBILE / "m06a-neutral-3x.png", neutral,
               [(iris_y, "rgba(0,220,255,0.9)", f"IRIS y={iris_y}")],
               "НЕЙТРАЛЬ: исходная анатомия", scale="300%")
        guides(MOBILE / "m06b-before-3x.png", v1_both,
               [(iris_y, "rgba(0,220,255,0.9)", f"IRIS y={iris_y}"),
                (lid_l, "rgba(0,235,120,0.9)", f"ЛЕВЫЙ y={lid_l}"),
                (lid_r_before, "rgba(255,40,40,0.9)", f"ПРАВЫЙ y={lid_r_before} ВЫШЕ")],
               "ДО: правое веко выше радужки", scale="300%")
        guides(MOBILE / "m06c-after-3x.png", v2_both,
               [(iris_y, "rgba(0,220,255,0.9)", f"IRIS y={iris_y}"),
                (lid_l, "rgba(0,235,120,0.9)", f"ЛЕВЫЙ y={lid_l}"),
                (lid_r_before + DELTA, "rgba(0,235,120,0.9)",
                 f"ПРАВЫЙ y={lid_r_before + DELTA} ИСПРАВЛЕНО")],
               "ПОСЛЕ: оба века на одном уровне", scale="300%")
        T.sheet(MOBILE / "06-eye-level-diagram-3x-stacked.png",
                [(MOBILE / "m06a-neutral-3x.png", "A  НЕЙТРАЛЬ"),
                 (MOBILE / "m06b-before-3x.png", "B  ДО"),
                 (MOBILE / "m06c-after-3x.png", "C  ПОСЛЕ")], cols=1)

        a = panel(MOBILE / "m07a-neutral-1x.png", neutral, FACE_CROP, "100%")
        b = panel(MOBILE / "m07b-both-1x.png", v2_both, FACE_CROP, "100%")
        T.sheet(MOBILE / "07-neutral-vs-both-closed-1x.png",
                [(a, "A  НЕЙТРАЛЬ (без изменений)"),
                 (b, "B  ОБА ГЛАЗА ЗАКРЫТЫ v2")], cols=2)

        ma = MOBILE / "m08a-mask-v1-6x.png"
        T.run(["convert", SRC_DIR / "mask-eye_r_closed-B-v1.png", "-crop", RIGHT_CROP,
               "+repage", "-filter", "Point", "-resize", "600%", "-colorspace", "sRGB",
               "-type", "TrueColor", "PNG32:" + str(ma)])
        mb = MOBILE / "m08b-mask-v2-6x.png"
        T.run(["convert", MASKS / "mask-eye_r_closed-B-v2.png", "-crop", RIGHT_CROP,
               "+repage", "-filter", "Point", "-resize", "600%", "-colorspace", "sRGB",
               "-type", "TrueColor", "PNG32:" + str(mb)])
        T.sheet(MOBILE / "08-mask-before-after-6x-stacked.png",
                [(ma, "A  МАСКА v1"), (mb, "B  МАСКА v2 (+9 px)")], cols=1)

    # ---------------------------------------------------------- docs / manifest
    def write_docs(rep):
        import re
        checked = rep["summary"]["checksPassed"]
        total = rep["summary"]["checksTotal"]
        residual = m["v1BothClosedState"]["asymmetryPx"]
        md = f"""# E2 — точечная коррекция вертикального положения глаз (V2)

**Отдельная версия.** Родитель: `569f984974f3ec7ade15c90a7b8dfb4bc83cce1a` (версия `E2-FACE-BASE-FULL` сохранена без изменений). Новый отдельный коммит на ветке `arena/02869c32-actual-new-clicker`; его SHA указан в итоговом сообщении чата. E3 / риг-интеграция не начинались.

## 1. Диагноз: какой глаз смещён

Измерения сделаны по нетронутому кадру HEROINE-01 `IMG_4038_rig-pose.webp` и по утверждённым элементам `eye_l_closed-B` / `eye_r_closed-B`. Метод: центроид зелёной радужки для анатомии; центроид тёмного штриха закрытого века в полосе ±3 px вокруг строки-пика.

| Объект | Левый глаз | Правый глаз |
|---|---:|---:|
| Центроид радужки в оригинале, y | {m['originalIris']['left']['centroidY']} | {m['originalIris']['right']['centroidY']} |
| Зелёных пикселей радужки | {m['originalIris']['left']['greenPixels']} | {m['originalIris']['right']['greenPixels']} |
| Центр слота z14 / z15 из `layer-map.json` | (402.5, 162.5) | (457, 162) |
| Центроид тёмного века утверждённого элемента, y | {m['approvedElements']['eye_l_closed-B']['centroidY']} | {m['approvedElements']['eye_r_closed-B']['centroidY']} |
| Смещение века относительно СВОЕЙ радужки | {m['approvedElements']['eye_l_closed-B']['offsetFromOwnIris']:+} px | {m['approvedElements']['eye_r_closed-B']['offsetFromOwnIris']:+} px |
| Состояние `05-both-eyes-closed` в v1, y | {m['v1BothClosedState']['left']['centroidY']} | {m['v1BothClosedState']['right']['centroidY']} |

Разница радужек по вертикали: **{m['originalIris']['verticalDifferencePx']} px** — в исходной анатомии глаза находятся на одном уровне. Левое закрытое веко лежит на {m['approvedElements']['eye_l_closed-B']['offsetFromOwnIris']:+} px ниже радужки (естественное положение). Правое закрытое веко лежит на {abs(m['approvedElements']['eye_r_closed-B']['offsetFromOwnIris'])} px **ВЫШЕ** радужки, в зоне верхних ресниц/складки. Асимметрия в v1: **{residual} px**.

**Вывод: смещён правый глаз (`eye_r_closed-B`) — его утверждённый элемент зарегистрирован слишком высоко. Левый глаз зарегистрирован верно и не трогается.** v1 (`569f984…`) точно воспроизвела утверждённый элемент; смещение присуще регистрации самого элемента, а не внесено конвейером v1.

## 2. Что именно исправлено

- Только правый глаз: чистый **целочисленный сдвиг вниз на +{DELTA} px** (`y → y+{DELTA}`), без ресемплинга, без изменения `x`, без масштабирования, без поворота, без перерисовки.
- Перенесена вся полоса утверждённого элемента `y={SRC_ROW_MIN}…{SRC_ROW_MAX}` (тёмный штрих века, ресницы, светлая линия, прилегающий тон кожи) и соответственно сдвинута техническая линза/маска `EYE_R_LENS`.
- ИИ-контекст брови выше века **намеренно не переносился** (иначе появилась бы вторая бровь); выше сдвинутого века используется уже очищенная база v1.
- Сохранены выбранные варианты `eye_l_closed-B` **и** `eye_r_closed-B`, их форма, стиль линии, толщина ресниц и цвет: проверка `translated_band_rgb_is_byte_exact` сравнивает все {(SRC_ROW_MAX - SRC_ROW_MIN + 1) * T.W} RGB-значений сдвинутой полосы с исходным элементом попиксельно.
- Размер, форма и наклон глаза не менялись «ради визуального выравнивания» — применена только трансляция.
- Рот, кожа, волосы, 16 защитных зон, левый глаз, нейтральное состояние, чистовые базы, все остальные элементы E2 и все 10 состояний без правого глаза остались байт-в-байт как в v1.

## 3. Проверка нейтрали и обоих закрытых глаз

| Состояние | Левое веко y | Правое веко y | Остаток асимметрии |
|---|---:|---:|---:|
| `00-neutral` (оригинал, без изменений) | радужка {m['originalIris']['left']['centroidY']} | радужка {m['originalIris']['right']['centroidY']} | {m['originalIris']['verticalDifferencePx']} px |
| `05-both-eyes-closed` ДО (v1) | {m['v1BothClosedState']['left']['centroidY']} | {m['v1BothClosedState']['right']['centroidY']} | {residual} px |
| `05-both-eyes-closed` ПОСЛЕ (v2) | {rep['measurementsAfter']['bothClosedLeftLid']['centroidY']} | {rep['measurementsAfter']['bothClosedRightLid']['centroidY']} | **{rep['measurementsAfter']['residualAsymmetryPx']} px** |
| `02-eye_r_closed-B` ПОСЛЕ (v2) | — | {rep['measurementsAfter']['singleRightLid']['centroidY']} | — |

`00-neutral` байт-идентичен исходному кадру и v1. Оба века после коррекции находятся на одном уровне с точностью {rep['measurementsAfter']['residualAsymmetryPx']} px; оба лежат примерно на 5 px ниже своих радужек, как и левое веко в утверждённом варианте.

## 4. Сравнения ДО / ПОСЛЕ

- 1:1 (без масштабирования): [comparison/01-before-after-1x.png](comparison/01-before-after-1x.png) · [mobile 1:1](comparison/mobile/01-before-after-1x.png)
- Лицо ×4: [comparison/02-before-after-4x.png](comparison/02-before-after-4x.png) · [mobile](comparison/mobile/02-before-after-4x-stacked.png)
- Оба глаза ×8 (close-up): [comparison/03-both-eyes-closeup-8x.png](comparison/03-both-eyes-closeup-8x.png) · [mobile](comparison/mobile/03-both-eyes-closeup-8x-stacked.png)
- Правый глаз ×8 (close-up): [comparison/04-right-eye-closeup-8x.png](comparison/04-right-eye-closeup-8x.png) · [mobile](comparison/mobile/04-right-eye-closeup-8x-stacked.png)
- Оригинал / ДО / ПОСЛЕ правый глаз: [comparison/05-original-before-after-right-8x.png](comparison/05-original-before-after-right-8x.png) · [mobile ×6](comparison/mobile/05-original-before-after-right-6x-stacked.png)
- Схема уровней с координатами: [comparison/06-eye-level-diagram.png](comparison/06-eye-level-diagram.png) · [mobile](comparison/mobile/06-eye-level-diagram-3x-stacked.png)
- Нейтраль vs оба закрытых, 1:1: [comparison/07-neutral-vs-both-closed-1x.png](comparison/07-neutral-vs-both-closed-1x.png) · [mobile](comparison/mobile/07-neutral-vs-both-closed-1x.png)
- Маска ДО / ПОСЛЕ ×8: [comparison/08-mask-before-after-8x.png](comparison/08-mask-before-after-8x.png) · [mobile ×6](comparison/mobile/08-mask-before-after-6x-stacked.png)

Папка [comparison/mobile/](comparison/mobile/) содержит узкие листы (≤ ~1050 px по ширине, один столбец) для удобного просмотра на iPhone; основные листы в `comparison/` сохранены в полном размере.

## 5. Верификация

`verify-report.json`: **{checked}/{total} PASS, 0 FAIL**. Ключевые проверки:

- `only_right_eye_translated`, `right_lid_lowered_by_integer_delta`, `eyes_level_after_correction`;
- `neutral_state_unchanged`, `left_eye_region_byte_identical_in_both_closed`, `mouth_and_skin_untouched`;
- `all_16_protected_zones_pixel_identical` и `all_10_states_16_protected_zones_pixel_identical` (16 зон × 10 состояний, maxDiff = 0);
- `v2_mask_has_zero_pixels_in_protected_zones`, `no_changes_outside_right_eye_owned_pixels`, `right_eye_states_change_only_owned_pixels`;
- `all_carried_v1_assets_byte_identical` ({len(carried)} перенесённых файла), `states_without_right_eye_byte_identical`;
- `translated_band_rgb_is_byte_exact`, `ink_shape_thickness_tilt_colour_preserved`;
- `expression_switching_round_trips_v2` (12 переключений ON/OFF/замена, включая полный возврат к нейтрали);
- `v1_569f984_files_untouched` ({len(before)} файлов v1, 0 изменённых), `png_decode_and_full_frame_dimensions`;
- `sha256sum -c SHA256-MANIFEST.txt` — все файлы версии сходятся.

Маска v2: ненулевых {rep['mask']['maskNonZeroPixels']} px, полностью непрозрачных {rep['mask']['maskFullyOpaquePixels']} px, частичных {rep['mask']['maskPartialPixels']} px, bbox {rep['mask']['bbox']}. Матрица переключения: [states/switch-matrix.json](states/switch-matrix.json). Измерения: [00-measurements.json](00-measurements.json). Полный отчёт проверок: [verify-report.json](verify-report.json).

Метод — только ручная растровая/техническая работа (`face_base_toolkit` из v1 + `build_alignment.py`): без `generate_image`, без генеративного ИИ, без inpainting / generative fill / diffusion / content-aware инструментов.

## 6. Что не трогали

Не изменены: `569f984…` / `E2-FACE-BASE-FULL/` целиком ({len(before)} файлов, SHA256 сходятся), `E2-facial-states/`, `E2-REVIEW-SET/`, `E2-FINAL-DECISION/`, `E2-FACE-BASE-PILOT/`, E1, предыдущие стейджи, `PLAN.md`, `MANIFEST.json`, `ANIMATION-SPEC.md`, `layer-map.json`, 20 `layers/*.png`, исходные WebP, `public/`, `src/`, `dist/`, `package.json`, код/атлас/риг, PR #3, Vercel Preview/Production. Решение A/B не пересматривалось; `mouth_closed-A` по-прежнему только визуальный ориентир. Архитектура и число слотов не менялись.

## 7. Остаточные дефекты (не скрыты, не сняты, не объявлены успехом)

- `eye_r_closed-B`: дополнительная светлая линия над веком **сохранена и сдвинута вместе с элементом**; `seam_rmse` (сравнение состояния с ИСХОДНЫМ ОТКРЫТЫМ глазом) ДО = {seam_v1}, ПОСЛЕ = {seam_v2}. Рост метрики ожидаем: после опускания века исходные тёмные чернила открытого глаза `y≈150–161` оказались вне сдвинутой линзы и заменены чистовой кожей, поэтому сравнение с открытым глазом даёт большую разницу; это не новый видимый шов (на ×8 ДО/ПОСЛЕ видна гладкая кожа между бровью и веком). Метрика приведена как свидетельство, не как «принятие». Слабая разница гладкости/тона внутри подобранной линзы и короткая вертикальная граница у защищённой пряди `x≈470–471` при ×8 остаются.
- `eye_l_closed-B`: более тонкие ресницы, мягкая дополнительная складка, `seam=14.92`, тон-ступенька `x≈405–410` при ×8 и небольшой шаг маски у кончика волос.
- `mouth_open-A`: широкое «О», `seam=8.77`; `mouth_smile-A`: тонкая линия `28/44`; чистовая база рта технически гладче щеки.
- Из пилота/v1: `registrationAnnulusMSE=3389.4`, сдвиг `[-4,-4]`, тёмные чернила `308/732`; под веками нет реальной анатомии (техническая чистовая база); AI-элементы не имеют настоящего альфа-канала, маски технические.
- В отчёте v1 `E2-FACE-BASE-FULL-REPORT.md` остаётся известная опечатка `829` вместо корректного `929` для частичной маски правого глаза; файл намеренно не изменён, чтобы не перезаписывать предыдущий результат.
- Коррекция **не устраняет** перечисленные дефекты и не означает их одобрения.

## 8. СТОП

**СТОП.** Публикую отдельный коммит и ссылки на изображения, затем жду визуального подтверждения от пользователя. Коррекция **не считается утверждённой**, самоодобрения нет. E3 и интеграция с ригом не начаты. Дальнейшие правки — только после явного визуального отзыва.

---
[Индекс галереи](E2-EYE-ALIGNMENT-V2-INDEX.md) · [Метаданные](E2-eye-alignment-v2.json) · [SHA256-манифест](SHA256-MANIFEST.txt)
"""
        (ROOT / "E2-EYE-ALIGNMENT-V2-REPORT.md").write_text(md, encoding="utf-8")

        panels = [
            ("01-before-after-1x.png", "ДО / ПОСЛЕ, 1:1"),
            ("02-before-after-4x.png", "Лицо ×4"),
            ("03-both-eyes-closeup-8x.png", "Оба глаза ×8"),
            ("04-right-eye-closeup-8x.png", "Правый глаз ×8"),
            ("05-original-before-after-right-8x.png", "Оригинал / ДО / ПОСЛЕ"),
            ("06-eye-level-diagram.png", "Схема уровней"),
            ("07-neutral-vs-both-closed-1x.png", "Нейтраль / оба закрытых"),
            ("08-mask-before-after-8x.png", "Маска ДО / ПОСЛЕ"),
        ]
        idx = ["# E2 — коррекция положения глаз V2: галерея", "",
               "Версия-родитель `569f984…` не изменена. Сначала узкие листы для iPhone, затем полные.", ""]
        for f, cap in panels:
            idx.append(f"## {cap}")
            idx.append(f"![{cap}](comparison/{f})")
            idx.append(f"[Открыть полный лист](comparison/{f})")
            idx.append("")
        idx += ["## Узкие листы для iPhone",
                "", "- [1:1 ДО/ПОСЛЕ](comparison/mobile/01-before-after-1x.png)",
                "- [Лицо ×4 (столбец)](comparison/mobile/02-before-after-4x-stacked.png)",
                "- [Оба глаза ×8 (столбец)](comparison/mobile/03-both-eyes-closeup-8x-stacked.png)",
                "- [Правый глаз ×8 (столбец)](comparison/mobile/04-right-eye-closeup-8x-stacked.png)",
                "- [Оригинал/ДО/ПОСЛЕ ×6 (столбец)](comparison/mobile/05-original-before-after-right-6x-stacked.png)",
                "- [Схема ×3 (столбец)](comparison/mobile/06-eye-level-diagram-3x-stacked.png)",
                "- [Нейтраль/оба закрытых 1:1](comparison/mobile/07-neutral-vs-both-closed-1x.png)",
                "- [Маска ×6 (столбец)](comparison/mobile/08-mask-before-after-6x-stacked.png)",
                "", "## Документы", "",
                "- [Полный отчёт](E2-EYE-ALIGNMENT-V2-REPORT.md)",
                "- [Измерения](00-measurements.json)",
                "- [Проверки](verify-report.json)",
                "- [Матрица переключения](states/switch-matrix.json)",
                "- [Метаданные](E2-eye-alignment-v2.json)",
                "- [SHA256-манифест](SHA256-MANIFEST.txt)", ""]
        index_md = "\n".join(idx) + "\n"
        (ROOT / "E2-EYE-ALIGNMENT-V2-INDEX.md").write_text(index_md, encoding="utf-8")

        T.write_json(ROOT / "E2-eye-alignment-v2.json", {
            "stage": "E2-EYE-ALIGNMENT-V2",
            "parent": "569f984974f3ec7ade15c90a7b8dfb4bc83cce1a",
            "displacedEye": "eye_r_closed-B",
            "deltaPxDown": DELTA,
            "measuredAsymmetryPx": residual,
            "residualAsymmetryPx": rep["measurementsAfter"]["residualAsymmetryPx"],
            "checks": rep["summary"],
            "v1FilesChecked": len(before),
            "v1FilesChanged": len(v1_bad),
            "carriedAssets": len(carried),
            "seamV1": seam_v1,
            "seamV2": seam_v2,
            "commit": "see final chat report (separate commit on arena/02869c32-actual-new-clicker)",
            "approval": "NOT APPROVED - waiting for user visual confirmation",
        })

        text = md + index_md
        cjk = [c for c in text if "\u4e00" <= c <= "\u9fff"]
        links = re.findall(r"\]\(([^)]+)\)", text)
        # SHA256 manifests are generated after the docs, so they are exempt here
        bad = [l for l in links
               if not l.startswith("http")
               and not l.startswith("SHA256-MANIFEST")
               and not (ROOT / l).exists()]
        T.write_json(ROOT / "links-report.json", {
            "linksChecked": len(links), "brokenLinks": bad, "cjkCharacters": len(cjk),
            "pass": not bad and not cjk})
        return {"linksChecked": len(links), "brokenLinks": bad, "cjk": len(cjk)}

    def write_manifest(links):
        (ROOT / ".gitignore").write_text(
            "__pycache__/\n.scratch/\n*.tmp.png\n.p-*.png\n.g-*.png\n", encoding="utf-8")
        # final metadata is written BEFORE hashing so it is covered by the manifest
        T.write_json(ROOT / "E2-eye-alignment-v2.json", {
            "stage": "E2-EYE-ALIGNMENT-V2",
            "parent": "569f984974f3ec7ade15c90a7b8dfb4bc83cce1a",
            "displacedEye": "eye_r_closed-B",
            "deltaPxDown": DELTA,
            "measuredAsymmetryPx": m["v1BothClosedState"]["asymmetryPx"],
            "residualAsymmetryPx": report["measurementsAfter"]["residualAsymmetryPx"],
            "checks": report["summary"],
            "v1FilesChecked": len(before),
            "v1FilesChanged": len(v1_bad),
            "carriedAssets": len(carried),
            "seamV1": seam_v1,
            "seamV2": seam_v2,
            "links": links,
            "commit": "see final chat report (separate commit on arena/02869c32-actual-new-clicker)",
            "approval": "NOT APPROVED - waiting for user visual confirmation",
        })
        skip = {".gitignore", "SHA256-MANIFEST.txt", "SHA256-MANIFEST.json"}
        files = []
        for p in sorted(ROOT.rglob("*")):
            if not p.is_file():
                continue
            rel = str(p.relative_to(ROOT))
            if rel in skip or rel.startswith(".scratch/") or "__pycache__" in rel:
                continue
            parts = rel.split("/")
            if any(part.startswith(".p-") or part.startswith(".g-") or part.endswith(".tmp.png")
                   for part in parts):
                continue
            files.append((rel, T.sha256(p)))
        (ROOT / "SHA256-MANIFEST.txt").write_text(
            "\n".join(f"{h}  {rel}" for rel, h in files) + "\n", encoding="utf-8")
        T.write_json(ROOT / "SHA256-MANIFEST.json",
                     {"count": len(files), "files": {rel: h for rel, h in files}})
        bad = [rel for rel, h in files if T.sha256(ROOT / rel) != h]
        return {"files": len(files), "roundTripBad": bad, "links": links}

    # (functions above are called after verify-report.json is written)
    report = {
        "stage": "E2-EYE-ALIGNMENT-V2",
        "parent": "569f984974f3ec7ade15c90a7b8dfb4bc83cce1a",
        "deltaPxDown": DELTA,
        "measurementsBefore": m,
        "measurementsAfter": {
            "bothClosedLeftLid": v2_l, "bothClosedRightLid": v2_r_lid,
            "singleRightLid": v2_r_single,
            "neutralLeftDarkPeak": neutral_l, "neutralRightDarkPeak": neutral_r,
            "residualAsymmetryPx": round(abs(v2_l["centroidY"] - v2_r_lid["centroidY"]), 3),
        },
        "mask": {**T.mask_stats(alpha), "bbox": T.mask_bbox(alpha)},
        "states": state_info,
        "switchMatrix": "states/switch-matrix.json",
        "seam": {"v1": seam_v1, "v2": seam_v2},
        "carriedAssets": len(carried),
        "v1FilesChecked": len(before),
        "v1FilesChanged": len(v1_bad),
        "checks": checks,
        "summary": {"checksTotal": len(checks),
                    "checksPassed": sum(1 for v in checks.values() if v["pass"]),
                    "checksFailed": sum(1 for v in checks.values() if not v["pass"])},
    }
    T.write_json(ROOT / "verify-report.json", report)
    if report["summary"]["checksFailed"]:
        print("FAILED:", [k for k, v in checks.items() if not v["pass"]])
        sys.exit(1)
    make_mobile()
    links = write_docs(report)
    manifest = write_manifest(links)
    print(json.dumps({
        "checks": report["summary"],
        "residualAsymmetryPx": report["measurementsAfter"]["residualAsymmetryPx"],
        "mask": report["mask"],
        "seam": report["seam"],
        "links": links,
        "manifest": manifest,
    }, indent=2))
    if manifest["roundTripBad"] or links["brokenLinks"] or links["cjk"]:
        print("PUBLICATION FAILED")
        sys.exit(1)


if __name__ == "__main__":
    main()
