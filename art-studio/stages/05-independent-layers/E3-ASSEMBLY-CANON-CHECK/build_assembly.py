#!/usr/bin/env python3
"""E3 — HEROINE-01 assembly / canon verification (read-only audit).

This is a VERIFICATION stage, not a rig build and not an art pass.

It reads only committed, approved assets:
  * three original WebP references (MANIFEST.json),
  * stage-04 cutout / alpha / crop-map,
  * E1: 20 contour RGBA layers + layer-map.json + motion-gap diagnostics,
  * E2: approved A/B decision, clean face base, 10 states, 4 mattes / layers,
        E2-FACE-BASE-FULL and E2-EYE-ALIGNMENT-V2 reports.

It writes ONLY inside E3-ASSEMBLY-CANON-CHECK/.  Every output PNG is a
deterministic technical composite, crop, zoom, contact sheet, coordinate
overlay or diagnostic colour-overlay of EXISTING approved pixels.  No
generate_image, no generative AI, no inpainting, no generative fill, no
diffusion, no content-aware tool, no new artistic pixels, no rig/code/atlas
change.  The "assembly" is a static rest-state composite: it proves that
the prepared elements register against the source frame; it does NOT claim
that the 20 slots are independent under motion (E1/E2 known limits remain).

One checker/generator script.  Block-level SHA-256 fixation of all protected
files before/after.  One separate GitHub commit afterwards.  STOP before E4.
"""

import sys
sys.dont_write_bytecode = True

import collections
import hashlib
import json
import math
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STAGE05 = ROOT.parent
ART = STAGE05.parent
REPO = ROOT.parents[3]   # /home/user/Actual-new-clicker-
SRC = ROOT / "source"
ASSEMBLY = ROOT / "assembly"
CMP = ROOT / "comparison"
PANELS = CMP / "panels"
MOBILE = CMP / "mobile"
for d in (ASSEMBLY, CMP, PANELS, MOBILE):
    d.mkdir(parents=True, exist_ok=True)

sys.path.insert(0, str(SRC))
import toolkit as T  # noqa: E402  (reused E2 pilot / V2 low-level procedures)

W, H = T.W, T.H
V2 = SRC / "E2-EYE-ALIGNMENT-V2"
E1_LAYERS = SRC / "layers"
SOLID_BG_HEX = "#2a1e3f"

FACE_CROP = "200x150+340+105"          # 1:1 face, same as E2
FACE_CLOSE_CROP = "220x190+320+90"     # wider face/hair close-up
EYE_CROP = "130x50+355+140"            # both eyes, from E2
MOUTH_CROP = "80x60+385+175"           # mouth, from E2

STATE_MATRIX = json.loads((V2 / "states/switch-matrix.json").read_text(encoding="utf-8"))
STATE_NAMES = list(STATE_MATRIX["states"].keys())
DECISION = json.loads((SRC / "E2-FINAL-DECISION/E2-final-decision.json").read_text(encoding="utf-8"))
E1_MAP = json.loads((SRC / "layer-map.json").read_text(encoding="utf-8"))
CROP_MAP = json.loads((SRC / "crop-map.json").read_text(encoding="utf-8"))
E2_MEAS = json.loads((V2 / "00-measurements.json").read_text(encoding="utf-8"))
E2_VERIFY = json.loads((V2 / "verify-report.json").read_text(encoding="utf-8"))
FULL_VERIFY = json.loads((SRC / "E2-FACE-BASE-FULL/verify-report.json").read_text(encoding="utf-8"))
E1_GAPS = json.loads((SRC / "e1-motion-gaps.json").read_text(encoding="utf-8"))

EXPR_ZONE = {
    "eye_l_closed-B": "eye_l",
    "eye_r_closed-B": "eye_r",
    "mouth_open-A": "mouth",
    "mouth_smile-A": "mouth",
}
ZONE_CLEAN = {
    "eye_l": "01-clean-base-eye_l.png",
    "eye_r": "02-clean-base-eye_r.png",
    "mouth": "03-clean-base-mouth.png",
}
EXPR_MASK = {
    "eye_l_closed-B": "mask-eye_l_closed-B.png",
    "eye_r_closed-B": "mask-eye_r_closed-B-v2.png",
    "mouth_open-A": "mask-mouth_open-A.png",
    "mouth_smile-A": "mask-mouth_smile-A.png",
}
EXPR_LAYER = {
    "eye_l_closed-B": "layer-eye_l_closed-B.png",
    "eye_r_closed-B": "layer-eye_r_closed-B-v2.png",
    "mouth_open-A": "layer-mouth_open-A.png",
    "mouth_smile-A": "layer-mouth_smile-A.png",
}
EXPECTED_GROUPS = {
    1: "backHairGroup", 2: "backHairGroup",
    3: "legGroup", 4: "legGroup",
    5: "bodyRoot",
    6: "armGroup_l", 7: "armGroup_r",
    8: "outfitGroup", 9: "outfitGroup", 10: "outfitGroup",
    11: "outfitGroup", 12: "outfitGroup",
    13: "headGroup",
    14: "faceGroup", 15: "faceGroup", 16: "faceGroup",
    17: "frontHairGroup", 18: "frontHairGroup",
    19: "frontHairGroup", 20: "frontHairGroup",
}
SHIFTS = [
    ("rest", 0, 0),
    ("hair_sway_+10deg_proxy", 12, 0),
    ("hair_sway_-10deg_proxy", -12, 0),
    ("arm_reaction_+25deg_proxy", 10, 6),
    ("arm_reaction_-25deg_proxy", -10, -6),
    ("head_tilt_+12deg_proxy", 6, 8),
    ("head_tilt_-12deg_proxy", -6, -8),
    ("breath_+6deg_proxy", 0, 5),
    ("breath_-6deg_proxy", 0, -5),
]
MAP_SHIFTS = ["rest", "hair_sway_+10deg_proxy", "arm_reaction_+25deg_proxy",
              "head_tilt_+12deg_proxy", "breath_+6deg_proxy"]

CLOSE_CROPS = {
    "head-collar-shoulders": ("360x200+250+220", "300%"),
    "arms-hair": ("260x340+90+320", "300%"),
    "skirt-hem": ("360x180+250+540", "300%"),
    "legs-shoes": ("520x160+170+640", "200%"),
    "ear-front-hair": ("120x120+430+120", "600%"),
    "ribbon": ("120x200+370+290", "400%"),
    "lacunae-shoulders": ("200x120+190+330", "500%"),
    "eyes": ("130x50+355+140", "800%"),
    "mouth": ("80x60+385+175", "800%"),
}

SHEET_NAMES = [
    "00-canon-references.png", "01-full-assembly-neutral-1x.png",
    "02-original-vs-E1-vs-E2-neutral-50pct.png", "03-all-10-states-25pct.png",
    "04-face-states-contact-1x.png", "05-layer-order-contact.png",
    "06-anchors-pivots-overlay.png", "07-alignment-grid.png",
    "08-motion-gaps-rest-vs-proxies.png", "09-baked-lacunae-map.png",
    "10-closeup-face-neutral-vs-both-closed.png", "11-closeup-eyes-8x.png",
    "12-closeup-mouth-8x.png", "13-closeup-head-collar-shoulders.png",
    "14-closeup-arms-hair.png", "15-closeup-skirt-hem.png",
    "16-closeup-legs-shoes.png", "17-closeup-ear-front-hair.png",
    "18-closeup-ribbon.png", "19-closeup-lacunae-shoulders.png",
    "20-matte-intersection-overlay.png",
]

SHORT_STATE = {
    "00-neutral": "00 neutral",
    "01-eye_l_closed-B": "01 left eye closed B",
    "02-eye_r_closed-B": "02 right eye closed B",
    "03-mouth_open-A": "03 mouth open A",
    "04-mouth_smile-A": "04 mouth smile A",
    "05-both-eyes-closed": "05 both eyes closed",
    "06-both-eyes-closed-smile": "06 both + smile",
    "07-mouth_open-both-eyes-closed": "07 open + both",
    "08-eye_l_closed-smile": "08 left + smile",
    "09-eye_r_closed-mouth_open": "09 right + open",
}
SHORT_SHIFT = {
    "rest": "rest",
    "hair_sway_+10deg_proxy": "hair ±10° proxy",
    "arm_reaction_+25deg_proxy": "arm ±25° proxy",
    "head_tilt_+12deg_proxy": "head ±12° proxy",
    "breath_+6deg_proxy": "breath ±6° proxy",
}


# --------------------------------------------------------------- low-level helpers
def rgba_channels(buf):
    rgb = bytes(v for p in range(W * H) for v in buf[p * 4:p * 4 + 3])
    alpha = bytes(buf[p * 4 + 3] for p in range(W * H))
    return rgb, alpha


def solid_bg(color):
    return bytes(color) * (W * H)


def green(v):
    return v[1] > v[0] * 1.15 and v[1] > v[2] * 1.05 and v[1] > 65


def green_centroid(buf, x0, x1, y0=150, y1=178):
    pts = [(x, y) for y in range(y0, y1) for x in range(x0, x1)
           if green(buf[(y * W + x) * 3:(y * W + x) * 3 + 3])]
    return {"centroidY": round(sum(y for x, y in pts) / len(pts), 3) if pts else None,
            "greenPixels": len(pts)}


def lid_centroid_state(buf, x0, x1, y0, y1):
    rows = {y: sum(1 for x in range(x0, x1)
                   if T.lum(*tuple(buf[(y * W + x) * 3:(y * W + x) * 3 + 3])) < 112)
            for y in range(y0, y1)}
    peak = max(rows, key=lambda y: rows[y])
    pts = [(x, y) for y in range(peak - 3, peak + 4) for x in range(x0, x1)
           if y0 <= y < y1 and
           T.lum(*tuple(buf[(y * W + x) * 3:(y * W + x) * 3 + 3])) < 112]
    return {"peakRow": peak, "peakDarkPixels": rows[peak],
            "centroidY": round(sum(y for x, y in pts) / len(pts), 3) if pts else None,
            "darkPixelsInBand": len(pts)}


def write_tmp_rgb(name, buf):
    p = ROOT / f".tmp-{name}.png"
    T.write_rgb(p, buf)
    return p


def panel_from_buf(path, buf, crop, scale):
    tmp = write_tmp_rgb(path.stem, buf)
    T.crop_zoom(path, tmp, crop, scale)   # caption is supplied by sheet()
    tmp.unlink(missing_ok=True)
    return path


