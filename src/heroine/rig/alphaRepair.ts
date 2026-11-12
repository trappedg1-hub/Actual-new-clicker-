/**
 * Runtime repair of interior alpha punch-holes in the approved RGBA slots.
 *
 * The BLOCK 1 layer separation left thousands of tiny fully/partially
 * transparent punch-holes INSIDE otherwise opaque silhouettes (110 holes in
 * the blouse alone, plus hair crown, sleeves and skirt).  At runtime the
 * dark scene background shows through every such hole, which the user sees
 * as black blotches on the white blouse and black dots on the hair.
 *
 * This module closes ONLY small interior components: pixels that are not
 * reachable from the slot border through non-opaque pixels, in connected
 * components of at most `maxHoleArea` pixels.  Genuine art openings (gaps
 * between hair strands, the collar neckline, the gap between the legs) are
 * reachable from outside or larger than the threshold and are preserved
 * bit-exactly.  Repaired pixels become opaque; pixels without reliable RGB
 * (fully transparent holes store black) take the average of neighbouring
 * approved opaque pixels — no new art is invented, no PNG on disk changes,
 * no blur or filter is applied, and silhouette anti-aliasing is untouched.
 */

export interface AlphaRepairOptions {
  /** Pixels with alpha below this are treated as non-opaque. */
  alphaThreshold: number;
  /** Interior components larger than this stay untouched (art openings). */
  maxHoleArea: number;
  /**
   * Approved art openings as [x0, y0, x1, y1] inclusive rects: an interior
   * component stays untouched regardless of size when at least 75% of its
   * pixels fall inside one of these rects (each rect was verified
   * transparent in the approved BLOCK 1 full assembly).  The 75% rule keeps
   * neighbouring punch-hole defects, whose bounding boxes interleave with
   * the opening, repairable.
   */
  protectedRects?: readonly (readonly [number, number, number, number])[];
  /**
   * Straight RGBA bytes of the approved pre-separation original art
   * (IMG_4038_rig-pose), same canvas size.  When provided, fully
   * transparent repaired pixels take the artist's ORIGINAL painted RGB at
   * the same canvas coordinate instead of a neighbour average — a 1:1
   * restoration of art lost by the layer-separation cut (e.g. the flat
   * dark shadow between the back-hair locks), never invented content.
   */
  restoreRgb?: Uint8ClampedArray | undefined;
}

export interface AlphaRepairResult {
  /** Interior defect pixels made opaque. */
  filledPixels: number;
  /** Fully transparent pixels whose RGB was rebuilt from neighbours. */
  rebuiltRgbPixels: number;
  /** Interior components left untouched because they exceed maxHoleArea. */
  preservedLargeComponents: number;
}

/**
 * Fills small interior alpha holes in-place in straight (non-premultiplied)
 * RGBA `data` of a `width`x`height` image.
 */
