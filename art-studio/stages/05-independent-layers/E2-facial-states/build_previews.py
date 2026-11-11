#!/usr/bin/env python3
"""Build the comparison sheets for the E2 facial-state candidates.

Every generated variant is shown next to the untouched original, before any
integration. This script only rearranges existing files; it creates no art.
"""

import sys

sys.dont_write_bytecode = True

import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[3]
CANDS = ROOT / "candidates"
ELEMENTS = ROOT / "elements"
PREVIEWS = ROOT / "previews"
REFS = ROOT / "references"
TMP = ROOT / ".panels"
TMP.mkdir(exist_ok=True)

# state -> (80x60 context crop origin, original zoom panel)
STATES = {
    "eye_l_closed": ((357, 132), REFS / "eye_l_open-zoom.png"),
    "eye_r_closed": ((417, 132), REFS / "eye_r_open-zoom.png"),
    "mouth_closed": ((382, 172), REFS / "mouth_neutral-zoom.png"),
    "mouth_open": ((382, 172), REFS / "mouth_neutral-zoom.png"),
    "mouth_smile": ((382, 172), REFS / "mouth_neutral-zoom.png"),
}
FONT = "DejaVu-Sans"


def run(args):
    proc = subprocess.run(args, capture_output=True)
    if proc.returncode != 0:
        raise RuntimeError(
            " ".join(str(a) for a in args) + "\n" + proc.stderr.decode("utf-8", "replace")
        )


def panel(src, out, crop=None):
    args = ["convert", "-depth", "8", str(src)]
    if crop:
        args += ["-crop", crop, "+repage"]
    args += ["-resize", "400x300^", "-gravity", "center", "-extent", "400x300", str(out)]
    run(args)
    return out


def isolated_panel(state, variant, out):
    ox, oy = STATES[state][0]
    elem = ELEMENTS / f"{state}-{variant}.png"
    run(
        [
            "convert",
            "-depth",
            "8",
            "-size",
            "400x300",
            "pattern:checkerboard",
            "(",
            str(elem),
            "-crop",
            f"80x60+{ox}+{oy}",
            "+repage",
            "-resize",
            "500%",
            ")",
            "-compose",
            "Over",
            "-composite",
            str(out),
        ]
    )
    return out


def blank_panel(text, out):
    run(
        [
            "convert",
            "-depth",
            "8",
            "-size",
            "400x300",
            "xc:#241d33",
            "-font",
            FONT,
            "-pointsize",
            "18",
            "-fill",
            "#a99bbd",
            "-gravity",
            "center",
            "-annotate",
            "+0+0",
            text,
            str(out),
        ]
    )
    return out


def montage(panels, out, tile):
    args = ["montage", "-font", FONT, "-pointsize", "15", "-fill", "white",
            "-background", "#171226"]
    for label, path in panels:
        args += ["-label", label, str(path)]
    args += ["-tile", tile, "-geometry", "400x300+8+8", str(out)]
    run(args)


def main():
    overview = []
    for state, (origin, zoom) in STATES.items():
        orig = panel(zoom, TMP / f"{state}-orig.png")
        per_state = [("ORIGINAL / оригинал", orig)]

        for variant in ("A", "B"):
            cand = CANDS / f"{state}-{variant}.png"
            if not cand.exists():
                per_state.append((f"{variant}: not generated this turn", blank_panel(
                    f"{variant} — in the next turn", TMP / f"{state}-{variant}-blank.png")))
                continue
            per_state.append(
                (f"{variant}: AI patch / AI-патч", panel(cand, TMP / f"{state}-{variant}-ai.png"))
            )
            per_state.append(
                (
                    f"{variant}: RGBA element / элемент",
                    isolated_panel(state, variant, TMP / f"{state}-{variant}-iso.png"),
                )
            )
            per_state.append(
                (
                    f"{variant}: on original face / на лице",
                    panel(PREVIEWS / f"{state}-{variant}-on-face.png", TMP / f"{state}-{variant}-face.png"),
                )
            )

        montage(per_state, PREVIEWS / f"E2-compare-{state}.png", "4x2")

        overview.append((state, orig))
        a_face = panel(
            PREVIEWS / f"{state}-A-on-face.png", TMP / f"{state}-A-overview.png"
        )
        overview[-1] = (state, orig, a_face)
        b_cand = CANDS / f"{state}-B.png"
        if b_cand.exists():
            b_face = panel(
                PREVIEWS / f"{state}-B-on-face.png", TMP / f"{state}-B-overview.png"
            )
        else:
            b_face = blank_panel(
                "B: next turn", TMP / f"{state}-B-overview.png"
            )
        overview[-1] = (state, orig, a_face, b_face)

    flat = []
    for state, orig, a_face, b_face in overview:
        flat += [
            (f"{state} / ORIGINAL", orig),
            (f"{state} / A on face", a_face),
            (f"{state} / B on face", b_face),
        ]
    montage(flat, PREVIEWS / "E2-overview.png", "3x5")
    print("sheets written:", len(list(PREVIEWS.glob("E2-*.png"))))


if __name__ == "__main__":
    main()
