#!/usr/bin/env python3
"""Build review-only comparison sheets for E2.

Comparison: the user's selection recorded in commit 798f884 versus the variant
recommendations in E2-CANDIDATE-REVIEW.md, with the original face alongside.

Pure presentation: reads existing files, writes only inside E2-REVIEW-SET.
No new AI images, no integration, no slot creation, no edits to the selected
variants, originals, E1, PLAN.md or game code.
"""

import sys

sys.dont_write_bytecode = True

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[3]
E2 = ROOT.parent / "E2-facial-states"
E1 = REPO / "art-studio/stages/05-independent-layers/layers"
ORIGINAL = REPO / "art-studio/references/originals/IMG_4038_rig-pose.webp"
PREVIEWS = E2 / "previews"
ELEMENTS = E2 / "elements"
REFS = E2 / "references"
OUT = ROOT / "comparison"
TMP = ROOT / ".panels"
OUT.mkdir(exist_ok=True)
TMP.mkdir(exist_ok=True)
FONT = "DejaVu-Sans"

# state: (user choice from 798f884, Arena recommendation from E2-CANDIDATE-REVIEW.md,
#         enlarged crop spec, E1 donor layer)
STATES = {
    "eye_l_closed": ("B", "A", "70x52+362+136", "14_eye_l_open.png"),
    "eye_r_closed": ("B", "A", "70x52+422+136", "15_eye_r_open.png"),
    "mouth_closed": ("A", "A", "62x46+391+176", "16_mouth_neutral.png"),
    "mouth_open": ("A", "B", "62x46+391+176", "16_mouth_neutral.png"),
    "mouth_smile": ("A", "B", "62x46+391+176", "16_mouth_neutral.png"),
}
PANEL = "520x380"


def run(args):
    p = subprocess.run(args, capture_output=True)
    if p.returncode != 0:
        raise RuntimeError(
            " ".join(str(a) for a in args) + "\n" + p.stderr.decode("utf-8", "replace")
        )
    return p.stdout


def fit(src, out, crop=None, size=PANEL, filt=None):
    args = ["convert", "-depth", "8", str(src)]
    if crop:
        args += ["-crop", crop, "+repage"]
    if filt:
        args += ["-filter", filt]
    args += ["-resize", size + "^", "-gravity", "center", "-extent", size, str(out)]
    run(args)
    return out


def on_face_full(state, variant, out):
    """Composite the selected element over the untouched original frame."""
    full = TMP / f"full-{state}-{variant}.png"
    run(
        [
            "convert", "-depth", "8", str(ORIGINAL),
            str(ELEMENTS / f"{state}-{variant}.png"),
            "-compose", "Over", "-composite", "PNG32:" + str(full),
        ]
    )
    return fit(full, out)


def zoom(src, spec, out, filt="Lanczos"):
    return fit(src, out, crop=spec, size=PANEL, filt=filt)


def zoom_composite(state, variant, spec, out, filt="Lanczos"):
    full = TMP / f"full-{state}-{variant}.png"
    if not full.exists():
        run(
            [
                "convert", "-depth", "8", str(ORIGINAL),
                str(ELEMENTS / f"{state}-{variant}.png"),
                "-compose", "Over", "-composite", "PNG32:" + str(full),
            ]
        )
    return zoom(full, spec, out, filt=filt)


def isolated(src, spec, out):
    # Checkerboard MUST be generated inline in the same convert call: writing it
    # to a file first produces a Gray PNG and desaturates the whole composite.
    merged = TMP / f"iso-{Path(src).stem}.png"
    run(
        [
            "convert", "-depth", "8",
            "-size", "848x1264", "pattern:checkerboard",
            "-colorspace", "sRGB",
            str(src), "-compose", "Over", "-composite",
            "-colorspace", "sRGB", "-type", "TrueColorAlpha",
            "PNG32:" + str(merged),
        ]
    )
    return zoom(merged, spec, out, filt="Point")


def text_panel(lines, out, size=PANEL):
    run(
        [
            "convert", "-depth", "8", "-size", size, "xc:#241d33",
            "-font", FONT, "-pointsize", "17", "-fill", "#d8cbe8",
            "-gravity", "center", "-annotate", "+0+0", "\n".join(lines),
            str(out),
        ]
    )
    return out


def montage(panels, out, tile, size=PANEL):
    args = ["montage", "-font", FONT, "-pointsize", "15", "-fill", "white",
            "-background", "#171226"]
    for label, path in panels:
        args += ["-label", label, str(path)]
    args += ["-tile", tile, "-geometry", size + "+8+8", str(out)]
    run(args)


