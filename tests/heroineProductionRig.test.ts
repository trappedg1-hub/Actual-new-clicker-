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