def sheet(name, panels, cols=2, mobile=True):
    out = CMP / name
    T.sheet(out, panels, cols=cols)
    w = int(T.run(["identify", "-format", "%w", str(out)]).decode().strip())
    if mobile:
        if len(panels) > 1:
            widths = [int(T.run(["identify", "-format", "%w", str(src)]).decode().strip())
                      for src, _label in panels]
            if max(widths) > 600:
                small = []
                for i, (src, label) in enumerate(panels):
                    tmp = PANELS / f".tmp-mobile-{name}-{i}.png"
                    T.run(["convert", str(src), "-filter", "Point", "-resize", "50%",
                           "PNG32:" + str(tmp)])
                    small.append((tmp, label))
                T.sheet(MOBILE / name, small, cols=1)
                for tmp, _label in small:
                    tmp.unlink(missing_ok=True)
            else:
                T.sheet(MOBILE / name, panels, cols=1)
        else:
            T.run(["convert", str(out), "-filter", "Point", "-resize", "50%",
                   str(MOBILE / name)])
    return w


def unique_colors(path):
    return int(T.run(["identify", "-format", "%k", str(path)]).decode().strip())


def intersection_overlay(I, neutral):
    """Red = E2 matte ∩ E1 front-hair alpha; cyan = two mouth mattes overlap; yellow = both."""
    front = bytearray(W * H)
    for s in I["e1"]:
        if s["z"] >= 17:
            for p in range(W * H):
                if s["alpha"][p] > 0:
                    front[p] = 1
    hair = bytearray(W * H)
    for mask in I["e2_masks"].values():
        for p in range(W * H):
            if mask[p] > 0 and front[p]:
                hair[p] = 1
    mouth = bytearray(W * H)
    a, b = I["e2_masks"]["mouth_open-A"], I["e2_masks"]["mouth_smile-A"]
    for p in range(W * H):
        if a[p] > 0 and b[p] > 0:
            mouth[p] = 1
    both = sum(1 for p in range(W * H) if hair[p] and mouth[p])
    out = bytearray(neutral)
    for p in range(W * H):
        if hair[p] and mouth[p]:
            col = (255, 220, 0)
        elif hair[p]:
            col = (255, 40, 40)
        elif mouth[p]:
            col = (0, 220, 255)
        else:
            continue
        out[p * 3:p * 3 + 3] = bytes(col)
    return bytes(out), {
        "frontHairMatteOverlapPx": sum(hair),
        "mouthMaskOverlapPx": sum(mouth),
        "bothOverlapPx": both,
        "legend": "red = expression matte ∩ E1 front hair (z17..20); cyan = mouth_open ∩ mouth_smile; yellow = both",
    }


# --------------------------------------------------------------- input loading
def load_inputs():
    src = T.read_rgb(SRC / "IMG_4038_rig-pose.webp")
    cut = T.read_rgba(SRC / "work-cutout.png")
    cut_rgb, cut_alpha = rgba_channels(cut)
    solid = solid_bg(tuple(src[:3]))
    e1 = []
    for s in sorted(E1_MAP["slots"], key=lambda x: x["z"]):
        b = T.read_rgba(E1_LAYERS / Path(s["file"]).name)
        rgb, alpha = rgba_channels(b)
        e1.append({"z": s["z"], "slot": s["slot"], "group": s["group"],
                   "tightRect": s["tightRect"], "pivotAbsolute": s["pivotAbsolute"],
                   "pivotLocal": s["pivotLocal"], "states": s.get("states", []),
                   "opaquePixels": s["opaquePixels"], "knownLimit": s.get("knownLimit", ""),
                   "rgb": rgb, "alpha": alpha})
    crop_slots = {s["z"]: s for s in CROP_MAP["slots"]}
    e2_states = {n: T.read_rgb(V2 / "states" / f"{n}.png") for n in STATE_NAMES}
    e2_masks = {e: T.read_gray(V2 / "masks" / f) for e, f in EXPR_MASK.items()}
    e2_layers = {}
    for e, f in EXPR_LAYER.items():
        b = T.read_rgba(V2 / "layers" / f)
        e2_layers[e] = rgba_channels(b)[0]
    clean = {z: T.read_rgb(V2 / "base" / f) for z, f in ZONE_CLEAN.items()}
    return {"src": src, "cut": cut, "cut_rgb": cut_rgb, "cut_alpha": cut_alpha,
            "solid": solid, "bg_color": tuple(src[:3]), "e1": e1,
            "crop_slots": crop_slots, "e2_states": e2_states,
            "e2_masks": e2_masks, "e2_layers": e2_layers, "clean": clean}


# --------------------------------------------------------------- geometry audit
def geometry_report(I):
    rows = []
    for s in I["e1"]:
        z = s["z"]
        cr = I["crop_slots"][z]["rect"]
        tr = s["tightRect"]
        alpha = s["alpha"]
        xs, ys = [], []
        for p in range(W * H):
            if alpha[p] > 0:
                y, x = divmod(p, W)
                xs.append(x); ys.append(y)
        bbox = [min(xs), min(ys), max(xs), max(ys)] if xs else None
        outside = 0
        for p in range(W * H):
            if alpha[p] > 0:
                y, x = divmod(p, W)
                if not (cr["x"] <= x <= cr["x"] + cr["w"] - 1 and
                        cr["y"] <= y <= cr["y"] + cr["h"] - 1):
                    outside += 1
        pl_ok = (s["pivotAbsolute"]["x"] - tr["x"] == s["pivotLocal"]["x"] and
                 s["pivotAbsolute"]["y"] - tr["y"] == s["pivotLocal"]["y"])
        rows.append({
            "z": z, "slot": s["slot"], "group": s["group"],
            "cropRect": cr, "tightRect": tr, "alphaBbox": bbox,
            "tightRectEqualsAlphaBbox": bbox == [tr["x"], tr["y"],
                                                 tr["x"] + tr["w"] - 1,
                                                 tr["y"] + tr["h"] - 1],
            "pivotAbsolute": s["pivotAbsolute"], "pivotLocal": s["pivotLocal"],
            "pivotLocalConsistent": pl_ok,
            "anchor": [round(s["pivotLocal"]["x"] / tr["w"], 4),
                       round(s["pivotLocal"]["y"] / tr["h"], 4)],
            "anchorOutside0to1": (s["pivotLocal"]["x"] / tr["w"] < 0 or
                                  s["pivotLocal"]["x"] / tr["w"] > 1 or
                                  s["pivotLocal"]["y"] / tr["h"] < 0 or
                                  s["pivotLocal"]["y"] / tr["h"] > 1),
            "states": s["states"], "opaquePixels": s["opaquePixels"],
            "opaquePixelsOutsideCropRect": outside,
            "tightInsideCropRect": (tr["x"] >= cr["x"] and tr["y"] >= cr["y"] and
                                    tr["x"] + tr["w"] <= cr["x"] + cr["w"] and
                                    tr["y"] + tr["h"] <= cr["y"] + cr["h"]),
            "knownLimit": s["knownLimit"],
        })
    T.write_json(ROOT / "geometry-report.json", {
        "source": "layer-map.json (E1) + crop-map.json (stage 04) + ANIMATION-SPEC.md §3",
        "canvas": [W, H], "graphicSlots": len(rows),
        "zContinuous": [r["z"] for r in rows] == list(range(1, 21)),
        "groupsMatchSpec": all(r["group"] == EXPECTED_GROUPS[r["z"]] for r in rows),
        "allLayersFullFrame": True,
        "e2ExpressionAssets": {
            "note": "E2-V2 expression layers/mattes are full-frame 848x1264 technical assets, "
                    "not tight slot rects; all four share the same canvas and coordinate system.",
            "files": sorted([p.name for p in (V2 / "layers").glob("*.png")] +
                           [p.name for p in (V2 / "masks").glob("*.png")]),
        },
        "slots": rows,
    })
    return rows


# --------------------------------------------------------------- composites
def build_assembly(I):
    src = I["src"]
    # ascending z over the original frame used as canon backdrop
    asc = src
    for s in I["e1"]:
        asc, _ = T.composite(asc, s["rgb"], s["alpha"])
    T.write_rgb(ASSEMBLY / "00-canon-background.png", src)
    T.write_rgb(ASSEMBLY / "01-E1-over-canon-background.png", asc)
    solid_comp = I["solid"]
    for s in I["e1"]:
        solid_comp, _ = T.composite(solid_comp, s["rgb"], s["alpha"])
    T.write_rgb(ASSEMBLY / "02-E1-over-solid-background.png", solid_comp)
    desc = src
    for s in reversed(I["e1"]):
        desc, _ = T.composite(desc, s["rgb"], s["alpha"])
    T.write_gray(ASSEMBLY / "03-E1-cutout-alpha.png", I["cut_alpha"])

    # union of all E2-V2 state diff bboxes -> minimal replacement rect
    boxes = []
    for n in STATE_NAMES:
        b = T.diff_bbox(I["e2_states"][n], src)["bbox"]
        if b:
            boxes.append(b)
    x0 = max(0, min(b[0] for b in boxes) - 8)
    y0 = max(0, min(b[1] for b in boxes) - 8)
    x1 = min(W - 1, max(b[2] for b in boxes) + 8)
    y1 = min(H - 1, max(b[3] for b in boxes) + 8)
    diff_rect = (x0, y0, x1, y1)
    replace_mask = bytearray(W * H)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            replace_mask[y * W + x] = I["cut_alpha"][y * W + x]

    states = {}
    face_panels = {}
    close_panels = {}
    for n in STATE_NAMES:
        buf, _ = T.composite(asc, I["e2_states"][n], bytes(replace_mask))
        T.write_rgb(ASSEMBLY / f"state-{n}.png", buf)
        states[n] = buf
        face_panels[n] = panel_from_buf(
            PANELS / f"face-{n}-1x.png", buf, FACE_CROP, "100%")
        close_panels[n] = panel_from_buf(
            PANELS / f"faceclose-{n}-4x.png", buf, FACE_CLOSE_CROP, "400%")
    return {"asc": asc, "solid_comp": solid_comp, "desc": desc,
            "diff_rect": diff_rect, "replace_mask": bytes(replace_mask),
            "states": states, "face_panels": face_panels,
            "close_panels": close_panels}


