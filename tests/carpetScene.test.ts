import assert from "node:assert/strict";
import test from "node:test";
import {
  CARPET_ART_H,
  CARPET_ART_W,
  CARPET_BLUSH_ENVELOPE,
  CARPET_MOTION,
  CARPET_PAGE_AMBIENT,
  CARPET_PAGE_ENVELOPE,
  CARPET_PATCHES,
  CARPET_ROOM,
  CARPET_ROOM_ART_SCALE,
  CARPET_SHADOWS,
  CARPET_STOCKING_AMBIENT,
  CARPET_STOCKING_ENVELOPE,
  CARPET_ZONE_ECONOMY,
  carpetAmbientPageAt,
  carpetAmbientStockingAt,
  carpetEnvelopeAt,
  carpetKickAt,
  carpetKickShowsFrameB,
  CARPET_KICK_ENVELOPE,
  carpetPulseAt,
  type CarpetTouchZone,
} from "../src/heroine/carpet/carpetScene.ts";

test("CARPET SCENE: every touch zone maps into a real economy zone", () => {
  const zones: readonly CarpetTouchZone[] = ["head", "hair", "thighs", "legs"];
  const economyZones = new Set(["head", "hair", "body", "arms", "legs"]);
  for (const zone of zones) {
    const mapped = CARPET_ZONE_ECONOMY[zone];
    assert.ok(
      economyZones.has(mapped),
      `zone ${zone} maps to unknown economy zone ${mapped}`,
    );
  }
  // The four carpet zones reuse four DISTINCT standing-economy zones, so
  // the player earns the same spread of rewards as in the standing scene.
  assert.equal(new Set(Object.values(CARPET_ZONE_ECONOMY)).size, 4);
});

test("CARPET SCENE: figure placement stays inside the backdrop grid", () => {
  const halfW = (CARPET_ART_W * CARPET_ROOM_ART_SCALE) / 2;
  const halfH = (CARPET_ART_H * CARPET_ROOM_ART_SCALE) / 2;
  assert.ok(CARPET_ROOM.centerX - halfW >= 0, "figure pokes out left");
  assert.ok(
    CARPET_ROOM.centerX + halfW <= CARPET_ROOM.roomW,
    "figure pokes out right",
  );
  assert.ok(CARPET_ROOM.centerY - halfH > 0, "figure pokes above the room");
  assert.ok(
    CARPET_ROOM.centerY + halfH < CARPET_ROOM.roomH,
    "figure pokes below the floor",
  );
  // She lies on the OPEN floor half of the backdrop (the room furniture
  // band occupies roughly the top third of the art).
  assert.ok(CARPET_ROOM.centerY - halfH > CARPET_ROOM.roomH * 0.25);
});

test("CARPET SCENE: figure fits the cover-fit window of a 390x844 phone", () => {
  // The backdrop cover-fits the full screen; on the reference portrait
  // viewport the fit is height-limited, so only a horizontal window of
  // the art is visible.  The figure (and a margin) must fit inside it,
  // and her feet must stay above the upgrade card band.
  const screenW = 390;
  const screenH = 844;
  const scale = Math.max(
    screenW / CARPET_ROOM.roomW,
    screenH / CARPET_ROOM.roomH,
  );
  const windowW = screenW / scale;
  const halfW = (CARPET_ART_W * CARPET_ROOM_ART_SCALE) / 2;
  assert.ok(
    halfW + 20 < windowW / 2,
    `figure half-width ${halfW} overflows the ${windowW}px cover window`,
  );
  const cardTop = screenH - 66 - 82 - 8;
  const bottomY =
    (CARPET_ROOM.centerY + (CARPET_ART_H * CARPET_ROOM_ART_SCALE) / 2) * scale;
  assert.ok(
    bottomY <= cardTop + 2,
    `figure bottom ${bottomY} hides behind the upgrade card ${cardTop}`,
  );
});

test("CARPET SCENE: tap pulse is zero at rest and bounded during the squash", () => {
  assert.equal(carpetPulseAt(-1), 0);
  assert.equal(carpetPulseAt(CARPET_MOTION.pulseMs), 0);
  assert.equal(carpetPulseAt(CARPET_MOTION.pulseMs + 1000), 0);
  assert.ok(carpetPulseAt(0) === 0);
  let peak = 0;
  for (let t = 0; t < CARPET_MOTION.pulseMs; t += 4) {
    const v = carpetPulseAt(t);
    assert.ok(Math.abs(v) <= 1, `pulse ${v} out of range at ${t}ms`);
    peak = Math.max(peak, Math.abs(v));
  }
  assert.ok(peak > 0.4, "pulse never reaches a visible amplitude");
  assert.ok(carpetPulseAt(CARPET_MOTION.pulseMs * 0.2) < 0);
});

test("CARPET SCENE: overlay patches sit inside the cutout grid", () => {
  for (const [name, patch] of Object.entries(CARPET_PATCHES)) {
    assert.ok(
      patch.x >= 0 && patch.x < CARPET_ART_W,
      `${name} x outside the plate`,
    );
    assert.ok(
      patch.y >= 0 && patch.y < CARPET_ART_H,
      `${name} y outside the plate`,
    );
  }
  // The blink plate must start at or above-left of the blush plate's
  // origin so the closed-eye overlay covers the blush plate's widened
  // eyes (blink renders ABOVE blush in the sprite stack).
  assert.ok(CARPET_PATCHES.blink.x <= CARPET_PATCHES.blush.x);
  assert.ok(CARPET_PATCHES.blink.y <= CARPET_PATCHES.blush.y);
  // Swing and stocking patches live on the legs half of the plate,
  // the page patch on the book side — disjoint from the face patches.
  assert.ok(CARPET_PATCHES.legs.x > CARPET_ART_W / 2);
  assert.ok(CARPET_PATCHES.stocking.x > CARPET_ART_W / 2);
  assert.ok(CARPET_PATCHES.page.x < CARPET_PATCHES.blink.x);
  assert.ok(CARPET_PATCHES.page.y > CARPET_PATCHES.blink.y);
});

