#!/usr/bin/env python3
"""E2 / FULL FACE BASE  -  blocks A (right eye) and B (mouth).

Reuses the published pilot 504d1f7 method through `face_base_toolkit.py`.
The left eye result of that pilot is REUSED BYTE-FOR-BYTE, never rebuilt.

Usage:
    python3 build_full.py --stage A     # block A only, local checkpoint
    python3 build_full.py --stage B      # block B only, local checkpoint
    python3 build_full.py --stage all  # full base, 4 masks, all states
    python3 finalize.py               # verification, sheets, report, manifest

All writes stay inside this folder. Sources are read-only copies.
No generative AI / inpainting / generative fill / diffusion / content-aware.
"""

import sys
sys.dont_write_bytecode = True

import argparse
import shutil
from pathlib import Path

import face_base_toolkit as T

ROOT = Path(__file__).resolve().parent
SRC_DIR = ROOT / "source"
BLOCK_A = ROOT / "blocks" / "A-right-eye"
BLOCK_B = ROOT / "blocks" / "B-mouth"
BASE = ROOT / "base"
MASKS = ROOT / "masks"
LAYERS = ROOT / "layers"
STATE_DIR = ROOT / "states"
COMPARISON = ROOT / "comparison"

FACE_CROP = "200x150+340+105"
ZOOM_L = "80x70+355+125"     # published pilot crop (left eye)
ZOOM_R = "80x70+420+130"     # right eye
ZOOM_M = "80x60+385+175"     # mouth

# ------------------------------------------------------------------ geometry
# Hand drawn from the 10x coordinate grids and 1px ASCII ink maps of the
# untouched source. Coordinates are absolute pixels of the 848x1264 frame.

EYE_R_CLEAN = [
    (436, 160), (439, 153), (445, 149), (453, 148), (461, 148),
    (467, 150), (470, 154), (470, 160), (470, 165), (467, 170),
    (461, 174), (454, 176), (447, 175), (441, 172), (437, 167),
]
EYE_R_LENS = [
    (431, 161), (434, 155), (441, 151), (449, 149), (457, 149),
    (464, 151), (468, 155), (470, 160), (469, 166), (465, 171),
    (458, 174), (450, 175), (442, 173), (436, 169),
]
MOUTH_CLEAN = [
    (404, 201), (408, 197), (415, 195), (423, 194), (431, 195),
    (438, 197), (441, 201), (441, 206), (437, 210), (430, 213),
    (423, 214), (416, 212), (409, 209), (404, 205),
]
MOUTH_LENS = [
    (405, 201), (409, 197), (416, 195), (423, 194), (431, 195),
    (438, 198), (442, 202), (441, 207), (436, 211), (429, 214),
    (422, 214), (415, 211), (409, 208), (405, 205),
]

# Features that must stay pixel-identical to the untouched original in EVERY
# output. None of these rectangles overlaps the three target polygons.
PROTECTED = {
    "brow_left":          (392, 136, 416, 149),
    "brow_right":         (432, 136, 470, 148),
    "hair_fringe_left":   (352, 130, 376, 200),
    "hair_tip_left":      (374, 143, 385, 157),
    "hair_strand_center": (412, 130, 417, 172),
    "hair_strand_right":  (471, 130, 477, 196),
    "ear_right":          (478, 148, 498, 192),
    "nose_highlight":     (418, 176, 428, 193),
    "nose_line":          (421, 183, 427, 192),
    "jaw_left":           (376, 186, 398, 216),
    "jaw_right_upper":    (468, 178, 480, 206),
    "chin":               (405, 218, 443, 232),
    "blush_left":         (380, 182, 403, 200),
    "blush_right":        (444, 180, 468, 200),
    "hair_lower_left":    (348, 202, 376, 244),
    "hair_lower_right":   (470, 202, 502, 244),
}
PROTECTED_LIST = list(PROTECTED.values())

