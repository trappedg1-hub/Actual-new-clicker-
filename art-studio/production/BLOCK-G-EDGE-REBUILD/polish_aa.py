#!/usr/bin/env python3
"""BLOCK J5: outer-edge anti-aliasing pass over the BLOCK G rebuilds.

The BLOCK G files fixed haze and matte fringe but left the silhouette
alpha as a hard 0->255 staircase, which DPR3 upscaling shows as jagged
"badly scissored" hair edges.  This pass:

  * gaussian-feathers ONLY a 2px band around the outer silhouette
    boundary (deep interior stays byte-identical, so the runtime
    interior-hole repair keeps its exact topology);
  * kills isolated alpha specks (<=8 px) floating away from the mass —
    the white dust chains along the hair strands;
  * never touches RGB.

Input:  BLOCK G outputs (layers/<name>.png)
Output: layers/<stem>-aa.png — referenced by heroineAssets for the
natural pose only; `?pose=classic` never loads these files.
"""
from __future__ import annotations

import os
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
LAYERS = os.path.join(HERE, "layers")

FILES = [
    "natural-hair-back.png",
    "natural-blouse.png",
    "natural-arm-l.png",
    "natural-arm-r.png",
    "03_leg_l.png",
    "04_leg_r.png",
    "05_torso.png",
    "09_outfit_collar.png",
    "10_outfit_ribbon.png",
    "11_outfit_skirt_01.png",
    "12_outfit_skirt_02.png",
]


def polish(name: str) -> str:
    src = os.path.join(LAYERS, name)
    dst = os.path.join(LAYERS, name.replace(".png", "-aa.png"))
    img = np.array(Image.open(src).convert("RGBA")).astype(np.float64)
    alpha = img[..., 3]

    solid = alpha >= 200
    if solid.sum() == 0:
        Image.fromarray(img.astype(np.uint8)).save(dst)
        return "copied"

    structure = ndimage.generate_binary_structure(2, 2)
    mass = ndimage.binary_closing(solid, structure=structure, iterations=2)
    mass = ndimage.binary_fill_holes(mass)
    out_dist = ndimage.distance_transform_edt(~mass)
    in_dist = ndimage.distance_transform_edt(mass)

    # 1. Isolated specks: small alpha islands floating off the mass.
    nz = alpha > 10
    lbl, n = ndimage.label(nz, structure=structure)
    if n > 1:
        sizes = ndimage.sum_labels(np.ones_like(lbl), lbl, range(1, n + 1))
        dmin = ndimage.minimum(out_dist, lbl, range(1, n + 1))
        speck = 0
        for i in range(1, n + 1):
            if sizes[i - 1] <= 8 and dmin[i - 1] > 1.5:
                alpha[lbl == i] = 0
                speck += int(sizes[i - 1])
    else:
        speck = 0

    # 2. Outer-band feather: 2px inside + 2px outside the boundary mix
    #    toward a gaussian blur; everything deeper stays byte-identical.
    blurred = ndimage.gaussian_filter(alpha, sigma=0.85)
    band = (out_dist <= 2.0) & (in_dist <= 2.0) | (out_dist > 0) & (
        out_dist <= 2.0
    ) | (in_dist > 0) & (in_dist <= 2.0)
    new_alpha = np.where(band, blurred, alpha)
    # Feather may only SOFTEN existing edges, never spread alpha onto
    # far pixels: anything beyond 2px outside the mass stays empty.
    new_alpha = np.where(out_dist > 2.0, np.minimum(new_alpha, alpha), new_alpha)

    changed = int((np.abs(new_alpha - alpha) > 1).sum())
    img[..., 3] = np.clip(new_alpha, 0, 255)
    Image.fromarray(img.astype(np.uint8)).save(dst)
    return f"specks={speck} feathered px={changed}"


if __name__ == "__main__":
    for name in FILES:
        print(name, "->", polish(name))
    print("done ->", LAYERS)
