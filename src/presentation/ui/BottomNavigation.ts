import { Container, Graphics } from "pixi.js";
import { createStyledButton, type StyledButton } from "./button.ts";

const NAV_ITEMS = [
  "HOME",
  "STORY",
  "SHOP",
  "LOOKS",
  "MEMORY",
  "PROFILE",
] as const;

export class BottomNavigation extends Container {
  private readonly background = new Graphics();
  private readonly row = new Container({
    layout: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 4,
    },
  });
  private readonly buttons: StyledButton[] = [];
  private currentWidth = 0;

  constructor(onPlaceholder: (section: string) => void) {
    super();
    this.label = "six-section bottom navigation placeholders";
    this.addChild(this.background, this.row);
    for (const [index, label] of NAV_ITEMS.entries()) {
      const button = createStyledButton(label, {
        width: 44,
        height: 50,
        fontSize: label.length > 5 ? 7 : 8,
        fill: index === 0 ? 0x593779 : 0x21182f,
        stroke: index === 0 ? 0xb774d8 : 0x4d3a61,
        textColor: index === 0 ? "#fff7ff" : "#998ba9",
        radius: 12,
        onPress: () => onPlaceholder(label),
      });
      if (index > 0) button.setEnabled(false);
      this.buttons.push(button);
      this.row.addChild(button.node);
    }
  }

  resize(width: number, height: number): void {
    // `max(288, ...)` made the bar wider than a 280 px viewport and pushed the last
    // section off screen. 264 px still fits all six items at their 36 px minimum.
    this.currentWidth = Math.max(264, width - 16);
    const x = Math.max(8, (width - this.currentWidth) / 2);
    const panelHeight = 60;
    this.position.set(x, height - panelHeight - 6);
    this.background
      .clear()
      .roundRect(0, 0, this.currentWidth, panelHeight, 18)
      .fill({ color: 0x130d22, alpha: 0.96 });
    this.background
      .roundRect(0, 0, this.currentWidth, panelHeight, 18)
      .stroke({ color: 0x49305f, alpha: 0.72, width: 1 });
    const innerWidth = this.currentWidth - 16;
    this.row.position.set(8, 5);
    this.row.layout = {
      width: innerWidth,
      height: 50,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 4,
    };
    const gapTotal = 4 * (this.buttons.length - 1);
    const itemWidth = Math.max(
      36,
      (innerWidth - gapTotal) / this.buttons.length,
    );
    for (const button of this.buttons) {
      button.setSize(itemWidth, 50);
      button.node.layout = { width: itemWidth, height: 50 };
    }
  }

  get contentWidth(): number {
    return this.currentWidth;
  }
}
