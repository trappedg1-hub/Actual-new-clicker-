import { Rectangle, Texture, TextureSource } from "pixi.js";

/**
 * Loading pipeline for HEROINE-01 artwork.
 *
 * The QA audit found the project had no image pipeline at all: every layer was a
 * `Graphics` drawing, and nothing could be swapped for artwork. This module adds the
 * missing piece without touching gameplay or layout:
 *
 * 1. a manifest describes the atlas and its frames;
 * 2. `loadHeroineArt` fetches it, validates it and builds one `Texture` per frame;
 * 3. `HeroineArtSource` exposes frames by layer name, so the rig can ask for
 *    "hair_front_01" without knowing where it lives in the atlas.
 *
 * Everything is optional by design: if the atlas is missing or malformed the loader
 * reports the reason and the rig keeps its vector placeholders. A broken asset must
 * never blank the screen the way the P0 label bug did.
 */

/** One rectangle inside the atlas page. */
export interface AtlasFrame {
  /** Frame name, e.g. "head_base". Becomes the layer label. */
  name: string;
  /** Pixel rectangle inside the atlas page. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Draw origin inside the frame, in atlas pixels. Defaults to the frame centre. */
  pivotX?: number;
  pivotY?: number;
}

export interface AtlasPage {
  /** Path relative to the public directory, e.g. "art/heroine@2x.webp". */
  src: string;
  /**
   * Logical size of the atlas page. Frames are expressed in THESE units.
   *
   * `density` says how many image pixels back one logical unit. A 512x512 page at
   * density 2 is a 1024x1024 file; the loader divides by density so a @2x atlas renders
   * at the same on-screen size as its @1x twin. Getting this wrong draws every layer at
   * twice its size — which is exactly what happened while building the fixture.
   */
  width: number;
  height: number;
  density?: number;
}

export interface AtlasManifest {
  /** Bumped whenever frames move; the loader logs it so stale caches are obvious. */
  version: number;
  page: AtlasPage;
  frames: AtlasFrame[];
}

export type ArtLoadFailure =
  | "network"
  | "bad-json"
  | "missing-page"
  | "empty-frames"
  | "frame-out-of-bounds";

export interface ArtLoadResult {
  ok: boolean;
  /** Populated only when `ok` is true. */
  source: HeroineArtSource | null;
  /** Why loading failed, `null` on success. */
  failure: ArtLoadFailure | null;
  /** Human-readable detail for the live region / console. */
  detail: string;
}

/**
 * Resolved atlas: frame name -> texture, plus the pivots the rig needs.
 *
 * Textures are sub-rectangles of a single base texture, so the whole heroine costs one
 * GPU texture and the sprites batch into a single draw call.
 */
export class HeroineArtSource {
  private readonly frames = new Map<string, Texture>();
  private readonly pivots = new Map<string, { x: number; y: number }>();

  readonly manifest: AtlasManifest;

  constructor(manifest: AtlasManifest) {
    this.manifest = manifest;
    for (const frame of manifest.frames) {
      this.pivots.set(frame.name, {
        x: frame.pivotX ?? frame.width / 2,
        y: frame.pivotY ?? frame.height / 2,
      });
    }
  }

  /** Registers a built texture. Called by the loader once the page is decoded. */
  setFrame(name: string, texture: Texture): void {
    this.frames.set(name, texture);
  }

  has(name: string): boolean {
    return this.frames.has(name);
  }

  /** Returns a frame texture, or `null` when the atlas does not contain it. */
  texture(name: string): Texture | null {
    return this.frames.get(name) ?? null;
  }

  /**
   * Draw origin for a frame in atlas pixels.
   *
   * Sprite anchors are normalised, so the rig converts: `anchor = pivot / size`.
   */
  pivot(name: string): { x: number; y: number } | null {
    return this.pivots.get(name) ?? null;
  }

  get frameNames(): string[] {
    return [...this.frames.keys()];
  }

  destroy(): void {
    for (const texture of this.frames.values()) texture.destroy(true);
    this.frames.clear();
    this.pivots.clear();
  }
}

/** Joins a base path and a relative asset path without doubling or dropping the slash. */
export function normalizeUrl(base: string, src: string): string {
  if (src.startsWith("/") || src.startsWith("http")) return src;
  const left = base.endsWith("/") ? base : `${base}/`;
  return `${left}${src}`;
}

