import type { HeroineTouchZone } from "../../domain/economy/types.ts";

/** Native pixel grid of the standing heroine cutout (webp with alpha). */
export const STANDING_ART_W = 848;
export const STANDING_ART_H = 1264;

/**
 * Placement of the heroine inside the `room-standing.webp` backdrop grid
 * (1152x2048): she stands on the open floor between the desk and the
 * bed, facing the player, hands clasped behind her back, stocking feet
 * planted on the boards in front of the bed corner.
 */
export const STANDING_ROOM = {
  /** Backdrop art size the placement refers to. */
  roomW: 1152,
  roomH: 2048,
  /** Bottom-center anchor of the figure in backdrop pixels (her feet). */
  footCenterX: 560,
  footY: 1930,
  /** Display height of the figure in backdrop pixels. */
  displayH: 1500,
} as const;

/** Figure scale in backdrop pixels per cutout pixel. */
export const STANDING_ROOM_ART_SCALE = STANDING_ROOM.displayH / STANDING_ART_H;

/**
 * Standing-scene camera: cover-fits the room art to the WHOLE game
 * screen (no side bars); the horizontal crop window is centered on the
 * figure and clamped to the art bounds, and her feet anchor just above
 * the bottom dock so the full figure is in frame on portrait phones.
 */
export const STANDING_CAMERA = {
  /** Extra zoom multiplied over the full-screen cover scale. */
  zoom: 1.0,
  /** Horizontal focus point in backdrop pixels (the figure). */
  focusX: 560,
  /** Screen-bottom margin under her feet, portrait / landscape. */
  footMarginPortrait: 86,
  footMarginLandscape: 40,
} as const;

/**
 * Feathered face plates cut from the aligned pose variants, all sharing
 * ONE window on the cutout pixel grid (stable-plate-plus-overlay rule:
 * the base plate never swaps, overlays fade above it).
 */
export const STANDING_PATCHES = {
  /** Shared face window of blush / glance / wink plates. */
  face: { x: 312, y: 92 },
  /** Tight eyes-only window of the blink plate, so closed lids never
   * wipe the mood plate's cheeks mid-blink. */
  eyes: { x: 318, y: 146 },
  /** Relationship mood plates (tsundere / lovestruck), one window. */
  mood: { x: 310, y: 70 },
} as const;

/**
 * Soft contact shadows under her feet (cutout pixel grid, anchored at
 * the shadow center).  The warm lamp glows at the bed side, so the pool
 * is biased slightly left.
 */
export const STANDING_SHADOWS: readonly {
  x: number;
  y: number;
  w: number;
  h: number;
  alpha: number;
}[] = [
  /** Broad faint pool under both stocking feet. */
  { x: 448, y: 1238, w: 420, h: 96, alpha: 0.5 },
  /** Tighter core right under the soles. */
  { x: 450, y: 1246, w: 250, h: 58, alpha: 0.85 },
] as const;

/**
 * Ambient motion constants: she stands at ease, so the plate breathes
 * gently around the planted feet and sways a touch; the visible life
 * comes from the face overlays — auto-blink, the shy side-glance she
 * drifts into when watched, the blush and the flirty wink.
 */
export const STANDING_MOTION = {
  breathPeriodMs: 3_800,
  breathScale: 0.004,
  swayPeriodMs: 7_400,
  swaySkew: 0.004,
  /** Damped squash of one tap reaction. */
  pulseMs: 620,
  pulseScale: 0.01,
} as const;

/** Attack/hold/release envelope of one overlay reaction, alpha 0..1. */
export interface StandingEnvelope {
  attackMs: number;
  holdMs: number;
  releaseMs: number;
}

export const STANDING_BLUSH_ENVELOPE: StandingEnvelope = {
  attackMs: 180,
  holdMs: 950,
  releaseMs: 1_400,
};

/** Shy side-glance: slow drift away, a beat, drift back to the player. */
export const STANDING_GLANCE_ENVELOPE: StandingEnvelope = {
  attackMs: 420,
  holdMs: 1_700,
  releaseMs: 620,
};

/** Flirty wink: quick snap, a beat of the open smile, ease out. */
export const STANDING_WINK_ENVELOPE: StandingEnvelope = {
  attackMs: 120,
  holdMs: 1_300,
  releaseMs: 320,
};

/** Ambient shy glance: she drifts aside on a long watched-you rhythm. */
export const STANDING_GLANCE_AMBIENT = {
  periodMs: 17_000,
  startMs: 9_000,
} as const;

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Envelope value at `ageMs` since the trigger, 0..1. */
export function standingEnvelopeAt(
  ageMs: number,
  env: StandingEnvelope,
): number {
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
 * Damped squash pulse of one tap reaction, range about ±1 and exactly
 * zero outside [0, pulseMs) — idle frames never jitter.
 */
export function standingPulseAt(ageMs: number): number {
  if (ageMs < 0 || ageMs >= STANDING_MOTION.pulseMs) return 0;
  const t = ageMs / STANDING_MOTION.pulseMs;
  return -Math.sin(2 * Math.PI * t) * (1 - smoothstep(t));
}

/** Ambient shy-glance weight inside the long cycle at loop time `timeMs`. */
export function standingAmbientGlanceAt(timeMs: number): number {
  const loopT = timeMs % STANDING_GLANCE_AMBIENT.periodMs;
  return standingEnvelopeAt(
    loopT - STANDING_GLANCE_AMBIENT.startMs,
    STANDING_GLANCE_ENVELOPE,
  );
}

/** Touch zones of the standing scene, named by what the player taps. */
export type StandingTouchZone =
  "head" | "hair" | "body" | "belly" | "thighs" | "legs";

/** Reward mapping into the existing economy zones (no balance changes). */
export const STANDING_ZONE_ECONOMY: Record<
  StandingTouchZone,
  HeroineTouchZone
> = {
  head: "head",
  hair: "hair",
  body: "body",
  belly: "body",
  thighs: "body",
  legs: "arms",
};
