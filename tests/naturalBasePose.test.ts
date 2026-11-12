import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
import {
  NATURAL_POSE,
  POSE_DEBRIS_CLEANUP,
  poseCleanupRects,
  poseInwardSign,
  poseKneeEasePx,
  poseStancePx,
  poseStanceWeight,
  resolvePoseVariant,
} from "../src/heroine/poses/naturalBasePose.ts";
import { LEG_POSE } from "../src/heroine/rig/renderConfig.ts";

test("NATURAL POSE: stance field is pinned under the skirt and rigid at the foot", () => {
  // Zero at and above the hip anchor row: the leg tops must stay welded
  // under the opaque skirt exactly where the approved BLOCK 1 cut put them.
  assert.equal(poseStanceWeight(0), 0);
  assert.equal(poseStanceWeight(654), 0, "legs' top row must not move");
  assert.equal(poseStanceWeight(700), 0, "skirt-adjacent rows must not move");
  assert.equal(poseStanceWeight(NATURAL_POSE.pinY), 0, "pin row moved");

  // Full and constant from the ankle down: the shoe translates rigidly.
  assert.equal(poseStanceWeight(NATURAL_POSE.ankleY), 1);
  assert.equal(poseStanceWeight(1264), 1, "shoe bottom must stay rigid");

  // Smooth and monotonic in between — no fold-overs in the shin.
  let previous = 0;
  for (let y = NATURAL_POSE.pinY; y <= NATURAL_POSE.ankleY; y += 5) {
    const w = poseStanceWeight(y);
    assert.ok(w >= previous, `stance weight not monotonic at row ${y}`);
    assert.ok(w >= 0 && w <= 1, `stance weight out of bounds at row ${y}`);
    previous = w;
  }

  // The pose rides the SAME anchor rows as the accepted dynamic knee warp.
  assert.equal(NATURAL_POSE.pinY, LEG_POSE.hipAnchorY);
  assert.equal(NATURAL_POSE.kneeY, LEG_POSE.kneeY);
  assert.equal(NATURAL_POSE.ankleY, LEG_POSE.ankleY);
});

test("NATURAL POSE: only the two leg slots move, inward, symmetrically, bounded", () => {
  assert.equal(poseInwardSign(3), 1, "viewer-left leg must move right");
  assert.equal(poseInwardSign(4), -1, "viewer-right leg must move left");
  for (const z of [1, 2, 5, 6, 7, 8, 9, 10, 11, 12, 13, 17, 18, 19, 20]) {
    assert.equal(poseInwardSign(z), 0, `slot z${z} must never be reposed`);
    assert.equal(poseStancePx(z, "natural"), 0);
    assert.equal(poseKneeEasePx(z, "natural"), 0);
  }

  // Symmetric mirror offsets, bounded so the inner silhouettes can never
  // collide: measured inner gap at the worst row is 143 px with the full
  // stance + dynamic warp, so the static budget stays safely below that.
  assert.equal(poseStancePx(3, "natural"), -poseStancePx(4, "natural"));
  assert.equal(poseKneeEasePx(3, "natural"), -poseKneeEasePx(4, "natural"));
  assert.ok(
    Math.abs(poseStancePx(3, "natural")) +
      Math.abs(poseKneeEasePx(3, "natural")) <=
      120,
    "static pose budget exceeded",
  );
});

test("NATURAL POSE: classic variant is byte-identical to the accepted build", () => {
  for (const z of [1, 2, 3, 4, 11, 12]) {
    assert.equal(poseStancePx(z, "classic"), 0);
    assert.equal(poseKneeEasePx(z, "classic"), 0);
    assert.deepEqual(poseCleanupRects(z, "classic"), []);
  }
});

test("NATURAL POSE: variant resolution keeps the accepted pose reachable", () => {
  assert.equal(resolvePoseVariant(""), "natural");
  assert.equal(resolvePoseVariant("?pose=natural"), "natural");
  assert.equal(resolvePoseVariant("?pose=classic"), "classic");
  assert.equal(resolvePoseVariant("?qa=1&pose=classic"), "classic");
  assert.equal(resolvePoseVariant("?pose=unknown"), "natural");
});

test("NATURAL POSE: debris cleanup is tiny, leg-adjacent and never touches the face or torso", () => {
  let totalArea = 0;
  let rectCount = 0;
  for (const [slot, rects] of Object.entries(POSE_DEBRIS_CLEANUP)) {
    // Only the measured debris carriers: back hair, both legs, outer skirt.
    assert.ok(
      ["1", "3", "4", "12"].includes(slot),
      `unexpected cleanup slot z${slot}`,
    );
    for (const [x0, y0, x1, y1] of rects) {
      rectCount += 1;
      assert.ok(x1 > x0 && y1 > y0, "degenerate cleanup rect");
      // All fragments sit in the measured leg band, below the breathing
      // band and the approved face/torso art, inside the old leg region.
      assert.ok(y0 >= 700 && y1 <= 1240, `cleanup rect outside leg band`);
      assert.ok(x0 >= 140 && x1 <= 700, `cleanup rect outside leg columns`);
      const area = (x1 - x0) * (y1 - y0);
      assert.ok(area <= 80, `cleanup rect too large: ${area}px`);
      totalArea += area;
    }
  }
  assert.equal(rectCount, 38, "cleanup rect count drifted from measurement");
  assert.ok(totalArea <= 400, `total cleanup area too large: ${totalArea}px`);
  // The approved z17 hair opening must never appear in the cleanup set.
  assert.ok(!(17 in POSE_DEBRIS_CLEANUP));
});

test("NATURAL POSE: legs are fully static and blink is an overlay (source guards)", () => {
  const rig = readFileSync("src/heroine/rig/ProductionHeroineRig.ts", "utf8");
  // No periodic/tap leg warp in the natural variant — legs never move.
  assert.ok(
    rig.includes('this.poseVariant === "natural" ? 0 : (frame.slotWarp[z]'),
    "natural variant must zero the dynamic leg warp",
  );
  // Blink renders as a dedicated opaque overlay plate above the dominant
  // plate; the base plate must not swap mid-blink.
  assert.ok(rig.includes("blinkPlates"), "blink overlay plates missing");
  assert.ok(
    rig.includes("frame.blinkWeight"),
    "blink overlay must use the envelope weight",
  );
  // The approved front-hair cuts carry baked-in OPEN-eye fragments above the
  // face plates, so the visible closure must come from eye patches parented
  // above the hair slots. Removing them makes the blink invisible again.
  assert.ok(
    rig.includes("eyePatchPlates"),
    "closed-eye patches above the hair groups missing",
  );
});
