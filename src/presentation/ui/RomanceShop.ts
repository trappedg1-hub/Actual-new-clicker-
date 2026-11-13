import { Container, Graphics, Text } from "pixi.js";
import {
  GAME_BALANCE,
  UPGRADE_KINDS,
  type UpgradeKind,
} from "../../content/upgrades/balance.ts";
import {
  RELATIONSHIP_STAGES,
  UPGRADE_ROMANTIC_FLAVOR,
  upgradeRomanticName,
} from "../../content/relationship/relationship.ts";
import type { GameState } from "../../domain/economy/types.ts";
import { passiveIncomePerSecond } from "../../domain/economy/economy.ts";
import { affectionProgress } from "../../domain/progression/progression.ts";
import { isUpgradeUnlocked } from "../../domain/unlocks/unlocks.ts";
import {
  charmBonus,
  getUpgradeCost,
  getUpgradeLevel,
  tapPowerBonus,
} from "../../domain/upgrades/upgrades.ts";
import { createStyledButton, type StyledButton } from "./button.ts";
import { drawChamferPlate } from "./nikkeKit.ts";

function makeText(
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

const ICONS: Record<UpgradeKind, string> = {
  tap: "✋",
  income: "💭",
  charm: "💬",
};

const ACCENTS: Record<UpgradeKind, number> = {
  tap: 0xf080c8,
  income: 0x9d7bff,
  charm: 0xff7ba6,
};

interface ShopRow {
  kind: UpgradeKind;
  card: Graphics;
  icon: Text;
  iconPlate: Graphics;
  name: Text;
  flavor: Text;
  stat: Text;
  buy: StyledButton;
  lockNote: Text;
}

/**
 * The romance upgrades screen (SHOP tab): a translucent full-screen
 * sheet in the spirit of NIKKE/Idle Angels — glassy cards, one accent
 * color per upgrade, romantic titles that warm up with the
 * relationship stage.  Locked cards tease the stage that reveals them.
 */
export class RomanceShop extends Container {
  private readonly dimmer = new Graphics();
  private readonly titleText = makeText("ЗАБОТА О НЕЙ", 17, "#fff7ff", "700");
  private readonly subtitleText = makeText(
    "Улучшения открываются вместе с её доверием",
    10,
    "#d9a9d4",
  );
  private readonly walletText = makeText("", 12, "#ffe3a9", "700");
  private readonly rows: ShopRow[] = [];
  private readonly closeButton: StyledButton;
  private screenWidth = 320;
  private screenHeight = 568;

  constructor(
    onPurchase: (kind: UpgradeKind) => void,
    onClose: () => void,
  ) {
    super();
    this.label = "romance upgrades shop";
    this.visible = false;
    this.eventMode = "static";
    this.addChild(this.dimmer, this.titleText, this.subtitleText);
    this.addChild(this.walletText);

    for (const kind of UPGRADE_KINDS) {
      const card = new Graphics();
      const iconPlate = new Graphics();
      const icon = makeText(ICONS[kind], 20, "#fff7ff", "700");
      const name = makeText("", 13, "#fff7ff", "700");
      const flavor = makeText("", 9, "#cdb6d6");
      flavor.style.wordWrap = true;
      const stat = makeText("", 10, "#ffb7df", "700");
      const lockNote = makeText("", 10, "#9b8bae", "700");
      const buy = createStyledButton("", {
        width: 92,
        height: 44,
        fontSize: 10,
        fill: 0x8b44c2,
        stroke: ACCENTS[kind],
        chamfer: true,
        onPress: () => onPurchase(kind),
      });
      this.addChild(card, iconPlate, icon, name, flavor, stat, lockNote);
      this.addChild(buy.node);
      this.rows.push({
        kind,
        card,
        icon,
        iconPlate,
        name,
        flavor,
        stat,
        buy,
        lockNote,
      });
    }

    this.closeButton = createStyledButton("ЗАКРЫТЬ", {
      width: 160,
      height: 46,
      fontSize: 11,
      fill: 0x3a2750,
      stroke: 0xb978df,
      chamfer: true,
      onPress: onClose,
    });
    this.addChild(this.closeButton.node);
  }

  resize(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
    this.dimmer
      .clear()
      .rect(0, 0, width, height)
      .fill({ color: 0x0d0716, alpha: 0.88 });
    const sheetWidth = Math.min(392, width - 20);
    const left = (width - sheetWidth) / 2;
    this.titleText.position.set(left + 6, 96);
    this.subtitleText.position.set(left + 6, 122);
    this.walletText.position.set(left + 6, 140);

    const cardHeight = 92;
    let y = 168;
    for (const row of this.rows) {
      row.card.clear();
      drawChamferPlate(row.card, left, y, sheetWidth, cardHeight, {
        cutTL: 14,
        cutBR: 14,
        fill: 0x1c1028,
        fillAlpha: 0.85,
        stroke: ACCENTS[row.kind],
        strokeAlpha: 0.55,
        accent: ACCENTS[row.kind],
        accentSide: "left",
      });
      row.iconPlate
        .clear()
        .circle(left + 34, y + cardHeight / 2, 20)
        .fill({ color: 0x160e22, alpha: 0.9 })
        .circle(left + 34, y + cardHeight / 2, 20)
        .stroke({ color: ACCENTS[row.kind], alpha: 0.65, width: 1 });
      row.icon.anchor.set(0.5);
      row.icon.position.set(left + 34, y + cardHeight / 2);
      row.name.position.set(left + 64, y + 12);
      row.flavor.position.set(left + 64, y + 32);
      row.flavor.style.wordWrapWidth = sheetWidth - 64 - 112;
      row.stat.position.set(left + 64, y + cardHeight - 22);
      // The lock note replaces the stat line — same slot, no overlap
      // with the wrapped flavor text above.
      row.lockNote.position.set(left + 64, y + cardHeight - 22);
      row.buy.setSize(92, 44);
      row.buy.node.position.set(
        left + sheetWidth - 104,
        y + (cardHeight - 44) / 2,
      );
      y += cardHeight + 12;
    }
    this.closeButton.node.position.set((width - 160) / 2, y + 10);
  }

  render(state: Readonly<GameState>): void {
    if (!this.visible) return;
    const level = affectionProgress(state.affection).level;
    this.walletText.text = `💰 ${Math.floor(state.currency)}   ·   💗 ${Math.floor(state.affection)}`;
    for (const row of this.rows) {
      const definition = GAME_BALANCE.upgrades[row.kind];
      const unlocked = isUpgradeUnlocked(state, row.kind);
      row.name.text = upgradeRomanticName(row.kind, level);
      row.flavor.text = UPGRADE_ROMANTIC_FLAVOR[row.kind];
      if (!unlocked) {
        const stage =
          RELATIONSHIP_STAGES[definition.unlockStage - 1]?.name ?? "";
        row.name.alpha = 0.55;
        row.flavor.alpha = 0.45;
        row.icon.alpha = 0.4;
        row.stat.text = "";
        row.lockNote.text = `🔒 Откроется на стадии «${stage}»`;
        row.buy.setLabel("ЗАКРЫТО");
        row.buy.setEnabled(false);
        continue;
      }
      row.name.alpha = 1;
      row.flavor.alpha = 1;
      row.icon.alpha = 1;
      row.lockNote.text = "";
      const upgradeLevel = getUpgradeLevel(state, row.kind);
      const cost = getUpgradeCost(state, row.kind);
      const statText =
        row.kind === "tap"
          ? `УР ${upgradeLevel} · +${tapPowerBonus(state)} монет к тапу`
          : row.kind === "income"
            ? `УР ${upgradeLevel} · ${passiveIncomePerSecond(state).toFixed(2)} монет/сек`
            : `УР ${upgradeLevel} · +${1 + charmBonus(state)} сердечка за тап`;
      row.stat.text = statText;
      row.buy.setLabel(`КУПИТЬ\n💰 ${cost}`);
      row.buy.setEnabled(state.currency >= cost);
    }
  }

  open(state: Readonly<GameState>): void {
    this.visible = true;
    this.resize(this.screenWidth, this.screenHeight);
    this.render(state);
  }

  close(): void {
    this.visible = false;
  }
}
