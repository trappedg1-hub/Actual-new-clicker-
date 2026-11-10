import { Container, Graphics, Text } from "pixi.js";
import { GAME_BALANCE } from "../../content/upgrades/balance.ts";
import type { GameState } from "../../domain/economy/types.ts";
import { passiveIncomePerSecond } from "../../domain/economy/economy.ts";
import { isIncomeUpgradeUnlocked } from "../../domain/unlocks/unlocks.ts";
import {
  getIncomeUpgradeCost,
  getIncomeUpgradeLevel,
} from "../../domain/upgrades/upgrades.ts";
import { createStyledButton, type StyledButton } from "./button.ts";

function textNode(
  text: string,
  size: number,
  color: string,
  weight: "400" | "600" | "700" = "600",
): Text {
  return new Text({
    text,
    style: {
      fontFamily: "Arial",
      fontSize: size,
      fontWeight: weight,
      fill: color,
    },
  });
}

export class UpgradePanel extends Container {
  private readonly background = new Graphics();
  private readonly title = textNode(
    GAME_BALANCE.upgrade.name.toUpperCase(),
    12,
    "#fff7ff",
    "700",
  );
  private readonly detail = textNode(
    GAME_BALANCE.upgrade.description,
    9,
    "#c9b7d9",
  );
  private readonly levelText = textNode("УРОВЕНЬ 0", 9, "#d9c7ec", "700");
  private readonly rateText = textNode("+0.25 / сек", 9, "#ffafe1", "700");
  private readonly buyButton: StyledButton;
  private portrait = true;
  private panelWidth = 280;
  private panelHeight = 82;

  constructor(onPurchase: () => void) {
    super();
    this.label = "income upgrade panel";
    this.buyButton = createStyledButton("КУПИТЬ", {
      width: 104,
      height: 48,
      fontSize: 11,
      fill: 0x8b44c2,
      stroke: 0xd78bf0,
      onPress: onPurchase,
    });
    this.addChild(
      this.background,
      this.title,
      this.detail,
      this.levelText,
      this.rateText,
      this.buyButton.node,
    );
  }

  resize(screenWidth: number, screenHeight: number, portrait: boolean): void {
    this.portrait = portrait;
    if (portrait) {
      this.panelWidth = Math.max(280, screenWidth - 28);
      this.panelHeight = 82;
      this.position.set(
        (screenWidth - this.panelWidth) / 2,
        screenHeight - 66 - this.panelHeight - 8,
      );
      this.title.position.set(14, 10);
      this.detail.position.set(14, 30);
      this.levelText.position.set(14, 53);
      this.rateText.position.set(104, 53);
      this.buyButton.setSize(104, 50);
      this.buyButton.node.position.set(this.panelWidth - 116, 16);
    } else {
      this.panelWidth = 204;
      this.panelHeight = 146;
      this.position.set(screenWidth - this.panelWidth - 12, 83);
      this.title.position.set(14, 14);
      this.detail.position.set(14, 38);
      this.levelText.position.set(14, 69);
      this.rateText.position.set(14, 91);
      this.buyButton.setSize(this.panelWidth - 28, 48);
      this.buyButton.node.position.set(14, this.panelHeight - 60);
    }
    this.background
      .clear()
      .roundRect(0, 0, this.panelWidth, this.panelHeight, 18)
      .fill({ color: 0x21162f, alpha: 0.96 });
    this.background
      .roundRect(0, 0, this.panelWidth, this.panelHeight, 18)
      .stroke({ color: 0x8752a6, alpha: 0.74, width: 1 });
  }

  render(state: Readonly<GameState>): void {
    const level = getIncomeUpgradeLevel(state);
    const cost = getIncomeUpgradeCost(state);
    const rate = passiveIncomePerSecond(state);
    const unlocked = isIncomeUpgradeUnlocked(state);
    this.levelText.text = `УРОВЕНЬ ${level}`;
    this.rateText.text = `+${rate.toFixed(2)} / сек`;
    this.buyButton.setLabel(
      unlocked
        ? `КУПИТЬ · ${cost}`
        : `ЗАКРЫТО · УР ${GAME_BALANCE.unlocks.incomeUpgradeLevel}`,
    );
    this.buyButton.setEnabled(unlocked && state.currency >= cost);
    this.detail.text = !unlocked
      ? `Откроется на уровне ${GAME_BALANCE.unlocks.incomeUpgradeLevel}`
      : this.portrait
        ? "Пассивный доход станет выше"
        : "Доход за каждый уровень";
  }
}
