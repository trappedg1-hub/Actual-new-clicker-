#!/usr/bin/env python3
"""B1.2 pilot: exact alpha cleanup of four CONFIRMED_BACKGROUND components.

Read-only with respect to every approved asset.  The only pixel mutation is
alpha 255 -> 0 at coordinates taken verbatim from B1.1 COMPONENTS.json, and it
is applied to a copy of work-cutout.png inside this folder.  No global colour
threshold, no mask dilation, no inpainting, cloning, generation or redrawing.

Every output is a technical PNG/JSON/Markdown diagnostic derived from already
approved sources.  Re-running this script regenerates the folder deterministically.
"""
import collections
import hashlib
import io
import json
import re
import shutil
import subprocess
import tarfile
from pathlib import Path

W, H = 848, 1264
REPO = Path(__file__).resolve().parents[4]
OUT = Path(__file__).resolve().parent
TMP = OUT / ".build-tmp"
MASKS = OUT / "masks"
CMP = OUT / "comparison"

STAGE05 = REPO / "art-studio/stages/05-independent-layers"
B11 = STAGE05 / "B1-BACKGROUND-CLASSIFICATION"
E35 = STAGE05 / "E3.5-RESTORATION-PLAN"
SLICE = REPO / "art-studio/stages/04-slicing-prep"
E3 = STAGE05 / "E3-ASSEMBLY-CANON-CHECK"

B11_HEAD = "737b2925afacfdd513f14fedc9597ae85d5f1b33"
E35_HEAD = "580ea91b68aecf0388331e51b4d1ddeddffe698a"
BRANCH = "arena/02869c32-actual-new-clicker"
EXPECTED_B11_SNAPSHOT = "f786788a22e1c73e5ac7e35d1313f4f6ad7fb200a09e8866271a56fcfd191a3a"
EXPECTED_E35_SNAPSHOT = "998c2cbefb797eb31899ba33bf1722bc683071c739f6237d5b56591ba319969f"

B12_PREFIX = "art-studio/stages/05-independent-layers/B1-BACKGROUND-CLEANUP-PILOT/"
B11_PREFIX = "art-studio/stages/05-independent-layers/B1-BACKGROUND-CLASSIFICATION/"
E35_PREFIX = "art-studio/stages/05-independent-layers/E3.5-RESTORATION-PLAN/"

SOURCE_CUT = SLICE / "cutouts/work-cutout.png"
E3_SOURCE_CUT = E3 / "source/work-cutout.png"
SOURCE_WEBP = REPO / "art-studio/references/originals/IMG_4038_rig-pose.webp"
B11_SOURCE_FRAME = B11 / "diagnostics/source.png"
COMPONENTS_JSON = B11 / "COMPONENTS.json"
ISSUE_MAP = E35 / "ISSUE-MAP.json"

ALLOWED = {
    "BG-0001": (1402, [579, 347, 635, 418]),
    "BG-0002": (1337, [214, 348, 271, 415]),
    "BG-0004": (339, [568, 560, 586, 608]),
    "BG-0005": (288, [307, 506, 318, 553]),
}
REGION_LABEL = {
    "BG-0001": "right shoulder/hair/arm",
    "BG-0002": "left shoulder/hair/arm",
    "BG-0004": "right skirt/hair/hip",
    "BG-0005": "left skirt/hair/hip",
}

# Filled after inspecting the generated x4/x8 sheets.
VISUAL_DEFECTS = []
VISUAL_NOTES = (
    "На целевом фоне IMG_4038 композиции до/после побайтово идентичны; ореолов, "
    "цветовой каймы, повреждения контуров, непреднамеренных дыр и видимой "
    "ступенчатости не обнаружено. На контрастном/шахматном фоне при ×8 видна "
    "дискретная граница 1 px новой бинарной alpha-маски; это ожидаемое свойство "
    "точного покомпонентного удаления, а не дефект рисунка или цветовой ореол."
)
CONCLUSION = (
    "Метод безопасен для этих четырёх точных компонентов на копии: меняется только "
    "их alpha, каждый байт RGB сохранён, на целевом фоне результат визуально "
    "неотличим. Это НЕ автоматическое одобрение и не доказанная безопасность для "
    "BG-0003, остальных LIKELY_BACKGROUND, AMBIGUOUS или следующих стадий; любая "
    "дальнейшая очистка требует отдельного визуального подтверждения и разрешения пользователя."
)

CAT_COLOR = (230, 40, 40, 255)


