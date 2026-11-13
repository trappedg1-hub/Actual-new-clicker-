import type { HeroineTouchZone } from "../../domain/economy/types.ts";

/** Native pixel grid of the shelf-reach heroine cutout (webp with alpha). */
export const SHELF_ART_W = 643;
export const SHELF_ART_H = 1236;

/**
 * Placement of the heroine inside the `room-shelf.webp` backdrop grid
 * (1152x2048): the backdrop is the previously unseen corner wall of the
 * approved room with the tall bookshelf, floor lamp and framed picture.
 * She stands on the empty floor in front of the shelf, raised hand with
 * all five fingers reaching just under the top shelf lip.
 */
export const SHELF_ROOM = {
  /** Backdrop art size the placement refers to. */
  roomW: 1152,
  roomH: 2048,
  /**
   * Bottom-center anchor of the figure in backdrop pixels (shoe tips).
   * She stands a single step from the shelf base (y 1395), body centered
   * on the shelf face, so the raised hand lands ON the boxes of the top
   * shelf (fingertips ~x528/y493) instead of reaching diagonally across
   * the room — the natural "about to grab it" posture.
   */
  footCenterX: 700,
  footY: 1560,
  /** Display height of the figure in backdrop pixels. */
  displayH: 1080,
} as const;

/** Figure scale in backdrop pixels per cutout pixel. */
export const SHELF_ROOM_ART_SCALE = SHELF_ROOM.displayH / SHELF_ART_H;

/**
 * Feathered patch plates cut from the pose variants, positioned on the
 * cutout pixel grid (same stable-plate-plus-overlay rule as the bed
 * scene: the base plate never swaps, overlays fade above it).
 */
export const SHELF_PATCHES = {
  /** Closed eyelid for the auto-blink. */
  blink: { x: 251, y: 96 },
  /** Embarrassed cheek flush; sits UNDER the blink plate at the eye. */
  blush: { x: 224, y: 84 },
  /** The near stocking rolled down into a soft ring above the knee. */
  stocking: { x: 215, y: 624 },
} as const;

/**
 * Ambient motion constants: she balances on tiptoe, so the whole plate
 * gently bobs (vertical scale around the planted shoe tips) and sways
 * (skew around the same bottom pivot).  Transform-only animation of one
 * stable plate — nothing shears against anything.
 */
export const SHELF_MOTION = {
  breathPeriodMs: 4_000,
  breathScale: 0.004,
  bobPeriodMs: 2_600,
  bobScale: 0.0028,
  swayPeriodMs: 5_200,
  swaySkew: 0.0042,
  /** Damped-bounce tap reaction: she dips and springs back on her toes. */
  pulseMs: 640,
  pulseScale: 0.011,
} as const;

/** Attack/hold/release envelope of one overlay reaction, alpha 0..1. */
export interface ShelfEnvelope {
  attackMs: number;
  holdMs: number;
  releaseMs: number;
}

export const SHELF_BLUSH_ENVELOPE: ShelfEnvelope = {
  attackMs: 180,
  holdMs: 900,
  releaseMs: 1_400,
};

/**
 * The stocking rolls down slowly (attack), stays slipped for a moment,
 * then eases back as she discreetly fixes it (release).
 */
export const SHELF_STOCKING_ENVELOPE: ShelfEnvelope = {
  attackMs: 420,
  holdMs: 2_600,
  releaseMs: 700,
};

/**
 * Ambient stocking-slip window: once per long cycle the stocking slips
 * on its own, no tap needed — plus it always slips on a thigh tap.
 */
export const SHELF_STOCKING_AMBIENT = {
  periodMs: 19_000,
  startMs: 11_000,
} as const;

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Envelope value at `ageMs` since the trigger, 0..1. */
export function shelfEnvelopeAt(ageMs: number, env: ShelfEnvelope): number {
  if (ageMs < 0) return 0;
  if (ageMs < env.attackMs) return smoothstep(ageMs / env.attackMs);
  const afterAttack = ageMs - env.attackMs;
  if (afterAttack < env.holdMs) return 1;
  const afterHold = afterAttack - env.holdMs;
  if (afterHold < env.releaseMs)
    return 1 - smoothstep(afterHold / env.releaseMs);
  return 0;
}

/**
 * Damped dip-then-rise pulse of one tap reaction, range about ±1 and
 * exactly zero outside [0, pulseMs) — idle frames never jitter.
 */
export function shelfPulseAt(ageMs: number): number {
  if (ageMs < 0 || ageMs >= SHELF_MOTION.pulseMs) return 0;
  const t = ageMs / SHELF_MOTION.pulseMs;
  return -Math.sin(2 * Math.PI * t) * (1 - smoothstep(t));
}

/** Ambient stocking weight inside the long cycle at loop time `timeMs`. */
export function shelfAmbientStockingAt(timeMs: number): number {
  const loopT = timeMs % SHELF_STOCKING_AMBIENT.periodMs;
  return shelfEnvelopeAt(
    loopT - SHELF_STOCKING_AMBIENT.startMs,
    SHELF_STOCKING_ENVELOPE,
  );
}

/** Touch zones of the shelf scene, named by what the player actually taps. */
export type ShelfTouchZone = "head" | "hair" | "thighs" | "feet";

/** Reward mapping into the existing economy zones (no balance changes). */
export const SHELF_ZONE_ECONOMY: Record<ShelfTouchZone, HeroineTouchZone> = {
  head: "head",
  hair: "hair",
  thighs: "body",
  feet: "arms",
};
