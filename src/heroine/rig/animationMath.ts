/**
 * Deterministic, renderer-independent animation maths for the production
 * HEROINE-01 rig.  No PixiJS imports here, so Node tests can verify the loop
 * seam and reaction restart rules without a browser.
 */
import { BREATH, LEG_POSE } from "./renderConfig.ts";

export const RIG_CANVAS = { width: 848, height: 1264 } as const;
export const RIG_LOOP_MS = 12_000;
/**
 * Face region of the flattened, approved E2-V2 full-frame state plates.
 * The plates contain the original purple background; the runtime applies this
 * rounded face mask so only approved face pixels enter the transparent rig.
 */
export const FACE_PLATE_RECT = {
  x: 374,
  y: 98,
  width: 116,
  height: 200,
  radius: 40,
} as const;

export type TouchZone = "head" | "hair" | "body" | "arms";

export const EXPRESSION_STATES = [
  "00-neutral",
  "01-eye_l_closed-B",
  "02-eye_r_closed-B",
  "03-mouth_open-A",
  "04-mouth_smile-A",
  "05-both-eyes-closed",
  "06-both-eyes-closed-smile",
  "07-mouth_open-both-eyes-closed",
  "08-eye_l_closed-smile",
  "09-eye_r_closed-mouth_open",
] as const;

export type ExpressionStateName = (typeof EXPRESSION_STATES)[number];
export type ExpressionName =
  "eye_l_closed-B" | "eye_r_closed-B" | "mouth_open-A" | "mouth_smile-A";

export const EXPRESSION_COMBOS: Record<
  ExpressionStateName,
  readonly ExpressionName[]
> = {
  "00-neutral": [],
  "01-eye_l_closed-B": ["eye_l_closed-B"],
  "02-eye_r_closed-B": ["eye_r_closed-B"],
  "03-mouth_open-A": ["mouth_open-A"],
  "04-mouth_smile-A": ["mouth_smile-A"],
  "05-both-eyes-closed": ["eye_l_closed-B", "eye_r_closed-B"],
  "06-both-eyes-closed-smile": [
    "eye_l_closed-B",
    "eye_r_closed-B",
    "mouth_smile-A",
  ],
  "07-mouth_open-both-eyes-closed": [
    "eye_l_closed-B",
    "eye_r_closed-B",
    "mouth_open-A",
  ],
  "08-eye_l_closed-smile": ["eye_l_closed-B", "mouth_smile-A"],
  "09-eye_r_closed-mouth_open": ["eye_r_closed-B", "mouth_open-A"],
};

/**
 * Tap reactions must switch BOTH eyes together.  The earlier head mapping used
 * `01-eye_l_closed-B` (a one-eye wink), which is why a tap closed only one eye.
 * Auto-blink keeps its own `blinkStateFor()` path unchanged.
 */
export const TAP_EXPRESSION_STATES: Record<TouchZone, ExpressionStateName> = {
  head: "05-both-eyes-closed",
  hair: "06-both-eyes-closed-smile",
  body: "07-mouth_open-both-eyes-closed",
  arms: "05-both-eyes-closed",
};

export function dominantExpressionState(
  targets: Record<ExpressionStateName, number>,
): ExpressionStateName {
  let best: ExpressionStateName = "00-neutral";
  let bestAlpha = -1;
  for (const state of EXPRESSION_STATES) {
    const alpha = targets[state] ?? 0;
    if (alpha > bestAlpha) {
      bestAlpha = alpha;
      best = state;
    }
  }
  return best;
}

export type RigGroupId =
  | "bodyRoot"
  | "headGroup"
  | "backHairGroup"
  | "frontHairGroup"
  | "legGroup"
  | "armGroupL"
  | "armGroupR"
  | "outfitGroup"
  | "faceGroup";

export interface Transform2D {
  rotationDeg: number;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}

export interface ExpressionOverride {
  state: ExpressionStateName;
  weight: number;
}

export interface RigFrame {
  timeMs: number;
  loopMs: number;
  groups: Record<RigGroupId, Transform2D>;
  slots: Record<number, number>;
  /** Whole-pixel horizontal pose warp for the two one-slot leg meshes. */
  slotWarp: Record<number, number>;
  /**
   * Peak vertical lift of the shared breathing field in art pixels.  Every
   * torso-band slot is row-mesh-warped by dy(y) = -breathLift * breathWeight(y),
   * so adjacent layers displace identically and no seam can open.
   */
  breathLift: number;
  underlayAlpha: number;
  expressionTargets: Record<ExpressionStateName, number>;
  blinkClosed: boolean;
}

