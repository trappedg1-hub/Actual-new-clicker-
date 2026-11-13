import { Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import shelfHeroineUrl from "../../assets/environment/shelf-heroine.webp?url";
import {
  SHELF_ART_H,
  SHELF_ART_W,
  SHELF_MOTION,
  SHELF_ROOM,
  SHELF_ROOM_ART_SCALE,
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
 * `room-shelf.webp` backdrop (room + baked-in bookshelf).  The scene owner
 * aligns this container to the cover-fitted backdrop through
 * {@link alignToBackdrop}, so the figure stays glued to the bookshelf and
 * the floor boards on every screen size and crop.
 *
 * The inner art root pivots at the shoe tips (bottom center), so breathing
 * and the tiptoe bob scale the figure upward from the planted toes — the
 * shoes never slide on the floor.
 */
export class ShelfHeroine extends Container {
  private readonly artRoot = new Container();
  private readonly art = new Sprite(Texture.EMPTY);
  private readonly hitLayer = new Container();
  private readonly onTap: (
    zone: ShelfTouchZone,
    globalX: number,
    globalY: number,
  ) => void;
  private timeMs = 0;
  private loaded = false;
  private pulseAt = Number.NEGATIVE_INFINITY;

  constructor(
    onTap: (zone: ShelfTouchZone, globalX: number, globalY: number) => void,
  ) {
    super();
    this.label = "HEROINE-01 shelf scene";
    this.onTap = onTap;

    this.art.eventMode = "none";
    this.artRoot.pivot.set(SHELF_ART_W / 2, SHELF_ART_H);
    this.artRoot.addChild(this.art, this.hitLayer);
    this.addChild(this.artRoot);
    this.buildHitZones();
  }

  /** Loads the cutout plate; safe to call once from the scene constructor. */
  async load(): Promise<void> {
    this.art.texture = await Assets.load<Texture>(shelfHeroineUrl);
    this.loaded = true;
  }

  get ready(): boolean {
    return this.loaded;
  }

  /**
   * Glues the figure to the cover-fitted backdrop: `x`/`y` are the screen
   * position of the backdrop's top-left corner and `scale` its cover scale
   * (backdrop art px -> screen px), exactly as the scene computed them.
   */
  alignToBackdrop(x: number, y: number, scale: number): void {
    this.position.set(
      x + SHELF_ROOM.footCenterX * scale,
      y + SHELF_ROOM.footY * scale,
    );
    this.scale.set(scale * SHELF_ROOM_ART_SCALE);
  }

  /** Drives breathing, the tiptoe bob, the sway and tap pulses. */
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
  }

  /** Visible reaction of one tapped zone; economy stays in the scene. */
  private reactToTap(): void {
    this.pulseAt = this.timeMs;
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
          g.rect(430, 130, 227, 660).fill({ color: 0xffffff, alpha: 1 });
          g.rect(300, 40, 150, 120).fill({ color: 0xffffff, alpha: 1 });
        },
      },
      {
        zone: "thighs",
        draw: (g) => {
          // Pleated skirt, hips and the lace stocking tops.
          g.rect(215, 440, 300, 310).fill({ color: 0xffffff, alpha: 1 });
        },
      },
      {
        zone: "feet",
        draw: (g) => {
          // Calves, raised stockinged heels and the shoes.
          g.rect(170, 750, 400, 492).fill({ color: 0xffffff, alpha: 1 });
        },
      },
      {
        zone: "head",
        draw: (g) => {
          g.ellipse(330, 125, 115, 95).fill({ color: 0xffffff, alpha: 1 });
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
        this.reactToTap();
        this.onTap(shape.zone, event.global.x, event.global.y);
      });
      this.hitLayer.addChild(g);
    }
  }
}
