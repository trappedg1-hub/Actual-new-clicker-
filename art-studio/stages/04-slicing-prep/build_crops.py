#!/usr/bin/env python3
"""
Stage 04 / technical crop map for HEROINE-01.

Reads the already-built alpha cutout of IMG_4038_rig-pose.webp and emits
20 geometric crop windows (one per graphic slot from ANIMATION-SPEC.md §4)
plus a machine-readable crop-map.json.

IMPORTANT: these are CROP WINDOWS, not finished independent layers.
The source is a single composited frame; overlapping parts are still baked
together. Occlusion repair / hidden-zone repaint is NOT performed here
(no-generation / no-original-art-change gates).

No AI generation. No modification of the approved originals. No atlas.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
STAGE = ROOT / "art-studio" / "stages" / "04-slicing-prep"
CUTOUT = STAGE / "cutouts" / "work-cutout.png"
SLOTS_DIR = STAGE / "cutouts" / "slots"
W, H = 848, 1264

# z, slot, group, rect, polygons (absolute canvas coords), pivot, states, present
# rect = (x0, y0, x1, y1) inclusive-exclusive. Polygons empty -> full rect.
# Coordinates are derived from the measured alpha profile of IMG_4038
# (see SLICE-MAP.md §2); they are a preliminary technical registration.
SLOTS = [
    (1, "hair_back_01", "backHairGroup", (130, 380, 720, 745),
     [[(140, 400), (320, 420), (305, 705), (165, 690)],
      [(528, 420), (708, 400), (683, 690), (543, 705)]],
     (424, 250), ["hair_back_01"], True),
    (2, "hair_back_02", "backHairGroup", (130, 175, 720, 475),
     [[(160, 300), (315, 205), (330, 430), (200, 455)],
      [(533, 205), (688, 300), (648, 455), (518, 430)]],
     (424, 245), ["hair_back_02"], True),
    (3, "leg_l", "legGroup", (185, 665, 405, 1256),
     [[(282, 665), (392, 665), (355, 980), (300, 1180), (190, 1250), (205, 1195), (250, 900)]],
     (370, 675), ["leg_l"], True),
    (4, "leg_r", "legGroup", (443, 665, 663, 1256),
     [[(456, 665), (566, 665), (598, 900), (643, 1195), (658, 1250), (548, 1180), (493, 980)]],
     (478, 675), ["leg_r"], True),
    (5, "torso", "bodyRoot", (275, 285, 575, 500), [],
     (424, 490), ["torso"], True),
    (6, "arm_l", "armGroup_l", (100, 325, 335, 665),
     [[(272, 330), (325, 365), (255, 505), (152, 605), (102, 645), (110, 600), (200, 440)]],
     (300, 335), ["arm_l"], True),
    (7, "arm_r", "armGroup_r", (513, 325, 748, 665),
     [[(576, 330), (523, 365), (593, 505), (696, 605), (746, 645), (738, 600), (648, 440)]],
     (548, 335), ["arm_r"], True),
    (8, "outfit_blouse", "outfitGroup", (275, 285, 575, 495), [],
     (424, 490), ["outfit_blouse"], True),
    (9, "outfit_collar", "outfitGroup", (318, 240, 532, 392), [],
     (424, 300), ["outfit_collar"], True),
    (10, "outfit_ribbon", "outfitGroup", (388, 315, 462, 478), [],
     (424, 340), ["outfit_ribbon"], True),
    (11, "outfit_skirt_01", "outfitGroup", (268, 472, 582, 592), [],
     (424, 478), ["outfit_skirt_01"], True),
    (12, "outfit_skirt_02", "outfitGroup", (268, 562, 582, 690), [],
     (424, 570), ["outfit_skirt_02"], True),
    (13, "head", "headGroup", (322, 95, 528, 272), [],
     (424, 262), ["head"], True),
    # Лицевые координаты измерены по 3x-зуму региона (315,90)-(535,300):
    # центры глаз ~(397,162)/(457,162), рот ~(422,200).
    (14, "eye_l_open", "faceGroup", (372, 143, 422, 182), [],
     (397, 162), ["eye_l_open", "eye_l_closed"], True),
    (15, "eye_r_open", "faceGroup", (432, 143, 480, 182), [],
     (457, 162), ["eye_r_open", "eye_r_closed"], True),
    (16, "mouth_neutral", "faceGroup", (402, 186, 442, 216), [],
     (422, 200), ["mouth_neutral", "mouth_open", "mouth_smile"], True),
    (17, "hair_side_l", "frontHairGroup", (316, 88, 398, 302), [],
     (370, 120), ["hair_side_l"], True),
    (18, "hair_side_r", "frontHairGroup", (450, 88, 532, 302), [],
     (478, 120), ["hair_side_r"], True),
    (19, "hair_front_01", "frontHairGroup", (332, 38, 448, 178), [],
     (424, 115), ["hair_front_01"], True),
    (20, "hair_front_02", "frontHairGroup", (398, 38, 518, 202), [],
     (424, 115), ["hair_front_02"], True),
]

# States that physically do not exist in the single supplied frame.
MISSING_STATES = [
    ("eye_l_closed", 14, "blink"),
    ("eye_r_closed", 15, "blink"),
    ("mouth_open", 16, "expression"),
    ("mouth_smile", 16, "expression"),
]


def in_poly(x: float, y: float, poly: list[tuple[int, int]]) -> bool:
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            inside = not inside
        j = i
    return inside


def main() -> None:
    SLOTS_DIR.mkdir(parents=True, exist_ok=True)
    src = subprocess.check_output(
        ["convert", str(CUTOUT), "-depth", "8", "rgba:-"]
    )
    assert len(src) == W * H * 4, f"unexpected RGBA size {len(src)}"
    # Альфа берётся из сохранённого в репозитории cutout — скрипт полностью
    # воспроизводим без временных файлов /tmp.
    alpha = src[3::4]

    entries = []
    total_px = 0
    for z, slot, group, rect, polys, pivot, states, present in SLOTS:
        x0, y0, x1, y1 = rect
        cw, ch = x1 - x0, y1 - y0
        buf = bytearray(cw * ch * 4)
        kept = 0
        for y in range(y0, y1):
            for x in range(x0, x1):
                ai = y * W + x
                if alpha[ai] < 128:
                    continue
                if polys and not any(in_poly(x + 0.5, y + 0.5, p) for p in polys):
                    continue
                s = ai * 4
                d = ((y - y0) * cw + (x - x0)) * 4
                buf[d:d + 4] = src[s:s + 4]
                kept += 1
        out = SLOTS_DIR / f"{z:02d}_{slot}.png"
        subprocess.run(
            ["convert", "-size", f"{cw}x{ch}", "-depth", "8", "rgba:-", str(out)],
            input=bytes(buf), check=True,
        )
        total_px += kept
        entries.append({
            "z": z,
            "slot": slot,
            "group": group,
            "file": f"cutouts/slots/{z:02d}_{slot}.png",
            "rect": {"x": x0, "y": y0, "w": cw, "h": ch},
            "pivotAbsolute": {"x": pivot[0], "y": pivot[1]},
            "pivotLocal": {"x": pivot[0] - x0, "y": pivot[1] - y0},
            "states": states,
            "statesPresent": [s for s in states if s not in {m[0] for m in MISSING_STATES}],
            "statesMissing": [s for s in states if s in {m[0] for m in MISSING_STATES}],
            "opaquePixels": kept,
            "type": "geometric crop window (NOT an independent layer)",
            "occlusionRepairRequired": True,
        })

    doc = {
        "stage": "04-slicing-prep / technical crop map",
        "source": "art-studio/references/originals/IMG_4038_rig-pose.webp",
        "sourceSizePx": [W, H],
        "renderCanon": [
            "art-studio/references/originals/IMG_4036_style-reference.webp",
            "art-studio/references/originals/IMG_4037_campus-outfit.webp",
        ],
        "spec": "art-studio/ANIMATION-SPEC.md §4",
        "graphicSlots": len(SLOTS),
        "visualStatesTotal": 24,
        "visualStatesPresent": 20,
        "visualStatesMissing": 4,
        "missingStates": [
            {"state": s, "slotZ": z, "system": sys_, "reason":
             "not present in the single supplied frame; requires a separate art pass, "
             "blocked by the no-generation gate"}
            for s, z, sys_ in MISSING_STATES
        ],
        "glow": "z 0 is generated in code, not art — no crop",
        "limitations": [
            "Crops are geometric windows over a single composited frame; overlapping "
            "parts remain baked together.",
            "Hidden/occluded zones are NOT repainted. Independent layers require a "
            "separate art pass with explicit permission.",
            "No atlas assembled, no code changed, no original reference modified, "
            "no AI generation performed.",
            "Coordinates are a preliminary technical registration derived from the "
            "alpha profile; final pivots to be confirmed during integration.",
        ],
        "slots": entries,
    }
    (STAGE / "crop-map.json").write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(f"slots written: {len(entries)} | total opaque px: {total_px}")
    print(f"present states: {doc['visualStatesPresent']} / missing: {doc['visualStatesMissing']}")


if __name__ == "__main__":
    main()