export interface ReactionState {
  head: number;
  hair: number;
  armL: number;
  armR: number;
  body: number;
}

export const NO_REACTION: ReactionState = {
  head: 0,
  hair: 0,
  armL: 0,
  armR: 0,
  body: 0,
};

function identityTransform(): Transform2D {
  return { rotationDeg: 0, x: 0, y: 0, scaleX: 1, scaleY: 1 };
}

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function smoothstep(value: number): number {
  const x = clamp01(value);
  return x * x * (3 - 2 * x);
}

/**
 * Shared breathing weight of one art row.  Exactly 0 at and above the neck
 * junction (BREATH.topY) and at and below the hip junction (BREATH.bottomY),
 * smooth peak 1 at the chest row.  Both the renderer meshes and the Node
 * tests use this single source of truth, so a seam can only stay closed.
 */
export function breathWeight(y: number): number {
  if (y <= BREATH.topY || y >= BREATH.bottomY) return 0;
  if (y < BREATH.peakY) {
    return smoothstep((y - BREATH.topY) / (BREATH.peakY - BREATH.topY));
  }
  return smoothstep((BREATH.bottomY - y) / (BREATH.bottomY - BREATH.peakY));
}

/**
 * A phase-shifted sine wave that is exactly zero at t=0 and t=LOOP.
 * Periods are chosen to divide the 12-second master loop, so the seam closes.
 */
function wave(
  timeMs: number,
  periodMs: number,
  phase: number,
  amplitude: number,
): number {
  const t = timeMs % RIG_LOOP_MS;
  const raw = Math.sin((2 * Math.PI * t) / periodMs + phase) - Math.sin(phase);
  return clamp((raw / 1.5) * amplitude, -amplitude, amplitude);
}

function zeroTargets(): Record<ExpressionStateName, number> {
  return {
    "00-neutral": 0,
    "01-eye_l_closed-B": 0,
    "02-eye_r_closed-B": 0,
    "03-mouth_open-A": 0,
    "04-mouth_smile-A": 0,
    "05-both-eyes-closed": 0,
    "06-both-eyes-closed-smile": 0,
    "07-mouth_open-both-eyes-closed": 0,
    "08-eye_l_closed-smile": 0,
    "09-eye_r_closed-mouth_open": 0,
  };
}

function blendTargets(
  a: Record<ExpressionStateName, number>,
  b: Record<ExpressionStateName, number>,
  weight: number,
): Record<ExpressionStateName, number> {
  const out = zeroTargets();
  const w = clamp01(weight);
  for (const state of EXPRESSION_STATES) {
    out[state] = a[state] * (1 - w) + b[state] * w;
  }
  return out;
}

function mouthKind(state: ExpressionStateName): "neutral" | "open" | "smile" {
  if (
    state === "03-mouth_open-A" ||
    state === "07-mouth_open-both-eyes-closed" ||
    state === "09-eye_r_closed-mouth_open"
  ) {
    return "open";
  }
  if (
    state === "04-mouth_smile-A" ||
    state === "06-both-eyes-closed-smile" ||
    state === "08-eye_l_closed-smile"
  ) {
    return "smile";
  }
  return "neutral";
}

function blinkStateFor(state: ExpressionStateName): ExpressionStateName {
  const mouth = mouthKind(state);
  if (mouth === "smile") return "06-both-eyes-closed-smile";
  if (mouth === "open") return "07-mouth_open-both-eyes-closed";
  return "05-both-eyes-closed";
}

