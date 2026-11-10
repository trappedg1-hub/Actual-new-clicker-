import { Ticker } from "pixi.js";
import type { Container } from "pixi.js";

/**
 * Frame-loop and layout helpers extracted from `bootstrap` / `MainScene` so the fixes
 * for the QA-found defects can be covered by regression tests.
 *
 * Behaviour is unchanged: every function here is a verbatim move of code that used to
 * live inline in the browser-only modules, which Node tests cannot import.
 */

/**
 * Raw wall-clock milliseconds for one frame.
 *
 * `ticker.deltaMS` is capped by `Ticker._maxElapsedMS` (100 ms by default), so a slow
 * phone lost most of its passive income. `ticker.elapsedMS` is the uncapped value.
 */
export function frameElapsedMs(ticker: Ticker): number {
  return ticker.elapsedMS;
}

export interface FrameAdvance {
  /** Milliseconds of game time to consume, or 0 when the frame must be skipped. */
  elapsedMs: number;
  /** Timestamp the caller should treat as "now" for this frame. */
  nowMs: number;
  /** True when the frame is a no-op (paused, backgrounded or a non-advancing clock). */
  skipped: boolean;
}

/**
 * Decides how much game time a frame contributes.
 *
 * `MainScene.update()` ignores non-positive and non-finite deltas, so the frame loop has
 * to carry the clock forward anyway. Otherwise a stopped ticker (background) followed by
 * a resume would replay the whole hidden period on top of the offline catch-up.
 */
export function advanceFrame(
  ticker: Ticker,
  previousNowMs: number,
  paused: boolean,
): FrameAdvance {
  const raw = frameElapsedMs(ticker);
  const valid = Number.isFinite(raw) && raw > 0;
  const nowMs =
    Number.isFinite(previousNowMs) && Number.isFinite(raw)
      ? previousNowMs + raw
      : previousNowMs;

  if (paused || !valid) {
    return { elapsedMs: 0, nowMs, skipped: true };
  }
  return { elapsedMs: raw, nowMs, skipped: false };
}

/** Minimal renderer contract used by the resize helper. */
export interface ResizeableRenderer {
  resize(width: number, height: number): void;
}

export interface ResizeTarget {
  /** PixiJS `Application` exposing both the renderer and the current screen size. */
  renderer: ResizeableRenderer;
  screen: { width: number; height: number };
}

export interface ResizableScene {
  resize(width: number, height: number): void;
}

/**
 * Keeps the canvas and the scene layout in sync with the host element.
 *
 * The renderer must be resized first: `scene.resize()` lays out UI against
 * `app.screen`, so if the canvas keeps the old size the bottom UI slides under the
 * home indicator on devices with a safe area.
 */
export function resizeRendererAndScene(
  app: ResizeTarget,
  scene: ResizableScene,
): void {
  app.renderer.resize(app.screen.width, app.screen.height);
  scene.resize(app.screen.width, app.screen.height);
}

/**
 * Labels of the rig layers that `startIdlePose` requires.
 *
 * `LayeredHeroineRig` looked these up by short names ("eyes"), but the placeholder
 * layers are labelled "eyes placeholder layer". The lookup returned `null` and the
 * whole rig constructor threw, leaving a blank screen.
 */
export const HEROINE_LAYER_LABELS = {
  eyes: "eyes placeholder layer",
  eyelids: "eyelids placeholder layer",
  mouth: "mouth placeholder layer",
} as const;

export type HeroineLayerName = keyof typeof HEROINE_LAYER_LABELS;

/** Finds a rig layer by its real label, failing loudly instead of returning null. */
export function findRigLayer(
  head: Container,
  layer: HeroineLayerName,
): Container {
  const label = HEROINE_LAYER_LABELS[layer];
  const found = head.getChildByLabel(label);
  if (!found) {
    throw new Error(`LayeredHeroineRig is missing the "${label}" layer.`);
  }
  return found as Container;
}

/** Builds a detached ticker so frame-loop maths can be exercised outside a browser. */
export function createTestTicker(): Ticker {
  const ticker = new Ticker();
  ticker.autoStart = false;
  return ticker;
}