def main():
    metrics = json.loads((E2 / "E2-final-metrics.json").read_text(encoding="utf-8"))
    by_key = {(r["state"], r["variant"]): r for r in metrics["perCandidate"]}

    rows = []
    for state, (user, arena, spec, donor) in STATES.items():
        same = user == arena
        tag = "SAME: " + user if same else f"USER {user} vs ARENA {arena}"
        note = " (reference only, NO slot)" if state == "mouth_closed" else ""
        rows.append((state, user, arena, spec, donor, tag + note))

    # 1. main contact sheet: original face | user choice | Arena recommendation
    panels = []
    for state, user, arena, spec, donor, tag in rows:
        panels += [
            (f"{state} / ORIGINAL FACE",
             fit(REFS / "face-original-4x.png", TMP / f"c-{state}-0.png", size="400x300")),
            (f"{state} / USER 798f884: {user}",
             fit(PREVIEWS / f"{state}-{user}-on-face.png", TMP / f"c-{state}-1.png", size="400x300")),
            (f"{state} / ARENA REC: {arena}",
             fit(PREVIEWS / f"{state}-{arena}-on-face.png", TMP / f"c-{state}-2.png", size="400x300")),
        ]
    montage(panels, OUT / "E2-choice-vs-recommendation.png", "3x5", size="400x300")

    # 2. enlarged smooth x8: lines, lashes, eye shape, lips, expression
    panels = []
    for state, user, arena, spec, donor, tag in rows:
        panels += [
            (f"{state} / ORIGINAL x8", zoom(ORIGINAL, spec, TMP / f"z-{state}-0.png")),
            (f"{state} / USER {user} x8", zoom_composite(state, user, spec, TMP / f"z-{state}-1.png")),
            (f"{state} / ARENA {arena} x8", zoom_composite(state, arena, spec, TMP / f"z-{state}-2.png")),
        ]
    montage(panels, OUT / "E2-choice-vs-recommendation-ZOOM.png", "3x5")

    # 3. isolated RGBA elements on checkerboard (alpha footprint / solid ellipse)
    panels = []
    for state, user, arena, spec, donor, tag in rows:
        panels += [
            (f"{state} / E1 ORIGINAL LAYER",
             isolated(E1 / donor, spec, TMP / f"e-{state}-0.png")),
            (f"{state} / USER {user} ELEMENT",
             isolated(ELEMENTS / f"{state}-{user}.png", spec, TMP / f"e-{state}-1.png")),
            (f"{state} / ARENA {arena} ELEMENT",
             isolated(ELEMENTS / f"{state}-{arena}.png", spec, TMP / f"e-{state}-2.png")),
        ]
    montage(panels, OUT / "E2-choice-vs-recommendation-ELEMENTS.png", "3x5")

    # 4. per-state metrics text panels
    panels = []
    for state, user, arena, spec, donor, tag in rows:
        u, a = by_key[(state, user)], by_key[(state, arena)]
        lines = [
            state.upper() + ("  (NO SLOT)" if state == "mouth_closed" else ""),
            "",
            f"USER 798f884: {user}     ARENA REC: {arena}",
            "",
            f"seam        {u['seamMeanAbsRgbDiff']:6.2f}   vs   {a['seamMeanAbsRgbDiff']:6.2f}",
            f"annulus     {u['registrationAnnulusMSE']:7.1f}   vs   {a['registrationAnnulusMSE']:7.1f}",
            f"dark ink    {u['darkInkPixelsElement']:4d}/{u['darkInkPixelsOriginal']:<4d}  vs  {a['darkInkPixelsElement']:4d}/{a['darkInkPixelsOriginal']:<4d}",
            f"shift       {u['featureCentroidShiftPx']}  vs  {a['featureCentroidShiftPx']}",
            "",
            "same variant" if user == arena else "DIFFERENT variants - user choice stays",
            "NOT approved / NOT integrated",
        ]
        panels.append((f"{state} / metrics", text_panel(lines, TMP / f"m-{state}.png")))
    montage(panels, OUT / "E2-choice-vs-recommendation-METRICS.png", "1x5")

    # 5. machine-readable comparison table
    out_rows = []
    for state, user, arena, spec, donor, tag in rows:
        u, a = by_key[(state, user)], by_key[(state, arena)]
        out_rows.append(
            {
                "state": state,
                "userChoice798f884": user,
                "arenaRecommendation": arena,
                "identical": user == arena,
                "separateSlot": False,
                "userMetrics": {
                    "featureCentroidShiftPx": u["featureCentroidShiftPx"],
                    "seamMeanAbsRgbDiff": u["seamMeanAbsRgbDiff"],
                    "registrationAnnulusMSE": u["registrationAnnulusMSE"],
                    "registrationShiftPx": u["registrationShiftPx"],
                    "darkInkPixels": [u["darkInkPixelsElement"], u["darkInkPixelsOriginal"]],
                },
                "arenaMetrics": {
                    "featureCentroidShiftPx": a["featureCentroidShiftPx"],
                    "seamMeanAbsRgbDiff": a["seamMeanAbsRgbDiff"],
                    "registrationAnnulusMSE": a["registrationAnnulusMSE"],
                    "registrationShiftPx": a["registrationShiftPx"],
                    "darkInkPixels": [a["darkInkPixelsElement"], a["darkInkPixelsOriginal"]],
                },
            }
        )
    (ROOT / "metrics/E2-choice-vs-recommendation.json").write_text(
        json.dumps(
            {
                "status": "review only - previous user decision 798f884 stays authoritative",
                "userDecisionDoc": "../E2-facial-states/E2-DECISION.md",
                "arenaRecommendationDoc": "reports/E2-CANDIDATE-REVIEW.md",
                "metricSource": "E2-facial-states/E2-final-metrics.json",
                "rows": out_rows,
            },
            ensure_ascii=False,
            indent=2,
        ) + "\n",
        encoding="utf-8",
    )
    print("comparison sheets:", len(list(OUT.glob("*.png"))))
    for r in out_rows:
        print(f"  {r['state']:14s} USER={r['userChoice798f884']}  ARENA={r['arenaRecommendation']}  same={r['identical']}")


if __name__ == "__main__":
    main()
