import { Action } from "pixijs-actions";
import type { Container } from "pixi.js";
import type { HeroineTouchZone } from "../../domain/economy/types.ts";

export interface HeroineReactionLayers {
  head: Container;
  frontHair: Container;
  backHair: Container;
  torso: Container;
  leftArm: Container;
  rightArm: Container;
}

/** Reactions animate the tapped rig part(s), not a scale/rotation of the whole heroine. */
export function playZoneReaction(
  layers: HeroineReactionLayers,
  zone: HeroineTouchZone,
): void {
  switch (zone) {
    case "head":
      layers.head.runWithKey(
        "tap-reaction",
        Action.sequence([
          Action.rotateByDegrees(-4, 0.12).easeOut(),
          Action.rotateByDegrees(4, 0.2).easeInOut(),
        ]),
      );
      break;
    case "hair":
      layers.frontHair.runWithKey(
        "tap-reaction",
        Action.sequence([
          Action.rotateByDegrees(-5, 0.1).easeOut(),
          Action.rotateByDegrees(7, 0.16).easeInOut(),
          Action.rotateByDegrees(-2, 0.12).easeIn(),
        ]),
      );
      layers.backHair.runWithKey(
        "tap-reaction",
        Action.sequence([
          Action.rotateByDegrees(2, 0.16).easeOut(),
          Action.rotateByDegrees(-2, 0.2).easeInOut(),
        ]),
      );
      break;
    case "body":
      layers.torso.runWithKey(
        "tap-reaction",
        Action.sequence([
          Action.scaleTo(1.035, 0.97, 0.11).easeOut(),
          Action.scaleTo(1, 1, 0.18).easeInOut(),
        ]),
      );
      break;
    case "arms":
      layers.leftArm.runWithKey(
        "tap-reaction",
        Action.sequence([
          Action.rotateByDegrees(-7, 0.12).easeOut(),
          Action.rotateByDegrees(7, 0.2).easeInOut(),
        ]),
      );
      layers.rightArm.runWithKey(
        "tap-reaction",
        Action.sequence([
          Action.rotateByDegrees(7, 0.12).easeOut(),
          Action.rotateByDegrees(-7, 0.2).easeInOut(),
        ]),
      );
      break;
  }
}