/** Validates a parsed manifest. Returns the reason it is unusable, or `null`. */
export function validateManifest(
  value: unknown,
): { manifest: AtlasManifest } | { failure: ArtLoadFailure; detail: string } {
  if (!value || typeof value !== "object") {
    return { failure: "bad-json", detail: "manifest is not an object" };
  }
  const candidate = value as Partial<AtlasManifest>;
  if (!candidate.page || typeof candidate.page.src !== "string") {
    return { failure: "missing-page", detail: "manifest has no page.src" };
  }
  if (!Array.isArray(candidate.frames) || candidate.frames.length === 0) {
    return { failure: "empty-frames", detail: "manifest has no frames" };
  }
  const { width, height } = candidate.page;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return {
      failure: "bad-json",
      detail: "page size is not a positive number",
    };
  }
  const density = candidate.page.density ?? 1;
  if (!Number.isFinite(density) || density <= 0) {
    return {
      failure: "bad-json",
      detail: "page.density must be a positive number",
    };
  }
  for (const frame of candidate.frames) {
    if (
      !Number.isFinite(frame.x) ||
      !Number.isFinite(frame.y) ||
      !Number.isFinite(frame.width) ||
      !Number.isFinite(frame.height) ||
      frame.width <= 0 ||
      frame.height <= 0
    ) {
      return {
        failure: "bad-json",
        detail: `frame ${frame.name ?? "?"} has invalid geometry`,
      };
    }
    if (
      frame.x < 0 ||
      frame.y < 0 ||
      frame.x + frame.width > width ||
      frame.y + frame.height > height
    ) {
      return {
        failure: "frame-out-of-bounds",
        detail: `frame ${frame.name} (${frame.x},${frame.y},${frame.width}x${frame.height}) exceeds ${width}x${height}`,
      };
    }
  }
  return { manifest: candidate as AtlasManifest };
}

/** Builds textures for every frame from a decoded page. Pure: no network, no GPU work. */
export function buildFrames(
  manifest: AtlasManifest,
  page: Texture,
): HeroineArtSource {
  const source = new HeroineArtSource(manifest);
  const base = page.source;
  for (const frame of manifest.frames) {
    const rectangle = new Rectangle(
      frame.x,
      frame.y,
      frame.width,
      frame.height,
    );
    const texture = new Texture({
      source: base,
      frame: rectangle,
      label: frame.name,
    });
    source.setFrame(frame.name, texture);
  }
  return source;
}

/**
 * Loads the hero artwork.
 *
 * Never throws: any failure is reported so the caller can fall back to placeholders
 * and tell the user, instead of leaving a blank canvas.
 */
export async function loadHeroineArt(
  manifestUrl: string,
  assetBaseUrl = "",
): Promise<ArtLoadResult> {
  try {
    let manifest: unknown;
    try {
      const response = await fetch(manifestUrl);
      if (!response.ok) {
        return {
          ok: false,
          source: null,
          failure: "network",
          detail: `HTTP ${response.status}`,
        };
      }
      manifest = await response.json();
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "manifest request failed";
      return { ok: false, source: null, failure: "network", detail };
    }

    const validated = validateManifest(manifest);
    if ("failure" in validated) {
      return {
        ok: false,
        source: null,
        failure: validated.failure,
        detail: validated.detail,
      };
    }

    const { manifest: parsed } = validated;
    // The page is loaded as a plain image and wrapped in a Texture by hand rather than
    // through Assets.load: the loader resolves URLs through its own base path, which does
    // not match Vite's BASE_URL and silently produced no request at all. A direct fetch
    // keeps the pipeline explicit and testable outside a bundler.
    const pageUrl = normalizeUrl(assetBaseUrl, parsed.page.src);
    const image = new Image();
    image.decoding = "async";
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error(`image failed to decode: ${pageUrl}`));
    });
    image.src = pageUrl;
    await loaded;

    // Density makes the atlas resolution-independent: the image may be @2x or @3x while
    // frame rectangles stay in logical units.
    const density = parsed.page.density ?? 1;
    const pageSource = TextureSource.from(image);
    pageSource.resolution = density;
    const page = new Texture({
      source: pageSource,
      label: "heroine atlas page",
    });
    const source = buildFrames(parsed, page);
    return {
      ok: true,
      source,
      failure: null,
      detail: `${source.frameNames.length} frames @ ${parsed.page.width}x${parsed.page.height}`,
    };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "unknown asset error";
    return { ok: false, source: null, failure: "network", detail };
  }
}
