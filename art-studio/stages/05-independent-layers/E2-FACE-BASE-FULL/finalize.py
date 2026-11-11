#!/usr/bin/env python3
"""One automated verification + gallery + manifest pass for E2 FACE BASE FULL.

Replaces the many small manual checks with a single script. Visual checking
of the generated sheets is still done separately by a human/agent; this
script never claims a visual pass.

Checks performed:
  * 16 protected feature rectangles vs the untouched original, on EVERY
    full-frame output and on all 4 mattes;
  * changes outside the active zone rectangles / outside matte support;
  * alpha channels: matte == RGBA layer alpha, layer RGB == element RGB;
  * dimensions, coordinates, matte bounding boxes;
  * empty / corrupt / unreadable PNG detection (decode every file);
  * expression switching round-trips (add / remove / replace an expression);
  * neutral state byte-identical to the original frame;
  * source copies byte-identical to the published sources;
  * SHA256 manifest of the whole deliverable.
"""

import sys
sys.dont_write_bytecode = True

import hashlib
import json
import subprocess
from pathlib import Path

import face_base_toolkit as T
import build_full as B

ROOT = Path(__file__).resolve().parent
CMP = ROOT / "comparison"
PANELS = CMP / "panels"
PANELS.mkdir(parents=True, exist_ok=True)

SRC = T.read_rgb(ROOT / "source" / "source-frame.webp")
ELEMS = {e: T.read_rgb(ROOT / "source" / f"element-{e}.png") for e in B.EXPR}
LAYERS = {e: T.read_rgba(ROOT / "layers" / f"layer-{e}.png") for e in B.EXPR}
MASKS = {e: T.read_gray(ROOT / "masks" / f"mask-{e}.png") for e in B.EXPR}
STATES = {n: T.read_rgb(ROOT / "states" / f"{n}.png") for n in B.STATES}
STATE_BASES = {n: T.read_rgb(ROOT / "states" / f"{n}-state-base.png") for n in B.STATES}
FULL_BASE = T.read_rgb(ROOT / "base" / "00-clean-face-base-full.png")
CLEAN = {
    "eye_l": T.read_rgb(ROOT / "base" / "01-clean-base-eye_l.png"),
    "eye_r": T.read_rgb(ROOT / "base" / "02-clean-base-eye_r.png"),
    "mouth": T.read_rgb(ROOT / "base" / "03-clean-base-mouth.png"),
}
CHANGED = {}
for z, buf in CLEAN.items():
    CHANGED[z] = {p for p in range(T.W * T.H)
                  if any(buf[p * 3 + k] != SRC[p * 3 + k] for k in range(3))}

errors = []
report = {"stage": "E2-FACE-BASE-FULL", "checks": {}, "errors": []}


def chk(name, ok, detail=None):
    report["checks"][name] = {"pass": bool(ok), "detail": detail}
    if not ok:
        errors.append(name)
    return ok


# ------------------------------------------------ 1. protected feature zones
all_outputs = {"full_clean_base": FULL_BASE,
               "clean_base_eye_l": CLEAN["eye_l"],
               "clean_base_eye_r": CLEAN["eye_r"],
               "clean_base_mouth": CLEAN["mouth"]}
for n, buf in STATES.items():
    all_outputs["state_" + n] = buf
for n, buf in STATE_BASES.items():
    all_outputs["statebase_" + n] = buf
prot = {}
for name, buf in all_outputs.items():
    prot[name] = {k: T.diff_stats(buf, SRC, r)["maxDiff"]
                  for k, r in B.PROTECTED.items()}
chk("protected_zones_all_outputs",
    all(v == 0 for row in prot.values() for v in row.values()),
    {"outputsChecked": len(all_outputs), "zonesChecked": len(B.PROTECTED),
     "worstMaxDiff": max(v for row in prot.values() for v in row.values()),
     "perOutput": prot})
