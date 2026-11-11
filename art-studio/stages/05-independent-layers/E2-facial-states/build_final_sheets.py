#!/usr/bin/env python3
"""Final review sheets for the five E2 facial states (all A + all B).

Pure presentation + measurement. No new artistic pixels, no integration,
no writes into E1 / originals / accepted report.
"""

import sys

sys.dont_write_bytecode = True

import json
import math
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[3]
ORIGINAL = REPO / "art-studio/references/originals/IMG_4038_rig-pose.webp"
E1 = REPO / "art-studio/stages/05-independent-layers/layers"
CANDS = ROOT / "candidates"
ELEMENTS = ROOT / "elements"
PREVIEWS = ROOT / "previews"
REFS = ROOT / "references"
TMP = ROOT / ".final-panels"
TMP.mkdir(exist_ok=True)
FONT = "DejaVu-Sans"

STATES = {
    "eye_l_closed": ("70x52+362+136", E1 / "14_eye_l_open.png", REFS / "eye_l_open-zoom.png"),
    "eye_r_closed": ("70x52+422+136", E1 / "15_eye_r_open.png", REFS / "eye_r_open-zoom.png"),
    "mouth_closed": ("62x46+391+176", E1 / "16_mouth_neutral.png", REFS / "mouth_neutral-zoom.png"),
    "mouth_open": ("62x46+391+176", E1 / "16_mouth_neutral.png", REFS / "mouth_neutral-zoom.png"),
    "mouth_smile": ("62x46+391+176", E1 / "16_mouth_neutral.png", REFS / "mouth_neutral-zoom.png"),
}
MOUTH_SPEC = "62x46+391+176"
PANEL = "520x380"


def run(args):
    p = subprocess.run(args, capture_output=True)
    if p.returncode != 0:
        raise RuntimeError(
            " ".join(str(a) for a in args) + "\n" + p.stderr.decode("utf-8", "replace")
        )
    return p.stdout


def fit(src, out, crop=None, size=PANEL):
    args = ["convert", "-depth", "8", str(src)]
    if crop:
        args += ["-crop", crop, "+repage"]
    args += ["-resize", size + "^", "-gravity", "center", "-extent", size, str(out)]
    run(args)
    return out


def composite_full(elem, out):
    run(
        [
            "convert",
            "-depth",
            "8",
            str(ORIGINAL),
            str(elem),
            "-compose",
            "Over",
            "-composite",
            "PNG32:" + str(out),
        ]
    )
    return out


def enlarged_on_face(state, variant, out):
    spec = STATES[state][0]
    if variant == "ORIGINAL":
        src = ORIGINAL
    else:
        src = composite_full(
            ELEMENTS / f"{state}-{variant}.png", TMP / f"full-{state}-{variant}.png"
        )
    run(
        [
            "convert",
            "-depth",
            "8",
            str(src),
            "-crop",
            spec,
            "+repage",
            "-filter",
            "Point",
            "-resize",
            "800%",
            "-resize",
            PANEL + "^",
            "-gravity",
            "center",
            "-extent",
            PANEL,
            str(out),
        ]
    )
    return out


def enlarged_smooth(state, variant, out):
    """Smooth 8x enlargement for judging line weight and drawing manner."""
    spec = STATES[state][0]
    if variant == "ORIGINAL":
        src = ORIGINAL
    else:
        src = composite_full(
            ELEMENTS / f"{state}-{variant}.png", TMP / f"full-{state}-{variant}.png"
        )
    run(
        [
            "convert",
            "-depth",
            "8",
            str(src),
            "-crop",
            spec,
            "+repage",
            "-filter",
            "Lanczos",
            "-resize",
            "800%",
            "-resize",
            PANEL + "^",
            "-gravity",
            "center",
            "-extent",
            PANEL,
            str(out),
        ]
    )
    return out


def enlarged_isolated(state, variant, out):
    spec = STATES[state][0]
    src = (
        STATES[state][1]
        if variant == "ORIGINAL"
        else ELEMENTS / f"{state}-{variant}.png"
    )
    run(
        [
            "convert",
            "-depth",
            "8",
            "-size",
            "848x1264",
            "pattern:checkerboard",
            str(src),
            "-compose",
            "Over",
            "-composite",
            "-crop",
            spec,
            "+repage",
            "-filter",
            "Point",
            "-resize",
            "800%",
            "-resize",
            PANEL + "^",
            "-gravity",
            "center",
            "-extent",
            PANEL,
            str(out),
        ]
    )
    return out


