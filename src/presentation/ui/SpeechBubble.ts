import { Action } from "pixijs-actions";
import { UI_FONT } from "./nikkeKit.ts";
import { Assets, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import {
  heroineTitle,
  poseHeatBand,
} from "../../content/relationship/relationship.ts";

const liquidDialogueUrl = new URL(
  "../../assets/ui/liquid-dialogue.png",
  import.meta.url,
).href;

/** Nameplate pill fill per heat band: pink -> hot pink -> neon rose. */
const HEAT_PILL_COLORS: readonly number[] = [0xff6ec0, 0xff4fae, 0xff2e92];
/** Body text fill per heat band — warms toward a blushing pink. */
const HEAT_BODY_FILLS: readonly string[] = ["#fff7ff", "#fff0fa", "#ffe4f3"];

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
  /** Current heat band (0 cool / 1 warm / 2 hot) — tints the pill. */
  private heat = 0;

  constructor(onSpeakingChange?: (speaking: boolean) => void) {
    super();
    this.onSpeakingChange = onSpeakingChange;
    this.label = "heroine speech window";
    this.visible = false;
    this.eventMode = "none";
    this.title = new Text({
      text: "Одноклассница",
      style: {
        fontFamily: UI_FONT,
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
        fontFamily: UI_FONT,
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
      .fill({
        color: HEAT_PILL_COLORS[this.heat] ?? 0xff6ec0,
        alpha: 0.55 + this.heat * 0.08,
      })
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
    this.heat = poseHeatBand(level);
    // The hotter the stage, the warmer her text glows.
    this.body.style.fill = HEAT_BODY_FILLS[this.heat] ?? "#fff7ff";
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
