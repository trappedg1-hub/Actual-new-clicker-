#!/usr/bin/env python3
"""
E1 diagnostic: how much transparent area opens when layers are moved.

NOT an animation test and NOT a rotation simulation. This is a translation proxy:
each layer is shifted by a small offset and we measure how many silhouette
pixels are no longer covered by ANY layer. It quantifies, honestly, why E2
(occlusion repair / hidden-zone repaint) is required before the rig can move.

No new artistic pixels are created. Reads committed E1 layers only.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
STAGE = ROOT / "art-studio" / "stages" / "05-independent-layers"
CUTOUT = ROOT / "art-studio" / "stages" / "04-slicing-prep" / "cutouts" / "work-cutout.png"
W, H = 848, 1264

# translation proxies for the amplitudes in ANIMATION-SPEC.md §5
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


def rgba(path: Path) -> bytes:
    return subprocess.check_output(["convert", str(path), "-depth", "8", "rgba:-"])


def main() -> None:
    d = json.loads((STAGE / "layer-map.json").read_text())
    cut = rgba(CUTOUT)
    sil = [i for i in range(W*H) if cut[i*4+3] >= 128]

    # Precompute for each layer the list of (pixel index, alpha) it owns.
    layer_px = []
    for s in sorted(d["slots"], key=lambda x: x["z"]):
        b = rgba(STAGE / s["file"])
        layer_px.append((s["z"], s["slot"],
                         [(i, b[i*4+3]) for i in range(W*H) if b[i*4+3] > 0]))

    results = []
    for name, dx, dy in SHIFTS:
        cov = bytearray(W*H)
        for _z, _slot, px in layer_px:
            for i, a in px:
                y, x = divmod(i, W)
                nx, ny = x + dx, y + dy
                if 0 <= nx < W and 0 <= ny < H:
                    j = ny*W + nx
                    if a > cov[j]:
                        cov[j] = a
        gaps = sum(1 for i in sil if cov[i] == 0)
        results.append({
            "shift": name, "dx": dx, "dy": dy,
            "gapPixels": gaps,
            "gapRatio": round(gaps / len(sil), 6),
        })
        print(f"{name:28s} dx={dx:+3d} dy={dy:+3d}  gaps={gaps:7d}  ({gaps/len(sil):.4f})")

    # Visualisation of the worst non-rest shift: gaps in red over the composite.
    worst = max(results[1:], key=lambda r: r["gapPixels"])
    dx, dy = worst["dx"], worst["dy"]
    cov = bytearray(W*H)
    for _z, _slot, px in layer_px:
        for i, a in px:
            y, x = divmod(i, W)
            nx, ny = x + dx, y + dy
            if 0 <= nx < W and 0 <= ny < H:
                j = ny*W + nx
                if a > cov[j]:
                    cov[j] = a
    base = bytearray(rgba(CUTOUT))
    for i in sil:
        if cov[i] == 0:
            j = i*4
            base[j:j+4] = bytes((255, 40, 40, 255))
    out = STAGE / "preview" / "E1-motion-gaps.png"
    out.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(["convert", "-size", f"{W}x{H}", "-depth", "8",
                    "rgba:-", str(out)], input=bytes(base), check=True)

    doc = {
        "purpose": "quantify hidden-zone gaps that E2 must repair",
        "method": "translation proxy (NOT rotation, NOT a real animation frame)",
        "amplitudeSource": "art-studio/ANIMATION-SPEC.md §5",
        "silhouettePixels": len(sil),
        "results": results,
        "worstShift": worst["shift"],
        "worstGapPixels": worst["gapPixels"],
        "visualisation": "preview/E1-motion-gaps.png (red = uncovered after shift)",
        "conclusion": "Any motion opens transparent gaps because hidden zones "
                      "were deliberately NOT repainted in E1. E2 requires separate "
                      "permission and an art pass.",
    }
    (STAGE / "e1-motion-gaps.json").write_text(
        json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print("worst:", worst["shift"], worst["gapPixels"])


if __name__ == "__main__":
    main()