mask_prot = {}
for e, a in MASKS.items():
    mask_prot[e] = {k: sum(1 for y in range(r[1], r[3] + 1)
                           for x in range(r[0], r[2] + 1)
                           if a[y * T.W + x] > 0)
                    for k, r in B.PROTECTED.items()}
chk("masks_do_not_touch_protected_zones",
    all(v == 0 for row in mask_prot.values() for v in row.values()), mask_prot)

# ------------------------------------------------ 2. changes outside zones
outside = {}
for n, exprs in B.STATES.items():
    zones = []
    for e in exprs:
        if B.EXPR[e] not in zones:
            zones.append(B.EXPR[e])
    allowed = set()
    for z in zones:
        r = B.ZONE_RECTS[z]
        allowed.update(y * T.W + x
                       for y in range(r[1], r[3] + 1)
                       for x in range(r[0], r[2] + 1))
    cnt = 0
    for p in range(T.W * T.H):
        i = p * 3
        if (STATES[n][i] != SRC[i] or STATES[n][i + 1] != SRC[i + 1]
                or STATES[n][i + 2] != SRC[i + 2]) and p not in allowed:
            cnt += 1
    outside[n] = {"activeZones": zones, "changedPixelsOutsideZones": cnt,
                  "diffFromOriginal": T.diff_bbox(STATES[n], SRC),
                  "diffFromOwnStateBase": T.diff_bbox(STATES[n], STATE_BASES[n])}
chk("no_changes_outside_active_zones",
    all(v["changedPixelsOutsideZones"] == 0 for v in outside.values()), outside)

# overlay may only differ from its own state base where a matte is non-zero
support = {}
for n, exprs in B.STATES.items():
    ok = True
    for p in range(T.W * T.H):
        i = p * 3
        if any(STATES[n][i + k] != STATE_BASES[n][i + k] for k in range(3)):
            if not any(MASKS[e][p] > 0 for e in exprs):
                ok = False
                break
    support[n] = ok
chk("overlay_changes_only_inside_mattes", all(support.values()), support)

# ------------------------------------------------ 3. alpha / layer integrity
alpha = {}
for e in B.EXPR:
    layer_a = bytes(LAYERS[e][p * 4 + 3] for p in range(T.W * T.H))
    layer_rgb = bytes(v for p in range(T.W * T.H)
                      for v in LAYERS[e][p * 4:p * 4 + 3])
    alpha[e] = {
        "maskEqualsLayerAlpha": layer_a == MASKS[e],
        "layerRgbEqualsElement": layer_rgb == ELEMS[e],
        "maskStats": T.mask_stats(MASKS[e]),
        "maskBBox": T.mask_bbox(MASKS[e]),
        "bboxInsideZoneRect": (lambda b, r: b is not None and
                               r[0] <= b[0] and r[1] <= b[1] and
                               b[2] <= r[2] and b[3] <= r[3])(
                                   T.mask_bbox(MASKS[e]), B.ZONE_RECTS[B.EXPR[e]]),
    }
chk("alpha_layer_integrity",
    all(v["maskEqualsLayerAlpha"] and v["layerRgbEqualsElement"] and
        v["bboxInsideZoneRect"] and v["maskStats"]["maskNonZeroPixels"] > 0
        for v in alpha.values()), alpha)
chk("mouth_mattes_are_distinct_but_mutually_exclusive",
    MASKS["mouth_open-A"] != MASKS["mouth_smile-A"],
    {"note": "same fitted lens support, different ink-aware alpha; only one mouth expression may be active at a time"})

# matte disjointness for expressions that may be combined
disjoint = {}
for a in B.EXPR:
    for b in B.EXPR:
        if a >= b or B.EXPR[a] == B.EXPR[b]:
            continue
        key = f"{a}__{b}"
        disjoint[key] = sum(1 for p in range(T.W * T.H)
                            if MASKS[a][p] > 0 and MASKS[b][p] > 0)
chk("mattes_of_combinable_expressions_are_disjoint",
    all(v == 0 for v in disjoint.values()), disjoint)

