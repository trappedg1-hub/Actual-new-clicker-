import {
  Assets,
  Container,
  Graphics,
  Mesh,
  MeshGeometry,
  Sprite,
  Texture,
} from "pixi.js";
import bedBlinkPatchUrl from "../../assets/environment/bed-blink-patch.png?url";
import bedBlushUrl from "../../assets/environment/bed-blush.png?url";
import bedMouthOpenUrl from "../../assets/environment/bed-mouth-open.png?url";
import bedToesCurledUrl from "../../assets/environment/bed-toes-curled.png?url";
import lyingHeroineUrl from "../../assets/environment/lying-heroine.webp?url";
import type { HeroineTouchZone } from "../../domain/economy/types.ts";
import { blinkOverlayAt, RIG_LOOP_MS } from "../rig/animationMath.ts";

/** Native pixel grid of the lying-pose web asset. */
const ART_W = 1152;
const ART_H = 1330;

/** Feathered patch plates cut from the approved art, same pixel grid. */
const BLINK_PATCH = { x: 597, y: 140 } as const;
const BLUSH_PATCH = { x: 600, y: 161 } as const;
const MOUTH_PATCH = { x: 659, y: 228 } as const;
const TOES_PATCH = { x: 15, y: 758 } as const;

/**
 * Lying-pose breathing field: zero at and outside [topY, bottomY] so the
 * face patches (which end at art row 287) and the toes patch (which starts
 * at art row 758) never move relative to the art under them.
 */
const BED_BREATH = {
  topY: 430,
  peakY: 560,
  bottomY: 750,
  /** Peak vertical lift of the chest/belly band in art pixels. */
  liftPx: 6,
  /** Breath cycle length, same as the standing rig. */
  periodMs: 4_000,
} as const;

/** Row list of the breathing mesh: dense inside the band, bounds pinned. */
const BED_MESH_ROWS: readonly number[] = (() => {
  const rows = [0, BED_BREATH.topY];
  for (let y = BED_BREATH.topY + 16; y < BED_BREATH.bottomY; y += 16) {
    rows.push(y);
  }
  rows.push(BED_BREATH.bottomY, ART_H);
  return rows;
})();

/**
 * Column list and weights: the field is also zero OUTSIDE her torso
 * horizontally (art columns ~430-880), so the bed sheets around her do not
 * breathe with her — only the chest/belly of the figure itself lifts.
 * Linear interpolation between columns gives the smooth falloff.
 */
const BED_MESH_COLS: readonly number[] = [0, 430, 520, 650, 780, 880, ART_W];
const BED_COL_WEIGHTS: readonly number[] = [0, 0, 1, 1, 1, 0, 0];

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

function bedBreathWeight(y: number): number {
  if (y <= BED_BREATH.topY || y >= BED_BREATH.bottomY) return 0;
  if (y < BED_BREATH.peakY) {
    return smoothstep(
      (y - BED_BREATH.topY) / (BED_BREATH.peakY - BED_BREATH.topY),
    );
  }
  return smoothstep(
    (BED_BREATH.bottomY - y) / (BED_BREATH.bottomY - BED_BREATH.peakY),
  );
}

/** Attack/hold/release envelope of one tap reaction, alpha 0..1. */
interface ReactionEnvelope {
  attackMs: number;
  holdMs: number;
  releaseMs: number;
}

function envelopeAt(ageMs: number, env: ReactionEnvelope): number {
  if (ageMs < 0) return 0;
  if (ageMs < env.attackMs) return smoothstep(ageMs / env.attackMs);
  const afterAttack = ageMs - env.attackMs;
  if (afterAttack < env.holdMs) return 1;
  const afterHold = afterAttack - env.holdMs;
  if (afterHold < env.releaseMs)
    return 1 - smoothstep(afterHold / env.releaseMs);
  return 0;
}

const TOES_ENVELOPE: ReactionEnvelope = {
  attackMs: 110,
  holdMs: 420,
  releaseMs: 320,
};
const BLUSH_ENVELOPE: ReactionEnvelope = {
  attackMs: 180,
  holdMs: 900,
  releaseMs: 1_400,
};
const MOUTH_TAP_ENVELOPE: ReactionEnvelope = {
  attackMs: 140,
  holdMs: 700,
  releaseMs: 450,
};

/** Ambient open-mouth window inside the shared 12s loop (smile cycle). */
const MOUTH_AMBIENT = {
  startMs: 5_200,
  attackMs: 260,
  holdMs: 1_300,
  releaseMs: 400,
} as const;

/** Touch zones of the bed scene, named by what the player actually taps. */
export type BedTouchZone = "head" | "belly" | "legs" | "feet";

/** Reward mapping into the existing economy zones (no balance changes). */
export const BED_ZONE_ECONOMY: Record<BedTouchZone, HeroineTouchZone> = {
  head: "head",
  belly: "body",
  legs: "hair",
  feet: "arms",
};

