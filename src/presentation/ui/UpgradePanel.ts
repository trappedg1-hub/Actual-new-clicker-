import { Container, Graphics, Text } from "pixi.js";
import {
  GAME_BALANCE,
  UPGRADE_KINDS,
  type UpgradeKind,
} from "../../content/upgrades/balance.ts";
import type { GameState } from "../../domain/economy/types.ts";
import { passiveIncomePerSecond } from "../../domain/economy/economy.ts";
import { isUpgradeUnlocked } from "../../domain/unlocks/unlocks.ts";
import { RELATIONSHIP_STAGES } from "../../content/relationship/relationship.ts";
import {
  charmBonus,
  getUpgradeCost,
  getUpgradeLevel,
  tapPowerBonus,
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
      align: "center",
    },
  });
}

const BUTTON_FILLS: Record<UpgradeKind, { fill: number; stroke: number }> = {
  tap: { fill: 0x8b44c2, stroke: 0xd78bf0 },
  income: { fill: 0x7a3da8, stroke: 0xc77be0 },
  charm: { fill: 0xa83d7f, stroke: 0xf080c8 },
};

/**
 * Three money upgrades in one compact card: tap power, passive income
 * and charm (hearts per tap).  The portrait card keeps the original
 * 82px height so the approved scene layouts above it do not move.
 */
export class UpgradePanel extends Container {
  private readonly background = new Graphics();
  private readonly statsText = textNode("", 9, "#d9c7ec", "700");
  private readonly buttons = new Map<UpgradeKind, StyledButton>();
  private panelWidth = 280;
  private panelHeight = 82;

  constructor(onPurchase: (kind: UpgradeKind) => void) {
    super();
    this.label = "upgrades panel";
    this.addChild(this.background, this.statsText);
    for (const kind of UPGRADE_KINDS) {
      const palette = BUTTON_FILLS[kind];
      const button = createStyledButton("", {
        width: 104,
        height: 50,
        fontSize: 10,
        fill: palette.fill,
        stroke: palette.stroke,
        onPress: () => onPurchase(kind),
      });
      this.buttons.set(kind, button);
      this.addChild(button.node);
    }
  }

  resize(screenWidth: number, screenHeight: number, portrait: boolean): void {
    if (portrait) {
      this.panelWidth = Math.max(280, screenWidth - 28);
      this.panelHeight = 82;
      this.position.set(
        (screenWidth - this.panelWidth) / 2,
        screenHeight - 66 - this.panelHeight - 8,
      );
      this.statsText.position.set(14, 6);
      const gap = 8;
      const buttonWidth = Math.floor((this.panelWidth - 28 - gap * 2) / 3);
      let x = 14;
      for (const kind of UPGRADE_KINDS) {
        const button = this.buttons.get(kind);
        if (!button) continue;
        button.setSize(buttonWidth, 54);
        button.node.position.set(x, 21);
        x += buttonWidth + gap;
      }
    } else {
      this.panelWidth = 204;
      this.panelHeight = 196;
      this.position.set(screenWidth - this.panelWidth - 12, 83);
      this.statsText.position.set(14, 10);
      let y = 28;
      for (const kind of UPGRADE_KINDS) {
        const button = this.buttons.get(kind);
        if (!button) continue;
        button.setSize(this.panelWidth - 28, 48);
        button.node.position.set(14, y);
        y += 54;
      }
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
    const rate = passiveIncomePerSecond(state);
    this.statsText.text =
      `тап +${tapPowerBonus(state)}💰  ·  ${rate.toFixed(2)}💰/сек` +
      `  ·  +${1 + charmBonus(state)}💗/тап`;
    for (const kind of UPGRADE_KINDS) {
      const button = this.buttons.get(kind);
      if (!button) continue;
      const definition = GAME_BALANCE.upgrades[kind];
      if (!isUpgradeUnlocked(state, kind)) {
        // Locked upgrades tease the relationship stage that reveals them.
        const stage =
          RELATIONSHIP_STAGES[definition.unlockStage - 1]?.name ?? "";
        button.setLabel(`🔒 ${definition.shortName}\n${stage}`);
        button.setEnabled(false);
        continue;
      }
      const cost = getUpgradeCost(state, kind);
      const level = getUpgradeLevel(state, kind);
      button.setLabel(`${definition.shortName} УР${level}\n💰 ${cost}`);
      button.setEnabled(state.currency >= cost);
    }
  }
}
