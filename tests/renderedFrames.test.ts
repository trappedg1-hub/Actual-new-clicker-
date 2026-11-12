import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import test from "node:test";
import { RIG_CANVAS, rigFrameAt } from "../src/heroine/rig/animationMath.ts";
import type { RigFrame } from "../src/heroine/rig/animationMath.ts";
import {
  ANIMATED_LIMB_SLOTS,
  COVERAGE_STATIC_SLOTS,
  LEG_POSE,
  RUNTIME_TEXTURE,
} from "../src/heroine/rig/renderConfig.ts";

const WIDTH = RIG_CANVAS.width;
const HEIGHT = RIG_CANVAS.height;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

interface RgbaImage {
  width: number;
  height: number;
  rgba: Uint8Array;
}

/**
 * Minimal 8-bit RGBA PNG reader.  These tests deliberately use the REAL
 * approved alpha channels rather than a synthetic rectangle: a transform that
 * is numerically non-zero but does not move visible pixels must fail.
 */
function readPng(path: string): RgbaImage {
  const file = readFileSync(path);
  assert.ok(file.subarray(0, 8).equals(PNG_SIGNATURE), `bad PNG ${path}`);
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  let bitDepth = 0;
  let interlace = 0;
  const idat: Buffer[] = [];
  while (offset < file.length) {
    const length = file.readUInt32BE(offset);
    const type = file.toString("ascii", offset + 4, offset + 8);
    const data = file.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  assert.equal(bitDepth, 8, `unexpected PNG bit depth ${path}`);
  assert.equal(colorType, 6, `unexpected PNG colour type ${path}`);
  assert.equal(interlace, 0, `unexpected PNG interlace ${path}`);
  const raw = inflateSync(Buffer.concat(idat));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const rgba = new Uint8Array(stride * height);
  let previous = new Uint8Array(stride);
  let source = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[source];
    source += 1;
    const row = new Uint8Array(stride);
    for (let x = 0; x < stride; x += 1) {
      const value = raw[source + x];
      const left = x >= bytesPerPixel ? row[x - bytesPerPixel] : 0;
      const up = previous[x];
      const upLeft = x >= bytesPerPixel ? previous[x - bytesPerPixel] : 0;
      let predictor = 0;
      if (filter === 1) predictor = left;
      else if (filter === 2) predictor = up;
      else if (filter === 3) predictor = (left + up) >> 1;
      else if (filter === 4) {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
      } else {
        assert.equal(filter, 0, `bad PNG filter ${filter} in ${path}`);
      }
      row[x] = (value + predictor) & 255;
    }
    rgba.set(row, y * stride);
    previous = row;
    source += stride;
  }
  return { width, height, rgba };
}

const LAYER_DIR = new URL(
  "../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/layers/",
  import.meta.url,
);
const LEG_FILES: Record<number, string> = {
  3: new URL("03_leg_l.png", LAYER_DIR).pathname,
  4: new URL("04_leg_r.png", LAYER_DIR).pathname,
};
const PIVOTS: Record<number, { x: number; y: number }> = {
  3: { x: 370, y: 675 },
  4: { x: 478, y: 675 },
};

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function warpWeight(y: number): number {
  if (y <= LEG_POSE.hipAnchorY || y >= LEG_POSE.ankleY) return 0;
  if (y < LEG_POSE.kneeY) {
    return clamp01(
      (y - LEG_POSE.hipAnchorY) / (LEG_POSE.kneeY - LEG_POSE.hipAnchorY),
    );
  }
  return clamp01((LEG_POSE.ankleY - y) / (LEG_POSE.ankleY - LEG_POSE.kneeY));
}

/**
 * Software raster of one approved leg slot after the exact runtime transform:
 * graded mesh warp, then rotation around the approved hip pivot, then the
 * legGroup integer translation.  It is a visible-pixel mask, not a numeric
 * transform check.
 */
function renderLegMask(z: 3 | 4, frame: RigFrame): Uint8Array {
  const image = readPng(LEG_FILES[z]);
  assert.equal(image.width, WIDTH, `slot ${z} width`);
  assert.equal(image.height, HEIGHT, `slot ${z} height`);
  const mask = new Uint8Array(WIDTH * HEIGHT);
  const pivot = PIVOTS[z];
  const angle = ((frame.slots[z] ?? 0) * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const warp = frame.slotWarp[z] ?? 0;
  const groupY = frame.groups.legGroup.y;
  for (let y = 0; y < HEIGHT; y += 1) {
    const weight = warpWeight(y);
    const dxWarp = warp * weight;
    for (let x = 0; x < WIDTH; x += 1) {
      const alpha = image.rgba[(y * WIDTH + x) * 4 + 3];
      if (alpha === 0) continue;
      const lx = x + dxWarp - pivot.x;
      const ly = y - pivot.y;
      const rx = pivot.x + lx * cos - ly * sin;
      const ry = pivot.y + lx * sin + ly * cos + groupY;
      const px = Math.round(rx);
      const py = Math.round(ry);
      if (px < 0 || px >= WIDTH || py < 0 || py >= HEIGHT) continue;
      mask[py * WIDTH + px] = 1;
    }
  }
  return mask;
}

function changedPixels(a: Uint8Array, b: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) count += 1;
  }
  return count;
}

