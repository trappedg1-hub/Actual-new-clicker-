import { Assets, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
const liquidHeartsUrl = new URL(
  "../../assets/ui/liquid-hearts.png",
  import.meta.url,
).href;
const liquidMoneyUrl = new URL(
  "../../assets/ui/liquid-money.png",
  import.meta.url,
).href;
const liquidLevelUrl = new URL(
  "../../assets/ui/liquid-level.png",
  import.meta.url,
).href;
import type { GameState } from "../../domain/economy/types.ts";
import { affectionProgress } from "../../domain/progression/progression.ts";
import { relationshipStage } from "../../content/relationship/relationship.ts";
import { createStyledButton, type StyledButton } from "./button.ts";

const iconHeartUrl = new URL("../../assets/ui/icon-heart.png", import.meta.url)
  .href;
const iconCoinUrl = new URL("../../assets/ui/icon-coin.png", import.meta.url)
  .href;
const iconGearUrl = new URL("../../assets/ui/icon-gear.png", import.meta.url)
  .href;

function makeText(
  text: string,
  size: number,
  color = "#fff7ff",
  weight: "400" | "600" | "700" = "600",
): Text {
  return new Text({
    text,
    style: {
      fontFamily: "Arial",
      fontSize: size,
      fontWeight: weight,
      fill: color,
      letterSpacing: 0.4,
      dropShadow: {
        color: 0x2a1030,
        alpha: 0.6,
        blur: 3,
        distance: 1,
        angle: Math.PI / 2,
      },
    },
  });
}

function formatAmount(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}m`;
  if (amount >= 10_000) return `${(amount / 1_000).toFixed(1)}k`;
  return amount >= 100 ? Math.floor(amount).toString() : amount.toFixed(1);
}

const PINK = 0xff6ec0;

/**
 * Liquid-Glass status HUD: three AI-painted translucent glass plates
 * (hearts + relationship stage, level badge, money) floating over the
 * scene like iOS widgets, with vector icons, a rounded progress bar
 * and shadowed white text for readability on any backdrop.
 */
export class StatusHud extends Container {
  private readonly heartsPlate = new Sprite(Texture.EMPTY);
  private readonly moneyPlate = new Sprite(Texture.EMPTY);
  private readonly levelPlate = new Sprite(Texture.EMPTY);
  private readonly heartIcon = new Sprite(Texture.EMPTY);
  private readonly coinIcon = new Sprite(Texture.EMPTY);
  private readonly gearIcon = new Sprite(Texture.EMPTY);
  private readonly progress = new Graphics();
  private readonly heartsLabel = makeText("СИМПАТИЯ", 7, "#ffd3ec", "700");
  private readonly heartsValue = makeText("0", 13, "#fff7ff", "700");
  private readonly stageValue = makeText("Незнакомец", 9, "#ffe3f4", "700");
  private readonly levelLabel = makeText("LV", 7, "#e3d8ff", "700");
  private readonly levelValue = makeText("1", 15, "#fff7ff", "700");
  private readonly moneyLabel = makeText("ДЕНЬГИ", 7, "#ffe2ad", "700");
  private readonly moneyValue = makeText("0.0", 13, "#fff3dd", "700");
  private readonly settings: StyledButton;
  private heartsWidth = 150;
  private progressValue = 0;

  constructor(onBackup: () => void) {
    super();
    this.label = "top HUD";
    this.settings = createStyledButton("", {
      width: 42,
      height: 52,
      fontSize: 17,
      fill: 0x241733,
      stroke: 0xcfb4ff,
      chamfer: true,
      onPress: onBackup,
    });
    this.addChild(
      this.heartsPlate,
      this.levelPlate,
      this.moneyPlate,
      this.progress,
      this.heartsLabel,
      this.heartsValue,
      this.stageValue,
      this.levelLabel,
      this.levelValue,
      this.moneyLabel,
      this.moneyValue,
      this.settings.node,
      this.heartIcon,
      this.coinIcon,
      this.gearIcon,
    );
    this.heartIcon.anchor.set(0.5);
    this.coinIcon.anchor.set(0.5);
    this.gearIcon.anchor.set(0.5);
    this.gearIcon.eventMode = "none";
    void Promise.all([
      Assets.load<Texture>(liquidHeartsUrl),
      Assets.load<Texture>(liquidMoneyUrl),
      Assets.load<Texture>(liquidLevelUrl),
      Assets.load<Texture>(iconHeartUrl),
      Assets.load<Texture>(iconCoinUrl),
      Assets.load<Texture>(iconGearUrl),
    ])
      .then(([hearts, money, level, heart, coin, gear]) => {
        this.heartsPlate.texture = hearts;
        this.moneyPlate.texture = money;
        this.levelPlate.texture = level;
        this.setIcon(this.heartIcon, heart, 20);
        this.setIcon(this.coinIcon, coin, 20);
        this.setIcon(this.gearIcon, gear, 22);
      })
      .catch(() => {
        // The HUD stays functional with text only if the art fails.
      });
  }

  resize(width: number): void {
    const availableWidth = Math.max(260, width - 24);
    const x = Math.max(12, (width - availableWidth) / 2);
    this.position.set(x, 10);

    const gearW = 42;
    const levelW = 48;
    const moneyW = 96;
    const gap = 7;
    this.heartsWidth = availableWidth - gearW - levelW - moneyW - gap * 3;
    const h = 56;

    this.heartsPlate.position.set(0, 0);
    this.heartsPlate.width = this.heartsWidth;
    this.heartsPlate.height = h;
    const lvX = this.heartsWidth + gap;
    this.levelPlate.position.set(lvX, 0);
    this.levelPlate.width = levelW;
    this.levelPlate.height = h;
    const moneyX = lvX + levelW + gap;
    this.moneyPlate.position.set(moneyX, 0);
    this.moneyPlate.width = moneyW;
    this.moneyPlate.height = h;

    this.heartIcon.position.set(20, 24);
    this.coinIcon.position.set(moneyX + 19, 25);

    this.heartsLabel.position.set(37, 7);
    this.heartsValue.position.set(37, 16);
    this.stageValue.position.set(12, 39);
    this.levelLabel.anchor.set(0.5, 0);
    this.levelLabel.position.set(lvX + levelW / 2, 9);
    this.levelValue.anchor.set(0.5, 0);
    this.levelValue.position.set(lvX + levelW / 2, 20);
    this.moneyLabel.position.set(moneyX + 34, 11);
    this.moneyValue.position.set(moneyX + 34, 23);
    this.settings.setSize(gearW, h - 4);
    this.settings.node.position.set(moneyX + moneyW + gap, 2);
    this.gearIcon.position.set(
      moneyX + moneyW + gap + gearW / 2,
      2 + (h - 4) / 2,
    );
    this.redrawProgress();
  }

  /** Fits a generated icon sprite to `height` px, keeping its ratio. */
  private setIcon(sprite: Sprite, texture: Texture, height: number): void {
    sprite.texture = texture;
    const s = height / texture.height;
    sprite.scale.set(s);
  }

  private redrawProgress(): void {
    const w = Math.max(60, this.heartsWidth - 110);
    const x = this.heartsWidth - w - 14;
    this.progress.clear();
    this.progress
      .roundRect(x, 24, w, 5, 2.5)
      .fill({ color: 0x2a1030, alpha: 0.4 });
    if (this.progressValue > 0.01) {
      this.progress
        .roundRect(x, 24, Math.max(5, w * this.progressValue), 5, 2.5)
        .fill({ color: PINK, alpha: 0.95 });
    }
  }

  render(state: Readonly<GameState>): void {
    const relation = affectionProgress(state.affection);
    const stage = relationshipStage(relation.level);
    this.heartsValue.text = formatAmount(state.affection);
    this.stageValue.text =
      relation.nextThreshold === null
        ? stage.name
        : `${stage.name} · до след: ${Math.max(
            0,
            Math.ceil(relation.nextThreshold - state.affection),
          )}`;
    this.levelValue.text = state.level.toString();
    this.moneyValue.text = formatAmount(state.currency);
    if (Math.abs(relation.progress - this.progressValue) > 0.002) {
      this.progressValue = relation.progress;
      this.redrawProgress();
    }
  }
}