# Real skin samples (candidates that are ink/hair/protected are auto-skipped).
HAND_R = [
    (430, 178), (435, 184), (440, 184), (445, 184), (450, 184),
    (455, 184), (460, 183), (464, 180), (430, 170), (429, 163),
    (431, 156), (437, 150), (445, 146), (455, 145), (463, 146),
    (466, 168), (464, 174), (458, 179), (450, 180), (442, 178),
    (436, 174), (432, 182),
]
HAND_M = [
    (404, 199), (407, 196), (412, 195), (418, 195), (425, 195),
    (432, 196), (438, 198), (441, 201), (441, 206), (438, 211),
    (432, 215), (425, 217), (418, 216), (412, 214), (407, 210),
    (404, 205), (420, 220), (428, 220),
]

# Boundaries used by the automated "changes outside the zone" check.
ZONE_RECTS = {
    "eye_l": (365, 138, 420, 186),
    "eye_r": (428, 140, 474, 186),
    "mouth": (400, 190, 446, 218),
}

EXPR = {
    "eye_l_closed-B": "eye_l",
    "eye_r_closed-B": "eye_r",
    "mouth_open-A": "mouth",
    "mouth_smile-A": "mouth",
}

STATES = {
    "00-neutral": [],
    "01-eye_l_closed-B": ["eye_l_closed-B"],
    "02-eye_r_closed-B": ["eye_r_closed-B"],
    "03-mouth_open-A": ["mouth_open-A"],
    "04-mouth_smile-A": ["mouth_smile-A"],
    "05-both-eyes-closed": ["eye_l_closed-B", "eye_r_closed-B"],
    "06-both-eyes-closed-smile": ["eye_l_closed-B", "eye_r_closed-B", "mouth_smile-A"],
    "07-mouth_open-both-eyes-closed": ["eye_l_closed-B", "eye_r_closed-B", "mouth_open-A"],
    "08-eye_l_closed-smile": ["eye_l_closed-B", "mouth_smile-A"],
    "09-eye_r_closed-mouth_open": ["eye_r_closed-B", "mouth_open-A"],
}


def ensure_dirs():
    for d in (BLOCK_A, BLOCK_B, BASE, MASKS, LAYERS, STATE_DIR, COMPARISON,
              BLOCK_A / "zoom", BLOCK_B / "zoom"):
        d.mkdir(parents=True, exist_ok=True)


def published_overlay(element_path, src_path, dst):
    """Recompose the published E2 solid-zone overlay at full canvas size."""
    buf = T.run(["convert", src_path, "-alpha", "off", element_path,
                 "-compose", "Over", "-composite", "-depth", "8", "rgb:-"])
    T.write_rgb(dst, buf)
    return buf


def build_geometry():
    src_path = SRC_DIR / "source-frame.webp"
    src = T.read_rgb(src_path)
    pilot_base = T.read_rgb(SRC_DIR / "pilot-clean-base.png")
    pilot_overlay = T.read_rgb(SRC_DIR / "pilot-overlay-full.png")

    # Exact ownership of the approved left-eye clean base (never rebuilt).
    left_changed = set()
    for p in range(T.W * T.H):
        i = p * 3
        if (pilot_base[i] != src[i] or pilot_base[i + 1] != src[i + 1]
                or pilot_base[i + 2] != src[i + 2]):
            left_changed.add(p)
    lb = T.diff_bbox(pilot_base, src)["bbox"]
    assert lb and 365 <= lb[0] and lb[2] <= 420 and 138 <= lb[1] and lb[3] <= 186, lb

    d_r, ch_r, an_r, skip_r = T.build_clean_delta(
        src, EYE_R_CLEAN, PROTECTED_LIST, HAND_R, feather=3.2, soften=7.0,
        shade=lambda t: 0.965 + 0.035 * t, ink_cleanup=True)
    d_m, ch_m, an_m, skip_m = T.build_clean_delta(
        src, MOUTH_CLEAN, PROTECTED_LIST, HAND_M, feather=3.0, soften=7.0,
        shade=None)

    return {
        "src": src, "src_path": src_path,
        "pilot_base": pilot_base, "pilot_overlay": pilot_overlay,
        "left_changed": left_changed, "left_bbox": lb,
        "deltas": {"eye_l": (pilot_base, left_changed),
                   "eye_r": (d_r, ch_r), "mouth": (d_m, ch_m)},
        "anchors": {"eye_r": an_r, "mouth": an_m},
        "skipped": {"eye_r": skip_r, "mouth": skip_m},
    }