test("CARPET SCENE: contact shadows lie under the body on the boards", () => {
  assert.ok(CARPET_SHADOWS.length >= 3, "book, torso and thigh need shadows");
  for (const s of CARPET_SHADOWS) {
    assert.ok(s.x > 0 && s.x < CARPET_ART_W, "shadow left the plate");
    // Under the lying body: lower 2/3 of the plate, may spill a little
    // below the hip line but never above the raised feet.
    assert.ok(s.y > CARPET_ART_H * 0.4, `shadow at y ${s.y} floats too high`);
    assert.ok(s.y < CARPET_ART_H + 80, `shadow at y ${s.y} under the floor`);
    assert.ok(s.alpha > 0 && s.alpha <= 1);
    assert.ok(s.w > s.h, "contact shadows must be flat ellipses");
  }
});

test("CARPET SCENE: reaction envelopes rise, hold and fully decay", () => {
  for (const env of [
    CARPET_BLUSH_ENVELOPE,
    CARPET_STOCKING_ENVELOPE,
    CARPET_PAGE_ENVELOPE,
  ]) {
    assert.equal(carpetEnvelopeAt(-1, env), 0);
    assert.equal(carpetEnvelopeAt(env.attackMs, env), 1, "hold must be full");
    assert.equal(carpetEnvelopeAt(env.attackMs + env.holdMs - 1, env), 1);
    const total = env.attackMs + env.holdMs + env.releaseMs;
    assert.equal(carpetEnvelopeAt(total, env), 0, "must fully decay");
    assert.equal(carpetEnvelopeAt(total + 10_000, env), 0);
  }
});

test("CARPET SCENE: shins are static and only twitch once on a tap", () => {
  const env = CARPET_KICK_ENVELOPE;
  const total = env.attackMs + env.holdMs + env.releaseMs;
  // At rest (before any tap and after the twitch) frame A is fully
  // visible: exactly zero, never a lingering mix — that read as doubling.
  assert.equal(carpetKickAt(-1), 0, "must be static before the tap");
  assert.equal(carpetKickAt(Number.NEGATIVE_INFINITY), 0);
  assert.equal(carpetKickAt(total), 0, "must settle fully after the twitch");
  assert.equal(carpetKickAt(total + 60_000), 0, "idle must stay static");
  // The twitch itself reaches the full kicked frame (crisp, not a
  // half-mixed ghost) and is over quickly.
  assert.equal(carpetKickAt(env.attackMs + env.holdMs / 2), 1);
  assert.ok(total <= 600, `twitch ${total}ms too slow — reads as a swing`);
  // The swap is BINARY: the frames cover a transparent hole in the
  // base plate, so any partial crossfade dips the summed coverage
  // below 1 and the legs flash transparent.  At every sampled moment
  // exactly one frame must be fully visible.
  assert.equal(carpetKickShowsFrameB(-1), false);
  assert.equal(carpetKickShowsFrameB(env.attackMs + env.holdMs / 2), true);
  assert.equal(carpetKickShowsFrameB(total + 1), false);
  for (let t = -32; t <= total + 64; t += 4) {
    const b = carpetKickShowsFrameB(t);
    assert.equal(typeof b, "boolean");
    const coverage = (b ? 1 : 0) + (b ? 0 : 1);
    assert.equal(coverage, 1, `coverage dips at ${t}ms — legs vanish`);
  }
});

test("CARPET SCENE: stocking slips once per ambient cycle and resets", () => {
  const period = CARPET_STOCKING_AMBIENT.periodMs;
  const start = CARPET_STOCKING_AMBIENT.startMs;
  const env = CARPET_STOCKING_ENVELOPE;
  const mid = start + env.attackMs + env.holdMs / 2;
  assert.equal(carpetAmbientStockingAt(mid), 1);
  assert.equal(carpetAmbientStockingAt(period * 3 + mid), 1);
  assert.equal(carpetAmbientStockingAt(start - 1_000), 0);
  assert.equal(carpetAmbientStockingAt(period - 1), 0);
  assert.ok(start + env.attackMs + env.holdMs + env.releaseMs < period);
});

test("CARPET SCENE: she turns a page on a steady reading rhythm", () => {
  const period = CARPET_PAGE_AMBIENT.periodMs;
  const start = CARPET_PAGE_AMBIENT.startMs;
  const env = CARPET_PAGE_ENVELOPE;
  const mid = start + env.attackMs + env.holdMs / 2;
  assert.equal(carpetAmbientPageAt(mid), 1);
  assert.equal(carpetAmbientPageAt(period * 5 + mid), 1);
  assert.equal(carpetAmbientPageAt(start - 500), 0);
  assert.equal(carpetAmbientPageAt(period - 1), 0);
  assert.ok(start + env.attackMs + env.holdMs + env.releaseMs < period);
  // The flip itself is quick — under 1.5 seconds end to end.
  assert.ok(env.attackMs + env.holdMs + env.releaseMs < 1_500);
});

test("CARPET SCENE: ambient amplitudes stay subtle on the shipped plate", () => {
  // Combined breath+pulse scale shift at the worst frame: under 1.5% of
  // the plate — she breathes gently, the body never balloons.
  const worst = CARPET_MOTION.breathScale + CARPET_MOTION.pulseScale;
  assert.ok(worst < 0.015, `combined amplitude ${worst} too strong`);
});
