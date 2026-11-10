import { Circle, Container, Graphics, Rectangle, Sprite, Text } from "pixi.js";
import { findRigLayer } from "../../app/frameLoop.ts";
import { createAnimationLayer, type AnimationLayer } from "./animationLayer.ts";
import type { HeroineArtSource } from "../art/heroineArt.ts";
import type { HeroineTouchZone } from "../../domain/economy/types.ts";
import { startIdlePose } from "../poses/idlePose.ts";
import { playZoneReaction } from "../reactions/zoneReactions.ts";

export interface HeroineRigLayers {
  backHair: Container;
  head: Container;
  eyes: Container;
  eyelids: Container;
  mouth: Container;
  frontHair: Container;
  torso: Container;
  leftArm: Container;
  rightArm: Container;
}

/**
 * Animatable rig parts and the node each kind of animation must target.
 *
 * `pose` is driven by tap reactions (always from identity), `idle` by the breathing /
 * sway / blink loops. The art container is never animated, so artwork can be swapped
 * for Sprites later without touching the animation code.
 */
export interface HeroineRigStacks {
  torso: AnimationLayer;
  head: AnimationLayer;
  frontHair: AnimationLayer;
  backHair: AnimationLayer;
  leftArm: AnimationLayer;
  rightArm: AnimationLayer;
  eyes: AnimationLayer;
  eyelids: AnimationLayer;
  mouth: AnimationLayer;
}

/** Stack key -> frame name in the atlas. */
const ART_FRAME_NAMES: Record<string, string> = {
  backHair: "back_hair",
  torso: "torso",
  leftArm: "arm_left",
  rightArm: "arm_right",
  head: "head",
  eyes: "eyes",
  eyelids: "eyelids",
  mouth: "mouth",
  frontHair: "hair_front",
};

const LINE = 0xf2c7ff;
const ACCENT = 0x8fe7ff;
const FILL = 0x5f3b86;

/** A technical wireframe placeholder, not approved or generated character artwork. */
export class LayeredHeroineRig extends Container {
  readonly layers: HeroineRigLayers;
  /** Animation targets, kept separate so idle and reactions cannot overwrite each other. */
  readonly stacks: HeroineRigStacks;
  private readonly glow: Graphics;
  /** Pose nodes for eyes/eyelids/mouth, kept outside the head artwork. */
  private headFeatures: Container[] = [];
  private placeholderTag: Text | null = null;

