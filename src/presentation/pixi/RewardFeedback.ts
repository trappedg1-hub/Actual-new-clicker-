import { Action } from "pixijs-actions";
import { Container, Text } from "pixi.js";

export class RewardFeedback {
  constructor(private readonly parent: Container) {}

  show(
    text: string,
    x: number,
    y: number,
    tone: "reward" | "milestone" = "reward",
  ): void {
    const message = new Text({
      text,
      style: {
        fontFamily: "Arial",
        fontSize: tone === "milestone" ? 18 : 16,
        fontWeight: "700",
        fill: tone === "milestone" ? "#ffd7fa" : "#ffffff",
        stroke: { color: "#321844", width: 4 },
      },
    });
    message.anchor.set(0.5);
    message.position.set(x, y);
    message.alpha = 0;
    message.eventMode = "none";
    this.parent.addChild(message);
    message.run(
      Action.sequence([
        Action.group([
          Action.fadeIn(0.14).easeOut(),
          Action.moveByY(-24, 0.14).easeOut(),
        ]),
        Action.waitForDuration(0.35),
        Action.group([
          Action.fadeOut(0.28).easeIn(),
          Action.moveByY(-16, 0.28).easeIn(),
        ]),
        Action.destroy({ children: true }),
      ]),
    );
  }
}