def heatmap(variant, out):
    full = composite_full(
        ELEMENTS / f"mouth_closed-{variant}.png", TMP / f"full-mouth_closed-{variant}.png"
    )
    run(
        [
            "convert",
            "-depth",
            "8",
            "(",
            str(ORIGINAL),
            "-crop",
            MOUTH_SPEC,
            "+repage",
            ")",
            "(",
            str(full),
            "-crop",
            MOUTH_SPEC,
            "+repage",
            ")",
            "-compose",
            "difference",
            "-composite",
            "-evaluate",
            "Multiply",
            "4",
            "-auto-level",
            "-resize",
            "800%",
            "-resize",
            PANEL + "^",
            "-gravity",
            "center",
            "-extent",
            PANEL,
            str(out),
        ]
    )
    return out


def mouth_metrics(variant):
    spec = MOUTH_SPEC
    full = composite_full(
        ELEMENTS / f"mouth_closed-{variant}.png", TMP / f"full-mouth_closed-{variant}.png"
    )
    a = run(["convert", str(ORIGINAL), "-crop", spec, "+repage", "-depth", "8", "rgb:-"])
    b = run(["convert", str(full), "-crop", spec, "+repage", "-depth", "8", "rgb:-"])
    w, h = 62, 46
    cx, cy, rx, ry = 422 - 391, 199 - 176, 26, 17
    tot = inside = n = n_inside = maxd = 0
    changed = 0
    for y in range(h):
        for x in range(w):
            i = (y * w + x) * 3
            d = sum(abs(a[i + k] - b[i + k]) for k in range(3)) / 3
            tot += d
            n += 1
            maxd = max(maxd, max(abs(a[i + k] - b[i + k]) for k in range(3)))
            r = math.sqrt(((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2)
            if r <= 1.0:
                inside += d
                n_inside += 1
                if d > 20:
                    changed += 1
    return {
        "variant": variant,
        "meanAbsRgbDiffWholeCrop": round(tot / n, 2),
        "meanAbsRgbDiffInsideZone": round(inside / n_inside, 2),
        "maxChannelDiff": int(maxd),
        "pixelsChangedMoreThan20Pct": round(100 * changed / n_inside, 1),
        "zoneSamples": n_inside,
    }


def text_panel(lines, out):
    txt = "\n".join(lines)
    run(
        [
            "convert",
            "-depth",
            "8",
            "-size",
            PANEL,
            "xc:#241d33",
            "-font",
            FONT,
            "-pointsize",
            "17",
            "-fill",
            "#d8cbe8",
            "-gravity",
            "center",
            "-annotate",
            "+0+0",
            txt,
            str(out),
        ]
    )
    return out


def montage(panels, out, tile, size=PANEL):
    args = [
        "montage",
        "-font",
        FONT,
        "-pointsize",
        "15",
        "-fill",
        "white",
        "-background",
        "#171226",
    ]
    for label, path in panels:
        args += ["-label", label, str(path)]
    args += ["-tile", tile, "-geometry", size + "+8+8", str(out)]
    run(args)


def main():
    # 1. final contact sheet: original face next to A and B on the face
    contact = []
    for state in STATES:
        contact += [
            (f"{state} / ORIGINAL FACE", fit(REFS / "face-original.png", TMP / f"{state}-c0.png", size="400x300")),
            (f"{state} / A on face", fit(PREVIEWS / f"{state}-A-on-face.png", TMP / f"{state}-c1.png", size="400x300")),
            (f"{state} / B on face", fit(PREVIEWS / f"{state}-B-on-face.png", TMP / f"{state}-c2.png", size="400x300")),
        ]
    montage(contact, PREVIEWS / "E2-FINAL-CONTACT.png", "3x5", size="400x300")

    # 2. enlarged: every state, original / A / B, on the face
    big = []
    for state in STATES:
        for variant in ("ORIGINAL", "A", "B"):
            p = enlarged_on_face(state, variant, TMP / f"big-{state}-{variant}.png")
            big.append((f"{state} / {variant} x8", p))
    montage(big, PREVIEWS / "E2-ENLARGED-ON-FACE.png", "3x5")

    smooth = []
    for state in STATES:
        for variant in ("ORIGINAL", "A", "B"):
            p = enlarged_smooth(state, variant, TMP / f"sm-{state}-{variant}.png")
            smooth.append((f"{state} / {variant} x8 smooth", p))
    montage(smooth, PREVIEWS / "E2-ENLARGED-SMOOTH.png", "3x5")

    # 3. enlarged isolated elements on a checkerboard
    iso = []
    for state in STATES:
        for variant in ("ORIGINAL", "A", "B"):
            p = enlarged_isolated(state, variant, TMP / f"iso-{state}-{variant}.png")
            iso.append((f"{state} / {variant} isolated x8", p))
    montage(iso, PREVIEWS / "E2-ENLARGED-ELEMENTS.png", "3x5")

    # 4. mouth_closed vs the original mouth_neutral
    mA, mB = mouth_metrics("A"), mouth_metrics("B")
    rows = [
        ("ORIGINAL mouth_neutral x8", enlarged_on_face("mouth_closed", "ORIGINAL", TMP / "m-o.png")),
        ("mouth_closed / A x8", enlarged_on_face("mouth_closed", "A", TMP / "m-a.png")),
        ("mouth_closed / B x8", enlarged_on_face("mouth_closed", "B", TMP / "m-b.png")),
        ("E1 z16 layer x8", enlarged_isolated("mouth_closed", "ORIGINAL", TMP / "m-e0.png")),
        ("A isolated x8", enlarged_isolated("mouth_closed", "A", TMP / "m-ea.png")),
        ("B isolated x8", enlarged_isolated("mouth_closed", "B", TMP / "m-eb.png")),
        ("difference A x4", heatmap("A", TMP / "m-da.png")),
        ("difference B x4", heatmap("B", TMP / "m-db.png")),
        (
            "measured difference",
            text_panel(
                [
                    "A: mean diff in zone  " + str(mA["meanAbsRgbDiffInsideZone"]),
                    "A: pixels >20  " + str(mA["pixelsChangedMoreThan20Pct"]) + "%",
                    "B: mean diff in zone  " + str(mB["meanAbsRgbDiffInsideZone"]),
                    "B: pixels >20  " + str(mB["pixelsChangedMoreThan20Pct"]) + "%",
                    "",
                    "lower = closer to the",
                    "original mouth_neutral",
                ],
                TMP / "m-info.png",
            ),
        ),
    ]
    montage(rows, PREVIEWS / "E2-mouth-closed-vs-neutral.png", "3x3")

    align = json.loads((ROOT / "E2-alignment.json").read_text(encoding="utf-8"))
    check = json.loads((ROOT / "E2-alignment-check.json").read_text(encoding="utf-8"))
    cm = {(r["state"], r["variant"]): r for r in check["rows"]}
    per = []
    for e in align["elements"]:
        c = cm[(e["state"], e["variant"])]
        per.append(
            {
                "state": e["state"],
                "variant": e["variant"],
                "featureCentroidShiftPx": c["featureCentroidShiftPx"],
                "seamMeanAbsRgbDiff": c["seamMeanAbsRgbDiff"],
                "registrationAnnulusMSE": e["registrationAnnulusMSE"],
                "registrationShiftPx": e["registrationShiftPx"],
                "darkInkPixelsOriginal": c["darkInkPixelsOriginal"],
                "darkInkPixelsElement": c["darkInkPixelsElement"],
                "opaquePixels": e["opaquePixels"],
                "pixelsOutsideZoneEllipse": c["pixelsOutsideZoneEllipse"],
                "cornersTransparent": c["cornersTransparent"],
            }
        )
    (ROOT / "E2-final-metrics.json").write_text(
        json.dumps(
            {
                "stage": "E2-facial-states / final review metrics",
                "status": "measurement only - candidates NOT approved",
                "perCandidate": per,
                "mouthClosedVsNeutral": [mA, mB],
                "method": (
                    "mouthClosedVsNeutral compares the untouched original frame with the "
                    "same frame after overlaying the candidate element, inside the z16 zone ellipse"
                ),
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print("sheets: FINAL-CONTACT, ENLARGED-ON-FACE, ENLARGED-ELEMENTS, mouth-closed-vs-neutral")
    print("mouth_closed A:", mA)
    print("mouth_closed B:", mB)


if __name__ == "__main__":
    main()
