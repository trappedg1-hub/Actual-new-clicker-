import type { HeroineTouchZone } from "../../domain/economy/types.ts";

/** Native pixel grid of the carpet-reading heroine cutout (webp with alpha). */
export const CARPET_ART_W = 813;
export const CARPET_ART_H = 1006;

/**
 * Placement of the heroine inside the `room-floor.webp` backdrop grid
 * (848x1508): the backdrop is the open wooden floor at the foot of the
 * bed, seen from slightly above — desk and office chair top-left, the
 * bed with the white duvet on the right, poster and warm lamp at the
 * top.  She lies on her stomach along the boards with the book toward
 * the desk and her raised crossed feet toward the bed.
 */
export const CARPET_ROOM = {
  /** Backdrop art size the placement refers to. */
  roomW: 848,
  roomH: 1508,
  /** Center anchor of the figure in backdrop pixels. */
  centerX: 410,
  centerY: 840,
  /**
   * Display width of the figure in backdrop pixels.  The carpet backdrop
   * COVER-fits the whole game screen (no side bars), which zooms the
   * room: on a 390x844 portrait screen only a ~697px-wide window of the
   * 848px art is visible.  620px keeps the figure fully inside that
   * window (with margins) while her on-screen size stays the same as
   * the old contain-fit placement.
   */
  displayW: 620,
} as const;

/** Figure scale in backdrop pixels per cutout pixel. */
export const CARPET_ROOM_ART_SCALE = CARPET_ROOM.displayW / CARPET_ART_W;

/**
 * Feathered patch plates cut from the pose variants, positioned on the
 * cutout pixel grid (stable-plate-plus-overlay rule: the base plate
 * never swaps, overlays fade above it).
 */
export const CARPET_PATCHES = {
  /** Closed eyelids for the auto-blink (she looks AT the player). */
  blink: { x: 156, y: 115 },
  /** Deep embarrassed flush with the flustered open smile. */
  blush: { x: 170, y: 119 },
  /**
   * Raised crossed shins window.  Unlike the other overlays this is a
   * SWAP region: the base plate has a hard hole here and two full
   * frames (A = base shins, B = leaned-back shins) cross-exchange
   * alphas — so exactly one crisp frame shows at any moment and the
   * vacated base shins can never ghost through.  Frame B's 8px border
   * band is blended into frame A pixels, so the hole edge is seamless
   * in both frames.
   */
  legs: { x: 540, y: 233 },
  /** The rolled stocking ring slid further down the bare calf. */
  stocking: { x: 523, y: 707 },
  /** One paper page caught mid-turn, curling above the open book. */
  page: { x: 38, y: 152 },
} as const;

/**
 * Soft contact shadows under the body (cutout pixel grid, anchored at
 * the shadow center).  Without them the lying figure reads as floating
 * above the floor boards; the warm lamp glows at the top of the room,
 * so every shadow is biased slightly down-left.
 */
export const CARPET_SHADOWS: readonly {
  x: number;
  y: number;
  w: number;
  h: number;
  alpha: number;
}[] = [
  /** Broad faint pool under the torso, hips and skirt. */
  { x: 350, y: 800, w: 560, h: 130, alpha: 0.42 },
  /** Under the open book and her reading forearms. */
  { x: 115, y: 475, w: 270, h: 72, alpha: 0.5 },
  /** Under the long bare thigh resting on the boards. */
  { x: 490, y: 985, w: 390, h: 92, alpha: 0.58 },
] as const;

/**
 * Ambient motion constants: she lies on her stomach propped on her
 * forearms, so the whole plate only breathes very gently (scale pulse
 * around the center) — the visible life comes from the overlay cycles:
 * the page flip, blinking at the player, the slipping stocking.  The
 * crossed shins stay static and only twitch once on a legs tap.
 */
export const CARPET_MOTION = {
  breathPeriodMs: 4_000,
  breathScale: 0.0035,
  /** Damped squash of one tap reaction (she presses into the floor). */
  pulseMs: 640,
  pulseScale: 0.009,
} as const;