def build_masks(g):
    """Four precise mattes; left-eye one is the published pilot matte."""
    src = g["src"]
    full_base = T.apply_delta(T.apply_delta(
        T.apply_delta(src, *g["deltas"]["eye_l"]), *g["deltas"]["eye_r"]),
        *g["deltas"]["mouth"])

    masks = {}
    layers = {}
    elems = {}

    # left eye: byte-identical reuse of the approved pilot
    pm = T.read_gray(SRC_DIR / "pilot-mask-eye_l_closed-B.png")
    pl = T.read_rgba(SRC_DIR / "pilot-masked-element-eye_l_closed-B.png")
    masks["eye_l_closed-B"] = pm
    layers["eye_l_closed-B"] = pl
    elems["eye_l_closed-B"] = T.read_rgb(SRC_DIR / "element-eye_l_closed-B.png")

    # right eye: state base = source + only the right-eye clean delta
    base_r = T.apply_delta(src, *g["deltas"]["eye_r"])
    er = T.read_rgb(SRC_DIR / "element-eye_r_closed-B.png")
    mr = T.build_hybrid_mask(er, base_r, EYE_R_LENS, PROTECTED_LIST,
                             feather=3.2, skin_mix=0.40)
    masks["eye_r_closed-B"] = mr
    elems["eye_r_closed-B"] = er
    lr = bytearray(T.W * T.H * 4)
    for p in range(T.W * T.H):
        lr[p * 4:p * 4 + 3] = er[p * 3:p * 3 + 3]
        lr[p * 4 + 3] = mr[p]
    layers["eye_r_closed-B"] = bytes(lr)

    # mouth: one common clean base, two mutually exclusive expressions
    base_m = T.apply_delta(src, *g["deltas"]["mouth"])
    for name in ("mouth_open-A", "mouth_smile-A"):
        em = T.read_rgb(SRC_DIR / f"element-{name}.png")
        mm = T.build_hybrid_mask(em, base_m, MOUTH_LENS, PROTECTED_LIST,
                                 feather=2.8, skin_mix=0.34,
                                 ink_low=4.0, ink_span=20.0)
        masks[name] = mm
        elems[name] = em
        lm = bytearray(T.W * T.H * 4)
        for p in range(T.W * T.H):
            lm[p * 4:p * 4 + 3] = em[p * 3:p * 3 + 3]
            lm[p * 4 + 3] = mm[p]
        layers[name] = bytes(lm)

    return {"full_base": full_base, "masks": masks, "layers": layers,
            "elems": elems, "base_r": base_r, "base_m": base_m}


def state_base(g, expressions):
    zones = []
    for e in expressions:
        z = EXPR[e]
        if z not in zones:
            zones.append(z)
    buf = g["src"]
    for z in zones:
        buf = T.apply_delta(buf, *g["deltas"][z])
    return bytes(buf), zones


def state_overlay(g, m, expressions):
    base, zones = state_base(g, expressions)
    buf = base
    for e in expressions:
        alpha = m["masks"][e]
        el = m["elems"][e]
        buf, _ = T.composite(buf, el, alpha)
    return buf, base, zones