interface BedHitShape {
  zone: BedTouchZone;
  draw: (g: Graphics) => void;
}

/**
 * BLOCK D bed scene: the approved lying-pose composite shown at full width
 * with the auto-blink rendered as a feathered closed-eyes patch cross-fading
 * above the open-eyes art — the same stable-plate-plus-overlay approach the
 * production rig uses (a swap of the whole plate falls between rendered
 * frames on mobile Safari; an overlay above a stable base never does).
 *
 * Step 3c adds, with the same stable-plate-plus-overlay rule:
 * - breathing: the art itself is a row mesh; a vertical field pinned to zero
 *   outside the chest/belly band lifts her chest the way the standing torso
 *   band breathes (no patch sits inside the band, so overlays never shear);
 * - tap reactions: toes curl on feet taps, blush on head/belly/legs taps;
 * - mouth emotions: an ambient open-mouth window inside the shared 12s loop
 *   plus an extra open-mouth pulse when her head is tapped.
 */
export class BedHeroine extends Container {
  private readonly artGeometry: MeshGeometry;
  private readonly artPositions: Float32Array;
  private readonly art: Mesh;
  private readonly blinkPatch = new Sprite(Texture.EMPTY);
  private readonly blushPatch = new Sprite(Texture.EMPTY);
  private readonly mouthPatch = new Sprite(Texture.EMPTY);
  private readonly toesPatch = new Sprite(Texture.EMPTY);
  private readonly hitLayer = new Container();
  private readonly onTap: (
    zone: BedTouchZone,
    globalX: number,
    globalY: number,
  ) => void;
  private timeMs = 0;
  private loaded = false;
  private toesPulseAt = Number.NEGATIVE_INFINITY;
  private blushPulseAt = Number.NEGATIVE_INFINITY;
  private mouthPulseAt = Number.NEGATIVE_INFINITY;

  constructor(
    onTap: (zone: BedTouchZone, globalX: number, globalY: number) => void,
  ) {
    super();
    this.label = "HEROINE-01 bed scene";
    this.onTap = onTap;

    const rows = BED_MESH_ROWS;
    const cols = BED_MESH_COLS;
    const positions = new Float32Array(rows.length * cols.length * 2);
    const uvs = new Float32Array(rows.length * cols.length * 2);
    const indices = new Uint32Array((rows.length - 1) * (cols.length - 1) * 6);
    for (let r = 0; r < rows.length; r += 1) {
      const y = rows[r] ?? 0;
      for (let c = 0; c < cols.length; c += 1) {
        const x = cols[c] ?? 0;
        const i = (r * cols.length + c) * 2;
        positions[i] = x;
        positions[i + 1] = y;
        uvs[i] = x / ART_W;
        uvs[i + 1] = y / ART_H;
      }
    }
    let q = 0;
    for (let r = 0; r < rows.length - 1; r += 1) {
      for (let c = 0; c < cols.length - 1; c += 1) {
        const a = r * cols.length + c;
        const b = a + 1;
        const d = a + cols.length;
        const e = d + 1;
        indices[q++] = a;
        indices[q++] = b;
        indices[q++] = d;
        indices[q++] = b;
        indices[q++] = e;
        indices[q++] = d;
      }
    }
    this.artGeometry = new MeshGeometry({ positions, uvs, indices });
    this.artGeometry.batchMode = "batch";
    this.artPositions = positions;
    this.art = new Mesh({ geometry: this.artGeometry, texture: Texture.EMPTY });
    this.art.roundPixels = false;
    this.art.eventMode = "none";

    for (const [patch, place] of [
      [this.blushPatch, BLUSH_PATCH],
      [this.blinkPatch, BLINK_PATCH],
      [this.mouthPatch, MOUTH_PATCH],
      [this.toesPatch, TOES_PATCH],
    ] as const) {
      patch.eventMode = "none";
      patch.position.set(place.x, place.y);
      patch.alpha = 0;
    }
    // Blink sits ABOVE blush so the closed-eyes plate wins over the blush
    // plate's open eyes while she blinks; the mouth and toes patches do not
    // overlap the eyes band meaningfully and sit on top.
    this.addChild(
      this.art,
      this.blushPatch,
      this.blinkPatch,
      this.mouthPatch,
      this.toesPatch,
      this.hitLayer,
    );
    this.buildHitZones();
  }

  /** Loads all plates; safe to call once from the scene constructor. */
  async load(): Promise<void> {
    const [artTexture, blinkTexture, blushTexture, mouthTexture, toesTexture] =
      await Promise.all([
        Assets.load<Texture>(lyingHeroineUrl),
        Assets.load<Texture>(bedBlinkPatchUrl),
        Assets.load<Texture>(bedBlushUrl),
        Assets.load<Texture>(bedMouthOpenUrl),
        Assets.load<Texture>(bedToesCurledUrl),
      ]);
    this.art.texture = artTexture;
    this.blinkPatch.texture = blinkTexture;
    this.blushPatch.texture = blushTexture;
    this.mouthPatch.texture = mouthTexture;
    this.toesPatch.texture = toesTexture;
    this.loaded = true;
  }

