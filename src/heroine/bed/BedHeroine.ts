import { Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import bedBlinkPatchUrl from "../../assets/environment/bed-blink-patch.png?url";
import lyingHeroineUrl from "../../assets/environment/lying-heroine.webp?url";
import type { HeroineTouchZone } from "../../domain/economy/types.ts";
import { blinkOverlayAt } from "../rig/animationMath.ts";

/** Native pixel grid of the lying-pose web asset. */
const ART_W = 1152;
const ART_H = 1330;

/** Eyes band of the closed-eyes plate inside the same pixel grid. */
const BLINK_PATCH = { x: 597, y: 140, width: 187, height: 112 } as const;

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
 */
export class BedHeroine extends Container {
  private readonly art = new Sprite(Texture.EMPTY);
  private readonly blinkPatch = new Sprite(Texture.EMPTY);
  private readonly hitLayer = new Container();
  private readonly onTap: (
    zone: BedTouchZone,
    globalX: number,
    globalY: number,
  ) => void;
  private timeMs = 0;
  private loaded = false;

  constructor(
    onTap: (zone: BedTouchZone, globalX: number, globalY: number) => void,
  ) {
    super();
    this.label = "HEROINE-01 bed scene";
    this.onTap = onTap;
    this.art.eventMode = "none";
    this.blinkPatch.eventMode = "none";
    this.blinkPatch.position.set(BLINK_PATCH.x, BLINK_PATCH.y);
    this.blinkPatch.alpha = 0;
    this.addChild(this.art, this.blinkPatch, this.hitLayer);
    this.buildHitZones();
  }

  /** Loads both plates; safe to call once from the scene constructor. */
  async load(): Promise<void> {
    const [artTexture, patchTexture] = await Promise.all([
      Assets.load<Texture>(lyingHeroineUrl),
      Assets.load<Texture>(bedBlinkPatchUrl),
    ]);
    this.art.texture = artTexture;
    this.blinkPatch.texture = patchTexture;
    this.loaded = true;
  }

  get ready(): boolean {
    return this.loaded;
  }

  /** Drives the auto-blink with the shared 12s loop envelope. */
  update(elapsedMs: number): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
    this.timeMs += elapsedMs;
    this.blinkPatch.alpha = blinkOverlayAt(this.timeMs).weight;
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
        this.onTap(shape.zone, event.global.x, event.global.y);
      });
      this.hitLayer.addChild(g);
    }
  }
}