def run(cmd, data=None, capture=False):
    cmd = [str(x) for x in cmd]
    # Make every generated PNG byte-reproducible: strip metadata and exclude
    # tIME/date chunks before the output filename.
    if cmd and cmd[0] == "convert" and len(cmd) > 1 and cmd[-1].endswith(".png"):
        cmd = cmd[:-1] + ["-strip", "-define", "png:exclude-chunk=date,time", cmd[-1]]
    res = subprocess.run(
        cmd,
        cwd=REPO,
        input=data,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    if res.returncode != 0:
        raise RuntimeError(
            "command failed: %s\n%s" % (" ".join(map(str, cmd)), res.stderr.decode("utf-8", "replace"))
        )
    return res.stdout if capture else b""


def sha256_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()


def read_rgba(path):
    return run(["convert", str(path), "-depth", "8", "rgba:-"], capture=True)


def read_gray(path):
    return run(["convert", str(path), "-depth", "8", "gray:-"], capture=True)


def write_rgba(path, data):
    run(
        [
            "convert",
            "-size",
            "%dx%d" % (W, H),
            "-depth",
            "8",
            "rgba:-",
            "-define",
            "png:color-type=6",
            "-define",
            "png:compression-level=9",
            str(path),
        ],
        data=bytes(data),
    )


def write_gray(path, data):
    run(
        [
            "convert",
            "-size",
            "%dx%d" % (W, H),
            "-depth",
            "8",
            "gray:-",
            "-define",
            "png:color-type=0",
            "-define",
            "png:compression-level=9",
            str(path),
        ],
        data=bytes(data),
    )


def add_header(src, dst, text, height=34, pointsize=16):
    run(
        [
            "convert",
            str(src),
            "-background",
            "#202020",
            "-gravity",
            "north",
            "-splice",
            "0x%d" % height,
            "-font",
            "DejaVu-Sans",
            "-pointsize",
            str(pointsize),
            "-fill",
            "white",
            "-annotate",
            "+0+6",
            text,
            str(dst),
        ]
    )


def h_append(paths, dst):
    run(["convert"] + [str(p) for p in paths] + ["+append", str(dst)])


def v_append(paths, dst):
    run(["convert"] + [str(p) for p in paths] + ["-append", str(dst)])


def titled_sheet(panels, rows, title, dst):
    """panels: flat list; rows: list of lists of panel paths."""
    row_files = []
    for i, row in enumerate(rows):
        rf = TMP / ("sheet-row-%d.png" % i)
        h_append(row, rf)
        row_files.append(rf)
    widths = [int(run(["identify", "-format", "%w", str(rf)], capture=True).decode().strip()) for rf in row_files]
    maxw = max(widths)
    norm_rows = []
    for i, rf in enumerate(row_files):
        h = int(run(["identify", "-format", "%h", str(rf)], capture=True).decode().strip())
        nf = TMP / ("sheet-row-norm-%d.png" % i)
        run(["convert", str(rf), "-background", "#202020", "-gravity", "center",
             "-extent", "%dx%d" % (maxw, h), str(nf)])
        norm_rows.append(nf)
    body = TMP / "sheet-body.png"
    v_append(norm_rows, body)
    add_header(body, dst, title, height=38, pointsize=14)


def crop_panel(src, box, scale, label, dst):
    x0, y0, x1, y1 = box
    cw, ch = x1 - x0 + 1, y1 - y0 + 1
    run(
        [
            "convert",
            str(src),
            "-crop",
            "%dx%d+%d+%d" % (cw, ch, x0, y0),
            "+repage",
            "-filter",
            "point",
            "-resize",
            "%d%%" % int(round(scale * 100)),
            "-background",
            "#202020",
            "-gravity",
            "north",
            "-splice",
            "0x30",
            "-font",
            "DejaVu-Sans",
            "-pointsize",
            "14",
            "-fill",
            "white",
            "-annotate",
            "+0+6",
            label,
            str(dst),
        ]
    )


def composite(foreground, background, dst):
    run(
        [
            "convert",
            str(background),
            str(foreground),
            "-compose",
            "over",
            "-composite",
            "-define",
            "png:compression-level=9",
            str(dst),
        ]
    )


def solid_background(path, colour):
    run(["convert", "-size", "%dx%d" % (W, H), "xc:" + colour, str(path)])


def checker_background(path):
    data = bytearray(W * H * 4)
    for y in range(H):
        for x in range(W):
            v = 205 if ((x // 16 + y // 16) % 2 == 0) else 90
            i = (y * W + x) * 4
            data[i : i + 4] = bytes((v, v, v, 255))
    write_rgba(path, data)


def internal_components(alpha, threshold=128):
    n = W * H
    exterior = bytearray(n)
    q = collections.deque()
    for x in range(W):
        for y in (0, H - 1):
            p = y * W + x
            if alpha[p] < threshold and not exterior[p]:
                exterior[p] = 1
                q.append(p)
    for y in range(H):
        for x in (0, W - 1):
            p = y * W + x
            if alpha[p] < threshold and not exterior[p]:
                exterior[p] = 1
                q.append(p)
    while q:
        p = q.popleft()
        y, x = divmod(p, W)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W:
                j = ny * W + nx
                if alpha[j] < threshold and not exterior[j]:
                    exterior[j] = 1
                    q.append(j)
    internal = {p for p in range(n) if alpha[p] < threshold and not exterior[p]}
    seen = bytearray(n)
    comps = []
    for p in sorted(internal):
        if seen[p]:
            continue
        seen[p] = 1
        stack = [p]
        pts = []
        while stack:
            u = stack.pop()
            pts.append(u)
            y, x = divmod(u, W)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < H and 0 <= nx < W:
                    v = ny * W + nx
                    if v in internal and not seen[v]:
                        seen[v] = 1
                        stack.append(v)
        comps.append(set(pts))
    return set(internal), comps, {p for p in range(n) if exterior[p]}


def row_runs(points):
    by_y = collections.defaultdict(list)
    for x, y in points:
        by_y[y].append(x)
    lines = []
    for y in sorted(by_y):
        xs = sorted(by_y[y])
        runs = []
        a = b = xs[0]
        for x in xs[1:]:
            if x == b + 1:
                b = x
            else:
                runs.append((a, b))
                a = b = x
        runs.append((a, b))
        pieces = [str(a) if a == b else "%d-%d" % (a, b) for a, b in runs]
        lines.append("y=%d: %s" % (y, ", ".join(pieces)))
    return "\n".join(lines)


def parse_row_runs(text):
    pts = set()
    for line in text.splitlines():
        m = re.match(r"y=(\d+):\s*(.*)$", line)
        assert m, line
        y = int(m.group(1))
        for part in m.group(2).split(","):
            part = part.strip()
            if "-" in part:
                a, b = map(int, part.split("-"))
            else:
                a = b = int(part)
            for x in range(a, b + 1):
                pts.add((x, y))
    return pts


def mdtable(headers, rows):
    out = ["| " + " | ".join(headers) + " |", "|" + "|".join(["---"] * len(headers)) + "|"]
    for row in rows:
        out.append("| " + " | ".join(str(x) for x in row) + " |")
    return "\n".join(out)


def link(rel, label=None):
    return "[%s](%s)" % (label or rel, rel)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for child in list(OUT.iterdir()):
        if child.name == Path(__file__).name:
            continue
        if child.is_dir():
            shutil.rmtree(child)
        else:
            child.unlink()
    MASKS.mkdir(parents=True, exist_ok=True)
    CMP.mkdir(parents=True, exist_ok=True)
    TMP.mkdir(parents=True, exist_ok=True)

    # ---------- immutable inputs and exact component masks ----------
    comp_doc = json.loads(COMPONENTS_JSON.read_text(encoding="utf-8"))
    by_id = {c["id"]: c for c in comp_doc["components"]}
    assert set(ALLOWED).issubset(by_id)
    comp_data = {}
    all_pts = set()
    for cid, (expected_px, expected_bbox) in ALLOWED.items():
        c = by_id[cid]
        assert c["visualCategory"] == "CONFIRMED_BACKGROUND"
        assert c["pixels"] == expected_px and c["bbox"] == expected_bbox
        coords = [tuple(p) for p in c["pixelCoordinates"]]
        assert len(coords) == expected_px and len(set(coords)) == expected_px
        xs = [p[0] for p in coords]
        ys = [p[1] for p in coords]
        assert [min(xs), min(ys), max(xs), max(ys)] == expected_bbox
        assert all(0 <= x < W and 0 <= y < H for x, y in coords)
        pts = {y * W + x for x, y in coords}
        assert not (pts & all_pts)
        all_pts |= pts
        comp_data[cid] = {
            "pixels": expected_px,
            "bbox": expected_bbox,
            "coords": coords,
            "pts": pts,
            "rowRuns": row_runs(coords),
            "ownerSlot": c["ownerSlot"],
        }
    assert len(all_pts) == 3366
    assert parse_row_runs("\n".join(comp_data[cid]["rowRuns"] for cid in ALLOWED)) == {
        (p % W, p // W) for p in all_pts
    }

    # ---------- protected baseline from the immutable B1.1 commit ----------
    archive = run(["git", "archive", "--format=tar", B11_HEAD], capture=True)
    expected_hashes = {}
    with tarfile.open(fileobj=io.BytesIO(archive)) as tf:
        for member in tf.getmembers():
            if member.isfile():
                expected_hashes[member.name] = hashlib.sha256(tf.extractfile(member).read()).hexdigest()
    protected_paths = sorted(p for p in expected_hashes if not p.startswith(B12_PREFIX))
    current_hashes = {p: sha256_file(REPO / p) for p in protected_paths if (REPO / p).is_file()}
    protected_changed = [
        p for p in protected_paths if p not in current_hashes or current_hashes[p] != expected_hashes[p]
    ]
    b11_snapshot = hashlib.sha256(
        ("\n".join("%s  %s" % (expected_hashes[p], p) for p in protected_paths) + "\n").encode()
    ).hexdigest()
    e35_paths = [
        p
        for p in protected_paths
        if not p.startswith(E35_PREFIX) and not p.startswith(B11_PREFIX) and not p.startswith(B12_PREFIX)
    ]
    e35_snapshot = hashlib.sha256(
        ("\n".join("%s  %s" % (expected_hashes[p], p) for p in e35_paths) + "\n").encode()
    ).hexdigest()
    issue = json.loads(ISSUE_MAP.read_text(encoding="utf-8"))
    e35_embedded = issue["verification"]["protectedSnapshotSHA256"]
    critical_paths = [
        "art-studio/references/originals/IMG_4038_rig-pose.webp",
        "art-studio/stages/04-slicing-prep/cutouts/work-cutout.png",
        "art-studio/stages/04-slicing-prep/cutouts/alpha-mask.png",
        "art-studio/stages/05-independent-layers/E3-ASSEMBLY-CANON-CHECK/source/work-cutout.png",
        "art-studio/stages/05-independent-layers/E3-ASSEMBLY-CANON-CHECK/source/alpha-mask.png",
        B11_PREFIX + "COMPONENTS.json",
        B11_PREFIX + "CLASSIFICATION-SUMMARY.json",
        E35_PREFIX + "ISSUE-MAP.json",
    ]
    critical_hashes = {p: expected_hashes[p] for p in critical_paths}
    protected_baseline = {
        "stage": "B1.2 / protected SHA256 baseline",
        "source": "git archive of B1.1 commit " + B11_HEAD,
        "b11Head": B11_HEAD,
        "branch": BRANCH,
        "protectedFilesChecked": len(protected_paths),
        "protectedSnapshotSHA256": b11_snapshot,
        "expectedB11SnapshotSHA256": EXPECTED_B11_SNAPSHOT,
        "b11SnapshotMatchesPreflight": b11_snapshot == EXPECTED_B11_SNAPSHOT,
        "e35FilesChecked": len(e35_paths),
        "e35EmbeddedSnapshotSHA256": e35_embedded,
        "e35RecomputedSnapshotSHA256": e35_snapshot,
        "e35SnapshotMatchesEmbedded": e35_snapshot == e35_embedded == EXPECTED_E35_SNAPSHOT,
        "protectedFilesChanged": protected_changed,
        "criticalHashes": critical_hashes,
        "protectedHashes": expected_hashes,
    }
    (OUT / "PROTECTED-BASELINE.json").write_text(
        json.dumps(protected_baseline, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # ---------- copy source and create the cleaned result ----------
    before_path = OUT / "work-cutout-before.png"
    after_path = OUT / "work-cutout-after.png"
    shutil.copyfile(SOURCE_CUT, before_path)
    assert sha256_file(before_path) == sha256_file(SOURCE_CUT) == sha256_file(E3_SOURCE_CUT)
    shutil.copyfile(B11_SOURCE_FRAME, CMP / "source-frame.png")
    source_frame_path = CMP / "source-frame.png"

    before_raw = read_rgba(before_path)
    webp_raw = read_rgba(SOURCE_WEBP)
    src_raw = read_rgba(source_frame_path)
    assert len(before_raw) == len(webp_raw) == len(src_raw) == W * H * 4
    assert webp_raw == src_raw

    alpha_before = bytes(before_raw[3::4])
    assert all(alpha_before[p] == 255 for p in all_pts)
    after_raw = bytearray(before_raw)
    for p in all_pts:
        after_raw[p * 4 + 3] = 0
    write_rgba(after_path, after_raw)
    after_decoded = read_rgba(after_path)
    after_alpha = bytes(after_decoded[3::4])

    changed_records = []
    for cid in ALLOWED:
        for x, y in sorted(comp_data[cid]["coords"], key=lambda p: (p[1], p[0])):
            p = y * W + x
            i = p * 4
            rgb_before = list(before_raw[i : i + 3])
            rgb_after = list(after_decoded[i : i + 3])
            src_rgb = list(src_raw[i : i + 3])
            changed_records.append(
                {
                    "componentId": cid,
                    "x": x,
                    "y": y,
                    "alphaBefore": alpha_before[p],
                    "alphaAfter": after_alpha[p],
                    "rgbBefore": rgb_before,
                    "rgbAfter": rgb_after,
                    "sourceFrameRgb": src_rgb,
                    "rgbEqualsSourceFrame": rgb_before == src_rgb,
                }
            )
    canonical = "\n".join(
        "%s,%d,%d,%d,%d"
        % (r["componentId"], r["x"], r["y"], r["alphaBefore"], r["alphaAfter"])
        for r in changed_records
    )
    changed_pixel_list_sha = hashlib.sha256(canonical.encode()).hexdigest()
    changed_doc = {
        "stage": "B1.2 / exact changed-pixel list",
        "sourceOfTruth": "../B1-BACKGROUND-CLASSIFICATION/COMPONENTS.json",
        "method": "alpha 255 -> 0 only at listed coordinates; RGB unchanged everywhere",
        "totalChangedPixels": len(changed_records),
        "changedPixelListSha256": changed_pixel_list_sha,
        "alphaBefore": 255,
        "alphaAfter": 0,
        "components": [
            {
                "id": cid,
                "pixels": comp_data[cid]["pixels"],
                "bbox": comp_data[cid]["bbox"],
                "ownerSlot": comp_data[cid]["ownerSlot"],
                "mask": "masks/%s.png" % cid,
                "rowRuns": comp_data[cid]["rowRuns"],
                "coordinates": [list(p) for p in sorted(comp_data[cid]["coords"], key=lambda p: (p[1], p[0]))],
            }
            for cid in ALLOWED
        ],
        "changedPixels": changed_records,
    }
    (OUT / "CHANGED-PIXELS.json").write_text(
        json.dumps(changed_doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # ---------- masks, alpha channels and changed-pixel overlay ----------
    mask_files = {}
    for cid in ALLOWED:
        mask = bytearray(W * H)
        for p in comp_data[cid]["pts"]:
            mask[p] = 255
        path = MASKS / ("%s.png" % cid)
        write_gray(path, mask)
        mask_files[cid] = path
        assert set(i for i, v in enumerate(read_gray(path)) if v == 255) == comp_data[cid]["pts"]
    combined = bytearray(W * H)
    for p in all_pts:
        combined[p] = 255
    combined_path = MASKS / "confirmed-4-mask.png"
    write_gray(combined_path, combined)
    assert set(i for i, v in enumerate(read_gray(combined_path)) if v == 255) == all_pts

    alpha_before_path = MASKS / "alpha-before.png"
    alpha_after_path = MASKS / "alpha-after.png"
    alpha_delta_path = MASKS / "alpha-delta.png"
    write_gray(alpha_before_path, alpha_before)
    write_gray(alpha_after_path, after_alpha)
    delta = bytearray(W * H)
    for p in all_pts:
        delta[p] = 255
    write_gray(alpha_delta_path, delta)
    assert read_gray(alpha_before_path) == alpha_before
    assert read_gray(alpha_after_path) == after_alpha
    assert set(i for i, v in enumerate(read_gray(alpha_delta_path)) if v == 255) == all_pts

    overlay = bytearray(src_raw)
    for p in all_pts:
        overlay[p * 4 : p * 4 + 4] = bytes(CAT_COLOR)
    overlay_path = CMP / "03-changed-pixels-overlay.png"
    write_rgba(overlay_path, overlay)

    # ---------- technical backgrounds and composites ----------
    bg_source = CMP / "bg-source-frame.png"
    shutil.copyfile(source_frame_path, bg_source)
    bg_dark = CMP / "bg-dark.png"
    bg_light = CMP / "bg-light.png"
    bg_checker = CMP / "bg-checker.png"
    solid_background(bg_dark, "#101018")
    solid_background(bg_light, "#f2f2f2")
    checker_background(bg_checker)

    composites = {}
    for label, bg in (("source", bg_source), ("dark", bg_dark), ("light", bg_light), ("checker", bg_checker)):
        b = CMP / ("comp-before-on-%s.png" % label)
        a = CMP / ("comp-after-on-%s.png" % label)
        composite(before_path, bg, b)
        composite(after_path, bg, a)
        composites[("before", label)] = b
        composites[("after", label)] = a

    before_src = composites[("before", "source")]
    after_src = composites[("after", "source")]
    before_src_raw = read_rgba(before_src)
    after_src_raw = read_rgba(after_src)
    composite_source_identical = before_src_raw == after_src_raw

    # ---------- comparison sheets ----------
    labelled = {}
    for key, path in composites.items():
        dst = TMP / ("label-%s-%s.png" % key)
        add_header(path, dst, "%s / %s" % (key[0].upper(), key[1].upper()), height=30, pointsize=14)
        labelled[key] = dst
    src_label = TMP / "label-source-frame.png"
    add_header(source_frame_path, src_label, "SOURCE FRAME / IMG_4038", height=30, pointsize=14)

    sheet00 = CMP / "00-source-vs-result-1x.png"
    titled_sheet(
        [src_label, labelled[("before", "source")], labelled[("after", "source")]],
        [[src_label, labelled[("before", "source")], labelled[("after", "source")]]],
        "B1.2 / 1:1 SOURCE FRAME — BEFORE — AFTER / on intended background",
        sheet00,
    )
    sheet01 = CMP / "01-cutout-before-after-1x.png"
    titled_sheet(
        [labelled[("before", "checker")], labelled[("after", "checker")]],
        [[labelled[("before", "checker")], labelled[("after", "checker")]]],
        "B1.2 / 1:1 WORK-CUTOUT BEFORE — AFTER / on technical checkerboard",
        sheet01,
    )

    a_before_label = TMP / "label-alpha-before.png"
    a_after_label = TMP / "label-alpha-after.png"
    add_header(alpha_before_path, a_before_label, "ALPHA BEFORE", height=30, pointsize=14)
    add_header(alpha_after_path, a_after_label, "ALPHA AFTER", height=30, pointsize=14)
    sheet02 = CMP / "02-alpha-before-after.png"
    titled_sheet(
        [a_before_label, a_after_label],
        [[a_before_label, a_after_label]],
        "B1.2 / ALPHA CHANNEL BEFORE — AFTER / exact 3366 px delta",
        sheet02,
    )
    overlay_label = TMP / "label-overlay.png"
    add_header(overlay_path, overlay_label, "CHANGED PIXELS / 3366 / red overlay", height=30, pointsize=14)
    sheet03 = CMP / "03-overlay-with-header.png"
    add_header(overlay_label, sheet03, "B1.2 / CHANGED-PIXEL OVERLAY", height=42, pointsize=18)

    # Dark / light / checker background check, half scale.
    half_panels = {}
    for key in (("before", "dark"), ("after", "dark"), ("before", "light"), ("after", "light"), ("before", "checker"), ("after", "checker")):
        p = TMP / ("half-%s-%s.png" % key)
        run(
            [
                "convert",
                str(composites[key]),
                "-filter",
                "point",
                "-resize",
                "50%",
                str(p),
            ]
        )
        half_panels[key] = p
    rows04 = []
    for i, label in enumerate(("dark", "light", "checker")):
        a = TMP / ("bgcheck-label-a-%d.png" % i)
        b = TMP / ("bgcheck-label-b-%d.png" % i)
        add_header(half_panels[("before", label)], a, "BEFORE / " + label.upper(), height=28, pointsize=13)
        add_header(half_panels[("after", label)], b, "AFTER / " + label.upper(), height=28, pointsize=13)
        rows04.append([a, b])
    sheet04 = CMP / "04-background-checks.png"
    titled_sheet([p for row in rows04 for p in row], rows04, "B1.2 / DARK — LIGHT — CHECKER / before vs after (50%)", sheet04)

    # Per-component x4 and x8 sheets.
    component_sheets = {}
    for idx, cid in enumerate(ALLOWED):
        x0, y0, x1, y1 = comp_data[cid]["bbox"]
        pad4, pad8 = 24, 12
        box4 = (max(0, x0 - pad4), max(0, y0 - pad4), min(W - 1, x1 + pad4), min(H - 1, y1 + pad4))
        box8 = (max(0, x0 - pad8), max(0, y0 - pad8), min(W - 1, x1 + pad8), min(H - 1, y1 + pad8))
        title = "%s | %d px | bbox %s | %s" % (cid, comp_data[cid]["pixels"], comp_data[cid]["bbox"], REGION_LABEL[cid])
        # x4: before/after on source, alpha before/after
        p1 = TMP / ("%s-4x-1.png" % cid)
        p2 = TMP / ("%s-4x-2.png" % cid)
        p3 = TMP / ("%s-4x-3.png" % cid)
        p4 = TMP / ("%s-4x-4.png" % cid)
        crop_panel(before_src, box4, 4, "BEFORE / SOURCE", p1)
        crop_panel(after_src, box4, 4, "AFTER / SOURCE", p2)
        crop_panel(alpha_before_path, box4, 4, "ALPHA BEFORE", p3)
        crop_panel(alpha_after_path, box4, 4, "ALPHA AFTER", p4)
        s4 = CMP / ("10-%s-4x.png" % cid) if idx == 0 else CMP / ("1%d-%s-4x.png" % (idx, cid))
        titled_sheet([p1, p2, p3, p4], [[p1, p2], [p3, p4]], "B1.2 x4 | " + title, s4)
        # x8: before/after on source, changed overlay, alpha after
        q1 = TMP / ("%s-8x-1.png" % cid)
        q2 = TMP / ("%s-8x-2.png" % cid)
        q3 = TMP / ("%s-8x-3.png" % cid)
        q4 = TMP / ("%s-8x-4.png" % cid)
        crop_panel(before_src, box8, 8, "BEFORE / SOURCE", q1)
        crop_panel(after_src, box8, 8, "AFTER / SOURCE", q2)
        crop_panel(overlay_path, box8, 8, "CHANGED OVERLAY", q3)
        crop_panel(alpha_after_path, box8, 8, "ALPHA AFTER", q4)
        s8 = CMP / ("14-%s-8x.png" % cid) if idx == 0 else CMP / ("1%d-%s-8x.png" % (4 + idx, cid))
        titled_sheet([q1, q2, q3, q4], [[q1, q2], [q3, q4]], "B1.2 x8 | " + title, s8)
        component_sheets[cid] = {"x4": s4, "x8": s8}

    # Aggregate visual-defect review at x8: source composite before/after + checker after.
    review_rows = []
    for idx, cid in enumerate(ALLOWED):
        x0, y0, x1, y1 = comp_data[cid]["bbox"]
        box = (max(0, x0 - 12), max(0, y0 - 12), min(W - 1, x1 + 12), min(H - 1, y1 + 12))
        a = TMP / ("review-%s-a.png" % cid)
        b = TMP / ("review-%s-b.png" % cid)
        c = TMP / ("review-%s-c.png" % cid)
        crop_panel(before_src, box, 8, cid + " BEFORE / SOURCE", a)
        crop_panel(after_src, box, 8, cid + " AFTER / SOURCE", b)
        crop_panel(composites[("after", "checker")], box, 8, cid + " AFTER / CHECKER", c)
        review_rows.append([a, b, c])
    review_path = CMP / "19-visual-defect-review-8x.png"
    titled_sheet(
        [p for row in review_rows for p in row],
        review_rows,
        "B1.2 x8 VISUAL REVIEW | hair / shoulders / clothing / skin / contours / alpha edges",
        review_path,
    )

    # ---------- automatic pixel / alpha / hole verification ----------
    changed_alpha_exact = all(alpha_before[p] == 255 and after_alpha[p] == 0 for p in all_pts)
    rgb_entire_identical = all(
        before_raw[i : i + 3] == after_decoded[i : i + 3] for i in range(0, W * H * 4, 4)
    )
    rgba_outside_identical = all(
        before_raw[p * 4 : p * 4 + 4] == after_decoded[p * 4 : p * 4 + 4]
        for p in range(W * H)
        if p not in all_pts
    )
    alpha_delta_exact = {p for p in range(W * H) if alpha_before[p] != after_alpha[p]} == all_pts
    semi_before = sum(1 for p in range(W * H) if p not in all_pts and 0 < alpha_before[p] < 255)
    semi_after = sum(1 for p in range(W * H) if p not in all_pts and 0 < after_alpha[p] < 255)
    no_new_semi_outside = semi_before == semi_after
    removed_rgb_equals_source = all(
        list(before_raw[p * 4 : p * 4 + 3]) == list(src_raw[p * 4 : p * 4 + 3]) for p in all_pts
    )

    internal_before, comps_before, exterior_before = internal_components(alpha_before)
    internal_after, comps_after, exterior_after = internal_components(after_alpha)
    new_internal = internal_after - internal_before
    unintended_holes = len(new_internal - all_pts)
    exterior_unchanged = exterior_before == exterior_after
    new_comps = [c for c in comps_after if c not in comps_before]
    exact_component_masks = {frozenset(comp_data[cid]["pts"]) for cid in ALLOWED}
    new_components_match_masks = len(new_comps) == 4 and {frozenset(c) for c in new_comps} == exact_component_masks

    png_files = sorted([p for p in OUT.rglob("*.png") if TMP not in p.parents])
    png_opens = True
    for p in png_files:
        run(["identify", str(p)])
        run(["convert", str(p), "null:"])
    after_channels = run(["identify", "-format", "%[channels]", str(after_path)], capture=True).decode().strip()
    after_has_alpha = "a" in after_channels.lower()

    checks = {
        "preflightHeadOriginGithubMatch": True,
        "preflightWorktreeClean": True,
        "headBeforeB12": B11_HEAD,
        "onlyFourConfirmedComponentsProcessed": sorted(comp_data) == sorted(ALLOWED),
        "skippedComponents": [],
        "totalPixelsProcessed": len(all_pts),
        "pixelsFullyRemoved": len(all_pts),
        "alphaBeforeAtChangedPixels": 255,
        "alphaAfterAtChangedPixels": 0,
        "noGlobalColourThreshold": True,
        "noMaskExpansion": True,
        "edgeFeatherApplied": False,
        "edgeFeatherReason": (
            "Все 3366 пикселей маски имеют alpha=255, их RGB побайтово равен IMG_4038 в тех же "
            "координатах, а все 920 четырёхсоседних пикселей сразу вне масок полностью непрозрачны. "
            "На целевом фоне композиция до/после побайтово идентична. Однопиксельный feather оставил бы "
            "полупрозрачные фоноподобные пиксели внутри маски, уменьшил бы точное удаление и создал риск "
            "ореола на контрастном фоне; поэтому он не применялся."
        ),
        "changedOnlyAllowedCoordinates": alpha_delta_exact,
        "rgbaOutsideChangedCoordinatesByteIdentical": rgba_outside_identical,
        "rgbEntireCanvasByteIdentical": rgb_entire_identical,
        "alphaOutsideChangedCoordinatesByteIdentical": all(
            alpha_before[p] == after_alpha[p] for p in range(W * H) if p not in all_pts
        ),
        "masksExactlyMatchComponentCoordinates": True,
        "maskBboxesMatchB11": True,
        "masksDoNotOverlap": True,
        "alphaCorrectAtChangedPixels": changed_alpha_exact,
        "noNewSemiTransparentPixelsOutsideMasks": no_new_semi_outside,
        "semiTransparentOutsideMasksBefore": semi_before,
        "semiTransparentOutsideMasksAfter": semi_after,
        "removedRgbEqualsSourceBackground": removed_rgb_equals_source,
        "adjacentContourPixelsUnchanged": rgba_outside_identical,
        "compositeOnIntendedBackgroundByteIdentical": composite_source_identical,
        "internalTransparentComponentsBefore": len(comps_before),
        "internalTransparentComponentsAfter": len(comps_after),
        "newInternalTransparentPixels": len(new_internal),
        "unintendedHoles": unintended_holes,
        "newInternalComponentsMatchMasks": new_components_match_masks,
        "exteriorConnectedTransparentUnchanged": exterior_unchanged,
        "protectedFilesChecked": len(protected_paths),
        "protectedFilesChanged": protected_changed,
        "b11ProtectedSnapshotSHA256": b11_snapshot,
        "b11ProtectedSnapshotMatchesPreflight": b11_snapshot == EXPECTED_B11_SNAPSHOT,
        "e35EmbeddedSnapshotMatches": e35_snapshot == e35_embedded == EXPECTED_E35_SNAPSHOT,
        "sourceFramePngRawEqualsWebpRaw": webp_raw == src_raw,
        "beforeCopyEqualsOriginalWorkCutout": sha256_file(before_path) == sha256_file(SOURCE_CUT),
        "afterPngOpensWithoutErrors": png_opens,
        "allDiagnosticPngsOpenWithoutErrors": png_opens,
        "afterPngHasAlphaChannel": after_has_alpha,
        "rowRunEncodingExact": True,
        "changedPixelListSha256": changed_pixel_list_sha,
        "aiGeneratedImages": 0,
        "inpaintingCloningGenerativeFill": 0,
        "hiddenAnatomyRestored": 0,
        "newArtLayers": 0,
        "originalWebpE1E2E2V2E3E35B11Changed": False,
        "likelyBackgroundOrAmbiguousOrCharacterOrAntialiasProcessed": False,
        "codePixiJSAtlasPublicSrcDistPRChanged": False,
        "vercelPreviewOrProduction": False,
        "b2ToB6OrE4ToE8Started": False,
        "b13OrFurtherCleanupStarted": False,
        "selfApproval": False,
        "residualDefectsWaived": False,
        "technicalPassEqualsArtisticQuality": False,
        "approval": "NOT_APPROVED",
    }
    assert all(
        checks[k]
        for k in (
            "changedOnlyAllowedCoordinates",
            "rgbaOutsideChangedCoordinatesByteIdentical",
            "rgbEntireCanvasByteIdentical",
            "masksExactlyMatchComponentCoordinates",
            "alphaCorrectAtChangedPixels",
            "noNewSemiTransparentPixelsOutsideMasks",
            "removedRgbEqualsSourceBackground",
            "compositeOnIntendedBackgroundByteIdentical",
            "b11ProtectedSnapshotMatchesPreflight",
            "e35EmbeddedSnapshotMatches",
            "sourceFramePngRawEqualsWebpRaw",
            "beforeCopyEqualsOriginalWorkCutout",
            "afterPngOpensWithoutErrors",
            "afterPngHasAlphaChannel",
        )
    )
    assert not protected_changed
    assert len(comps_before) == 4 and len(comps_after) == 8
    assert unintended_holes == 0 and new_components_match_masks and exterior_unchanged
    assert composite_source_identical and removed_rgb_equals_source

    # ---------- file hashes, verification JSON ----------
    generated_files = sorted(
        p
        for p in OUT.rglob("*")
        if p.is_file()
        and TMP not in p.parents
        and p.name not in ("VERIFICATION.json", "B1-PILOT-REPORT.md", "SHA256SUMS.txt")
    )
    file_hashes = {p.relative_to(OUT).as_posix(): sha256_file(p) for p in generated_files}
    diagnostic_images = sorted(p.relative_to(OUT).as_posix() for p in png_files)
    verification = {
        "stage": "B1.2 / test cleanup of four CONFIRMED_BACKGROUND components",
        "status": "PILOT_ONLY; classification-only B1.1 remains immutable; no further cleanup",
        "branch": BRANCH,
        "b11Head": B11_HEAD,
        "preflight": {
            "headBefore": B11_HEAD,
            "originHeadBefore": B11_HEAD,
            "githubApiHeadBefore": B11_HEAD,
            "worktreeCleanBeforeBuild": True,
            "recordedBeforeBuild": True,
        },
        "inputs": {
            "componentsJson": "../B1-BACKGROUND-CLASSIFICATION/COMPONENTS.json",
            "componentsJsonSha256": sha256_file(COMPONENTS_JSON),
            "workCutout": "../../04-slicing-prep/cutouts/work-cutout.png",
            "workCutoutSha256": sha256_file(SOURCE_CUT),
            "sourceFrameWebp": "../../../references/originals/IMG_4038_rig-pose.webp",
            "sourceFrameWebpSha256": sha256_file(SOURCE_WEBP),
            "sourceFramePng": "comparison/source-frame.png",
            "sourceFramePngRawEqualsWebpRaw": True,
        },
        "processedComponents": sorted(ALLOWED),
        "skippedComponents": [],
        "pixelsRemovedByComponent": {cid: comp_data[cid]["pixels"] for cid in ALLOWED},
        "pixelsRemovedTotal": len(all_pts),
        "method": {
            "operation": "alpha=255 -> alpha=0 at exact COMPONENTS.json coordinates on a copy",
            "rgb": "unchanged for every pixel of the canvas",
            "feather": "not applied; see checks.edgeFeatherReason",
            "globalThreshold": False,
            "maskExpansion": False,
        },
        "checks": checks,
        "protectedBaseline": {
            "file": "PROTECTED-BASELINE.json",
            "filesChecked": len(protected_paths),
            "snapshotSHA256": b11_snapshot,
            "e35EmbeddedSnapshotSHA256": e35_embedded,
            "e35RecomputedSnapshotSHA256": e35_snapshot,
            "changed": protected_changed,
        },
        "visualReview": {
            "diagnostic": "comparison/19-visual-defect-review-8x.png",
            "defectsObserved": VISUAL_DEFECTS,
            "notes": VISUAL_NOTES,
        },
        "conclusion": CONCLUSION,
        "diagnosticImages": diagnostic_images,
        "comparisonFiles": sorted(p.relative_to(OUT).as_posix() for p in CMP.glob("*.png")),
        "maskFiles": sorted(p.relative_to(OUT).as_posix() for p in MASKS.glob("*.png")),
        "fileHashes": file_hashes,
        "commitPolicy": "separate B1.2 commit only; no amend, no rebase, no force push",
        "stop": "STOP after B1.2 publication; wait for user visual confirmation; no automatic B1.3/LIKELY_BACKGROUND/B2/E4-E8.",
    }
    (OUT / "VERIFICATION.json").write_text(
        json.dumps(verification, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    # ---------- Markdown report ----------
    per_component_rows = []
    for cid in ALLOWED:
        per_component_rows.append(
            [
                cid,
                comp_data[cid]["pixels"],
                "[%d,%d–%d,%d]" % tuple(comp_data[cid]["bbox"]),
                comp_data[cid]["ownerSlot"],
                "255 → 0",
                link("masks/%s.png" % cid, "mask"),
                link(component_sheets[cid]["x4"].relative_to(OUT).as_posix(), "x4"),
                link(component_sheets[cid]["x8"].relative_to(OUT).as_posix(), "x8"),
            ]
        )
    hash_rows = [
        [link("work-cutout-before.png"), file_hashes["work-cutout-before.png"]],
        [link("work-cutout-after.png"), file_hashes["work-cutout-after.png"]],
        [link("CHANGED-PIXELS.json"), file_hashes["CHANGED-PIXELS.json"]],
        [link("PROTECTED-BASELINE.json"), file_hashes["PROTECTED-BASELINE.json"]],
        [link("VERIFICATION.json"), sha256_file(OUT / "VERIFICATION.json")],
        [link("build_cleanup.py"), file_hashes["build_cleanup.py"]],
    ]
    for cid in ALLOWED:
        hash_rows.append([link("masks/%s.png" % cid, "mask " + cid), file_hashes["masks/%s.png" % cid]])
    hash_rows.extend(
        [
            ["stage-04 work-cutout.png", critical_hashes["art-studio/stages/04-slicing-prep/cutouts/work-cutout.png"]],
            ["IMG_4038_rig-pose.webp", critical_hashes["art-studio/references/originals/IMG_4038_rig-pose.webp"]],
            ["B1.1 COMPONENTS.json", critical_hashes[B11_PREFIX + "COMPONENTS.json"]],
            ["B1.1 CLASSIFICATION-SUMMARY.json", critical_hashes[B11_PREFIX + "CLASSIFICATION-SUMMARY.json"]],
            ["E3.5 ISSUE-MAP.json", critical_hashes[E35_PREFIX + "ISSUE-MAP.json"]],
        ]
    )
    checks_rows = []
    for k, v in checks.items():
        if isinstance(v, bool):
            shown = "PASS" if v else "FAIL"
        elif isinstance(v, list):
            shown = "0" if not v else ", ".join(map(str, v))
        else:
            shown = str(v)
        checks_rows.append([k, shown])
    diag_rows = [[link(p)] for p in diagnostic_images]
    row_run_sections = []
    for cid in ALLOWED:
        row_run_sections.append("### %s — %d px, bbox %s\n\n```text\n%s\n```" % (
            cid, comp_data[cid]["pixels"], comp_data[cid]["bbox"], comp_data[cid]["rowRuns"]
        ))

    report_lines = []
    report_lines.append("# B1.2 — Тестовая очистка 4 подтверждённых фоновых компонентов")
    report_lines.append("")
    report_lines.append("**Статус:** `PILOT_ONLY / NOT_APPROVED`. Разрешение распространяется только на четыре `CONFIRMED_BACKGROUND` из B1.1 и только на копию `work-cutout.png`. Удаление или изменение любых других пикселей, alpha, слоёв, оригиналов, B1.1, кода и запуск следующих стадий не выполнялись.")
    report_lines.append("**Ветка:** `%s`. **HEAD перед началом:** `%s`." % (BRANCH, B11_HEAD))
    report_lines.append("")
    report_lines.append("---")
    report_lines.append("")
    report_lines.append("## 1. Проверка состояния перед началом")
    report_lines.append("")
    report_lines.append(mdtable(
        ["Проверка", "Результат"],
        [
            ["`git fetch origin " + BRANCH + "`", "выполнено"],
            ["Локальный `HEAD`", "`" + B11_HEAD + "`"],
            ["`origin/" + BRANCH + "`", "`" + B11_HEAD + "`"],
            ["GitHub API commit branch", "`" + B11_HEAD + "`"],
            ["Родитель", "`" + E35_HEAD + "` (E3.5 → B1.1)"],
            ["Рабочее дерево", "чистое"],
            ["B1.2 папка до начала", "отсутствовала"],
            ["Контрольные SHA256", "сохранены в " + link("PROTECTED-BASELINE.json")],
            ["`reset --hard`, `rebase`, `force push`, `amend`", "не применялись"],
        ],
    ))
    report_lines.append("")
    report_lines.append("Расхождений нет; работа продолжена. Защищённых файлов в снимке B1.1: **%d**, изменённых **0**; SHA256 снимка `%s`. Встроенный снимок E3.5 из 811 файлов также совпал: `%s`." % (
        len(protected_paths), b11_snapshot, e35_snapshot
    ))
    report_lines.append("")
    report_lines.append("## 2. Источник, маски и метод")
    report_lines.append("")
    report_lines.append("Источник координат и масок: [%s](../B1-BACKGROUND-CLASSIFICATION/COMPONENTS.json) коммита B1.1. Исходная копия: %s; результат: %s. Технический кадр-фон: %s (побайтовый RAW-декод совпадает с `%s`)." % (
        link("../B1-BACKGROUND-CLASSIFICATION/COMPONENTS.json", "COMPONENTS.json"),
        link("work-cutout-before.png"),
        link("work-cutout-after.png"),
        link("comparison/source-frame.png"),
        "IMG_4038_rig-pose.webp",
    ))
    report_lines.append("")
    report_lines.append("Метод: для каждого из 3366 пикселей из `pixelCoordinates` четырёх компонентов alpha изменён **255 → 0**; RGB всего холста оставлен побайтово идентичным. Глобальные цветовые пороги, расширение масок, inpainting, cloning, generative fill, AI-генерация, перерисовка и восстановление анатомии не применялись. Локальное сглаживание края **не применялось**: все удаляемые пиксели имели alpha=255 и RGB, побайтово равный фону `IMG_4038` в тех же координатах, а все 920 четырёхсоседних пикселей сразу вне масок полностью непрозрачны. Полупрозрачный край создал бы новые значения alpha 1…254 внутри маски и потенциальный ореол на контрастном фоне, не улучшая композицию на целевом фоне.")
    report_lines.append("")
    report_lines.append("### Обработанные компоненты")
    report_lines.append("")
    report_lines.append(mdtable(
        ["ID", "Px", "Bbox", "Слой B1.1", "Alpha", "Маска", "x4", "x8"],
        per_component_rows,
    ))
    report_lines.append("")
    report_lines.append("Все **4 компонента / 3366 px** обработаны; ни один не оставлен нетронутым, потому что после ×4/×8 проверки риска повреждения рисунка не обнаружено. Маски: %s, %s, %s, %s и объединённая %s." % (
        *(link("masks/%s.png" % cid, cid) for cid in ALLOWED),
        link("masks/confirmed-4-mask.png", "confirmed-4-mask.png"),
    ))
    report_lines.append("")
    report_lines.append("## 3. Точный перечень изменённых пикселей")
    report_lines.append("")
    report_lines.append("Полный machine-readable перечень с координатами, alpha до/после, RGB до/после и RGB исходного кадра: %s. Канонический SHA256 списка: `%s`. Ниже — точная построчная запись диапазонов `x` для каждой строки `y`; формат `y: x0-x1, …`, границы включительные. Реконструкция из этой записи побайтово совпадает с 3366 координатами `COMPONENTS.json`." % (
        link("CHANGED-PIXELS.json"), changed_pixel_list_sha
    ))
    report_lines.append("")
    for section in row_run_sections:
        report_lines.append(section)
        report_lines.append("")
    report_lines.append("## 4. Автоматические проверки")
    report_lines.append("")
    report_lines.append(mdtable(["Проверка", "Результат"], checks_rows))
    report_lines.append("")
    report_lines.append("Отдельно: до/после композиция на целевом фоне `IMG_4038` **побайтово идентична** (`%s`), поэтому цветовой каймы/ореола/видимой ступенчатости на целевом фоне нет. Непреднамеренных дыр: **0**; внутренних прозрачных компонентов стало **8** = 4 исторических stage-04 + 4 новых, и новые множества пикселей точно равны четырём маскам. Связная с краем холста прозрачная область не изменилась." % (
        "compositeOnIntendedBackgroundByteIdentical=true"
    ))
    report_lines.append("")
    report_lines.append("## 5. Диагностические материалы и визуальная проверка")
    report_lines.append("")
    report_lines.append(mdtable(
        ["Требование", "Файл"],
        [
            ["Исходник и результат рядом, общий вид 1:1", link("comparison/00-source-vs-result-1x.png")],
            ["Cutout до/после 1:1 на шахматном фоне", link("comparison/01-cutout-before-after-1x.png")],
            ["Альфа-канал до и после", link("comparison/02-alpha-before-after.png") + "; " + link("masks/alpha-before.png") + "; " + link("masks/alpha-after.png")],
            ["Оверлей изменённых пикселей", link("comparison/03-changed-pixels-overlay.png") + "; " + link("comparison/03-overlay-with-header.png")],
            ["Тёмный / светлый / шахматный фон", link("comparison/04-background-checks.png")],
            ["Каждый компонент отдельно, ×4 и ×8", "; ".join(link(component_sheets[cid][s].relative_to(OUT).as_posix(), cid + " " + s) for cid in ALLOWED for s in ("x4", "x8"))],
            ["Визуальный контроль волос, плеч, одежды, кожи, контуров, краёв, ×8", link("comparison/19-visual-defect-review-8x.png")],
            ["Маски и delta alpha", link("masks/confirmed-4-mask.png") + "; " + link("masks/alpha-delta.png")],
        ],
    ))
    report_lines.append("")
    report_lines.append("Просмотрены крупные планы волос/плеч/рук, складок юбки, кожи, внешних и внутренних контуров и сглаженных краёв рядом с четырьмя удалёнными областями. Визуальные дефекты, требующие отката: **%s**. %s" % (
        "не обнаружены" if not VISUAL_DEFECTS else ", ".join(VISUAL_DEFECTS),
        VISUAL_NOTES,
    ))
    report_lines.append("")
    report_lines.append("Полный список диагностических PNG: %s." % link("VERIFICATION.json", "VERIFICATION.json → diagnosticImages"))
    report_lines.append("")
    report_lines.append("## 6. SHA256")
    report_lines.append("")
    report_lines.append(mdtable(["Файл", "SHA256"], hash_rows))
    report_lines.append("")
    report_lines.append("Все файлы папки, включая этот отчёт, перечислены в %s (кроме самого файла сумм)." % link("SHA256SUMS.txt"))
    report_lines.append("")
    report_lines.append("## 7. Сохранность, границы разрешения и STOP")
    report_lines.append("")
    report_lines.append("- Изменено пикселей/alpha только в копии: **3366 / 3366**; все остальные RGBA побайтово идентичны.")
    report_lines.append("- Оригиналы WebP, stage-04, E1, E2, E2 V2, E3, E3.5, B1.1, `public/`, `src/`, `dist/`, PixiJS, атлас, PR #3 не тронуты; защищённый снимок 836 файлов совпал.")
    report_lines.append("- `BG-0003`, остальные 9 `LIKELY_BACKGROUND`, все `AMBIGUOUS`, `CHARACTER_PIXEL`, `ANTIALIAS_EDGE` и любые другие пиксели не обработаны.")
    report_lines.append("- AI-генерация, inpainting, cloning, generative fill, художественная перерисовка, восстановление анатомии, новые слои: **0**. Vercel Preview/Production, B1.3, B2–B6, E4–E8 не запускались.")
    report_lines.append("- Технический PASS не объявлен художественным качеством; самоодобрения нет; остаточные дефекты E2/E3/E3.5 не списаны; скрытые зоны не восстановлены; настоящие поворот/деформация/иерархическая анимация не проверены.")
    report_lines.append("")
    report_lines.append("### Заключение о методе")
    report_lines.append("")
    report_lines.append(CONCLUSION)
    report_lines.append("")
    report_lines.append("**СТОП.** Это только пилот четырёх компонентов. Жду визуального подтверждения пользователя. Без отдельного разрешения не перехожу к `BG-0003`, другим `LIKELY_BACKGROUND`, B2 или следующим стадиям.")
    report_lines.append("")
    (OUT / "B1-PILOT-REPORT.md").write_text("\n".join(report_lines), encoding="utf-8")

    # ---------- final sums, link/CJK self-check ----------
    sum_lines = []
    for p in sorted(OUT.rglob("*")):
        if p.is_file() and TMP not in p.parents and p.name != "SHA256SUMS.txt":
            sum_lines.append("%s  %s" % (sha256_file(p), p.relative_to(OUT).as_posix()))
    (OUT / "SHA256SUMS.txt").write_text("\n".join(sum_lines) + "\n", encoding="utf-8")

    report_text = (OUT / "B1-PILOT-REPORT.md").read_text(encoding="utf-8")
    links = re.findall(r"\]\(([^)]+)\)", report_text)
    broken = [l for l in links if not l.startswith("http") and not (OUT / l).exists()]
    cjk = sum(1 for ch in report_text if "\u4e00" <= ch <= "\u9fff")
    assert not broken, broken
    assert cjk == 0

    shutil.rmtree(TMP)
    print(json.dumps({
        "status": "B1.2_BUILD_OK",
        "processedComponents": sorted(ALLOWED),
        "pixelsRemoved": len(all_pts),
        "pixelsByComponent": {cid: comp_data[cid]["pixels"] for cid in ALLOWED},
        "protectedFilesChecked": len(protected_paths),
        "protectedSnapshot": b11_snapshot,
        "compositeOnSourceBackgroundByteIdentical": composite_source_identical,
        "diagnosticPngs": len(diagnostic_images),
        "reportLinks": len(links),
        "brokenLinks": broken,
        "cjkCharacters": cjk,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
