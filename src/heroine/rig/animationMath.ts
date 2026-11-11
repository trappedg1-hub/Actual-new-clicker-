/**
 * Deterministic, renderer-independent animation maths for the production
 * HEROINE-01 rig.  No PixiJS imports here, so Node tests can verify the loop
 * seam and reaction restart rules without a browser.
 */

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

function motionEnergy(groups: Record<RigGroupId, Transform2D>): number {
  let strongest = 0;
  for (const id of Object.keys(groups) as RigGroupId[]) {
    strongest = Math.max(strongest, Math.abs(groups[id].rotationDeg));
  }
  return clamp01(strongest / 12);
}

export function rigFrameAt(
  timeMs: number,
  override: ExpressionOverride | null = null,
): RigFrame {
  const loopMs = ((timeMs % RIG_LOOP_MS) + RIG_LOOP_MS) % RIG_LOOP_MS;
  const breath = wave(loopMs, 4_000, 0, 1.2);
  const bodyRot = breath;
  const headRot = wave(loopMs, 6_000, 0.4, 3.0) - bodyRot * 0.7;
  const backHairRot = wave(loopMs, 6_000, 0.2, 4.0) + bodyRot * 0.35;
  const frontHairRot = wave(loopMs, 6_000, 0.7, 2.0);
  const armLRot = wave(loopMs, 6_000, 0.9, 2.5) + bodyRot * 0.3;
  const armRRot = wave(loopMs, 6_000, 1.4, 2.5) + bodyRot * 0.3;
  const legRot = wave(loopMs, 4_000, 0, 0.8) - bodyRot * 0.8;
  const skirtRot = wave(loopMs, 6_000, 0.6, 1.5) + bodyRot * 0.2;

  const groups: Record<RigGroupId, Transform2D> = {
    bodyRoot: {
      ...identityTransform(),
      rotationDeg: bodyRot,
      y: -2 * (breath / 1.2),
      scaleY: 1 + 0.006 * (breath / 1.2),
    },
    headGroup: { ...identityTransform(), rotationDeg: headRot },
    backHairGroup: { ...identityTransform(), rotationDeg: backHairRot },
    frontHairGroup: { ...identityTransform(), rotationDeg: frontHairRot },
    legGroup: { ...identityTransform(), rotationDeg: legRot },
    armGroupL: { ...identityTransform(), rotationDeg: armLRot },
    armGroupR: { ...identityTransform(), rotationDeg: armRRot },
    outfitGroup: { ...identityTransform(), rotationDeg: skirtRot },
    faceGroup: identityTransform(),
  };

  const slots: Record<number, number> = {};
  for (let z = 1; z <= 20; z += 1) slots[z] = 0;
  slots[1] = wave(loopMs, 6_000, 0.2, 1.5);
  slots[2] = wave(loopMs, 6_000, 0.5, 1.5);
  slots[3] = wave(loopMs, 4_000, 0.3, 0.6);
  slots[4] = wave(loopMs, 4_000, 0.6, 0.6);
  slots[11] = wave(loopMs, 6_000, 0.6, 1.2);
  slots[12] = wave(loopMs, 6_000, 0.9, 1.2);
  slots[17] = wave(loopMs, 6_000, 0.7, 2.0);
  slots[18] = wave(loopMs, 6_000, 1.0, 2.0);
  slots[19] = wave(loopMs, 6_000, 1.3, 2.0);
  slots[20] = wave(loopMs, 6_000, 1.6, 2.0);

  return {
    timeMs,
    loopMs,
    groups,
    slots,
    underlayAlpha: motionEnergy(groups) * 0.45,
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

export function applyReaction(
  frame: RigFrame,
  reaction: ReactionState,
): RigFrame {
  const groups = {} as Record<RigGroupId, Transform2D>;
  for (const id of Object.keys(frame.groups) as RigGroupId[]) {
    groups[id] = { ...frame.groups[id] };
  }
  groups.bodyRoot.rotationDeg += reaction.body * 0.35;
  groups.bodyRoot.y -= reaction.body * 0.5;
  groups.headGroup.rotationDeg += reaction.head;
  groups.backHairGroup.rotationDeg += reaction.hair * 0.5;
  groups.frontHairGroup.rotationDeg += reaction.hair * 0.3;
  groups.armGroupL.rotationDeg += reaction.armL;
  groups.armGroupR.rotationDeg += reaction.armR;
  groups.legGroup.rotationDeg -= reaction.body * 0.2;

  const slots = { ...frame.slots };
  slots[17] = (slots[17] ?? 0) + reaction.hair * 0.25;
  slots[18] = (slots[18] ?? 0) - reaction.hair * 0.25;
  slots[19] = (slots[19] ?? 0) + reaction.hair * 0.2;
  slots[20] = (slots[20] ?? 0) - reaction.hair * 0.2;

  return {
    ...frame,
    groups,
    slots,
    underlayAlpha: Math.min(
      0.55,
      frame.underlayAlpha + reactionEnergy(reaction) * 0.25,
    ),
  };
}