  get ready(): boolean {
    return this.loaded;
  }

  /** Drives blink, breathing, reactions and the mouth cycle. */
  update(elapsedMs: number): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
    this.timeMs += elapsedMs;
    this.blinkPatch.alpha = blinkOverlayAt(this.timeMs).weight;
    this.applyBreathing();
    this.toesPatch.alpha = envelopeAt(
      this.timeMs - this.toesPulseAt,
      TOES_ENVELOPE,
    );
    this.blushPatch.alpha = envelopeAt(
      this.timeMs - this.blushPulseAt,
      BLUSH_ENVELOPE,
    );
    this.mouthPatch.alpha = Math.max(
      this.ambientMouthWeight(),
      envelopeAt(this.timeMs - this.mouthPulseAt, MOUTH_TAP_ENVELOPE),
    );
  }

  /** Vertical chest/belly lift via the grid mesh, zero outside her torso. */
  private applyBreathing(): void {
    const phase = (2 * Math.PI * this.timeMs) / BED_BREATH.periodMs;
    const lift = Math.sin(phase) * BED_BREATH.liftPx;
    const positions = this.artPositions;
    const cols = BED_MESH_COLS.length;
    for (let r = 0; r < BED_MESH_ROWS.length; r += 1) {
      const base = BED_MESH_ROWS[r] ?? 0;
      const rowLift = lift * bedBreathWeight(base);
      for (let c = 0; c < cols; c += 1) {
        positions[(r * cols + c) * 2 + 1] =
          base - rowLift * (BED_COL_WEIGHTS[c] ?? 0);
      }
    }
    this.artGeometry.attributes.aPosition!.buffer.update();
  }

  /** Ambient smile -> open-mouth window inside the shared 12s loop. */
  private ambientMouthWeight(): number {
    const loopT = this.timeMs % RIG_LOOP_MS;
    return envelopeAt(loopT - MOUTH_AMBIENT.startMs, {
      attackMs: MOUTH_AMBIENT.attackMs,
      holdMs: MOUTH_AMBIENT.holdMs,
      releaseMs: MOUTH_AMBIENT.releaseMs,
    });
  }

  /** Visible reaction of one tapped zone; economy stays in the scene. */
  private reactToTap(zone: BedTouchZone): void {
    switch (zone) {
      case "feet":
        this.toesPulseAt = this.timeMs;
        break;
      case "head":
        this.blushPulseAt = this.timeMs;
        this.mouthPulseAt = this.timeMs;
        break;
      case "belly":
      case "legs":
        this.blushPulseAt = this.timeMs;
        break;
    }
  }

  /**
   * Fits the art to the given width and vertically centers it between
   * `areaTop` and `areaBottom` (screen CSS pixels of the parent scene).
   */
  layoutScene(width: number, areaTop: number, areaBottom: number): void {
    const scale = width / ART_W;
    const height = ART_H * scale;
    const y = areaTop + Math.max(0, (areaBottom - areaTop - height) / 2);
    this.scale.set(scale);
    this.position.set(0, y);
  }

  /** Scaled art height for a given fit width, screen px. */
  static fittedHeight(width: number): number {
    return (ART_H * width) / ART_W;
  }

  private buildHitZones(): void {
    this.hitLayer.label = "bed scene touch zones";
    this.hitLayer.eventMode = "passive";
    // Later shapes sit on top: feet win over legs where they overlap.
    const shapes: readonly BedHitShape[] = [
      {
        zone: "head",
        draw: (g) => {
          g.ellipse(760, 270, 240, 230).fill({ color: 0xffffff, alpha: 1 });
          // the hand with the finger at her lips
          g.rect(600, 300, 180, 160).fill({ color: 0xffffff, alpha: 1 });
        },
      },
      {
        zone: "belly",
        draw: (g) => {
          g.rect(500, 500, 290, 190).fill({ color: 0xffffff, alpha: 1 });
        },
      },
      {
        zone: "legs",
        draw: (g) => {
          g.rect(340, 690, 580, 290).fill({ color: 0xffffff, alpha: 1 });
        },
      },
      {
        zone: "feet",
        draw: (g) => {
          g.rect(20, 760, 560, 560).fill({ color: 0xffffff, alpha: 1 });
          g.ellipse(330, 980, 320, 330).fill({ color: 0xffffff, alpha: 1 });
        },
      },
    ];
    for (const shape of shapes) {
      const g = new Graphics();
      shape.draw(g);
      g.alpha = 0;
      g.eventMode = "static";
      g.cursor = "pointer";
      g.label = `bed zone ${shape.zone}`;
      g.on("pointertap", (event) => {
        this.reactToTap(shape.zone);
        this.onTap(shape.zone, event.global.x, event.global.y);
      });
      this.hitLayer.addChild(g);
    }
  }
}
