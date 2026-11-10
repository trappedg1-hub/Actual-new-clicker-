import { Container } from "pixi.js";

/**
 * Two-level wrapper that stops idle and tap animations from fighting over the same
 * transform.
 *
 * The QA audit found that `idle-breath` and `tap-reaction` both wrote to
 * `torso.scale`, so a tap restarted a half-finished sequence and nudged the base
 * transform. Separating the targets fixes it structurally:
 *
 * ```
 * pose  <- tap reactions write here (always relative to identity)
 *  idle <- idle loops write here (breathing, hair sway, blinking)
 *   art <- the artwork itself, never animated
 * ```
 *
 * Because the two animated containers are different objects, both actions can run at
 * once and the result composes deterministically: `pose * idle`.
 */
export interface AnimationLayer {
  /** Outermost container. Tap reactions animate this node. */
  readonly pose: Container;
  /** Inner container. Idle loops animate this node. */
  readonly idle: Container;
  /** Innermost container holding the artwork (Graphics today, Sprite later). */
  readonly art: Container;
}

/**
 * Builds a pose -> idle -> art stack.
 *
 * Ownership of state is strict, which is what makes the stack safe:
 *
 * - `pose`  holds the REST TRANSFORM (position, the pivot offset). Nothing animates it
 *           except tap reactions, which compose on top.
 * - `idle`  holds ambient motion (breathing, sway, blinking).
 * - `art`   holds only the artwork and is always at identity, so replacing it never
 *           loses the layer's placement.
 *
 * Putting the rest position on `art` would break as soon as the art is swapped:
 * `removeChildren()` leaves the container's transform in place, but a caller that
 * rebuilds the node would silently teleport the layer.
 */
export function createAnimationLayer(label: string): AnimationLayer {
  const pose = new Container({ label });
  const idle = new Container({ label: `${label} idle` });
  const art = new Container({ label: `${label} art` });
  pose.addChild(idle);
  idle.addChild(art);
  return { pose, idle, art };
}

/** Resets an animatable node to its neutral transform. */
export function resetTransform(node: Container): void {
  node.position.set(0, 0);
  node.scale.set(1, 1);
  node.rotation = 0;
  node.alpha = 1;
  node.pivot.set(0, 0);
}
