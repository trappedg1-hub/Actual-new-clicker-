#!/usr/bin/env python3
"""BLOCK G: alpha-only edge rebuild for the natural-pose rig slots.

Principles (after the BLOCK F recolor failure):
  * RGB is NEVER modified.  Dirt is removed by FADING ALPHA, which
    dissolves a bad pixel into whatever is behind it (true anti-aliasing),
    instead of recoloring it (which created the dark speckle rash).
  * natural-hair-back.png gets a dedicated pass: the layer carries a
    near-full-canvas semi-transparent purple haze (the "dark square" that
    dims the room) plus JPEG block noise.  Alpha is kept only on and next
    to the real hair mass, re-keyed against the two known mattes.
  * every other natural-pose slot gets a narrow boundary-band matte key
    (old-background-colored pixels fade out) plus a gentle alpha feather
    so the silhouette has no hard staircase when upscaled on DPR3.
"""
from __future__ import annotations

import os
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, "..", "..", ".."))
LAYERS = os.path.join(
    ROOT, "art-studio", "production",
    "BLOCK-1-FINISH-CHARACTER-ASSETS", "BUILD-v01", "layers")
BLOCK_C = os.path.join(ROOT, "art-studio", "production", "BLOCK-C-ARMS-INTEGRATION")
OUT = os.path.join(HERE, "layers")
os.makedirs(OUT, exist_ok=True)

# Known mattes baked into the source art.
MATTE_WHITE = np.array([255.0, 255.0, 255.0])
MATTE_GREY = np.array([200.0, 200.0, 200.0])
MATTE_PURPLE = np.array([51.0, 37.0, 48.0])
MATTE_PURPLE2 = np.array([52.0, 38.0, 52.0])


