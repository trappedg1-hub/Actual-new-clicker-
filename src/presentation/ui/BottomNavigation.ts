import { Assets, Container, Sprite, Texture } from "pixi.js";
import { createStyledButton, type StyledButton } from "./button.ts";

const liquidDockUrl = new URL(
  "../../assets/ui/liquid-dock.png",
  import.meta.url,
).href;

const NAV_ITEMS = [
  "ДОМ",
  "СЮЖЕТ",
  "МАГАЗИН",
  "ОБРАЗЫ",
  "ПАМЯТЬ",
  "ПРОФИЛЬ",
] as const;

export class BottomNavigation extends Container {
  private readonly background = new Sprite(Texture.EMPTY);
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
    this.background.alpha = 0.96;
    this.addChild(this.background, this.row);
    void Assets.load<Texture>(liquidDockUrl)
      .then((texture) => {
        this.background.texture = texture;
      })
      .catch(() => {
        // The dock stays usable without the glass art.
      });
    // ДОМ and МАГАЗИН are live sections; the rest stay teased but disabled.
    const enabled = new Set(["ДОМ", "МАГАЗИН"]);
    for (const [index, label] of NAV_ITEMS.entries()) {
      const active = enabled.has(label);
      const button = createStyledButton(label, {
        width: 44,
        height: 50,
        fontSize: 9,
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
    // Liquid-Glass dock: the AI-painted translucent slab stretches to
    // the bar size; the glass interior lets the room show through.
    this.background.position.set(0, 0);
    this.background.width = this.currentWidth;
    this.background.height = panelHeight;
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
