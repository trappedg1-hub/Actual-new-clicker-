import { Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import shelfShadowUrl from "../../assets/environment/shelf-shadow.png?url";
import standingBlinkUrl from "../../assets/environment/standing-blink.png?url";
import standingBlushUrl from "../../assets/environment/standing-blush.png?url";
import standingGlanceUrl from "../../assets/environment/standing-glance.png?url";
import standingHeroineUrl from "../../assets/environment/standing-heroine.webp?url";
import standingMoodLoveUrl from "../../assets/environment/standing-mood-love.png?url";
import standingMoodTsunUrl from "../../assets/environment/standing-mood-tsun.png?url";
import standingWinkUrl from "../../assets/environment/standing-wink.png?url";
import { blinkOverlayAt } from "../rig/animationMath.ts";
import {
  STANDING_ART_H,
  STANDING_ART_W,
  STANDING_BLUSH_ENVELOPE,
  STANDING_GLANCE_ENVELOPE,
  STANDING_MOTION,
  STANDING_PATCHES,
  STANDING_ROOM,
  STANDING_ROOM_ART_SCALE,
  STANDING_SHADOWS,
  STANDING_WINK_ENVELOPE,
  standingAmbientGlanceAt,
  standingEnvelopeAt,
  standingPulseAt,
  type StandingTouchZone,
} from "./standingScene.ts";

export {
  STANDING_ZONE_ECONOMY,
  type StandingTouchZone,
} from "./standingScene.ts";

interface StandingHitShape {
  zone: StandingTouchZone;
  draw: (g: Graphics) => void;
}

/**
 * BLOCK K standing scene: the redrawn calm pose as ONE painted cutout
 * above the `room-standing.webp` backdrop, replacing the layered vector
 * rig — the same stable-plate-plus-overlay recipe as the bed, shelf and
 * carpet scenes.  She stands at ease facing the player, hands clasped
 * behind her back; the scene owner aligns this container to the fitted
 * backdrop through {@link alignToBackdrop}.
 *
 * The inner art root pivots at her planted feet (bottom center), so
 * breathing and the tap pulse scale the figure upward from the floor —
 * the feet never slide on the boards.
 *
 * Face life: auto-blink, the shy side-glance she drifts into on a long
 * watched-you rhythm, the blush flush on a sweet tap, and the flirty
 * wink the scene owner can trigger at the hot relationship band.
 */
export class StandingHeroine extends Container {
  private readonly artRoot = new Container();
  private readonly shadowLayer = new Container();
  private readonly art = new Sprite(Texture.EMPTY);
  private readonly moodTsun = new Sprite(Texture.EMPTY);
  private readonly moodLove = new Sprite(Texture.EMPTY);
  private readonly blushPatch = new Sprite(Texture.EMPTY);
  private readonly glancePatch = new Sprite(Texture.EMPTY);
  private readonly winkPatch = new Sprite(Texture.EMPTY);
  private readonly blinkPatch = new Sprite(Texture.EMPTY);
  private readonly hitLayer = new Container();
  private readonly onTap: (
    zone: StandingTouchZone,
    globalX: number,
    globalY: number,
  ) => void;
  private timeMs = 0;
  private loaded = false;
  private pulseAt = Number.NEGATIVE_INFINITY;
  private blushPulseAt = Number.NEGATIVE_INFINITY;
  private glancePulseAt = Number.NEGATIVE_INFINITY;
  private winkPulseAt = Number.NEGATIVE_INFINITY;
  /** Relationship heat band (0 tsundere / 1 warm / 2 lovestruck). */
  private heatBand: 0 | 1 | 2 = 0;

  constructor(
    onTap: (zone: StandingTouchZone, globalX: number, globalY: number) => void,
  ) {
    super();
    this.label = "HEROINE-01 standing scene";
    this.onTap = onTap;

    this.art.eventMode = "none";
    for (const patch of [this.blushPatch, this.glancePatch, this.winkPatch]) {
      patch.eventMode = "none";
      patch.position.set(STANDING_PATCHES.face.x, STANDING_PATCHES.face.y);
      patch.alpha = 0;
    }
    this.blinkPatch.eventMode = "none";
    this.blinkPatch.position.set(
      STANDING_PATCHES.eyes.x,
      STANDING_PATCHES.eyes.y,
    );
    this.blinkPatch.alpha = 0;
    for (const mood of [this.moodTsun, this.moodLove]) {
      mood.eventMode = "none";
      mood.position.set(STANDING_PATCHES.mood.x, STANDING_PATCHES.mood.y);
      mood.alpha = 0;
    }
    this.moodTsun.label = "mood tsundere";
    this.moodLove.label = "mood lovestruck";
    this.artRoot.pivot.set(STANDING_ART_W / 2, STANDING_ART_H);
    this.shadowLayer.eventMode = "none";
    // All four face plates share one window; stacking order resolves
    // conflicts — blink sits on top so closed lids win over any other
    // face state, the wink wins over the shy glance under it.
    this.artRoot.addChild(
      this.shadowLayer,
      this.art,
      this.moodTsun,
      this.moodLove,
      this.blushPatch,
      this.glancePatch,
      this.winkPatch,
      this.blinkPatch,
      this.hitLayer,
    );
    this.addChild(this.artRoot);
    this.buildHitZones();
  }

  /** Loads all plates; safe to call once from the scene constructor. */
  async load(): Promise<void> {
    const [art, blink, blush, glance, wink, moodTsun, moodLove, shadow] =
      await Promise.all([
        Assets.load<Texture>(standingHeroineUrl),
        Assets.load<Texture>(standingBlinkUrl),
        Assets.load<Texture>(standingBlushUrl),
        Assets.load<Texture>(standingGlanceUrl),
        Assets.load<Texture>(standingWinkUrl),
        Assets.load<Texture>(standingMoodTsunUrl),
        Assets.load<Texture>(standingMoodLoveUrl),
        Assets.load<Texture>(shelfShadowUrl),
      ]);
    this.art.texture = art;
    this.blinkPatch.texture = blink;
    this.blushPatch.texture = blush;
    this.glancePatch.texture = glance;
    this.winkPatch.texture = wink;
    this.moodTsun.texture = moodTsun;
    this.moodLove.texture = moodLove;
    for (const spec of STANDING_SHADOWS) {
      const sprite = new Sprite(shadow);
      sprite.anchor.set(0.5);
      sprite.position.set(spec.x, spec.y);
      sprite.width = spec.w;
      sprite.height = spec.h;
      sprite.alpha = spec.alpha;
      sprite.tint = 0x100a0e;
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
      x + STANDING_ROOM.footCenterX * scale,
      y + STANDING_ROOM.footY * scale,
    );
    this.scale.set(scale * STANDING_ROOM_ART_SCALE);
  }

  /** Drives breathing, sway, blink, blush, shy glance and the wink. */
  update(elapsedMs: number): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
    this.timeMs += elapsedMs;
    const t = this.timeMs;
    const breath =
      Math.sin((2 * Math.PI * t) / STANDING_MOTION.breathPeriodMs) *
      STANDING_MOTION.breathScale;
    const pulse =
      standingPulseAt(t - this.pulseAt) * STANDING_MOTION.pulseScale;
    const lift = breath + pulse;
    // Standing at ease: the figure rises from the planted feet while the
    // silhouette narrows a touch, plus a gentle weight-shift sway.
    this.artRoot.scale.set(1 - lift * 0.35, 1 + lift);
    this.artRoot.skew.x =
      Math.sin((2 * Math.PI * t) / STANDING_MOTION.swayPeriodMs) *
      STANDING_MOTION.swaySkew;

    const wink = standingEnvelopeAt(
      t - this.winkPulseAt,
      STANDING_WINK_ENVELOPE,
    );
    const glance = Math.max(
      standingAmbientGlanceAt(t),
      standingEnvelopeAt(t - this.glancePulseAt, STANDING_GLANCE_ENVELOPE),
    );
    // Relationship mood owns the resting face: the tsundere pout at the
    // cold band, the lovestruck gaze at the hot band.  The neutral-eyed
    // shy glance only plays in the warm middle band where it belongs.
    this.moodTsun.alpha = this.heatBand === 0 ? 1 : 0;
    this.moodLove.alpha = this.heatBand === 2 ? 1 : 0;
    this.winkPatch.alpha = wink;
    // The wink owns the face while it plays: the glance yields and the
    // auto-blink pauses, otherwise closed lids would stomp the open eye.
    this.glancePatch.alpha =
      glance * (1 - wink) * (this.heatBand === 1 ? 1 : 0);
    this.blinkPatch.alpha = blinkOverlayAt(t).weight * (1 - wink);
    this.blushPatch.alpha = standingEnvelopeAt(
      t - this.blushPulseAt,
      STANDING_BLUSH_ENVELOPE,
    );
  }

  /** Flirty wink — the scene owner calls it at the hot relationship band. */
  wink(): void {
    this.winkPulseAt = this.timeMs;
  }

  /** Relationship mood of the resting face (0 tsundere / 1 warm / 2 love). */
  setHeatBand(band: 0 | 1 | 2): void {
    this.heatBand = band;
  }

  /** Visible reaction of one tapped zone; economy stays in the scene. */
  private reactToTap(zone: StandingTouchZone): void {
    this.pulseAt = this.timeMs;
    switch (zone) {
      case "head":
      case "body":
        this.blushPulseAt = this.timeMs;
        break;
      case "belly":
      case "thighs":
        this.blushPulseAt = this.timeMs;
        this.glancePulseAt = this.timeMs;
        break;
      case "hair":
      case "legs":
        break;
    }
  }

  private buildHitZones(): void {
    this.hitLayer.label = "standing scene touch zones";
    this.hitLayer.eventMode = "passive";
    // Later shapes sit on top: the face wins over the hair where they meet.
    const shapes: readonly StandingHitShape[] = [
      {
        zone: "hair",
        draw: (g) => {
          // Crown above the face plus both long falls past her hips.
          g.rect(290, 40, 280, 80).fill({ color: 0xffffff, alpha: 1 });
          g.rect(186, 240, 130, 760).fill({ color: 0xffffff, alpha: 1 });
          g.rect(540, 240, 132, 760).fill({ color: 0xffffff, alpha: 1 });
        },
      },
      {
        zone: "legs",
        draw: (g) => {
          // Stockinged knees, calves and the shy pigeon-toed feet.
          g.rect(320, 800, 240, 456).fill({ color: 0xffffff, alpha: 1 });
        },
      },
      {
        zone: "thighs",
        draw: (g) => {
          // Pleated skirt, the bare thigh strip and the lace tops.
          g.rect(300, 560, 256, 240).fill({ color: 0xffffff, alpha: 1 });
        },
      },
      {
        zone: "belly",
        draw: (g) => {
          // Waist band between the sailor top and the skirt.
          g.rect(330, 480, 190, 80).fill({ color: 0xffffff, alpha: 1 });
        },
      },
      {
        zone: "body",
        draw: (g) => {
          // Sailor top, collar and the necktie.
          g.rect(322, 300, 210, 180).fill({ color: 0xffffff, alpha: 1 });
        },
      },
      {
        zone: "head",
        draw: (g) => {
          g.ellipse(432, 200, 110, 115).fill({ color: 0xffffff, alpha: 1 });
        },
      },
    ];
    for (const shape of shapes) {
      const g = new Graphics();
      shape.draw(g);
      g.alpha = 0;
      g.eventMode = "static";
      g.cursor = "pointer";
      g.label = `standing zone ${shape.zone}`;
      g.on("pointertap", (event) => {
        this.reactToTap(shape.zone);
        this.onTap(shape.zone, event.global.x, event.global.y);
      });
      this.hitLayer.addChild(g);
    }
  }
}
