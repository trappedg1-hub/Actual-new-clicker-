import { ProgressBar } from "@pixi/ui";
import { Container, Graphics, Text } from "pixi.js";
import type { GameState } from "../../domain/economy/types.ts";
import { affectionProgress } from "../../domain/progression/progression.ts";
import { relationshipStage } from "../../content/relationship/relationship.ts";
import { createStyledButton, type StyledButton } from "./button.ts";

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
    },
  });
}

function formatAmount(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}m`;
  if (amount >= 10_000) return `${(amount / 1_000).toFixed(1)}k`;
  return amount >= 100 ? Math.floor(amount).toString() : amount.toFixed(1);
}

export class StatusHud extends Container {
  private readonly panel = new Graphics();
  private readonly row = new Container({
    layout: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 6,
    },
  });
  private readonly affectionCard = new Container({
    layout: { flexGrow: 1, height: 56, minWidth: 78 },
  });
  private readonly levelCard = new Container({
    layout: { width: 46, height: 56 },
  });
  private readonly currencyCard = new Container({
    layout: { width: 74, height: 56 },
  });
  private readonly affectionLabel = makeText(
    "СЕРДЕЧКИ 💗",
    8,
    "#ffb7df",
    "700",
  );
  private readonly affectionValue = makeText(
    "0 · Незнакомец",
    11,
    "#fff7ff",
    "700",
  );
  private readonly levelValue = makeText("1", 16, "#fff7ff", "700");
  private readonly currencyValue = makeText("0.0", 13, "#fff7ff", "700");
  private readonly progressBar = new ProgressBar({
    bg: new Graphics().roundRect(0, 0, 100, 7, 4).fill({ color: 0x30233d }),
    fill: new Graphics().roundRect(0, 0, 100, 7, 4).fill({ color: 0xf080d0 }),
    progress: 0,
  });
  private readonly settings: StyledButton;
  private rowWidth = 0;

  constructor(onBackup: () => void) {
    super();
    this.label = "top HUD";
    this.settings = createStyledButton("⚙", {
      width: 46,
      height: 50,
      fontSize: 19,
      fill: 0x392752,
      stroke: 0x835bb0,
      onPress: onBackup,
    });
    this.addChild(this.panel, this.row);

    const affectionBg = new Graphics()
      .roundRect(0, 0, 100, 56, 13)
      .fill({ color: 0x21182f, alpha: 0.93 });
    affectionBg
      .roundRect(0, 0, 100, 56, 13)
      .stroke({ color: 0x583d72, alpha: 0.7, width: 1 });
    this.affectionLabel.position.set(10, 7);
    this.affectionValue.position.set(10, 20);
    this.progressBar.position.set(10, 42);
    this.progressBar.height = 7;
    this.affectionCard.addChild(
      affectionBg,
      this.affectionLabel,
      this.affectionValue,
      this.progressBar,
    );

    const levelBg = new Graphics()
      .roundRect(0, 0, 46, 56, 13)
      .fill({ color: 0x21182f, alpha: 0.93 });
    levelBg
      .roundRect(0, 0, 46, 56, 13)
      .stroke({ color: 0x583d72, alpha: 0.7, width: 1 });
    const levelLabel = makeText("LV", 8, "#d9c7ec", "700");
    levelLabel.anchor.set(0.5, 0);
    levelLabel.position.set(23, 7);
    this.levelValue.anchor.set(0.5, 0);
    this.levelValue.position.set(23, 21);
    this.levelCard.addChild(levelBg, levelLabel, this.levelValue);

    const currencyBg = new Graphics()
      .roundRect(0, 0, 74, 56, 13)
      .fill({ color: 0x21182f, alpha: 0.93 });
    currencyBg
      .roundRect(0, 0, 74, 56, 13)
      .stroke({ color: 0x583d72, alpha: 0.7, width: 1 });
    const currencyLabel = makeText("ДЕНЬГИ 💰", 8, "#d9c7ec", "700");
    currencyLabel.anchor.set(0.5, 0);
    currencyLabel.position.set(37, 7);
    this.currencyValue.anchor.set(0.5, 0);
    this.currencyValue.position.set(37, 24);
    this.currencyCard.addChild(currencyBg, currencyLabel, this.currencyValue);

    this.row.addChild(
      this.affectionCard,
      this.levelCard,
      this.currencyCard,
      this.settings.node,
    );
  }

  resize(width: number): void {
    const availableWidth = Math.max(260, width - 24);
    const x = Math.max(12, (width - availableWidth) / 2);
    this.position.set(x, 10);
    this.panel
      .clear()
      .roundRect(0, 0, availableWidth, 68, 18)
      .fill({ color: 0x130d22, alpha: 0.86 });
    this.panel
      .roundRect(0, 0, availableWidth, 68, 18)
      .stroke({ color: 0x49305f, alpha: 0.72, width: 1 });
    this.row.position.set(10, 6);
    this.rowWidth = availableWidth - 20;
    this.row.layout = {
      width: this.rowWidth,
      height: 56,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 6,
    };
    const affectionWidth = Math.max(76, this.rowWidth - 46 - 74 - 46 - 18);
    this.affectionCard.layout = {
      width: affectionWidth,
      height: 56,
      flexGrow: 1,
    };
    this.levelCard.layout = { width: 46, height: 56 };
    this.currencyCard.layout = { width: 74, height: 56 };
    this.settings.node.layout = { width: 46, height: 50 };
    const progressWidth = Math.max(50, affectionWidth - 20);
    this.progressBar.width = progressWidth;
  }

  render(state: Readonly<GameState>): void {
    const relation = affectionProgress(state.affection);
    const stage = relationshipStage(relation.level);
    this.affectionValue.text = `${formatAmount(state.affection)} · ${stage.name}`;
    this.progressBar.progress = relation.progress * 100;
    this.levelValue.text = state.level.toString();
    this.currencyValue.text = formatAmount(state.currency);
  }
}