# --------------------------------------------------------------- motion gaps + lacunae
def build_gap_maps(I):
    sil = [p for p in range(W * H) if I["cut_alpha"][p] >= 128]
    layer_px = []
    for s in I["e1"]:
        layer_px.append((s["z"], s["slot"],
                         [(p, s["alpha"][p]) for p in range(W * H) if s["alpha"][p] > 0]))
    results = []
    maps = {}
    base, _ = T.composite(I["solid"], I["cut_rgb"], I["cut_alpha"])
    for name, dx, dy in SHIFTS:
        cov = bytearray(W * H)
        for _z, _slot, px in layer_px:
            for i, a in px:
                y, x = divmod(i, W)
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H:
                    j = ny * W + nx
                    if a > cov[j]:
                        cov[j] = a
        gaps = sum(1 for p in sil if cov[p] == 0)
        results.append({"shift": name, "dx": dx, "dy": dy,
                        "gapPixels": gaps, "gapRatio": round(gaps / len(sil), 6)})
        if name in MAP_SHIFTS:
            buf = bytearray(base)
            for p in sil:
                if cov[p] == 0:
                    buf[p * 3:p * 3 + 3] = bytes((255, 40, 40))
            full = PANELS / f"motion-{name}-full.png"
            T.write_rgb(full, bytes(buf))
            small = PANELS / f"motion-{name}-25.png"
            T.run(["convert", str(full), "-filter", "Point", "-resize", "25%",
                   "PNG32:" + str(small)])
            maps[name] = {"full": full, "small": small}
    # row-background-coloured opaque pixels (locked lacunae / deep shadow)
    lac = bytearray(W * H)
    for y in range(H):
        bg = I["src"][y * W * 3:y * W * 3 + 3]
        for x in range(W):
            p = y * W + x
            if I["cut_alpha"][p] >= 128:
                c = I["cut"][p * 4:p * 4 + 3]
                if max(abs(c[0] - bg[0]), abs(c[1] - bg[1]), abs(c[2] - bg[2])) <= 10:
                    lac[p] = 1
    seen = bytearray(W * H)
    comps = []
    for p in range(W * H):
        if lac[p] and not seen[p]:
            q = collections.deque([p]); seen[p] = 1; pts = []
            while q:
                i = q.popleft(); pts.append(i)
                y, x = divmod(i, W)
                for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < H and 0 <= nx < W:
                        j = ny * W + nx
                        if lac[j] and not seen[j]:
                            seen[j] = 1; q.append(j)
            xs = [i % W for i in pts]; ys = [i // W for i in pts]
            comps.append({"pixels": len(pts), "bbox": [min(xs), min(ys), max(xs), max(ys)]})
    comps.sort(key=lambda c: c["pixels"], reverse=True)
    lac_buf = bytearray(base)
    for p in range(W * H):
        if lac[p]:
            lac_buf[p * 3:p * 3 + 3] = bytes((255, 40, 40))
    T.write_rgb(PANELS / "lacunae-full.png", bytes(lac_buf))
    T.write_rgb(CMP / "09-baked-lacunae-map.png", bytes(lac_buf))
    T.run(["convert", str(CMP / "09-baked-lacunae-map.png"), "-resize", "50%",
           str(MOBILE / "09-baked-lacunae-map.png")])
    return {"silhouettePixels": len(sil), "results": results, "maps": maps,
            "lacunae": {"opaqueRowBgPixels": sum(lac), "components": len(comps),
                        "largest": comps[:8], "bboxAll": [
                            min(c["bbox"][0] for c in comps),
                            min(c["bbox"][1] for c in comps),
                            max(c["bbox"][2] for c in comps),
                            max(c["bbox"][3] for c in comps)] if comps else None}}


# --------------------------------------------------------------- switching (assembly level)
def switching(I, A):
    src = I["src"]
    changed = {z: {p for p in range(W * H)
                   if any(I["clean"][z][p * 3 + k] != src[p * 3 + k] for k in range(3))}
               for z in ZONE_CLEAN}
    def zone_owned(zone):
        owned = set(changed[zone])
        for e, a in I["e2_masks"].items():
            if EXPR_ZONE[e] == zone:
                owned.update(p for p in range(W * H) if a[p] > 0)
        return owned
    def switch_apply(buf, zone, expr):
        out = bytearray(buf)
        for p in zone_owned(zone):
            i = p * 3; out[i:i + 3] = src[i:i + 3]
        for p in changed[zone]:
            i = p * 3; out[i:i + 3] = I["clean"][zone][i:i + 3]
        out, _ = T.composite(bytes(out), I["e2_layers"][expr], I["e2_masks"][expr])
        return bytes(out)
    def switch_remove(buf, zone):
        out = bytearray(buf)
        for p in zone_owned(zone):
            i = p * 3; out[i:i + 3] = src[i:i + 3]
        return bytes(out)
    S = A["states"]
    sw = {}
    sw["neutral_is_original"] = (S["00-neutral"] == src)
    sw["neutral_apply_eye_l_equals_state01"] = (
        switch_apply(S["00-neutral"], "eye_l", "eye_l_closed-B") == S["01-eye_l_closed-B"])
    sw["neutral_apply_eye_r_equals_state02"] = (
        switch_apply(S["00-neutral"], "eye_r", "eye_r_closed-B") == S["02-eye_r_closed-B"])
    sw["state01_apply_eye_r_equals_state05"] = (
        switch_apply(S["01-eye_l_closed-B"], "eye_r", "eye_r_closed-B") == S["05-both-eyes-closed"])
    sw["state05_remove_eye_r_equals_state01"] = (
        switch_remove(S["05-both-eyes-closed"], "eye_r") == S["01-eye_l_closed-B"])
    sw["state05_remove_eye_l_equals_state02"] = (
        switch_remove(S["05-both-eyes-closed"], "eye_l") == S["02-eye_r_closed-B"])
    sw["neutral_apply_mouth_open_equals_state03"] = (
        switch_apply(S["00-neutral"], "mouth", "mouth_open-A") == S["03-mouth_open-A"])
    sw["state03_replace_with_smile_equals_state04"] = (
        switch_apply(S["03-mouth_open-A"], "mouth", "mouth_smile-A") == S["04-mouth_smile-A"])
    sw["state03_remove_mouth_equals_neutral"] = (
        switch_remove(S["03-mouth_open-A"], "mouth") == S["00-neutral"])
    sw["state05_apply_smile_equals_state06"] = (
        switch_apply(S["05-both-eyes-closed"], "mouth", "mouth_smile-A") ==
        S["06-both-eyes-closed-smile"])
    sw["state02_apply_mouth_open_equals_state09"] = (
        switch_apply(S["02-eye_r_closed-B"], "mouth", "mouth_open-A") ==
        S["09-eye_r_closed-mouth_open"])
    z6 = S["06-both-eyes-closed-smile"]
    for z in ("eye_l", "eye_r", "mouth"):
        z6 = switch_remove(z6, z)
    sw["state06_remove_all_equals_neutral"] = (z6 == S["00-neutral"])
    sw["all_10_states_equal_approved_e2_files"] = all(
        S[n] == I["e2_states"][n] for n in STATE_NAMES)
    return {"checks": sw, "changed": {z: len(v) for z, v in changed.items()},
            "owned": {z: len(zone_owned(z)) for z in ZONE_CLEAN}}


# --------------------------------------------------------------- visual sheets
def make_all_sheets(I, A, G):
    src = I["src"]
    neutral = A["states"]["00-neutral"]
    both = A["states"]["05-both-eyes-closed"]
    solid_comp = A["solid_comp"]

    # 00 canon references: scaled to equal height, technical resize only
    ref_panels = []
    for fn, cap in [("IMG_4036_style-reference.webp", "A  IMG_4036 — манера / канон"),
                    ("IMG_4037_campus-outfit.webp", "B  IMG_4037 — campus / канон"),
                    ("IMG_4038_rig-pose.webp", "C  IMG_4038 — геометрия позы")]:
        p = PANELS / f"canon-{fn}.png"
        T.run(["convert", str(SRC / fn), "-resize", "x600", "-alpha", "off",
               "PNG32:" + str(p)])
        ref_panels.append((p, cap))
    sheet("00-canon-references.png", ref_panels, cols=2)

    # 01 neutral full assembly, 1:1
    p1 = PANELS / "full-neutral-1x.png"
    T.write_rgb(p1, neutral)
    sheet("01-full-assembly-neutral-1x.png", [(p1, "A  НЕЙТРАЛЬ: общая сборка 1:1")], cols=1)

    # 02 original / E1 cutout / E2 neutral, 50%
    a = panel_from_buf(PANELS / "orig-50.png", src, f"{W}x{H}+0+0", "50%")
    b = panel_from_buf(PANELS / "e1-solid-50.png", solid_comp, f"{W}x{H}+0+0", "50%")
    c = panel_from_buf(PANELS / "e2-neutral-50.png", neutral, f"{W}x{H}+0+0", "50%")
    sheet("02-original-vs-E1-vs-E2-neutral-50pct.png",
          [(a, "A  ОРИГИНАЛ IMG_4038"), (b, "B  E1: 20 слоёв на тёмном фоне"),
           (c, "C  E2-V2: нейтральная сборка")], cols=2)

    # 03 all 10 states, 25%
    st_panels = []
    for n in STATE_NAMES:
        p = PANELS / f"state-{n}-25.png"
        T.run(["convert", str(ASSEMBLY / f"state-{n}.png"), "-filter", "Point",
               "-resize", "25%", "PNG32:" + str(p)])
        st_panels.append((p, SHORT_STATE[n]))
    sheet("03-all-10-states-25pct.png", st_panels, cols=2)

    # 04 face contact 1:1
    sheet("04-face-states-contact-1x.png",
          [(A["face_panels"][n], SHORT_STATE[n]) for n in STATE_NAMES], cols=2)

    # 05 20 isolated layers in z-order
    layer_panels = []
    for s in I["e1"]:
        tmp = write_tmp_rgb(f"layer-{s['z']}", bytes(
            T.composite(I["solid"], s["rgb"], s["alpha"])[0]))
        tr = s["tightRect"]
        p = PANELS / f"layer-z{s['z']:02d}.png"
        T.run(["convert", str(tmp), "-crop", f"{tr['w']}x{tr['h']}+{tr['x']}+{tr['y']}",
               "+repage", "-filter", "Point", "-resize", "180x180",
               "-gravity", "center", "-background", SOLID_BG_HEX, "-extent", "180x180",
               "PNG32:" + str(p)])
        tmp.unlink(missing_ok=True)
        layer_panels.append((p, f"z{s['z']:02d} {s['slot']}"))
    sheet("05-layer-order-contact.png", layer_panels, cols=4)

    # 06 pivots overlay
    tmp = write_tmp_rgb("pivots", neutral)
    args = ["convert", str(tmp), "-gravity", "NorthWest", "-strokewidth", "2"]
    for s in I["e1"]:
        x, y = s["pivotAbsolute"]["x"], s["pivotAbsolute"]["y"]
        args += ["-stroke", "#00e5ff", "-fill", "none",
                 "-draw", f"circle {x},{y} {x+5},{y}",
                 "-draw", f"line {x-9},{y} {x+9},{y}",
                 "-draw", f"line {x},{y-9} {x},{y+9}"]
    args += ["-stroke", "none", "-fill", "rgba(255,255,255,0.9)",
             "-draw", "rectangle 4,4 700,36",
             "-fill", T.INK, "-font", T.FONT, "-pointsize", "15",
             "-annotate", "+8+8", "20 pivots / anchor = pivotLocal / tightRect; exact table: geometry-report.json",
             "PNG32:" + str(CMP / "06-anchors-pivots-overlay.png")]
    T.run(args)
    tmp.unlink(missing_ok=True)
    T.run(["convert", str(CMP / "06-anchors-pivots-overlay.png"), "-resize", "50%",
           str(MOBILE / "06-anchors-pivots-overlay.png")])

    # 07 alignment grid + critical rects
    tmp = write_tmp_rgb("grid", neutral)
    args = ["convert", str(tmp), "-gravity", "NorthWest", "-strokewidth", "1"]
    for x in range(0, W, 100):
        args += ["-stroke", "rgba(255,255,255,0.35)", "-draw", f"line {x},0 {x},{H}"]
    for y in range(0, H, 100):
        args += ["-stroke", "rgba(255,255,255,0.35)", "-draw", f"line 0,{y} {W},{y}"]
    args += ["-stroke", "#00e5ff", "-strokewidth", "2", "-draw", f"line 424,0 424,{H}"]
    crit = [
        ("head", (322, 95, 206, 177), "#00ff88"),
        ("collar/neck", (308, 240, 232, 152), "#ffcc00"),
        ("shoulders/arms", (100, 325, 648, 340), "#ff66cc"),
        ("skirt seam", (268, 562, 314, 30), "#ff3300"),
        ("legs/hem", (185, 656, 478, 120), "#66aaff"),
        ("face", (340, 105, 200, 150), "#ffffff"),
    ]
    for label, (x, y, w, h), col in crit:
        args += ["-stroke", col, "-strokewidth", "2", "-fill", "none",
                 "-draw", f"rectangle {x},{y} {x+w},{y+h}",
                 "-stroke", "none", "-fill", "rgba(255,255,255,0.88)",
                 "-draw", f"rectangle {x},{y-18} {x+150},{y}",
                 "-fill", T.INK, "-font", T.FONT, "-pointsize", "12",
                 "-annotate", f"+{x+3}+{y-15}", label]
    args += ["-stroke", "none", "-fill", "rgba(255,255,255,0.9)",
             "-draw", "rectangle 4,4 470,34", "-fill", T.INK, "-font", T.FONT,
             "-pointsize", "15", "-annotate", "+8+8", "Сетка 100 px; ось x=424; критические стыки",
             "PNG32:" + str(CMP / "07-alignment-grid.png")]
    T.run(args)
    tmp.unlink(missing_ok=True)
    T.run(["convert", str(CMP / "07-alignment-grid.png"), "-resize", "50%",
           str(MOBILE / "07-alignment-grid.png")])

    # 08 motion gaps rest vs proxies
    sheet("08-motion-gaps-rest-vs-proxies.png",
          [(G["maps"][n]["small"], SHORT_SHIFT[n]) for n in MAP_SHIFTS], cols=2)

    # 10 face neutral vs both closed, 4x close-up
    sheet("10-closeup-face-neutral-vs-both-closed.png",
          [(A["close_panels"]["00-neutral"], "A  НЕЙТРАЛЬ ×4"),
           (A["close_panels"]["05-both-eyes-closed"], "B  ОБА ГЛАЗА ЗАКРЫТЫ ×4")], cols=1)

    # 11 eyes 8x neutral vs both closed
    a = panel_from_buf(PANELS / "eyes-neutral-8x.png", neutral, EYE_CROP, "800%")
    b = panel_from_buf(PANELS / "eyes-both-8x.png", both, EYE_CROP, "800%")
    sheet("11-closeup-eyes-8x.png",
          [(a, "A  НЕЙТРАЛЬ: открытые глаза ×8"),
           (b, "B  УТВЕРЖДЁННЫЕ закрытые веки ×8")], cols=1)

    # 12 mouth 8x neutral vs open
    a = panel_from_buf(PANELS / "mouth-neutral-8x.png", neutral, MOUTH_CROP, "800%")
    b = panel_from_buf(PANELS / "mouth-open-8x.png", A["states"]["03-mouth_open-A"], MOUTH_CROP, "800%")
    sheet("12-closeup-mouth-8x.png",
          [(a, "A  НЕЙТРАЛЬ ×8"), (b, "B  mouth_open-A ×8")], cols=1)

    # problem-area close-ups: rest vs motion / lacunae overlay
    def close_sheet(num, key, buf_rest, buf_alt, cap_rest, cap_alt):
        crop, scale = CLOSE_CROPS[key]
        a = panel_from_buf(PANELS / f"close-{num}a.png", buf_rest, crop, scale)
        b = panel_from_buf(PANELS / f"close-{num}b.png", buf_alt, crop, scale)
        sheet(f"{num}-closeup-{key}.png", [(a, cap_rest), (b, cap_alt)], cols=1)

    close_sheet(13, "head-collar-shoulders", neutral, T.read_rgb(G["maps"]["arm_reaction_+25deg_proxy"]["full"]),
                "A  ПОКОЙ: голова / воротник / плечи ×3",
                "B  ПРОКСИ ±25°: красным — щели ×3")
    close_sheet(14, "arms-hair", neutral, T.read_rgb(G["maps"]["hair_sway_+10deg_proxy"]["full"]),
                "A  ПОКОЙ: руки под прядями ×3",
                "B  ПРОКСИ ±10° волос: красным — щели ×3")
    close_sheet(15, "skirt-hem", neutral, T.read_rgb(G["maps"]["breath_+6deg_proxy"]["full"]),
                "A  ПОКОЙ: стык skirt_01/02 и подол ×3",
                "B  ПРОКСИ дыхания: красным — щели ×3")
    close_sheet(16, "legs-shoes", neutral, T.read_rgb(G["maps"]["head_tilt_+12deg_proxy"]["full"]),
                "A  ПОКОЙ: ноги / чулки / обувь ×2",
                "B  ПРОКСИ наклона головы: красным — щели ×2")
    close_sheet(17, "ear-front-hair", neutral, both,
                "A  НЕЙТРАЛЬ: ухо / лицевая прядь ×6",
                "B  ОБА ГЛАЗА ЗАКРЫТЫ: ухо / прядь ×6")
    close_sheet(18, "ribbon", neutral, T.read_rgb(G["maps"]["rest"]["full"]),
                "A  НЕЙТРАЛЬ: лента / блузка ×4",
                "B  КАРТА ПОКРЫТИЯ: лента / блузка ×4")
    lac_full = T.read_rgb(PANELS / "lacunae-full.png")
    close_sheet(19, "lacunae-shoulders", solid_comp, lac_full,
                "A  E1 НА ТЁМНОМ ФОНЕ: плечевые клинья ×5",
                "B  КРАСНЫМ: фоново-окрашенные непрозрачные px ×5")

    # 20 technical matte / front-hair intersections (honest overlay, not a fix)
    ov, _counts = intersection_overlay(I, neutral)
    a = panel_from_buf(PANELS / "intersection-neutral-4x.png", neutral,
                       FACE_CLOSE_CROP, "400%")
    b = panel_from_buf(PANELS / "intersection-overlay-4x.png", ov,
                       FACE_CLOSE_CROP, "400%")
    sheet("20-matte-intersection-overlay.png",
          [(a, "A  НЕЙТРАЛЬ: лицо / пряди ×4"),
           (b, "B  КРАСНЫЙ: маска ∩ передние пряди; ГОЛУБОЙ: маски рта; ЖЁЛТЫЙ: обе зоны ×4")],
          cols=1)

    # extra eye/mouth close-ups from the dedicated crops are already 11/12
    return True


# --------------------------------------------------------------- verification
def verify(I, A, G, geo, sw):
    src = I["src"]
    S = A["states"]
    checks = {}
    def chk(k, ok, detail=None):
        checks[k] = {"pass": bool(ok), "detail": detail}

    # protected fixation
    before = {}
    for line in (SRC / "protected-SHA256-before.txt").read_text(encoding="utf-8").splitlines():
        h, rel = line.split("  ", 1)
        before[rel] = h
    bad = [rel for rel, h in before.items()
           if not (REPO / rel).exists() or
           hashlib.sha256((REPO / rel).read_bytes()).hexdigest() != h]
    chk("protected_files_unchanged", not bad,
        {"checked": len(before), "changed": bad[:10], "totalChanged": len(bad)})

    # source copies are byte-identical to committed originals
    copy_bad = []
    for p in sorted(SRC.rglob("*")):
        if not p.is_file() or p.name in ("protected-SHA256-before.txt", "toolkit.py"):
            continue
        rel = str(p.relative_to(SRC))
        # map back to repo path via the known snapshot entries where possible
        candidates = [r for r in before if r.endswith("/" + p.name) or r.endswith(rel)]
        if candidates:
            ok = any(hashlib.sha256(p.read_bytes()).hexdigest() == before[r] for r in candidates)
            if not ok:
                copy_bad.append(rel)
    chk("source_copies_byte_identical", not copy_bad,
        {"checked": "snapshot-matched files", "mismatched": copy_bad[:10]})

    # geometry
    chk("20_graphic_slots_z1_to_z20", [r["z"] for r in geo] == list(range(1, 21)),
        {"slots": len(geo)})
    chk("groups_match_animation_spec", all(r["group"] == EXPECTED_GROUPS[r["z"]] for r in geo), None)
    chk("pivotLocal_consistent_for_all_slots", all(r["pivotLocalConsistent"] for r in geo), None)
    chk("all_e1_layers_full_frame_848x1264",
        all(T.run(["identify", "-format", "%wx%h",
                   str(E1_LAYERS / Path(s["file"]).name)]).decode().strip() == "848x1264"
            for s in E1_MAP["slots"]), None)
    chk("all_e2_expression_assets_full_frame_848x1264",
        all(T.run(["identify", "-format", "%wx%h", str(p)]).decode().strip() == "848x1264"
            for p in list((V2 / "layers").glob("*.png")) + list((V2 / "masks").glob("*.png"))), None)
    outside = {r["slot"]: r["opaquePixelsOutsideCropRect"] for r in geo}
    chk("geometry_out_of_crop_pixels_recorded", True,
        {"note": "E1 tightRect is a contour bbox, stage-04 rect is a preliminary window; differences are disclosed, not silently fixed",
         "maxOutside": max(outside.values()), "slotsWithOutside": sum(1 for v in outside.values() if v > 0),
         "outsideBySlot": outside})
    neg = [r["slot"] for r in geo if r["anchorOutside0to1"]]
    chk("anchors_outside_0_to_1_documented", True,
        {"slots": neg, "count": len(neg),
         "note": "pivots above/left of tightRect are anatomical; rig integration must handle negative anchors"})

    # E1 composite / z-order / coverage
    chk("e1_ascending_z_composite_equals_source", A["asc"] == src,
        {"changedPixels": T.diff_bbox(A["asc"], src)["changedPixels"]})
    chk("reverse_z_order_identical_confirms_disjoint_masks", A["desc"] == src,
        {"changedPixels": T.diff_bbox(A["desc"], src)["changedPixels"],
         "note": "E1 contour masks are a disjoint partition of the silhouette, so swapping draw order in rest does not change pixels. Declared z0..20 order is checked against ANIMATION-SPEC.md §3, but true occlusion under motion is NOT demonstrated."})
    sil = [p for p in range(W * H) if I["cut_alpha"][p] >= 128]
    cover = bytearray(W * H)
    for s in I["e1"]:
        for p in range(W * H):
            if s["alpha"][p] > 0:
                cover[p] += 1
    overlap = sum(1 for p in range(W * H) if cover[p] > 1)
    gaps_rest = sum(1 for p in sil if cover[p] == 0)
    chk("e1_rest_coverage_100_percent_and_zero_overlap",
        overlap == 0 and gaps_rest == 0,
        {"silhouettePixels": len(sil), "coveredByAnyLayer": len(sil) - gaps_rest,
         "restGaps": gaps_rest, "overlapPixels": overlap})
    chk("e1_motion_gaps_recomputed_match_published_proxy",
        all(any(r["shift"] == q["shift"] and r["gapPixels"] == q["gapPixels"]
                for r in G["results"]) for q in E1_GAPS["results"]),
        {"published": len(E1_GAPS["results"]), "recomputed": len(G["results"])})

    # E2 integration
    chk("e2_v2_neutral_state_equals_source", I["e2_states"]["00-neutral"] == src,
        {"changedPixels": T.diff_bbox(I["e2_states"]["00-neutral"], src)["changedPixels"]})
    chk("all_10_assembly_states_equal_approved_e2_v2_states",
        all(S[n] == I["e2_states"][n] for n in STATE_NAMES),
        {"states": len(STATE_NAMES)})
    dr = A["diff_rect"]
    chk("assembly_changes_limited_to_face_diff_rect",
        all(all(S[n][p * 3 + k] == src[p * 3 + k] for k in range(3))
            for n in STATE_NAMES
            for y in range(H) for x in range(W)
            if not (dr[0] <= x <= dr[2] and dr[1] <= y <= dr[3])
            for p in [y * W + x]),
        {"diffRect": dr})
    chk("e2_switching_round_trips_at_assembly_level", all(sw["checks"].values()),
        {"checks": len(sw["checks"]), "failed": [k for k, v in sw["checks"].items() if not v],
         "cleanChangedPixels": sw["changed"], "ownedPixels": sw["owned"]})

    # approved expressions / neutral / both closed
    approved = {s["state"]: s["approvedVariant"] for s in DECISION["states"]
                if s.get("createSlot")}
    chk("approved_variants_unchanged", approved == {
        "eye_l_closed": "B", "eye_r_closed": "B",
        "mouth_open": "A", "mouth_smile": "A"}, approved)
    chk("mouth_closed_A_is_visual_reference_only",
        any(s["state"] == "mouth_closed" and not s.get("createSlot") for s in DECISION["states"]), None)
    chk("exactly_10_approved_assembly_states", len(STATE_NAMES) == 10, STATE_NAMES)

    iris_l = green_centroid(S["00-neutral"], 380, 412)
    iris_r = green_centroid(S["00-neutral"], 435, 470)
    lid_l = lid_centroid_state(S["05-both-eyes-closed"], 373, 410, 150, 178)
    lid_r = lid_centroid_state(S["05-both-eyes-closed"], 433, 470, 148, 178)
    neutral_line = sum(1 for y in range(202, 204) for x in range(413, 437)
                       if T.lum(*tuple(S["00-neutral"][(y * W + x) * 3:(y * W + x) * 3 + 3])) < 112)
    open_line = sum(1 for y in range(202, 204) for x in range(413, 437)
                    if T.lum(*tuple(S["03-mouth_open-A"][(y * W + x) * 3:(y * W + x) * 3 + 3])) < 112)
    smile_line = sum(1 for y in range(202, 204) for x in range(413, 437)
                     if T.lum(*tuple(S["04-mouth_smile-A"][(y * W + x) * 3:(y * W + x) * 3 + 3])) < 112)
    green_closed_l = green_centroid(S["05-both-eyes-closed"], 380, 412)["greenPixels"]
    green_closed_r = green_centroid(S["05-both-eyes-closed"], 435, 470)["greenPixels"]
    chk("neutral_irises_level_in_assembly",
        abs(iris_l["centroidY"] - iris_r["centroidY"]) < 0.5,
        {"left": iris_l, "right": iris_r})
    chk("both_closed_lids_level_in_assembly",
        abs(lid_l["centroidY"] - lid_r["centroidY"]) < 1.0,
        {"left": lid_l, "right": lid_r,
         "residualPx": round(abs(lid_l["centroidY"] - lid_r["centroidY"]), 3),
         "e2V2ResidualPx": E2_VERIFY["measurementsAfter"]["residualAsymmetryPx"]})
    chk("closed_states_hide_open_green_irises",
        green_closed_l == 0 and green_closed_r == 0,
        {"leftGreenPx": green_closed_l, "rightGreenPx": green_closed_r})
    chk("mouth_zone_dark_ink_changes_in_open_and_smile",
        open_line != neutral_line and smile_line != neutral_line,
        {"neutralDarkPx": neutral_line, "mouthOpenDarkPx": open_line,
         "mouthSmileDarkPx": smile_line,
         "note": "narrow y=202..203 dark-ink count is a diagnostic, not proof of a double line; the wide O has its own dark upper edge. E2 clean base report already documents removal of the neutral line."})

    # matte / front-hair intersections, mouth exclusivity (honest diagnostics)
    _ov, inter = intersection_overlay(I, S["00-neutral"])
    chk("expression_mattes_front_hair_overlap_recorded", True, inter)
    chk("mouth_mattes_share_zone_but_are_switch_exclusive",
        inter["mouthMaskOverlapPx"] > 0 and
        sw["checks"]["state03_replace_with_smile_equals_state04"] and
        sw["checks"]["state03_remove_mouth_equals_neutral"],
        {"mouthMaskOverlapPx": inter["mouthMaskOverlapPx"],
         "switchReplacePass": sw["checks"]["state03_replace_with_smile_equals_state04"],
         "switchRemovePass": sw["checks"]["state03_remove_mouth_equals_neutral"],
         "note": "the two mouth mattes cover the same fitted zone; only one expression is active per state, proven by switch round trips."})

    # canon metrics (geometry source vs render canon)
    colors = {
        "IMG_4036": unique_colors(SRC / "IMG_4036_style-reference.webp"),
        "IMG_4037": unique_colors(SRC / "IMG_4037_campus-outfit.webp"),
        "IMG_4038": unique_colors(SRC / "IMG_4038_rig-pose.webp"),
        "E1_composite": unique_colors(ASSEMBLY / "01-E1-over-canon-background.png"),
        "E2_neutral": unique_colors(ASSEMBLY / "state-00-neutral.png"),
    }
    chk("canon_render_mismatch_documented", True,
        {"uniqueColors": colors,
         "verdict": "geometry derived from IMG_4038; final render manner IMG_4036/IMG_4037 NOT yet applied (E4 not authorized)",
         "referenceReview": "ACCEPTED WITH NOTES; mirror RMSE 0.0894 (8.94%); axis deviation <=0.6 px"})

    # no new artistic pixels
    chk("no_new_artistic_pixels_in_full_frame_states",
        A["asc"] == src and all(S[n] == I["e2_states"][n] for n in STATE_NAMES),
        {"method": "all full-frame assembly states are byte-identical to already approved E2-V2 states; other sheets are crops/zooms/overlays"})

    # PNG decode + full-frame dimension assertion
    core = []
    for p in ROOT.rglob("*.png"):
        rel = str(p.relative_to(ROOT))
        if rel.startswith("assembly/") or rel.startswith("source/layers/") or \
           rel.startswith("source/E2-EYE-ALIGNMENT-V2/"):
            core.append(p)
    decode_bad, dim_bad = [], {}
    for p in core:
        try:
            d = T.run(["identify", "-format", "%wx%h", str(p)]).decode().strip()
        except Exception:
            decode_bad.append(str(p.relative_to(ROOT))); continue
        if d != "848x1264":
            dim_bad[str(p.relative_to(ROOT))] = d
    chk("png_decode_and_full_frame_dimensions", not decode_bad and not dim_bad,
        {"checked": len(core), "decodeErrors": decode_bad, "wrongDimensions": dim_bad})
    missing_sheets = [n for n in SHEET_NAMES if not (CMP / n).exists() or
                      not (MOBILE / n).exists()]
    chk("all_required_visual_sheets_and_mobile_versions_exist", not missing_sheets,
        {"required": len(SHEET_NAMES), "missing": missing_sheets})
    mobile_widths = {p.name: int(T.run(["identify", "-format", "%w", str(p)]).decode().strip())
                     for p in sorted(MOBILE.glob("*.png"))}
    chk("mobile_sheets_width_le_1200px", all(v <= 1200 for v in mobile_widths.values()),
        {"maxWidth": max(mobile_widths.values()), "widths": mobile_widths})

    # findings (defects/limits, NOT waived)
    findings = {
        "renderCanonNotMet": "IMG_4038 is flatter (55,454 colours) than IMG_4036/4037 (124,223 / 116,952); E4 not authorized.",
        "e1HiddenZonesNotRestored": "E1 slots remain non-independent under motion; only the FACE hidden zones were restored in E2.",
        "motionProxyGaps": G["results"],
        "lockedRowBgOpaquePixels": G["lacunae"],
        "e1OutOfCropOpaquePixels": outside,
        "negativeOrOutsideAnchors": neg,
        "e1AlphaMeanDifference": "E1 composite alphaMean 0.252289 vs stage-04 cutout 0.269604 (1 px contour smoothing).",
        "bgColor": list(I["bg_color"]),
        "intersections": inter,
        "visualStatesMismatch": "ANIMATION-SPEC.md §3 expects 20 slots / 24 visual states; stage-04 had 20/4 missing, E2-V2 has 10 static face states (neutral + 9 combinations), NOT 24 rig animation frames. No drawOrder manifest.",
        "e2ResidualDefects": [
            "eye_r_closed-B: сохранён лишний светлый штрих над веком и сдвинут вместе с коррекцией +9 px; seam_rmse относительно исходника с ОТКРЫТЫМ глазом вырос 25.6289 → 65.1796 (ожидаемо: открытый глаз вне сдвинутой линзы заменён чистой кожей; это не новый видимый шов).",
            "eye_l_closed-B: более тонкие ресницы, мягкая лишняя складочка, seam=14.92, сдвиг [-2.31,-0.36], тёмные пиксели 339/494, ступенька тона x≈405–410 на ×8.",
            "mouth_open-A: широкое «О» / seam=8.77; mouth_smile-A: тонкая низкоконтрастная линия / 28/44.",
            "правый глаз на ×8: слабая разница гладкости/тона внутри fitted-линзы и короткая граница у защитной пряди x≈470–471.",
            "чистая база техническая, а не финальная художественная реставрация: под закрытыми веками нет анатомии, у AI-элементов нет настоящей alpha, маски технические.",
            "в E2-FACE-BASE-FULL-REPORT.md осталась известная опечатка 829 вместо 929 для частичной маски правого глаза; файл намеренно не тронут.",
            "из пилота остаются раскрытыми registrationAnnulusMSE=3389.4, сдвиг [-4,-4], тёмные пиксели 308/732.",
        ],
        "e2DecisionIntegrationFlag": "E2-final-decision.json still has integrated=false / e3e4Started=false; E3 is verification only, no rig integration.",
        "planE3Label": "PLAN.md E3 05.3-face-states is only PARTIALLY realised by E2: clean face base and 4 approved expressions / 10 static states exist, but not as tight 39-48 px slots with unified rect/pivot inside a rig. Current authorised E3 is the explicit assembly/canon verification task list; no new states or slots created.",
        "backgroundGradient": "Solid-bg technical sheets use one sampled corner colour; original gradient is not reproduced. Canon-bg assembly uses the original frame as backdrop and is byte-identical to it.",
        "noE4OrRig": "No PixiJS rig, no code/atlas/PR change, no Vercel Preview/Production, no E4 started.",
        "vercel": "Vercel connector is enabled; only list_connector_tools was called, no deployment/project/domain/env action.",
    }
    return checks, findings, {
        "iris": {"left": iris_l, "right": iris_r},
        "lids": {"left": lid_l, "right": lid_r},
        "mouthDarkLine": {"neutral": neutral_line, "open": open_line,
                          "smile": smile_line},
        "greenClosed": {"left": green_closed_l, "right": green_closed_r},
        "intersection": inter,
        "colors": colors,
    }


# --------------------------------------------------------------- docs / manifest
def write_docs(checks, findings, extra, G, geo, sw, A):
    import re
    passed = sum(1 for v in checks.values() if v["pass"])
    total = len(checks)
    gaps_rest = next(r for r in G["results"] if r["shift"] == "rest")
    worst = max(G["results"][1:], key=lambda r: r["gapPixels"])
    lac = G["lacunae"]
    approved = ", ".join(f"{s['state']}-{s['approvedVariant']}" for s in DECISION["states"] if s.get("createSlot"))
    defects_md = "\n".join(f"   - {d}" for d in findings["e2ResidualDefects"])
    md = f"""# E3 — проверка сборки и соответствия канону HEROINE-01

**Тип этапа:** верификация / аудит, **не** сборка рига и **не** художественный проход.
**Ветка:** `arena/02869c32-actual-new-clicker` (active). **Родитель:** `375c8c3524ec5f6f1bff5a452496cb53e84b04f4` (утверждённые E2-FACE-BASE-FULL + E2-EYE-ALIGNMENT-V2). Пользователь подтвердил E2 («Е2 утверждаю») и отдельно разрешил E3 именно как проверку; самоодобрения нет. Отдельный коммит E3 и его SHA — в итоговом сообщении чата.

`PLAN.md` использован как источник канона, геометрии, z-порядка, пивотов и зафиксированных ограничений. Важное уточнение: подэтап `PLAN.md` **E3 `05.3-face-states`** (чистая база лица + 4 состояния, единый rect/pivot) реализован в E2 лишь **частично** — чистая база, 4 утверждённых выражения и 10 статичных состояний есть, но они не являются tight-слотами 39–48 px с единым rect/pivot внутри рига. Текущий разрешённый E3 выполнен по вашему явному списку задач как **проверка общей сборки**: без пересоздания состояний, без смены выбранных вариантов, без новых слотов и без E4. Расхождение зафиксировано, а не объявлено успехом.

## 0. Граница «не генерировать новые изображения»

Не вызывались `generate_image`, генеративный ИИ, inpainting, generative fill, diffusion, content-aware инструменты. Все PNG этой версии — **технические** композиты, кропы, зумы, контактные листы, координатные сетки и диагностические цветовые оверлеи **уже утверждённых пикселей**. Полноразмерные состояния сборки побайтно равны утверждённым состояниям E2-V2; новых художественных пикселей нет. Атлас, код игры, `public/art/heroine.json`, PR #3, архитектура и число слотов не менялись. Vercel-коннектор включён, но вызван только `list_connector_tools`; Preview / Production / деплои / проекты / домены / env не трогались.

## 1. Соответствие исходному образу HEROINE-01

| Референс | Размер | Уник. цветов | Роль |
|---|---:|---:|---|
| `IMG_4036_style-reference.webp` | 864×1821 | {extra['colors']['IMG_4036']} | единственный эталон манеры |
| `IMG_4037_campus-outfit.webp` | 704×1484 | {extra['colors']['IMG_4037']} | канон образа / одежды |
| `IMG_4038_rig-pose.webp` | 848×1264 | {extra['colors']['IMG_4038']} | **геометрия позы**, не эталон рендера |
| E1-композит / E2-нейтраль | 848×1264 | {extra['colors']['E1_composite']} / {extra['colors']['E2_neutral']} | подготовленные элементы |

`REFERENCE-REVIEW.md`: вердикт **ACCEPTED WITH NOTES**, зеркальный RMSE `0.0894` (8,94 %), отклонение оси ≤ `0.6 px` из 106, поза фронтальна. E1/E2 построены из `IMG_4038`, поэтому **геометрия и координаты соответствуют исходному кадру**, но **манера рендера ещё не приведена к `IMG_4036`/`IMG_4037`**: rig-pose объективно площе (55 454 цвета против 124 223 / 116 952, σ 0.174 против 0.221–0.247). Это зафиксированная оговорка, а не успех; приведение манеры — отдельный этап (в `PLAN.md` E4 `05.4-render-canon`), который **не разрешён**. Побайтовое тождество с PNG из PAT не утверждается (WebP против PNG, в PAT только 7-символьные префиксы).

## 2. Координаты, масштабы, точки крепления, порядок наложения

- Все 20 E1-слоёв и все 4 E2-technical matte/layer — **полный холст 848×1264**, масштабирования нет. z непрерывен `1…20`, группы совпадают с `ANIMATION-SPEC.md` §3; z=0 `glow` по-прежнему генерируется кодом, не артом.
- Композит 20 слоёв **в порядке возрастания z** и в обратном порядке **оба побайтно равны** исходному кадру (`changedPixels=0`): маски E1 образуют непересекающееся разбиение силуэта (`overlap=0`), поэтому перестановка z в статичном покое не меняет пиксели. z-порядок `0…20` проверен по `ANIMATION-SPEC.md` §3 и group mapping, но **реальные перекрытия / окклюзия при движении текущими контурами не демонстрируются** — это ограничение E1.
- `pivotLocal = pivotAbsolute − tightRect.origin` корректен для всех 20 слотов; `anchor = pivotLocal / tightRect.size` посчитан в [geometry-report.json](geometry-report.json). У {len(findings['negativeOrOutsideAnchors'])} слотов anchor выходит за `[0,1]` (например `hair_back_01` y=−0.254, `hair_side_r` y=−0.769): пивот лежит выше/левее контурного bbox — это анатомическая точка, но при будущей интеграции рига требует аккуратной обработки отрицательного anchor.
- `tightRect` E1 — **контурный bbox**, а `crop-map.json` stage-04 — предварительное геометрическое окно; они не совпадают. Зафиксировано {sum(1 for v in findings['e1OutOfCropOpaquePixels'].values() if v>0)} слотов с непрозрачными пикселями вне stage-04 rect (макс. {max(findings['e1OutOfCropOpaquePixels'].values())} px), например `outfit_collar` tightRect `y=49…373` против окна `y=240…391`. Это **запечённые части соседних деталей / глубокая классификация**, disclosed, не исправлялось (нельзя менять E1).
- Состояния E2-V2 — не tight-слоты, а 4 полноразмерные технические маски/слоя на общем холсте 848×1264; единый rect/pivot обеспечен на уровне общего canvas, но не на уровне 39–48 px окошек z14/z15 из `PLAN.md` §3. Ограничение зафиксировано, варианты не подменялись.

## 3. Совмещение лица, волос, тела и одежды

- Нейтральная общая сборка ([assembly/state-00-neutral.png](assembly/state-00-neutral.png)) побайтно равна `IMG_4038` и утверждённому `E2-V2/00-neutral.png`: на стыках «голова ↔ воротник ↔ плечи», «руки ↔ пряди», «skirt_01 ↔ skirt_02 ↔ подол ↔ ноги» **в покое нет новых швов или двойных контуров**.
- Все 10 состояний сборки побайтно равны соответствующим утверждённым E2-V2-файлам; изменения ограничены прямоугольником `{A['diff_rect']}` (union diff-bbox всех выражений + 8 px). Вне его — исходные пиксели.
- E1 в покое: силуэт {G['silhouettePixels']} px, покрыто {G['silhouettePixels']} (100 %), `rest gaps = 0`, `overlap = 0`. Разница `alphaMean` E1 `0.252289` против stage-04 `0.269604` — только 1 px сглаживание внешнего контура.
- **Но при движении сборка НЕ независима.** Translation-proxy из E1 (не поворот, не реальный кадр): покой {gaps_rest['gapPixels']} px; худший `{worst['shift']}` — **{worst['gapPixels']} px ({worst['gapRatio']*100:.2f} %)** силуэта. Диапазон по 8 прокси: 2.36–10.04 %. Скрытые зоны §2 `PLAN.md` («колпаки» плеч, шея/ключицы под воротником, кисти под прядями, бёдра под подолом, затылок, запечённые тени, 4 лакуны фона) **не дорисовывались**; E2 восстановила только зоны лица. Красные карты — [08-motion-gaps-rest-vs-proxies.png](comparison/08-motion-gaps-rest-vs-proxies.png) и крупные планы 13–16.

## 4. Щели, двойные контуры, пересечения, визуальные артефакты

- **Пересечения E1-слоёв:** 0 (непересекающееся разбиение силуэта по z). Технические маски E2-V2 и передние пряди z17–20 пересекаются на **{extra['intersection']['frontHairMatteOverlapPx']} px**; две маски рта имеют общую зону **{extra['intersection']['mouthMaskOverlapPx']} px** (взаимоисключение только через переключение). Подробнее — следующий пункт и [20-matte-intersection-overlay.png](comparison/20-matte-intersection-overlay.png).
- **Двойные контуры в покое:** не обнаружены (композит = исходник); в закрытых состояниях зелёные радужки открытых глаз полностью скрыты (`leftGreenPx={extra['greenClosed']['left']}`, `rightGreenPx={extra['greenClosed']['right']}`). Узкая диагностика тёмного инка `y=202–203` даёт {extra['mouthDarkLine']['neutral']} px в нейтрали, {extra['mouthDarkLine']['open']} px в `mouth_open-A` и {extra['mouthDarkLine']['smile']} px в `mouth_smile-A`: в широком «О» это собственный тёмный край, а не остаток нейтральной линии; отчёт E2 отдельно подтверждает удаление линии `y=202–203` на чистой базе. Сохранённые известные дефекты E2 (лишний светлый штрих, тон-ступеньки, `seam`) — в §7.
- **Запечённый фон / глубокие тени:** в `work-cutout.png` найдено **{lac['opaqueRowBgPixels']} непрозрачных пикселей**, совпадающих с построчным цветом фона (±10), **{lac['components']} компонент**, крупнейшие **{lac['largest'][0]['pixels']}** и **{lac['largest'][1]['pixels']}** px за плечами (`{lac['largest'][0]['bbox']}` / `{lac['largest'][1]['bbox']}`). На тёмном фоне они сливаются с фоном, на светлом выглядят тёмными клиньями; это не восстановленная анатомия и не новая дыра, а честно показанный артефакт вырезки. `SLICE-MAP.md` сообщал об удалении 3 841 px «запертых лакун» на stage-04; расхождение с замером E3 по сохранённому файлу зафиксировано и **не скрыто**, отдельного расследования/правки не проводилось (нельзя менять stage-04). Карта: [09-baked-lacunae-map.png](comparison/09-baked-lacunae-map.png), крупный план [19-closeup-lacunae-shoulders.png](comparison/19-closeup-lacunae-shoulders.png).
- **Пересечения технических масок:** маски E2-V2 не являются полностью изолированными от передних прядей E1 z17–20: зафиксировано **{extra['intersection']['frontHairMatteOverlapPx']} px** пересечения (красным на [20-matte-intersection-overlay.png](comparison/20-matte-intersection-overlay.png)). Маски `mouth_open-A` и `mouth_smile-A` покрывают одну и ту же зону **{extra['intersection']['mouthMaskOverlapPx']} px** (голубым); они не «непересекаемы», но **взаимоисключающи по переключению** (замена `03→04` и снятие рта к нейтрали проверены). Жёлтый — {extra['intersection']['bothOverlapPx']} px обеих зон. Это диагностика, а не исправление.
- Листы на сплошном тёмном фоне используют один цвет угла `{findings['bgColor']}`; исходный градиент фона в них не воспроизведён (техническое ограничение листа, не дефект арта). Листы на canon-фоне используют сам исходный кадр как подложку и побайтно ему равны.

## 5. Нейтральное состояние и все утверждённые выражения

Утверждённый выбор (не пересматривался): **{approved}**; `mouth_closed-A` — только визуальный ориентир, отдельного слота нет. Проверены все **10** состояний E2-V2 (нейтраль + 4 одиночных + 5 комбинаций): [03-all-10-states-25pct.png](comparison/03-all-10-states-25pct.png), [04-face-states-contact-1x.png](comparison/04-face-states-contact-1x.png).

| Проверка | Результат |
|---|---|
| Нейтраль = исходный кадр | байт-идентично |
| Радужки в нейтрали | left `{extra['iris']['left']['centroidY']}`, right `{extra['iris']['right']['centroidY']}` (уровень) |
| Оба века закрыты | left `{extra['lids']['left']['centroidY']}`, right `{extra['lids']['right']['centroidY']}`, остаток **{abs(extra['lids']['left']['centroidY']-extra['lids']['right']['centroidY']):.3f} px** |
| Переключение на уровне общей сборки | {sum(1 for v in sw['checks'].values() if v)}/{len(sw['checks'])} ON/OFF/замена, полный возврат к нейтрали |
| E2-V2 внутренние проверки | 19/19 PASS (не переповторялись, приняты как утверждённые) |
| E2-FACE-BASE-FULL внутренние проверки | 14/14 PASS (не переповторялись) |

Коррекция правого глаза `+9 px` из `375c8c3…` сохранена: левый глаз не тронут, форма/толщина/цвет/наклон не менялись, остаток асимметрии `0.167 px`.

## 6. Визуальные материалы

Полные листы: [00-canon-references.png](comparison/00-canon-references.png) · [01-full-assembly-neutral-1x.png](comparison/01-full-assembly-neutral-1x.png) · [02-original-vs-E1-vs-E2-neutral-50pct.png](comparison/02-original-vs-E1-vs-E2-neutral-50pct.png) · [03-all-10-states-25pct.png](comparison/03-all-10-states-25pct.png) · [04-face-states-contact-1x.png](comparison/04-face-states-contact-1x.png) · [05-layer-order-contact.png](comparison/05-layer-order-contact.png) · [06-anchors-pivots-overlay.png](comparison/06-anchors-pivots-overlay.png) · [07-alignment-grid.png](comparison/07-alignment-grid.png) · [08-motion-gaps-rest-vs-proxies.png](comparison/08-motion-gaps-rest-vs-proxies.png) · [09-baked-lacunae-map.png](comparison/09-baked-lacunae-map.png).

Крупные планы проблемных участков: [10-closeup-face-neutral-vs-both-closed.png](comparison/10-closeup-face-neutral-vs-both-closed.png) · [11-closeup-eyes-8x.png](comparison/11-closeup-eyes-8x.png) · [12-closeup-mouth-8x.png](comparison/12-closeup-mouth-8x.png) · [13-closeup-head-collar-shoulders.png](comparison/13-closeup-head-collar-shoulders.png) · [14-closeup-arms-hair.png](comparison/14-closeup-arms-hair.png) · [15-closeup-skirt-hem.png](comparison/15-closeup-skirt-hem.png) · [16-closeup-legs-shoes.png](comparison/16-closeup-legs-shoes.png) · [17-closeup-ear-front-hair.png](comparison/17-closeup-ear-front-hair.png) · [18-closeup-ribbon.png](comparison/18-closeup-ribbon.png) · [19-closeup-lacunae-shoulders.png](comparison/19-closeup-lacunae-shoulders.png) · [20-matte-intersection-overlay.png](comparison/20-matte-intersection-overlay.png).

Узкие версии для iPhone — в [comparison/mobile/](comparison/mobile/) (один столбец / 50 % для полноразмерных листов). Галерея: [E3-ASSEMBLY-CANON-CHECK-INDEX.md](E3-ASSEMBLY-CANON-CHECK-INDEX.md).

## 7. Верификация и зафиксированные ограничения / дефекты

`verify-report.json` — **{passed}/{total} структурных проверок PASS, 0 FAIL**. Важно: PASS означает «проверка выполнена и результат зафиксирован», **не** «риг готов» и **не** «дефекты приняты».

Не скрытые ограничения и дефекты:

1. **Рендер-канон не достигнут**: подготовленные элементы наследуют упрощённую манеру `IMG_4038`; `IMG_4036`/`IMG_4037` — отдельный будущий этап, не разрешён.
2. **20 слотов не независимы при движении**: прокси открывает 2.36–10.04 % силуэта; скрытые зоны §2 `PLAN.md` не дорисованы (E2 закрыла только лицо). `E2-final-decision.json` по-прежнему `integrated=false`, `e3e4Started=false`. `ANIMATION-SPEC.md` §3 ожидает 20 слотов / 24 визуальных состояния; stage-04 было 20 присутствующих / 4 отсутствующих, E2-V2 даёт **10 статичных состояний лица**, а не 24 кадра рига; `drawOrder`-манифеста нет.
3. **Пивоты / rect / маски**: {len(findings['negativeOrOutsideAnchors'])} anchor вне `[0,1]`; `tightRect` ≠ stage-04 `rect`; {sum(1 for v in findings['e1OutOfCropOpaquePixels'].values() if v>0)} слотов содержат пиксели вне предварительного окна. E2-выражения — полноразмерные technical mattes, не tight-слоты с локальным pivot 39–48 px. Зафиксированы {extra['intersection']['frontHairMatteOverlapPx']} px пересечения масок с передними прядями и {extra['intersection']['mouthMaskOverlapPx']} px общей зоны двух масок рта (взаимоисключение только через переключение).
4. **Запечённый фон**: {lac['opaqueRowBgPixels']} px / {lac['components']} компонент фоново-окрашенной непрозрачности; расхождение с `SLICE-MAP.md` (3 841 px) не исследовалось и не исправлялось.
5. **Известные дефекты E2 не сняты** (выбор пользователя не пересматривался, варианты не подменялись):
{defects_md}
6. **Технические листы**: сплошной фон без градиента; карты щелей — translation-proxy, а не реальные повороты ±10/±12/±25/±4°; 8 крайних фаз, loop seam, быстрые тапы, FPS/касания, 14 проверок §6 спеки, `density` и 6 хит-зон **не проверялись** (это E6–E8, отдельные гейты).
7. **`PLAN.md` не менялся**, нумерация подэтапов не пересматривалась; `PLAN.md` E3 `05.3-face-states` закрыт E2 лишь частично (база + выражения есть, tight-слотов и риг-интеграции нет), текущий E3 — аудит по вашему заданию.
8. **Ничего не интегрировано**: нет PixiJS-рига, нет `drawOrder`-манифеста на 24 кадра, нет атласа, нет правок `ART_FRAME_NAMES`/`applyArt`/`zoneReactions`, нет Merge PR #3, нет Vercel Preview/Production. Прямой и обратный z-композиты равны исходнику из-за непересекающихся контуров: заявленный z-порядок проверен по спеке, но оптическая окклюзия при движении не доказана.

## 8. Что не тронуто

Оригинальные WebP, stage-04 (`SLICE-MAP.md`, `crop-map.json`, `build_crops.py`, `work-cutout.png`, `alpha-mask.png`), `MANIFEST.json`, `ANIMATION-SPEC.md`, `REFERENCE-REVIEW.md`, `PLAN.md`, `layer-map.json`, 20 `layers/*.png`, `E1-REPORT.md`, `build_layers.py`, `check_motion_gaps.py`, `e1-motion-gaps.json`, `preview/*`, `E2-facial-states/`, `E2-REVIEW-SET/`, `E2-FINAL-DECISION/`, `E2-FACE-BASE-PILOT/`, `E2-FACE-BASE-FULL/`, `E2-EYE-ALIGNMENT-V2/`, `docs/`, `public/`, `src/`, `tests/`, `package*.json`, конфиги, `README.md`, `.gitignore`, PR #3. Сверка по снимку SHA-256, снятому до начала E3: [source/protected-SHA256-before.txt](source/protected-SHA256-before.txt), 0 изменённых из 571. В Git попадает только `E3-ASSEMBLY-CANON-CHECK/`.

## 9. СТОП

**СТОП после E3.** Результаты публикуются отдельным коммитом, удалённая версия проверяется, ссылки — в итоговом сообщении. Это **не приёмка готового рига**, дефекты не сняты, самоодобрения нет. **E4 (полноценный PixiJS-риг / любые подэтапы `PLAN.md` E4–E8) НЕ начат** — жду отдельного явного разрешения пользователя.

---
[Индекс](E3-ASSEMBLY-CANON-CHECK-INDEX.md) · [Геометрия](geometry-report.json) · [Проверки](verify-report.json) · [Метаданные](E3-assembly-canon-check.json) · [SHA256-манифест](SHA256-MANIFEST.txt)
"""
    (ROOT / "E3-ASSEMBLY-CANON-CHECK-REPORT.md").write_text(md, encoding="utf-8")

    names = SHEET_NAMES
    idx = ["# E3 — галерея проверки сборки HEROINE-01", "",
           "Отдельная версия-аудит. Родитель `375c8c3…` не изменён. Сначала узкие листы для iPhone, затем полные.", ""]
    for n in names:
        idx += [f"## {n}", f"![{n}](comparison/{n})",
                f"[Полный лист](comparison/{n}) · [mobile](comparison/mobile/{n})", ""]
    idx += ["## Узкие листы для iPhone", ""]
    for p in sorted(MOBILE.glob("*.png")):
        idx.append(f"- [{p.name}](comparison/mobile/{p.name})")
    idx += ["", "## Документы", "",
            "- [Полный отчёт](E3-ASSEMBLY-CANON-CHECK-REPORT.md)",
            "- [Геометрия 20 слотов](geometry-report.json)",
            "- [Проверки](verify-report.json)",
            "- [Матрица переключения E2-V2](source/E2-EYE-ALIGNMENT-V2/states/switch-matrix.json)",
            "- [Метаданные](E3-assembly-canon-check.json)",
            "- [SHA256-манифест](SHA256-MANIFEST.txt)", ""]
    index_md = "\n".join(idx).rstrip() + "\n"
    (ROOT / "E3-ASSEMBLY-CANON-CHECK-INDEX.md").write_text(index_md, encoding="utf-8")

    T.write_json(ROOT / "E3-assembly-canon-check.json", {
        "stage": "E3-ASSEMBLY-CANON-CHECK",
        "type": "read-only assembly / canon verification, NOT rig integration",
        "parent": "375c8c3524ec5f6f1bff5a452496cb53e84b04f4",
        "branch": "arena/02869c32-actual-new-clicker",
        "generation": False,
        "newArtisticPixels": False,
        "rigIntegration": False,
        "e4Started": False,
        "vercelAction": "none (connector enabled, list_connector_tools only)",
        "approvedVariants": approved,
        "statesChecked": STATE_NAMES,
        "checks": {"total": total, "passed": passed, "failed": total - passed},
        "protectedFilesChanged": 0,
        "selfApproval": False,
        "residualDefectsWaived": False,
        "renderCanonMet": False,
        "commit": "see final chat report (separate commit after this folder)",
        "approval": "NOT APPROVED - STOP, waiting for separate E4 permission",
    })

    text = md + index_md
    cjk = [c for c in text if "\u4e00" <= c <= "\u9fff"]
    links = re.findall(r"\]\(([^)]+)\)", text)
    bad = [l for l in links
           if not l.startswith("http")
           and not l.startswith("SHA256-MANIFEST")
           and not (ROOT / l).exists()]
    T.write_json(ROOT / "links-report.json", {
        "linksChecked": len(links), "brokenLinks": bad,
        "cjkCharacters": len(cjk), "pass": not bad and not cjk})
    return {"linksChecked": len(links), "brokenLinks": bad, "cjk": len(cjk)}


def write_manifest(links):
    (ROOT / ".gitignore").write_text(
        "__pycache__/\n.scratch/\n*.tmp.png\n.tmp-*.png\n", encoding="utf-8")
    skip = {".gitignore", "SHA256-MANIFEST.txt", "SHA256-MANIFEST.json"}
    files = []
    for p in sorted(ROOT.rglob("*")):
        if not p.is_file():
            continue
        rel = str(p.relative_to(ROOT))
        if rel in skip or rel.startswith(".scratch/") or "__pycache__" in rel:
            continue
        if any(part.startswith(".tmp-") or part.endswith(".tmp.png") or
               re.fullmatch(r".*\.p\d+\.png", part) for part in rel.split("/")):
            continue
        files.append((rel, hashlib.sha256(p.read_bytes()).hexdigest()))
    (ROOT / "SHA256-MANIFEST.txt").write_text(
        "\n".join(f"{h}  {rel}" for rel, h in files) + "\n", encoding="utf-8")
    T.write_json(ROOT / "SHA256-MANIFEST.json",
                 {"count": len(files), "files": {rel: h for rel, h in files}})
    bad = [rel for rel, h in files
           if hashlib.sha256((ROOT / rel).read_bytes()).hexdigest() != h]
    return {"files": len(files), "roundTripBad": bad, "links": links}


# --------------------------------------------------------------- main
def main():
    I = load_inputs()
    geo = geometry_report(I)
    A = build_assembly(I)
    G = build_gap_maps(I)
    sw = switching(I, A)
    make_all_sheets(I, A, G)
    checks, findings, extra = verify(I, A, G, geo, sw)
    report = {
        "stage": "E3-ASSEMBLY-CANON-CHECK",
        "parent": "375c8c3524ec5f6f1bff5a452496cb53e84b04f4",
        "type": "verification only",
        "checks": checks,
        "summary": {"checksTotal": len(checks),
                    "checksPassed": sum(1 for v in checks.values() if v["pass"]),
                    "checksFailed": sum(1 for v in checks.values() if not v["pass"])},
        "geometry": {"slots": len(geo), "zContinuous": True,
                     "groupsMatchSpec": True,
                     "anchorsOutside0to1": findings["negativeOrOutsideAnchors"],
                     "outsideCropBySlot": findings["e1OutOfCropOpaquePixels"]},
        "assembly": {"diffRect": A["diff_rect"], "states": STATE_NAMES,
                     "switching": sw},
        "canon": {"uniqueColors": extra["colors"],
                  "renderCanonMet": False, "e4Authorized": False},
        "motionGaps": G["results"],
        "lacunae": G["lacunae"],
        "expressions": {"iris": extra["iris"], "lids": extra["lids"],
                        "greenClosed": extra["greenClosed"],
                        "mouthDarkLine": extra["mouthDarkLine"],
                        "intersection": extra["intersection"]},
        "findings": findings,
    }
    T.write_json(ROOT / "verify-report.json", report)
    if report["summary"]["checksFailed"]:
        print("FAILED:", [k for k, v in checks.items() if not v["pass"]])
        sys.exit(1)
    links = write_docs(checks, findings, extra, G, geo, sw, A)
    manifest = write_manifest(links)
    # cleanup transient files
    for p in (list(ROOT.glob(".tmp-*.png")) + list(CMP.glob("*.tmp.png")) +
              list(PANELS.glob(".tmp-mobile-*.png")) + list(ROOT.rglob("*.p[0-9].png"))):
        p.unlink(missing_ok=True)
    print(json.dumps({
        "checks": report["summary"],
        "protectedFiles": len(
            (SRC / "protected-SHA256-before.txt").read_text(encoding="utf-8").splitlines()),
        "motionWorst": max(G["results"][1:], key=lambda r: r["gapPixels"]),
        "lacunae": {"pixels": G["lacunae"]["opaqueRowBgPixels"],
                    "components": G["lacunae"]["components"]},
        "links": links, "manifest": manifest,
    }, indent=2, ensure_ascii=False))
    if links["brokenLinks"] or links["cjk"] or manifest["roundTripBad"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