# ------------------------------------------------ 4. dimensions + decoding
dims = {}
decode_errors = []
png_files = sorted(p for p in ROOT.rglob("*.png") if ".scratch" not in str(p))
for p in png_files:
    rel = str(p.relative_to(ROOT))
    try:
        meta = T.run(["identify", "-format", "%w %h %[channels]", p]).decode().strip()
        dims[rel] = meta
    except Exception as exc:
        decode_errors.append((rel, "identify: " + str(exc)[:120]))
        continue
    if p.stat().st_size == 0:
        decode_errors.append((rel, "zero-byte file"))
    parts = meta.split()
    w, h, channels = int(parts[0]), int(parts[1]), parts[2] if len(parts) > 2 else ""
    if "Gray" in channels or "gray" in channels:
        raw = T.run(["convert", p, "-depth", "8", "gray:-"])
        ratio = 1
    elif "a" in channels:
        raw = T.run(["convert", p, "-depth", "8", "rgba:-"])
        ratio = 4
    else:
        raw = T.run(["convert", p, "-alpha", "off", "-depth", "8", "rgb:-"])
        ratio = 3
    # crops, zoom panels and comparison sheets have their own dimensions
    if (w, h) == (T.W, T.H) and len(raw) != w * h * ratio:
        decode_errors.append((rel, f"decoded {len(raw)} bytes, expected {w*h*ratio}"))
full_frame = {k: v for k, v in dims.items() if k.startswith(
    ("base/", "masks/", "layers/", "states/", "blocks/")) and
    not ("/zoom/" in k or "4x" in k or "comparison" in k or "8x" in k or "sheet" in k)}
wrong_dim = {k: v for k, v in full_frame.items() if not v.startswith("848 1264")}
chk("png_decode_and_dimensions", not decode_errors and not wrong_dim,
    {"pngFilesChecked": len(png_files), "decodeErrors": decode_errors,
     "fullFrameAssets": len(full_frame), "wrongDimensions": wrong_dim})
chk("no_empty_or_all_zero_mattes",
    all(T.mask_stats(a)["maskNonZeroPixels"] > 0 and
        T.mask_stats(a)["maskPartialPixels"] > 0 for a in MASKS.values()),
    {e: T.mask_stats(a) for e, a in MASKS.items()})

# ------------------------------------------------ 5. expression switching
def zone_owned(zone):
    """Clean-base pixels + every pixel any matte of this zone could touch."""
    owned = set(CHANGED[zone])
    for e, a in MASKS.items():
        if B.EXPR[e] == zone:
            owned.update(p for p in range(T.W * T.H) if a[p] > 0)
    return owned


def switch_apply(buf, zone, expr):
    """Toggle ON / replace: neutral -> clean base -> approved expression."""
    out = bytearray(buf)
    for p in zone_owned(zone):
        i = p * 3
        out[i:i + 3] = SRC[i:i + 3]
    for p in CHANGED[zone]:
        i = p * 3
        out[i:i + 3] = CLEAN[zone][i:i + 3]
    out, _ = T.composite(bytes(out), ELEMS[expr], MASKS[expr])
    return out


def switch_remove(buf, zone):
    """Toggle OFF: restore the untouched original pixels."""
    out = bytearray(buf)
    for p in zone_owned(zone):
        i = p * 3
        out[i:i + 3] = SRC[i:i + 3]
    return bytes(out)


