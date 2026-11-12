/**
 * NATURAL BASE IDLE POSE — stage "HEROINE-01 Natural Base Pose", 2026-11.
 *
 * Reposes the approved spread-leg technical rig stance into a relaxed
 * standing pose WITHOUT touching any approved PNG, the BLOCK 2 animation
 * maths or the accepted breathing/blink/reaction system:
 *
 * - Each leg slot (z03/z04) receives a STATIC horizontal row displacement on
 *   the existing leg pose mesh: zero at and above the hip anchor row (the
 *   leg tops stay welded under the opaque skirt exactly where BLOCK 1 cut
 *   them), smooth-stepping to a full inward offset at the ankle row, then
 *   constant through the shoe so the foot translates rigidly.  Measured on
 *   the approved layers (2026-11, this stage): outside both legs' outer
 *   contours every pixel from art row 700 down is fully transparent
 *   background, so narrowing the stance cannot open a Category-D seam.
 * - A small additional inward knee ease rides on the SAME bounded knee
 *   weight the accepted dynamic warp uses, which reads as relaxed knees.
 * - Arms/hands are intentionally NOT reposed: the approved back-hair masses
 *   sit at 0px clearance along the arms' outer contours (measured rows
 *   330-540), so ANY arm displacement would tear open zero-overlap slits.
 *   A natural arm pose needs newly approved art and is out of scope here.
 *
 * The accepted BLOCK 2 pose remains fully available: `?pose=classic` keeps
 * every offset at zero and skips the debris cleanup, byte-identical to the
 * approved build.
 */

export type PoseVariant = "natural" | "classic";

/** Rect in absolute 848x1264 art pixels: [x0, y0, x1, y1), end-exclusive. */
export type PoseCleanupRect = readonly [number, number, number, number];

export const NATURAL_POSE = {
  /** Field is exactly zero at and above this art row (under the skirt). */
  pinY: 720,
  /** Existing bounded knee-weight peak row (same as LEG_POSE.kneeY). */
  kneeY: 960,
  /** Full stance offset is reached here; constant below (rigid foot). */
  ankleY: 1210,
  /** Inward stance offset per leg at the ankle, approved art pixels. */
  stanceInwardPx: 105,
  /**
   * Relaxed-knee inward ease on the bounded knee weight.  Set to 0 after
   * user review (2026-11-12): combined with the former smoothstep stance
   * field the legs read slightly bow-legged; the straightened pose keeps
   * the legs geometrically straight, so no knee-level ease is applied.
   */
  kneeEaseInwardPx: 0,
} as const;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * Stance weight: 0 at/above the pinned hip row, LINEAR over the leg, 1
 * at/below the ankle so the whole foot translates rigidly.
 *
 * Linear on purpose (user fix request 2026-11-12, "ноги чуть колесом"):
 * the original smoothstep profile lagged behind the straight hip-to-ankle
 * line over the upper shin and overtook it below the knee, which bowed the
 * displaced leg outward (O-legs).  A linear ramp is an affine shear in y —
 * straight leg contours stay perfectly straight, and the only angle change
 * sits at the hip row under the skirt where natural adduction reads
 * correctly.
 */
export function poseStanceWeight(y: number): number {
  if (y <= NATURAL_POSE.pinY) return 0;
  if (y >= NATURAL_POSE.ankleY) return 1;
  return clamp01(
    (y - NATURAL_POSE.pinY) / (NATURAL_POSE.ankleY - NATURAL_POSE.pinY),
  );
}

/**
 * Inward direction per leg slot: the viewer-left leg (z03) moves right,
 * the viewer-right leg (z04) moves left. Every other slot stays untouched.
 */
export function poseInwardSign(slotZ: number): number {
  if (slotZ === 3) return 1;
  if (slotZ === 4) return -1;
  return 0;
}

/** Static stance offset (px) applied on the stance weight for one leg slot. */
export function poseStancePx(slotZ: number, variant: PoseVariant): number {
  if (variant !== "natural") return 0;
  return poseInwardSign(slotZ) * NATURAL_POSE.stanceInwardPx;
}

/** Static relaxed-knee ease (px) applied on the bounded knee weight. */
export function poseKneeEasePx(slotZ: number, variant: PoseVariant): number {
  if (variant !== "natural") return 0;
  return poseInwardSign(slotZ) * NATURAL_POSE.kneeEaseInwardPx;
}

/**
 * The accepted BLOCK 2 pose stays reachable: `?pose=classic`.
 * Every other value (including none) selects the natural base pose.
 */
export function resolvePoseVariant(search: string): PoseVariant {
  try {
    const params = new URLSearchParams(search);
    if (params.get("pose") === "classic") return "classic";
  } catch {
    /* Malformed query strings fall through to the default variant. */
  }
  return "natural";
}

/**
 * Separation-debris pixels orphaned by the stance change, measured on the
 * approved layers across the full dynamic warp range (knee warp -28..+28 on
 * either leg): tiny anti-aliasing fragments of neighbouring slots that were
 * nestled against the original leg contours and would float as isolated
 * specks once the legs move inward.  They are cleared AT RUNTIME, only in
 * the natural variant; no PNG on disk changes and the classic variant keeps
 * every byte.  Total area: 332 px across 38 rects; worst residual after
 * cleanup, measured over all dynamic phases: 0 px.
 *
 * Keyed by slot z: 1 = hair_back_01, 3 = leg_l, 4 = leg_r, 12 = skirt_02.
 */
export const POSE_DEBRIS_CLEANUP: Readonly<
  Record<number, readonly PoseCleanupRect[]>
> = {
  1: [
    [407, 729, 409, 731],
    [405, 731, 407, 734],
    [393, 741, 394, 742],
    [283, 796, 284, 797],
    [282, 798, 283, 801],
    [570, 824, 572, 827],
    [274, 841, 275, 842],
    [273, 845, 274, 846],
    [577, 848, 579, 853],
    [268, 858, 269, 859],
    [585, 867, 586, 868],
    [260, 872, 263, 876],
    [593, 883, 595, 885],
    [595, 886, 598, 891],
    [602, 904, 606, 909],
    [608, 920, 611, 924],
    [617, 948, 618, 953],
    [618, 954, 620, 964],
    [209, 1118, 210, 1119],
    [208, 1121, 209, 1122],
    [203, 1158, 204, 1160],
    [192, 1205, 193, 1207],
    [190, 1208, 194, 1224],
    [658, 1212, 659, 1214],
    [659, 1218, 660, 1220],
  ],
  3: [
    [404, 728, 409, 734],
    [392, 741, 393, 742],
  ],
  4: [
    [434, 739, 436, 741],
    [439, 743, 443, 746],
  ],
  12: [
    [212, 1098, 213, 1099],
    [637, 1103, 638, 1105],
    [655, 1201, 658, 1213],
    [192, 1204, 194, 1208],
    [658, 1214, 659, 1222],
    [191, 1223, 195, 1230],
    [658, 1223, 659, 1225],
    [655, 1227, 656, 1229],
    [207, 1231, 208, 1232],
  ],
};

/** Cleanup rects for one slot in one variant (empty for classic). */
export function poseCleanupRects(
  slotZ: number,
  variant: PoseVariant,
): readonly PoseCleanupRect[] {
  if (variant !== "natural") return [];
  return POSE_DEBRIS_CLEANUP[slotZ] ?? [];
}