  constructor(
    onTap: (zone: HeroineTouchZone, localX: number, localY: number) => void,
  ) {
    super();
    this.label = "HEROINE-01 technical layered rig placeholder";
    this.glow = new Graphics();
    this.addChild(this.glow);

    // Art is built first, then wrapped: pose -> idle -> art.
    // Tap reactions animate `pose`, idle loops animate `idle`, artwork stays static.
    // Carries the facial features so they survive a head artwork swap.
    const headFeaturesHost = createAnimationLayer("head features");

    const backHairStack = createAnimationLayer("back hair");
    const torsoStack = createAnimationLayer("torso");
    const leftArmStack = createAnimationLayer("left arm");
    const rightArmStack = createAnimationLayer("right arm");
    const headStack = createAnimationLayer("head");
    const frontHairStack = createAnimationLayer("front hair");

    const backHair = this.createBackHair(backHairStack.art);
    const torso = this.createTorso(torsoStack.art);
    const leftArm = this.createArm(-1, leftArmStack.art);
    const rightArm = this.createArm(1, rightArmStack.art);
    const head = this.createHead(headStack.art);
    const frontHair = this.createFrontHair(frontHairStack.art);

    // The head internals keep their own stacking so blinking cannot reset a head reaction.
    const eyesStack = createAnimationLayer("eyes");
    const eyelidsStack = createAnimationLayer("eyelids");
    const mouthStack = createAnimationLayer("mouth");

    // The placeholder layers are labelled "eyes placeholder layer" etc. Looking them up
    // by the short name returned null and the whole rig constructor threw (blank screen).
    const eyes = findRigLayer(head, "eyes");
    const eyelids = findRigLayer(head, "eyelids");
    const mouth = findRigLayer(head, "mouth");

    // Re-parent the eye/lid graphics into their stacks, preserving local coordinates.
    eyesStack.art.addChild(eyes);
    eyelidsStack.art.addChild(eyelids);
    mouthStack.art.addChild(mouth);
    // Facial features are siblings of the head artwork, not children of it: `applyArt`
    // clears an art container, which used to delete the eyes along with the head.
    this.headFeatures = [eyesStack.pose, eyelidsStack.pose, mouthStack.pose];
    headFeaturesHost.art.addChild(...this.headFeatures);

    this.stacks = {
      torso: torsoStack,
      head: headStack,
      frontHair: frontHairStack,
      backHair: backHairStack,
      leftArm: leftArmStack,
      rightArm: rightArmStack,
      eyes: eyesStack,
      eyelids: eyelidsStack,
      mouth: mouthStack,
    };

    this.layers = {
      backHair,
      head,
      eyes,
      eyelids,
      mouth,
      frontHair,
      torso,
      leftArm,
      rightArm,
    };
    this.addChild(
      backHairStack.pose,
      torsoStack.pose,
      leftArmStack.pose,
      rightArmStack.pose,
      headStack.pose,
      headFeaturesHost.pose,
      frontHairStack.pose,
    );

    this.makeInteractive(
      backHair,
      "hair",
      new Rectangle(-52, -54, 104, 118),
      onTap,
    );
    this.makeInteractive(head, "head", new Circle(0, 0, 43), onTap);
    this.makeInteractive(
      frontHair,
      "hair",
      new Rectangle(-48, -52, 96, 42),
      onTap,
    );
    this.makeInteractive(torso, "body", new Rectangle(-39, -8, 78, 124), onTap);
    this.makeInteractive(
      leftArm,
      "arms",
      new Rectangle(-13, -4, 30, 80),
      onTap,
    );
    this.makeInteractive(
      rightArm,
      "arms",
      new Rectangle(-17, -4, 30, 80),
      onTap,
    );

    const tag = new Text({
      text: "TECHNICAL LAYER PLACEHOLDER · NOT FINAL ART",
      style: {
        fontFamily: "Arial",
        fontSize: 9,
        fontWeight: "700",
        fill: "#d9c6ef",
        align: "center",
      },
    });
    tag.anchor.set(0.5, 0);
    tag.position.set(0, 188);
    tag.alpha = 0.78;
    tag.eventMode = "none";
    this.placeholderTag = tag;
    this.addChild(tag);

    // The placeholder builders set the placement on the art node; move it onto `pose`
    // so the artwork can be replaced without moving the layer.
    for (const stack of Object.values(this.stacks))
      this.liftRestTransform(stack);

    // Facial features sit at the head's placement, so they must adopt it AFTER the
    // head's own rest transform has been moved onto its pose node.
    headFeaturesHost.pose.position.copyFrom(headStack.pose.position);

    startIdlePose({
      torso: torsoStack.idle,
      frontHair: frontHairStack.idle,
      backHair: backHairStack.idle,
      eyes: eyesStack.idle,
      eyelids: eyelidsStack.idle,
    });
  }

  setScaleForViewport(scale: number): void {
    const safeScale = Math.max(0.35, Math.min(1.15, scale));
    this.scale.set(safeScale);
    this.glow.clear().circle(0, 0, 116).fill({ color: 0x9b5bd1, alpha: 0.055 });
    this.glow
      .circle(0, 0, 114)
      .stroke({ color: 0xc785ed, alpha: 0.16, width: 1 });
    this.glow.eventMode = "none";
  }

  reactToTap(zone: HeroineTouchZone): void {
    // Reactions target the `pose` containers so they compose with the idle loop
    // instead of overwriting the same transform.
    playZoneReaction(
      {
        head: this.stacks.head.pose,
        frontHair: this.stacks.frontHair.pose,
        backHair: this.stacks.backHair.pose,
        torso: this.stacks.torso.pose,
        leftArm: this.stacks.leftArm.pose,
        rightArm: this.stacks.rightArm.pose,
      },
      zone,
    );
  }

  /**
   * Replaces the vector placeholder with atlas artwork, in place.
   *
   * The rig geometry, hit areas and animation stacks stay untouched: only the contents
   * of each `art` container change. Frames whose name is missing from the atlas keep
   * their placeholder, so a partial atlas degrades gracefully instead of blanking out.
   *
   * Returns the names of the frames that could not be applied.
   */
  /**
   * Detaches the rest transform from the artwork node.
   *
   * Placeholder builders set `layer.position` on the art container; after wrapping, that
   * position must live on `pose` so swapping the art cannot move the layer.
   */
  private liftRestTransform(stack: AnimationLayer): void {
    stack.pose.position.copyFrom(stack.art.position);
    stack.art.position.set(0, 0);
  }

