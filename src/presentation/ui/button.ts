import { ButtonContainer } from "@pixi/ui";
import { Graphics, Rectangle, Text } from "pixi.js";

export interface StyledButtonOptions {
  width: number;
  height: number;
  fontSize?: number;
  fill?: number;
  stroke?: number;
  textColor?: string;
  radius?: number;
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
      fontFamily: "Arial",
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
    plate
      .clear()
      .roundRect(0, 0, width, height, radius)
      .fill({ color: fill, alpha: enabled ? 1 : 0.76 });
    plate
      .roundRect(0, 0, width, height, radius)
      .stroke({ color: enabled ? baseStroke : 0x665676, width: 1, alpha: 0.8 });
    label.style.fill = enabled ? (options.textColor ?? "#fff7ff") : "#aaa0b7";
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
