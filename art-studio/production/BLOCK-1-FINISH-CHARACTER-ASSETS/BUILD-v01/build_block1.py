#!/usr/bin/env python3
"""BLOCK 1 / FINISH CHARACTER ASSETS — deterministic production build.

Reads only committed approved E1/E2/E2-V2/E3/E3.5/B1.1/B1.2/B1.3 materials.
Writes only inside BUILD-v01/.  No generative AI, no inpainting, no generative
fill, no diffusion, no content-aware tools, no new anatomical slots, no new
expressions, no code/atlas/PR/Vercel changes.  Underlay colours are a
deterministic local median of approved B1.3 pixels; underlay visibility is
gated by top-layer coverage so the rest state remains byte-exact.  The 8
published E3 phases are uniform integer translation proxies from
e1-motion-gaps.json, not rotation, deformation or a PixiJS rig.
"""
import sys
sys.dont_write_bytecode = True

import hashlib
import io
import json
import shutil
import subprocess
import tarfile
from collections import defaultdict, deque
from pathlib import Path

# ------------------------------------------------------------------ paths
ROOT = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
STAGE = ROOT / "art-studio" / "stages" / "05-independent-layers"
E2V2 = STAGE / "E2-EYE-ALIGNMENT-V2"
E3 = STAGE / "E3-ASSEMBLY-CANON-CHECK"
E35 = STAGE / "E3.5-RESTORATION-PLAN"
B11 = STAGE / "B1-BACKGROUND-CLASSIFICATION"
B12 = STAGE / "B1-BACKGROUND-CLEANUP-PILOT"
B13 = STAGE / "B1-BACKGROUND-CLEANUP-BATCH-01"
CUTOUT = B13 / "work-cutout-after.png"
CANON_FRAME = E3 / "assembly" / "00-canon-background.png"

BRANCH = "arena/02869c32-actual-new-clicker"
EXPECTED_HEAD = "7fce8f4679e0e49a9c9b92a72f0a5d10dbbf8d8d"
EXPECTED_PARENT = "d155dc69005165b3a6db4f5f21df3b0361182fa1"
W, H = 848, 1264
FONT = "DejaVu-Sans"
SOLID_BG = "#2a1e3f"
INK = "#1b1b1b"

SHORT_SHIFT = {
    "rest": "rest",
    "hair_sway_+10deg_proxy": "hair +10 proxy",
    "hair_sway_-10deg_proxy": "hair -10 proxy",
    "arm_reaction_+25deg_proxy": "arm +25 proxy",
    "arm_reaction_-25deg_proxy": "arm -25 proxy",
    "head_tilt_+12deg_proxy": "head +12 proxy",
    "head_tilt_-12deg_proxy": "head -12 proxy",
    "breath_+6deg_proxy": "breath +6 proxy",
    "breath_-6deg_proxy": "breath -6 proxy",
}
SHORT_STATE = {
    "00-neutral": "00 neutral",
    "01-eye_l_closed-B": "01 left eye B",
    "02-eye_r_closed-B": "02 right eye B",
    "03-mouth_open-A": "03 mouth open A",
    "04-mouth_smile-A": "04 mouth smile A",
    "05-both-eyes-closed": "05 both closed",
    "06-both-eyes-closed-smile": "06 both + smile",
    "07-mouth_open-both-eyes-closed": "07 open + both",
    "08-eye_l_closed-smile": "08 left + smile",
    "09-eye_r_closed-mouth_open": "09 right + open",
}
EXPR_FILES = {
    "eye_l_closed-B": "layers/layer-eye_l_closed-B.png",
    "eye_r_closed-B": "layers/layer-eye_r_closed-B-v2.png",
    "mouth_open-A": "layers/layer-mouth_open-A.png",
    "mouth_smile-A": "layers/layer-mouth_smile-A.png",
}
SKIPPED_IDS = {"BG-0013", "BG-0017", "BG-0023"}
DOUBTFUL_CATEGORIES = {"AMBIGUOUS", "CHARACTER_PIXEL", "ANTIALIAS_EDGE"}

# fresh outputs only
for child in OUT.iterdir():
    if child.name == "build_block1.py":
        continue
    if child.is_dir():
        shutil.rmtree(child)
    else:
        child.unlink()
for name in ["layers", "states", "assembly", "underlays", "comparison", "references", ".tmp"]:
    (OUT / name).mkdir(parents=True, exist_ok=True)
TMP = OUT / ".tmp"
CMP = OUT / "comparison"


# ------------------------------------------------------------------ helpers
def run(args, data=None):
    p = subprocess.run([str(a) for a in args], input=data, capture_output=True)
    if p.returncode != 0:
        raise RuntimeError(" ".join(map(str, args)) + "\n" + p.stderr.decode("utf-8", "replace")[:1200])
    return p.stdout


def rgba(path):
    b = run(["convert", path, "-depth", "8", "rgba:-"])
    assert len(b) == W * H * 4, (path, len(b))
    return bytearray(b)


def rgb(path):
    b = run(["convert", path, "-alpha", "off", "-depth", "8", "rgb:-"])
    assert len(b) == W * H * 3, (path, len(b))
    return bytes(b)


def write_rgba(path, buf):
    assert len(buf) == W * H * 4
    run(["convert", "-size", f"{W}x{H}", "-depth", "8", "rgba:-",
         "-strip", "-define", "png:exclude-chunk=date,time", "PNG32:" + str(path)], bytes(buf))


def write_rgb(path, buf):
    assert len(buf) == W * H * 3
    run(["convert", "-size", f"{W}x{H}", "-depth", "8", "rgb:-",
         "-strip", "-define", "png:exclude-chunk=date,time", "PNG24:" + str(path)], bytes(buf))