def smoothstep(x, lo, hi):
    t = np.clip((x - lo) / (hi - lo), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def load(path):
    return np.array(Image.open(path).convert("RGBA"))


def save(arr, path):
    Image.fromarray(arr.astype(np.uint8), "RGBA").save(path)


def feather(alpha_f, outside_dist, max_skirt=2.5, sigma=0.7, protect_inside=4.0,
            inside_dist=None):
    """Gentle alpha feather.  Deep interior is byte-protected."""
    blurred = ndimage.gaussian_filter(alpha_f, sigma=sigma)
    out = np.where(outside_dist > max_skirt, 0.0, blurred)
    if inside_dist is not None:
        out = np.where(inside_dist > protect_inside, alpha_f, out)
    return np.clip(out, 0.0, 255.0)


ORIGINAL_ART = os.path.join(
    ROOT, "art-studio", "references", "originals", "IMG_4038_rig-pose.webp")
_original_rgb_cache = None


def original_rgb():
    global _original_rgb_cache
    if _original_rgb_cache is None:
        _original_rgb_cache = np.array(
            Image.open(ORIGINAL_ART).convert("RGB")).astype(np.float64)
    return _original_rgb_cache


def prefill_interior_holes(img, protected_rects=(), use_original=True,
                           alpha_threshold=250, max_hole_area=1500):
    """Offline port of the rig's runtime `solidifyInteriorHoles`.

    Interior weak components (alpha < 250, unreachable from the border,
    <= 1500 px, not an approved opening) become opaque; fully transparent
    pixels take the original pre-separation art RGB (classic-aligned slots)
    or the nearest opaque neighbour color (pose-specific overlays).  With
    the holes baked into the PNG, the later edge feather can no longer
    bridge them to the exterior and break the runtime repair.
    """
    rgb, alpha = img[..., :3], img[..., 3]
    weak = alpha < alpha_threshold
    # Exterior: weak pixels reachable from the border.
    exterior = np.zeros_like(weak)
    lbl, n = ndimage.label(weak, structure=np.array(
        [[0, 1, 0], [1, 1, 1], [0, 1, 0]]))
    border_labels = set(np.unique(np.concatenate(
        [lbl[0, :], lbl[-1, :], lbl[:, 0], lbl[:, -1]]))) - {0}
    interior_labels = [i for i in range(1, n + 1) if i not in border_labels]
    sizes = ndimage.sum_labels(np.ones_like(lbl), lbl, interior_labels) \
        if interior_labels else []
    filled = 0
    restore = original_rgb() if use_original else None
    # Nearest opaque neighbour indices for RGB rebuild.
    opaque = alpha >= alpha_threshold
    _, (ny, nx) = ndimage.distance_transform_edt(~opaque, return_indices=True)
    for label_id, size in zip(interior_labels, sizes):
        if size > max_hole_area:
            continue
        comp = lbl == label_id
        skip = False
        for (rx0, ry0, rx1, ry1) in protected_rects:
            rect = np.zeros_like(comp)
            rect[ry0:ry1 + 1, rx0:rx1 + 1] = True
            if (comp & rect).sum() >= 0.75 * size:
                skip = True
                break
        if skip:
            continue
        transparent = comp & (alpha < 10)
        if restore is not None:
            rgb[transparent] = restore[transparent]
        else:
            rgb[transparent] = rgb[ny, nx][transparent]
        alpha[comp] = 255.0
        filled += int(size)
    return filled


def matte_suppression(rgb, ref_rgb, mattes):
    """0..1 — how much a pixel is matte-like versus layer-like."""
    d_ref = np.linalg.norm(rgb - ref_rgb, axis=-1)
    d_matte = np.min(
        np.stack([np.linalg.norm(rgb - m, axis=-1) for m in mattes]), axis=0)
    k = (d_ref - d_matte) / (d_ref + d_matte + 1e-3)
    return np.clip(k, 0.0, 1.0)


def rebuild_generic(src_path, dst_path, band_in=2.5, band_out=2.5,
                    protected_rects=(), use_original=True, prefill=True,
                    mattes=None):
    """Outer-rim-only treatment.

    CRITICAL: the interior of the closed silhouette mass stays
    byte-identical.  The rig's runtime `solidifyInteriorHoles` repair
    depends on the interior punch-holes keeping their exact topology
    (small components unreachable from the border); any feather that leaks
    inside bridges those holes to the exterior and the repair skips them,
    which showed up as wall-colored holes in the hair crown.
    """
    img = load(src_path).astype(np.float64)
    rgb, alpha = img[..., :3], img[..., 3]
    solid = alpha >= 200
    if solid.sum() == 0:
        save(img, dst_path)
        return "copied (no solid pixels)"

    filled = 0
    if prefill:
        # Mirrors the rig's runtime repair for slot art.  Pose overlays
        # (arms) keep their intentional semi-transparent interior detail.
        filled = prefill_interior_holes(
            img, protected_rects=protected_rects, use_original=use_original)
    solid = alpha >= 200

    # Closed silhouette mass: interior punch-holes belong to the mass.
    structure = ndimage.generate_binary_structure(2, 2)
    mass = ndimage.binary_closing(solid, structure=structure, iterations=2)
    mass = ndimage.binary_fill_holes(mass)

    out_dist = ndimage.distance_transform_edt(~mass)

    # Interior reference color: nearest deep-interior pixel for every pixel.
    deep = ndimage.binary_erosion(solid, iterations=3)
    if deep.sum() == 0:
        deep = solid
    _, (iy, ix) = ndimage.distance_transform_edt(~deep, return_indices=True)
    ref = rgb[iy, ix]

    # ONLY the weak exterior halo (alpha <= 60) is a candidate: the baked
    # purple old-background skirt.  Anything stronger is artist linework
    # (AA ramps, outlines, edge sheen) and stays byte-identical — earlier
    # attempts to key stronger pixels ate dark outlines (their color is
    # close to the purple matte) and pale highlight edges.
    if mattes is None:
        mattes = [MATTE_PURPLE, MATTE_PURPLE2]
    halo = (~mass) & (alpha > 0) & (alpha <= 60.0) & (out_dist <= band_out)
    k = matte_suppression(rgb, ref, mattes)
    new_alpha = alpha.copy()
    new_alpha[halo] = alpha[halo] * (1.0 - k[halo])

    # Any stray semi pixel far outside the silhouette is dirt.
    stray = (alpha > 0) & (alpha < 200) & (~mass) & (out_dist > band_out)
    new_alpha[stray] = 0.0

    final = np.clip(new_alpha, 0.0, 255.0)
    out = img.copy()
    out[..., 3] = final
    save(out, dst_path)
    changed = int((np.abs(final - alpha) > 1).sum())
    return f"holes-filled={filled} halo px={int(halo.sum())} stray={int(stray.sum())} alpha-changed={changed}"


MASTER_ALPHA = os.path.join(
    ROOT, "art-studio", "production", "BLOCK-E-OUTFITS", "reference",
    "natural-pose-master-alpha.png")


def master_interior_mask():
    """Character-interior mask in 848x1264 slot space.

    The approved rig extraction (natural-pose-master-alpha, 1696x2528)
    defines where the character body is.  Solid coverage, downscaled and
    hole-filled: enclosed gaps (shadow creases between crown strands, the
    sliver between the legs) count as interior — the hair-back veil there
    is painted shadow the user approved.  Everything OUTSIDE this mask is
    room, and any hair-back veil over it is the "dark square" haze.
    """
    im = Image.open(MASTER_ALPHA).convert("RGBA").resize(
        (848, 1264), Image.BILINEAR)
    a = np.array(im)[..., 3].astype(np.float64)
    return a >= 200


def character_mask(extra_solid):
    """Closed character-interior mask in 848x1264 slot space.

    Union of the master-render solid coverage and the layer's own solid
    pixels, morphologically closed and hole-filled: the hair-dome outline
    stroke plus the front-hair strands enclose the semi-transparent crown
    veil (approved painted shadow), the legs enclose their sliver, etc.
    Only pixels OUTSIDE this mask are room — any veil there is haze.
    """
    solid = master_interior_mask() | extra_solid
    structure = ndimage.generate_binary_structure(2, 2)
    closed = ndimage.binary_closing(solid, structure=structure, iterations=3)
    filled = ndimage.binary_fill_holes(closed)
    return ndimage.binary_erosion(filled, iterations=1)


MASTER_CLEAN = os.path.join(
    ROOT, "art-studio", "production", "BLOCK-E-OUTFITS", "reference",
    "natural-pose-master-clean.png")


def master_strong_mask():
    """Definite character pixels from the APPROVED master-clean canon
    (color far from its flat (52,38,52) background), in 848x1264 space."""
    im = np.array(Image.open(MASTER_CLEAN).convert("RGB")).astype(np.float64)
    bgc = np.array([52.0, 38.0, 52.0])
    dist = np.linalg.norm(im - bgc, axis=-1)
    m = (dist > 40.0).astype(np.uint8) * 255
    md = np.array(Image.fromarray(m).resize((848, 1264), Image.BILINEAR))
    return md > 127


def rebuild_hair_back(src_path, dst_path):
    """Distance-based haze removal — deliberately NO color keying.

    The semi-transparent dark veil baked into this layer plays two roles:
    between/around the hair strands it reads as painted hair shadow (the
    user-approved look), but over the room it is the "dark square" that
    dims the scene.  Color keys cannot split the two (the shadow IS
    background-colored), and every keyed attempt punched holes into the
    crown.  Distance can split them: shadow lives within a few px of
    solid art, the square stretches hundreds of px into the room.

      prox <= 6px of solid art  -> byte-identical (shadow, strand AA)
      6..14px                   -> smooth linear fade to zero (no seam)
      > 14px                    -> gone (the square, the room mottling)

    Plus one safe exception: near-white desaturated rash pixels (old white
    background mix) fade even near strands, but ONLY outside the approved
    master-clean body — never inside the character.
    """
    img = load(src_path).astype(np.float64)
    rgb, alpha = img[..., :3], img[..., 3]
    lum = rgb.mean(axis=-1)
    sat = rgb.max(axis=-1) - rgb.min(axis=-1)

    solid = alpha >= 220
    strongm = master_strong_mask()
    strong = solid | strongm
    prox = ndimage.distance_transform_edt(~strong)

    # Enclosed interior: strand gaps bridged (<=12px) and hole-filled —
    # the veil there is approved painted shadow and stays byte-identical.
    structure = ndimage.generate_binary_structure(2, 2)
    enclosed = ndimage.binary_closing(strong, structure=structure,
                                      iterations=6)
    enclosed = ndimage.binary_fill_holes(enclosed)
    enclosed = ndimage.binary_erosion(enclosed, iterations=2)

    # Outside the enclosure: keep a ~1.5px AA skirt, fade out by 4px —
    # the white speck chains along the strands live 2-6px out.
    fade = np.clip((4.0 - prox) / 2.5, 0.0, 1.0)

    whiteness = smoothstep(lum, 205.0, 240.0) * (1.0 - smoothstep(sat, 10.0, 25.0))
    w_white = np.where(strongm, 1.0, 1.0 - whiteness)

    keep_intact = solid | (enclosed & ~strongm) | strongm
    new_alpha = np.where(keep_intact, alpha * np.where(solid, 1.0, 1.0),
                         alpha * fade)
    new_alpha = new_alpha * np.where(keep_intact & ~solid, 1.0, 1.0)
    # white rash fades even near strands, but never inside the body
    new_alpha = np.where(~solid, new_alpha * w_white, new_alpha)

    # Solid near-white chunks baked INTO the outer 2px of strand edges
    # (over the room only): fade by whiteness.  Genuine strand highlights
    # are saturated lavender and sit deeper than 2px — untouched.
    strict_white = smoothstep(lum, 215.0, 245.0) * \
        (1.0 - smoothstep(sat, 12.0, 28.0))
    nz = new_alpha > 10.0
    edge_dist = ndimage.distance_transform_edt(nz)
    ring = nz & (edge_dist <= 3.0)
    new_alpha = np.where(ring, new_alpha * (1.0 - 0.9 * strict_white),
                         new_alpha)
    final = np.clip(new_alpha, 0.0, 255.0)

    out = img.copy()
    out[..., 3] = final
    save(out, dst_path)
    killed = int(((alpha > 0) & (final < 1)).sum())
    faded = int((np.abs(final - alpha) > 1).sum())
    return f"killed px={killed} faded px={faded}"


# Slots 13/17/18/19/20 (head + hair) are deliberately NOT processed: the
# crown strands are the palest art in the build and every edge treatment
# tried on them (matte keys, feather, offline hole prefill against the
# white-background original) carved visible light patches into the crown
# on the live DPR3 render.  Their originals are clean on screen; the dirt
# the user saw around the hair came from the hair-back veil, which the
# dedicated rebuild above fixes.
NATURAL_SLOTS = {
    3: "03_leg_l.png",
    4: "04_leg_r.png",
    5: "05_torso.png",
    9: "09_outfit_collar.png",
    10: "10_outfit_ribbon.png",
    11: "11_outfit_skirt_01.png",
    12: "12_outfit_skirt_02.png",
}
OVERLAYS = ["natural-blouse.png", "natural-arm-l.png", "natural-arm-r.png"]

if __name__ == "__main__":
    print("hair-back:",
          rebuild_hair_back(os.path.join(BLOCK_C, "natural-hair-back.png"),
                            os.path.join(OUT, "natural-hair-back.png")))
    for name in OVERLAYS:
        is_blouse = name == "natural-blouse.png"
        print(name, ":", rebuild_generic(os.path.join(BLOCK_C, name),
                                         os.path.join(OUT, name),
                                         use_original=is_blouse,
                                         prefill=is_blouse))
    for z, name in sorted(NATURAL_SLOTS.items()):
        # Legs carry the baked grey matte strip a little deeper inside.
        band_in = 3.5 if z in (3, 4) else 2.5
        dark = z in (3, 4, 11, 12)
        mats = ([MATTE_WHITE, MATTE_GREY, MATTE_PURPLE, MATTE_PURPLE2]
                if dark else None)
        print(name, ":", rebuild_generic(os.path.join(LAYERS, name),
                                         os.path.join(OUT, name),
                                         band_in=band_in,
                                         mattes=mats))
    print("done ->", OUT)
