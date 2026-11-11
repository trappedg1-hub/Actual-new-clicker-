#!/usr/bin/env python3
"""B1.3 batch-01: exact alpha cleanup of reviewed LIKELY_BACKGROUND components.

Immutable inputs are read from the B1.1 / B1.2 commits.  The only pixel mutation
is alpha 255 -> 0 at the exact B1.1 coordinates of the six components whose
x4/x8 visual review passed.  Every other RGBA byte of the B1.2 result is left
unchanged.  No global colour threshold, mask dilation, feather, inpainting,
cloning, generation, drawing or hidden-anatomy restoration.

Re-running this script regenerates this folder deterministically.
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
B12 = STAGE05 / "B1-BACKGROUND-CLEANUP-PILOT"
E35 = STAGE05 / "E3.5-RESTORATION-PLAN"
SOURCE_WEBP = REPO / "art-studio/references/originals/IMG_4038_rig-pose.webp"

BRANCH = "arena/02869c32-actual-new-clicker"
B11_HEAD = "737b2925afacfdd513f14fedc9597ae85d5f1b33"
B12_HEAD = "d155dc69005165b3a6db4f5f21df3b0361182fa1"
EXPECTED_B12_SNAPSHOT = "647fd98aaf886b66617d0050d115707ea3fca50807cc565d5dde499969d86af7"
EXPECTED_B11_SNAPSHOT = "f786788a22e1c73e5ac7e35d1313f4f6ad7fb200a09e8866271a56fcfd191a3a"
EXPECTED_E35_SNAPSHOT = "998c2cbefb797eb31899ba33bf1722bc683071c739f6237d5b56591ba319969f"

B11_PREFIX = "art-studio/stages/05-independent-layers/B1-BACKGROUND-CLASSIFICATION/"
B12_PREFIX = "art-studio/stages/05-independent-layers/B1-BACKGROUND-CLEANUP-PILOT/"
B13_PREFIX = "art-studio/stages/05-independent-layers/B1-BACKGROUND-CLEANUP-BATCH-01/"
E35_PREFIX = "art-studio/stages/05-independent-layers/E3.5-RESTORATION-PLAN/"
COMPONENTS_REL = B11_PREFIX + "COMPONENTS.json"
B11_SOURCE_REL = B11_PREFIX + "diagnostics/source.png"
B12_RESULT_REL = B12_PREFIX + "work-cutout-after.png"
B12_CHANGED_REL = B12_PREFIX + "CHANGED-PIXELS.json"
B12_SCRIPT_REL = B12_PREFIX + "build_cleanup.py"
ISSUE_REL = E35_PREFIX + "ISSUE-MAP.json"

IDS = [
    "BG-0003", "BG-0006", "BG-0007", "BG-0008", "BG-0011",
    "BG-0012", "BG-0013", "BG-0017", "BG-0023",
]
APPROVED = ["BG-0003", "BG-0006", "BG-0007", "BG-0008", "BG-0011", "BG-0012"]
SKIPPED = ["BG-0013", "BG-0017", "BG-0023"]
EXPECTED = {
    "BG-0003": (354, [505, 172, 520, 233]),
    "BG-0006": (246, [326, 183, 339, 232]),
    "BG-0007": (198, [638, 462, 653, 489]),
    "BG-0008": (192, [195, 453, 211, 487]),
    "BG-0011": (114, [621, 433, 639, 457]),
    "BG-0012": (96, [191, 487, 198, 517]),
    "BG-0013": (69, [212, 438, 223, 451]),
    "BG-0017": (54, [630, 570, 637, 583]),
    "BG-0023": (26, [212, 572, 216, 579]),
}
DECISION_NOTES = {
    "BG-0003": "Чётко замкнутый тёмно-фиолетовый фон между передней прядью, ухом и воротником; на ×4/×8 внутри маски нет волос, кожи, белой обводки или сглаженного края персонажа.",
    "BG-0006": "Зеркальный замкнутый фон между левой лицевой прядью и задними волосами; границы маски совпадают с естественным просветом, соседние полупрозрачные 253/254 остаются нетронутыми.",
    "BG-0007": "Тёмный клин между правым предплечьем и отдельными прядями; форма повторяет просвет, а не складку ткани или тень на волосах; контур кожи не задет.",
    "BG-0008": "Узкий, но цельный тёмный просвет между прядями у левой руки; на ×8 граница проходит по тёмному фону, белая обводка и кожа рядом не изменены.",
    "BG-0011": "Фоновый клин рядом с уже очищенным BG-0001; отделён от него непрозрачной прядью, не соединяется с существующими дырами и не разрезает контур.",
    "BG-0012": "Узкий вертикальный просвет между прядями; маска не доходит до кожи и не расширялась; диагональное соседство с BG-0008 сохранено как есть.",
    "BG-0013": "Пропущен: на ×8 маска лежит на тонкой тёмной полосе, визуально неотличимой от тени/контура пряди; рядом есть AMBIGUOUS и CHARACTER_PIXEL, уверенно отделить фон от детали волос нельзя.",
    "BG-0017": "Пропущен: микрокомпонент 54 px вплотную к высокоградиентной границе кожа/волосы; на контрастном фоне выглядит как точечное повреждение тёмной тени, контекст недостаточен.",
    "BG-0023": "Пропущен: микрокомпонент 26 px на тёмной диагональной полосе рядом с кожей; при ×8 нельзя исключить принадлежность к теневому контуру пряди.",
}
REGION_LABEL = {
    "BG-0003": "right front hair / ear / collar",
    "BG-0006": "left front hair / collar",
    "BG-0007": "right arm / hair gap",
    "BG-0008": "left arm / hair gap",
    "BG-0011": "right hair gap near BG-0001",
    "BG-0012": "left hair gap / forearm",
    "BG-0013": "left arm / thin hair stripe",
    "BG-0017": "right hair / skin shadow",
    "BG-0023": "left hair / skin shadow",
}

VISUAL_NOTES = (
    "Для шести очищенных компонентов просмотрены исходный кадр, оверлей B1.1, точные маски, "
    "композиции на шахматном/тёмном/светлом фоне и alpha до/после при ×4 и ×8. Волосы, кожа, "
    "одежда, контуры и сглаженные края рядом с масками не разрезаны; на целевом фоне IMG_4038 "
    "композиция побайтово идентична B1.2. На контрастном фоне сохранена ожидаемая 1 px "
    "ступенчатость бинарной alpha-маски; feather и расширение масок не применялись. Внутри "
    "нескольких новых прозрачных областей остаются единичные непрозрачные фоновые пиксели, "
    "не вошедшие в точную маску B1.1; они не изменялись и видны только на техническом фоне. "
    "У BG-0008 и BG-0012 есть одно диагональное касание точных масок; маски не объединялись. "
    "Три сомнительных микрокомпонента оставлены нетронутыми."
)
CONCLUSION = (
    "Метод B1.2 технически безопасен для шести точных, индивидуально проверенных масок на "
    "копии и на целевом фоне. Это не художественное одобрение, не доказательство безопасности "
    "для пропущенных или любых других компонентов, не восстановление HZ-зон и не разрешение "
    "на следующую очистку. Технический PASS не равен художественному качеству; требуется "
    "визуальное подтверждение пользователя."
)

APPROVED_COLOR = (40, 205, 90, 255)
SKIPPED_COLOR = (230, 40, 40, 255)
CAT_COLORS = {
    "CONFIRMED_BACKGROUND": (230, 40, 40),
    "LIKELY_BACKGROUND": (255, 155, 0),
    "CHARACTER_PIXEL": (40, 205, 90),
    "ANTIALIAS_EDGE": (0, 205, 255),
    "AMBIGUOUS": (215, 55, 220),
}


def run(cmd, data=None, capture=False):
    cmd = [str(x) for x in cmd]
    if cmd and cmd[0] == "convert" and len(cmd) > 1 and cmd[-1].endswith(".png"):
        cmd = cmd[:-1] + ["-strip", "-define", "png:exclude-chunk=date,time", cmd[-1]]
    res = subprocess.run(cmd, cwd=REPO, input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode:
        raise RuntimeError("command failed: %s\n%s" % (" ".join(map(str, cmd)), res.stderr.decode("utf-8", "replace")))
    return res.stdout if capture else b""


def sha256_file(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def sha256_bytes(data):
    return hashlib.sha256(bytes(data)).hexdigest()


_ARCHIVES = {}


def archive_map(head):
    if head not in _ARCHIVES:
        raw = run(["git", "archive", "--format=tar", head], capture=True)
        files = {}
        with tarfile.open(fileobj=io.BytesIO(raw)) as tf:
            for member in tf.getmembers():
                if member.isfile():
                    files[member.name] = tf.extractfile(member).read()
        _ARCHIVES[head] = files
    return _ARCHIVES[head]


def read_rgba(path):
    return run(["convert", str(path), "-depth", "8", "rgba:-"], capture=True)


def read_gray(path):
    return run(["convert", str(path), "-depth", "8", "gray:-"], capture=True)


def write_rgba(path, data):
    run([
        "convert", "-size", "%dx%d" % (W, H), "-depth", "8", "rgba:-",
        "-define", "png:color-type=6", "-define", "png:compression-level=9", str(path),
    ], data=bytes(data))


def write_gray(path, data):
    run([
        "convert", "-size", "%dx%d" % (W, H), "-depth", "8", "gray:-",
        "-define", "png:color-type=0", "-define", "png:compression-level=9", str(path),
    ], data=bytes(data))


def add_header(src, dst, text, height=34, pointsize=12):
    run([
        "convert", str(src), "-background", "#202020", "-gravity", "north",
        "-splice", "0x%d" % height, "-gravity", "northwest",
        "-font", "DejaVu-Sans", "-pointsize", str(pointsize),
        "-fill", "white", "-annotate", "+6+6", text, str(dst),
    ])


def h_append(paths, dst):
    run(["convert"] + [str(p) for p in paths] + ["+append", str(dst)])


def v_append(paths, dst):
    run(["convert"] + [str(p) for p in paths] + ["-append", str(dst)])


def titled_sheet(panels, rows, title, dst, pointsize=12):
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
    add_header(body, dst, title, height=34, pointsize=pointsize)


def crop_panel(src, box, scale, label, dst):
    x0, y0, x1, y1 = box
    cw, ch = x1 - x0 + 1, y1 - y0 + 1
    run([
        "convert", str(src), "-crop", "%dx%d+%d+%d" % (cw, ch, x0, y0), "+repage",
        "-filter", "point", "-resize", "%d%%" % int(round(scale * 100)),
        "-background", "#202020", "-gravity", "north", "-splice", "0x30",
        "-font", "DejaVu-Sans", "-pointsize", "14", "-fill", "white",
        "-annotate", "+0+6", label, str(dst),
    ])


def composite(foreground, background, dst):
    run([
        "convert", str(background), str(foreground), "-compose", "over", "-composite",
        "-define", "png:compression-level=9", str(dst),
    ])


def solid_background(path, colour):
    run(["convert", "-size", "%dx%d" % (W, H), "xc:" + colour, str(path)])


def checker_background(path):
    data = bytearray(W * H * 4)
    for y in range(H):
        for x in range(W):
            v = 205 if ((x // 16 + y // 16) % 2 == 0) else 90
            i = (y * W + x) * 4
            data[i:i + 4] = bytes((v, v, v, 255))
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


def short_hz(hzs):
    return "/".join(z.replace("HZ-", "") for z in hzs)


def grid_sheet(items, scale, pad, title, dst):
    pairs = []
    for cid, status in items:
        x0, y0, x1, y1 = EXPECTED[cid][1]
        box = (max(0, x0 - pad), max(0, y0 - pad), min(W - 1, x1 + pad), min(H - 1, y1 + pad))
        a = TMP / ("%s-grid-%dx-a.png" % (cid, scale))
        b = TMP / ("%s-grid-%dx-b.png" % (cid, scale))
        crop_panel(CMP / "source-frame.png", box, scale, "%s SOURCE" % cid[-2:], a)
        crop_panel(CMP / "comp-after-on-checker.png", box, scale, "%s AFTER" % cid[-2:], b)
        pair = TMP / ("%s-grid-%dx-pair.png" % (cid, scale))
        h_append([a, b], pair)
        pairs.append(pair)
    dims = []
    for p in pairs:
        wh = run(["identify", "-format", "%w %h", str(p)], capture=True).decode().strip().split()
        dims.append((int(wh[0]), int(wh[1])))
    maxw = max(w for w, h in dims)
    row_files = []
    for r in range(0, len(pairs), 3):
        row_pairs = pairs[r:r + 3]
        row_h = max(dims[r + k][1] for k in range(len(row_pairs)))
        norm = []
        for k, p in enumerate(row_pairs):
            n = TMP / ("grid-norm-%d-%d.png" % (r, k))
            run(["convert", str(p), "-background", "#202020", "-gravity", "center",
                 "-extent", "%dx%d" % (maxw, row_h), str(n)])
            norm.append(n)
        rf = TMP / ("grid-row-%d.png" % r)
        h_append(norm, rf)
        row_files.append(rf)
    body = TMP / "grid-body.png"
    v_append(row_files, body)
    add_header(body, dst, title, height=34, pointsize=8)


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

    # ---------- immutable sources and exact component masks ----------
    b12_files = archive_map(B12_HEAD)
    b11_files = archive_map(B11_HEAD)
    comp_doc = json.loads(b11_files[COMPONENTS_REL])
    by_id = {c["id"]: c for c in comp_doc["components"]}
    issue = json.loads(b12_files[ISSUE_REL])
    hz_rects = {z["id"]: z["rect"] for z in issue["hiddenAnatomyZones"]}
    b12_changed = json.loads(b12_files[B12_CHANGED_REL])
    b12_pts = {(r["x"], r["y"]) for r in b12_changed["changedPixels"]}
    assert len(b12_pts) == b12_changed["totalChangedPixels"] == 3366

    comp_data = {}
    all_pts = set()
    for cid in IDS:
        c = by_id[cid]
        expected_px, expected_bbox = EXPECTED[cid]
        assert c["visualCategory"] == "LIKELY_BACKGROUND"
        assert c["pixels"] == expected_px and c["bbox"] == expected_bbox
        coords = [tuple(p) for p in c["pixelCoordinates"]]
        assert len(coords) == expected_px == len(set(coords))
        xs = [p[0] for p in coords]
        ys = [p[1] for p in coords]
        assert [min(xs), min(ys), max(xs), max(ys)] == expected_bbox
        assert all(0 <= x < W and 0 <= y < H for x, y in coords)
        pts = {y * W + x for x, y in coords}
        assert not pts & all_pts and not pts & {y * W + x for x, y in b12_pts}
        all_pts |= pts
        hz_counts = {
            z: sum(1 for x, y in coords if r[0] <= x <= r[2] and r[1] <= y <= r[3])
            for z, r in hz_rects.items()
        }
        hz_ids = [z for z, n in hz_counts.items() if n]
        assert hz_ids == c["hiddenZoneIds"]
        comp_data[cid] = {
            "pixels": expected_px, "bbox": expected_bbox, "coords": coords, "pts": pts,
            "rowRuns": row_runs(coords), "ownerSlot": c["ownerSlot"],
            "hiddenZoneIds": hz_ids, "hzPixelCounts": {z: n for z, n in hz_counts.items() if n},
            "hzZero": [z for z, n in hz_counts.items() if not n],
            "status": "CLEANED" if cid in APPROVED else "SKIPPED",
            "reason": DECISION_NOTES[cid], "region": REGION_LABEL[cid],
        }
    assert len(all_pts) == 1349 == sum(len(comp_data[i]["pts"]) for i in IDS)
    assert parse_row_runs("\n".join(comp_data[i]["rowRuns"] for i in IDS)) == {(p % W, p // W) for p in all_pts}
    approved_pts = set().union(*(comp_data[i]["pts"] for i in APPROVED))
    skipped_pts = set().union(*(comp_data[i]["pts"] for i in SKIPPED))
    assert len(approved_pts) == 1200 and len(skipped_pts) == 149
    assert approved_pts.isdisjoint(skipped_pts) and approved_pts | skipped_pts == all_pts

    # ---------- protected baseline from the immutable B1.2 commit ----------
    expected_hashes = {p: hashlib.sha256(data).hexdigest() for p, data in b12_files.items()}
    protected_paths = sorted(expected_hashes)
    current_hashes = {p: sha256_file(REPO / p) for p in protected_paths if (REPO / p).is_file()}
    protected_changed = [p for p in protected_paths if p not in current_hashes or current_hashes[p] != expected_hashes[p]]
    b12_snapshot = hashlib.sha256(("\n".join("%s  %s" % (expected_hashes[p], p) for p in protected_paths) + "\n").encode()).hexdigest()
    b11_hashes = {p: hashlib.sha256(data).hexdigest() for p, data in b11_files.items()}
    b11_snapshot = hashlib.sha256(("\n".join("%s  %s" % (b11_hashes[p], p) for p in sorted(b11_hashes)) + "\n").encode()).hexdigest()
    e35_paths = [p for p in protected_paths if not p.startswith(B11_PREFIX) and not p.startswith(B12_PREFIX) and not p.startswith(E35_PREFIX)]
    e35_snapshot = hashlib.sha256(("\n".join("%s  %s" % (expected_hashes[p], p) for p in e35_paths) + "\n").encode()).hexdigest()
    e35_embedded = issue["verification"]["protectedSnapshotSHA256"]
    critical_paths = [
        "art-studio/references/originals/IMG_4038_rig-pose.webp",
        "art-studio/stages/04-slicing-prep/cutouts/work-cutout.png",
        "art-studio/stages/04-slicing-prep/cutouts/alpha-mask.png",
        "art-studio/stages/05-independent-layers/E3-ASSEMBLY-CANON-CHECK/source/work-cutout.png",
        "art-studio/stages/05-independent-layers/E3-ASSEMBLY-CANON-CHECK/source/alpha-mask.png",
        B11_PREFIX + "COMPONENTS.json", B11_PREFIX + "CLASSIFICATION-SUMMARY.json",
        B12_PREFIX + "work-cutout-after.png", B12_PREFIX + "CHANGED-PIXELS.json",
        B12_PREFIX + "build_cleanup.py", E35_PREFIX + "ISSUE-MAP.json",
    ]
    critical_hashes = {p: expected_hashes[p] for p in critical_paths}
    protected_baseline = {
        "stage": "B1.3 / protected SHA256 baseline",
        "source": "git archive of B1.2 commit " + B12_HEAD,
        "b11Head": B11_HEAD, "b12Head": B12_HEAD, "branch": BRANCH,
        "b12ProtectedFilesChecked": len(protected_paths),
        "b12ProtectedSnapshotSHA256": b12_snapshot,
        "expectedB12SnapshotSHA256": EXPECTED_B12_SNAPSHOT,
        "b12SnapshotMatchesPreflight": b12_snapshot == EXPECTED_B12_SNAPSHOT,
        "b11FilesChecked": len(b11_hashes), "b11SnapshotSHA256": b11_snapshot,
        "b11SnapshotMatchesPreflight": b11_snapshot == EXPECTED_B11_SNAPSHOT,
        "e35FilesChecked": len(e35_paths),
        "e35EmbeddedSnapshotSHA256": e35_embedded,
        "e35RecomputedSnapshotSHA256": e35_snapshot,
        "e35SnapshotMatchesEmbedded": e35_snapshot == e35_embedded == EXPECTED_E35_SNAPSHOT,
        "protectedFilesChanged": protected_changed,
        "criticalHashes": critical_hashes,
        "protectedHashes": expected_hashes,
    }
    (OUT / "PROTECTED-BASELINE.json").write_text(json.dumps(protected_baseline, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # ---------- exact source copy and cleaned result ----------
    before_path = OUT / "work-cutout-before.png"
    after_path = OUT / "work-cutout-after.png"
    before_path.write_bytes(b12_files[B12_RESULT_REL])
    (CMP / "source-frame.png").write_bytes(b11_files[B11_SOURCE_REL])
    source_frame_path = CMP / "source-frame.png"
    source_rgba = read_rgba(source_frame_path)
    webp_rgba = read_rgba(SOURCE_WEBP)
    assert source_rgba == webp_rgba and len(source_rgba) == W * H * 4
    before = bytearray(read_rgba(before_path))
    after = bytearray(before)
    for p in approved_pts:
        i = p * 4
        assert before[i + 3] == 255 and before[i:i + 3] == source_rgba[i:i + 3]
        after[i + 3] = 0
    write_rgba(after_path, after)
    assert read_rgba(after_path) == bytes(after)
    assert sha256_file(before_path) == hashlib.sha256(b12_files[B12_RESULT_REL]).hexdigest() == expected_hashes[B12_RESULT_REL]

    # ---------- masks / alpha diagnostics ----------
    alpha_before = bytearray(W * H)
    alpha_after = bytearray(W * H)
    alpha_delta = bytearray(W * H)
    for p in range(W * H):
        alpha_before[p] = before[p * 4 + 3]
        alpha_after[p] = after[p * 4 + 3]
        alpha_delta[p] = 255 if alpha_before[p] != alpha_after[p] else 0
    write_gray(MASKS / "alpha-before.png", alpha_before)
    write_gray(MASKS / "alpha-after.png", alpha_after)
    write_gray(MASKS / "alpha-delta.png", alpha_delta)
    for cid in IDS:
        g = bytearray(W * H)
        for p in comp_data[cid]["pts"]:
            g[p] = 255
        write_gray(MASKS / (cid + ".png"), g)
    for name, pts in (("all-9-mask.png", all_pts), ("approved-6-mask.png", approved_pts), ("skipped-3-mask.png", skipped_pts)):
        g = bytearray(W * H)
        for p in pts:
            g[p] = 255
        write_gray(MASKS / name, g)

    # Full decision overlays and B1.1 category context.
    decision_overlay = bytearray(source_rgba)
    for cid in IDS:
        colour = APPROVED_COLOR if cid in APPROVED else SKIPPED_COLOR
        for p in comp_data[cid]["pts"]:
            decision_overlay[p * 4:p * 4 + 4] = bytes(colour)
    write_rgba(CMP / "04-decision-overlay.png", decision_overlay)
    per_id_overlays = {}
    for cid in IDS:
        colour = APPROVED_COLOR if cid in APPROVED else SKIPPED_COLOR
        o = bytearray(source_rgba)
        for p in comp_data[cid]["pts"]:
            o[p * 4:p * 4 + 4] = bytes(colour)
        path = CMP / (cid + "-overlay.png")
        write_rgba(path, o)
        per_id_overlays[cid] = path
    category_overlay = bytearray(source_rgba)
    for c in comp_doc["components"]:
        col = CAT_COLORS[c["visualCategory"]] + (255,)
        for x, y in c["pixelCoordinates"]:
            i = (y * W + x) * 4
            category_overlay[i:i + 4] = bytes(col)
    write_rgba(CMP / "b11-category-overlay.png", category_overlay)

    # ---------- composites on technical backgrounds ----------
    checker_background(CMP / "bg-checker.png")
    solid_background(CMP / "bg-dark.png", "#101018")
    solid_background(CMP / "bg-light.png", "#f2f2f2")
    solid_background(CMP / "bg-source-frame.png", "#241637")
    composites = {}
    for state, fg in (("before", before_path), ("after", after_path)):
        for bg in ("source", "checker", "dark", "light"):
            bgpath = source_frame_path if bg == "source" else CMP / ("bg-" + bg + ".png")
            dst = CMP / ("comp-%s-on-%s.png" % (state, bg))
            composite(fg, bgpath, dst)
            composites[(state, bg)] = dst
    assert read_rgba(composites[("before", "source")]) == read_rgba(composites[("after", "source")]) == source_rgba

    # ---------- overall nine-component map ----------
    label_pos = {
        "BG-0003": (522, 168), "BG-0006": (295, 180), "BG-0007": (650, 450),
        "BG-0008": (162, 440), "BG-0011": (612, 420), "BG-0012": (160, 484),
        "BG-0013": (207, 424), "BG-0017": (640, 558), "BG-0023": (202, 558),
    }
    cmd = ["convert", str(CMP / "04-decision-overlay.png"), "-fill", "none", "-strokewidth", "2"]
    for cid in IDS:
        x0, y0, x1, y1 = comp_data[cid]["bbox"]
        cmd += ["-stroke", "#28cd5a" if cid in APPROVED else "#e62828", "-draw", "rectangle %d,%d %d,%d" % (x0, y0, x1, y1)]
    cmd += ["-stroke", "none", "-fill", "white", "-font", "DejaVu-Sans-Bold",
            "-pointsize", "14", "-undercolor", "#202020"]
    for cid, (x, y) in label_pos.items():
        cmd += ["-annotate", "+%d+%d" % (x, y), cid[-2:]]
    cmd += [str(CMP / "00-nine-components-map-raw.png")]
    run(cmd)
    add_header(CMP / "00-nine-components-map-raw.png", CMP / "00-nine-components-map.png",
               "B1.3 BATCH-01 | 9 LIKELY_BACKGROUND | GREEN = 6 cleaned | RED = 3 skipped | exact B1.1 masks")

    # ---------- HZ intersection map ----------
    intersecting_hz = sorted({z for cid in IDS for z in comp_data[cid]["hiddenZoneIds"]})
    cmd = ["convert", str(source_frame_path), "-fill", "none", "-stroke", "#00cdff", "-strokewidth", "1"]
    for z in intersecting_hz:
        x0, y0, x1, y1 = hz_rects[z]
        cmd += ["-draw", "rectangle %d,%d %d,%d" % (x0, y0, x1, y1)]
    cmd += ["-stroke", "none", "-fill", "white", "-font", "DejaVu-Sans",
            "-pointsize", "11", "-undercolor", "#202020"]
    for z in intersecting_hz:
        x0, y0, x1, y1 = hz_rects[z]
        cmd += ["-annotate", "+%d+%d" % (x0 + 2, y0 + 10), "HZ" + z[-2:]]
    for cid in IDS:
        x0, y0, x1, y1 = comp_data[cid]["bbox"]
        cmd += ["-stroke", "#28cd5a" if cid in APPROVED else "#e62828", "-strokewidth", "2",
                "-fill", "none", "-draw", "rectangle %d,%d %d,%d" % (x0, y0, x1, y1)]
    cmd += ["-stroke", "none", "-fill", "white", "-font", "DejaVu-Sans-Bold",
            "-pointsize", "14", "-undercolor", "#202020"]
    for cid, (x, y) in label_pos.items():
        cmd += ["-annotate", "+%d+%d" % (x, y), cid[-2:]]
    cmd += [str(CMP / "06-HZ-intersections-map-raw.png")]
    run(cmd)
    add_header(CMP / "06-HZ-intersections-map-raw.png", CMP / "06-HZ-intersections-map.png",
               "B1.3 | HZ-01..HZ-26 checked | cyan = 10 intersecting HZ rects | green/red = 9 component bboxes",
               height=34, pointsize=10)

    # ---------- before/after and background comparison sheets ----------
    p1, p2, p3 = [], [], []
    for k, (f, label) in enumerate([
        (source_frame_path, "SOURCE FRAME / IMG_4038"),
        (composites[("before", "source")], "B1.2 BEFORE / SOURCE"),
        (composites[("after", "source")], "B1.3 AFTER / SOURCE"),
    ]):
        t = TMP / ("01-panel-%d.png" % k)
        crop_panel(f, (0, 0, W - 1, H - 1), 0.5, label, t)
        p1.append(t)
    titled_sheet(p1, [p1], "B1.3 | SOURCE / BEFORE / AFTER | TARGET BG | 50%", CMP / "01-source-before-after.png")

    p2 = []
    for k, (f, label) in enumerate([
        (composites[("before", "checker")], "B1.2 BEFORE / CHECKER"),
        (composites[("after", "checker")], "B1.3 AFTER / CHECKER"),
    ]):
        t = TMP / ("02-panel-%d.png" % k)
        crop_panel(f, (0, 0, W - 1, H - 1), 0.5, label, t)
        p2.append(t)
    titled_sheet(p2, [p2], "B1.3 | CUTOUT BEFORE / AFTER | CHECKER | 50%", CMP / "02-cutout-before-after.png")

    p3 = []
    for k, (f, label) in enumerate([
        (MASKS / "alpha-before.png", "ALPHA BEFORE / B1.2"),
        (MASKS / "alpha-after.png", "ALPHA AFTER / B1.3"),
        (MASKS / "alpha-delta.png", "ALPHA DELTA / 1200 px"),
    ]):
        t = TMP / ("03-panel-%d.png" % k)
        crop_panel(f, (0, 0, W - 1, H - 1), 0.5, label, t)
        p3.append(t)
    titled_sheet(p3, [p3], "B1.3 | ALPHA BEFORE / AFTER / DELTA | 50%", CMP / "03-alpha-before-after.png")

    add_header(CMP / "04-decision-overlay.png", CMP / "04-changed-pixels-overlay.png",
               "B1.3 | EXACT B1.1 MASKS | GREEN = 1200 cleaned px | RED = 149 skipped px")

    bg_panels = []
    for bg in ("dark", "light", "checker"):
        for state in ("before", "after"):
            t = TMP / ("05-%s-%s.png" % (bg, state))
            crop_panel(composites[(state, bg)], (0, 0, W - 1, H - 1), 0.5,
                       "BEFORE / %s" % bg.upper() if state == "before" else "AFTER / %s" % bg.upper(), t)
            bg_panels.append(t)
    titled_sheet(bg_panels, [bg_panels[0:2], bg_panels[2:4], bg_panels[4:6]],
                 "B1.3 | DARK / LIGHT / CHECKER | BEFORE vs AFTER | 50%", CMP / "05-background-checks.png")

    # ---------- per-component x4/x8 review sheets ----------
    sheet_names = {}
    for idx, cid in enumerate(IDS):
        d = comp_data[cid]
        status = "CLEANED" if cid in APPROVED else "SKIPPED"
        for scale, pad, prefix in ((4, 24, 10), (8, 10, 20)):
            x0, y0, x1, y1 = d["bbox"]
            box = (max(0, x0 - pad), max(0, y0 - pad), min(W - 1, x1 + pad), min(H - 1, y1 + pad))
            specs = [
                (source_frame_path, "SOURCE / IMG_4038"),
                (CMP / "b11-category-overlay.png", "B1.1 CATEGORY CONTEXT"),
                (per_id_overlays[cid], "EXACT MASK / %s" % status),
                (composites[("before", "checker")], "B1.2 BEFORE / CHECKER"),
                (composites[("after", "checker")], "B1.3 AFTER / CHECKER"),
                (composites[("before", "dark")], "B1.2 BEFORE / DARK"),
                (composites[("after", "dark")], "B1.3 AFTER / DARK"),
                (MASKS / "alpha-after.png", "ALPHA AFTER / B1.3"),
            ]
            panels = []
            for k, (f, label) in enumerate(specs):
                t = TMP / ("%s-%dx-p%d.png" % (cid, scale, k))
                crop_panel(f, box, scale, label, t)
                panels.append(t)
            rows = [panels[i:i + 2] for i in range(0, 8, 2)]
            title = "x%d %s %s %dpx" % (scale, cid, status, d["pixels"])
            dst = CMP / ("%d-%s-%dx.png" % (prefix + idx, cid, scale))
            titled_sheet(panels, rows, title, dst, pointsize=8)
            sheet_names[(cid, scale)] = dst.relative_to(OUT).as_posix()

    grid_items = [(cid, "CLEANED" if cid in APPROVED else "SKIPPED") for cid in IDS]
    grid_sheet(grid_items, 4, 18, "B1.3 x4 ALL 9 SOURCE/AFTER",
               CMP / "30-visual-review-grid-4x.png")
    grid_sheet(grid_items, 8, 8, "B1.3 x8 ALL 9 SOURCE/AFTER",
               CMP / "31-visual-review-grid-8x.png")

    # ---------- automatic checks ----------
    result = read_rgba(after_path)
    before_bytes = bytes(before)
    assert len(result) == len(before_bytes) == W * H * 4
    changed = {p for p in range(W * H) if before_bytes[p * 4:p * 4 + 4] != bytes(result[p * 4:p * 4 + 4])}
    assert changed == approved_pts
    rgb_entire_identical = all(before_bytes[i:i + 3] == result[i:i + 3] for i in range(0, W * H * 4, 4))
    outside_identical = all(before_bytes[p * 4:p * 4 + 4] == result[p * 4:p * 4 + 4] for p in range(W * H) if p not in approved_pts)
    alpha_correct = all(before_bytes[p * 4 + 3] == 255 and result[p * 4 + 3] == 0 for p in approved_pts)
    source_rgb_exact = all(before_bytes[p * 4:p * 4 + 3] == source_rgba[p * 4:p * 4 + 3] for p in approved_pts)
    masks_in_bounds = all(
        len(comp_data[cid]["pts"]) == comp_data[cid]["pixels"] and
        all(x0 <= (p % W) <= x1 and y0 <= (p // W) <= y1 for p in comp_data[cid]["pts"])
        for cid in IDS for x0, y0, x1, y1 in [comp_data[cid]["bbox"]]
    )
    mask_union_ok = read_gray(MASKS / "approved-6-mask.png") == bytes(255 if p in approved_pts else 0 for p in range(W * H))
    skipped_unchanged = all(before_bytes[p * 4:p * 4 + 4] == result[p * 4:p * 4 + 4] for p in skipped_pts)
    interior_before, comps_before, exterior_before = internal_components(alpha_before)
    interior_after, comps_after, exterior_after = internal_components(alpha_after)
    new_exact_components = sum(1 for q in comps_after if q not in comps_before)
    exact_new_masks = all(
        any(q == comp_data[cid]["pts"] for q in comps_after)
        for cid in APPROVED
    )
    unintended_holes = len(interior_after - interior_before - approved_pts)
    # 4-neighbour adjacency to pre-existing transparent pixels and exterior.
    adjacent_transparent = 0
    adjacent_exterior = 0
    diagonal_pairs = []
    for cid in APPROVED:
        for p in comp_data[cid]["pts"]:
            y, x = divmod(p, W)
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                ny, nx = y + dy, x + dx
                if 0 <= ny < H and 0 <= nx < W:
                    v = ny * W + nx
                    if v not in approved_pts:
                        if alpha_before[v] < 128:
                            adjacent_transparent += 1
                        if v in exterior_before:
                            adjacent_exterior += 1
    for i, a in enumerate(IDS):
        for b in IDS[i + 1:]:
            if any((x + dx, y + dy) in {(q % W, q // W) for q in comp_data[b]["pts"]}
                   for x, y in comp_data[a]["coords"] for dx in (-1, 0, 1) for dy in (-1, 0, 1) if dx or dy):
                diagonal_pairs.append([a, b])
    semi_before = sum(1 for p, v in enumerate(alpha_before) if 0 < v < 255 and p not in approved_pts)
    semi_after = sum(1 for p, v in enumerate(alpha_after) if 0 < v < 255 and p not in approved_pts)
    diagnostic_pngs = sorted(CMP.rglob("*.png")) + sorted(MASKS.rglob("*.png")) + [before_path, after_path]
    for p in diagnostic_pngs:
        run(["convert", str(p), "null:"])
    after_channels = run(["identify", "-format", "%[channels]", str(after_path)], capture=True).decode().strip()
    generated_pngs = [p for p in diagnostic_pngs if p not in (before_path, CMP / "source-frame.png")]
    with_time = []
    for p in generated_pngs:
        verbose = run(["identify", "-verbose", str(p)], capture=True).decode()
        if "png:tIME" in verbose:
            with_time.append(p.relative_to(OUT).as_posix())

    changed_records = []
    for cid in APPROVED:
        for x, y in sorted(comp_data[cid]["coords"], key=lambda q: (q[1], q[0])):
            p = y * W + x
            i = p * 4
            rgb = list(before_bytes[i:i + 3])
            changed_records.append({
                "componentId": cid, "x": x, "y": y,
                "alphaBefore": before_bytes[i + 3], "alphaAfter": result[i + 3],
                "rgbBefore": rgb, "rgbAfter": list(result[i:i + 3]),
                "sourceFrameRgb": list(source_rgba[i:i + 3]),
                "rgbEqualsSourceFrame": rgb == list(source_rgba[i:i + 3]),
            })
    canonical = "\n".join("%s,%d,%d,%d,%d" % (r["componentId"], r["x"], r["y"], r["alphaBefore"], r["alphaAfter"]) for r in changed_records)
    changed_list_sha = hashlib.sha256(canonical.encode()).hexdigest()
    changed_json = {
        "stage": "B1.3 / B1-BACKGROUND-CLEANUP-BATCH-01",
        "status": "PILOT_BATCH_ONLY / NOT_ARTISTICALLY_APPROVED",
        "sourceOfCoordinates": "../B1-BACKGROUND-CLASSIFICATION/COMPONENTS.json @ " + B11_HEAD,
        "sourceImage": "../B1-BACKGROUND-CLEANUP-PILOT/work-cutout-after.png @ " + B12_HEAD,
        "approvedComponents": APPROVED,
        "skippedComponents": [
            {"id": cid, "pixels": comp_data[cid]["pixels"], "bbox": comp_data[cid]["bbox"], "reason": DECISION_NOTES[cid]}
            for cid in SKIPPED
        ],
        "totalChangedPixels": len(changed_records),
        "pixelsByComponent": {cid: comp_data[cid]["pixels"] for cid in APPROVED},
        "alphaTransition": "255 -> 0",
        "rgbPreserved": True,
        "featherApplied": False,
        "changedPixelListSha256": changed_list_sha,
        "changedPixels": changed_records,
    }
    (OUT / "CHANGED-PIXELS.json").write_text(json.dumps(changed_json, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    checks = {
        "preflightLocalOriginGithubApiHeadEqualB12": True,
        "preflightWorktreeClean": True,
        "b12Head": B12_HEAD,
        "b12ParentEqualsB11": run(["git", "rev-parse", B12_HEAD + "^"], capture=True).decode().strip() == B11_HEAD,
        "onlyNineLikelyBackgroundComponentsReviewed": set(IDS) == {c["id"] for c in comp_doc["components"] if c["visualCategory"] == "LIKELY_BACKGROUND"},
        "approvedComponents": APPROVED,
        "skippedComponents": SKIPPED,
        "totalCandidatePixels": len(all_pts),
        "totalChangedPixels": len(changed),
        "changedOnlyApprovedCoordinates": changed == approved_pts,
        "rgbaOutsideChangedCoordinatesByteIdentical": outside_identical,
        "rgbEntireCanvasByteIdentical": rgb_entire_identical,
        "alphaCorrectAtChangedPixels": alpha_correct,
        "skippedComponentPixelsUnchanged": skipped_unchanged,
        "b12ChangedPixelsUntouched": all(before_bytes[(y * W + x) * 4 + 3] == result[(y * W + x) * 4 + 3] == 0 for x, y in b12_pts),
        "masksExactlyMatchB11Coordinates": mask_union_ok,
        "masksWithinComponentBounds": masks_in_bounds,
        "noMaskOverlap": True,
        "noGlobalColourThreshold": True,
        "noMaskExpansion": True,
        "edgeFeatherApplied": False,
        "removedRgbEqualsSourceBackground": source_rgb_exact,
        "compositeOnIntendedBackgroundByteIdentical": read_rgba(composites[("before", "source")]) == read_rgba(composites[("after", "source")]),
        "sourceFrameRawEqualsWebpRaw": source_rgba == webp_rgba,
        "internalTransparentComponentsBefore": len(comps_before),
        "internalTransparentComponentsAfter": len(comps_after),
        "newExactInternalComponents": new_exact_components,
        "newInternalComponentsMatchApprovedMasks": exact_new_masks,
        "unintendedHoles": unintended_holes,
        "connectedToPreExistingTransparent4Neighbours": adjacent_transparent,
        "connectedToExteriorTransparent4Neighbours": adjacent_exterior,
        "exteriorConnectedTransparentUnchanged": exterior_before == exterior_after,
        "diagonalAdjacentExactMaskPairs": diagonal_pairs,
        "semiTransparentOutsideMasksBefore": semi_before,
        "semiTransparentOutsideMasksAfter": semi_after,
        "afterPngOpensWithoutErrors": True,
        "allDiagnosticPngsOpenWithoutErrors": True,
        "afterPngHasAlphaChannel": "a" in after_channels.lower(),
        "generatedPngsWithTimeChunk": with_time,
        "protectedFilesChecked": len(protected_paths),
        "protectedFilesChanged": protected_changed,
        "b12ProtectedSnapshotSHA256": b12_snapshot,
        "b12SnapshotMatchesPreflight": b12_snapshot == EXPECTED_B12_SNAPSHOT,
        "b11SnapshotMatchesPreflight": b11_snapshot == EXPECTED_B11_SNAPSHOT,
        "e35EmbeddedSnapshotMatches": e35_snapshot == e35_embedded == EXPECTED_E35_SNAPSHOT,
        "hzAll26Checked": True,
        "hzIntersectionsVerifiedAgainstB11": all(comp_data[cid]["hzZero"] for cid in IDS) is False,
        "hzIntersectingIds": intersecting_hz,
        "hzHiddenAnatomyRestored": False,
        "changedPixelListSha256": changed_list_sha,
        "aiGeneratedImages": 0,
        "inpaintingCloningGenerativeFill": 0,
        "hiddenAnatomyRestored": 0,
        "newArtLayers": 0,
        "ambiguousOrCharacterOrAntialiasPixelsChanged": False,
        "outsideNineIdsProcessed": False,
        "originalWebpE1E2E3E35B11B12Changed": False,
        "codePixiJSAtlasPublicSrcDistPRChanged": False,
        "vercelPreviewOrProduction": False,
        "b2ToB6OrE4ToE8Started": False,
        "b14OrFurtherCleanupStarted": False,
        "selfApproval": False,
        "technicalPassEqualsArtisticQuality": False,
        "approval": "NOT_APPROVED",
    }
    # Explicitly verify no recorded hidden-zone ID outside B1.1 lists.
    checks["hzIntersectionsVerifiedAgainstB11"] = all(
        comp_data[cid]["hiddenZoneIds"] == by_id[cid]["hiddenZoneIds"] and
        all(n > 0 for n in comp_data[cid]["hzPixelCounts"].values()) and
        all(z not in comp_data[cid]["hzPixelCounts"] for z in comp_data[cid]["hzZero"])
        for cid in IDS
    )
    assert checks["changedOnlyApprovedCoordinates"] and checks["rgbaOutsideChangedCoordinatesByteIdentical"]
    assert checks["rgbEntireCanvasByteIdentical"] and checks["alphaCorrectAtChangedPixels"] and checks["skippedComponentPixelsUnchanged"]
    assert checks["masksExactlyMatchB11Coordinates"] and checks["masksWithinComponentBounds"]
    assert checks["removedRgbEqualsSourceBackground"] and checks["compositeOnIntendedBackgroundByteIdentical"]
    assert checks["internalTransparentComponentsBefore"] == 8
    assert checks["internalTransparentComponentsAfter"] == 14
    assert checks["newExactInternalComponents"] == 6 and checks["newInternalComponentsMatchApprovedMasks"]
    assert checks["unintendedHoles"] == 0 and checks["connectedToPreExistingTransparent4Neighbours"] == 0
    assert checks["connectedToExteriorTransparent4Neighbours"] == 0 and checks["exteriorConnectedTransparentUnchanged"]
    assert checks["semiTransparentOutsideMasksBefore"] == checks["semiTransparentOutsideMasksAfter"]
    assert checks["afterPngHasAlphaChannel"] and not with_time
    assert checks["protectedFilesChanged"] == [] and checks["b12SnapshotMatchesPreflight"]
    assert checks["b11SnapshotMatchesPreflight"] and checks["e35EmbeddedSnapshotMatches"]
    assert checks["hzIntersectionsVerifiedAgainstB11"] and checks["b12ParentEqualsB11"]

    verification = {
        "stage": "B1.3 / B1-BACKGROUND-CLEANUP-BATCH-01",
        "status": "TECHNICAL_PASS / NOT_ARTISTICALLY_APPROVED",
        "branch": BRANCH,
        "b11Head": B11_HEAD,
        "b12Head": B12_HEAD,
        "preflight": {
            "localHead": B12_HEAD, "originHead": B12_HEAD, "githubApiHead": B12_HEAD,
            "worktreeClean": True, "targetFolderAbsent": True,
        },
        "componentDecisions": [
            {
                "id": cid, "status": comp_data[cid]["status"], "pixels": comp_data[cid]["pixels"],
                "bbox": comp_data[cid]["bbox"], "ownerSlot": comp_data[cid]["ownerSlot"],
                "hiddenZoneIds": comp_data[cid]["hiddenZoneIds"],
                "hzPixelCounts": comp_data[cid]["hzPixelCounts"],
                "hzZero": comp_data[cid]["hzZero"], "reason": comp_data[cid]["reason"],
                "x4": sheet_names[(cid, 4)], "x8": sheet_names[(cid, 8)],
            }
            for cid in IDS
        ],
        "diagnosticImages": sorted(p.relative_to(OUT).as_posix() for p in diagnostic_pngs),
        "visualReview": {
            "viewed": ["1:1 source/before/after", "x4 per component", "x8 per component", "x4/x8 all-nine grids", "dark/light/checker", "alpha before/after/delta", "B1.1 category context", "HZ map"],
            "visualDefectsRequiringRollback": [],
            "disclosedLimitations": [
                "1 px stair-step binary alpha edges are preserved on contrast backgrounds",
                "single opaque background-colour islands remain inside some exact masks because masks were not expanded",
                "BG-0008 and BG-0012 touch only diagonally; no mask merge was performed",
                "HZ-01..HZ-26 are documented, but hidden anatomy remains NOT_RESTORED",
            ],
            "notes": VISUAL_NOTES,
            "conclusion": CONCLUSION,
        },
        "checks": checks,
        "sha256": {
            "work-cutout-before.png": sha256_file(before_path),
            "work-cutout-after.png": sha256_file(after_path),
            "CHANGED-PIXELS.json": sha256_file(OUT / "CHANGED-PIXELS.json"),
            "PROTECTED-BASELINE.json": sha256_file(OUT / "PROTECTED-BASELINE.json"),
            "build_batch.py": sha256_file(Path(__file__)),
            "B12-work-cutout-after.png": expected_hashes[B12_RESULT_REL],
            "B11-COMPONENTS.json": expected_hashes[COMPONENTS_REL],
            "B12-CHANGED-PIXELS.json": expected_hashes[B12_CHANGED_REL],
            "B12-build_cleanup.py": expected_hashes[B12_SCRIPT_REL],
            "E35-ISSUE-MAP.json": expected_hashes[ISSUE_REL],
            "IMG_4038_rig-pose.webp": expected_hashes["art-studio/references/originals/IMG_4038_rig-pose.webp"],
        },
    }
    (OUT / "VERIFICATION.json").write_text(json.dumps(verification, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    # ---------- Markdown report ----------
    decision_rows = []
    for cid in IDS:
        d = comp_data[cid]
        decision_rows.append([
            "`%s`" % cid, d["pixels"], str(d["bbox"]), "`%s`" % d["status"],
            ", ".join(d["hiddenZoneIds"]), d["reason"],
            "[x4](%s) / [x8](%s)" % (sheet_names[(cid, 4)], sheet_names[(cid, 8)]),
        ])
    hz_rows = []
    for cid in IDS:
        d = comp_data[cid]
        hz_rows.append([
            "`%s`" % cid, ", ".join("%s: %d px" % (z, n) for z, n in d["hzPixelCounts"].items()),
            ", ".join(d["hzZero"]) or "—",
        ])
    runs_sections = []
    for cid in APPROVED:
        runs_sections.append("### %s — %d px, bbox %s\n\n```text\n%s\n```" % (
            cid, comp_data[cid]["pixels"], str(comp_data[cid]["bbox"]), comp_data[cid]["rowRuns"]))
    check_rows = []
    for k in [
        "changedOnlyApprovedCoordinates", "rgbaOutsideChangedCoordinatesByteIdentical", "rgbEntireCanvasByteIdentical",
        "alphaCorrectAtChangedPixels", "skippedComponentPixelsUnchanged", "masksExactlyMatchB11Coordinates",
        "masksWithinComponentBounds", "noGlobalColourThreshold", "noMaskExpansion", "edgeFeatherApplied",
        "removedRgbEqualsSourceBackground", "compositeOnIntendedBackgroundByteIdentical", "sourceFrameRawEqualsWebpRaw",
        "internalTransparentComponentsBefore", "internalTransparentComponentsAfter", "newExactInternalComponents",
        "newInternalComponentsMatchApprovedMasks", "unintendedHoles", "connectedToPreExistingTransparent4Neighbours",
        "connectedToExteriorTransparent4Neighbours", "exteriorConnectedTransparentUnchanged",
        "afterPngOpensWithoutErrors", "allDiagnosticPngsOpenWithoutErrors", "afterPngHasAlphaChannel",
        "protectedFilesChecked", "b12SnapshotMatchesPreflight", "b11SnapshotMatchesPreflight",
        "e35EmbeddedSnapshotMatches", "hzIntersectionsVerifiedAgainstB11", "aiGeneratedImages",
        "inpaintingCloningGenerativeFill", "hiddenAnatomyRestored", "selfApproval",
        "technicalPassEqualsArtisticQuality", "approval",
    ]:
        v = checks[k]
        if isinstance(v, bool):
            v = "PASS" if v else "NOT APPLIED"
        check_rows.append(["`%s`" % k, v])
    report = []
    report.append("# B1.3 — Пакетная очистка 9 компонентов LIKELY_BACKGROUND")
    report.append("")
    report.append("**Статус:** `TECHNICAL_PASS / NOT_ARTISTICALLY_APPROVED`. Разрешение распространяется только на девять указанных `LIKELY_BACKGROUND` из B1.1; фактически очищены **6**, три сомнительных компонента пропущены. Работа выполнена только на новой копии результата B1.2.")
    report.append("**Ветка:** `%s`. **HEAD перед началом:** `%s` (B1.2). **B1.1:** `%s`." % (BRANCH, B12_HEAD, B11_HEAD))
    report.append("")
    report.append("---")
    report.append("")
    report.append("## 1. Preflight и источники")
    report.append("")
    report.append(mdtable(["Проверка", "Результат"], [
        ["`git fetch origin %s`" % BRANCH, "выполнено"],
        ["Локальный HEAD / origin / GitHub API", "все `%s`" % B12_HEAD],
        ["Родитель B1.2", "`%s` (B1.1)" % B11_HEAD],
        ["Рабочее дерево до начала", "чистое"],
        ["Папка B1.3 до начала", "отсутствовала"],
        ["Контрольные SHA256", "[PROTECTED-BASELINE.json](PROTECTED-BASELINE.json)"],
        ["`reset --hard`, `rebase`, `force push`, `amend`", "не применялись"],
    ]))
    report.append("")
    report.append("Защищённых файлов B1.2 проверено **%d**, изменённых **0**; snapshot `%s`. Снимок B1.1 из 836 файлов и встроенный снимок E3.5 из 811 файлов также совпали." % (len(protected_paths), b12_snapshot))
    report.append("")
    report.append("Источники истины: [../B1-BACKGROUND-CLASSIFICATION/COMPONENTS.json](../B1-BACKGROUND-CLASSIFICATION/COMPONENTS.json), [B1.1 diagnostics](../B1-BACKGROUND-CLASSIFICATION/diagnostics/00-overview-map.png), [../B1-BACKGROUND-CLEANUP-PILOT/CHANGED-PIXELS.json](../B1-BACKGROUND-CLEANUP-PILOT/CHANGED-PIXELS.json), [../B1-BACKGROUND-CLEANUP-PILOT/build_cleanup.py](../B1-BACKGROUND-CLEANUP-PILOT/build_cleanup.py), [../E3.5-RESTORATION-PLAN/ISSUE-MAP.json](../E3.5-RESTORATION-PLAN/ISSUE-MAP.json).")
    report.append("")
    report.append("## 2. Решения по девяти компонентам")
    report.append("")
    report.append("Общая карта: [comparison/00-nine-components-map.png](comparison/00-nine-components-map.png). Зелёный = очищено, красный = пропущено; прямоугольники — точные bbox B1.1.")
    report.append("")
    report.append(mdtable(["ID", "Px", "Bbox", "Решение", "HZ", "Основание после ×4/×8", "Листы"], decision_rows))
    report.append("")
    report.append("**Очищено:** %s. **Пропущено:** %s. Удалённых пикселей: **%d** из 1349 кандидатов; пропущено **%d** пикселей." % (
        ", ".join("`%s`" % i for i in APPROVED), ", ".join("`%s`" % i for i in SKIPPED), len(approved_pts), len(skipped_pts)))
    report.append("")
    report.append("## 3. Проверка HZ-01…HZ-26")
    report.append("")
    report.append("Карта пересекающихся HZ: [comparison/06-HZ-intersections-map.png](comparison/06-HZ-intersections-map.png). Пересечения вычислены по всем 26 прямоугольникам из E3.5 `ISSUE-MAP.json` и побайтово сверены с `hiddenZoneIds` B1.1. Пересекаются 10 зон: %s; остальные 16 имеют 0 общих пикселей. Скрытая анатомия **не восстанавливалась**; все такие зоны остаются `NOT_RESTORED` и требуют отдельного разрешения." % ", ".join(intersecting_hz))
    report.append("")
    report.append(mdtable(["ID", "Пересечения с непустым числом пикселей", "HZ с нулём пикселей"], hz_rows))
    report.append("")
    report.append("## 4. Метод и результат")
    report.append("")
    report.append("Исходная копия: [work-cutout-before.png](work-cutout-before.png) — точная копия `work-cutout-after.png` из B1.2. Результат: [work-cutout-after.png](work-cutout-after.png). Для 1200 разрешённых координат alpha изменён **255 → 0**; RGB всего холста и все остальные RGBA-байты побайтово идентичны. Глобальные цветовые пороги, расширение масок, feather, AI, inpainting, cloning, generative fill, перерисовка и восстановление анатомии не применялись.")
    report.append("")
    report.append("Маски: [approved-6-mask.png](masks/approved-6-mask.png), [skipped-3-mask.png](masks/skipped-3-mask.png), [all-9-mask.png](masks/all-9-mask.png), девять отдельных масок `masks/BG-*.png`, [alpha-before.png](masks/alpha-before.png), [alpha-after.png](masks/alpha-after.png), [alpha-delta.png](masks/alpha-delta.png).")
    report.append("")
    report.append("Точный machine-readable перечень удалённых координат: [CHANGED-PIXELS.json](CHANGED-PIXELS.json). Канонический SHA256 списка: `%s`." % changed_list_sha)
    report.append("")
    report.append("### Построчный перечень удалённых координат")
    report.append("")
    report.append("Формат `y: x0-x1, …`, границы включительные. Реконструкция побайтово совпадает с 1200 координатами шести компонентов.")
    report.append("")
    report.append("\n\n".join(runs_sections))
    report.append("")
    report.append("## 5. Автоматические проверки")
    report.append("")
    report.append(mdtable(["Проверка", "Результат"], check_rows))
    report.append("")
    report.append("Отдельно: до/после композиция на целевом фоне `IMG_4038` **побайтово идентична**, поэтому цветовой каймы/ореола на целевом фоне нет. Внутренних прозрачных компонентов стало **14** = 4 исторических stage-04 + 4 B1.2 + 6 новых B1.3; непреднамеренных дыр **0**, связи с внешней прозрачной областью или прежними дырами **0**. `BG-0008` и `BG-0012` имеют только диагональное касание точных масок; маски не объединялись и не расширялись.")
    report.append("")
    report.append("## 6. Диагностика и визуальный контроль")
    report.append("")
    report.append(mdtable(["Материал", "Ссылка"], [
        ["Исходный кадр / B1.2 до / B1.3 после, 50%", "[comparison/01-source-before-after.png](comparison/01-source-before-after.png)"],
        ["Cutout до/после на шахматном фоне, 50%", "[comparison/02-cutout-before-after.png](comparison/02-cutout-before-after.png)"],
        ["Alpha до/после/delta", "[comparison/03-alpha-before-after.png](comparison/03-alpha-before-after.png)"],
        ["Оверлей изменённых и пропущенных пикселей", "[comparison/04-changed-pixels-overlay.png](comparison/04-changed-pixels-overlay.png)"],
        ["Тёмный / светлый / шахматный фон", "[comparison/05-background-checks.png](comparison/05-background-checks.png)"],
        ["Карта девяти компонентов", "[comparison/00-nine-components-map.png](comparison/00-nine-components-map.png)"],
        ["Карта HZ-пересечений", "[comparison/06-HZ-intersections-map.png](comparison/06-HZ-intersections-map.png)"],
        ["Все девять, ×4", "[comparison/30-visual-review-grid-4x.png](comparison/30-visual-review-grid-4x.png)"],
        ["Все девять, ×8", "[comparison/31-visual-review-grid-8x.png](comparison/31-visual-review-grid-8x.png)"],
        ["Каждый ID отдельно ×4/×8", "ссылки в таблице решений §2 и файлы `comparison/10-*`, `comparison/20-*`"],
        ["Полный список диагностических PNG", "[VERIFICATION.json → diagnosticImages](VERIFICATION.json)"],
    ]))
    report.append("")
    report.append("Просмотрены волосы, плечи, руки, кожа, одежда, тени, внешние/внутренние контуры и сглаженные края рядом со всеми девятью масками. %s" % VISUAL_NOTES)
    report.append("")
    report.append("Визуальные дефекты, требующие отката: **не обнаружены**. Технические ограничения, перечисленные выше: 1 px ступенчатость на контрастном фоне, единичные непрозрачные фоновые островки внутри точных масок, диагональное касание двух масок и невосстановленные HZ-зоны.")
    report.append("")
    report.append("## 7. SHA256")
    report.append("")
    sha_rows = []
    for label, rel in [
        ("work-cutout-before.png", "work-cutout-before.png"),
        ("work-cutout-after.png", "work-cutout-after.png"),
        ("CHANGED-PIXELS.json", "CHANGED-PIXELS.json"),
        ("PROTECTED-BASELINE.json", "PROTECTED-BASELINE.json"),
        ("VERIFICATION.json", "VERIFICATION.json"),
        ("build_batch.py", "build_batch.py"),
    ]:
        sha_rows.append(["[%s](%s)" % (label, rel), sha256_file(OUT / rel)])
    for label, p in [
        ("B1.2 work-cutout-after.png", B12_RESULT_REL), ("B1.1 COMPONENTS.json", COMPONENTS_REL),
        ("B1.2 CHANGED-PIXELS.json", B12_CHANGED_REL), ("B1.2 build_cleanup.py", B12_SCRIPT_REL),
        ("E3.5 ISSUE-MAP.json", ISSUE_REL), ("IMG_4038_rig-pose.webp", "art-studio/references/originals/IMG_4038_rig-pose.webp"),
    ]:
        sha_rows.append([label, expected_hashes[p]])
    report.append(mdtable(["Файл", "SHA256"], sha_rows))
    report.append("")
    report.append("Все файлы папки, включая отчёт, перечислены в [SHA256SUMS.txt](SHA256SUMS.txt), кроме самого файла сумм.")
    report.append("")
    report.append("## 8. Границы разрешения и STOP")
    report.append("")
    report.append("- Очищено **6 / 9** компонентов, **1200 px**; пропущено **3 / 9**, **149 px**.")
    report.append("- Оригиналы WebP, stage-04, E1, E2, E2 V2, E3, E3.5, B1.1, B1.2, `public/`, `src/`, `dist/`, PixiJS, атлас, игровой код и PR не тронуты; защищённый снимок из %d файлов совпал." % len(protected_paths))
    report.append("- `AMBIGUOUS`, `CHARACTER_PIXEL`, `ANTIALIAS_EDGE`, остальные компоненты и любые пиксели вне шести точных масок не изменялись.")
    report.append("- AI-генерация, inpainting, cloning, generative fill, художественная перерисовка, восстановление анатомии, новые слои: **0**. Vercel Preview/Production, B1.4, B2–B6, E4–E8 не запускались.")
    report.append("- %s" % CONCLUSION)
    report.append("")
    report.append("**СТОП.** Это только пакетный пилот девяти указанных компонентов. Жду визуального подтверждения пользователя. Без отдельного разрешения не перехожу к пропущенным `BG-0013`, `BG-0017`, `BG-0023`, другим компонентам, B2 или следующим стадиям.")
    report.append("")
    report_text = "\n".join(report)
    (OUT / "B1-BATCH-REPORT.md").write_text(report_text, encoding="utf-8")

    # ---------- SHA256SUMS and textual validation ----------
    shutil.rmtree(TMP)
    sums = []
    for p in sorted(q for q in OUT.rglob("*") if q.is_file() and q.name != "SHA256SUMS.txt"):
        sums.append("%s  %s" % (sha256_file(p), p.relative_to(OUT).as_posix()))
    (OUT / "SHA256SUMS.txt").write_text("\n".join(sums) + "\n", encoding="utf-8")
    text_files = sorted(p for p in OUT.rglob("*") if p.is_file() and p.suffix in (".md", ".json", ".py", ".txt") and p.name != "SHA256SUMS.txt")
    all_text = "\n".join(p.read_text(encoding="utf-8") for p in text_files)
    cjk = sum(1 for ch in all_text if "\u4e00" <= ch <= "\u9fff")
    links = re.findall(r"\]\(([^)]+)\)", (OUT / "B1-BATCH-REPORT.md").read_text(encoding="utf-8"))
    broken = [l for l in links if not l.startswith("http") and not (OUT / l).exists()]
    assert cjk == 0, ("CJK", cjk)
    assert not broken, broken
    print(json.dumps({
        "status": "B1.3_BUILD_OK",
        "cleanedComponents": APPROVED,
        "skippedComponents": SKIPPED,
        "pixelsRemoved": len(changed),
        "pixelsByComponent": {cid: comp_data[cid]["pixels"] for cid in APPROVED},
        "protectedFilesChecked": len(protected_paths),
        "protectedFilesChanged": protected_changed,
        "b12ProtectedSnapshot": b12_snapshot,
        "compositeOnSourceBackgroundByteIdentical": True,
        "internalTransparentComponentsBefore": len(comps_before),
        "internalTransparentComponentsAfter": len(comps_after),
        "unintendedHoles": unintended_holes,
        "diagnosticPngs": len(diagnostic_pngs),
        "reportLinks": len(links),
        "brokenLinks": broken,
        "cjkCharacters": cjk,
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
