import assert from "node:assert/strict";
import test from "node:test";
import { Container } from "pixi.js";
import { Action, registerPixiJSActionsMixin } from "pixijs-actions";
import {
  advanceFrame,
  createTestTicker,
  findRigLayer,
  frameElapsedMs,
  HEROINE_LAYER_LABELS,
  resizeRendererAndScene,
} from "../src/app/frameLoop.ts";
import { LayeredHeroineRig } from "../src/heroine/rig/LayeredHeroineRig.ts";
import { BottomNavigation } from "../src/presentation/ui/BottomNavigation.ts";
import { createStyledButton } from "../src/presentation/ui/button.ts";
import { RewardFeedback } from "../src/presentation/pixi/RewardFeedback.ts";

// Pixi's action methods (run/runWithKey/removeAllActions) are added by this mixin in production.
registerPixiJSActionsMixin(Container);

/** Runs the action system for `frames` frames of `ms` each, without starting the ticker. */
function tickActions(frames: number, ms = 16.67): void {
  const ticker = createTestTicker();
  ticker.lastTime = 0;
  ticker.add((t) => Action.tick(t.elapsedMS));
  for (let frame = 1; frame <= frames; frame += 1) ticker.update(frame * ms);
}

// ---------------------------------------------------------------------------
// P0 - the rig could not be constructed at all, so the app showed a blank screen.
// ---------------------------------------------------------------------------

test("P0: the rig finds its eye/eyelid/mouth layers and constructs", () => {
  const rig = new LayeredHeroineRig(() => {});

  assert.equal(rig.layers.eyes.label, HEROINE_LAYER_LABELS.eyes);
  assert.equal(rig.layers.eyelids.label, HEROINE_LAYER_LABELS.eyelids);
  assert.equal(rig.layers.mouth.label, HEROINE_LAYER_LABELS.mouth);
  assert.ok(rig.layers.eyes.children.length > 0);
});

test("P0: the old short labels never matched, which is what broke the rig", () => {
  const head = new Container();
  const eyes = new Container();
  eyes.label = "eyes placeholder layer";
  head.addChild(eyes);

  // The pre-fix lookup used the short name and silently returned null.
  assert.equal(head.getChildByLabel("eyes"), null);
  assert.equal(head.getChildByLabel("eyes placeholder layer"), eyes);
});

test("P0: a missing layer fails loudly instead of returning null", () => {
  const head = new Container();
  head.addChild(new Container({ label: "eyes placeholder layer" }));

  assert.throws(
    () => findRigLayer(head, "eyelids"),
    /LayeredHeroineRig is missing the "eyelids placeholder layer" layer/,
  );
});

// ---------------------------------------------------------------------------
// P1 - passive income was lost because deltaMS is capped at 100 ms.
// ---------------------------------------------------------------------------

test("P1: pixel cap of deltaMS loses most of a slow frame, elapsedMS does not", () => {
  const ticker = createTestTicker();
  ticker.lastTime = 0;
  ticker.update(260); // a 4 FPS frame, like the headless SwiftShader runs

  assert.equal(ticker.deltaMS, 100);
  assert.equal(frameElapsedMs(ticker), 260);
});

test("P1: accumulating deltaMS keeps the economy at full wall-clock speed", () => {
  const ticker = createTestTicker();
  ticker.lastTime = 0;
  let clamped = 0;
  let raw = 0;

  for (let frame = 1; frame <= 4; frame += 1) {
    ticker.update(frame * 260);
    clamped += ticker.deltaMS;
    raw += frameElapsedMs(ticker);
  }

  // Four 260 ms frames is 1040 ms of real time; the clamped clock only sees 400 ms.
  assert.equal(raw, 1040);
  assert.equal(clamped, 400);
  assert.equal(advanceFrame(ticker, 0, false).elapsedMs, 260);
});

test("P1: a paused or non-advancing frame contributes no game time", () => {
  const ticker = createTestTicker();
  ticker.lastTime = 0;

  // First frame: 260 ms of real time, but the scene is paused (backgrounded).
  ticker.update(260);
  const pausedFrame = advanceFrame(ticker, 1_000, true);
  assert.equal(pausedFrame.elapsedMs, 0);
  assert.equal(pausedFrame.skipped, true);

  // Same timestamp twice -> Pixi reports elapsedMS 0; the clock must not move backwards.
  ticker.update(260);
  const stalledFrame = advanceFrame(ticker, 1_000, false);
  assert.equal(stalledFrame.elapsedMs, 0);
  assert.equal(stalledFrame.skipped, true);
  assert.equal(stalledFrame.nowMs, 1_000);
});

test("P1: the frame clock advances by the real elapsed time", () => {
  const ticker = createTestTicker();
  ticker.lastTime = 0;
  ticker.update(250);

  const frame = advanceFrame(ticker, 5_000, false);
  assert.equal(frame.nowMs, 5_250);
  assert.equal(frame.skipped, false);
});

// ---------------------------------------------------------------------------
// P1 - the canvas kept its old size, so the bottom UI slid under the home bar.
// ---------------------------------------------------------------------------