/** Attack/hold/release envelope of one overlay reaction, alpha 0..1. */
export interface CarpetEnvelope {
  attackMs: number;
  holdMs: number;
  releaseMs: number;
}

export const CARPET_BLUSH_ENVELOPE: CarpetEnvelope = {
  attackMs: 180,
  holdMs: 900,
  releaseMs: 1_400,
};

/**
 * The rolled stocking ring slides further down slowly (attack), rests
 * there for a moment, then eases back as she wiggles it up (release).
 */
export const CARPET_STOCKING_ENVELOPE: CarpetEnvelope = {
  attackMs: 420,
  holdMs: 2_600,
  releaseMs: 700,
};

/** Quick page flip: snap up, a short hold, drop back down. */
export const CARPET_PAGE_ENVELOPE: CarpetEnvelope = {
  attackMs: 160,
  holdMs: 420,
  releaseMs: 240,
};

/**
 * One quick kick of the crossed shins when the player taps her legs:
 * the shins are otherwise STATIC (no ambient loop — a permanent swap
 * cycle read as doubling), they just twitch back once and settle.
 */
export const CARPET_KICK_ENVELOPE: CarpetEnvelope = {
  attackMs: 110,
  holdMs: 90,
  releaseMs: 180,
};

/**
 * Ambient overlay cycles: the stocking slips on its own once per long
 * cycle (plus always on a thigh tap) and she turns a page on a steady
 * reading rhythm.
 */
export const CARPET_STOCKING_AMBIENT = {
  periodMs: 21_000,
  startMs: 13_000,
} as const;

export const CARPET_PAGE_AMBIENT = {
  periodMs: 15_000,
  startMs: 6_000,
} as const;

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** Envelope value at `ageMs` since the trigger, 0..1. */
export function carpetEnvelopeAt(ageMs: number, env: CarpetEnvelope): number {
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
export function carpetPulseAt(ageMs: number): number {
  if (ageMs < 0 || ageMs >= CARPET_MOTION.pulseMs) return 0;
  const t = ageMs / CARPET_MOTION.pulseMs;
  return -Math.sin(2 * Math.PI * t) * (1 - smoothstep(t));
}

/**
 * Weight of the leaned-back shins frame `ageMs` after a legs tap: zero
 * at rest (frame A fully visible, perfectly static), one quick twitch
 * back and settle.  Exactly zero outside the envelope — idle frames
 * never mix, so the shins can never read as doubled.
 */
export function carpetKickAt(ageMs: number): number {
  return carpetEnvelopeAt(ageMs, CARPET_KICK_ENVELOPE);
}

/** Ambient stocking weight inside the long cycle at loop time `timeMs`. */
export function carpetAmbientStockingAt(timeMs: number): number {
  const loopT = timeMs % CARPET_STOCKING_AMBIENT.periodMs;
  return carpetEnvelopeAt(
    loopT - CARPET_STOCKING_AMBIENT.startMs,
    CARPET_STOCKING_ENVELOPE,
  );
}

/** Ambient page-flip weight inside the reading rhythm at `timeMs`. */
export function carpetAmbientPageAt(timeMs: number): number {
  const loopT = timeMs % CARPET_PAGE_AMBIENT.periodMs;
  return carpetEnvelopeAt(
    loopT - CARPET_PAGE_AMBIENT.startMs,
    CARPET_PAGE_ENVELOPE,
  );
}

/** Touch zones of the carpet scene, named by what the player actually taps. */
export type CarpetTouchZone = "head" | "hair" | "thighs" | "legs";

/** Reward mapping into the existing economy zones (no balance changes). */
export const CARPET_ZONE_ECONOMY: Record<CarpetTouchZone, HeroineTouchZone> = {
  head: "head",
  hair: "hair",
  thighs: "body",
  legs: "arms",
};
