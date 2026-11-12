import {
  Assets,
  Container,
  Graphics,
  Mesh,
  MeshGeometry,
  Rectangle,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import type { FederatedPointerEvent } from "pixi.js";
import type { HeroineTouchZone } from "../../domain/economy/types.ts";
import {
  applyReaction,
  breathWeight,
  clampedAnimationDeltaMs,
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
import { solidifyInteriorHoles } from "./alphaRepair.ts";
import {
  ALL_RUNTIME_TEXTURE_URLS,
  ORIGINAL_ART_URL,
  EXPRESSION_OVERLAY_URLS,
  LAYER_URLS,
  SLOT_DEFINITIONS,
  STATE_PLATE_URLS,
  SWITCH_MATRIX,
  UNDERLAY_UNION_URL,
} from "./heroineAssets.ts";
import type { SlotDefinition } from "./heroineAssets.ts";
import {
  ANIMATED_LIMB_SLOTS,
  BREATH,
  BREATH_MESH_SLOTS,
  HIDDEN_FACE_BASE_SLOTS,
  LEG_POSE,
  RUNTIME_TEXTURE,
} from "./renderConfig.ts";

const DEG_TO_RAD = Math.PI / 180;

/** Narrow resource type accepted by both Canvas2D.drawImage and PixiJS textures. */
type ApprovedSlotResource =
  HTMLImageElement | ImageBitmap | HTMLCanvasElement | OffscreenCanvas;

/**
 * Decodes the approved slot PNGs to byte-exact straight RGBA.
 *
 * The approved PNGs carry gAMA/cHRM chunks.  A browser decode into a 2D
 * canvas colour-manages those chunks (shifting even fully opaque approved
 * RGB by several levels) and premultiplies, so `getImageData` returned
 * drifted colours on every semi-transparent contour pixel — exactly the
 * pixels that form the approved 1px outlines.  Decoding via
 * `createImageBitmap(premultiplyAlpha:"none", colorSpaceConversion:"none")`
 * and reading the texels back through a scratch WebGL framebuffer returns
 * the PNG bytes unchanged.  Browsers without those options fall back to the
 * legacy canvas decode (`null` entries) rather than failing to boot.
 */
async function decodeStraightSlotPixels(
  urls: readonly string[],
): Promise<Map<string, Uint8ClampedArray>> {
  const result = new Map<string, Uint8ClampedArray>();
  if (typeof createImageBitmap !== "function") return result;
  const scratch = document.createElement("canvas");
  scratch.width = 1;
  scratch.height = 1;
  const gl = scratch.getContext("webgl", {
    alpha: true,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    antialias: false,
    depth: false,
    stencil: false,
  });
  if (!gl) return result;
  const texture = gl.createTexture();
  const framebuffer = gl.createFramebuffer();
  try {
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    for (const url of urls) {
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        const bitmap = await createImageBitmap(await response.blob(), {
          premultiplyAlpha: "none",
          colorSpaceConversion: "none",
        });
        const { width, height } = bitmap;
        if (width !== RIG_CANVAS.width || height !== RIG_CANVAS.height) {
          bitmap.close();
          continue;
        }
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGBA,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          bitmap,
        );
        bitmap.close();
        gl.framebufferTexture2D(
          gl.FRAMEBUFFER,
          gl.COLOR_ATTACHMENT0,
          gl.TEXTURE_2D,
          texture,
          0,
        );
        if (
          gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE
        ) {
          continue;
        }
        const bytes = new Uint8ClampedArray(width * height * 4);
        gl.readPixels(
          0,
          0,
          width,
          height,
          gl.RGBA,
          gl.UNSIGNED_BYTE,
          new Uint8Array(bytes.buffer),
        );
        result.set(url, bytes);
      } catch {
        // Fall back to the legacy canvas decode for this slot.
      }
    }
  } finally {
    gl.deleteFramebuffer(framebuffer);
    gl.deleteTexture(texture);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
  return result;
}

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

/** Vertical subdivisions for the two one-slot leg pose meshes. */
const LEG_MESH_ROWS = [
  0, 300, 600, 720, 780, 840, 900, 960, 1020, 1080, 1140, 1210, 1264,
] as const;

/**
 * Vertical subdivisions for the shared breathing field meshes: ONE row per
 * art pixel inside the active band, whose displacement is rounded to whole
 * pixels identically for every slot.  Fractional bilinear resampling of the
 * approved 1px weak-alpha contours visibly broke them into dots, so the
 * field must move the art only on the integer pixel grid.  Rows outside the
 * band never move.
 */
const BREATH_MESH_ROWS: readonly number[] = (() => {
  const rows: number[] = [0];
  for (let y = BREATH.topY - 20; y <= BREATH.bottomY + 20; y += 1) {
    rows.push(y);
  }
  rows.push(RIG_CANVAS.height);
  return rows;
})();

interface RuntimeSlotBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RuntimeSlotTexture {
  texture: Texture;
  bounds: RuntimeSlotBounds;
}

interface LegMesh {
  geometry: MeshGeometry;
  positions: Float32Array;
  weights: readonly number[];
  left: number;
  right: number;
}

interface BreathMesh {
  geometry: MeshGeometry;
  positions: Float32Array;
  /** Base (undeformed) y of every mesh row, in absolute art pixels. */
  baseRows: readonly number[];
  /** breathWeight() of every mesh row; identical rows across slots match. */
  weights: readonly number[];
}

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

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Bounded knee-area weight: zero at the hip anchor and at the ankle. */
function legWarpWeight(y: number): number {
  if (y <= LEG_POSE.hipAnchorY || y >= LEG_POSE.ankleY) return 0;
  if (y < LEG_POSE.kneeY) {
    return clamp01(
      (y - LEG_POSE.hipAnchorY) / (LEG_POSE.kneeY - LEG_POSE.hipAnchorY),
    );
  }
  return clamp01((LEG_POSE.ankleY - y) / (LEG_POSE.ankleY - LEG_POSE.kneeY));
}

/**
 * Creates a compact runtime texture for one approved RGBA slot.
 *
 * The 20 original PNGs are straight RGBA with black RGB in transparent pixels;
 * linear WebGL sampling otherwise mixes that black into thin dark/white
 * contours.  Alpha bleed copies only neighbouring approved edge RGB into
 * alpha=0 padding.  The texture is then cropped, with 2px of padded margin, to
 * that slot's real alpha bounds: full-canvas transparent quads were expensive
 * enough on a mobile GPU to make the ticker appear frozen.
 *
 * The bleed MUST NOT be round-tripped through another HTMLCanvasElement.  A
 * 2D canvas is premultiplied internally: `putImageData` discards RGB wherever
 * alpha is 0, so every padded edge colour became transparent black again.  The
 * cropped bytes are therefore handed to PixiJS as a straight RGBA
 * BufferImageSource.  WebGL uploads ArrayBufferView texels verbatim with
 * `UNPACK_PREMULTIPLY_ALPHA_WEBGL=false`, and PixiJS pairs
 * `no-premultiply-alpha` with its `normal-npm` blend.  This preserves padded
 * edge colours during rotation/mesh sampling without changing any approved
 * pixel, scaling or masking the art, editing a PNG on disk or drawing new art.
 * The returned absolute bounds keep every slot pivot/warp unchanged.
 */
function runtimeSlotTexture(
  resource: ApprovedSlotResource,
  slotZ: number,
  straightPixels?: Uint8ClampedArray,
  originalArtPixels?: Uint8ClampedArray,
): RuntimeSlotTexture {
  let data: Uint8ClampedArray;
  if (straightPixels) {
    data = straightPixels;
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = RIG_CANVAS.width;
    canvas.height = RIG_CANVAS.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2D context unavailable for alpha bleed.");
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(resource, 0, 0, RIG_CANVAS.width, RIG_CANVAS.height);
    data = ctx.getImageData(0, 0, RIG_CANVAS.width, RIG_CANVAS.height).data;
  }
  const width = RIG_CANVAS.width;
  const height = RIG_CANVAS.height;
  // Close the small interior alpha punch-holes left by the BLOCK 1 layer
  // separation BEFORE the bbox scan and edge bleed: the dark background
  // showed through them as black blotches on the blouse/hair.  Large
  // genuine openings are preserved; no PNG on disk changes.
  solidifyInteriorHoles(data, width, height, {
    alphaThreshold: RUNTIME_TEXTURE.interiorAlphaThreshold,
    maxHoleArea: RUNTIME_TEXTURE.interiorHoleMaxArea,
    protectedRects: RUNTIME_TEXTURE.approvedOpenings[slotZ] ?? [],
    restoreRgb: originalArtPixels,
  });
  let minX: number = width;
  let minY: number = height;
  let maxX = 0;
  let maxY = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + 1 > maxX) maxX = x + 1;
      if (y + 1 > maxY) maxY = y + 1;
    }
  }
  if (maxX <= minX || maxY <= minY) {
    throw new Error("Approved slot has no visible pixels.");
  }
  for (let pass = 0; pass < RUNTIME_TEXTURE.alphaBleedRadius; pass += 1) {
    const previous = new Uint8ClampedArray(data);
    for (let y = 1; y < height - 1; y += 1) {
      for (let x = 1; x < width - 1; x += 1) {
        const i = (y * width + x) * 4;
        if (previous[i + 3] !== 0) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let total = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            const j = ((y + dy) * width + (x + dx)) * 4;
            const alpha = previous[j + 3] ?? 0;
            if (alpha === 0) continue;
            const weight = alpha / 255;
            r += (previous[j] ?? 0) * weight;
            g += (previous[j + 1] ?? 0) * weight;
            b += (previous[j + 2] ?? 0) * weight;
            total += weight;
          }
        }
        if (total > 0) {
          data[i] = r / total;
          data[i + 1] = g / total;
          data[i + 2] = b / total;
          data[i + 3] = 0;
        }
      }
    }
  }
  const pad = RUNTIME_TEXTURE.alphaBleedRadius;
  const x = Math.max(0, minX - pad);
  const y = Math.max(0, minY - pad);
  const right = Math.min(width, maxX + pad);
  const bottom = Math.min(height, maxY + pad);
  const croppedWidth = right - x;
  const croppedHeight = bottom - y;
  const straightRgba = new Uint8Array(croppedWidth * croppedHeight * 4);
  for (let row = 0; row < croppedHeight; row += 1) {
    const src = ((y + row) * width + x) * 4;
    straightRgba.set(
      data.subarray(src, src + croppedWidth * 4),
      row * croppedWidth * 4,
    );
  }
  return {
    texture: Texture.from(
      {
        resource: straightRgba,
        width: croppedWidth,
        height: croppedHeight,
        format: "rgba8unorm",
        alphaMode: RUNTIME_TEXTURE.alphaMode,
        scaleMode: RUNTIME_TEXTURE.scaleMode,
        addressMode: RUNTIME_TEXTURE.addressMode,
      },
      true,
    ),
    bounds: { x, y, width: croppedWidth, height: croppedHeight },
  };
}

