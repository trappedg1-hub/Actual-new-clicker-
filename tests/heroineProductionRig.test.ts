import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyReaction,
  blinkOverlayAt,
  clampedAnimationDeltaMs,
  decayReaction,
  EXPRESSION_COMBOS,
  EXPRESSION_STATES,
  expressionTargetsAt,
  TAP_EXPRESSION_STATES,
  dominantExpressionState,
  FACE_PLATE_RECT,
  isBlinkClosed,
  NO_REACTION,
  reactionEnergy,
  RIG_LOOP_MS,
  breathWeight,
  rigFrameAt,
  triggerReaction,
} from "../src/heroine/rig/animationMath.ts";
import type { RigFrame } from "../src/heroine/rig/animationMath.ts";
import { solidifyInteriorHoles } from "../src/heroine/rig/alphaRepair.ts";
import { BREATH, BREATH_MESH_SLOTS } from "../src/heroine/rig/renderConfig.ts";

function round(value: number): number {
  return Math.round(value * 1_000_000_000) / 1_000_000_000;
}

function snapshot(frame: RigFrame): unknown {
  return {
    groups: Object.fromEntries(
      Object.entries(frame.groups).map(([id, t]) => [
        id,
        {
          rotationDeg: round(t.rotationDeg),
          x: round(t.x),
          y: round(t.y),
          scaleX: round(t.scaleX),
          scaleY: round(t.scaleY),
        },
      ]),
    ),
    slots: Object.fromEntries(
      Object.entries(frame.slots).map(([z, deg]) => [z, round(deg)]),
    ),
    slotWarp: Object.fromEntries(
      Object.entries(frame.slotWarp).map(([z, dx]) => [z, round(dx)]),
    ),
    underlayAlpha: round(frame.underlayAlpha),
    expressionTargets: Object.fromEntries(
      Object.entries(frame.expressionTargets).map(([state, alpha]) => [
        state,
        round(alpha),
      ]),
    ),
    blinkClosed: frame.blinkClosed,
  };
}

test("BLOCK 2: 12-second idle loop closes exactly at the seam", () => {
  const start = rigFrameAt(0);
  const end = rigFrameAt(RIG_LOOP_MS);
  assert.deepEqual(snapshot(end), snapshot(start));
  assert.equal(start.blinkClosed, false);
  assert.equal(end.blinkClosed, false);
  assert.equal(start.expressionTargets["00-neutral"], 1);
  assert.equal(end.expressionTargets["00-neutral"], 1);
  assert.equal(start.underlayAlpha, 0);
  assert.equal(end.underlayAlpha, 0);
});

test("BLOCK 2: expression targets are normalized and blink is a discrete state", () => {
  for (const timeMs of [0, 1_000, 2_670, 4_000, 6_670, 9_000, 10_670, 11_900]) {
    const targets = expressionTargetsAt(timeMs);
    const sum = Object.values(targets).reduce(
      (total, alpha) => total + alpha,
      0,
    );
    assert.ok(Math.abs(sum - 1) < 1e-9, `sum=${sum} at ${timeMs}`);
    for (const alpha of Object.values(targets)) {
      assert.ok(alpha >= 0 && alpha <= 1);
    }
  }
  assert.equal(isBlinkClosed(0), false);
  assert.equal(isBlinkClosed(2_670), true);
  assert.equal(isBlinkClosed(RIG_LOOP_MS), false);
});

test("BLOCK 2: tap reactions restart from fixed impulses and decay without drift", () => {
  const first = triggerReaction("head");
  const second = triggerReaction("arms");
  assert.deepEqual(second, { head: 0, hair: 1, armL: -12, armR: 12, body: 1 });
  assert.notDeepEqual(second, first);
  assert.ok(second.armL < 0 && second.armR > 0);
  const decayed = decayReaction(second, 1_000);
  assert.ok(Math.abs(decayed.armL) < 0.2);
  assert.ok(Math.abs(decayed.armR) < 0.2);
});

test("BLOCK 2: applying no reaction leaves the idle frame unchanged", () => {
  const frame = rigFrameAt(3_000);
  const same = applyReaction(frame, { ...NO_REACTION });
  assert.deepEqual(snapshot(same), snapshot(frame));
});

