#!/usr/bin/env python3
"""Numerical alignment / seam check for the E2 facial-state candidates.

Read-only analysis of files produced by build_elements.py. It compares each
isolated RGBA element with the untouched original face inside the slot zone:
  * dark-ink centroid shift (is the lid/lip line where the original feature was?);
  * seam error (mean RGB difference in the ring just inside the zone boundary);
  * transparency and footprint sanity checks.
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
ELEMENTS = ROOT / "elements"
ALIGN = json.loads((ROOT / "E2-alignment.json").read_text(encoding="utf-8"))


def raw(args):
    return subprocess.check_output(["convert", "-depth", "8"] + args)


def lum(p):
    return 0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2]


def check(entry):
    state, variant = entry["state"], entry["variant"]
    ox, oy = entry["contextCropOrigin"]
    cx, cy, rx, ry = entry["zoneEllipse"]
    elem = ROOT / entry["element"]
    tag = f"{state}-{variant}"

    er = raw([str(elem), "-crop", f"80x60+{ox}+{oy}", "+repage", "rgba:-"])
    orr = raw([str(ORIGINAL), "-crop", f"80x60+{ox}+{oy}", "+repage", "rgb:-"])

    def epix(x, y):
        i = (y * 80 + x) * 4
        return tuple(er[i : i + 3]), er[i + 3]

    def opix(x, y):
        i = (y * 80 + x) * 3
        return tuple(orr[i : i + 3])

    ox0, oy0 = 0, 0
    esx = esy = en = 0
    osx = osy = on = 0
    seam_sum = seam_n = 0
    opaque_total = 0
    outside = 0
    lcx, lcy = cx - ox, cy - oy

    for y in range(60):
        for x in range(80):
            r = math.sqrt(((x - lcx) / rx) ** 2 + ((y - lcy) / ry) ** 2)
            p, a = epix(x, y)
            q = opix(x, y)
            if a >= 128:
                opaque_total += 1
                if r > 1.02:
                    outside += 1
            if r > 1.0:
                continue
            if a >= 128 and lum(p) < 120:
                esx += x
                esy += y
                en += 1
            if lum(q) < 120:
                osx += x
                osy += y
                on += 1
            if 0.82 <= r <= 0.98 and a >= 128:
                seam_sum += sum(abs(p[i] - q[i]) for i in range(3)) / 3
                seam_n += 1

    ecent = (esx / en, esy / en) if en else None
    ocent = (osx / on, osy / on) if on else None
    shift = (
        [round(ecent[0] - ocent[0], 2), round(ecent[1] - ocent[1], 2)]
        if ecent and ocent
        else None
    )
    corners = [epix(x, y)[1] for x, y in ((0, 0), (79, 0), (0, 59), (79, 59))]
    return {
        "state": state,
        "variant": variant,
        "opaquePixels": opaque_total,
        "pixelsOutsideZoneEllipse": outside,
        "cornersTransparent": all(a < 8 for a in corners),
        "darkInkPixelsOriginal": on,
        "darkInkPixelsElement": en,
        "darkInkCentroidOriginal": [round(v, 2) for v in ocent] if ocent else None,
        "darkInkCentroidElement": [round(v, 2) for v in ecent] if ecent else None,
        "featureCentroidShiftPx": shift,
        "seamMeanAbsRgbDiff": round(seam_sum / seam_n, 2) if seam_n else None,
        "seamSamples": seam_n,
        "candidate": entry["candidate"],
    }


def main():
    rows = [check(e) for e in ALIGN["elements"]]
    (ROOT / "E2-alignment-check.json").write_text(
        json.dumps(
            {
                "stage": "E2-facial-states / alignment check",
                "status": "measurement only - candidates NOT approved",
                "method": (
                    "dark-ink centroid inside the zone ellipse plus mean RGB difference "
                    "in the ring at 0.82-0.98 of the ellipse radius"
                ),
                "rows": rows,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    for r in rows:
        print(
            f"{r['state']:14s} {r['variant']}  shift={str(r['featureCentroidShiftPx']):16s} "
            f"seam={r['seamMeanAbsRgbDiff']:6.2f}  outside={r['pixelsOutsideZoneEllipse']} "
            f"corners_ok={r['cornersTransparent']}"
        )


if __name__ == "__main__":
    main()
