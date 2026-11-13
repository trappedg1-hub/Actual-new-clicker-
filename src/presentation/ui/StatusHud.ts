import { Container, Graphics, Text } from "pixi.js";
import type { GameState } from "../../domain/economy/types.ts";
import { affectionProgress } from "../../domain/progression/progression.ts";
import { relationshipStage } from "../../content/relationship/relationship.ts";
import { createStyledButton, type StyledButton } from "./button.ts";
import {
  drawChamferPlate,
  drawCoinIcon,
  drawHeartIcon,
  drawSlantProgress,
  drawTechTicks,
} from "./nikkeKit.ts";

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
    },
  });
}

function formatAmount(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}m`;
  if (amount >= 10_000) return `${(amount / 1_000).toFixed(1)}k`;
  return amount >= 100 ? Math.floor(amount).toString() : amount.toFixed(1);
}

const PINK = 0xff6ec0;
const LILAC = 0x9d7bff;
const GOLD = 0xffc85c;
const GLASS = 0x120b20;

/**
 * Hand-drawn NIKKE-style status HUD: three floating angular glass
 * modules (hearts + relationship stage, level diamond, money) and a
 * settings button.  No outer panel — the modules sit directly over
 * the scene, vector-drawn via the nikkeKit so every edge stays crisp
 * on a 3x phone.
 */
export class StatusHud extends Container {
  private readonly plates = new Graphics();
  private readonly progress = new Graphics();
  private readonly heartsLabel = makeText("СЕРДЕЧКИ", 7, "#ff9ed4", "700");
  private readonly heartsValue = makeText("0", 13, "#fff7ff", "700");
  private readonly stageValue = makeText("Незнакомец", 9, "#ffc9e8", "700");
  private readonly levelLabel = makeText("LV", 7, "#c9b4ff", "700");
  private readonly levelValue = makeText("1", 15, "#fff7ff", "700");
  private readonly moneyLabel = makeText("ДЕНЬГИ", 7, "#ffd58a", "700");
  private readonly moneyValue = makeText("0.0", 13, "#ffe9c4", "700");
  private readonly settings: StyledButton;
  private heartsWidth = 150;
  private layoutWidth = 320;
  private progressValue = 0;

  constructor(onBackup: () => void) {
    super();
    this.label = "top HUD";
    this.settings = createStyledButton("⚙", {
      width: 42,
      height: 52,
      fontSize: 17,
      fill: 0x241733,
      stroke: 0x8a5cb8,
      chamfer: true,
      onPress: onBackup,
    });
    this.addChild(this.plates, this.progress);
    this.addChild(
      this.heartsLabel,
      this.heartsValue,
      this.stageValue,
      this.levelLabel,
      this.levelValue,
      this.moneyLabel,
      this.moneyValue,
      this.settings.node,
    );
  }

  resize(width: number): void {
    const availableWidth = Math.max(260, width - 24);
    const x = Math.max(12, (width - availableWidth) / 2);
    this.position.set(x, 10);
    this.layoutWidth = availableWidth;

    const gearW = 42;
    const levelW = 46;
    const moneyW = 92;
    const gap = 7;
    this.heartsWidth = availableWidth - gearW - levelW - moneyW - gap * 3;
    const h = 56;

    this.plates.clear();
    // Hearts module: pink accent, cut bottom-right corner.
    drawChamferPlate(this.plates, 0, 0, this.heartsWidth, h, {
      cutBR: 12,
      fill: GLASS,
      fillAlpha: 0.52,
      stroke: PINK,
      strokeAlpha: 0.5,
      accent: PINK,
      accentSide: "left",
    });
    drawHeartIcon(this.plates, 17, 24, 13, PINK);
    drawTechTicks(this.plates, this.heartsWidth - 34, 5, 3, PINK);
    // Level diamond module.
    const lvX = this.heartsWidth + gap;
    drawChamferPlate(this.plates, lvX, 0, levelW, h, {
      cutTL: 12,
      cutBR: 12,
      fill: GLASS,
      fillAlpha: 0.52,
      stroke: LILAC,
      strokeAlpha: 0.5,
    });
    // Money module: gold accent on the right, cut top-right corner.
    const moneyX = lvX + levelW + gap;
    drawChamferPlate(this.plates, moneyX, 0, moneyW, h, {
      cutTR: 12,
      fill: GLASS,
      fillAlpha: 0.52,
      stroke: GOLD,
      strokeAlpha: 0.45,
      accent: GOLD,
      accentSide: "right",
    });
    drawCoinIcon(this.plates, moneyX + 16, 24, 7, GOLD);

    this.heartsLabel.position.set(30, 7);
    this.heartsValue.position.set(30, 17);
    this.stageValue.position.set(30, 33);
    this.levelLabel.anchor.set(0.5, 0);
    this.levelLabel.position.set(lvX + levelW / 2, 9);
    this.levelValue.anchor.set(0.5, 0);
    this.levelValue.position.set(lvX + levelW / 2, 21);
    this.moneyLabel.position.set(moneyX + 28, 9);
    this.moneyValue.position.set(moneyX + 28, 22);
    this.settings.setSize(gearW, h - 4);
    this.settings.node.position.set(moneyX + moneyW + gap, 2);
    this.redrawProgress();
  }

  private redrawProgress(): void {
    this.progress.clear();
    drawSlantProgress(
      this.progress,
      12,
      47,
      Math.max(60, this.heartsWidth - 24),
      5,
      this.progressValue,
      { track: 0x2c1b3d, fill: PINK, glow: 0xff9ed4 },
    );
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
    void this.layoutWidth;
  }
}