/** Expression cross-fades are periodic and complete before the loop seam. */
function baseExpressionTargets(loopMs: number): {
  targets: Record<ExpressionStateName, number>;
  dominant: ExpressionStateName;
} {
  const zero = zeroTargets();
  const neutral: Record<ExpressionStateName, number> = {
    ...zero,
    "00-neutral": 1,
  };
  const smile: Record<ExpressionStateName, number> = {
    ...zero,
    "04-mouth_smile-A": 1,
  };
  const open: Record<ExpressionStateName, number> = {
    ...zero,
    "03-mouth_open-A": 1,
  };

  if (loopMs < 3_800) return { targets: neutral, dominant: "00-neutral" };
  if (loopMs < 4_200) {
    return {
      targets: blendTargets(neutral, smile, smoothstep((loopMs - 3_800) / 400)),
      dominant: "04-mouth_smile-A",
    };
  }
  if (loopMs < 7_800) return { targets: smile, dominant: "04-mouth_smile-A" };
  if (loopMs < 8_200) {
    return {
      targets: blendTargets(smile, open, smoothstep((loopMs - 7_800) / 400)),
      dominant: "03-mouth_open-A",
    };
  }
  if (loopMs < 11_400) return { targets: open, dominant: "03-mouth_open-A" };
  if (loopMs < 11_800) {
    return {
      targets: blendTargets(open, neutral, smoothstep((loopMs - 11_400) / 400)),
      dominant: "00-neutral",
    };
  }
  return { targets: neutral, dominant: "00-neutral" };
}

function blinkWeight(loopMs: number): number {
  const windows: readonly (readonly [number, number])[] = [
    [2_600, 2_740],
    [6_600, 6_740],
    [10_600, 10_740],
  ];
  for (const [start, end] of windows) {
    if (loopMs >= start && loopMs <= end) {
      const edge = 30;
      const fadeIn = smoothstep((loopMs - start) / edge);
      const fadeOut = 1 - smoothstep((loopMs - (end - edge)) / edge);
      return Math.min(fadeIn, fadeOut);
    }
  }
  return 0;
}

export function expressionTargetsAt(
  timeMs: number,
  override: ExpressionOverride | null = null,
): Record<ExpressionStateName, number> {
  const loopMs = ((timeMs % RIG_LOOP_MS) + RIG_LOOP_MS) % RIG_LOOP_MS;
  const base = baseExpressionTargets(loopMs);
  let targets = base.targets;
  if (override && override.weight > 0) {
    const replacement = zeroTargets();
    replacement[override.state] = 1;
    targets = blendTargets(targets, replacement, override.weight);
  }
  const weight = blinkWeight(loopMs);
  if (weight > 0) {
    const blink = zeroTargets();
    blink[blinkStateFor(base.dominant)] = 1;
    targets = blendTargets(targets, blink, weight);
  }
  return targets;
}

export function isBlinkClosed(timeMs: number): boolean {
  return (
    blinkWeight(((timeMs % RIG_LOOP_MS) + RIG_LOOP_MS) % RIG_LOOP_MS) > 0.5
  );
}

/** Quantize a translation to whole art pixels: no sub-pixel GPU resampling. */
function px(value: number): number {
  // `+ 0` normalizes -0 so snapshot equality is exact across cycles.
  return Math.round(value) + 0;
}

/** Small bounded rotation in degrees; translation stays integer-only. */
function deg(value: number): number {
  // `+ 0` normalizes -0 before clamping; rotations stay below the 3.5 deg
  // regression limit even after a tap reaction is applied.
  return clamp(value + 0, -3.5, 3.5);
}

/**
 * A delayed WebKit/Safari frame must not teleport the pose. The visible phase
 * itself is derived from wall-clock time, while reactions and overrides consume
 * only a bounded delta so they decay smoothly after a long renderer stall.
 */
export function clampedAnimationDeltaMs(elapsedMs: number): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0;
  return Math.min(elapsedMs, 100);
}

/**
 * Full idle pose.  The master loop is 12 000 ms; every period below divides it,
 * so frame 0 and frame 12 000 (and every further cycle) are bit-identical.
 *
 * The approved cut-outs have ZERO overlap by construction: each pixel belongs
 * to exactly one of the 20 slots.  Static non-limb slots are composited behind
 * the rig at rest; the four animated limb slots are NEVER duplicated there.
 * A full-body static duplicate made the moving legs look frozen and produced
 * double shoe/ankle contours.  Each animated limb draws only its own approved
 * pixels, with a 2px alpha bleed so linear sampling cannot expose black seams.
 *
 * No global scale, no global rotation, no whole-figure stretch.  All breathing
 * is distributed across chest, shoulders, waist, head compensation, hair and
 * fabric inertia.  Every translation is an integer; rotations are tiny and
 * happen around each slot's own approved pivot.
 */
