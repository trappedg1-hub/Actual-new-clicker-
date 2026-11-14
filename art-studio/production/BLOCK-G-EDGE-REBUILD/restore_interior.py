#!/usr/bin/env python3
"""BLOCK J6: interior restore for the -aa layer set.

The J5 -aa pass feathered and de-crusted EVERY layer boundary.  On the
outer silhouette that is exactly right, but on INTERIOR boundaries
(where one slot layer hands over to the layer below it) the same
treatment punched thin translucent seams: the stack no longer summed to
the opaque master, so the wall showed through as hairline cracks,
bracket marks and the vertical crown line.

Fix: the union of all ORIGINAL layers defines the one true outer
silhouette.  Within +-EDGE_BAND px of that boundary (and everywhere
outside it) the -aa treatment stays; every deeper interior pixel is
restored byte-identical from its original source, so the assembled
stack matches the approved master again.

Run AFTER polish_aa.py (and after any manual -aa retouch).
"""
from __future__ import annotations

import os

import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
LAYERS = os.path.join(HERE, "layers")
BUILD = os.path.join(
    HERE,
    "..",
    "BLOCK-1-FINISH-CHARACTER-ASSETS",
    "BUILD-v01",
    "layers",
)
UNDERLAY = os.path.join(
    HERE,
    "..",
    "BLOCK-1-FINISH-CHARACTER-ASSETS",
    "BUILD-v01",
    "underlays",
    "UNDERLAY-UNION.png",
)

EDGE_BAND = 3.0

# (-aa file in layers/, original source path) for every natural-pose layer.
PAIRS: list[tuple[str, str]] = [
    ("natural-hair-back-aa.png", os.path.join(LAYERS, "natural-hair-back.png")),
    ("natural-blouse-aa.png", os.path.join(LAYERS, "natural-blouse.png")),
    ("natural-arm-l-aa.png", os.path.join(LAYERS, "natural-arm-l.png")),
    ("natural-arm-r-aa.png", os.path.join(LAYERS, "natural-arm-r.png")),
    ("03_leg_l-aa.png", os.path.join(LAYERS, "03_leg_l.png")),
    ("04_leg_r-aa.png", os.path.join(LAYERS, "04_leg_r.png")),
    ("05_torso-aa.png", os.path.join(LAYERS, "05_torso.png")),
    ("09_outfit_collar-aa.png", os.path.join(LAYERS, "09_outfit_collar.png")),
    ("10_outfit_ribbon-aa.png", os.path.join(LAYERS, "10_outfit_ribbon.png")),
    ("11_outfit_skirt_01-aa.png", os.path.join(LAYERS, "11_outfit_skirt_01.png")),
    ("12_outfit_skirt_02-aa.png", os.path.join(LAYERS, "12_outfit_skirt_02.png")),
    ("17_hair_side_l-aa.png", os.path.join(BUILD, "17_hair_side_l.png")),
    ("18_hair_side_r-aa.png", os.path.join(BUILD, "18_hair_side_r.png")),
    ("19_hair_front_01-aa.png", os.path.join(BUILD, "19_hair_front_01.png")),
    ("20_hair_front_02-aa.png", os.path.join(BUILD, "20_hair_front_02.png")),
]

# Additional original layers that complete the global silhouette union.
EXTRA_UNION = [
    os.path.join(BUILD, f)
    for f in (
        "13_head.png",
        "14_eye_l_open.png",
        "15_eye_r_open.png",
        "16_mouth_neutral.png",
    )
] + [UNDERLAY]


def load_alpha(path: str) -> np.ndarray:
    return np.array(Image.open(path).convert("RGBA"))[..., 3]


def main() -> None:
    union = np.zeros((1264, 848), dtype=np.uint8)
    for _, src in PAIRS:
        union = np.maximum(union, load_alpha(src))
    for src in EXTRA_UNION:
        union = np.maximum(union, load_alpha(src))

    mass = union >= 128
    structure = ndimage.generate_binary_structure(2, 2)
    mass = ndimage.binary_fill_holes(
        ndimage.binary_closing(mass, structure=structure, iterations=2)
    )
    in_dist = ndimage.distance_transform_edt(mass)

    # -aa survives outside the figure and in a thin band just inside the
    # border; the deep interior reverts to the original bytes.  NB:
    # distance_transform_edt is zero OUTSIDE the mass, so the band test
    # must be guarded by the mass itself.
    keep_aa = (~mass) | (mass & (in_dist <= EDGE_BAND))

    for aa_name, src in PAIRS:
        aa_path = os.path.join(LAYERS, aa_name)
        aa = np.array(Image.open(aa_path).convert("RGBA"))
        orig = np.array(Image.open(src).convert("RGBA"))
        restored = np.where(keep_aa[..., None], aa, orig)
        changed = int((restored != aa).any(axis=-1).sum())
        Image.fromarray(restored.astype(np.uint8)).save(aa_path)
        print(f"{aa_name}: interior restored on {changed} px")


if __name__ == "__main__":
    main()