/**
 * Production HEROINE-01 rig built from the 20 approved BLOCK 1 RGBA slots.
 *
 * Every visible slot is drawn once, by its own animated group.  The previous
 * full-canvas "coverage" sprite was added AFTER bodyRoot, so it covered the
 * moving hair, outfit, arms and face plates with an immutable copy: on iPhone
 * the rig looked frozen even though its transforms changed.  There is no
 * rest-pose limb duplicate and no topmost static overlay now.  Both legs are
 * one approved slot each, rendered as a bounded hip rotation plus a graded
 * knee-area mesh warp.  This is visible pose motion, not anatomical knee or
 * ankle articulation; separate joints would need new approved art and explicit
 * permission.  No AI art, no new expressions, no Live2D/Spine/Cubism runtime.
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
  private readonly legMeshes = new Map<number, LegMesh>();
  private readonly breathMeshes = new Map<number, BreathMesh>();
  private readonly facePlates = new Map<ExpressionStateName, Sprite>();
  private readonly hitLayer = new Container();
  private underlay: Sprite | null = null;
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
    // The visible pose uses wall-clock phase; only reaction/override decay is
    // clamped so a suspended Safari tab does not teleport or drop a tap.
    this.timeMs += elapsedMs;
    const animationDeltaMs = clampedAnimationDeltaMs(elapsedMs);
    this.reaction = decayReaction(this.reaction, animationDeltaMs);
    if (reactionEnergy(this.reaction) < 0.002)
      this.reaction = { ...NO_REACTION };

    let override: ExpressionOverride | null = null;
    if (this.touchOverride) {
      this.touchOverride.remainingMs -= animationDeltaMs;
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
      const straightSlotPixels = await decodeStraightSlotPixels([
        ...SLOT_DEFINITIONS.map((slot) => LAYER_URLS[slot.z]).filter(
          (url): url is string => typeof url === "string",
        ),
        // Approved pre-separation original: read-only restoration source
        // for the interior pixels the layer separation punched out.
        ORIGINAL_ART_URL,
      ]);
      this.validateSwitchMatrix();
      this.build(textures, straightSlotPixels);
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

  private build(
    textures: Map<string, Texture>,
    straightSlotPixels: Map<string, Uint8ClampedArray>,
  ): void {
    const underlayTexture = textures.get(UNDERLAY_UNION_URL);
    if (!underlayTexture) throw new Error("Missing UNDERLAY-UNION texture.");
    this.underlay = new Sprite(underlayTexture);
    this.underlay.roundPixels = false;
    this.underlay.label = "z0 hidden approved underlay";
    this.underlay.position.set(0, 0);
    this.underlay.alpha = 0;
    this.underlay.visible = false;
    this.underlay.eventMode = "none";
    this.addChild(this.underlay);

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
      const original = url ? textures.get(url) : undefined;
      if (!url || !original)
        throw new Error(`Missing RGBA slot z${slot.z}: ${slot.slot}.`);
      const holder = shiftContainer(
        new Container(),
        slot.pivotAbsolute.x,
        slot.pivotAbsolute.y,
      );
      holder.label = `z${String(slot.z).padStart(2, "0")} ${slot.slot}`;
      const { texture, bounds } = runtimeSlotTexture(
        original.source.resource as ApprovedSlotResource,
        slot.z,
        straightSlotPixels.get(url),
        straightSlotPixels.get(ORIGINAL_ART_URL),
      );
      if (slot.z === 3 || slot.z === 4) {
        const leg = this.createLegMesh(texture, bounds);
        leg.mesh.label = `${slot.slot} pose mesh`;
        holder.addChild(leg.mesh);
        this.legMeshes.set(slot.z, leg.data);
      } else if ((BREATH_MESH_SLOTS as readonly number[]).includes(slot.z)) {
        const breathMesh = this.createBreathMesh(texture, bounds);
        breathMesh.mesh.label = `${slot.slot} breath mesh`;
        holder.addChild(breathMesh.mesh);
        this.breathMeshes.set(slot.z, breathMesh.data);
      } else {
        const sprite = new Sprite(texture);
        sprite.roundPixels = false;
        sprite.label = `${slot.slot} art`;
        sprite.position.set(bounds.x, bounds.y);
        sprite.eventMode = "none";
        holder.addChild(sprite);
      }
      this.slotContainers.set(slot.z, holder);
      this.parentSlot(holder, slot);
    }

    this.buildFacePlates(textures);
    this.assertVisibleSlotGraph();
    this.buildHitZones();
  }

  private createLegMesh(
    texture: Texture,
    bounds: RuntimeSlotBounds,
  ): { mesh: Mesh; data: LegMesh } {
    const left = bounds.x;
    const right = bounds.x + bounds.width;
    const bottom = bounds.y + bounds.height;
    const rows = [
      bounds.y,
      ...LEG_MESH_ROWS.filter((y) => y > bounds.y && y < bottom),
      bottom,
    ].sort((a, b) => a - b);
    const positions = new Float32Array(rows.length * 4);
    const uvs = new Float32Array(rows.length * 4);
    const indices = new Uint32Array((rows.length - 1) * 6);
    const weights = rows.map(legWarpWeight);
    for (let r = 0; r < rows.length; r += 1) {
      const y = rows[r] ?? 0;
      const v = (y - bounds.y) / bounds.height;
      positions[r * 4 + 0] = left;
      positions[r * 4 + 1] = y;
      positions[r * 4 + 2] = right;
      positions[r * 4 + 3] = y;
      uvs[r * 4 + 0] = 0;
      uvs[r * 4 + 1] = v;
      uvs[r * 4 + 2] = 1;
      uvs[r * 4 + 3] = v;
      if (r < rows.length - 1) {
        const i = r * 6;
        const a = r * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices[i] = a;
        indices[i + 1] = c;
        indices[i + 2] = b;
        indices[i + 3] = b;
        indices[i + 4] = c;
        indices[i + 5] = d;
      }
    }
    const geometry = new MeshGeometry({ positions, uvs, indices });
    geometry.batchMode = "batch";
    const mesh = new Mesh({ geometry, texture });
    mesh.roundPixels = false;
    mesh.eventMode = "none";
    mesh.position.set(0, 0);
    return {
      mesh,
      data: { geometry, positions, weights, left, right },
    };
  }

  /**
   * Row mesh for one torso-band slot deformed by the SHARED breathing field.
   * Rows are absolute art pixels, so two different slots sharing a row get a
   * bit-identical displacement and their zero-overlap seam stays closed; the
   * field is exactly zero at the neck and hip junction rows.
   */
  private createBreathMesh(
    texture: Texture,
    bounds: RuntimeSlotBounds,
  ): { mesh: Mesh; data: BreathMesh } {
    const left = bounds.x;
    const right = bounds.x + bounds.width;
    const bottom = bounds.y + bounds.height;
    const rows = [
      bounds.y,
      ...BREATH_MESH_ROWS.filter((y) => y > bounds.y && y < bottom),
      bottom,
    ].sort((a, b) => a - b);
    const positions = new Float32Array(rows.length * 4);
    const uvs = new Float32Array(rows.length * 4);
    const indices = new Uint32Array((rows.length - 1) * 6);
    const weights = rows.map(breathWeight);
    for (let r = 0; r < rows.length; r += 1) {
      const y = rows[r] ?? 0;
      const v = (y - bounds.y) / bounds.height;
      positions[r * 4 + 0] = left;
      positions[r * 4 + 1] = y;
      positions[r * 4 + 2] = right;
      positions[r * 4 + 3] = y;
      uvs[r * 4 + 0] = 0;
      uvs[r * 4 + 1] = v;
      uvs[r * 4 + 2] = 1;
      uvs[r * 4 + 3] = v;
      if (r < rows.length - 1) {
        const i = r * 6;
        const a = r * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices[i] = a;
        indices[i + 1] = c;
        indices[i + 2] = b;
        indices[i + 3] = b;
        indices[i + 4] = c;
        indices[i + 5] = d;
      }
    }
    const geometry = new MeshGeometry({ positions, uvs, indices });
    geometry.batchMode = "batch";
    const mesh = new Mesh({ geometry, texture });
    mesh.roundPixels = false;
    mesh.eventMode = "none";
    mesh.position.set(0, 0);
    return {
      mesh,
      data: { geometry, positions, baseRows: rows, weights },
    };
  }

  /** Applies the shared vertical breathing field to one torso-band mesh. */
  private applyBreathWarp(data: BreathMesh, liftPx: number): void {
    const { positions, baseRows, weights, geometry } = data;
    for (let r = 0; r < baseRows.length; r += 1) {
      // Whole-pixel per-row displacement: same row => same rounded value in
      // every slot, and no fractional resampling of 1px approved contours.
      const y = (baseRows[r] ?? 0) - Math.round(liftPx * (weights[r] ?? 0));
      positions[r * 4 + 1] = y;
      positions[r * 4 + 3] = y;
    }
    geometry.attributes.aPosition!.buffer.update();
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
        // Side locks share their cut contours with the collar: the front
        // hair group's secondary sway tore 1-2px slits between lock and
        // collar (Category-D).  The welded head group keeps them sealed.
        this.groups.headGroup.addChild(holder);
        break;
      case 19:
      case 20:
        this.groups.frontHairGroup.addChild(holder);
        break;
      default:
        throw new Error(`Unexpected slot z${slot.z}.`);
    }
  }

  /**
   * Assert the one-copy display list: hidden base face layers are replaced by
   * one approved state plate, while every other slot remains visible in its
   * animated group.  No static full-canvas sprite is added above bodyRoot.
   */
  private assertVisibleSlotGraph(): void {
    const hidden = new Set<number>(HIDDEN_FACE_BASE_SLOTS);
    for (const [z, holder] of this.slotContainers) {
      holder.visible = !hidden.has(z);
    }
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
    mask.roundPixels = false;
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
      sprite.roundPixels = false;
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
      g.roundPixels = false;
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

  private applyLegWarp(leg: LegMesh, warpPx: number): void {
    const { positions, weights, geometry, left, right } = leg;
    for (let r = 0; r < weights.length; r += 1) {
      const dx = warpPx * (weights[r] ?? 0);
      positions[r * 4 + 0] = left + dx;
      positions[r * 4 + 2] = right + dx;
    }
    geometry.attributes.aPosition!.buffer.update();
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
    for (const z of ANIMATED_LIMB_SLOTS) {
      if (z !== 3 && z !== 4) continue;
      const leg = this.legMeshes.get(z);
      if (leg) this.applyLegWarp(leg, frame.slotWarp[z] ?? 0);
    }
    // One shared breathing field for every torso-band slot: identical rows
    // displace identically, so the zero-overlap seams cannot open.
    for (const data of this.breathMeshes.values()) {
      this.applyBreathWarp(data, frame.breathLift);
    }
    // The approved dotted UNDERLAY-UNION stays hidden.  Every visible art
    // pixel comes from one animated slot or one opaque state plate; no static
    // rest-pose copy can cover a moving silhouette.
    if (this.underlay) this.underlay.visible = false;

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