export function rigFrameAt(
  timeMs: number,
  override: ExpressionOverride | null = null,
): RigFrame {
  const loopMs = ((timeMs % RIG_LOOP_MS) + RIG_LOOP_MS) % RIG_LOOP_MS;

  // Shared drivers.  Different phases keep limbs independent but phase-locked
  // to the same breath, so the pose always returns to rest without drift.
  const breath = wave(loopMs, 4_000, 0, 1); // -1 .. 1, seamless
  // Leg pose is a true bipolar 6s sine (exactly zero at 0 and 12 000 ms),
  // with a small shared slow sway.  The earlier phase-shifted wave was almost
  // one-sided: one leg barely reached its outward pose.  This driver gives
  // each leg a visible max left, rest and max right within one cycle.
  const legBase = Math.sin((2 * Math.PI * loopMs) / 6_000);
  // The shared sway uses a zero-phase 12s wave so both legs return exactly to
  // rest at 0, 6 000 and 12 000 ms; the old phase-shifted slow driver left a
  // visible offset at half cycle once the mobile-scale warp was enlarged.
  const legShared = wave(loopMs, 12_000, 0, 0.12);
  const legL = clamp(legBase + legShared, -1, 1);
  const legR = clamp(-legBase + legShared, -1, 1);

  // COHESIVE BREATHING.  One shared field replaces the old independent
  // translations of outfitGroup/headGroup/legGroup/armGroups whose relative
  // motion opened transparent seams across the ZERO-overlap approved slots
  // (up to 6px collar vs head, 4px blouse vs torso, 5px skirt vs legs).
  // The torso band breathes via an identical row-mesh warp (breathLift),
  // pinned to 0 at the neck and hip junction rows.  CATEGORY-D FIX: the
  // arms, the back hair masses and both skirt parts are now row-mesh-warped
  // by the SAME field instead of owning rigid pendulum transforms.  Every
  // independent rigid motion of a slot that shares a zero-overlap cut
  // contour with the body (arm pendulum, back-hair sway, side-lock sway,
  // skirt rotation) measurably tore 1-6px black slits along those contours
  // on the device; only the front fringe, which lies entirely over the
  // opaque face/head interior, keeps its secondary sway.
  const breathLift = breath * BREATH.liftPx;

  const groups: Record<RigGroupId, Transform2D> = {
    // The root is welded: no scale, no rotation, no vertical bounce.
    bodyRoot: identityTransform(),
    // The head is welded to the neck: the field is zero at the neck row, so
    // any head translation would reopen the collar seam.
    headGroup: identityTransform(),
    // Back hair is welded: its strands share cut contours with the blouse,
    // the skirt and the arms, so any independent sway tears them open.  The
    // strands inside the torso band breathe via the shared field mesh.
    backHairGroup: identityTransform(),
    // The fringe is welded too: its sway slid the fringe strands against
    // the static side locks and head crown and opened ~1px black cracks
    // between interlocking strands at the parting (Category-D, measured
    // 129px at every sway extreme).  Hair life now comes from the shared
    // breathing field deforming the back-hair masses inside the torso band.
    frontHairGroup: identityTransform(),
    // Legs are planted: the field is zero at their top rows, no counter-phase.
    legGroup: identityTransform(),
    // Arms are welded to the shared breathing field: the old rigid follow
    // translation plus pendulum rotation displaced the arm contours against
    // the row-warped blouse/torso and opened 1-3px slits along the shared
    // cuts (armpit and inner-arm contours).  The arm slots are row-meshed by
    // the same field, so identical rows always displace identically.
    armGroupL: identityTransform(),
    armGroupR: identityTransform(),
    // Outfit translation retired: the breathing lives in the shared mesh warp.
    outfitGroup: identityTransform(),
    faceGroup: identityTransform(),
  };

  const slots: Record<number, number> = {};
  const slotWarp: Record<number, number> = {};
  for (let z = 1; z <= 20; z += 1) {
    slots[z] = 0;
    slotWarp[z] = 0;
  }
  // Independent pivots come from the approved layer-map `pivotAbsolute`.
  // Back hair slot rotations retired (Category-D): the masses share cut
  // contours with blouse/skirt/arms; they breathe via the shared field.
  // Each leg stays ONE approved slot.  A bounded hip rotation plus a graded
  // knee-area mesh warp makes the pose visible; it is not anatomical knee or
  // ankle articulation and needs no new art layer or hidden anatomy.
  // Hip rotation retired (Category-D): rotating a whole leg around the hip
  // pivot slid its top contour horizontally under the sheer skirt openings
  // and opened black slits at the hip/stocking rows (y656-689).  The
  // graded knee-area warp is zero at the hip rows, so the visible leg pose
  // stays while the hip junction remains welded.
  slotWarp[3] = px(legL * LEG_POSE.warpPx);
  slotWarp[4] = px(legR * LEG_POSE.warpPx);
  // Arm, skirt and side-lock slot rotations retired (Category-D): each one
  // rotated a slot against a neighbour that shares its zero-overlap cut
  // contour (arm vs torso/blouse, skirt vs blouse hem and back-hair strands,
  // side locks vs collar) and opened black slits during motion.  Their
  // visible movement now comes from the shared breathing field row-mesh.
  // Fringe slot rotations retired (Category-D): any relative motion of the
  // interlocking fringe/side-lock strand sets opens cracks at the parting.

  return {
    timeMs,
    loopMs,
    groups,
    slots,
    slotWarp,
    breathLift,
    underlayAlpha: 0,
    expressionTargets: expressionTargetsAt(loopMs, override),
    blinkClosed: isBlinkClosed(loopMs),
  };
}

