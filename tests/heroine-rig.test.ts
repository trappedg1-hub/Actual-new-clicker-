import assert from "node:assert/strict";
import test from "node:test";
import { Container, Texture, TextureSource } from "pixi.js";
import { registerPixiJSActionsMixin } from "pixijs-actions";
import {
  createAnimationLayer,
  resetTransform,
} from "../src/heroine/rig/animationLayer.ts";
import { LayeredHeroineRig } from "../src/heroine/rig/LayeredHeroineRig.ts";
import {
  buildFrames,
  HeroineArtSource,
  normalizeUrl,
  validateManifest,
  type AtlasManifest,
} from "../src/heroine/art/heroineArt.ts";

registerPixiJSActionsMixin(Container);

/**
 * A Texture over a real TextureSource so sub-frames can be exercised without a GPU.
 * The pixel data is irrelevant; only the geometry is asserted.
 */
function makeFakePage(width: number, height: number): Texture {
  const source = new TextureSource({ resource: { width, height } as never });
  source.width = width;
  source.height = height;
  return new Texture({ source, label: "test page" });
}

// ---------------------------------------------------------------------------
// AnimationLayer — the core of the pose/idle/art split.
// ---------------------------------------------------------------------------

test("AnimationLayer nests pose > idle > art", () => {
  const layer = createAnimationLayer("torso");

  assert.equal(layer.pose.children.length, 1);
  assert.equal(layer.pose.children[0], layer.idle);
  assert.equal(layer.idle.children[0], layer.art);
  assert.equal(layer.art.children.length, 0);
});

test("AnimationLayer keeps all three nodes labelled for lookup", () => {
  const layer = createAnimationLayer("torso");

  assert.equal(layer.pose.label, "torso");
  assert.equal(layer.idle.label, "torso idle");
  assert.equal(layer.art.label, "torso art");
});

test("resetTransform returns a node to its neutral state", () => {
  const node = new Container();
  node.position.set(10, 20);
  node.scale.set(2, 3);
  node.rotation = 0.5;
  node.alpha = 0.25;

  resetTransform(node);

  assert.deepEqual([node.position.x, node.position.y], [0, 0]);
  assert.deepEqual([node.scale.x, node.scale.y], [1, 1]);
  assert.equal(node.rotation, 0);
  assert.equal(node.alpha, 1);
});

// ---------------------------------------------------------------------------
// P1 (audit) — idle and tap reactions must not write to the same transform.
// ---------------------------------------------------------------------------

test("idle and reactions target different nodes of a rig part", () => {
  const rig = new LayeredHeroineRig(() => {});
  const torso = rig.stacks.torso;

  assert.notEqual(torso.pose, torso.idle);
  assert.equal(torso.pose.parent, rig);
  assert.equal(torso.idle.parent, torso.pose);
});

test("a tap reaction leaves the idle transform running untouched", () => {
  const rig = new LayeredHeroineRig(() => {});
  const torso = rig.stacks.torso;

  // The idle loop owns `idle.scale`; the reaction owns `pose.scale`.
  rig.reactToTap("body");

  assert.ok(
    torso.pose.action("tap-reaction"),
    "reaction starts on the pose node",
  );
  assert.ok(
    torso.idle.action("idle-breath"),
    "idle keeps running on the idle node",
  );
  assert.notEqual(torso.pose, torso.idle);
});

test("rapid taps restart the reaction without stacking transforms", () => {
  const rig = new LayeredHeroineRig(() => {});
  const head = rig.stacks.head;

  for (let tap = 0; tap < 12; tap += 1) rig.reactToTap("head");

  // runWithKey replaces the previous action, so one key stays one action.
  assert.ok(head.pose.action("tap-reaction"));
  const keys = head.pose.children.length;
  assert.equal(keys, 1, "repeated taps must not add child nodes");
});

test("reactions never animate the artwork container", () => {
  const rig = new LayeredHeroineRig(() => {});

  for (const zone of ["head", "hair", "body", "arms"] as const) {
    rig.reactToTap(zone);
  }

  for (const stack of Object.values(rig.stacks)) {
    assert.equal(
      stack.art.hasActions(),
      false,
      `${stack.art.label} must stay unanimated so art can be swapped`,
    );
  }
});

// ---------------------------------------------------------------------------
// Rig structure — hit areas and facial features must survive an art swap.
// ---------------------------------------------------------------------------

test("all six hit areas survive the pose/idle/art wrapping", () => {
  const rig = new LayeredHeroineRig(() => {});
  const interactive = [
    rig.layers.backHair,
    rig.layers.head,
    rig.layers.frontHair,
    rig.layers.torso,
    rig.layers.leftArm,
    rig.layers.rightArm,
  ];

  for (const node of interactive) {
    assert.equal(node.eventMode, "static", `${node.label} must stay tappable`);
    assert.ok(node.hitArea, `${node.label} must keep its hit area`);
  }
});

test("facial features live outside the head artwork container", () => {
  const rig = new LayeredHeroineRig(() => {});
  const headArt = rig.stacks.head.art;

  for (const feature of [
    rig.layers.eyes,
    rig.layers.eyelids,
    rig.layers.mouth,
  ]) {
    assert.equal(
      headArt.children.includes(feature),
      false,
      "a head art swap must not delete facial features",
    );
  }
});