# ------------------------------------------------------------------ block A
def write_block_a(g, m):
    src = g["src"]
    base_r = m["base_r"]
    mr = m["masks"]["eye_r_closed-B"]
    er = m["elems"]["eye_r_closed-B"]
    ov, touched = T.composite(base_r, er, mr)
    T.write_rgb(BLOCK_A / "01-clean-base-eye_r.png", base_r)
    T.write_gray(BLOCK_A / "02-mask-eye_r_closed-B.png", mr)
    T.write_rgba(BLOCK_A / "02-masked-element-eye_r_closed-B.png",
                 m["layers"]["eye_r_closed-B"])
    T.write_rgb(BLOCK_A / "03-overlay-eye_r_closed-B.png", ov)
    e2 = published_overlay(SRC_DIR / "element-eye_r_closed-B.png",
                           g["src_path"], BLOCK_A / "05-published-E2-full.png")
    for name, buf, label in (
        ("01-original-8x.png", src, "A ORIGINAL x8"),
        ("02-clean-base-8x.png", base_r, "B CLEAN BASE x8"),
        ("03-mask-8x.png", None, "C MASK x8"),
        ("04-overlay-8x.png", ov, "D PILOT x8"),
        ("05-published-E2-8x.png", e2, "E PUBLISHED E2 x8"),
    ):
        if buf is None:
            T.run(["convert", BLOCK_A / "02-mask-eye_r_closed-B.png",
                   "-crop", ZOOM_R, "+repage", "-filter", "Point",
                   "-resize", "800%", "-colorspace", "sRGB", "-type",
                   "TrueColor", "PNG32:" + str(BLOCK_A / "zoom" / name)])
        else:
            p = BLOCK_A / f".buf-{name}.png"
            T.write_rgb(p, buf)
            T.crop_zoom(BLOCK_A / "zoom" / name, p, ZOOM_R, "800%")
            p.unlink()

    report = {
        "block": "A - right eye",
        "expression": "eye_r_closed-B",
        "method": "pilot 504d1f7 method: manual IDW skin from real samples + fitted soft hybrid lens",
        "generativeAI": False, "inpainting": False, "generativeFill": False,
        "cleanPolygon": EYE_R_CLEAN, "lensPolygon": EYE_R_LENS,
        "skinAnchors": {"count": len(g["anchors"]["eye_r"]),
                        "handCandidatesSkipped": g["skipped"]["eye_r"],
                        "coords": [[a[0], a[1]] for a in g["anchors"]["eye_r"]]},
        "cleanBasePixelsRepainted": len(g["deltas"]["eye_r"][1]),
        "mask": T.mask_stats(mr),
        "maskBBox": T.mask_bbox(mr),
        "overlayPixelsTouched": touched,
        "seamRMSE": {
            "newOverlay_vs_original": T.seam_rmse(ov, src, EYE_R_CLEAN),
            "cleanBase_vs_original": T.seam_rmse(base_r, src, EYE_R_CLEAN),
            "publishedE2SolidEllipse_vs_original": T.seam_rmse(e2, src, EYE_R_CLEAN),
        },
        "protectedZones": {k: T.diff_stats(ov, src, r)["maxDiff"]
                           for k, r in PROTECTED.items()},
        "cleanBaseProtectedZones": {k: T.diff_stats(base_r, src, r)["maxDiff"]
                                    for k, r in PROTECTED.items()},
        "maskPixelsInProtectedZones": {
            k: sum(1 for y in range(r[1], r[3] + 1)
                   for x in range(r[0], r[2] + 1) if mr[y * T.W + x] > 0)
            for k, r in PROTECTED.items()},
    }
    T.write_json(BLOCK_A / "block-A-report.json", report)
    return report


