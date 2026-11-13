import assert from "node:assert/strict";
import test from "node:test";
import {
  SHELF_ART_H,
  SHELF_ART_W,
  SHELF_BLUSH_ENVELOPE,
  SHELF_MOTION,
  SHELF_PATCHES,
  SHELF_ROOM,
  SHELF_ROOM_ART_SCALE,
  SHELF_SHADOWS,
  SHELF_STOCKING_AMBIENT,
  SHELF_STOCKING_ENVELOPE,
  SHELF_ZONE_ECONOMY,
  shelfAmbientStockingAt,
  shelfEnvelopeAt,
  shelfPulseAt,
  type ShelfTouchZone,
} from "../src/heroine/shelf/shelfScene.ts";

test("SHELF SCENE: every touch zone maps into a real economy zone", () => {
  const zones: readonly ShelfTouchZone[] = ["head", "hair", "thighs", "feet"];
  const economyZones = new Set(["head", "hair", "body", "arms", "legs"]);
  for (const zone of zones) {
    const mapped = SHELF_ZONE_ECONOMY[zone];
    assert.ok(
      economyZones.has(mapped),
      `zone ${zone} maps to unknown economy zone ${mapped}`,
    );
  }
  // The four shelf zones reuse four DISTINCT standing-economy zones, so the
  // player earns the same spread of rewards as in the standing scene.
  assert.equal(new Set(Object.values(SHELF_ZONE_ECONOMY)).size, 4);
});

test("SHELF SCENE: figure placement stays inside the backdrop grid", () => {
  // Bottom anchor on the floor boards, inside the 1152x2048 room art.
  assert.ok(SHELF_ROOM.footCenterX > 0 && SHELF_ROOM.footCenterX < 1152);
  assert.ok(SHELF_ROOM.footY > 0 && SHELF_ROOM.footY <= 2048);
  // The scaled figure must not poke above the backdrop top.
  const topY = SHELF_ROOM.footY - SHELF_ART_H * SHELF_ROOM_ART_SCALE;
  assert.ok(topY > 0, `figure top ${topY} is above the backdrop`);
  // The body stays inside the room; only trailing hair tips may overhang
  // the right edge of the backdrop (they read as flowing out of frame).
  const halfW = (SHELF_ART_W * SHELF_ROOM_ART_SCALE) / 2;
  assert.ok(SHELF_ROOM.footCenterX - halfW > 0);
  assert.ok(SHELF_ROOM.footCenterX < 1152);
  assert.ok(
    SHELF_ROOM.footCenterX + halfW < 1152 + 100,
    "more than hair tips overhang the room edge",
  );
});

test("SHELF SCENE: tap pulse is zero at rest and bounded during the bounce", () => {
  // Exactly zero outside the pulse window — idle frames never jitter.
  assert.equal(shelfPulseAt(-1), 0);
  assert.equal(shelfPulseAt(SHELF_MOTION.pulseMs), 0);
  assert.equal(shelfPulseAt(SHELF_MOTION.pulseMs + 1000), 0);
  // Starts at zero (no snap on the tap frame itself; -0 counts as zero).
  assert.ok(shelfPulseAt(0) === 0);
  // Bounded by ±1 over the whole window, and actually moves.
  let peak = 0;
  for (let t = 0; t < SHELF_MOTION.pulseMs; t += 4) {
    const v = shelfPulseAt(t);
    assert.ok(Math.abs(v) <= 1, `pulse ${v} out of range at ${t}ms`);
    peak = Math.max(peak, Math.abs(v));
  }
  assert.ok(peak > 0.4, "pulse never reaches a visible amplitude");
  // The first half dips (negative): she sinks before springing back up.
  assert.ok(shelfPulseAt(SHELF_MOTION.pulseMs * 0.2) < 0);
});

test("SHELF SCENE: overlay patches sit inside the cutout grid", () => {
  for (const [name, patch] of Object.entries(SHELF_PATCHES)) {
    assert.ok(
      patch.x >= 0 && patch.x < SHELF_ART_W,
      `${name} x outside the plate`,
    );
    assert.ok(
      patch.y >= 0 && patch.y < SHELF_ART_H,
      `${name} y outside the plate`,
    );
  }
  // The blush plate must start above-left of the blink plate so the
  // closed-eye overlay fully covers the blush plate's open eye.
  assert.ok(SHELF_PATCHES.blush.x <= SHELF_PATCHES.blink.x);
  assert.ok(SHELF_PATCHES.blush.y <= SHELF_PATCHES.blink.y);
});

test("SHELF SCENE: contact shadows sit under the shoes, not under the body", () => {
  assert.ok(SHELF_SHADOWS.length >= 2, "need at least one shadow per shoe");
  for (const s of SHELF_SHADOWS) {
    // Under the feet: the shoe band of the plate is y ~1150..1236.
    assert.ok(s.y > 1150, `shadow at y ${s.y} is too high up the figure`);
    assert.ok(s.y < SHELF_ART_H + 60, `shadow at y ${s.y} floats below floor`);
    assert.ok(s.x > 0 && s.x < SHELF_ART_W, "shadow left the plate");
    assert.ok(s.alpha > 0 && s.alpha <= 1);
    assert.ok(s.w > s.h, "contact shadows must be flat ellipses");
  }
});

test("SHELF SCENE: reaction envelopes rise, hold and fully decay", () => {
  for (const env of [SHELF_BLUSH_ENVELOPE, SHELF_STOCKING_ENVELOPE]) {
    assert.equal(shelfEnvelopeAt(-1, env), 0);
    assert.equal(shelfEnvelopeAt(env.attackMs, env), 1, "hold must be full");
    assert.equal(shelfEnvelopeAt(env.attackMs + env.holdMs - 1, env), 1);
    const total = env.attackMs + env.holdMs + env.releaseMs;
    assert.equal(shelfEnvelopeAt(total, env), 0, "must fully decay");
    assert.equal(shelfEnvelopeAt(total + 10_000, env), 0);
  }
});

test("SHELF SCENE: the stocking slips once per ambient cycle and resets", () => {
  const period = SHELF_STOCKING_AMBIENT.periodMs;
  const start = SHELF_STOCKING_AMBIENT.startMs;
  const env = SHELF_STOCKING_ENVELOPE;
  // Fully slipped mid-window, in every cycle.
  const mid = start + env.attackMs + env.holdMs / 2;
  assert.equal(shelfAmbientStockingAt(mid), 1);
  assert.equal(shelfAmbientStockingAt(period * 3 + mid), 1);
  // Fully reset before the window and at the top of the cycle.
  assert.equal(shelfAmbientStockingAt(start - 1_000), 0);
  assert.equal(shelfAmbientStockingAt(period - 1), 0);
  // The whole slip fits inside one cycle — no carry-over between loops.
  assert.ok(start + env.attackMs + env.holdMs + env.releaseMs < period);
});

test("SHELF SCENE: ambient amplitudes stay subtle on the shipped plate", () => {
  // Combined breath+bob+pulse vertical scale shift at the worst frame:
  // under 2% of the plate, i.e. under ~23 art px of head travel — the
  // figure visibly breathes but never balloons.
  const worst =
    SHELF_MOTION.breathScale + SHELF_MOTION.bobScale + SHELF_MOTION.pulseScale;
  assert.ok(worst < 0.02, `combined amplitude ${worst} too strong`);
  // Sway keeps the top of the figure within ~6 art px of lateral travel.
  assert.ok(SHELF_MOTION.swaySkew * SHELF_ART_H < 6);
});
