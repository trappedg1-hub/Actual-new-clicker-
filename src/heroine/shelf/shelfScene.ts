import type { HeroineTouchZone } from "../../domain/economy/types.ts";

/** Native pixel grid of the shelf-reach heroine cutout (webp with alpha). */
export const SHELF_ART_W = 657;
export const SHELF_ART_H = 1242;

/**
 * Placement of the heroine inside the `room-shelf.webp` backdrop grid
 * (1152x2048): the approved scene mock puts her figure in the box
 * (602, 649, 606x1146) — feet planted on the floor boards in front of the
 * baked-in bookshelf, raised hand gripping the top shelf edge.
 */
export const SHELF_ROOM = {
  /** Backdrop art size the placement refers to. */
  roomW: 1152,
  roomH: 2048,
  /** Bottom-center anchor of the figure in backdrop pixels (shoe tips). */
  footCenterX: 602 + 606 / 2,
  footY: 649 + 1146,
  /** Display height of the figure in backdrop pixels. */
  displayH: 1146,
} as const;

/** Figure scale in backdrop pixels per cutout pixel. */
export const SHELF_ROOM_ART_SCALE = SHELF_ROOM.displayH / SHELF_ART_H;

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

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
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

/** Touch zones of the shelf scene, named by what the player actually taps. */
export type ShelfTouchZone = "head" | "hair" | "thighs" | "feet";

/** Reward mapping into the existing economy zones (no balance changes). */
export const SHELF_ZONE_ECONOMY: Record<ShelfTouchZone, HeroineTouchZone> = {
  head: "head",
  hair: "hair",
  thighs: "body",
  feet: "arms",
};