# ------------------------------------------------------------------ block B
def write_block_b(g, m):
    src = g["src"]
    base_m = m["base_m"]
    T.write_rgb(BLOCK_B / "01-clean-base-mouth.png", base_m)
    T.write_rgb(BLOCK_B / "04-neutral-return.png", src)  # exact original
    out = {}
    e2bufs = {}
    for name in ("mouth_open-A", "mouth_smile-A"):
        em = m["elems"][name]
        mm = m["masks"][name]
        ov, touched = T.composite(base_m, em, mm)
        T.write_gray(BLOCK_B / f"02-mask-{name}.png", mm)
        T.write_rgba(BLOCK_B / f"02-masked-element-{name}.png", m["layers"][name])
        T.write_rgb(BLOCK_B / f"03-overlay-{name}.png", ov)
        e2 = published_overlay(SRC_DIR / f"element-{name}.png",
                               g["src_path"], BLOCK_B / f"06-published-E2-{name}-full.png")
        e2bufs[name] = e2
        out[name] = {"mask": T.mask_stats(mm), "maskBBox": T.mask_bbox(mm),
                     "overlayPixelsTouched": touched,
                     "seamRMSE": {
                         "newOverlay_vs_original": T.seam_rmse(ov, src, MOUTH_CLEAN),
                         "cleanBase_vs_original": T.seam_rmse(base_m, src, MOUTH_CLEAN),
                         "publishedE2_vs_original": T.seam_rmse(e2, src, MOUTH_CLEAN)},
                     "protectedZones": {k: T.diff_stats(ov, src, r)["maxDiff"]
                                        for k, r in PROTECTED.items()},
                     "maskPixelsInProtectedZones": {
                         k: sum(1 for y in range(r[1], r[3] + 1)
                                for x in range(r[0], r[2] + 1)
                                if mm[y * T.W + x] > 0)
                         for k, r in PROTECTED.items()}}
    # zoom panels: original / clean base / published A / new A / new B / masks
    panels = {
        "01-original-8x.png": (src, "A ORIGINAL x8"),
        "02-clean-base-8x.png": (base_m, "B CLEAN BASE x8"),
        "03-mouth_open-A-published-8x.png": (e2bufs["mouth_open-A"], "C PUBLISHED OPEN x8"),
        "04-mouth_open-A-new-8x.png": (T.read_rgb(BLOCK_B / "03-overlay-mouth_open-A.png"), "D NEW OPEN x8"),
        "05-mouth_smile-A-published-8x.png": (e2bufs["mouth_smile-A"], "E PUBLISHED SMILE x8"),
        "06-mouth_smile-A-new-8x.png": (T.read_rgb(BLOCK_B / "03-overlay-mouth_smile-A.png"), "F NEW SMILE x8"),
    }
    for name, (buf, label) in panels.items():
        p = BLOCK_B / f".buf-{name}.png"
        T.write_rgb(p, buf)
        T.crop_zoom(BLOCK_B / "zoom" / name, p, ZOOM_M, "800%", label)
        p.unlink()
    for name in ("mouth_open-A", "mouth_smile-A"):
        T.run(["convert", BLOCK_B / f"02-mask-{name}.png", "-crop", ZOOM_M,
               "+repage", "-filter", "Point", "-resize", "800%",
               "-colorspace", "sRGB", "-type", "TrueColor",
               "PNG32:" + str(BLOCK_B / "zoom" / f"07-mask-{name}-8x.png")])

    neutral = T.read_rgb(BLOCK_B / "04-neutral-return.png")
    report = {
        "block": "B - mouth",
        "expressions": ["mouth_open-A", "mouth_smile-A"],
        "visualReferenceOnly": "mouth_closed-A (no separate slot / no mask)",
        "method": "one shared manual clean base + two independent fitted soft hybrid mattes",
        "generativeAI": False, "inpainting": False, "generativeFill": False,
        "cleanPolygon": MOUTH_CLEAN, "lensPolygon": MOUTH_LENS,
        "skinAnchors": {"count": len(g["anchors"]["mouth"]),
                        "handCandidatesSkipped": g["skipped"]["mouth"],
                        "coords": [[a[0], a[1]] for a in g["anchors"]["mouth"]]},
        "cleanBasePixelsRepainted": len(g["deltas"]["mouth"][1]),
        "expressions_detail": out,
        "neutralReturnPixelIdenticalToOriginal": neutral == src,
        "protectedZonesCleanBase": {k: T.diff_stats(base_m, src, r)["maxDiff"]
                                    for k, r in PROTECTED.items()},
    }
    T.write_json(BLOCK_B / "block-B-report.json", report)
    return report