export function solidifyInteriorHoles(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: AlphaRepairOptions,
): AlphaRepairResult {
  const {
    alphaThreshold,
    maxHoleArea,
    protectedRects = [],
    restoreRgb,
  } = options;
  const total = width * height;
  const weak = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    if ((data[i * 4 + 3] ?? 0) < alphaThreshold) weak[i] = 1;
  }

  // 1) Exterior flood fill: every non-opaque pixel reachable from the image
  //    border stays untouched (background, silhouette AA, real openings).
  const state = new Uint8Array(total); // 0 unseen, 1 exterior, 2 visited hole
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const pushExterior = (index: number): void => {
    if (weak[index] === 1 && state[index] === 0) {
      state[index] = 1;
      queue[tail] = index;
      tail += 1;
    }
  };
  for (let x = 0; x < width; x += 1) {
    pushExterior(x);
    pushExterior((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    pushExterior(y * width);
    pushExterior(y * width + width - 1);
  }
  while (head < tail) {
    const index = queue[head] ?? 0;
    head += 1;
    const x = index % width;
    const y = (index - x) / width;
    if (x > 0) pushExterior(index - 1);
    if (x + 1 < width) pushExterior(index + 1);
    if (y > 0) pushExterior(index - width);
    if (y + 1 < height) pushExterior(index + width);
  }

  // 2) Remaining non-opaque pixels are interior; close small components.
  const component = new Int32Array(total);
  let filledPixels = 0;
  let preservedLargeComponents = 0;
  const rebuilt: number[] = [];
  for (let start = 0; start < total; start += 1) {
    if (weak[start] !== 1 || state[start] !== 0) continue;
    // Collect one interior component.
    let size = 0;
    let cHead = 0;
    state[start] = 2;
    component[size] = start;
    size += 1;
    while (cHead < size) {
      const index = component[cHead] ?? 0;
      cHead += 1;
      const x = index % width;
      const y = (index - x) / width;
      const neighbours = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y + 1 < height ? index + width : -1,
      ];
      for (const n of neighbours) {
        if (n >= 0 && weak[n] === 1 && state[n] === 0) {
          state[n] = 2;
          component[size] = n;
          size += 1;
        }
      }
    }
    let isProtected = size > maxHoleArea;
    if (!isProtected && protectedRects.length > 0) {
      for (const [x0, y0, x1, y1] of protectedRects) {
        let inside = 0;
        for (let k = 0; k < size; k += 1) {
          const index = component[k] ?? 0;
          const x = index % width;
          const y = (index - x) / width;
          if (x >= x0 && x <= x1 && y >= y0 && y <= y1) inside += 1;
        }
        if (inside >= size * 0.75) {
          isProtected = true;
          break;
        }
      }
    }
    if (isProtected) {
      preservedLargeComponents += 1;
      continue;
    }
    for (let k = 0; k < size; k += 1) {
      const index = component[k] ?? 0;
      const base = index * 4;
      if ((data[base + 3] ?? 0) < 16) rebuilt.push(index);
      data[base + 3] = 255;
      filledPixels += 1;
    }
  }

  // 3) Rebuild RGB of fully transparent filled pixels.  Preferred source:
  //    the approved original art at the same coordinate (exact restoration
  //    of the pixels the separation cut away).  Fallback: average of
  //    neighbouring opaque pixels (iterative, bounded by the hole radius).
  let restored = 0;
  if (
    restoreRgb !== undefined &&
    restoreRgb.length === data.length &&
    rebuilt.length > 0
  ) {
    for (const index of rebuilt) {
      const base = index * 4;
      data[base] = restoreRgb[base] ?? 0;
      data[base + 1] = restoreRgb[base + 1] ?? 0;
      data[base + 2] = restoreRgb[base + 2] ?? 0;
    }
    restored = rebuilt.length;
    return {
      filledPixels,
      rebuiltRgbPixels: restored,
      preservedLargeComponents,
    };
  }
  const needs = new Set(rebuilt);
  let guard = 0;
  while (needs.size > 0 && guard < 64) {
    guard += 1;
    const ready: number[] = [];
    for (const index of needs) {
      const x = index % width;
      const y = (index - x) / width;
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const n = ny * width + nx;
          if (needs.has(n)) continue;
          if ((data[n * 4 + 3] ?? 0) < 255) continue;
          r += data[n * 4] ?? 0;
          g += data[n * 4 + 1] ?? 0;
          b += data[n * 4 + 2] ?? 0;
          count += 1;
        }
      }
      if (count > 0) {
        data[index * 4] = Math.round(r / count);
        data[index * 4 + 1] = Math.round(g / count);
        data[index * 4 + 2] = Math.round(b / count);
        ready.push(index);
      }
    }
    if (ready.length === 0) break;
    for (const index of ready) needs.delete(index);
  }

  return {
    filledPixels,
    rebuiltRgbPixels: restored + rebuilt.length - needs.size,
    preservedLargeComponents,
  };
}
