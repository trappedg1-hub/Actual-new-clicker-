import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyReaction,
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
  rigFrameAt,
  triggerReaction,
} from "../src/heroine/rig/animationMath.ts";
import type { RigFrame } from "../src/heroine/rig/animationMath.ts";

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
    assert.ok(Math.abs(dx) <= 12, `${label} slotWarp ${z} out of bounds`);
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
    armGroupL: frames.map((f) => f.groups.armGroupL.rotationDeg),
    armGroupR: frames.map((f) => f.groups.armGroupR.rotationDeg),
    shoulderL: frames.map((f) => f.groups.armGroupL.y),
    shoulderR: frames.map((f) => f.groups.armGroupR.y),
    armSlotL: frames.map((f) => f.slots[6] ?? 0),
    armSlotR: frames.map((f) => f.slots[7] ?? 0),
    legSlotL: frames.map((f) => f.slots[3] ?? 0),
    legSlotR: frames.map((f) => f.slots[4] ?? 0),
    legWarpL: frames.map((f) => f.slotWarp[3] ?? 0),
    legWarpR: frames.map((f) => f.slotWarp[4] ?? 0),
    backHairL: frames.map((f) => f.slots[1] ?? 0),
    backHairR: frames.map((f) => f.slots[2] ?? 0),
    sideHairL: frames.map((f) => f.slots[17] ?? 0),
    sideHairR: frames.map((f) => f.slots[18] ?? 0),
    fringe1: frames.map((f) => f.slots[19] ?? 0),
    fringe2: frames.map((f) => f.slots[20] ?? 0),
    skirtUpper: frames.map((f) => f.slots[11] ?? 0),
    skirtLower: frames.map((f) => f.slots[12] ?? 0),
    chest: frames.map((f) => f.groups.outfitGroup.y),
    headCompensation: frames.map((f) => f.groups.headGroup.y),
    backHairInertia: frames.map((f) => f.groups.backHairGroup.y),
    frontHairInertia: frames.map((f) => f.groups.frontHairGroup.y),
  };
  for (const [name, values] of Object.entries(channels)) {
    assert.ok(
      distinct(values) >= 3,
      `${name} is static (${distinct(values)} states)`,
    );
  }
  assert.ok(
    channels.armGroupL.some((v, i) => v !== channels.armGroupR[i]),
    "left and right arms move identically",
  );
  assert.ok(
    channels.legSlotL.some((v, i) => v !== channels.legSlotR[i]),
    "left and right legs move identically",
  );
  assert.ok(
    channels.legWarpL.some((v, i) => v !== channels.legWarpR[i]),
    "left and right leg pose warps move identically",
  );
  for (const name of ["legSlotL", "legSlotR", "legWarpL", "legWarpR"]) {
    const values = channels[name];
    assert.ok(
      Math.min(...values) < -0.5 && Math.max(...values) > 0.5,
      `${name} never reaches both sides of the pose`,
    );
  }
  assert.ok(
    channels.skirtUpper.some((v, i) => v !== channels.skirtLower[i]),
    "skirt has no counter-motion",
  );
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

  // Auto blink uses blinkStateFor(base.dominant): neutral / smile / open.
  for (const t of [2_670, 6_670, 10_670]) {
    const state = dominantExpressionState(expressionTargetsAt(t));
    assert.ok(bothEyes(state), `auto blink ${t} used ${state}`);
    assert.equal(isBlinkClosed(t), true);
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
    assert.notEqual(
      tapped.slots[3],
      idle.slots[3],
      `left leg frozen on ${zone}`,
    );
    assert.notEqual(
      tapped.slots[4],
      idle.slots[4],
      `right leg frozen on ${zone}`,
    );
    // A head tap has only body=0.3; its integer knee warp can legitimately
    // round to the same whole pixel while the hip rotation still changes.
    // The combined rendered leg pose must move for every zone.
    assert.ok(
      tapped.slots[3] !== idle.slots[3] ||
        tapped.slotWarp[3] !== idle.slotWarp[3],
      `left leg pose frozen on ${zone}`,
    );
    assert.ok(
      tapped.slots[4] !== idle.slots[4] ||
        tapped.slotWarp[4] !== idle.slotWarp[4],
      `right leg pose frozen on ${zone}`,
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
      assert.notDeepEqual(
        tapped.groups.armGroupL,
        idle.groups.armGroupL,
        `left arm frozen on ${zone}`,
      );
      assert.notDeepEqual(
        tapped.groups.armGroupR,
        idle.groups.armGroupR,
        `right arm frozen on ${zone}`,
      );
    } else {
      assert.notDeepEqual(
        tapped.groups.backHairGroup,
        idle.groups.backHairGroup,
        `back hair frozen on ${zone}`,
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
