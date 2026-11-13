import { Action } from "pixijs-actions";
import { Container, Graphics, Text } from "pixi.js";

const BUBBLE_MAX_WIDTH = 236;
const PADDING_X = 14;
const PADDING_Y = 10;
const TAIL = 10;

/**
 * Her speech bubble: one reusable rounded panel with a tail that pops
 * in near the tapped spot, holds long enough to read the line and
 * fades away.  A new line replaces the previous one immediately — she
 * never talks over herself.
 */
export class SpeechBubble extends Container {
  private readonly panel = new Graphics();
  private readonly body: Text;
  private screenWidth = 320;

  constructor() {
    super();
    this.label = "heroine speech bubble";
    this.visible = false;
    this.eventMode = "none";
    this.body = new Text({
      text: "",
      style: {
        fontFamily: "Arial",
        fontSize: 13,
        fontWeight: "600",
        fill: "#2b1430",
        wordWrap: true,
        wordWrapWidth: BUBBLE_MAX_WIDTH - PADDING_X * 2,
        breakWords: true,
        lineHeight: 18,
      },
    });
    this.addChild(this.panel, this.body);
  }

  resize(screenWidth: number): void {
    this.screenWidth = screenWidth;
  }

  /** Shows `text` with the tail pointing at (anchorX, anchorY). */
  say(text: string, anchorX: number, anchorY: number): void {
    this.removeAllActions();
    this.body.text = text;
    const textWidth = Math.min(
      BUBBLE_MAX_WIDTH - PADDING_X * 2,
      Math.max(56, this.body.width),
    );
    const w = textWidth + PADDING_X * 2;
    const h = this.body.height + PADDING_Y * 2;
    this.body.position.set(PADDING_X, PADDING_Y);

    // Bubble sits above the anchor, clamped inside the screen.
    const left = Math.max(
      8,
      Math.min(this.screenWidth - w - 8, anchorX - w / 2),
    );
    const top = Math.max(8, anchorY - h - TAIL - 18);
    this.position.set(left, top);
    const tailX = Math.max(16, Math.min(w - 16, anchorX - left));

    this.panel
      .clear()
      .roundRect(0, 0, w, h, 14)
      .fill({ color: 0xfff3fb, alpha: 0.97 });
    this.panel
      .poly([
        { x: tailX - 8, y: h - 1 },
        { x: tailX + 8, y: h - 1 },
        { x: tailX, y: h + TAIL },
      ])
      .fill({ color: 0xfff3fb, alpha: 0.97 });
    this.panel
      .roundRect(0, 0, w, h, 14)
      .stroke({ color: 0xe08be5, alpha: 0.85, width: 1.5 });

    const holdSeconds = Math.min(5, 2.2 + text.length * 0.035);
    this.alpha = 0;
    this.visible = true;
    this.run(
      Action.sequence([
        Action.fadeIn(0.16).easeOut(),
        Action.waitForDuration(holdSeconds),
        Action.fadeOut(0.3).easeIn(),
        Action.run(() => {
          this.visible = false;
        }),
      ]),
    );
  }
}