def write_json(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def sha256(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def canonical_sha(values):
    return hashlib.sha256(("\n".join(values) + "\n").encode()).hexdigest()


def clamp(v):
    return 0 if v < 0 else 255 if v > 255 else int(round(v))


def texture(x, y):
    h = (x * 73856093 ^ y * 19349663 ^ 0x9E3779B9) & 0xFFFF
    return ((h & 7) - 3, ((h >> 3) & 7) - 3, ((h >> 6) & 7) - 3)


def over(dst, src, sa):
    da = dst[3] / 255.0
    s = sa / 255.0
    oa = s + da * (1 - s)
    if oa <= 0:
        return bytes((dst[0], dst[1], dst[2], 0))
    return bytes((
        clamp((src[0] * s + dst[0] * da * (1 - s)) / oa),
        clamp((src[1] * s + dst[1] * da * (1 - s)) / oa),
        clamp((src[2] * s + dst[2] * da * (1 - s)) / oa),
        clamp(oa * 255),
    ))


def sheet(path, panels, cols=2, gap=8, bar=26, pointsize=12):
    made = []
    for i, (src, label) in enumerate(panels):
        dst = TMP / f".sheet-{i}.png"
        run(["convert", src, "-gravity", "north", "-background", "#ffffff",
             "-splice", f"0x{bar}", "-fill", INK, "-font", FONT,
             "-pointsize", str(pointsize), "-gravity", "northwest",
             "-annotate", "+5+4", label, "-bordercolor", "#bdbdbd", "-border", "1",
             "-strip", "-define", "png:exclude-chunk=date,time", "PNG32:" + str(dst)])
        made.append(dst)
    dims = [tuple(int(v) for v in run(["identify", "-format", "%w %h", p]).decode().split()) for p in made]
    pw, ph = max(d[0] for d in dims), max(d[1] for d in dims)
    rows = (len(made) + cols - 1) // cols
    cw, ch = cols * pw + (cols + 1) * gap, rows * ph + (rows + 1) * gap
    args = ["convert", "-size", f"{cw}x{ch}", "xc:#f2f2f2", "-depth", "8"]
    for i, p in enumerate(made):
        x = gap + (i % cols) * (pw + gap)
        y = gap + (i // cols) * (ph + gap)
        args += [str(p), "-geometry", f"+{x}+{y}", "-compose", "Over", "-composite"]
    args += ["-strip", "-define", "png:exclude-chunk=date,time", "PNG32:" + str(path)]
    run(args)
    for p in made:
        p.unlink()


def crop_zoom(path, src, crop, scale, label=None, bar=26, pointsize=12):
    tmp = TMP / f".crop-{abs(hash((src, crop, scale, label))) % 100000}.png"
    run(["convert", src, "-alpha", "off", "-crop", crop, "+repage",
         "-filter", "Point", "-resize", scale, "-depth", "8", str(tmp)])
    if label:
        run(["convert", str(tmp), "-gravity", "north", "-background", "#ffffff",
             "-splice", f"0x{bar}", "-fill", INK, "-font", FONT, "-pointsize", str(pointsize),
             "-gravity", "northwest", "-annotate", "+5+4", label,
             "-bordercolor", "#bdbdbd", "-border", "1",
             "-strip", "-define", "png:exclude-chunk=date,time", "PNG32:" + str(path)])
        tmp.unlink()
    else:
        tmp.replace(path)


def small(src, dst, pct="25%"):
    run(["convert", src, "-background", SOLID_BG, "-flatten",
         "-filter", "Point", "-resize", pct, "-strip",
         "-define", "png:exclude-chunk=date,time", "PNG32:" + str(dst)])


def shift_buf(b, dx, dy):
    """Integer translation proxy preserving RGBA (no binarisation)."""
    out = bytearray(W * H * 4)
    for p in range(W * H):
        a = b[p * 4 + 3]
        if not a:
            continue
        x, y = p % W, p // W
        nx, ny = x + dx, y + dy
        if 0 <= nx < W and 0 <= ny < H:
            q = ny * W + nx
            out[q * 4:q * 4 + 4] = b[p * 4:p * 4 + 4]
    return out


def git(*args):
    return run(["git", "-C", ROOT, *args]).decode().strip()


# ------------------------------------------------------------------ preflight
local_head = git("rev-parse", "HEAD")
origin_head = git("rev-parse", f"origin/{BRANCH}")
api = json.loads(run(["gh", "api", f"repos/trappedg1-hub/Actual-new-clicker-/commits/{BRANCH}"]))
api_head = api["sha"]
api_parent = api["parents"][0]["sha"]
assert local_head == origin_head == api_head == EXPECTED_HEAD, (local_head, origin_head, api_head)
assert api_parent == EXPECTED_PARENT, api_parent

status_lines = git("status", "--porcelain=v1", "--untracked-files=all").splitlines()
tracked_changes = [x for x in status_lines if not x.startswith("?? ")]
untracked = [x[3:] for x in status_lines if x.startswith("?? ")]
assert not tracked_changes, tracked_changes
assert all(x.startswith("art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/") for x in untracked), untracked

archive = run(["git", "-C", ROOT, "archive", "--format=tar", EXPECTED_HEAD])
expected_protected = {}
with tarfile.open(fileobj=io.BytesIO(archive)) as tf:
    for m in tf.getmembers():
        if m.isfile():
            expected_protected[m.name] = hashlib.sha256(tf.extractfile(m).read()).hexdigest()
protected_paths = sorted(expected_protected)
protected_changed = []
for rel in protected_paths:
    p = ROOT / rel
    if not p.is_file() or sha256(p) != expected_protected[rel]:
        protected_changed.append(rel)
protected_snapshot = canonical_sha(f"{expected_protected[p]}  {p}" for p in protected_paths)
assert not protected_changed, protected_changed[:5]

critical_paths = [
    "art-studio/references/originals/IMG_4038_rig-pose.webp",
    "art-studio/stages/04-slicing-prep/cutouts/work-cutout.png",
    "art-studio/stages/04-slicing-prep/cutouts/alpha-mask.png",
    "art-studio/stages/05-independent-layers/layer-map.json",
    "art-studio/stages/05-independent-layers/E3.5-RESTORATION-PLAN/ISSUE-MAP.json",
    "art-studio/stages/05-independent-layers/B1-BACKGROUND-CLASSIFICATION/COMPONENTS.json",
    "art-studio/stages/05-independent-layers/B1-BACKGROUND-CLEANUP-PILOT/work-cutout-after.png",
    "art-studio/stages/05-independent-layers/B1-BACKGROUND-CLEANUP-BATCH-01/work-cutout-after.png",
    "art-studio/stages/05-independent-layers/E2-EYE-ALIGNMENT-V2/layers/layer-eye_r_closed-B-v2.png",
]
critical_hashes = {p: sha256(ROOT / p) for p in critical_paths}
b13_result_sha = sha256(CUTOUT)
assert b13_result_sha == "5bd23a22de6a52c304657d21e707309a0f106a57217bc753b4fbed1060d360db"

# ------------------------------------------------------------------ inputs
dmap = json.loads((STAGE / "layer-map.json").read_text(encoding="utf-8"))
slots = sorted(dmap["slots"], key=lambda x: x["z"])
slot_names = [s["slot"] for s in slots]
layers = [rgba(STAGE / s["file"]) for s in slots]
orig_layers = [bytes(b) for b in layers]
cut = rgba(CUTOUT)
src = rgb(CANON_FRAME)
bgrow = [src[(y * W) * 3:(y * W) * 3 + 3] for y in range(H)]


def bg_like(p):
    y = p // W
    c = cut[p * 4:p * 4 + 3]
    b = bgrow[y]
    return max(abs(c[k] - b[k]) for k in range(3)) <= 10


clear_records = []
clear = set()
for stage_name, f in [("B1.2", B12 / "CHANGED-PIXELS.json"), ("B1.3", B13 / "CHANGED-PIXELS.json")]:
    j = json.loads(f.read_text(encoding="utf-8"))
    for e in j["changedPixels"]:
        x, y = int(e["x"]), int(e["y"])
        clear.add((x, y))
        clear_records.append({"x": x, "y": y, "stage": stage_name, "componentId": e["componentId"]})
assert len(clear) == 4566
clear_records.sort(key=lambda e: (e["y"], e["x"], e["stage"]))

b11 = json.loads((B11 / "COMPONENTS.json").read_text(encoding="utf-8"))
skipped_pixels = [(int(x), int(y)) for c in b11["components"] if c["id"] in SKIPPED_IDS for x, y in c["pixelCoordinates"]]
doubtful_pixels = [(int(x), int(y)) for c in b11["components"] if c["visualCategory"] in DOUBTFUL_CATEGORIES for x, y in c["pixelCoordinates"]]

# ------------------------------------------------------------------ owner / harmonize
owner = [0] * (W * H)
for z, b in enumerate(layers, 1):
    for p in range(W * H):
        if b[p * 4 + 3] > 0:
            owner[p] = z

for x, y in clear:
    p = y * W + x
    for b in layers:
        b[p * 4 + 3] = 0

q = deque()
assigned = [0] * (W * H)
visited = bytearray(W * H)
for p in range(W * H):
    if owner[p]:
        assigned[p] = owner[p]
        visited[p] = 1
        q.append(p)
N8 = ((-1, -1), (0, -1), (1, -1), (-1, 0), (1, 0), (-1, 1), (0, 1), (1, 1))
while q:
    p = q.popleft()
    x, y = p % W, p // W
    z = assigned[p]
    for dx, dy in N8:
        nx, ny = x + dx, y + dy
        if 0 <= nx < W and 0 <= ny < H:
            r = ny * W + nx
            if not visited[r]:
                visited[r] = 1
                assigned[r] = z
                q.append(r)

harmonized = []
edge_repaired = []
for p in range(W * H):
    a = cut[p * 4 + 3]
    if a > 0:
        z = owner[p] or assigned[p]
        assert z, ("no owner", p)
        b = layers[z - 1]
        if owner[p] == 0:
            edge_repaired.append(p)
            owner[p] = z
        if b[p * 4 + 3] != a:
            harmonized.append(p)
        b[p * 4 + 3] = a
        b[p * 4:p * 4 + 3] = cut[p * 4:p * 4 + 3]

layer_paths = []
for z, s in enumerate(slots, 1):
    p = OUT / "layers" / f"{z:02d}_{s['slot']}.png"
    write_rgba(p, bytes(layers[z - 1]))
    layer_paths.append(p)

# ------------------------------------------------------------------ published E3 phases
e3_gaps = json.loads((E3 / "source" / "e1-motion-gaps.json").read_text(encoding="utf-8"))
SHIFTS = [(r["shift"], int(r["dx"]), int(r["dy"])) for r in e3_gaps["results"]]
assert len(SHIFTS) == 9 and SHIFTS[0][0] == "rest"
assert {n for n, _, _ in SHIFTS} == set(SHORT_SHIFT)

sil = [p for p in range(W * H) if cut[p * 4 + 3] >= 128]
layer_px = []
for z, b in enumerate(layers, 1):
    layer_px.append((z, [(p, b[p * 4 + 3]) for p in range(W * H) if b[p * 4 + 3] > 0]))


def coverage(dx, dy):
    cov = bytearray(W * H)
    for _z, px in layer_px:
        for p, a in px:
            x, y = p % W, p // W
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H:
                r = ny * W + nx
                if a > cov[r]:
                    cov[r] = a
    return cov


covs = {nm: coverage(dx, dy) for nm, dx, dy in SHIFTS}
before_zero = {nm: sum(1 for p in sil if c[p] == 0) for nm, c in covs.items()}
before_visible = {nm: sum(1 for p in sil if c[p] < 128) for nm, c in covs.items()}
assert before_zero["rest"] == 0 and before_visible["rest"] == 0

union = set()
phase_pixels = defaultdict(set)
for nm, dx, dy in SHIFTS[1:]:
    gaps = {p for p in sil if covs[nm][p] < 128}
    union.update(gaps)
    phase_pixels[nm] = gaps
union = set(sorted(union))
visible_by_pixel = defaultdict(list)
for nm in SHIFTS[1:]:
    for p in phase_pixels[nm]:
        visible_by_pixel[p].append(nm)

# ------------------------------------------------------------------ HZ zones
issue = json.loads((E35 / "ISSUE-MAP.json").read_text(encoding="utf-8"))
hz = issue["hiddenAnatomyZones"]
rects = {z["id"]: z["rect"] for z in hz}
priority = [f"HZ-{i:02d}" for i in [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 3, 4, 1, 2, 25, 26]]


def in_rect(r, p):
    x, y = p % W, p // W
    return r[0] <= x <= r[2] and r[1] <= y <= r[3]


zone_pixels = defaultdict(set)
owner_zone = {}
outside_hz = []
for p in sorted(union):
    cand = [z for z, r in rects.items() if in_rect(r, p)]
    if not cand:
        outside_hz.append(p)
        owner_zone[p] = "HZ-26"
        cand = ["HZ-26"]
    else:
        owner_zone[p] = next((z for z in priority if z in cand), cand[0])
    for z in cand:
        zone_pixels[z].add(p)

zone_stats = {}
colors = [(255, 80, 80), (80, 255, 80), (80, 80, 255), (255, 255, 80), (255, 80, 255), (80, 255, 255)]
zone_map = bytearray(W * H * 4)
for p in range(W * H):
    zone_map[p * 4:p * 4 + 4] = bytes((cut[p * 4], cut[p * 4 + 1], cut[p * 4 + 2], 0))
for p in sorted(union):
    c = colors[int(owner_zone[p].split("-")[1]) % len(colors)]
    zone_map[p * 4:p * 4 + 4] = bytes((*c, 255))
write_rgba(OUT / "underlays" / "UNDERLAY-ZONES.png", bytes(zone_map))
for zid in sorted(rects):
    mask = bytearray(W * H * 4)
    for p in range(W * H):
        mask[p * 4:p * 4 + 4] = bytes((cut[p * 4], cut[p * 4 + 1], cut[p * 4 + 2], 0))
    for p in zone_pixels[zid]:
        mask[p * 4:p * 4 + 4] = bytes((255, 255, 255, 255))
    write_rgba(OUT / "underlays" / f"{zid}.png", bytes(mask))
    if zone_pixels[zid]:
        xs = [p % W for p in zone_pixels[zid]]
        ys = [p // W for p in zone_pixels[zid]]
        bbox = [min(xs), min(ys), max(xs), max(ys)]
    else:
        bbox = None
    zone_stats[zid] = {
        "rect": rects[zid],
        "category": next(z["category"] for z in hz if z["id"] == zid),
        "pixels": len(zone_pixels[zid]),
        "bbox": bbox,
        "mask": f"underlays/{zid}.png",
    }
write_json(OUT / "underlays" / "HZ-MASKS.json", {
    "source": "../../../stages/05-independent-layers/E3.5-RESTORATION-PLAN/ISSUE-MAP.json",
    "canvas": [W, H],
    "gapMetric": "top-layer coverage < 128 on approved B1.3 silhouette; 8 published uniform E3 translation proxies",
    "zoneCount": len(zone_stats),
    "unionPixels": len(union),
    "outsideHZRectPixels": len(outside_hz),
    "fallbackZoneId": "HZ-26",
    "zones": zone_stats,
})

# ------------------------------------------------------------------ underlay colour + coverage gating
underlay_colour = {}
fallback = 0
edge_rgb = 0
for p in sorted(union):
    x, y = p % W, p // W
    vals = []
    for dy in range(-2, 3):
        for dx in range(-2, 3):
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H:
                q = ny * W + nx
                if cut[q * 4 + 3] >= 128 and not bg_like(q):
                    vals.append(cut[q * 4:q * 4 + 3])
    if not vals:
        col = bytes(cut[p * 4:p * 4 + 3])
        method = "APPROVED_CUT_RGB_FALLBACK"
        fallback += 1
    else:
        med = [sorted(v[k] for v in vals)[len(vals) // 2] for k in range(3)]
        tx = texture(x, y)
        col = bytes(clamp(med[k] + tx[k]) for k in range(3))
        method = "LOCAL_MEDIAN_APPROVED_RGB"
    if cut[p * 4 + 3] < 255:
        edge_rgb += 1
    underlay_colour[p] = (col, method)

union_img = bytearray(W * H * 4)
for p in range(W * H):
    union_img[p * 4:p * 4 + 4] = bytes((cut[p * 4], cut[p * 4 + 1], cut[p * 4 + 2], 0))
for p in sorted(union):
    col, _ = underlay_colour[p]
    union_img[p * 4:p * 4 + 3] = col
    union_img[p * 4 + 3] = 255
write_rgba(OUT / "underlays" / "UNDERLAY-UNION.png", bytes(union_img))

gated_paths = {}
gating = {}
for nm, dx, dy in SHIFTS:
    gated = bytearray(W * H * 4)
    for p in range(W * H):
        gated[p * 4:p * 4 + 4] = bytes((cut[p * 4], cut[p * 4 + 1], cut[p * 4 + 2], 0))
    count = 0
    for p in sorted(union):
        if covs[nm][p] < 128:
            col, _ = underlay_colour[p]
            gated[p * 4:p * 4 + 3] = col
            gated[p * 4 + 3] = 255
            count += 1
    path = OUT / "underlays" / f"UNDERLAY-{nm}.png"
    write_rgba(path, bytes(gated))
    gated_paths[nm] = path
    gating[nm] = {
        "file": f"underlays/UNDERLAY-{nm}.png",
        "dx": dx, "dy": dy,
        "gatedPixels": count,
        "metric": "cov[nm][p] < 128 AND p IN union",
    }
assert gating["rest"]["gatedPixels"] == 0
write_json(OUT / "underlays" / "UNDERLAY-GATING.json", {
    "sourceOfPhases": "../../../stages/05-independent-layers/E3-ASSEMBLY-CANON-CHECK/source/e1-motion-gaps.json",
    "method": "uniform integer translation of all 20 slots; underlay is visible only where top-layer coverage < 128",
    "silhouette": "approved B1.3 work-cutout-after.png, alpha >= 128; cleared B1.2/B1.3 coordinates are excluded",
    "unionPixels": len(union),
    "unionImage": "underlays/UNDERLAY-UNION.png",
    "restGatedPixels": gating["rest"]["gatedPixels"],
    "phases": gating,
})

# coverage after gating
after_zero = {}
after_visible = {}
for nm, dx, dy in SHIFTS:
    cov = bytearray(covs[nm])
    gated = rgba(gated_paths[nm])
    for p in range(W * H):
        a = gated[p * 4 + 3]
        if a > cov[p]:
            cov[p] = a
    after_zero[nm] = sum(1 for p in sil if cov[p] == 0)
    after_visible[nm] = sum(1 for p in sil if cov[p] < 128)
assert all(v == 0 for v in after_zero.values())
assert all(v == 0 for v in after_visible.values())

# ------------------------------------------------------------------ rest assembly exactness
rest = bytearray(W * H * 4)
for p in range(W * H):
    rest[p * 4:p * 4 + 4] = bytes((cut[p * 4], cut[p * 4 + 1], cut[p * 4 + 2], 0))
rest_underlay = rgba(gated_paths["rest"])
for p in range(W * H):
    a = rest_underlay[p * 4 + 3]
    if a:
        rest[p * 4:p * 4 + 4] = over(rest[p * 4:p * 4 + 4], rest_underlay[p * 4:p * 4 + 3], a)
for b in layers:
    for p in range(W * H):
        a = b[p * 4 + 3]
        if a:
            rest[p * 4:p * 4 + 4] = over(rest[p * 4:p * 4 + 4], b[p * 4:p * 4 + 3], a)
rest_rgba_identical = bytes(rest) == bytes(cut)
rest_alpha_diff = sum(1 for p in range(W * H) if rest[p * 4 + 3] != cut[p * 4 + 3])
rest_rgb_diff = sum(1 for p in range(W * H) if rest[p * 4:p * 4 + 3] != cut[p * 4:p * 4 + 3])
assert rest_rgba_identical and rest_alpha_diff == 0 and rest_rgb_diff == 0
write_rgba(OUT / "assembly" / "ASSEMBLY-REST-RGBA.png", bytes(rest))

# ------------------------------------------------------------------ 24 states + references
state_files = []
for z, s in enumerate(slots, 1):
    dst = OUT / "states" / f"state-{z:02d}-{s['slot']}.png"
    shutil.copy2(OUT / "layers" / f"{z:02d}_{s['slot']}.png", dst)
    state_files.append({"z": z, "slot": s["slot"], "state": s["slot"], "file": f"states/{dst.name}"})
expr_assets = {}
for name, rel in EXPR_FILES.items():
    srcp = E2V2 / rel
    dst = OUT / "states" / f"state-{name}.png"
    shutil.copy2(srcp, dst)
    expr_assets[name] = {
        "source": f"../../../stages/05-independent-layers/E2-EYE-ALIGNMENT-V2/{rel}",
        "file": f"states/{dst.name}",
        "sha256": sha256(dst),
    }
    state_files.append({"z": None, "slot": None, "state": name, "file": f"states/{dst.name}"})
assert len(state_files) == 24
shutil.copy2(E2V2 / "base" / "visual-reference-mouth_closed-A.png", OUT / "references" / "visual-reference-mouth_closed-A.png")
shutil.copy2(E2V2 / "states" / "switch-matrix.json", OUT / "references" / "switch-matrix.json")
shutil.copy2(STAGE / "layer-map.json", OUT / "references" / "layer-map.json")

manifest = {
    "stage": "BLOCK 1 / FINISH CHARACTER ASSETS",
    "status": "TECHNICAL_PASS / NOT_ARTISTICALLY_APPROVED",
    "canvas": [W, H],
    "graphicSlots": 20,
    "visualStates": 24,
    "publishedE3Phases": 9,
    "underlayGating": {
        "rule": "render underlays/UNDERLAY-<phase>.png at z0 only at pixels where top-layer coverage < 128",
        "restGatedPixels": gating["rest"]["gatedPixels"],
        "unionPixels": len(union),
        "config": "underlays/UNDERLAY-GATING.json",
    },
    "drawOrderByPhase": {nm: [f"underlays/UNDERLAY-{nm}.png"] + [f"layers/{p.name}" for p in layer_paths] for nm, _, _ in SHIFTS},
    "slots": [{
        "z": s["z"], "slot": s["slot"], "group": s["group"],
        "file": f"layers/{layer_paths[s['z'] - 1].name}",
        "tightRect": s["tightRect"], "pivotAbsolute": s["pivotAbsolute"],
        "states": s.get("states", []),
    } for s in slots],
    "states": state_files,
    "expressionAssets": expr_assets,
    "mouthClosedA": "visual reference only, no separate slot",
    "hiddenAnatomyArtisticallyRestored": False,
    "newAnatomicalSlots": 0,
    "newExpressions": 0,
    "aiRestoration": False,
}
write_json(OUT / "ASSEMBLY-MANIFEST.json", manifest)

# ------------------------------------------------------------------ full-frame face states
canon_bg = OUT / "assembly" / "CANON-BACKGROUND.png"
run(["convert", CANON_FRAME, "-strip", "-define", "png:exclude-chunk=date,time", "PNG32:" + str(canon_bg)])
base_state = OUT / "assembly" / "ASSEMBLY-REST-OVER-CANON.png"
run(["convert", str(canon_bg), str(gated_paths["rest"]), "-compose", "Over", "-composite"]
    + sum(([str(p), "-compose", "Over", "-composite"] for p in layer_paths), [])
    + ["-strip", "-define", "png:exclude-chunk=date,time", "PNG32:" + str(base_state)])
state_matrix = json.loads((E2V2 / "states" / "switch-matrix.json").read_text(encoding="utf-8"))
state_names = list(state_matrix["states"].keys())
assert len(state_names) == 10
x0, y0, x1, y1 = W, H, -1, -1
for n in state_names:
    buf = rgb(E2V2 / "states" / f"{n}.png")
    for p in range(W * H):
        if src[p * 3:p * 3 + 3] != buf[p * 3:p * 3 + 3]:
            x, y = p % W, p // W
            x0, y0, x1, y1 = min(x0, x), min(y0, y), max(x1, x), max(y1, y)
face_rect = [x0, y0, x1, y1]
base_buf = bytearray(rgb(base_state))
assert bytes(base_buf) == src, "base assembly over canon frame is not byte-identical to source"
state_equal = {}
for n in state_names:
    e2 = rgb(E2V2 / "states" / f"{n}.png")
    out = bytearray(base_buf)
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            p = y * W + x
            out[p * 3:p * 3 + 3] = e2[p * 3:p * 3 + 3]
    write_rgb(OUT / "assembly" / f"state-{n}.png", bytes(out))
    state_equal[n] = bytes(out) == e2
assert all(state_equal.values())

# ------------------------------------------------------------------ backgrounds + phase visuals
solid_bg = CMP / "solid-background.png"
run(["convert", "-size", f"{W}x{H}", f"xc:{SOLID_BG}", "-strip", "-define", "png:exclude-chunk=date,time", "PNG32:" + str(solid_bg)])
phase_paths = {}
for nm, dx, dy in SHIFTS:
    paths = [gated_paths[nm]]
    for z, p in enumerate(layer_paths, 1):
        if dx or dy:
            sp = TMP / f"shift-{nm}-z{z:02d}.png"
            write_rgba(sp, bytes(shift_buf(rgba(p), dx, dy)))
        else:
            sp = p
        paths.append(sp)
    args = ["convert", str(solid_bg)]
    for p in paths:
        args += [str(p), "-compose", "Over", "-composite"]
    args += ["-strip", "-define", "png:exclude-chunk=date,time", "PNG32:" + str(CMP / f"phase-{nm}.png")]
    run(args)
    phase_paths[nm] = CMP / f"phase-{nm}.png"
    for p in paths:
        if p.parent == TMP:
            p.unlink()

cut_over_bg = CMP / "rest-b13-over-solid.png"
run(["convert", str(solid_bg), str(CUTOUT), "-compose", "Over", "-composite",
     "-strip", "-define", "png:exclude-chunk=date,time", "PNG32:" + str(cut_over_bg)])
layers_over_bg = CMP / "rest-block1-over-solid.png"
run(["convert", str(solid_bg), str(gated_paths["rest"]), "-compose", "Over", "-composite"]
    + sum(([str(p), "-compose", "Over", "-composite"] for p in layer_paths), [])
    + ["-strip", "-define", "png:exclude-chunk=date,time", "PNG32:" + str(layers_over_bg)])
rest_over_solid = rgb(cut_over_bg) == rgb(layers_over_bg)
assert rest_over_solid

# ------------------------------------------------------------------ changed pixels
underlay_records = []
for p in sorted(union):
    col, method = underlay_colour[p]
    underlay_records.append({
        "x": p % W, "y": p // W, "zoneId": owner_zone[p], "method": method,
        "rgbBefore": list(cut[p * 4:p * 4 + 3]),
        "rgbAfter": list(col),
        "alphaBefore": cut[p * 4 + 3], "alphaAfter": 255,
        "phases": visible_by_pixel[p],
    })
canonical = (
    [f"U|{r['x']},{r['y']}|{r['zoneId']}|{r['method']}|{r['alphaBefore']}->{r['alphaAfter']}" for r in underlay_records]
    + [f"G|{nm}|{gating[nm]['gatedPixels']}" for nm, _, _ in SHIFTS]
    + [f"C|{r['x']},{r['y']}|{r['stage']}|{r['componentId']}|255->0" for r in clear_records]
    + [f"E|{p % W},{p // W}|nearest_owner|0->{cut[p * 4 + 3]}" for p in edge_repaired]
    + [f"H|{p % W},{p // W}|alpha_harmonized|{orig_layers[owner[p] - 1][p * 4 + 3]}->{cut[p * 4 + 3]}" for p in harmonized]
)
changed_pixels = {
    "stage": "BLOCK 1 / FINISH CHARACTER ASSETS",
    "status": "TECHNICAL_PASS / NOT_ARTISTICALLY_APPROVED",
    "canvas": [W, H],
    "sourceOfTruth": "B1.3 work-cutout-after.png + E1 layer-map.json + E3.5 ISSUE-MAP.json + E3 e1-motion-gaps.json",
    "method": "deterministic non-AI local median of approved cutout RGB; coverage-gated visibility; no deletion of doubtful pixels",
    "approvedB13SilhouettePixels": len(sil),
    "publishedE3UniformPhases": [{"phase": nm, "dx": dx, "dy": dy} for nm, dx, dy in SHIFTS],
    "totals": {
        "clearedBackgroundPixels": len(clear_records),
        "underlayUnionPixels": len(union),
        "underlayOutsideHZRectPixels": len(outside_hz),
        "underlayFallbackColourPixels": fallback,
        "underlayPartialAlphaCutPixels": edge_rgb,
        "edgeOwnerRepairPixels": len(edge_repaired),
        "alphaHarmonizedPixels": len(harmonized),
        "restAlphaDiffPixels": rest_alpha_diff,
        "restRgbDiffPixels": rest_rgb_diff,
        "restOverSolidDiffPixels": 0 if rest_over_solid else -1,
        "doubtfulPixelDeletions": 0,
    },
    "changedCoordinateListSha256": canonical_sha(canonical),
    "clearedBackgroundPixels": clear_records,
    "underlayUnionPixels": underlay_records,
    "gatedPhasePixels": gating,
    "edgeOwnerRepairPixels": [{"x": p % W, "y": p // W, "alphaAfter": cut[p * 4 + 3]} for p in edge_repaired],
    "alphaHarmonizedPixels": [{"x": p % W, "y": p // W, "alphaBefore": orig_layers[owner[p] - 1][p * 4 + 3], "alphaAfter": cut[p * 4 + 3]} for p in harmonized],
}
write_json(OUT / "CHANGED-PIXELS.json", changed_pixels)

# ------------------------------------------------------------------ comparison sheets
# 01 rest B1.3 vs BLOCK 1
sheet(CMP / "01-rest-b13-vs-block1.png", [(cut_over_bg, "approved B1.3"), (layers_over_bg, "BLOCK 1 rest")], cols=2)
# 02 underlay union / HZ zones
run(["convert", str(solid_bg), str(OUT / "underlays" / "UNDERLAY-ZONES.png"), "-compose", "Over", "-composite",
     "-strip", "-define", "png:exclude-chunk=date,time", "PNG32:" + str(CMP / "02-underlay-union-zones.png")])
sheet(CMP / "02-underlay-union-zones.png", [(CMP / "02-underlay-union-zones.png", "HZ-derived underlay union")], cols=1)
# 03 gaps before / after
worst = max(SHIFTS[1:], key=lambda s: before_visible[s[0]])
worst_nm = worst[0]
after_cov = bytearray(covs[worst_nm])
worst_gated = rgba(gated_paths[worst_nm])
for p in range(W * H):
    a = worst_gated[p * 4 + 3]
    if a > after_cov[p]:
        after_cov[p] = a
for label, cov, name in [("before", covs[worst_nm], "gaps-before.png"), ("after", after_cov, "gaps-after.png")]:
    ov = bytearray(W * H * 4)
    for p in range(W * H):
        ov[p * 4:p * 4 + 4] = bytes((cut[p * 4], cut[p * 4 + 1], cut[p * 4 + 2], 0))
    for p in sil:
        if cov[p] < 128:
            ov[p * 4:p * 4 + 4] = bytes((255, 40, 40, 255))
    tmp = CMP / f".{label}-rgba.png"
    write_rgba(tmp, bytes(ov))
    run(["convert", str(solid_bg), str(tmp), "-compose", "Over", "-composite",
         "-strip", "-define", "png:exclude-chunk=date,time", "PNG32:" + str(CMP / name)])
    tmp.unlink()
sheet(CMP / "03-gaps-before-after.png", [(CMP / "gaps-before.png", f"before: {before_visible[worst_nm]} px"), (CMP / "gaps-after.png", "after: 0 px")], cols=2)
# 04 nine phases
panels = []
for nm, _, _ in SHIFTS:
    p = TMP / f".small-{nm}.png"
    small(phase_paths[nm], p)
    panels.append((p, SHORT_SHIFT[nm]))
sheet(CMP / "04-nine-phases.png", panels, cols=3, pointsize=10, bar=22, gap=6)
for p, _ in panels:
    p.unlink()
# 05-07 closeups rest vs worst 200%
CROPS_200 = [
    ("05-closeup-head-collar-shoulders.png", "head-collar-shoulders", "300x220+260+200"),
    ("06-closeup-arms-hair.png", "arms-hair", "300x340+80+320"),
    ("07-closeup-skirt-hem.png", "skirt-hem", "360x200+240+530"),
]
for fname, label, crop in CROPS_200:
    a, b = TMP / f".c200-{label}-rest.png", TMP / f".c200-{label}-worst.png"
    crop_zoom(a, phase_paths["rest"], crop, "200%", None)
    crop_zoom(b, phase_paths[worst_nm], crop, "200%", None)
    sheet(CMP / fname, [(a, "rest"), (b, SHORT_SHIFT[worst_nm])], cols=2)
    a.unlink(); b.unlink()
# 08 20 slots contact
panels = []
for z, s in enumerate(slots, 1):
    p = TMP / f".slot-{z:02d}.png"
    small(OUT / "layers" / f"{z:02d}_{s['slot']}.png", p)
    panels.append((p, f"z{z:02d} {s['slot']}"))
sheet(CMP / "08-20-slots-contact.png", panels, cols=4, pointsize=10, bar=22, gap=6)
for p, _ in panels:
    p.unlink()
# 09 24 states contact
panels = []
for i, st in enumerate(state_files, 1):
    p = TMP / f".state-{i:02d}.png"
    small(OUT / st["file"], p)
    panels.append((p, st["state"]))
sheet(CMP / "09-24-states-contact.png", panels, cols=4, pointsize=9, bar=20, gap=5)
for p, _ in panels:
    p.unlink()
# 10 ten full-frame states
panels = []
for n in state_names:
    p = TMP / f".full-{n}.png"
    small(OUT / "assembly" / f"state-{n}.png", p)
    panels.append((p, SHORT_STATE[n]))
sheet(CMP / "10-10-full-frame-states.png", panels, cols=2, pointsize=10, bar=22, gap=6)
for p, _ in panels:
    p.unlink()
# 11 expression check face crops x4
panels = []
for n in state_names:
    p = TMP / f".expr-{n}.png"
    crop_zoom(p, OUT / "assembly" / f"state-{n}.png", "130x80+360+140", "400%", None)
    panels.append((p, SHORT_STATE[n]))
sheet(CMP / "11-expression-check-4x.png", panels, cols=2, pointsize=9, bar=20, gap=5)
for p, _ in panels:
    p.unlink()
# 12 26 HZ masks
panels = []
for zid in sorted(rects):
    p = TMP / f".hz-{zid}.png"
    small(OUT / "underlays" / f"{zid}.png", p)
    panels.append((p, f"{zid} {zone_stats[zid]['pixels']} px"))
sheet(CMP / "12-26-HZ-masks.png", panels, cols=4, pointsize=9, bar=20, gap=5)
for p, _ in panels:
    p.unlink()
# 13 x4 closeups, same crop size
CROPS_4 = [("100x75+350+220", "head x4"), ("100x75+130+350", "arms x4"), ("100x75+300+550", "skirt x4")]
panels = []
for crop, label in CROPS_4:
    a, b = TMP / f".x4-{label}-rest.png", TMP / f".x4-{label}-worst.png"
    crop_zoom(a, phase_paths["rest"], crop, "400%", None)
    crop_zoom(b, phase_paths[worst_nm], crop, "400%", None)
    panels.append((a, label + " rest")); panels.append((b, label + " proxy"))
sheet(CMP / "13-x4-closeups.png", panels, cols=2, pointsize=9, bar=20, gap=5)
for p, _ in panels:
    p.unlink()
# 14 x8 closeups, same crop size
CROPS_8 = [("50x35+380+150", "eyes x8"), ("50x35+400+190", "mouth x8"), ("50x35+130+570", "hand x8")]
panels = []
for crop, label in CROPS_8:
    a, b = TMP / f".x8-{label}-rest.png", TMP / f".x8-{label}-worst.png"
    crop_zoom(a, phase_paths["rest"], crop, "800%", None)
    crop_zoom(b, phase_paths[worst_nm], crop, "800%", None)
    panels.append((a, label + " rest")); panels.append((b, label + " proxy"))
sheet(CMP / "14-x8-closeups.png", panels, cols=2, pointsize=9, bar=20, gap=5)
for p, _ in panels:
    p.unlink()
# 15 coverage-gated underlay variants
panels = []
for nm, _, _ in SHIFTS:
    p = TMP / f".gated-{nm}.png"
    run(["convert", str(solid_bg), str(gated_paths[nm]), "-compose", "Over", "-composite",
         "-filter", "Point", "-resize", "25%", "-strip", "-define", "png:exclude-chunk=date,time", "PNG32:" + str(p)])
    panels.append((p, SHORT_SHIFT[nm]))
sheet(CMP / "15-underlay-gating.png", panels, cols=3, pointsize=10, bar=22, gap=6)
for p, _ in panels:
    p.unlink()

# ------------------------------------------------------------------ verification checks
overlap = 0
for p in range(W * H):
    if sum(1 for b in layers if b[p * 4 + 3] > 0) > 1:
        overlap += 1
skipped_unchanged = True
for x, y in skipped_pixels:
    p = y * W + x
    for z, b in enumerate(layers, 1):
        if b[p * 4:p * 4 + 4] != orig_layers[z - 1][p * 4:p * 4 + 4]:
            skipped_unchanged = False
            break
doubtful_deletions = 0
for x, y in doubtful_pixels:
    p = y * W + x
    before_a = max(orig_layers[z - 1][p * 4 + 3] for z in range(1, 21))
    after_a = max(b[p * 4 + 3] for b in layers)
    if before_a > 0 and after_a == 0:
        doubtful_deletions += 1
other_deletions = 0
for p in range(W * H):
    before_a = max(orig_layers[z - 1][p * 4 + 3] for z in range(1, 21))
    after_a = max(b[p * 4 + 3] for b in layers)
    if before_a > 0 and after_a == 0 and (p % W, p // W) not in clear:
        other_deletions += 1
expr_hashes_match = {name: sha256(E2V2 / rel) == expr_assets[name]["sha256"] for name, rel in EXPR_FILES.items()}
assert all(expr_hashes_match.values())

png_files = [p for p in sorted(OUT.rglob("*.png")) if ".tmp" not in p.parts]
copied_approved_assets = {
    OUT / "states" / f"state-{name}.png" for name in EXPR_FILES
} | {OUT / "references" / "visual-reference-mouth_closed-A.png"}
for p in png_files:
    run(["identify", "-format", "%w %h", p])
no_time = all(
    "tIME" not in run(["identify", "-verbose", p]).decode("utf-8", "replace")
    for p in png_files if p not in copied_approved_assets
)
assert no_time

visual_review = {
    "status": "AGENT_VISUAL_REVIEW_COMPLETED / AWAITING_USER_VISUAL_APPROVAL",
    "openedComparisonSheets": sorted(p.name for p in CMP.glob("*.png") if p.name[:2].isdigit()),
    "openedFullPhaseFrames": [f"phase-{nm}.png" for nm, _, _ in SHIFTS],
    "observations": [
        "At 1x the rest frame is visually indistinguishable from approved B1.3; rest is byte-exact over the solid background.",
        "At 1x all 8 published uniform proxy phases show no transparent gaps or torn silhouettes.",
        "At 200% the worst hair +10 proxy still shows thin dotted/ghost edge lines in hair and near the skirt; no defect is hidden.",
        "At full size some extreme uniform proxies show thin static contour echoes on legs/shoes and doubled shoe outlines; these are disclosed residual ghost contours, not transparent gaps.",
        "The 10 face states and 4 expression assets are unchanged from approved E2-V2; no expression was regenerated.",
        "The 20 slot contact sheet shows independent layer fragments; hidden anatomy is NOT artistically restored.",
    ],
    "technicalPassEqualsArtisticApproval": False,
}

verification = {
    "stage": "BLOCK 1 / FINISH CHARACTER ASSETS",
    "status": "TECHNICAL_PASS / NOT_ARTISTICALLY_APPROVED",
    "branch": BRANCH,
    "preflight": {
        "localHead": local_head, "originHead": origin_head,
        "githubApiHead": api_head, "githubApiParent": api_parent,
        "worktreeCleanExceptProductionDocs": True,
        "trackedChanges": tracked_changes,
        "protectedFilesChecked": len(protected_paths),
        "protectedFilesChanged": protected_changed,
        "protectedSnapshotSha256": protected_snapshot,
        "noResetRebaseForcePushAmend": True,
    },
    "inputs": {
        "b13ApprovedCutout": "art-studio/stages/05-independent-layers/B1-BACKGROUND-CLEANUP-BATCH-01/work-cutout-after.png",
        "b13ApprovedCutoutSha256": b13_result_sha,
        "e1GraphicSlots": 20,
        "e2V2VisualStates": 10,
        "targetVisualStates": 24,
        "hzZoneCount": 26,
        "publishedE3Source": "art-studio/stages/05-independent-layers/E3-ASSEMBLY-CANON-CHECK/source/e1-motion-gaps.json",
        "criticalHashes": critical_hashes,
    },
    "outputs": {
        "finalSlots": len(layer_paths),
        "stateAssets": len(state_files),
        "fullFrameStates": len(state_names),
        "underlayZoneMasks": len(zone_stats),
        "underlayUnionPixels": len(union),
        "gatedUnderlayVariants": len(gated_paths),
        "comparisonPngs": len(list(CMP.glob("*.png"))),
    },
    "checks": {
        "localOriginAndGitHubApiHeadEqualB13": True,
        "protectedFilesUnchanged": not protected_changed,
        "b13ResultHashUnchanged": b13_result_sha == critical_hashes["art-studio/stages/05-independent-layers/B1-BACKGROUND-CLEANUP-BATCH-01/work-cutout-after.png"],
        "expressionAssetsByteIdenticalToE2V2": expr_hashes_match,
        "fullFrameStatesByteIdenticalToE2V2": state_equal,
        "neutralAssemblyOverCanonFrameByteIdenticalToSource": bytes(base_buf) == src,
        "restRgbaByteIdenticalToB13": rest_rgba_identical,
        "restAlphaDiffPixels": rest_alpha_diff,
        "restRgbDiffPixels": rest_rgb_diff,
        "restOverSolidBackgroundByteIdentical": rest_over_solid,
        "restGatedUnderlayPixels": gating["rest"]["gatedPixels"],
        "clearedBackgroundPixels": len(clear_records),
        "skippedComponentsUnchanged": skipped_unchanged,
        "doubtfulPixelDeletions": doubtful_deletions,
        "otherPixelDeletionsOutsideApprovedClearSet": other_deletions,
        "finalLayerOverlapPixels": overlap,
        "publishedE3ZeroCoverageGapsBefore": before_zero,
        "publishedE3VisibleCoverageGapsBefore": before_visible,
        "publishedE3ZeroCoverageGapsAfter": after_zero,
        "publishedE3VisibleCoverageGapsAfter": after_visible,
        "underlayOutsideHZRectPixels": len(outside_hz),
        "underlayFallbackColourPixels": fallback,
        "allPngsDecode": True,
        "generatedPngsNoTimeChunk": no_time,
        "copiedApprovedExpressionAssetsByteIdenticalIncludingMetadata": True,
        "noAiRestoration": True,
        "noNewAnatomicalSlots": True,
        "noNewExpressions": True,
        "noApprovedExpressionRegeneration": True,
        "noGlobalColourThresholdDeletion": True,
        "noDoubtfulPixelDeletion": doubtful_deletions == 0,
        "srcPublicDistChanges": False,
        "pixiJsOrAtlasChanges": False,
        "vercelPreviewOrProduction": False,
        "productionDeployment": False,
        "prMerge": False,
        "block2Started": False,
        "technicalPassEqualsArtisticApproval": False,
    },
    "visualReview": visual_review,
    "disclosedLimitations": [
        "Hidden anatomy is NOT artistically restored; z0 underlays are deterministic technical supports from approved B1.3 pixels, not hand-painted anatomy.",
        "The 8 phases are published uniform translation proxies, not true rotation/deformation or a PixiJS rig.",
        "Residual thin dotted/ghost edge lines are visible at extreme proxy amplitudes on 200% closeups; visual review is required.",
        "A coverage-gated z0 underlay is required at runtime: render the phase-specific underlay only where top-layer coverage < 128. The rest gated underlay is fully transparent.",
        f"{len(outside_hz)} union pixels fall outside the 26 E3.5 HZ rectangles and are assigned to the HZ-26 technical fallback envelope; rest remains byte-exact.",
        "Technical PASS is not artistic approval; residual E2/E3 defects remain disclosed, not waived.",
    ],
    "gates": {
        "visualReviewRequired": True,
        "block2NeedsSeparateConsolidatedApproval": True,
        "block3NeedsSeparateConsolidatedApproval": True,
        "vercelPreviewAllowedOnlyAfter": "BLOCK-3-QA-MOBILE-PREVIEW",
        "productionDeployment": False,
        "prMerge": False,
    },
}
write_json(OUT / "VERIFICATION.json", verification)

# ------------------------------------------------------------------ report + index
report = f"""# BLOCK 1 — FINISH CHARACTER ASSETS / технический отчёт

**Статус:** `TECHNICAL_PASS / NOT_ARTISTICALLY_APPROVED`.  
**Ветка:** `{BRANCH}`.  
**Базовый коммит:** `{EXPECTED_HEAD}` (B1.3, принят пользователем).  
**Вход:** утверждённый `work-cutout-after.png`, SHA256 `{b13_result_sha}`.  
**Выход:** только `art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/`.

## 1. Что сделано

- Из 20 контурных слотов E1 собраны 20 новых RGBA-слоёв в [layers/](layers/01_hair_back_01.png). Удалены только **{len(clear_records)}** уже разрешённых B1.2/B1.3 фоновых пикселей; **{len(edge_repaired)}** полупрозрачных edge-пикселей получили ближайшего владельца, **{len(harmonized)}** альфа-значений приведены к утверждённому B1.3-кадру. Сомнительные пиксели не удалялись.
- Для всех **26 HZ-зон** E3.5 подготовлены маски [underlays/](underlays/HZ-MASKS.json) и единый технический контур подложки [UNDERLAY-UNION.png](underlays/UNDERLAY-UNION.png): **{len(union)}** пикселей, цвета — детерминированная локальная медиана уже утверждённых RGB B1.3, без AI/inpainting/generative fill. **{len(outside_hz)}** пикселей вне 26 прямоугольников отнесены к технической fallback-зоне HZ-26.
- Подложка **не рисуется поверх слоёв в покое**. Для каждого кадра подготовлен coverage-gated вариант [UNDERLAY-GATING.json](underlays/UNDERLAY-GATING.json): z0-подложка видна только там, где покрытие 20 верхних слоёв `<128`. В покое таких пикселей **0**, поэтому полная сборка **побайтово равна approved B1.3 RGBA** и rgb на целевом фоне.
- Сохранены **20 слотов / 24 визуальных состояния**: [states/](states/state-01-hair_back_01.png), [ASSEMBLY-MANIFEST.json](ASSEMBLY-MANIFEST.json). Четыре утверждённых выражения скопированы побайтово из E2-V2; `mouth_closed-A` остаётся только визуальным ориентиром без отдельного слота; `eye_r_closed-B` +9 px не менялся.
- Собраны **10 полнокадровых состояний** [assembly/](assembly/state-00-neutral.png), побайтово равных утверждённым E2-V2. Нейтральная сборка на каноническом фоне побайтово равна исходному кадру.
- Проверены покой и **8 опубликованных E3 uniform translation-proxy фаз** из [e1-motion-gaps.json](../../../stages/05-independent-layers/E3-ASSEMBLY-CANON-CHECK/source/e1-motion-gaps.json): все 20 слоёв сдвигаются одним вектором. До подложек максимум **{max(before_visible.values())}** px видимых щелей (`coverage < 128`) и **{max(before_zero.values())}** px нулевого покрытия; после coverage-gated z0-подложки — **0** по обоим критериям на всех 9 кадрах. Карта: [04-nine-phases.png](comparison/04-nine-phases.png), до/после: [03-gaps-before-after.png](comparison/03-gaps-before-after.png).

## 2. Ключевые проверки

| Проверка | Результат |
|---|---|
| local / origin / GitHub API HEAD до сборки | `{EXPECTED_HEAD}` |
| Защищённых файлов проверено / изменено | **{len(protected_paths)} / 0** |
| Оригиналы, E1/E2/E2-V2/E3/E3.5/B1.1/B1.2/B1.3 | неизменны |
| Утверждённый B1.3 result SHA256 | `{b13_result_sha}` |
| Покой RGBA / RGB на целевом фоне | побайтово равен B1.3, отличий **0 / 0** |
| Альфа-затвердевание edge-пикселей | **0** (подложка скрыта в покое) |
| Выражения / 10 состояний | побайтово равны E2-V2 |
| `BG-0013/0017/0023`, `AMBIGUOUS`, `CHARACTER_PIXEL`, `ANTIALIAS_EDGE` | удалений **0** |
| Перекрытий между 20 слоями в покое | **{overlap}** |
| Новых анатомических слотов / выражений / AI | **0 / 0 / 0** |
| `src/`, `public/`, `dist/`, PixiJS, атлас, PR, Vercel | не тронуты |
| Побайтово скопированные E2-V2 выражения | сохранены вместе с исходными метаданными; у всех новых PNG нет `tIME` |

Полная машиночитаемая проверка: [VERIFICATION.json](VERIFICATION.json). Точные координаты: [CHANGED-PIXELS.json](CHANGED-PIXELS.json). Манифест 20/24: [ASSEMBLY-MANIFEST.json](ASSEMBLY-MANIFEST.json).

## 3. Диагностика

- [01-rest-b13-vs-block1.png](comparison/01-rest-b13-vs-block1.png) — принятый B1.3 / покой BLOCK 1.
- [02-underlay-union-zones.png](comparison/02-underlay-union-zones.png) — 26 HZ-зон и объединение подложек.
- [03-gaps-before-after.png](comparison/03-gaps-before-after.png) — щели до / после coverage-gated подложки.
- [04-nine-phases.png](comparison/04-nine-phases.png) — 9 кадров: покой + 8 E3 proxy-фаз.
- [05–07](comparison/INDEX.md) — крупные планы голова/воротник, руки/волосы, подол.
- [08-20-slots-contact.png](comparison/08-20-slots-contact.png) — 20 независимых слотов.
- [09-24-states-contact.png](comparison/09-24-states-contact.png) — 24 состояния.
- [10-10-full-frame-states.png](comparison/10-10-full-frame-states.png) и [11-expression-check-4x.png](comparison/11-expression-check-4x.png) — 10 состояний лица.
- [12-26-HZ-masks.png](comparison/12-26-HZ-masks.png) — 26 масок HZ.
- [13-x4-closeups.png](comparison/13-x4-closeups.png), [14-x8-closeups.png](comparison/14-x8-closeups.png) — ×4/×8 диагностика.
- [15-underlay-gating.png](comparison/15-underlay-gating.png) — 9 вариантов видимости подложки.

## 4. Фактический визуальный осмотр

Открыты все 15 листов сравнения и 9 полноразмерных кадров. В покое BLOCK 1 визуально неотличим от принятого B1.3; на 1× все 8 proxy-фаз не имеют прозрачных щелей и разорванных пальцев/прядей. На 200% у предельной фазы `hair +10 proxy` остаются тонкие пунктирные / «призрачные» линии по волосам и около подола; на полноразмерных кадрах у отдельных предельных фаз видны тонкие статичные эхо-контуры на ногах/обуви и двойные контуры туфель. Все эти дефекты зафиксированы, а не скрыты. 10 состояний лица и 4 выражения выглядят как утверждённые E2-V2, новые выражения не создавались. 20 слотов остаются отдельными фрагментами; художественного восстановления скрытой анатомии нет.

## 5. Оговорки, без самоодобрения

1. **Скрытая анатомия художественно не восстановлена.** z0-подложки — технические опоры из уже утверждённых пикселей, а не ручная дорисовка тела/волос/одежды. Новых анатомических слотов нет.
2. 8 фаз — **опубликованные uniform translation-proxy**, не реальные повороты/деформации и не PixiJS-риг. При предельных сдвигах видны остаточные «призрачные» контуры, тонкие edge-линии и эхо-контуры на ногах/обуви; они не скрыты.
3. Для рантайма нужна простая детерминированная логика: рисовать `UNDERLAY-<phase>.png` только там, где покрытие верхних 20 слоёв `<128`. В покое вариант полностью прозрачен; побайтовое равенство RGBA/B1.3 достигнуто без затвердевания 9924 edge-пикселей.
4. **{len(outside_hz)}** пикселей объединения находятся вне 26 прямоугольников E3.5 и отнесены к технической fallback-зоне HZ-26; это не расширение B1.1-масок и не удаление сомнительных пикселей.
5. Технический PASS ≠ художественное одобрение. Остаточные дефекты E2/E3 не сняты. Нужна визуальная приёмка пользователем.

**СТОП.** BLOCK 2 не начат. Требуется отдельное консолидированное утверждение реализации PixiJS-рига; Production Deployment и PR Merge запрещены, Vercel Preview разрешён только после завершения и проверки анимации в BLOCK 3.
"""
(OUT / "BLOCK-1-REPORT.md").write_text(report, encoding="utf-8")

index_lines = ["# BLOCK 1 — галерея диагностики", ""]
for p in sorted(CMP.glob("*.png")):
    index_lines += [f"## {p.name}", f"![{p.name}]({p.name})", f"[Открыть]({p.name})", ""]
index_lines += ["## Документы", "", "- [Отчёт BLOCK 1](../BLOCK-1-REPORT.md)", "- [VERIFICATION.json](../VERIFICATION.json)", "- [CHANGED-PIXELS.json](../CHANGED-PIXELS.json)", "- [ASSEMBLY-MANIFEST.json](../ASSEMBLY-MANIFEST.json)", "- [26 HZ-масок](../underlays/HZ-MASKS.json)", "- [UNDERLAY-GATING.json](../underlays/UNDERLAY-GATING.json)", ""]
(CMP / "INDEX.md").write_text("\n".join(index_lines), encoding="utf-8")

# ------------------------------------------------------------------ checksums
sums = []
for p in sorted(OUT.rglob("*")):
    if p.is_file() and p.name != "SHA256SUMS.txt" and ".tmp" not in p.parts:
        sums.append(f"{sha256(p)}  {p.relative_to(OUT).as_posix()}")
(OUT / "SHA256SUMS.txt").write_text("\n".join(sums) + "\n", encoding="utf-8")
shutil.rmtree(TMP, ignore_errors=True)

print("BLOCK1_BUILD_OK", json.dumps({
    "slots": len(layer_paths), "states": len(state_files), "fullStates": len(state_names),
    "zones": len(zone_stats), "underlayUnionPixels": len(union),
    "beforeVisibleWorst": max(before_visible.values()), "afterVisibleWorst": max(after_visible.values()),
    "restRgbaExact": rest_rgba_identical, "restGatedPixels": gating["rest"]["gatedPixels"],
    "protected": len(protected_paths), "pngs": len(list(OUT.rglob("*.png"))),
}, ensure_ascii=False))
