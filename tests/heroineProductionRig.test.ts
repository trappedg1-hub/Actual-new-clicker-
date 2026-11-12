import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyReaction,
  decayReaction,
  EXPRESSION_COMBOS,
  EXPRESSION_STATES,
  expressionTargetsAt,
  FACE_PLATE_RECT,
  isBlinkClosed,
  NO_REACTION,
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

test("BLOCK 2 fix: every layer stays welded to the root (no relative motion)", () => {
  const rootKeys = new Set(["bodyRoot"]);
  for (const timeMs of [0, 500, 1_000, 2_670, 4_000, 8_000, 11_900, 12_000]) {
    const frame = rigFrameAt(timeMs);
    for (const [id, t] of Object.entries(frame.groups)) {
      if (rootKeys.has(id)) continue;
      assert.equal(t.rotationDeg, 0, `${id} rotated at ${timeMs}`);
      assert.equal(t.x, 0, `${id} shifted x at ${timeMs}`);
      assert.equal(t.y, 0, `${id} shifted y at ${timeMs}`);
      assert.equal(t.scaleX, 1, `${id} scaled x at ${timeMs}`);
      assert.equal(t.scaleY, 1, `${id} scaled y at ${timeMs}`);
    }
    for (const [z, deg] of Object.entries(frame.slots)) {
      assert.equal(deg, 0, `slot ${z} rotated at ${timeMs}`);
    }
    assert.equal(frame.groups.bodyRoot.rotationDeg, 0);
    // Scaling the root resamples every approved cut-out and turns its thin
    // dark contour into black speckles. Motion must be an integer translation.
    assert.equal(frame.groups.bodyRoot.scaleX, 1, `root scaled x at ${timeMs}`);
    assert.equal(frame.groups.bodyRoot.scaleY, 1, `root scaled y at ${timeMs}`);
    assert.ok(
      Number.isInteger(frame.groups.bodyRoot.y),
      `root y fractional at ${timeMs}`,
    );
    assert.equal(frame.underlayAlpha, 0);
  }
});

test("BLOCK 2 fix: a tap never separates any layer or revives the dotted underlay", () => {
  const idle = rigFrameAt(1_000);
  for (const zone of ["head", "hair", "body", "arms"] as const) {
    const tapped = applyReaction(idle, triggerReaction(zone));
    assert.equal(tapped.underlayAlpha, 0, `underlay revived by ${zone}`);
    for (const [id, t] of Object.entries(tapped.groups)) {
      if (id === "bodyRoot") continue;
      assert.deepEqual(
        t,
        idle.groups[id as keyof typeof idle.groups],
        `${id} moved on ${zone}`,
      );
    }
    for (const [z, deg] of Object.entries(tapped.slots)) {
      assert.equal(deg, idle.slots[Number(z)], `slot ${z} moved on ${zone}`);
    }
    assert.equal(tapped.groups.bodyRoot.rotationDeg, 0);
    assert.equal(tapped.groups.bodyRoot.x, idle.groups.bodyRoot.x);
    assert.equal(tapped.groups.bodyRoot.scaleX, 1, `root scaled x on ${zone}`);
    assert.equal(tapped.groups.bodyRoot.scaleY, 1, `root scaled y on ${zone}`);
    assert.ok(
      Number.isInteger(tapped.groups.bodyRoot.y),
      `root y fractional on ${zone}`,
    );
  }
});