  applyArt(source: HeroineArtSource): string[] {
    const missing: string[] = [];
    for (const [frameName, stack] of Object.entries(this.stacks)) {
      const texture = source.texture(
        ART_FRAME_NAMES[frameName as keyof HeroineRigStacks] ?? frameName,
      );
      const pivot = source.pivot(
        ART_FRAME_NAMES[frameName as keyof HeroineRigStacks] ?? frameName,
      );
      if (!texture || !pivot) {
        missing.push(frameName);
        continue;
      }
      const sprite = new Sprite(texture);
      // Anchor places the rig origin exactly where the bake recorded it.
      sprite.anchor.set(pivot.x / texture.width, pivot.y / texture.height);
      sprite.label = `${frameName} art sprite`;
      stack.art.removeChildren();
      stack.art.addChild(sprite);
    }
    return missing;
  }

  /**
   * Keeps the "TECHNICAL LAYER PLACEHOLDER" caption inside the free area of the screen.
   *
   * On narrow (280-320 px) and landscape viewports the caption used to collide with the
   * touch-zone hint under the rig. `bottomLimitPx` is the y coordinate, in scene space,
   * that the caption must stay above; `null` restores the default position.
   */
  setTagBottomLimit(bottomLimitPx: number | null): void {
    if (!this.placeholderTag) return;
    if (bottomLimitPx === null) {
      this.placeholderTag.position.set(0, 188);
      return;
    }
    const tagOffset = Number.isFinite(bottomLimitPx) ? bottomLimitPx : 188;
    this.placeholderTag.position.set(0, Math.min(188, tagOffset));
  }

  private createBackHair(target: Container): Container {
    const layer = target;
    layer.label = "back hair placeholder";
    layer.position.set(0, -91);
    const shape = new Graphics();
    shape.ellipse(0, 14, 56, 66).fill({ color: FILL, alpha: 0.18 });
    shape
      .ellipse(0, 14, 56, 66)
      .stroke({ color: ACCENT, alpha: 0.78, width: 2 });
    shape
      .moveTo(-43, 23)
      .lineTo(-52, 73)
      .lineTo(-36, 54)
      .stroke({ color: LINE, alpha: 0.8, width: 2 });
    shape
      .moveTo(43, 23)
      .lineTo(52, 73)
      .lineTo(36, 54)
      .stroke({ color: LINE, alpha: 0.8, width: 2 });
    shape
      .moveTo(-28, 57)
      .lineTo(-25, 83)
      .stroke({ color: ACCENT, alpha: 0.62, width: 1.5 });
    shape
      .moveTo(26, 57)
      .lineTo(24, 83)
      .stroke({ color: ACCENT, alpha: 0.62, width: 1.5 });
    layer.addChild(shape);
    return layer;
  }

  private createTorso(target: Container): Container {
    const layer = target;
    layer.label = "torso placeholder";
    layer.position.set(0, 0);
    const shape = new Graphics();
    shape.roundRect(-37, -4, 74, 122, 28).fill({ color: FILL, alpha: 0.24 });
    shape
      .roundRect(-37, -4, 74, 122, 28)
      .stroke({ color: LINE, alpha: 0.88, width: 2 });
    shape
      .moveTo(0, 7)
      .lineTo(0, 105)
      .stroke({ color: ACCENT, alpha: 0.42, width: 1 });
    shape
      .moveTo(-22, 33)
      .lineTo(22, 33)
      .stroke({ color: ACCENT, alpha: 0.48, width: 1 });
    shape
      .moveTo(-20, 76)
      .lineTo(20, 76)
      .stroke({ color: ACCENT, alpha: 0.48, width: 1 });
    shape.circle(0, 34, 3).fill({ color: 0xff9cde, alpha: 0.9 });
    shape.circle(0, 76, 3).fill({ color: 0xff9cde, alpha: 0.9 });
    layer.addChild(shape);
    return layer;
  }

  private createArm(side: -1 | 1, target: Container): Container {
    const layer = target;
    layer.label = side < 0 ? "left arm placeholder" : "right arm placeholder";
    layer.position.set(side * 45, 19);
    layer.rotation = side * 0.12;
    const shape = new Graphics();
    shape.roundRect(-8, 0, 16, 73, 8).fill({ color: FILL, alpha: 0.2 });
    shape
      .roundRect(-8, 0, 16, 73, 8)
      .stroke({ color: LINE, alpha: 0.84, width: 2 });
    shape.circle(0, 4, 5).fill({ color: ACCENT, alpha: 0.8 });
    shape.circle(0, 68, 7).stroke({ color: ACCENT, alpha: 0.7, width: 1.5 });
    layer.addChild(shape);
    return layer;
  }

