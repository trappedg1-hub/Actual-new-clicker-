/**
 * Render-time constants shared by the deterministic animation maths, the PixiJS
 * rig and the Node verification tests.  Keeping them here lets tests assert
 * what is actually drawn without importing browser-only PixiJS code.
 */

/** Approved slots that are never moved as independent limb cut-outs. */
export const COVERAGE_STATIC_SLOTS = [
  1, 2, 5, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
] as const;

/** Limb slots that are drawn only by their own animated group/mesh. */
export const ANIMATED_LIMB_SLOTS = [3, 4, 6, 7] as const;

/**
 * One approved RGBA slot per leg: the runtime can pivot the hip and warp the
 * knee area of that same slot, but it cannot invent separate knee/ankle parts
 * or hidden anatomy.  Coordinates are absolute art-canvas pixels.
 */
export const LEG_POSE = {
  hipAnchorY: 720,
  kneeY: 960,
  ankleY: 1210,
  /** Whole-slot rotation around the approved hip pivot, degrees at max. */
  rotationDeg: 1,
  /** Horizontal pose warp at the knee, whole art pixels at max. */
  warpPx: 9,
} as const;

/** Runtime texture settings for the 20 approved slots and the static composite. */
export const RUNTIME_TEXTURE = {
  /**
   * The approved PNGs are straight RGBA.  A 2px alpha bleed fills only
   * fully transparent RGB padding with neighbouring approved edge colours;
   * `no-premultiply-alpha` then lets PixiJS use its straight-alpha blend mode
   * so linear sampling never mixes edge colour with transparent black.
   */
  alphaMode: "no-premultiply-alpha",
  alphaBleedRadius: 2,
  scaleMode: "linear",
  addressMode: "clamp-to-edge",
} as const;