# ------------------------------------------------------------------ stage all
def write_stage_all(g, m):
    src = g["src"]
    # base assets
    T.write_rgb(BASE / "00-clean-face-base-full.png", m["full_base"])
    T.write_rgb(BASE / "00-neutral-original.png", src)
    T.write_rgb(BASE / "01-clean-base-eye_l.png", g["pilot_base"])
    T.write_rgb(BASE / "02-clean-base-eye_r.png", m["base_r"])
    T.write_rgb(BASE / "03-clean-base-mouth.png", m["base_m"])

    # four precise masks + four RGBA layers (left eye is the pilot's own)
    for e, alpha in m["masks"].items():
        T.write_gray(MASKS / f"mask-{e}.png", alpha)
        T.write_rgba(LAYERS / f"layer-{e}.png", m["layers"][e])
    shutil.copyfile(SRC_DIR / "element-mouth_closed-A.png",
                    BASE / "visual-reference-mouth_closed-A.png")

    # states + their state bases (for transparent switching documentation)
    manifest_states = {}
    for name, exprs in STATES.items():
        ov, sb, zones = state_overlay(g, m, exprs)
        T.write_rgb(STATE_DIR / f"{name}.png", ov)
        T.write_rgb(STATE_DIR / f"{name}-state-base.png", sb)
        manifest_states[name] = {
            "expressions": exprs, "cleanZones": zones,
            "diffFromOriginal": T.diff_bbox(ov, src),
            "diffFromOwnStateBase": T.diff_bbox(ov, sb),
        }
    T.write_json(STATE_DIR / "switch-matrix.json", {
        "semantics": "neutral = untouched source; each expression is applied to a state base where ONLY its own clean zone(s) are restored; toggling all masks off and restoring all zones returns the byte-identical original.",
        "states": manifest_states})

    # published E2 overlays (solid zone ellipses) for honest comparison
    for e in EXPR:
        published_overlay(SRC_DIR / f"element-{e}.png", g["src_path"],
                          COMPARISON / f"published-E2-{e}-full.png")

    meta = {
        "stage": "E2-FACE-BASE-FULL",
        "parentPilot": "504d1f71f8969c5ea0a2ee235a7c7cab28a5d96d",
        "method": "manual IDW skin reconstruction from real samples + fitted soft hybrid lid/lip lenses",
        "generativeAI": False, "inpainting": False, "generativeFill": False,
        "sourcesAreReadOnlyCopies": True,
        "geometry": {
            "eye_r_clean": EYE_R_CLEAN, "eye_r_lens": EYE_R_LENS,
            "mouth_clean": MOUTH_CLEAN, "mouth_lens": MOUTH_LENS,
            "eye_l_pilot": "reused byte-for-byte from 504d1f7",
        },
        "protectedZones": PROTECTED,
        "zoneRects": ZONE_RECTS,
        "cleanBase": {"eye_l_repainted": len(g["left_changed"]),
                      "eye_l_diffBBox": g["left_bbox"],
                      "eye_r_repainted": len(g["deltas"]["eye_r"][1]),
                      "mouth_repainted": len(g["deltas"]["mouth"][1]),
                      "fullBasePixelsChanged": T.diff_bbox(m["full_base"], src)["changedPixels"]},
        "skinAnchors": {"eye_r": [[a[0], a[1]] for a in g["anchors"]["eye_r"]],
                        "mouth": [[a[0], a[1]] for a in g["anchors"]["mouth"]]},
        "masks": {e: {**T.mask_stats(a), "bbox": T.mask_bbox(a)}
                  for e, a in m["masks"].items()},
        "states": manifest_states,
        "sourceSHA256": {
            "source-frame.webp": T.sha256(g["src_path"]),
            "pilot-clean-base.png": T.sha256(SRC_DIR / "pilot-clean-base.png"),
            "pilot-mask-eye_l_closed-B.png": T.sha256(SRC_DIR / "pilot-mask-eye_l_closed-B.png"),
            "pilot-masked-element-eye_l_closed-B.png": T.sha256(SRC_DIR / "pilot-masked-element-eye_l_closed-B.png"),
            "pilot-overlay-full.png": T.sha256(SRC_DIR / "pilot-overlay-full.png"),
        },
    }
    T.write_json(ROOT / "E2-face-base-full.json", meta)
    return meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--stage", choices=["A", "B", "all"], required=True)
    args = ap.parse_args()
    ensure_dirs()
    g = build_geometry()
    m = build_masks(g)
    if args.stage == "A":
        r = write_block_a(g, m)
        print("BLOCK A OK:", r["mask"], r["seamRMSE"])
    elif args.stage == "B":
        r = write_block_b(g, m)
        print("BLOCK B OK:", {k: v["mask"] for k, v in r["expressions_detail"].items()},
              "neutralReturn=", r["neutralReturnPixelIdenticalToOriginal"])
    else:
        r = write_stage_all(g, m)
        print("STAGE ALL OK:", r["cleanBase"], "states=", len(r["states"]))


if __name__ == "__main__":
    main()