test("BLOCK 2 render architecture: only static slots are covered, never a rest-pose limb duplicate", () => {
  const staticSet = new Set<number>(COVERAGE_STATIC_SLOTS);
  const limbSet = new Set<number>(ANIMATED_LIMB_SLOTS);
  assert.equal(staticSet.size + limbSet.size, 20);
  assert.equal(limbSet.size, 4);
  for (const z of ANIMATED_LIMB_SLOTS) {
    assert.ok(!staticSet.has(z), `animated limb z${z} duplicated in coverage`);
  }
  for (let z = 1; z <= 20; z += 1) {
    assert.ok(
      staticSet.has(z) || limbSet.has(z),
      `slot z${z} is neither animated nor covered`,
    );
  }
  assert.equal(RUNTIME_TEXTURE.alphaMode, "no-premultiply-alpha");
  assert.equal(RUNTIME_TEXTURE.alphaBleedRadius, 2);
  assert.equal(RUNTIME_TEXTURE.scaleMode, "linear");
  assert.equal(LEG_POSE.hipAnchorY, 720);
  assert.equal(LEG_POSE.kneeY, 960);
  assert.equal(LEG_POSE.ankleY, 1210);
  assert.equal(LEG_POSE.warpPx, 9);
  assert.equal(LEG_POSE.rotationDeg, 1);
});

test("BLOCK 2 rendered frames: both legs visibly move to both sides and return without drift", () => {
  const rest = rigFrameAt(0);
  const maxLeft = rigFrameAt(1_500);
  const maxRight = rigFrameAt(4_500);
  const halfCycle = rigFrameAt(6_000);
  const loop = rigFrameAt(12_000);
  const cycle2 = rigFrameAt(24_000);

  const restL = renderLegMask(3, rest);
  const restR = renderLegMask(4, rest);
  const leftL = renderLegMask(3, maxLeft);
  const leftR = renderLegMask(4, maxLeft);
  const rightL = renderLegMask(3, maxRight);
  const rightR = renderLegMask(4, maxRight);
  const halfL = renderLegMask(3, halfCycle);
  const halfR = renderLegMask(4, halfCycle);
  const loopL = renderLegMask(3, loop);
  const loopR = renderLegMask(4, loop);
  const cycle2L = renderLegMask(3, cycle2);
  const cycle2R = renderLegMask(4, cycle2);

  // Real approved silhouettes must change by thousands of visible pixels;
  // nonzero rotation/warp numbers alone are not enough.
  const legDiffs = {
    leftLegMaxLeft: changedPixels(restL, leftL),
    rightLegMaxLeft: changedPixels(restR, leftR),
    leftLegMaxRight: changedPixels(restL, rightL),
    rightLegMaxRight: changedPixels(restR, rightR),
    leftLegVsRightLeg: changedPixels(leftL, rightL),
    rightLegVsRightLeg: changedPixels(leftR, rightR),
  };
  for (const [name, diff] of Object.entries(legDiffs)) {
    assert.ok(diff > 3_000, `${name} is not visibly rendered: ${diff}px`);
  }
  assert.ok(
    changedPixels(restL, halfL) < 500,
    "left leg drifted at half cycle",
  );
  assert.ok(
    changedPixels(restR, halfR) < 500,
    "right leg drifted at half cycle",
  );
  assert.equal(changedPixels(restL, loopL), 0, "left leg loop seam drift");
  assert.equal(changedPixels(restR, loopR), 0, "right leg loop seam drift");
  assert.equal(changedPixels(restL, cycle2L), 0, "left leg second-cycle drift");
  assert.equal(
    changedPixels(restR, cycle2R),
    0,
    "right leg second-cycle drift",
  );
  assert.ok(maxLeft.slotWarp[3] > 5 && maxLeft.slotWarp[4] < -5);
  assert.ok(maxRight.slotWarp[3] < -5 && maxRight.slotWarp[4] > 5);
});

test("BLOCK 2 alpha inspection: all 20 approved slots are valid straight RGBA cut-outs", () => {
  let semiAlpha = 0;
  let transparentWithRgb = 0;
  const opaqueUnion = new Uint8Array(WIDTH * HEIGHT);
  let overlap = 0;
  // Explicitly resolve the 20 approved filenames so the test cannot silently
  // skip a slot.
  const filenames = [
    "01_hair_back_01.png",
    "02_hair_back_02.png",
    "03_leg_l.png",
    "04_leg_r.png",
    "05_torso.png",
    "06_arm_l.png",
    "07_arm_r.png",
    "08_outfit_blouse.png",
    "09_outfit_collar.png",
    "10_outfit_ribbon.png",
    "11_outfit_skirt_01.png",
    "12_outfit_skirt_02.png",
    "13_head.png",
    "14_eye_l_open.png",
    "15_eye_r_open.png",
    "16_mouth_neutral.png",
    "17_hair_side_l.png",
    "18_hair_side_r.png",
    "19_hair_front_01.png",
    "20_hair_front_02.png",
  ];
  for (const filename of filenames) {
    const image = readPng(new URL(filename, LAYER_DIR).pathname);
    assert.equal(image.width, WIDTH, `${filename} width`);
    assert.equal(image.height, HEIGHT, `${filename} height`);
    for (let i = 0; i < WIDTH * HEIGHT; i += 1) {
      const a = image.rgba[i * 4 + 3];
      const r = image.rgba[i * 4];
      const g = image.rgba[i * 4 + 1];
      const b = image.rgba[i * 4 + 2];
      if (a > 0 && a < 255) semiAlpha += 1;
      if (a === 0 && (r > 10 || g > 10 || b > 10)) transparentWithRgb += 1;
      if (a === 255) {
        if (opaqueUnion[i] === 1) overlap += 1;
        else opaqueUnion[i] = 1;
      }
    }
  }
  assert.ok(
    semiAlpha > 10_000,
    "approved slots unexpectedly have no anti-aliased alpha",
  );
  assert.ok(
    transparentWithRgb > 0,
    "transparent RGB padding inspection found no padding at all",
  );
  assert.equal(overlap, 0, "approved opaque slot masks overlap");
});
