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
  rotationDeg: 2.8,
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

/** Approved slots deformed by the shared breathing field row-mesh. */
export const BREATH_MESH_SLOTS = [5, 8, 9, 10, 11, 12] as const;

/** Visible mobile-scale idle amplitudes, all in approved art pixels/degrees. */
export const MOTION = {
  breathingPx: 6,
  shoulderPx: 4,
  headCounterPx: 3,
  waistCounterPx: 2,
  hairSwayPx: 7,
  hairLagPx: 5,
  armGroupRotationDeg: 1.3,
  armSlotRotationDeg: 1.8,
  hairGroupRotationDeg: 0.9,
  hairSlotRotationDeg: 0.75,
  skirtRotationDeg: 1.2,
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
  scaleMode: "linear",
  addressMode: "clamp-to-edge",
} as const;