export function triggerReaction(zone: TouchZone): ReactionState {
  switch (zone) {
    case "head":
      return { head: -7, hair: 2, armL: 0, armR: 0, body: 0.3 };
    case "hair":
      return { head: 1, hair: 7, armL: 0, armR: 0, body: 0.5 };
    case "body":
      return { head: -1, hair: 1, armL: 2, armR: -2, body: 3 };
    case "arms":
      return { head: 0, hair: 1, armL: -12, armR: 12, body: 1 };
  }
}

export function decayReaction(
  reaction: ReactionState,
  elapsedMs: number,
): ReactionState {
  const factor = Math.exp(-Math.max(0, elapsedMs) / 220);
  return {
    head: reaction.head * factor,
    hair: reaction.hair * factor,
    armL: reaction.armL * factor,
    armR: reaction.armR * factor,
    body: reaction.body * factor,
  };
}

export function reactionEnergy(reaction: ReactionState): number {
  return clamp01(
    (Math.abs(reaction.head) +
      Math.abs(reaction.hair) +
      Math.abs(reaction.armL) +
      Math.abs(reaction.armR) +
      Math.abs(reaction.body)) /
      30,
  );
}

/**
 * Tap feedback is distributed over the SAME channels as the idle pose instead
 * of lifting/scaling the whole figure.  The root stays welded; the runtime
 * coverage composite closes any transient seam.  Integer translations only.
 */
export function applyReaction(
  frame: RigFrame,
  reaction: ReactionState,
): RigFrame {
  const groups = {} as Record<RigGroupId, Transform2D>;
  for (const id of Object.keys(frame.groups) as RigGroupId[]) {
    groups[id] = { ...frame.groups[id] };
  }

  // Tap feedback must respect the same cohesion rules as idle breathing:
  // no translation across a zero-overlap seam.  The head reacts with a tiny
  // rotation only (a vertical head jump reopened the collar seam), the arms
  // rotate around their shoulder pivots, and the body impulse feeds the
  // SHARED breathing field instead of translating the outfit against the
  // static torso and legs.
  groups.headGroup.rotationDeg = deg(
    groups.headGroup.rotationDeg + reaction.head * 0.08,
  );
  // CATEGORY-D: arm-group, back-hair and fringe rotations tore the shared
  // cut contours and the interlocked strand partings open on every tap;
  // the arm/hair impulse is routed into the SHARED breathing field
  // (visible chest+arms+hair rise) instead.
  const breathLift = clamp(
    frame.breathLift +
      reaction.body * 1.2 +
      (Math.abs(reaction.armL) + Math.abs(reaction.armR)) * 0.15 +
      Math.abs(reaction.hair) * 0.1,
    -BREATH.liftPx * 1.5,
    BREATH.liftPx * 1.5,
  );

  const slots: Record<number, number> = { ...frame.slots };
  const slotWarp: Record<number, number> = { ...frame.slotWarp };
  // Hip rotation retired (Category-D) — tap feedback uses the graded warp.
  slotWarp[3] = px((slotWarp[3] ?? 0) + reaction.body * 0.8);
  slotWarp[4] = px((slotWarp[4] ?? 0) - reaction.body * 0.8);
  // Arm, skirt and side-lock reaction rotations retired (Category-D): they
  // rotated slots against neighbours sharing their zero-overlap cut
  // contours and flashed black slits on every tap.

  return {
    ...frame,
    groups,
    slots,
    slotWarp,
    breathLift,
    underlayAlpha: 0,
  };
}