neutral = STATES["00-neutral"]
sw = {}
sw["neutral_is_original"] = (neutral == SRC)
sw["neutral_apply_eye_l_equals_state_01"] = (switch_apply(neutral, "eye_l", "eye_l_closed-B") == STATES["01-eye_l_closed-B"])
sw["state01_apply_eye_r_equals_state05"] = (switch_apply(STATES["01-eye_l_closed-B"], "eye_r", "eye_r_closed-B") == STATES["05-both-eyes-closed"])
sw["state05_remove_eye_r_equals_state01"] = (switch_remove(STATES["05-both-eyes-closed"], "eye_r") == STATES["01-eye_l_closed-B"])
sw["state05_remove_eye_l_equals_state02"] = (switch_remove(STATES["05-both-eyes-closed"], "eye_l") == STATES["02-eye_r_closed-B"])
sw["neutral_apply_mouth_open_equals_state03"] = (switch_apply(neutral, "mouth", "mouth_open-A") == STATES["03-mouth_open-A"])
sw["state03_replace_with_smile_equals_state04"] = (switch_apply(STATES["03-mouth_open-A"], "mouth", "mouth_smile-A") == STATES["04-mouth_smile-A"])
sw["state03_remove_mouth_equals_neutral"] = (switch_remove(STATES["03-mouth_open-A"], "mouth") == neutral)
sw["state05_apply_smile_equals_state06"] = (switch_apply(STATES["05-both-eyes-closed"], "mouth", "mouth_smile-A") == STATES["06-both-eyes-closed-smile"])
sw["state02_apply_mouth_open_equals_state09"] = (switch_apply(STATES["02-eye_r_closed-B"], "mouth", "mouth_open-A") == STATES["09-eye_r_closed-mouth_open"])
z6 = STATES["06-both-eyes-closed-smile"]
for z in ("eye_l", "eye_r", "mouth"):
    z6 = switch_remove(z6, z)
sw["state06_remove_all_equals_neutral"] = (z6 == neutral)
sw["left_eye_state_equals_published_pilot_504d1f7"] = (
    STATES["01-eye_l_closed-B"] == T.read_rgb(ROOT / "source" / "pilot-overlay-full.png"))
chk("expression_switching_round_trips", all(v for v in sw.values()), sw)

# ------------------------------------------------ 6. source copies + protected files
copies = {
    "source/source-frame.webp": "art-studio/references/originals/IMG_4038_rig-pose.webp",
    "source/element-eye_l_closed-B.png": "art-studio/stages/05-independent-layers/E2-facial-states/elements/eye_l_closed-B.png",
    "source/element-eye_r_closed-B.png": "art-studio/stages/05-independent-layers/E2-facial-states/elements/eye_r_closed-B.png",
    "source/element-mouth_open-A.png": "art-studio/stages/05-independent-layers/E2-facial-states/elements/mouth_open-A.png",
    "source/element-mouth_smile-A.png": "art-studio/stages/05-independent-layers/E2-facial-states/elements/mouth_smile-A.png",
    "source/element-mouth_closed-A.png": "art-studio/stages/05-independent-layers/E2-facial-states/elements/mouth_closed-A.png",
    "source/e1-13_head.png": "art-studio/stages/05-independent-layers/layers/13_head.png",
    "source/e1-14_eye_l_open.png": "art-studio/stages/05-independent-layers/layers/14_eye_l_open.png",
    "source/e1-15_eye_r_open.png": "art-studio/stages/05-independent-layers/layers/15_eye_r_open.png",
    "source/e1-16_mouth_neutral.png": "art-studio/stages/05-independent-layers/layers/16_mouth_neutral.png",
    "source/layer-map-reference.json": "art-studio/stages/05-independent-layers/layer-map.json",
}
copy_ok = {}
for a, b in copies.items():
    copy_ok[a] = (ROOT / a).read_bytes() == Path("/home/user/Actual-new-clicker-") .joinpath(b).read_bytes()
chk("source_copies_byte_identical", all(copy_ok.values()), copy_ok)

