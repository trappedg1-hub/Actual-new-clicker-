import { ButtonContainer } from "@pixi/ui";
import { UI_FONT } from "./nikkeKit.ts";
import { Graphics, Rectangle, Text } from "pixi.js";

export interface StyledButtonOptions {
  width: number;
  height: number;
  fontSize?: number;
  fill?: number;
  stroke?: number;
  textColor?: string;
  radius?: number;
  /** NIKKE-style angular plate: chamfered corners instead of a pill. */
  chamfer?: boolean;
  onPress: () => void;
}

export interface StyledButton {
  node: ButtonContainer;
  label: Text;
  setLabel(text: string): void;
  setSize(width: number, height: number): void;
  setEnabled(enabled: boolean): void;
}

export function createStyledButton(
  text: string,
  options: StyledButtonOptions,
): StyledButton {
  let width = options.width;
  let height = options.height;
  const radius = options.radius ?? 14;
  const baseFill = options.fill ?? 0x7d3dba;
  const baseStroke = options.stroke ?? 0xcf83ec;
  const plate = new Graphics();
  const label = new Text({
    text,
    style: {
      fontFamily: UI_FONT,
      fontSize: options.fontSize ?? 13,
      fontWeight: "700",
      fill: options.textColor ?? "#fff7ff",
      align: "center",
    },
  });
  label.anchor.set(0.5);
  const button = new ButtonContainer();
  button.label = text;
  button.cursor = "pointer";
  button.hitArea = new Rectangle(0, 0, width, height);
  button.addChild(plate, label);

  const draw = (enabled: boolean, pressed = false): void => {
    const fill = enabled ? (pressed ? 0x9c55d2 : baseFill) : 0x382c48;
    plate.clear();
    if (options.chamfer) {
      // iOS Liquid-Glass button: nearly clear rounded pill, bright rim,
      // soft specular highlight across the top half.
      const r = Math.min(18, height / 2 - 2);
      plate.roundRect(0, 0, width, height, r).fill({
        color: 0xffffff,
        alpha: enabled ? (pressed ? 0.32 : 0.15) : 0.06,
      });
      plate.roundRect(0, 0, width, height, r).stroke({
        color: enabled ? baseStroke : 0x8d7fa0,
        width: 1.2,
        alpha: enabled ? 0.85 : 0.4,
      });
      plate
        .roundRect(
          2.5,
          2,
          width - 5,
          Math.max(6, height * 0.42),
          Math.max(4, r - 3),
        )
        .fill({ color: 0xffffff, alpha: enabled ? 0.14 : 0.05 });
      void fill;
    } else {
      plate
        .roundRect(0, 0, width, height, radius)
        .fill({ color: fill, alpha: enabled ? 1 : 0.76 });
      plate.roundRect(0, 0, width, height, radius).stroke({
        color: enabled ? baseStroke : 0x665676,
        width: 1,
        alpha: 0.8,
      });
    }
    label.style.fill = enabled ? (options.textColor ?? "#fff7ff") : "#aaa0b7";
    // Premium guard: a label must never escape its glass plate — shrink
    // overlong text to fit instead of letting it overflow. Canvas text
    // metrics are unavailable in headless tests, hence the document check.
    if (typeof document !== "undefined") {
      label.scale.set(1);
      const maxWidth = width - 8;
      if (label.width > maxWidth && maxWidth > 0) {
        label.scale.set(maxWidth / label.width);
      }
    }
    label.position.set(width / 2, height / 2);
    button.hitArea = new Rectangle(0, 0, width, height);
  };

  draw(true);
  button.onPress.connect(options.onPress);
  button.onDown.connect(() => {
    draw(button.enabled, true);
    button.scale.set(0.98);
  });
  button.onUp.connect(() => {
    draw(button.enabled);
    button.scale.set(1);
  });
  button.onUpOut.connect(() => {
    draw(button.enabled);
    button.scale.set(1);
  });
  button.onOut.connect(() => draw(button.enabled));
  button.on("pointercancel", () => {
    // Pixi UI does not subscribe to pointercancel itself. Toggle enabled to run its onUp cleanup;
    // cancelled pointers never reach onPress/pointertap and therefore cannot award or purchase.
    if (button.enabled) {
      button.enabled = false;
      button.enabled = true;
    }
  });

  return {
    node: button,
    label,
    setLabel(nextText) {
      label.text = nextText;
      // The container label is what accessibility tooling and hit-test debugging read.
      button.label = nextText;
      // Refit: a longer caption must not spill past the plate edge.
      draw(button.enabled);
    },
    setSize(nextWidth, nextHeight) {
      width = nextWidth;
      height = nextHeight;
      draw(button.enabled);
    },
    setEnabled(enabled) {
      button.enabled = enabled;
      draw(enabled);
    },
  };
}
