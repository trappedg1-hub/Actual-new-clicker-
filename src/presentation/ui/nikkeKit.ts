import { Graphics } from "pixi.js";

/**
 * The one UI font of the game: Nunito (bundled via @fontsource, full
 * Cyrillic) — a rounded premium face that matches the kawaii art.
 * Arial stays as the metric-compatible fallback while woff2 loads.
 */
export const UI_FONT = "Nunito, Arial, sans-serif";

/**
 * Hand-drawn NIKKE-style UI kit: angular glass plates with chamfered
 * (diagonally cut) corners, thin luminous edges, accent strips and
 * tech ticks — everything is vector-drawn so it stays razor sharp at
 * any DPR, and the glass alpha keeps the scene visible underneath.
 */

export interface ChamferOptions {
  /** Which corners get the 45° cut. */
  cutTL?: number;
  cutTR?: number;
  cutBL?: number;
  cutBR?: number;
  fill: number;
  fillAlpha?: number;
  stroke?: number;
  strokeAlpha?: number;
  /** Bright accent strip along one edge. */
  accent?: number;
  accentSide?: "left" | "right" | "top" | "bottom";
  accentAlpha?: number;
}

/** Polygon points of a chamfered rectangle at (0,0). */
export function chamferPoints(
  w: number,
  h: number,
  o: { cutTL?: number; cutTR?: number; cutBL?: number; cutBR?: number },
): { x: number; y: number }[] {
  const tl = o.cutTL ?? 0;
  const tr = o.cutTR ?? 0;
  const bl = o.cutBL ?? 0;
  const br = o.cutBR ?? 0;
  const pts: { x: number; y: number }[] = [];
  pts.push({ x: tl, y: 0 });
  pts.push({ x: w - tr, y: 0 });
  if (tr > 0) pts.push({ x: w, y: tr });
  pts.push({ x: w, y: h - br });
  if (br > 0) pts.push({ x: w - br, y: h });
  pts.push({ x: bl, y: h });
  if (bl > 0) pts.push({ x: 0, y: h - bl });
  pts.push({ x: 0, y: tl });
  return pts;
}

/** Draws one angular glass plate into `g` at (x, y). */
export function drawChamferPlate(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  o: ChamferOptions,
): void {
  const pts = chamferPoints(w, h, o).map((p) => ({
    x: p.x + x,
    y: p.y + y,
  }));
  g.poly(pts).fill({ color: o.fill, alpha: o.fillAlpha ?? 0.55 });
  if (o.stroke !== undefined) {
    g.poly(pts).stroke({
      color: o.stroke,
      alpha: o.strokeAlpha ?? 0.6,
      width: 1,
    });
  }
  if (o.accent !== undefined) {
    const a = { color: o.accent, alpha: o.accentAlpha ?? 0.95 };
    const side = o.accentSide ?? "left";
    if (side === "left") {
      g.roundRect(x + 2, y + 6, 3, h - 12, 1.5).fill(a);
    } else if (side === "right") {
      g.roundRect(x + w - 5, y + 6, 3, h - 12, 1.5).fill(a);
    } else if (side === "top") {
      g.roundRect(x + 8, y + 2, w - 16, 2, 1).fill(a);
    } else {
      g.roundRect(x + 8, y + h - 4, w - 16, 2, 1).fill(a);
    }
  }
}

/** Slanted progress bar (parallelogram), NIKKE-style. */
export function drawSlantProgress(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  progress: number,
  colors: { track: number; fill: number; glow?: number },
): void {
  const s = h; // slant amount equals the bar height (45°)
  const p = Math.max(0, Math.min(1, progress));
  const track = [
    { x: x + s, y },
    { x: x + w, y },
    { x: x + w - s, y: y + h },
    { x, y: y + h },
  ];
  g.poly(track).fill({ color: colors.track, alpha: 0.6 });
  if (p > 0.01) {
    const fw = Math.max(s + 1, w * p);
    g.poly([
      { x: x + s, y },
      { x: x + fw, y },
      { x: x + fw - s, y: y + h },
      { x, y: y + h },
    ]).fill({ color: colors.fill, alpha: 0.95 });
    if (colors.glow !== undefined) {
      g.poly([
        { x: x + s, y },
        { x: x + fw, y },
        { x: x + fw - s, y: y + h },
        { x, y: y + h },
      ]).stroke({ color: colors.glow, alpha: 0.35, width: 2 });
    }
  }
}

/** Small vector heart (for the affection counter). */
export function drawHeartIcon(
  g: Graphics,
  cx: number,
  cy: number,
  size: number,
  color: number,
): void {
  const r = size * 0.3;
  g.circle(cx - r, cy - r * 0.6, r).fill({ color, alpha: 1 });
  g.circle(cx + r, cy - r * 0.6, r).fill({ color, alpha: 1 });
  g.poly([
    { x: cx - r * 1.94, y: cy - r * 0.35 },
    { x: cx + r * 1.94, y: cy - r * 0.35 },
    { x: cx, y: cy + size * 0.52 },
  ]).fill({ color, alpha: 1 });
}

/** Small vector coin (for the money counter). */
export function drawCoinIcon(
  g: Graphics,
  cx: number,
  cy: number,
  r: number,
  color: number,
): void {
  g.circle(cx, cy, r).fill({ color, alpha: 1 });
  g.circle(cx, cy, r * 0.62).stroke({
    color: 0x5c431a,
    alpha: 0.85,
    width: 1.2,
  });
}

/** Tiny tech ticks — the decorative dashes NIKKE puts near edges. */
export function drawTechTicks(
  g: Graphics,
  x: number,
  y: number,
  count: number,
  color: number,
): void {
  for (let index = 0; index < count; index += 1) {
    g.rect(x + index * 7, y, 4, 2).fill({ color, alpha: 0.5 });
  }
}