test("BLOCK 2: expression combos match the approved E2-V2 switch matrix", () => {
  const parsed = JSON.parse(
    readFileSync(
      new URL(
        "../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/references/switch-matrix.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as { states: Record<string, { expressions: string[] }> };
  assert.equal(Object.keys(parsed.states).length, 10);
  for (const state of EXPRESSION_STATES) {
    assert.deepEqual(
      [...EXPRESSION_COMBOS[state]],
      parsed.states[state]?.expressions ?? [],
      state,
    );
  }
});

test("BLOCK 2: approved expression deltas fit inside the face-plate crop", () => {
  const parsed = JSON.parse(
    readFileSync(
      new URL(
        "../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/references/switch-matrix.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as {
    states: Record<
      string,
      { diffFromOriginal: { bbox: [number, number, number, number] | null } }
    >;
  };
  const right = FACE_PLATE_RECT.x + FACE_PLATE_RECT.width;
  const bottom = FACE_PLATE_RECT.y + FACE_PLATE_RECT.height;
  assert.equal(FACE_PLATE_RECT.radius, 40);
  for (const [state, value] of Object.entries(parsed.states)) {
    const bbox = value.diffFromOriginal.bbox;
    if (!bbox) continue;
    const [x0, y0, x1, y1] = bbox;
    assert.ok(
      x0 >= FACE_PLATE_RECT.x &&
        y0 >= FACE_PLATE_RECT.y &&
        x1 <= right &&
        y1 <= bottom,
      `${state} bbox ${bbox.join(",")} outside face crop`,
    );
  }
});

const IDLE_TIMES = Array.from({ length: 49 }, (_, i) => i * 250); // 0..12 000
const DENSE_TIMES = Array.from({ length: 481 }, (_, i) => i * 50); // 0..24 000

function setValue(set: Set<number>, value: number): void {
  set.add(Math.round(value * 1_000_000) / 1_000_000);
}

function distinct(values: number[]): number {
  const set = new Set<number>();
  for (const value of values) setValue(set, value);
  return set.size;
}

function assertFiniteTransform(frame: RigFrame, label: string): void {
  for (const [id, t] of Object.entries(frame.groups)) {
    for (const [key, value] of Object.entries(t)) {
      assert.ok(Number.isFinite(value), `${label} ${id}.${key} not finite`);
    }
    assert.ok(
      Math.abs(t.rotationDeg) <= 3.5,
      `${label} ${id} rotation out of bounds: ${t.rotationDeg}`,
    );
    assert.equal(t.scaleX, 1, `${label} ${id} scaled x`);
    assert.equal(t.scaleY, 1, `${label} ${id} scaled y`);
    assert.ok(Number.isInteger(t.x), `${label} ${id}.x not integer`);
    assert.ok(Number.isInteger(t.y), `${label} ${id}.y not integer`);
  }
  for (const [z, deg] of Object.entries(frame.slots)) {
    assert.ok(Number.isFinite(deg), `${label} slot ${z} not finite`);
    assert.ok(Math.abs(deg) <= 3.5, `${label} slot ${z} out of bounds`);
  }
  for (const [z, dx] of Object.entries(frame.slotWarp)) {
    assert.ok(Number.isFinite(dx), `${label} slotWarp ${z} not finite`);
    assert.ok(Number.isInteger(dx), `${label} slotWarp ${z} not integer`);
    assert.ok(Math.abs(dx) <= 32, `${label} slotWarp ${z} out of bounds`);
  }
  assert.equal(frame.underlayAlpha, 0, `${label} underlay revived`);
}

test("BLOCK 2 animation: root stays welded and every translation is integer over 3 cycles", () => {
  for (let t = 0; t <= 36_000; t += 250) {
    const frame = rigFrameAt(t);
    assert.deepEqual(
      frame.groups.bodyRoot,
      { rotationDeg: 0, x: 0, y: 0, scaleX: 1, scaleY: 1 },
      `root moved at ${t}`,
    );
    assertFiniteTransform(frame, `idle ${t}`);
  }
});

test("BLOCK 2 animation: both arms, both legs, hair, fabric and head really move", () => {
  const frames = IDLE_TIMES.map((t) => rigFrameAt(t));
  const channels: Record<string, number[]> = {
    legWarpL: frames.map((f) => f.slotWarp[3] ?? 0),
    legWarpR: frames.map((f) => f.slotWarp[4] ?? 0),
    chest: frames.map((f) => f.breathLift),
  };
  for (const [name, values] of Object.entries(channels)) {
    assert.ok(
      distinct(values) >= 3,
      `${name} is static (${distinct(values)} states)`,
    );
  }
  // CATEGORY-D GUARD: arms, back hair, side locks and skirt may NEVER move
  // rigidly against the neighbours that share their zero-overlap cut
  // contours — their visible motion comes from the shared breathing field
  // row-mesh, which deforms them together with the torso band.
  for (const f of frames) {
    for (const g of [
      f.groups.armGroupL,
      f.groups.armGroupR,
      f.groups.backHairGroup,
      f.groups.frontHairGroup,
    ]) {
      assert.equal(g.rotationDeg, 0, "pendulum rotation reintroduced");
      assert.equal(g.y, 0, "rigid follow translation reintroduced");
      assert.equal(g.x, 0, "rigid horizontal shift reintroduced");
    }
    for (const z of [1, 2, 6, 7, 11, 12, 17, 18, 19, 20]) {
      assert.equal(f.slots[z] ?? 0, 0, `slot ${z} pendulum reintroduced`);
    }
  }
  // The field really covers arms, back hair and fabric: all of their slots
  // are row-meshed and the band weight is positive at their anchor rows.
  for (const z of [1, 2, 6, 7, 11, 12]) {
    assert.ok(
      (BREATH_MESH_SLOTS as readonly number[]).includes(z),
      `slot ${z} not in the shared breathing field`,
    );
  }
  for (const y of [340, 380, 460, 500]) {
    assert.ok(breathWeight(y) > 0, `field dead at row ${y}`);
  }
  assert.ok(
    channels.legWarpL.some((v, i) => v !== channels.legWarpR[i]),
    "left and right leg pose warps move identically",
  );
  // Hip rotation retired (Category-D): leg slots must stay unrotated.
  for (const f of frames) {
    assert.equal(f.slots[3] ?? 0, 0, "left hip rotation reintroduced");
    assert.equal(f.slots[4] ?? 0, 0, "right hip rotation reintroduced");
  }
  for (const name of ["legWarpL", "legWarpR"]) {
    const values = channels[name];
    assert.ok(
      Math.min(...values) < -0.5 && Math.max(...values) > 0.5,
      `${name} never reaches both sides of the pose`,
    );
  }
  // Skirt rotation retired (Category-D): both parts are welded into the
  // shared breathing field; the guard above keeps slots 11/12 at zero.
});

test("BLOCK 2 animation: three full cycles are seam-exact and return to rest", () => {
  const a = snapshot(rigFrameAt(0));
  for (const t of [12_000, 24_000, 36_000]) {
    assert.deepEqual(snapshot(rigFrameAt(t)), a, `drift at ${t}`);
  }
  const rest = rigFrameAt(0);
  assert.deepEqual(rest.groups.bodyRoot, {
    rotationDeg: 0,
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
  });
});

test("BLOCK 2 animation: expression transitions stay normalized over 2 cycles", () => {
  for (const t of DENSE_TIMES) {
    const targets = expressionTargetsAt(t);
    const sum = Object.values(targets).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(sum - 1) < 1e-9, `sum=${sum} at ${t}`);
    for (const alpha of Object.values(targets)) {
      assert.ok(alpha >= 0 && alpha <= 1, `alpha=${alpha} at ${t}`);
    }
    assert.ok(
      (EXPRESSION_STATES as readonly string[]).includes(
        dominantExpressionState(targets),
      ),
    );
    assert.equal(rigFrameAt(t).blinkClosed, isBlinkClosed(t));
  }
});

test("BLOCK 2 animation: auto blink and every tap reaction close BOTH eyes", () => {
  const bothEyes = (state: ExpressionStateName): boolean =>
    EXPRESSION_COMBOS[state].includes("eye_l_closed-B") &&
    EXPRESSION_COMBOS[state].includes("eye_r_closed-B");

  // Auto blink is a dedicated opaque overlay plate above the dominant
  // plate: both eyes close fully (weight 1 during the hold phase) while
  // the base expression underneath stays stable (no mid-blink plate swap).
  for (const start of [2_600, 6_600, 10_600]) {
    const hold = start + 120; // inside close(90) + hold(80) plateau
    const overlay = blinkOverlayAt(hold);
    assert.ok(bothEyes(overlay.state), `blink ${hold} used ${overlay.state}`);
    assert.equal(overlay.weight, 1, `blink not fully closed at ${hold}`);
    assert.equal(isBlinkClosed(hold), true);
    const base = dominantExpressionState(expressionTargetsAt(hold));
    assert.ok(!bothEyes(base), `base plate swapped mid-blink at ${hold}`);
    // Smooth envelope: partially closed on the way in, reopening after.
    const closing = blinkOverlayAt(start + 45).weight;
    const reopening = blinkOverlayAt(start + 235).weight;
    assert.ok(closing > 0 && closing < 1, `no smooth close at ${start}`);
    assert.ok(reopening > 0 && reopening < 1, `no smooth reopen at ${start}`);
    assert.equal(blinkOverlayAt(start - 10).weight, 0);
    assert.equal(blinkOverlayAt(start + 310).weight, 0);
  }

  // Tap mapping: the runtime keeps one opaque both-eye plate dominant for the
  // whole 900 ms override, across every phase of two idle cycles.
  for (const zone of ["head", "hair", "body", "arms"] as const) {
    const state = TAP_EXPRESSION_STATES[zone];
    assert.ok(bothEyes(state), `tap ${zone} maps to one-eye state ${state}`);
    for (let t = 0; t < 24_000; t += 50) {
      const dominant = dominantExpressionState(
        expressionTargetsAt(t, { state, weight: 1 }),
      );
      assert.ok(
        bothEyes(dominant),
        `tap ${zone} opens an eye at ${t} ms: ${dominant}`,
      );
    }
    const tapped = dominantExpressionState(
      expressionTargetsAt(1_000, { state, weight: 1 }),
    );
    assert.equal(tapped, state, `tap ${zone} override not dominant`);
  }
  assert.equal(TAP_EXPRESSION_STATES.head, "05-both-eyes-closed");
  assert.equal(TAP_EXPRESSION_STATES.hair, "06-both-eyes-closed-smile");
  assert.equal(TAP_EXPRESSION_STATES.body, "07-mouth_open-both-eyes-closed");
});

test("BLOCK 2 animation: four touch zones keep distinct impulses and decay without drift", () => {
  const impulses = (["head", "hair", "body", "arms"] as const).map((z) =>
    triggerReaction(z),
  );
  assert.equal(new Set(impulses.map((r) => JSON.stringify(r))).size, 4);
  for (const reaction of impulses) {
    const decayed = decayReaction(reaction, 2_000);
    assert.ok(reactionEnergy(decayed) < 0.002, "reaction did not decay");
  }
  const idle = rigFrameAt(1_000);
  assert.deepEqual(
    snapshot(applyReaction(idle, { ...NO_REACTION })),
    snapshot(idle),
  );
});

test("BLOCK 2 animation: tap distributes motion without root lift, scale or rotation", () => {
  const idle = rigFrameAt(1_000);
  for (const zone of ["head", "hair", "body", "arms"] as const) {
    const tapped = applyReaction(idle, triggerReaction(zone));
    assert.deepEqual(
      tapped.groups.bodyRoot,
      idle.groups.bodyRoot,
      `root changed on ${zone}`,
    );
    assertFiniteTransform(tapped, `tap ${zone}`);
    // Hip rotation retired (Category-D): tap feedback reaches the legs
    // through the graded knee-area warp only, and the field pulse makes
    // every zone visibly respond even when the integer warp rounds equal.
    assert.equal(tapped.slots[3], idle.slots[3], `hip rotated on ${zone}`);
    assert.equal(tapped.slots[4], idle.slots[4], `hip rotated on ${zone}`);
    assert.ok(
      tapped.slotWarp[3] !== idle.slotWarp[3] ||
        tapped.breathLift !== idle.breathLift,
      `no visible response on ${zone}`,
    );
    const headHeavy = zone === "head" || zone === "hair";
    if (headHeavy) {
      assert.notDeepEqual(
        tapped.groups.headGroup,
        idle.groups.headGroup,
        `head frozen on ${zone}`,
      );
    }
    const armHeavy = zone === "body" || zone === "arms";
    if (armHeavy) {
      // Arms respond through the SHARED breathing field (whole torso band
      // plus arms rise together) — a rigid arm rotation tore the shared
      // cut contours open on every tap (Category-D).
      assert.notEqual(
        tapped.breathLift,
        idle.breathLift,
        `field impulse missing on ${zone}`,
      );
    } else {
      // Head/hair taps answer through the head micro-rotation and the
      // shared field pulse — never through a hair-group sway.
      assert.ok(
        tapped.breathLift !== idle.breathLift ||
          tapped.groups.headGroup.rotationDeg !==
            idle.groups.headGroup.rotationDeg,
        `no visible response on ${zone}`,
      );
    }
    // Welded groups must stay welded during taps too.
    for (const g of [
      "armGroupL",
      "armGroupR",
      "backHairGroup",
      "frontHairGroup",
    ] as const) {
      assert.deepEqual(
        tapped.groups[g],
        idle.groups[g],
        `${g} torn on ${zone}`,
      );
    }
  }
});

test("BLOCK 2 animation: dense transitions stay finite, bounded and drift-free", () => {
  for (const t of DENSE_TIMES) {
    const frame = applyReaction(rigFrameAt(t), triggerReaction("body"));
    assertFiniteTransform(frame, `transition ${t}`);
    assert.deepEqual(frame.groups.bodyRoot, {
      rotationDeg: 0,
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
    });
  }
});

test("critical repair: a suspended WebKit frame cannot teleport the pose", () => {
  assert.equal(clampedAnimationDeltaMs(16.7), 16.7);
  assert.equal(clampedAnimationDeltaMs(1_500), 100);
  assert.equal(clampedAnimationDeltaMs(Number.POSITIVE_INFINITY), 0);
  assert.equal(clampedAnimationDeltaMs(-1), 0);
  // Hip rotation retired (Category-D): the visible mobile-scale leg pose
  // lives in the graded knee-area warp instead.
  assert.ok(
    Math.abs(rigFrameAt(1_500).slotWarp[3] ?? 0) > 10,
    "mobile-scale leg pose is not visibly larger than the rejected build",
  );
});

test("critical repair: lifecycle wake-up paths, one-copy graph and toast lanes exist", () => {
  const bootstrap = readFileSync("src/app/bootstrap/bootstrap.ts", "utf8");
  const rig = readFileSync("src/heroine/rig/ProductionHeroineRig.ts", "utf8");
  const feedback = readFileSync(
    "src/presentation/pixi/RewardFeedback.ts",
    "utf8",
  );
  for (const wakeUp of [
    "pageshow",
    "focus",
    "webkitvisibilitychange",
    "pointerdown",
    "checkTickerLiveness",
  ]) {
    assert.ok(bootstrap.includes(wakeUp), `missing wake-up path ${wakeUp}`);
  }
  assert.ok(
    bootstrap.includes("__qaFreezeTicker"),
    "dev-only deterministic QA bridge missing",
  );
  assert.ok(
    !rig.includes("COVERAGE_STATIC_SLOTS"),
    "static topmost overlay remains",
  );
  assert.ok(
    !rig.includes("buildCoverage"),
    "static full-canvas composite remains",
  );
  assert.ok(!rig.includes("this.coverage"), "coverage sprite remains");
  assert.ok(
    rig.includes("runtimeSlotTexture"),
    "compact animated slot textures missing",
  );
  assert.ok(
    rig.includes("assertVisibleSlotGraph"),
    "one-copy graph assertion missing",
  );
  assert.ok(feedback.includes("activeLanes"), "toast lane allocator missing");
  assert.ok(
    feedback.includes("lane * 28"),
    "toast lanes do not separate vertically",
  );
});

test("BODY COHESION: breathing cannot open a zero-overlap seam", () => {
  // Field is pinned to exactly zero at the neck and hip junction rows, and
  // beyond them, so the torso band stays welded to the head and the legs.
  assert.equal(breathWeight(BREATH.topY), 0, "field moves the neck row");
  assert.equal(breathWeight(BREATH.bottomY), 0, "field moves the hip row");
  assert.equal(breathWeight(260), 0, "field reaches the head");
  assert.equal(breathWeight(654), 0, "field reaches the legs' top row");
  assert.equal(breathWeight(BREATH.peakY), 1, "chest peak is not full");
  assert.ok(
    breathWeight(360) > 0 && breathWeight(480) > 0,
    "chest band does not breathe",
  );

  let maxLift = 0;
  for (let t = 0; t <= 36_000; t += 125) {
    const f = rigFrameAt(t);
    maxLift = Math.max(maxLift, Math.abs(f.breathLift));
    // No independent translations that previously opened the seams:
    assert.equal(f.groups.outfitGroup.y, 0, `outfit translated at ${t}`);
    assert.equal(f.groups.headGroup.y, 0, `head translated at ${t}`);
    assert.equal(f.groups.legGroup.y, 0, `legs translated at ${t}`);
    assert.equal(f.groups.outfitGroup.x, 0, `outfit shifted at ${t}`);
    // Arms are row-meshed by the shared field: their groups stay welded.
    assert.equal(f.groups.armGroupL.y, 0, `left arm detached at ${t}`);
    assert.equal(f.groups.armGroupR.y, 0, `right arm detached at ${t}`);
    // Skirt parts sway the same direction: no counter-rotation seam inside
    // the skirt.
    assert.ok(
      (f.slots[11] ?? 0) * (f.slots[12] ?? 0) >= 0,
      `skirt counter-rotation at ${t}`,
    );
    assert.ok(
      Math.abs(f.breathLift) <= BREATH.liftPx + 1e-9,
      `breath lift out of bounds at ${t}`,
    );
  }
  // Breathing must stay visible: the chest band really moves.
  assert.ok(maxLift >= 4, `breathing invisible (max lift ${maxLift}px)`);
  assert.ok(BREATH.liftPx >= 6, "breathing amplitude below mobile scale");
});

test("BODY COHESION: tap reactions keep the same seam rules", () => {
  for (const zone of ["head", "hair", "body", "arms"] as const) {
    const reaction = triggerReaction(zone);
    for (let t = 0; t <= 12_000; t += 500) {
      const f = applyReaction(rigFrameAt(t), reaction);
      assert.equal(f.groups.outfitGroup.y, 0, `outfit jumped on ${zone}`);
      assert.equal(f.groups.headGroup.y, 0, `head jumped on ${zone}`);
      assert.equal(f.groups.legGroup.y, 0, `legs jumped on ${zone}`);
      assert.equal(
        f.groups.armGroupL.y,
        f.groups.armGroupR.y,
        `arms detached vertically on ${zone}`,
      );
      assert.ok(
        Math.abs(f.breathLift) <= BREATH.liftPx * 1.5 + 1e-9,
        `reaction breath lift unbounded on ${zone}`,
      );
    }
  }
});

test("ALPHA REPAIR: small interior punch-holes close, real openings survive", () => {
  const W = 40;
  const H = 40;
  const data = new Uint8ClampedArray(W * H * 4);
  const set = (x: number, y: number, r: number, a: number): void => {
    const i = (y * W + x) * 4;
    data[i] = r;
    data[i + 1] = 120;
    data[i + 2] = 90;
    data[i + 3] = a;
  };
  // Opaque body 4..35 x 4..35 with: AA edge at x=4, a 2x2 punch-hole at
  // (10..11, 10..11), a semi-alpha dot at (20,20), and a big 12x12 opening
  // at (22..33, 22..33) that must survive.
  for (let y = 4; y < 36; y += 1)
    for (let x = 4; x < 36; x += 1) set(x, y, 200, 255);
  for (let y = 4; y < 36; y += 1) set(4, y, 200, 120); // silhouette AA
  set(10, 10, 0, 0);
  set(11, 10, 0, 0);
  set(10, 11, 0, 0);
  set(11, 11, 0, 0);
  set(20, 20, 210, 90); // weak interior dot keeps its approved RGB
  for (let y = 22; y < 34; y += 1)
    for (let x = 22; x < 34; x += 1) set(x, y, 0, 0); // genuine opening
  const result = solidifyInteriorHoles(data, W, H, {
    alphaThreshold: 250,
    maxHoleArea: 100,
  });
  assert.equal(result.filledPixels, 5, "filled wrong number of pixels");
  assert.equal(result.preservedLargeComponents, 1, "big opening not kept");
  const alphaAt = (x: number, y: number): number =>
    data[(y * W + x) * 4 + 3] ?? 0;
  const redAt = (x: number, y: number): number => data[(y * W + x) * 4] ?? 0;
  assert.equal(alphaAt(10, 10), 255, "punch-hole still transparent");
  assert.ok(redAt(10, 10) > 150, "hole RGB not rebuilt from neighbours");
  assert.equal(alphaAt(20, 20), 255, "weak dot not solidified");
  assert.equal(redAt(20, 20), 210, "weak dot approved RGB changed");
  assert.equal(alphaAt(25, 25), 0, "genuine art opening was filled");
  assert.equal(alphaAt(4, 10), 120, "silhouette AA edge was altered");
  assert.equal(alphaAt(0, 0), 0, "background filled");
});

test("ALPHA REPAIR: approved openings are never closed", () => {
  const W = 20;
  const H = 20;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 2; y < 18; y += 1)
    for (let x = 2; x < 18; x += 1) {
      const i = (y * W + x) * 4;
      data[i + 3] = 255;
    }
  const hole = (x: number, y: number): void => {
    data[(y * W + x) * 4 + 3] = 0;
  };
  hole(5, 5); // protected approved opening
  hole(12, 12); // genuine punch-hole defect
  const result = solidifyInteriorHoles(data, W, H, {
    alphaThreshold: 250,
    maxHoleArea: 100,
    protectedRects: [[5, 5, 5, 5]],
  });
  assert.equal(result.filledPixels, 1, "should fill only the defect");
  assert.equal(result.preservedLargeComponents, 1, "opening not preserved");
  assert.equal(data[(5 * W + 5) * 4 + 3], 0, "approved opening was closed");
  assert.equal(data[(12 * W + 12) * 4 + 3], 255, "defect not closed");
});

test("ALPHA REPAIR: restoration source supplies the artist's original RGB", () => {
  const W = 16;
  const H = 16;
  const data = new Uint8ClampedArray(W * H * 4);
  const restore = new Uint8ClampedArray(W * H * 4);
  for (let y = 2; y < 14; y += 1) {
    for (let x = 2; x < 14; x += 1) {
      const i = (y * W + x) * 4;
      data[i] = 200;
      data[i + 1] = 180;
      data[i + 2] = 190;
      data[i + 3] = 255;
    }
  }
  for (let i = 0; i < W * H; i += 1) {
    restore[i * 4] = 59; // flat painted shadow tone from the original art
    restore[i * 4 + 1] = 36;
    restore[i * 4 + 2] = 75;
    restore[i * 4 + 3] = 255;
  }
  const hole = (7 * W + 7) * 4; // transparent punch-hole inside the body
  data[hole] = 0;
  data[hole + 1] = 0;
  data[hole + 2] = 0;
  data[hole + 3] = 0;
  const result = solidifyInteriorHoles(data, W, H, {
    alphaThreshold: 250,
    maxHoleArea: 1500,
    restoreRgb: restore,
  });
  assert.equal(result.filledPixels, 1);
  assert.equal(result.rebuiltRgbPixels, 1);
  assert.equal(data[hole + 3], 255, "hole not closed");
  assert.equal(data[hole], 59, "original RGB not restored");
  assert.equal(data[hole + 1], 36, "original RGB not restored");
  assert.equal(data[hole + 2], 75, "original RGB not restored");
});