  private createHead(target: Container): Container {
    const head = target;
    head.label = "head placeholder";
    head.position.set(0, -91);
    const outline = new Graphics();
    outline.ellipse(0, 0, 39, 46).fill({ color: FILL, alpha: 0.25 });
    outline
      .ellipse(0, 0, 39, 46)
      .stroke({ color: LINE, alpha: 0.92, width: 2 });
    outline
      .moveTo(-31, -18)
      .lineTo(31, -18)
      .stroke({ color: ACCENT, alpha: 0.32, width: 1 });
    head.addChild(outline);

    const eyes = new Container();
    eyes.label = "eyes placeholder layer";
    const eyesGraphic = new Graphics();
    eyesGraphic.ellipse(-14, 2, 5, 3).fill({ color: 0xffffff, alpha: 0.9 });
    eyesGraphic.ellipse(14, 2, 5, 3).fill({ color: 0xffffff, alpha: 0.9 });
    eyesGraphic.circle(-14, 2, 1.8).fill({ color: ACCENT });
    eyesGraphic.circle(14, 2, 1.8).fill({ color: ACCENT });
    eyesGraphic.circle(-14, 2, 0.7).fill({ color: 0x30213f });
    eyesGraphic.circle(14, 2, 0.7).fill({ color: 0x30213f });
    eyes.addChild(eyesGraphic);
    head.addChild(eyes);

    const eyelids = new Container();
    eyelids.label = "eyelids placeholder layer";
    eyelids.alpha = 0;
    const lidsGraphic = new Graphics();
    lidsGraphic
      .moveTo(-20, 1)
      .lineTo(-8, 1)
      .stroke({ color: LINE, alpha: 0.95, width: 2 });
    lidsGraphic
      .moveTo(8, 1)
      .lineTo(20, 1)
      .stroke({ color: LINE, alpha: 0.95, width: 2 });
    eyelids.addChild(lidsGraphic);
    head.addChild(eyelids);

    const mouth = new Container();
    mouth.label = "mouth placeholder layer";
    mouth.position.set(0, 16);
    const mouthGraphic = new Graphics();
    mouthGraphic
      .ellipse(0, 0, 5, 2)
      .stroke({ color: 0xffa8dc, alpha: 0.9, width: 1.5 });
    mouth.addChild(mouthGraphic);
    head.addChild(mouth);
    return head;
  }

  private createFrontHair(target: Container): Container {
    const layer = target;
    layer.label = "front hair placeholder";
    layer.position.set(0, -91);
    const shape = new Graphics();
    shape
      .moveTo(-39, -2)
      .lineTo(-37, -37)
      .lineTo(-23, -29)
      .lineTo(-11, -45)
      .lineTo(1, -30);
    shape
      .lineTo(16, -43)
      .lineTo(29, -27)
      .lineTo(39, -34)
      .lineTo(38, -3)
      .stroke({ color: 0xffa7e4, alpha: 0.94, width: 2 });
    shape
      .moveTo(-21, -27)
      .lineTo(-14, 10)
      .stroke({ color: ACCENT, alpha: 0.68, width: 1.5 });
    shape
      .moveTo(3, -28)
      .lineTo(8, 11)
      .stroke({ color: ACCENT, alpha: 0.68, width: 1.5 });
    shape
      .moveTo(25, -25)
      .lineTo(21, 7)
      .stroke({ color: ACCENT, alpha: 0.68, width: 1.5 });
    shape.circle(-37, -35, 3).fill({ color: LINE, alpha: 0.9 });
    shape.circle(29, -27, 3).fill({ color: LINE, alpha: 0.9 });
    layer.addChild(shape);
    return layer;
  }

  private makeInteractive(
    layer: Container,
    zone: HeroineTouchZone,
    hitArea: Circle | Rectangle,
    onTap: (zone: HeroineTouchZone, localX: number, localY: number) => void,
  ): void {
    layer.eventMode = "static";
    layer.cursor = "pointer";
    layer.hitArea = hitArea;
    layer.on("pointertap", (event) => {
      // One reward path per interactive node: pointertap is the sole event that grants currency.
      const point = event.getLocalPosition(this);
      this.reactToTap(zone);
      onTap(zone, point.x, point.y);
    });
  }
}