test("applying art does not remove the eye, lid or mouth layers", () => {
  const rig = new LayeredHeroineRig(() => {});
  const eyesParent = rig.layers.eyes.parent;
  const mouthParent = rig.layers.mouth.parent;

  // A manifest that only contains the head would previously wipe the features.
  const manifest: AtlasManifest = {
    version: 1,
    page: { src: "art/x.png", width: 64, height: 64 },
    frames: [{ name: "head", x: 0, y: 0, width: 32, height: 32 }],
  };
  const source = new HeroineArtSource(manifest);
  const missing = rig.applyArt(source);

  assert.ok(missing.length > 0, "frames absent from the atlas are reported");
  assert.equal(rig.layers.eyes.parent, eyesParent);
  assert.equal(rig.layers.mouth.parent, mouthParent);
});

test("applyArt reports every frame it could not find", () => {
  const rig = new LayeredHeroineRig(() => {});
  const empty: AtlasManifest = {
    version: 1,
    page: { src: "art/x.png", width: 8, height: 8 },
    frames: [{ name: "unknown_frame", x: 0, y: 0, width: 8, height: 8 }],
  };

  const missing = rig.applyArt(new HeroineArtSource(empty));

  assert.ok(missing.includes("head"));
  assert.ok(missing.includes("torso"));
  assert.ok(missing.includes("eyes"));
});

// ---------------------------------------------------------------------------
// Art loader — validation must fail loudly, never blank the scene.
// ---------------------------------------------------------------------------

test("normalizeUrl joins base and src without doubling slashes", () => {
  assert.equal(normalizeUrl("/", "art/a.png"), "/art/a.png");
  assert.equal(normalizeUrl("/base/", "art/a.png"), "/base/art/a.png");
  assert.equal(normalizeUrl("/base", "art/a.png"), "/base/art/a.png");
  assert.equal(normalizeUrl("/", "/absolute.png"), "/absolute.png");
  assert.equal(normalizeUrl("/", "https://cdn/x.png"), "https://cdn/x.png");
});

test("validateManifest accepts a well-formed manifest", () => {
  const result = validateManifest({
    version: 1,
    page: { src: "art/a.png", width: 100, height: 100 },
    frames: [{ name: "head", x: 0, y: 0, width: 50, height: 50 }],
  });

  assert.ok("manifest" in result);
});

test("validateManifest rejects a missing page", () => {
  const result = validateManifest({ version: 1, frames: [{ name: "a" }] });

  assert.ok("failure" in result);
  assert.equal(result.failure, "missing-page");
});

test("validateManifest rejects an empty frame list", () => {
  const result = validateManifest({
    version: 1,
    page: { src: "art/a.png", width: 10, height: 10 },
    frames: [],
  });

  assert.ok("failure" in result);
  assert.equal(result.failure, "empty-frames");
});

test("validateManifest rejects a frame outside the page", () => {
  const result = validateManifest({
    version: 1,
    page: { src: "art/a.png", width: 100, height: 100 },
    frames: [{ name: "head", x: 90, y: 90, width: 50, height: 50 }],
  });

  assert.ok("failure" in result);
  assert.equal(result.failure, "frame-out-of-bounds");
});

test("validateManifest rejects a non-positive density", () => {
  const result = validateManifest({
    version: 1,
    page: { src: "art/a.png", width: 10, height: 10, density: 0 },
    frames: [{ name: "a", x: 0, y: 0, width: 5, height: 5 }],
  });

  assert.ok("failure" in result);
  assert.equal(result.failure, "bad-json");
});

test("HeroineArtSource exposes pivots and defaults to the frame centre", () => {
  const manifest: AtlasManifest = {
    version: 1,
    page: { src: "art/a.png", width: 100, height: 100 },
    frames: [
      {
        name: "explicit",
        x: 0,
        y: 0,
        width: 40,
        height: 20,
        pivotX: 10,
        pivotY: 4,
      },
      { name: "centred", x: 0, y: 0, width: 40, height: 20 },
    ],
  };
  const source = new HeroineArtSource(manifest);

  assert.deepEqual(source.pivot("explicit"), { x: 10, y: 4 });
  assert.deepEqual(source.pivot("centred"), { x: 20, y: 10 });
  assert.equal(source.pivot("nope"), null);
});

test("buildFrames registers one sub-texture per manifest frame", () => {
  const manifest: AtlasManifest = {
    version: 1,
    page: { src: "art/a.png", width: 100, height: 100 },
    frames: [
      { name: "one", x: 0, y: 0, width: 10, height: 10 },
      { name: "two", x: 10, y: 0, width: 10, height: 10 },
    ],
  };

  const texture = makeFakePage(100, 100);
  const source = buildFrames(manifest, texture);

  assert.deepEqual(source.frameNames.sort(), ["one", "two"]);
  const one = source.texture("one");
  assert.ok(one);
  assert.equal(one.frame.width, 10);
  assert.equal(one.frame.x, 0);
  const two = source.texture("two");
  assert.ok(two);
  assert.equal(two.frame.x, 10);
});