protected_paths = [
    "art-studio/stages/05-independent-layers/PLAN.md",
    "art-studio/MANIFEST.json", "art-studio/ANIMATION-SPEC.md",
    "art-studio/references/originals/IMG_4038_rig-pose.webp",
    "art-studio/stages/05-independent-layers/layer-map.json",
    "art-studio/stages/05-independent-layers/E2-facial-states/E2-DECISION.md",
    "art-studio/stages/05-independent-layers/E2-facial-states/E2-decision.json",
    "art-studio/stages/05-independent-layers/E2-FINAL-DECISION/E2-FINAL-DECISION.md",
    "art-studio/stages/05-independent-layers/E2-FINAL-DECISION/E2-final-decision.json",
    "art-studio/stages/05-independent-layers/E2-facial-states/elements/eye_l_closed-B.png",
    "art-studio/stages/05-independent-layers/layers/14_eye_l_open.png",
    "docs/HEROINE-01-recovery.md", "package.json",
]
git_base = "504d1f71f8969c5ea0a2ee235a7c7cab28a5d96d"
unchanged = {}
for p in protected_paths:
    try:
        old = subprocess.run(["git", "show", f"{git_base}:{p}"],
                             cwd="/home/user/Actual-new-clicker-",
                             capture_output=True, check=True).stdout
        cur = Path("/home/user/Actual-new-clicker-") .joinpath(p).read_bytes()
        unchanged[p] = hashlib.sha256(old).hexdigest() == hashlib.sha256(cur).hexdigest()
    except Exception:
        unchanged[p] = False
chk("protected_published_files_unchanged_vs_504d1f7",
    all(unchanged.values()), unchanged)
tree_diff = subprocess.run(
    ["git", "diff", "--name-only", f"{git_base}..HEAD", "--", ".",
     ":(exclude)art-studio/stages/05-independent-layers/E2-FACE-BASE-FULL"],
    cwd="/home/user/Actual-new-clicker-", capture_output=True, text=True)
outside_tree = [x for x in tree_diff.stdout.splitlines() if x.strip()]
chk("no_changes_anywhere_outside_this_stage_folder", not outside_tree,
    {"changedPaths": outside_tree})

# ------------------------------------------------ 7. SHA256 manifest
skip = (".scratch", "__pycache__", ".gitignore")
files = []
for p in sorted(ROOT.rglob("*")):
    if not p.is_file() or any(s in str(p) for s in skip):
        continue
    if p.name in ("SHA256-MANIFEST.txt", "SHA256-MANIFEST.json",
                  "verify-report.json"):
        continue
    files.append((str(p.relative_to(ROOT)), p.stat().st_size, T.sha256(p)))
