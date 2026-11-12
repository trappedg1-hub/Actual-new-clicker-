/**
 * Render-time constants shared by the deterministic animation maths, the PixiJS
 * rig and the Node verification tests. Keeping them here lets tests assert what
 * is actually drawn without importing browser-only PixiJS code.
 */

/**
 * Approved slots that are never moved as independent limb cut-outs. Slots
 * 13–16 are hidden base face layers: the approved full-frame state plates draw
 * the face at runtime and must not be baked into a static support either.
 */
export const COVERAGE_STATIC_SLOTS = [
  1, 2, 5, 8, 9, 10, 11, 12, 17, 18, 19, 20,
] as const;

/** Hidden base face layers supplied only by approved state plates. */
export const HIDDEN_FACE_BASE_SLOTS = [13, 14, 15, 16] as const;

/** Limb slots drawn only by their own animated group/mesh. */
export const ANIMATED_LIMB_SLOTS = [3, 4, 6, 7] as const;

/**
 * One approved RGBA slot per leg: the runtime can pivot the hip and warp the
 * knee area of that same slot, but it cannot invent separate knee/ankle parts
 * or hidden anatomy. Coordinates are absolute art-canvas pixels.
 *
 * The mobile heroine is displayed at roughly 0.36 CSS scale. A 1 degree hip
 * rotation and 9 px warp became only a few physical pixels on an iPhone and
 * looked static. These larger, still bounded values change the final silhouette
 * by tens of visible pixels without scaling the whole figure.
 */
export const LEG_POSE = {
  hipAnchorY: 720,
  kneeY: 960,
  ankleY: 1210,
  /** Whole-slot rotation around the approved hip pivot, degrees at max. */
  /**
   * RETIRED (must stay 0): hip rotation slid the leg tops under the sheer
   * skirt openings and opened black hip slits (Category-D defect map).
   */
  rotationDeg: 0,
  /** Horizontal pose warp at the knee, whole art pixels at max. */
  warpPx: 28,
} as const;

/**
 * Cohesive breathing field.  Breathing previously translated outfitGroup,
 * armGroups, headGroup and legGroup INDEPENDENTLY (chest +6, head -2,
 * legs -1, shoulders +-slow asymmetry).  The 20 approved slots have ZERO
 * overlap, so every pixel of relative motion across a seam opened a
 * transparent gap of exactly that size: up to 6px at the collar/head seam,
 * 4px blouse vs the static torso below it, and 5px at the skirt/leg hem.
 *
 * The repaired architecture drives ONE shared vertical displacement field
 * dy(y) = -breathLift * weight(y) applied as an identical row-mesh warp to
 * every torso-band slot (torso, blouse, collar, ribbon, both skirt parts).
 * Identical rows get identical displacement, so those layers stay stitched
 * to each other, and the weight is exactly 0 at the neck row and at the
 * hip row, so the band stays welded to the head above and the legs below.
 * Arms translate by the field value sampled at their shoulder anchor row,
 * which keeps them pinned to the breathing chest; their seam against the
 * torso is vertical, so the residual row-dependent slide cannot open a
 * horizontal gap.
 */
export const BREATH = {
  /** Field is zero at and above this art row (neck/collar junction). */
  topY: 300,
  /** Peak chest expansion row. */
  peakY: 420,
  /** Field is zero at and below this art row (above the legs' top, 654). */
  bottomY: 540,
  /** Peak vertical lift of the chest band in approved art pixels. */
  liftPx: 8,
  /** Arms follow the field sampled at this shoulder anchor row. */
  armAnchorY: 340,
} as const;

/**
 * Approved slots deformed by the shared breathing field row-mesh.  Includes
 * EVERY slot whose art crosses the breathing band y300-540 (torso, blouse,
 * collar, ribbon, both skirt parts, both arms, both back-hair masses):
 * identical rows displace identically, so no zero-overlap cut contour
 * between any two of them can open during motion (Category-D fix).
 */
export const BREATH_MESH_SLOTS = [1, 2, 5, 6, 7, 8, 9, 10, 11, 12] as const;

/** Visible mobile-scale idle amplitudes, all in approved art pixels/degrees. */
export const MOTION = {
  breathingPx: 6,
  shoulderPx: 4,
  headCounterPx: 3,
  waistCounterPx: 2,
  /**
   * RETIRED pendulum amplitudes (must stay 0): back-hair sway, arm group and
   * arm slot rotation, back-hair/side-lock rotation and skirt rotation each
   * moved a slot rigidly against a neighbour that shares its zero-overlap
   * cut contour and tore 1-6px black slits open during motion (Category-D
   * defect map, 2026-11-12).  Their visible movement now comes from the
   * shared breathing field row-mesh; only the front fringe, which lies
   * entirely over the opaque head/face interior, keeps secondary motion.
   */
  hairSwayPx: 0,
  hairLagPx: 0,
  armGroupRotationDeg: 0,
  armSlotRotationDeg: 0,
  hairGroupRotationDeg: 0,
  hairSlotRotationDeg: 0,
  skirtRotationDeg: 0,
} as const;

/** Runtime texture settings for the 20 approved slots and the static composite. */
export const RUNTIME_TEXTURE = {
  /**
   * The approved PNGs are straight RGBA. A 2px alpha bleed fills only fully
   * transparent RGB padding with neighbouring approved edge colours;
   * `no-premultiply-alpha` then lets PixiJS use its straight-alpha blend mode
   * so linear sampling never mixes edge colour with transparent black.
   */
  alphaMode: "no-premultiply-alpha",
  alphaBleedRadius: 2,
  /**
   * Interior punch-holes up to this many pixels (per 4-connected component)
   * are closed at runtime: the layer separation left tiny transparent holes
   * INSIDE the opaque silhouettes (110 in the blouse alone) through which
   * the dark background reads as black blotches.  Genuine art openings
   * (hair strand gaps, neckline, between the legs) are larger or reach the
   * exterior and are preserved bit-exactly.
   */
  /**
   * Covers the two largest measured separation defects: the flat painted
   * shadow slivers between the back-hair locks (712px at [260,535-284,609]
   * and 582px at [565,533-588,608] in z01), verified against the approved
   * original IMG_4038_rig-pose: the original holds a flat low-variance
   * shadow tone (std ~10) there, NOT the high-variance background (std
   * ~60), so the separation cut away painted art.  No approved layer has
   * any other interior component above 300px (full 20-layer scan,
   * 2026-11-12), so no genuine opening is affected by this threshold.
   */
  interiorHoleMaxArea: 1500,
  interiorAlphaThreshold: 250,
  /**
   * Approved art openings per slot z, [x0, y0, x1, y1] inclusive, in the
   * 848x1264 canvas space.  Each rect was verified TRANSPARENT in the
   * approved BLOCK 1 full assembly (ASSEMBLY-REST-RGBA.png), i.e. the
   * artist intended the background to show through — the hole repair must
   * never close these.  z17 hair_side_l: strand gap near the face.
   */
  approvedOpenings: {
    17: [[326, 183, 339, 232]],
  } as Readonly<
    Record<number, readonly (readonly [number, number, number, number])[]>
  >,
  scaleMode: "linear",
  addressMode: "clamp-to-edge",
} as const;
