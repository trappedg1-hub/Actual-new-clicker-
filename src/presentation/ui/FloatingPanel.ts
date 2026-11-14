import { Container, Graphics, Text } from "pixi.js";
import { UI_FONT } from "./nikkeKit.ts";
import { createStyledButton, type StyledButton } from "./button.ts";

export class FloatingPanel extends Container {
  readonly storyButton: StyledButton;
  private readonly badge = new Graphics();
  private readonly rateLabel: Text;

  constructor(onStory: () => void) {
    super();
    this.label = "left floating story/idle panel";
    this.storyButton = createStyledButton("ИСТОРИЯ", {
      width: 58,
      height: 52,
      fontSize: 10,
      fill: 0x673b8f,
      stroke: 0xd187e8,
      chamfer: true,
      onPress: onStory,
    });
    this.rateLabel = new Text({
      text: "+0.25\n/сек",
      style: {
        fontFamily: UI_FONT,
        fontSize: 9,
        fontWeight: "700",
        fill: "#ffd4f4",
        align: "center",
        lineHeight: 12,
      },
    });
    this.rateLabel.anchor.set(0.5);
    this.rateLabel.position.set(29, 77);
    this.badge
      .roundRect(0, 60, 58, 35, 12)
      .fill({ color: 0x1c1028, alpha: 0.55 });
    this.badge
      .roundRect(0, 60, 58, 35, 12)
      .stroke({ color: 0x8a5cb8, alpha: 0.5, width: 1 });
    this.addChild(this.badge, this.storyButton.node, this.rateLabel);
  }

  resize(x: number, y: number): void {
    this.position.set(x, y);
  }

  setRate(rate: number): void {
    this.rateLabel.text = `+${rate.toFixed(2)}\n/сек`;
  }
}
