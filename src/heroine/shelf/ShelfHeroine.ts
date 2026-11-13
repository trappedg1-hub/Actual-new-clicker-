import { Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import shelfBlinkUrl from "../../assets/environment/shelf-blink.png?url";
import shelfBlushUrl from "../../assets/environment/shelf-blush.png?url";
import shelfHeroineUrl from "../../assets/environment/shelf-heroine.webp?url";
import shelfShadowUrl from "../../assets/environment/shelf-shadow.png?url";
import shelfStockingUrl from "../../assets/environment/shelf-stocking.png?url";
import { blinkOverlayAt } from "../rig/animationMath.ts";
import {
  SHELF_ART_H,
  SHELF_ART_W,
  SHELF_BLUSH_ENVELOPE,
  SHELF_MOTION,
  SHELF_PATCHES,
  SHELF_ROOM,
  SHELF_ROOM_ART_SCALE,
  SHELF_SHADOWS,
  SHELF_STOCKING_ENVELOPE,
  shelfAmbientStockingAt,
  shelfEnvelopeAt,
  shelfPulseAt,
  type ShelfTouchZone,
} from "./shelfScene.ts";

export {
  SHELF_ZONE_ECONOMY,
  type ShelfTouchZone,
} from "./shelfScene.ts";

interface ShelfHitShape {
  zone: ShelfTouchZone;
  draw: (g: Graphics) => void;
}

/**
 * BLOCK H shelf scene: the approved shelf-reach cutout rendered above the
 * `room-shelf.webp` backdrop (the previously unseen corner wall of the
 * room with the bookshelf).  The scene owner aligns this container to the
 * fitted backdrop through {@link alignToBackdrop}, so the figure stays
 * glued to the bookshelf and the floor boards on every screen size.
 *
 * The inner art root pivots at the shoe tips (bottom center), so breathing
 * and the tiptoe bob scale the figure upward from the planted toes — the
 * shoes never slide on the floor.
 *
 * Reactions follow the bed-scene stable-plate-plus-overlay rule: the base
 * plate never swaps; the blink, blush and slipped-stocking plates are
 * feathered patches cut from aligned pose variants that fade above it.
 */
export class ShelfHeroine extends Container {
  private readonly artRoot = new Container();
  private readonly shadowLayer = new Container();
  private readonly art = new Sprite(Texture.EMPTY);
  private readonly blushPatch = new Sprite(Texture.EMPTY);
  private readonly blinkPatch = new Sprite(Texture.EMPTY);
  private readonly stockingPatch = new Sprite(Texture.EMPTY);
  private readonly hitLayer = new Container();
  private readonly onTap: (
    zone: ShelfTouchZone,
    globalX: number,
    globalY: number,
  ) => void;
  private timeMs = 0;
  private loaded = false;
  private pulseAt = Number.NEGATIVE_INFINITY;
  private blushPulseAt = Number.NEGATIVE_INFINITY;
  private stockingPulseAt = Number.NEGATIVE_INFINITY;

  constructor(
    onTap: (zone: ShelfTouchZone, globalX: number, globalY: number) => void,
  ) {
    super();
    this.label = "HEROINE-01 shelf scene";
    this.onTap = onTap;

    this.art.eventMode = "none";
    for (const [patch, place] of [
      [this.blushPatch, SHELF_PATCHES.blush],
      [this.blinkPatch, SHELF_PATCHES.blink],
      [this.stockingPatch, SHELF_PATCHES.stocking],
    ] as const) {
      patch.eventMode = "none";
      patch.position.set(place.x, place.y);
      patch.alpha = 0;
    }
    this.artRoot.pivot.set(SHELF_ART_W / 2, SHELF_ART_H);
    this.shadowLayer.eventMode = "none";
    // Blink sits ABOVE blush so the closed-eyes plate wins over the blush
    // plate's open eye while she blinks; the stocking patch is disjoint.
    // Contact shadows render UNDER the art so the soles overlap their
    // cores and only the soft rim spills onto the floor boards.
    this.artRoot.addChild(
      this.shadowLayer,
      this.art,
      this.blushPatch,
      this.blinkPatch,
      this.stockingPatch,
      this.hitLayer,
    );
    this.addChild(this.artRoot);
    this.buildHitZones();
  }

  /** Loads all plates; safe to call once from the scene constructor. */
  async load(): Promise<void> {
    const [art, blink, blush, stocking, shadow] = await Promise.all([
      Assets.load<Texture>(shelfHeroineUrl),
      Assets.load<Texture>(shelfBlinkUrl),
      Assets.load<Texture>(shelfBlushUrl),
      Assets.load<Texture>(shelfStockingUrl),
      Assets.load<Texture>(shelfShadowUrl),
    ]);
    this.art.texture = art;
    this.blinkPatch.texture = blink;
    this.blushPatch.texture = blush;
    this.stockingPatch.texture = stocking;
    for (const spec of SHELF_SHADOWS) {
      const sprite = new Sprite(shadow);
      sprite.anchor.set(0.5);
      sprite.position.set(spec.x, spec.y);
      sprite.width = spec.w;
      sprite.height = spec.h;
      sprite.alpha = spec.alpha;
      sprite.tint = 0x0c080e;
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
      x + SHELF_ROOM.footCenterX * scale,
      y + SHELF_ROOM.footY * scale,
    );
    this.scale.set(scale * SHELF_ROOM_ART_SCALE);
  }

  /** Drives motion, blink, blush and the slipping stocking. */
  update(elapsedMs: number): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
    this.timeMs += elapsedMs;
    const t = this.timeMs;
    const breath =
      Math.sin((2 * Math.PI * t) / SHELF_MOTION.breathPeriodMs) *
      SHELF_MOTION.breathScale;
    const bob =
      Math.sin((2 * Math.PI * t) / SHELF_MOTION.bobPeriodMs) *
      SHELF_MOTION.bobScale;
    const pulse = shelfPulseAt(t - this.pulseAt) * SHELF_MOTION.pulseScale;
    const lift = breath + bob + pulse;
    this.artRoot.scale.set(1 - lift * 0.35, 1 + lift);
    this.artRoot.skew.x =
      Math.sin((2 * Math.PI * t) / SHELF_MOTION.swayPeriodMs) *
      SHELF_MOTION.swaySkew;

    this.blinkPatch.alpha = blinkOverlayAt(t).weight;
    this.blushPatch.alpha = shelfEnvelopeAt(
      t - this.blushPulseAt,
      SHELF_BLUSH_ENVELOPE,
    );
    this.stockingPatch.alpha = Math.max(
      shelfAmbientStockingAt(t),
      shelfEnvelopeAt(t - this.stockingPulseAt, SHELF_STOCKING_ENVELOPE),
    );
  }

  /** Visible reaction of one tapped zone; economy stays in the scene. */
  private reactToTap(zone: ShelfTouchZone): void {
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
      case "feet":
        break;
    }
  }

  private buildHitZones(): void {
    this.hitLayer.label = "shelf scene touch zones";
    this.hitLayer.eventMode = "passive";
    // Later shapes sit on top: the face wins over the hair where they meet.
    const shapes: readonly ShelfHitShape[] = [
      {
        zone: "hair",
        draw: (g) => {
          // The long fall of hair down her right side, plus the crown.
          g.rect(416, 124, 227, 660).fill({ color: 0xffffff, alpha: 1 });
          g.rect(286, 34, 150, 120).fill({ color: 0xffffff, alpha: 1 });
        },
      },
      {
        zone: "thighs",
        draw: (g) => {
          // Pleated skirt, hips and the lace stocking tops.
          g.rect(201, 434, 300, 310).fill({ color: 0xffffff, alpha: 1 });
        },
      },
      {
        zone: "feet",
        draw: (g) => {
          // Calves, raised stockinged heels and the shoes.
          g.rect(156, 744, 400, 492).fill({ color: 0xffffff, alpha: 1 });
        },
      },
      {
        zone: "head",
        draw: (g) => {
          g.ellipse(316, 119, 115, 95).fill({ color: 0xffffff, alpha: 1 });
        },
      },
    ];
    for (const shape of shapes) {
      const g = new Graphics();
      shape.draw(g);
      g.alpha = 0;
      g.eventMode = "static";
      g.cursor = "pointer";
      g.label = `shelf zone ${shape.zone}`;
      g.on("pointertap", (event) => {
        this.reactToTap(shape.zone);
        this.onTap(shape.zone, event.global.x, event.global.y);
      });
      this.hitLayer.addChild(g);
    }
  }
}
