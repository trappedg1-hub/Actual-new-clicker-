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
    // HOME and SHOP are live sections; the rest stay teased but disabled.
    const enabled = new Set(["HOME", "SHOP"]);
    for (const [index, label] of NAV_ITEMS.entries()) {
      const active = enabled.has(label);
      const button = createStyledButton(label, {
        width: 44,
        height: 50,
        fontSize: label.length > 5 ? 7 : 8,
        fill: index === 0 ? 0x593779 : active ? 0x2c1d40 : 0x1b1228,
        stroke: index === 0 ? 0xff6ec0 : active ? 0x8a5cb8 : 0x42305a,
        textColor: index === 0 || active ? "#fff7ff" : "#998ba9",
        chamfer: true,
        onPress: () => onPlaceholder(label),
      });
      if (!active) button.setEnabled(false);
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
    // NIKKE-style dock: angular glass slab with a luminous top edge.
    this.background.clear();
    this.background
      .poly([
        { x: 14, y: 0 },
        { x: this.currentWidth - 14, y: 0 },
        { x: this.currentWidth, y: 14 },
        { x: this.currentWidth, y: panelHeight },
        { x: 0, y: panelHeight },
        { x: 0, y: 14 },
      ])
      .fill({ color: 0x120b20, alpha: 0.55 });
    this.background
      .poly([
        { x: 14, y: 0 },
        { x: this.currentWidth - 14, y: 0 },
        { x: this.currentWidth, y: 14 },
        { x: this.currentWidth, y: panelHeight },
        { x: 0, y: panelHeight },
        { x: 0, y: 14 },
      ])
      .stroke({ color: 0x8a5cb8, alpha: 0.5, width: 1 });
    this.background
      .rect(20, 1, this.currentWidth - 40, 1.5)
      .fill({ color: 0xb98ae0, alpha: 0.45 });
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
