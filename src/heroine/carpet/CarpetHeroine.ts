import { Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import carpetBlinkUrl from "../../assets/environment/carpet-blink.png?url";
import carpetBlushUrl from "../../assets/environment/carpet-blush.png?url";
import carpetHeroineUrl from "../../assets/environment/carpet-heroine.webp?url";
import carpetLegsUrl from "../../assets/environment/carpet-legs.png?url";
import carpetPageUrl from "../../assets/environment/carpet-page.png?url";
import carpetStockingUrl from "../../assets/environment/carpet-stocking.png?url";
import shelfShadowUrl from "../../assets/environment/shelf-shadow.png?url";
import { blinkOverlayAt } from "../rig/animationMath.ts";
import {
  CARPET_ART_H,
  CARPET_ART_W,
  CARPET_BLUSH_ENVELOPE,
  CARPET_MOTION,
  CARPET_PATCHES,
  CARPET_ROOM,
  CARPET_ROOM_ART_SCALE,
  CARPET_SHADOWS,
  CARPET_STOCKING_ENVELOPE,
  carpetAmbientPageAt,
  carpetAmbientStockingAt,
  carpetEnvelopeAt,
  carpetLegSwingAt,
  carpetPulseAt,
  type CarpetTouchZone,
} from "./carpetScene.ts";

export {
  CARPET_ZONE_ECONOMY,
  type CarpetTouchZone,
} from "./carpetScene.ts";

interface CarpetHitShape {
  zone: CarpetTouchZone;
  draw: (g: Graphics) => void;
}

/**
 * BLOCK I carpet scene: the approved floor-reading cutout rendered above
 * the `room-floor.webp` backdrop (the open floor at the foot of the bed,
 * seen from slightly above).  The scene owner aligns this container to
 * the fitted backdrop through {@link alignToBackdrop}, so the figure
 * stays glued to the floor boards on every screen size.
 *
 * The inner art root pivots at the plate center: she lies flat, so the
 * gentle breathing scales the whole silhouette around its middle — no
 * point of the body visibly leaves the floor.
 *
 * Reactions follow the bed/shelf stable-plate-plus-overlay rule: the
 * base plate never swaps; blink, blush, swinging shins, the slipping
 * stocking ring and the page flip are feathered patches cut from
 * aligned pose variants that fade above it.
 */
export class CarpetHeroine extends Container {
  private readonly artRoot = new Container();
  private readonly shadowLayer = new Container();
  private readonly art = new Sprite(Texture.EMPTY);
  private readonly blushPatch = new Sprite(Texture.EMPTY);
  private readonly blinkPatch = new Sprite(Texture.EMPTY);
  private readonly legsPatch = new Sprite(Texture.EMPTY);
  private readonly stockingPatch = new Sprite(Texture.EMPTY);
  private readonly pagePatch = new Sprite(Texture.EMPTY);
  private readonly hitLayer = new Container();
  private readonly onTap: (
    zone: CarpetTouchZone,
    globalX: number,
    globalY: number,
  ) => void;
  private timeMs = 0;
  private loaded = false;
  private pulseAt = Number.NEGATIVE_INFINITY;
  private blushPulseAt = Number.NEGATIVE_INFINITY;
  private stockingPulseAt = Number.NEGATIVE_INFINITY;

  constructor(
    onTap: (zone: CarpetTouchZone, globalX: number, globalY: number) => void,
  ) {
    super();
    this.label = "HEROINE-01 carpet scene";
    this.onTap = onTap;

    this.art.eventMode = "none";
    for (const [patch, place] of [
      [this.blushPatch, CARPET_PATCHES.blush],
      [this.blinkPatch, CARPET_PATCHES.blink],
      [this.legsPatch, CARPET_PATCHES.legs],
      [this.stockingPatch, CARPET_PATCHES.stocking],
      [this.pagePatch, CARPET_PATCHES.page],
    ] as const) {
      patch.eventMode = "none";
      patch.position.set(place.x, place.y);
      patch.alpha = 0;
    }
    this.artRoot.pivot.set(CARPET_ART_W / 2, CARPET_ART_H / 2);
    this.shadowLayer.eventMode = "none";
    // Blink sits ABOVE blush so the closed-eyes plate wins over the blush
    // plate's widened eye while she blinks; legs, stocking and page
    // patches are disjoint regions.  Contact shadows render UNDER the
    // art so the body overlaps their cores and only the soft rim spills
    // onto the floor boards.
    this.artRoot.addChild(
      this.shadowLayer,
      this.art,
      this.blushPatch,
      this.blinkPatch,
      this.legsPatch,
      this.stockingPatch,
      this.pagePatch,
      this.hitLayer,
    );
    this.addChild(this.artRoot);
    this.buildHitZones();
  }

  /** Loads all plates; safe to call once from the scene constructor. */
  async load(): Promise<void> {
    const [art, blink, blush, legs, stocking, page, shadow] =
      await Promise.all([
        Assets.load<Texture>(carpetHeroineUrl),
        Assets.load<Texture>(carpetBlinkUrl),
        Assets.load<Texture>(carpetBlushUrl),
        Assets.load<Texture>(carpetLegsUrl),
        Assets.load<Texture>(carpetStockingUrl),
        Assets.load<Texture>(carpetPageUrl),
        Assets.load<Texture>(shelfShadowUrl),
      ]);
    this.art.texture = art;
    this.blinkPatch.texture = blink;
    this.blushPatch.texture = blush;
    this.legsPatch.texture = legs;
    this.stockingPatch.texture = stocking;
    this.pagePatch.texture = page;
    for (const spec of CARPET_SHADOWS) {
      const sprite = new Sprite(shadow);
      sprite.anchor.set(0.5);
      sprite.position.set(spec.x, spec.y);
      sprite.width = spec.w;
      sprite.height = spec.h;
      sprite.alpha = spec.alpha;
      sprite.tint = 0x14080a;
      sprite.eventMode = "none";
      this.shadowLayer.addChild(sprite);
    }
    this.loaded = true;
  }

  get ready(): boolean {
    return this.loaded;
  }

  /**
   * Glues the figure to the fitted backdrop: `x`/`y` are the screen
   * position of the backdrop's top-left corner and `scale` its fit scale
   * (backdrop art px -> screen px), exactly as the scene computed them.
   */
  alignToBackdrop(x: number, y: number, scale: number): void {
    this.position.set(
      x + CARPET_ROOM.centerX * scale,
      y + CARPET_ROOM.centerY * scale,
    );
    this.scale.set(scale * CARPET_ROOM_ART_SCALE);
  }

  /** Drives breathing, blink, blush, leg swing, stocking and page flip. */
  update(elapsedMs: number): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
    this.timeMs += elapsedMs;
    const t = this.timeMs;
    const breath =
      Math.sin((2 * Math.PI * t) / CARPET_MOTION.breathPeriodMs) *
      CARPET_MOTION.breathScale;
    const pulse = carpetPulseAt(t - this.pulseAt) * CARPET_MOTION.pulseScale;
    const lift = breath + pulse;
    // Lying flat: breathing widens the silhouette a touch while the
    // height dips, as the ribcage presses into the floor.
    this.artRoot.scale.set(1 + lift * 0.4, 1 - lift);

    this.legsPatch.alpha = carpetLegSwingAt(t);
    this.blinkPatch.alpha = blinkOverlayAt(t).weight;
    this.blushPatch.alpha = carpetEnvelopeAt(
      t - this.blushPulseAt,
      CARPET_BLUSH_ENVELOPE,
    );
    this.stockingPatch.alpha = Math.max(
      carpetAmbientStockingAt(t),
      carpetEnvelopeAt(t - this.stockingPulseAt, CARPET_STOCKING_ENVELOPE),
    );
    this.pagePatch.alpha = carpetAmbientPageAt(t);
  }

  /** Visible reaction of one tapped zone; economy stays in the scene. */
  private reactToTap(zone: CarpetTouchZone): void {
    this.pulseAt = this.timeMs;
    switch (zone) {
      case "head":
        this.blushPulseAt = this.timeMs;
        break;
      case "thighs":
        this.blushPulseAt = this.timeMs;
        this.stockingPulseAt = this.timeMs;
        break;
      case "hair":
      case "legs":
        break;
    }
  }

  private buildHitZones(): void {
    this.hitLayer.label = "carpet scene touch zones";
    this.hitLayer.eventMode = "passive";
    // Later shapes sit on top: the face wins over the hair where they meet.
    const shapes: readonly CarpetHitShape[] = [
      {
        zone: "hair",
        draw: (g) => {
          // The lavender pools on the boards left of her and behind her
          // back, plus the fall over her right shoulder.
          g.rect(20, 440, 290, 400).fill({ color: 0xffffff, alpha: 1 });
          g.rect(580, 420, 233, 300).fill({ color: 0xffffff, alpha: 1 });
          g.rect(300, 40, 180, 240).fill({ color: 0xffffff, alpha: 1 });
        },
      },
      {
        zone: "thighs",
        draw: (g) => {
          // The ridden-up skirt, hips and the long bare thigh.
          g.rect(210, 480, 330, 180).fill({ color: 0xffffff, alpha: 1 });
          g.rect(280, 600, 360, 390).fill({ color: 0xffffff, alpha: 1 });
        },
      },
      {
        zone: "legs",
        draw: (g) => {
          // Raised crossed shins and feet, the rolled stocking ring and
          // the bottom calf.
          g.rect(500, 280, 310, 350).fill({ color: 0xffffff, alpha: 1 });
          g.rect(490, 700, 210, 190).fill({ color: 0xffffff, alpha: 1 });
          g.rect(560, 880, 160, 126).fill({ color: 0xffffff, alpha: 1 });
        },
      },
      {
        zone: "head",
        draw: (g) => {
          g.ellipse(228, 160, 110, 92).fill({ color: 0xffffff, alpha: 1 });
        },
      },
    ];
    for (const shape of shapes) {
      const g = new Graphics();
      shape.draw(g);
      g.alpha = 0;
      g.eventMode = "static";
      g.cursor = "pointer";
      g.label = `carpet zone ${shape.zone}`;
      g.on("pointertap", (event) => {
        this.reactToTap(shape.zone);
        this.onTap(shape.zone, event.global.x, event.global.y);
      });
      this.hitLayer.addChild(g);
    }
  }
}
