import {
  Assets,
  Container,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import type { FederatedPointerEvent } from "pixi.js";
import type { HeroineTouchZone } from "../../domain/economy/types.ts";
import {
  applyReaction,
  decayReaction,
  EXPRESSION_COMBOS,
  EXPRESSION_STATES,
  FACE_PLATE_RECT,
  TAP_EXPRESSION_STATES,
  NO_REACTION,
  reactionEnergy,
  RIG_CANVAS,
  rigFrameAt,
  triggerReaction,
} from "./animationMath.ts";
import type {
  ExpressionOverride,
  ExpressionStateName,
  ReactionState,
  RigFrame,
  RigGroupId,
  TouchZone,
} from "./animationMath.ts";
import {
  ALL_RUNTIME_TEXTURE_URLS,
  EXPRESSION_OVERLAY_URLS,
  LAYER_URLS,
  SLOT_DEFINITIONS,
  STATE_PLATE_URLS,
  SWITCH_MATRIX,
  UNDERLAY_UNION_URL,
} from "./heroineAssets.ts";
import type { SlotDefinition } from "./heroineAssets.ts";

const DEG_TO_RAD = Math.PI / 180;

const GROUP_PIVOTS: Record<RigGroupId, { x: number; y: number }> = {
  bodyRoot: { x: 424, y: 490 },
  headGroup: { x: 424, y: 262 },
  backHairGroup: { x: 424, y: 250 },
  frontHairGroup: { x: 424, y: 115 },
  legGroup: { x: 424, y: 675 },
  armGroupL: { x: 300, y: 335 },
  armGroupR: { x: 548, y: 335 },
  outfitGroup: { x: 424, y: 490 },
  faceGroup: { x: 424, y: 180 },
};

interface TouchOverride {
  state: ExpressionStateName;
  remainingMs: number;
  totalMs: number;
}

interface HitShape {
  zone: TouchZone;
  draw: (graphics: Graphics) => void;
}

function shiftContainer(container: Container, x: number, y: number): Container {
  container.pivot.set(x, y);
  container.position.set(x, y);
  return container;
}

function filledRect(
  graphics: Graphics,
  x: number,
  y: number,
  width: number,
  height: number,
): void {
  graphics.rect(x, y, width, height).fill({ color: 0xffffff, alpha: 0.001 });
}

function filledEllipse(
  graphics: Graphics,
  x: number,
  y: number,
  radiusX: number,
  radiusY: number,
): void {
  graphics
    .ellipse(x, y, radiusX, radiusY)
    .fill({ color: 0xffffff, alpha: 0.001 });
}

/**
 * Production HEROINE-01 rig built from the 20 approved BLOCK 1 RGBA slots.
 *
 * The art containers are always identity at rest; pose/idle/reaction transforms
 * live on nested group containers with the approved pivots.  Face states are
 * cross-faded crops of the 10 approved E2-V2 full-frame states.  No AI art,
 * no new expressions, no Live2D/Spine/Cubism runtime, no Phaser/Unity/Godot.
 */
export class ProductionHeroineRig extends Container {
  private readonly onTap: (
    zone: HeroineTouchZone,
    localX: number,
    localY: number,
  ) => void;
  private readonly groups = {} as Record<RigGroupId, Container>;
  private readonly groupBases = {} as Record<
    RigGroupId,
    { x: number; y: number }
  >;
  private readonly slotContainers = new Map<number, Container>();
  private readonly facePlates = new Map<ExpressionStateName, Sprite>();
  private readonly hitLayer = new Container();
  private underlay: Sprite | null = null;
  /** Clean runtime composite of the 20 approved slots; fills motion seams. */
  private coverage: Sprite | null = null;
  private loadingText: Text | null = null;
  private ready = false;
  private timeMs = 0;
  private reaction: ReactionState = { ...NO_REACTION };
  private touchOverride: TouchOverride | null = null;

  constructor(
    onTap: (zone: HeroineTouchZone, localX: number, localY: number) => void,
  ) {
    super();
    this.label = "HEROINE-01 production layered rig";
    this.onTap = onTap;
    this.pivot.set(RIG_CANVAS.width / 2, RIG_CANVAS.height / 2);
    this.position.set(0, 0);

    this.loadingText = new Text({
      text: "ЗАГРУЗКА УТВЕРЖДЁННЫХ СЛОЁВ…",
      style: {
        fontFamily: "Arial",
        fontSize: 16,
        fontWeight: "700",
        fill: "#e8d8ff",
        align: "center",
      },
    });
    this.loadingText.anchor.set(0.5);
    this.loadingText.position.set(RIG_CANVAS.width / 2, RIG_CANVAS.height / 2);
    this.loadingText.eventMode = "none";
    this.addChild(this.loadingText);

    void this.loadAssets();
  }

  setScaleForViewport(scale: number): void {
    const safe = Math.max(0.18, Math.min(1.1, scale));
    this.scale.set(safe);
  }

  /** Kept as a no-op for the existing MainScene layout contract. */
  setTagBottomLimit(bottomLimitPx: number | null): void {
    void bottomLimitPx;
  }

  reactToTap(zone: HeroineTouchZone): void {
    this.reaction = triggerReaction(zone as TouchZone);
    this.touchOverride = {
      state: TAP_EXPRESSION_STATES[zone as TouchZone],
      remainingMs: 900,
      totalMs: 900,
    };
  }

  update(elapsedMs: number): void {
    if (!this.ready || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
    this.timeMs += elapsedMs;
    this.reaction = decayReaction(this.reaction, elapsedMs);
    if (reactionEnergy(this.reaction) < 0.002)
      this.reaction = { ...NO_REACTION };

    let override: ExpressionOverride | null = null;
    if (this.touchOverride) {
      this.touchOverride.remainingMs -= elapsedMs;
      if (this.touchOverride.remainingMs <= 0) {
        this.touchOverride = null;
      } else {
        // One opaque, approved both-eye plate stays dominant for the whole
        // 900 ms reaction.  A fading weight below 0.5 let the neutral plate
        // win mid-reaction and made later-zone taps look open-eyed again.
        override = {
          state: this.touchOverride.state,
          weight: 1,
        };
      }
    }

    const frame = applyReaction(
      rigFrameAt(this.timeMs, override),
      this.reaction,
    );
    this.applyFrame(frame);
  }

  /** Deterministic manifest used by the Block 2 verification report. */
  getAssetManifest(): {
    slots: number;
    statePlates: number;
    expressionOverlays: number;
    switchMatrixStates: number;
    runtimeTextures: number;
  } {
    return {
      slots: SLOT_DEFINITIONS.length,
      statePlates: Object.keys(STATE_PLATE_URLS).length,
      expressionOverlays: Object.keys(EXPRESSION_OVERLAY_URLS).length,
      switchMatrixStates: Object.keys(SWITCH_MATRIX).length,
      runtimeTextures: ALL_RUNTIME_TEXTURE_URLS.length,
    };
  }

  private async loadAssets(): Promise<void> {
    try {
      const entries: Array<readonly [string, Texture]> = await Promise.all(
        ALL_RUNTIME_TEXTURE_URLS.map(
          async (url): Promise<readonly [string, Texture]> =>
            [url, await Assets.load<Texture>(url)] as const,
        ),
      );
      const textures = new Map<string, Texture>(entries);
      this.validateSwitchMatrix();
      this.build(textures);
      if (this.loadingText) {
        this.removeChild(this.loadingText);
        this.loadingText.destroy();
        this.loadingText = null;
      }
      this.ready = true;
      this.applyFrame(applyReaction(rigFrameAt(0), { ...NO_REACTION }));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.loadingText) {
        this.loadingText.text = `ОШИБКА ЗАГРУЗКИ АРТА: ${message}`;
        this.loadingText.style.fill = "#ff9db4";
      }
      console.error("HEROINE-01 production assets failed to load", error);
    }
  }

  private validateSwitchMatrix(): void {
    for (const url of Object.values(EXPRESSION_OVERLAY_URLS)) {
      if (!url) throw new Error("Missing approved expression overlay URL.");
    }
    if (Object.keys(SWITCH_MATRIX).length !== EXPRESSION_STATES.length) {
      throw new Error(
        "Switch matrix does not contain exactly 10 approved states.",
      );
    }
    for (const state of EXPRESSION_STATES) {
      const expected = SWITCH_MATRIX[state]?.expressions ?? [];
      const actual = EXPRESSION_COMBOS[state];
      if (
        expected.length !== actual.length ||
        expected.some(
          (name) => !actual.includes(name as (typeof actual)[number]),
        )
      ) {
        throw new Error(`Expression combo mismatch for ${state}.`);
      }
    }
  }

  private build(textures: Map<string, Texture>): void {
    const underlayTexture = textures.get(UNDERLAY_UNION_URL);
    if (!underlayTexture) throw new Error("Missing UNDERLAY-UNION texture.");
    this.underlay = new Sprite(underlayTexture);
    // Snap sprite vertices to whole physical pixels. Fractional vertices make
    // the GPU resample the approved one-pixel dark contours into speckles.
    this.underlay.roundPixels = true;
    this.underlay.label = "z0 coverage support";
    this.underlay.position.set(0, 0);
    this.underlay.alpha = 0;
    this.underlay.visible = false;
    this.underlay.eventMode = "none";
    this.addChild(this.underlay);
    this.buildCoverage(textures);

    for (const id of Object.keys(GROUP_PIVOTS) as RigGroupId[]) {
      const pivot = GROUP_PIVOTS[id];
      const group = shiftContainer(new Container(), pivot.x, pivot.y);
      group.label = `rig group ${id}`;
      this.groups[id] = group;
      this.groupBases[id] = { x: pivot.x, y: pivot.y };
    }

    const bodyRoot = this.groups.bodyRoot;
    bodyRoot.addChild(
      this.groups.backHairGroup,
      this.groups.legGroup,
      this.groups.armGroupL,
      this.groups.armGroupR,
      this.groups.outfitGroup,
      this.groups.headGroup,
    );
    this.groups.headGroup.addChild(
      this.groups.faceGroup,
      this.groups.frontHairGroup,
    );
    this.addChild(bodyRoot);

    for (const slot of SLOT_DEFINITIONS) {
      const url = LAYER_URLS[slot.z];
      const texture = url ? textures.get(url) : undefined;
      if (!texture)
        throw new Error(`Missing RGBA slot z${slot.z}: ${slot.slot}.`);
      const holder = shiftContainer(
        new Container(),
        slot.pivotAbsolute.x,
        slot.pivotAbsolute.y,
      );
      holder.label = `z${String(slot.z).padStart(2, "0")} ${slot.slot}`;
      const sprite = new Sprite(texture);
      sprite.roundPixels = true;
      sprite.label = `${slot.slot} art`;
      sprite.position.set(0, 0);
      sprite.eventMode = "none";
      holder.addChild(sprite);
      this.slotContainers.set(slot.z, holder);
      this.parentSlot(holder, slot);
    }

    this.buildFacePlates(textures);
    this.buildHitZones();
  }

  private parentSlot(holder: Container, slot: SlotDefinition): void {
    switch (slot.z) {
      case 1:
      case 2:
        this.groups.backHairGroup.addChild(holder);
        break;
      case 3:
      case 4:
        this.groups.legGroup.addChild(holder);
        break;
      case 5:
        this.groups.bodyRoot.addChildAt(holder, 2);
        break;
      case 6:
        this.groups.armGroupL.addChild(holder);
        break;
      case 7:
        this.groups.armGroupR.addChild(holder);
        break;
      case 8:
      case 9:
      case 10:
      case 11:
      case 12:
        this.groups.outfitGroup.addChild(holder);
        break;
      case 13:
      case 14:
      case 15:
      case 16: {
        // The head base, open eyes and neutral mouth are replaced by the
        // approved full-frame state plates below.  A face-shaped mask keeps
        // only those approved face pixels; the flattened plate background and
        // all hair outside the mask never enter the transparent rig.
        holder.visible = false;
        this.groups.faceGroup.addChild(holder);
        break;
      }
      case 17:
      case 18:
      case 19:
      case 20:
        this.groups.frontHairGroup.addChild(holder);
        break;
      default:
        throw new Error(`Unexpected slot z${slot.z}.`);
    }
  }

  /**
   * Builds a CLEAN coverage support from the 20 approved RGBA slots.
   *
   * The slots have zero overlap by construction, so independent limb motion
   * can open a 1px transparent seam.  The approved UNDERLAY-UNION PNG carried
   * dotted contour strokes and is kept hidden.  Instead we composite the same
   * approved layer images into an offscreen canvas at rest, 1:1, in z-order.
   * This is a deterministic runtime copy of approved pixels only: no AI, no
   * inpainting, no generative fill, no pixel deletion, no disk art changes.
   * It sits behind every animated group, so a seam shows approved rest art
   * rather than the near-black page background.
   */
  private buildCoverage(textures: Map<string, Texture>): void {
    const canvas = document.createElement("canvas");
    canvas.width = RIG_CANVAS.width;
    canvas.height = RIG_CANVAS.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D context unavailable for coverage composite.");
    ctx.imageSmoothingEnabled = false;
    for (let z = 1; z <= 20; z += 1) {
      const url = LAYER_URLS[z];
      const texture = url ? textures.get(url) : undefined;
      if (!texture)
        throw new Error(`Missing approved slot z${z} for coverage.`);
      const resource = texture.source.resource as CanvasImageSource;
      ctx.drawImage(resource, 0, 0);
    }
    const coverageTexture = Texture.from(canvas);
    const sprite = new Sprite(coverageTexture);
    sprite.roundPixels = true;
    sprite.label = "runtime approved-pixel coverage composite";
    sprite.position.set(0, 0);
    sprite.alpha = 1;
    sprite.eventMode = "none";
    this.coverage = sprite;
    this.addChild(sprite);
  }

  private buildFacePlates(textures: Map<string, Texture>): void {
    const faceGroup = this.groups.faceGroup;
    const mask = new Graphics();
    mask.label = "approved face-state crop mask";
    mask
      .roundRect(
        FACE_PLATE_RECT.x,
        FACE_PLATE_RECT.y,
        FACE_PLATE_RECT.width,
        FACE_PLATE_RECT.height,
        FACE_PLATE_RECT.radius,
      )
      .fill({ color: 0xffffff, alpha: 1 });
    mask.eventMode = "none";
    mask.roundPixels = true;
    faceGroup.addChild(mask);

    for (const state of EXPRESSION_STATES) {
      const url = STATE_PLATE_URLS[state];
      const texture = textures.get(url);
      if (!texture) throw new Error(`Missing approved face state ${state}.`);
      const cropped = new Texture({
        source: texture.source,
        frame: new Rectangle(
          FACE_PLATE_RECT.x,
          FACE_PLATE_RECT.y,
          FACE_PLATE_RECT.width,
          FACE_PLATE_RECT.height,
        ),
      });
      const sprite = new Sprite(cropped);
      sprite.roundPixels = true;
      sprite.label = `approved state ${state}`;
      sprite.position.set(FACE_PLATE_RECT.x, FACE_PLATE_RECT.y);
      sprite.alpha = state === "00-neutral" ? 1 : 0;
      sprite.eventMode = "none";
      sprite.mask = mask;
      faceGroup.addChild(sprite);
      this.facePlates.set(state, sprite);
    }
  }

  private buildHitZones(): void {
    this.hitLayer.label = "HEROINE-01 touch zones";
    this.hitLayer.eventMode = "passive";
    const shapes: readonly HitShape[] = [
      {
        zone: "hair",
        draw: (g) => {
          filledRect(g, 110, 80, 190, 640);
          filledRect(g, 548, 80, 190, 640);
          filledEllipse(g, 424, 135, 150, 115);
        },
      },
      {
        zone: "body",
        draw: (g) => {
          filledRect(g, 270, 280, 308, 300);
          filledRect(g, 300, 460, 248, 220);
        },
      },
      {
        zone: "arms",
        draw: (g) => {
          filledRect(g, 95, 315, 220, 350);
          filledRect(g, 533, 315, 220, 350);
        },
      },
      {
        zone: "head",
        draw: (g) => {
          filledEllipse(g, 424, 180, 78, 95);
        },
      },
    ];
    for (const shape of shapes) {
      const g = new Graphics();
      g.label = `touch zone ${shape.zone}`;
      g.roundPixels = true;
      shape.draw(g);
      g.eventMode = "static";
      g.cursor = "pointer";
      g.on("pointertap", (event: FederatedPointerEvent) => {
        event.stopPropagation();
        const local = event.getLocalPosition(this);
        this.reactToTap(shape.zone as HeroineTouchZone);
        this.onTap(shape.zone as HeroineTouchZone, local.x, local.y);
      });
      this.hitLayer.addChild(g);
    }
    this.addChild(this.hitLayer);
  }

  private applyFrame(frame: RigFrame): void {
    for (const id of Object.keys(this.groups) as RigGroupId[]) {
      const group = this.groups[id];
      const base = this.groupBases[id];
      const t = frame.groups[id];
      group.position.set(base.x + t.x, base.y + t.y);
      group.rotation = t.rotationDeg * DEG_TO_RAD;
      group.scale.set(t.scaleX, t.scaleY);
    }
    for (const [z, holder] of this.slotContainers) {
      holder.rotation = (frame.slots[z] ?? 0) * DEG_TO_RAD;
    }
    // The approved dotted UNDERLAY-UNION stays hidden.  The clean runtime
    // composite of the same 20 approved slots is always visible behind the
    // animated groups, so independent motion cannot expose the dark page.
    if (this.underlay) this.underlay.visible = false;
    if (this.coverage) this.coverage.visible = true;

    // Render exactly one approved face plate at full opacity. Sequential
    // alpha-blending of several plates let the dark plate background leak
    // through and made the face turn brown on tap.
    let dominant: ExpressionStateName = "00-neutral";
    let dominantAlpha = -1;
    for (const state of EXPRESSION_STATES) {
      const alpha = frame.expressionTargets[state] ?? 0;
      if (alpha > dominantAlpha) {
        dominantAlpha = alpha;
        dominant = state;
      }
    }
    for (const state of EXPRESSION_STATES) {
      const sprite = this.facePlates.get(state);
      if (!sprite) continue;
      const active = state === dominant;
      sprite.alpha = active ? 1 : 0;
      sprite.visible = active;
    }
  }
}
