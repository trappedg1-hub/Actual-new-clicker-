import { Action } from "pixijs-actions";
import type { Container } from "pixi.js";

export interface IdleRigLayers {
  torso: Container;
  frontHair: Container;
  backHair: Container;
  eyes: Container;
  eyelids: Container;
}

/** Idle is composed from independently animated rig layers and pauses with the renderer ticker. */
export function startIdlePose(layers: IdleRigLayers): void {
  layers.torso.runWithKey(
    "idle-breath",
    Action.repeatForever(
      Action.sequence([
        Action.scaleTo(1, 1.018, 1.45).easeInOut(),
        Action.scaleTo(1, 1, 1.45).easeInOut(),
      ]),
    ),
  );
  layers.frontHair.runWithKey(
    "idle-front-hair",
    Action.repeatForever(
      Action.sequence([
        Action.rotateByDegrees(1.5, 1.25).easeInOut(),
        Action.rotateByDegrees(-3, 1.5).easeInOut(),
        Action.rotateByDegrees(1.5, 1.25).easeInOut(),
      ]),
    ),
  );
  layers.backHair.runWithKey(
    "idle-back-hair",
    Action.repeatForever(
      Action.sequence([
        Action.rotateByDegrees(-0.8, 1.5).easeInOut(),
        Action.rotateByDegrees(1.6, 1.5).easeInOut(),
        Action.rotateByDegrees(-0.8, 1.5).easeInOut(),
      ]),
    ),
  );
  layers.eyes.runWithKey(
    "idle-blink",
    Action.repeatForever(
      Action.sequence([
        Action.waitForDuration(3.8),
        Action.scaleTo(1, 0.12, 0.08).easeIn(),
        Action.scaleTo(1, 1, 0.14).easeOut(),
      ]),
    ),
  );
  layers.eyelids.runWithKey(
    "idle-eyelids",
    Action.repeatForever(
      Action.sequence([
        Action.waitForDuration(3.8),
        Action.fadeIn(0.06),
        Action.waitForDuration(0.05),
        Action.fadeOut(0.12),
      ]),
    ),
  );
}