test("P1: ResizeObserver path resizes the renderer before laying out the scene", () => {
  const calls: string[] = [];
  const app = {
    screen: { width: 390, height: 763 },
    renderer: {
      resize(width: number, height: number) {
        calls.push(`renderer ${width}x${height}`);
      },
    },
  };
  const scene = {
    resize(width: number, height: number) {
      calls.push(`scene ${width}x${height}`);
    },
  };

  resizeRendererAndScene(app, scene);

  assert.deepEqual(calls, ["renderer 390x763", "scene 390x763"]);
});

test("P1: scene layout reads the post-resize screen, not the stale one", () => {
  const app = {
    screen: { width: 390, height: 844 },
    renderer: {
      resize(width: number, height: number) {
        // The renderer applies the new size to app.screen, exactly like Pixi does.
        app.screen = { width, height };
      },
    },
  };
  let seen = "";
  const scene = {
    resize() {
      seen = `${app.screen.width}x${app.screen.height}`;
    },
  };

  resizeRendererAndScene(app, scene);
  assert.equal(seen, "390x844");
});

// ---------------------------------------------------------------------------
// P2 - the bottom navigation was wider than a 280 px viewport.
// ---------------------------------------------------------------------------

test("P2: bottom navigation fits inside a 280 px viewport", () => {
  const nav = new BottomNavigation(() => {});

  nav.resize(280, 568);
  assert.equal(nav.contentWidth, 264);
  assert.ok(nav.contentWidth <= 280);

  nav.resize(320, 568);
  assert.equal(nav.contentWidth, 304);

  nav.resize(844, 390);
  assert.equal(nav.contentWidth, 828);
});

test("P2: six sections still fit at the 280 px minimum", () => {
  const nav = new BottomNavigation(() => {});
  nav.resize(280, 568);

  const row = nav.children[1];
  assert.ok(row, "navigation row must exist");
  assert.equal(row.children.length, 6);

  // Six 36 px items plus five 4 px gaps must fit in the 248 px inner width.
  const innerWidth = nav.contentWidth - 16;
  assert.ok(
    6 * 36 + 5 * 4 <= innerWidth,
    `six sections must fit in ${innerWidth} px`,
  );
});

// ---------------------------------------------------------------------------
// P2 - every toast created a fresh Text and leaked a GPU texture.
// ---------------------------------------------------------------------------

test("P2: toasts are pooled and stay bounded", () => {
  const stage = new Container();
  const feedback = new RewardFeedback(stage);

  for (let index = 0; index < 20; index += 1) {
    feedback.show(`+5 credits`, 10, 10);
    tickActions(50); // let the full ~0.8 s sequence finish so it is released
  }

  assert.ok(
    stage.children.length <= 1,
    `expected at most one live toast, saw ${stage.children.length}`,
  );
  assert.ok(feedback.pooledCount <= 8, `pool grew to ${feedback.pooledCount}`);

  feedback.destroy();
  assert.equal(feedback.pooledCount, 0);
});

test("P2: a released toast is reused instead of adding a new node", () => {
  const stage = new Container();
  const feedback = new RewardFeedback(stage);

  feedback.show("+5 credits", 10, 10);
  tickActions(50);
  const afterFirst = stage.children.length;
  assert.equal(afterFirst, 1);

  feedback.show("+4 credits", 20, 20);
  assert.equal(
    stage.children.length,
    afterFirst,
    "second toast must reuse the pooled node",
  );

  feedback.destroy();
});

test("P2: a reused toast becomes visible again", () => {
  const stage = new Container();
  const feedback = new RewardFeedback(stage);

  feedback.show("+5 credits", 10, 10);
  tickActions(50);
  const pooled = stage.children[0];
  assert.ok(pooled);
  assert.equal(pooled.visible, false, "released toast must be hidden");

  feedback.show("+5 credits", 10, 10);
  assert.equal(pooled.visible, true, "reused toast must be shown again");
  assert.equal(pooled.alpha, 0, "reused toast fades in from zero");

  feedback.destroy();
});

test("P2: toasts of different tones get their own pool entries", () => {
  const stage = new Container();
  const feedback = new RewardFeedback(stage);

  feedback.show("+5 credits", 10, 10, "reward");
  feedback.show("TIER 2", 10, 10, "milestone");
  assert.equal(stage.children.length, 2);

  feedback.destroy();
});

// ---------------------------------------------------------------------------
// P3 - setLabel left the container label stale.
// ---------------------------------------------------------------------------

test("P3: setLabel keeps the rendered text and the container label in sync", () => {
  const button = createStyledButton("КУПИТЬ", {
    width: 100,
    height: 40,
    onPress: () => {},
  });

  button.setLabel("КУПИТЬ · 20");
  assert.equal(button.label.text, "КУПИТЬ · 20");
  assert.equal(button.node.label, "КУПИТЬ · 20");

  button.setLabel("ЗАКРЫТО · УР 1");
  assert.equal(button.node.label, "ЗАКРЫТО · УР 1");
});