lines = [f"{h}  {n}" for n, s, h in files]
(ROOT / "SHA256-MANIFEST.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
T.write_json(ROOT / "SHA256-MANIFEST.json", {
    "stage": "E2-FACE-BASE-FULL", "fileCount": len(files),
    "totalBytes": sum(f[1] for f in files),
    "files": [{"path": n, "bytes": s, "sha256": h} for n, s, h in files]})
chk("sha256_manifest", len(files) > 0,
    {"fileCount": len(files), "totalBytes": sum(f[1] for f in files)})

# ------------------------------------------------ 8. iPhone-friendly gallery
PILOT_LENS = [(378, 168), (382, 161), (388, 155), (394, 151), (400, 150),
              (405, 152), (409, 157), (410, 164), (408, 170), (403, 175),
              (396, 177), (388, 176), (381, 173)]


def face2x(path, buf, name):
    tmp = ROOT / f".g-{name}.png"
    T.write_rgb(tmp, buf)
    T.crop_zoom(path, tmp, B.FACE_CROP, "200%")
    tmp.unlink()


def zoom8(path, buf, crop, name):
    tmp = ROOT / f".g-{name}.png"
    T.write_rgb(tmp, buf)
    T.crop_zoom(path, tmp, crop, "800%")
    tmp.unlink()


def mask8(path, alpha, crop, name):
    tmp = ROOT / f".g-{name}.png"
    T.write_gray(tmp, alpha)
    T.run(["convert", tmp, "-crop", crop, "+repage", "-filter", "Point",
           "-resize", "800%", "-colorspace", "sRGB", "-type", "TrueColor",
           "PNG32:" + str(path)])
    tmp.unlink()


def sheet(name, panels, cols=2):
    return T.sheet(CMP / name, panels, cols=cols)


# original vs full clean base
p1, p2 = PANELS / "face-original-2x.png", PANELS / "face-full-base-2x.png"
face2x(p1, SRC, "orig2x")
face2x(p2, FULL_BASE, "base2x")
sheet("00-original-vs-full-base.png", [(p1, "A  ORIGINAL (neutral)"),
                                       (p2, "B  FULL CLEAN FACE BASE")])

# all states, 2 columns, one row per state
state_panels = []
for n in B.STATES:
    p = PANELS / f"face-{n}-2x.png"
    face2x(p, STATES[n], n)
    label = n.replace("-", " ")
    if n == "00-neutral":
        label = "00 NEUTRAL (original)"
    state_panels.append((p, label))
sheet("01-all-expressions-and-switching.png", state_panels)

# per-area 8x comparisons
areas = [
    ("02-left-eye.png", B.ZOOM_L, "eye_l_closed-B", PILOT_LENS, "LEFT EYE"),
    ("03-right-eye.png", B.ZOOM_R, "eye_r_closed-B", B.EYE_R_LENS, "RIGHT EYE"),
    ("04-mouth-open.png", B.ZOOM_M, "mouth_open-A", B.MOUTH_LENS, "MOUTH OPEN"),
    ("05-mouth-smile.png", B.ZOOM_M, "mouth_smile-A", B.MOUTH_LENS, "MOUTH SMILE"),
]
for fname, crop, expr, lens, title in areas:
    pub = T.read_rgb(CMP / f"published-E2-{expr}-full.png")
    state = STATES[[n for n, e in B.STATES.items() if e == [expr]][0]]
    tag = fname[:-4]
    a, b, c, d = (PANELS / f"{tag}-a.png", PANELS / f"{tag}-b.png",
                  PANELS / f"{tag}-c.png", PANELS / f"{tag}-d.png")
    zoom8(a, SRC, crop, tag + "a")
    zoom8(b, pub, crop, tag + "b")
    zoom8(c, state, crop, tag + "c")
    mask8(d, MASKS[expr], crop, tag + "d")
    sheet(fname, [(a, f"A  {title} ORIGINAL x8"),
                  (b, "B  PUBLISHED E2 x8"),
                  (c, "C  NEW RESULT x8"),
                  (d, "D  PRECISE MASK x8")])

# all four mattes
mp = []
for e in B.EXPR:
    p = PANELS / f"mask-{e}-8x.png"
    crop = B.ZOOM_M if e.startswith("mouth") else (
        B.ZOOM_L if e.startswith("eye_l") else B.ZOOM_R)
    mask8(p, MASKS[e], crop, "m-" + e)
    mp.append((p, e + "  MASK x8"))
sheet("06-all-four-masks.png", mp)

# protection map on a 4x face crop
base_map = ROOT / ".g-map.png"
face2x(base_map, STATES["06-both-eyes-closed-smile"], "map")  # 200% placeholder
T.run(["convert", ROOT / "states" / "06-both-eyes-closed-smile.png",
       "-crop", B.FACE_CROP, "+repage", "-filter", "Point", "-resize", "400%",
       "-depth", "8", str(base_map)])
args = ["convert", str(base_map), "-strokewidth", "2"]
for r in B.PROTECTED.values():
    x0, y0, x1, y1 = r
    sx0, sy0, sx1, sy1 = (x0 - 340) * 4, (y0 - 105) * 4, (x1 - 340) * 4, (y1 - 105) * 4
    args += ["-stroke", "rgba(0,235,120,0.9)", "-fill", "none",
             "-draw", f"rectangle {sx0},{sy0} {sx1},{sy1}"]
for poly in (PILOT_LENS, B.EYE_R_LENS, B.MOUTH_LENS):
    pts = " ".join(f"{(x - 340) * 4},{(y - 105) * 4}" for x, y in poly)
    args += ["-stroke", "rgba(255,40,40,0.95)", "-fill", "none",
             "-draw", f"polygon {pts}"]
args += ["-stroke", "none", "-fill", T.INK, "-font", T.FONT, "-pointsize", "16",
         "-annotate", "+8+20",
         "GREEN = protected, pixel-identical    RED = fitted mask lens",
         "PNG32:" + str(CMP / "07-protection-map.png")]
T.run(args)
base_map.unlink(missing_ok=True)

# original vs result at full frame (2 columns, 1:1 scaled to 50% for iPhone)
f1, f2 = PANELS / "full-original-50.png", PANELS / "full-result-50.png"
T.run(["convert", ROOT / "source" / "source-frame.webp", "-alpha", "off",
       "-resize", "50%", "-depth", "8", str(f1)])
T.run(["convert", ROOT / "states" / "06-both-eyes-closed-smile.png",
       "-resize", "50%", "-depth", "8", str(f2)])
sheet("08-original-vs-result-full-frame.png",
      [(f1, "A  ORIGINAL 848x1264 (50%)"),
       (f2, "B  RESULT: both eyes closed + smile (50%)")])

# ------------------------------------------------ 9. index (mobile friendly)
idx = ["# E2 / FULL FACE BASE — визуальная проверка (iPhone)", "",
       "Один экран = одна картинка; каждая открывается в полном размере по нажатию.",
       "Все листы шириной не более ~1300 px и масштабируются под ширину телефона.",
       "", "## Главное", "",
       "![Оригинал и полная чистая основа](comparison/00-original-vs-full-base.png)", "",
       "![Все выражения и переключение](comparison/01-all-expressions-and-switching.png)", "",
       "![Оригинал и результат, весь кадр](comparison/08-original-vs-result-full-frame.png)", "",
       "![Карта защитных зон](comparison/07-protection-map.png)", "",
       "## Участки ×8", ""]
for fname, crop, expr, lens, title in areas:
    idx += [f"![{title}](comparison/{fname})", ""]
idx += ["## Четыре точные маски", "",
        "![Все маски](comparison/06-all-four-masks.png)", "",
        "## Отдельные панели (удобно зумить)", ""]
for p in sorted(PANELS.glob("*.png")):
    idx.append(f"- [{p.stem}](comparison/panels/{p.name})")
idx += ["", "## Документы", "",
        "- [Технический отчёт](E2-FACE-BASE-FULL-REPORT.md)",
        "- [Автоматическая проверка (JSON)](verify-report.json)",
        "- [Машиночитаемые метрики](E2-face-base-full.json)",
        "- [Матрица переключения](states/switch-matrix.json)",
        "- [SHA256-манифест](SHA256-MANIFEST.txt) · [JSON](SHA256-MANIFEST.json)",
        "- [Блок A](blocks/A-right-eye/block-A-report.json) · [Блок B](blocks/B-mouth/block-B-report.json)",
        "", "Генеративный ИИ, inpainting и generative fill не применялись.", ""]
(ROOT / "E2-FACE-BASE-FULL-INDEX.md").write_text("\n".join(idx), encoding="utf-8")

# ------------------------------------------------ 10. write report
report["errors"] = errors
report["summary"] = {
    "checksTotal": len(report["checks"]),
    "checksPassed": sum(1 for v in report["checks"].values() if v["pass"]),
    "checksFailed": len(errors),
    "protectedZones": len(B.PROTECTED),
    "outputsChecked": len(all_outputs),
    "pngFilesChecked": len(png_files),
    "states": len(B.STATES),
    "mattes": len(MASKS),
    "manifestFiles": len(files),
}
T.write_json(ROOT / "verify-report.json", report)
print(json.dumps(report["summary"], indent=2))
if errors:
    print("FAILED CHECKS:", errors)
    sys.exit(1)
print("ALL AUTOMATED CHECKS PASSED")
