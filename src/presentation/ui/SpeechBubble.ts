import { Action } from "pixijs-actions";
import { Assets, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { heroineTitle } from "../../content/relationship/relationship.ts";

const liquidDialogueUrl = new URL(
  "../../assets/ui/liquid-dialogue.png",
  import.meta.url,
).href;

/**
 * Her voice window: an AI-painted Liquid-Glass message card pinned
 * above the bottom dock (visual-novel style), with a glass nameplate
 * pill that shows who she is to you right now («Одноклассница» →
 * «Подруга» → «Почти твоя» → «Твоя девушка»).  A new line replaces
 * the previous one immediately — she never talks over herself.
 */
export class SpeechBubble extends Container {
  private readonly plate = new Sprite(Texture.EMPTY);
  private readonly namePill = new Graphics();
  private readonly title: Text;
  private readonly onSpeakingChange: ((speaking: boolean) => void) | undefined;
  private readonly body: Text;
  private screenWidth = 320;
  private screenHeight = 568;

  constructor(onSpeakingChange?: (speaking: boolean) => void) {
    super();
    this.onSpeakingChange = onSpeakingChange;
    this.label = "heroine speech window";
    this.visible = false;
    this.eventMode = "none";
    this.title = new Text({
      text: "Одноклассница",
      style: {
        fontFamily: "Arial",
        fontSize: 9,
        fontWeight: "700",
        fill: "#ffffff",
        letterSpacing: 0.5,
        dropShadow: {
          color: 0x6e1f4e,
          alpha: 0.8,
          blur: 2,
          distance: 1,
          angle: Math.PI / 2,
        },
      },
    });
    this.body = new Text({
      text: "",
      style: {
        fontFamily: "Arial",
        fontSize: 14,
        fontWeight: "600",
        fill: "#fff7ff",
        wordWrap: true,
        breakWords: true,
        lineHeight: 20,
        dropShadow: {
          color: 0x2a1030,
          alpha: 0.75,
          blur: 3,
          distance: 1,
          angle: Math.PI / 2,
        },
      },
    });
    this.addChild(this.plate, this.namePill, this.title, this.body);
    void Assets.load<Texture>(liquidDialogueUrl)
      .then((texture) => {
        this.plate.texture = texture;
        this.layoutPlate();
      })
      .catch(() => {
        // The window still shows shadowed text if the art fails.
      });
  }

  resize(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
    this.layoutPlate();
  }

  private plateHeight(): number {
    const w = this.plateWidth();
    const aspect =
      this.plate.texture !== Texture.EMPTY
        ? this.plate.texture.height / this.plate.texture.width
        : 0.29;
    return Math.min(132, w * aspect);
  }

  private plateWidth(): number {
    return Math.min(430, this.screenWidth - 20);
  }

  private layoutPlate(): void {
    const w = this.plateWidth();
    const h = this.plateHeight();
    this.plate.width = w;
    this.plate.height = h;
    // Pinned just above the bottom dock (66px) with a small gap.
    this.position.set(
      (this.screenWidth - w) / 2,
      this.screenHeight - 66 - h - 10,
    );
    // The nameplate pill in the art sits near the top-left corner; an
    // adaptive glass pill is drawn over it so any title length fits.
    this.title.anchor.set(0.5);
    const pillCx = Math.max(w * 0.068 + (this.title.width + 22) / 2, w * 0.14);
    const pillCy = h * 0.14;
    this.title.position.set(pillCx, pillCy);
    this.namePill.clear();
    this.namePill
      .roundRect(
        pillCx - this.title.width / 2 - 11,
        pillCy - 10,
        this.title.width + 22,
        20,
        10,
      )
      .fill({ color: 0xff6ec0, alpha: 0.55 })
      .stroke({ color: 0xffffff, alpha: 0.75, width: 1 });
    this.body.style.wordWrapWidth = w - 56;
    this.body.position.set(30, h * 0.34);
  }

  /** Hides the window immediately (scene switches, overlays). */
  hide(): void {
    this.removeAllActions();
    this.visible = false;
    this.onSpeakingChange?.(false);
  }

  /** Shows `text` on the glass card; `level` drives her nameplate. */
  say(text: string, level: number): void {
    this.removeAllActions();
    this.title.text = heroineTitle(level);
    this.body.text = text;
    this.layoutPlate();
    const holdSeconds = Math.min(5.5, 2.4 + text.length * 0.035);
    this.alpha = 0;
    this.visible = true;
    this.onSpeakingChange?.(true);
    this.run(
      Action.sequence([
        Action.fadeIn(0.18).easeOut(),
        Action.waitForDuration(holdSeconds),
        Action.fadeOut(0.35).easeIn(),
        Action.run(() => {
          this.visible = false;
          this.onSpeakingChange?.(false);
        }),
      ]),
    );
  }
}
