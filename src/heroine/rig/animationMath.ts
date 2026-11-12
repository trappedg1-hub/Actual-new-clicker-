/**
 * Deterministic, renderer-independent animation maths for the production
 * HEROINE-01 rig.  No PixiJS imports here, so Node tests can verify the loop
 * seam and reaction restart rules without a browser.
 */
import { LEG_POSE, MOTION } from "./renderConfig.ts";

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
  const slow = wave(loopMs, 12_000, 0.6, 1);
  const hairWave = wave(loopMs, 3_000, 0.9, 1);
  const armL = wave(loopMs, 6_000, 0.35, 1);
  const armR = wave(loopMs, 6_000, 0.35 + Math.PI, 1);
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
  const skirt = wave(loopMs, 4_000, 1.25, 1);

  // Breathing: chest rises, shoulders follow with a slight left/right delay,
  // waist/skirt answers in counter-phase, head compensates by 1 px.
  const chestY = px(breath * MOTION.breathingPx);
  const shoulderYL = px(breath * MOTION.shoulderPx + slow * 2);
  const shoulderYR = px(breath * MOTION.shoulderPx - slow * 2);
  const headY = px(-breath * MOTION.headCounterPx);
  const waistY = px(-breath * MOTION.waistCounterPx);

  // Hair and fabric lag behind the body (secondary inertia).
  const backHairY = px(hairWave * MOTION.hairSwayPx);
  const frontHairY = px(wave(loopMs, 3_000, 1.7, 1) * MOTION.hairLagPx);

  const groups: Record<RigGroupId, Transform2D> = {
    // The root is welded: no scale, no rotation, no vertical bounce.
    bodyRoot: identityTransform(),
    headGroup: { ...identityTransform(), y: headY },
    backHairGroup: {
      ...identityTransform(),
      y: backHairY,
      rotationDeg: deg(hairWave * MOTION.hairGroupRotationDeg),
    },
    frontHairGroup: {
      ...identityTransform(),
      y: frontHairY,
      rotationDeg: deg(-hairWave * MOTION.hairGroupRotationDeg * 0.75),
    },
    legGroup: { ...identityTransform(), y: waistY },
    armGroupL: {
      ...identityTransform(),
      y: shoulderYL,
      rotationDeg: deg(armL * MOTION.armGroupRotationDeg),
    },
    armGroupR: {
      ...identityTransform(),
      y: shoulderYR,
      rotationDeg: deg(armR * MOTION.armGroupRotationDeg),
    },
    outfitGroup: { ...identityTransform(), y: chestY },
    faceGroup: identityTransform(),
  };

  const slots: Record<number, number> = {};
  const slotWarp: Record<number, number> = {};
  for (let z = 1; z <= 20; z += 1) {
    slots[z] = 0;
    slotWarp[z] = 0;
  }
  // Independent pivots come from the approved layer-map `pivotAbsolute`.
  slots[1] = deg(hairWave * MOTION.hairSlotRotationDeg); // back hair left mass
  slots[2] = deg(-hairWave * MOTION.hairSlotRotationDeg); // back hair right mass
  // Each leg stays ONE approved slot.  A bounded hip rotation plus a graded
  // knee-area mesh warp makes the pose visible; it is not anatomical knee or
  // ankle articulation and needs no new art layer or hidden anatomy.
  slots[3] = deg(legL * LEG_POSE.rotationDeg); // left leg, hip pivot (370, 675)
  slots[4] = deg(legR * LEG_POSE.rotationDeg); // right leg, hip pivot (478, 675)
  slotWarp[3] = px(legL * LEG_POSE.warpPx);
  slotWarp[4] = px(legR * LEG_POSE.warpPx);
  slots[6] = deg(armL * MOTION.armSlotRotationDeg); // left shoulder pivot
  slots[7] = deg(armR * MOTION.armSlotRotationDeg); // right shoulder pivot
  slots[11] = deg(skirt * MOTION.skirtRotationDeg); // upper skirt inertia
  slots[12] = deg(-skirt * MOTION.skirtRotationDeg); // lower skirt counter-sway
  slots[17] = deg(hairWave * MOTION.hairSlotRotationDeg); // left side lock
  slots[18] = deg(-hairWave * MOTION.hairSlotRotationDeg); // right side lock
  slots[19] = deg(hairWave * MOTION.hairSlotRotationDeg * 0.7); // fringe 01
  slots[20] = deg(-hairWave * MOTION.hairSlotRotationDeg * 0.7); // fringe 02

  return {
    timeMs,
    loopMs,
    groups,
    slots,
    slotWarp,
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

  groups.headGroup.y += px(reaction.head * 0.25);
  groups.headGroup.rotationDeg = deg(
    groups.headGroup.rotationDeg + reaction.head * 0.08,
  );
  groups.armGroupL.y += px(reaction.armL * 0.18);
  groups.armGroupR.y += px(reaction.armR * 0.18);
  groups.armGroupL.rotationDeg = deg(
    groups.armGroupL.rotationDeg + reaction.armL * 0.18,
  );
  groups.armGroupR.rotationDeg = deg(
    groups.armGroupR.rotationDeg + reaction.armR * 0.18,
  );
  groups.backHairGroup.rotationDeg = deg(
    groups.backHairGroup.rotationDeg + reaction.hair * 0.12,
  );
  groups.frontHairGroup.rotationDeg = deg(
    groups.frontHairGroup.rotationDeg + reaction.hair * 0.08,
  );
  groups.outfitGroup.y += px(reaction.body * 0.8);
  groups.legGroup.y += px(-reaction.body * 0.15);

  const slots: Record<number, number> = { ...frame.slots };
  const slotWarp: Record<number, number> = { ...frame.slotWarp };
  slots[3] = deg((slots[3] ?? 0) + reaction.body * 0.08);
  slots[4] = deg((slots[4] ?? 0) - reaction.body * 0.08);
  slotWarp[3] = px((slotWarp[3] ?? 0) + reaction.body * 0.8);
  slotWarp[4] = px((slotWarp[4] ?? 0) - reaction.body * 0.8);
  slots[6] = deg((slots[6] ?? 0) + reaction.armL * 0.08);
  slots[7] = deg((slots[7] ?? 0) + reaction.armR * 0.08);
  slots[11] = deg((slots[11] ?? 0) + reaction.body * 0.06);
  slots[12] = deg((slots[12] ?? 0) - reaction.body * 0.06);
  slots[17] = deg((slots[17] ?? 0) + reaction.hair * 0.05);
  slots[18] = deg((slots[18] ?? 0) - reaction.hair * 0.05);

  return {
    ...frame,
    groups,
    slots,
    slotWarp,
    underlayAlpha: 0,
  };
}
