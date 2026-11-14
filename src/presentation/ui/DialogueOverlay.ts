import { Container, Graphics, Rectangle, Text } from "pixi.js";
import { UI_FONT } from "./nikkeKit.ts";
import { createStyledButton, type StyledButton } from "./button.ts";

export interface DialoguePresentation {
  transcript: string;
  choices: string[];
  complete: boolean;
}

export class DialogueOverlay extends Container {
  private readonly dimmer = new Graphics();
  private readonly panel = new Graphics();
  private readonly speaker: Text;
  private readonly body: Text;
  private readonly choiceButtons: StyledButton[] = [];
  private doneButton: StyledButton;
  private onChoice: ((index: number) => void) | null = null;
  private onDone: (() => void) | null = null;
  private screenWidth = 320;
  private screenHeight = 568;
  private readonly bodyTop = 66;

  constructor() {
    super();
    this.label = "InkJS dialogue overlay";
    this.visible = false;
    this.eventMode = "static";
    this.addChild(this.dimmer, this.panel);

    this.speaker = new Text({
      text: "HEROINE-01",
      style: {
        fontFamily: UI_FONT,
        fontSize: 10,
        fontWeight: "700",
        fill: "#f0a9e4",
        letterSpacing: 1,
      },
    });
    this.body = new Text({
      text: "",
      style: {
        fontFamily: UI_FONT,
        fontSize: 14,
        fontWeight: "500",
        fill: "#fff7ff",
        wordWrap: true,
        breakWords: true,
        lineHeight: 21,
      },
    });
    this.addChild(this.speaker, this.body);

    for (let index = 0; index < 2; index += 1) {
      const button = createStyledButton("", {
        width: 250,
        height: 48,
        fontSize: 11,
        fill: 0x623c83,
        stroke: 0xb978df,
        onPress: () => this.onChoice?.(index),
      });
      button.node.visible = false;
      this.choiceButtons.push(button);
      this.addChild(button.node);
    }

    this.doneButton = createStyledButton("ВЕРНУТЬСЯ", {
      width: 250,
      height: 48,
      fontSize: 11,
      fill: 0x8241ab,
      stroke: 0xe08be5,
      onPress: () => this.onDone?.(),
    });
    this.doneButton.node.visible = false;
    this.addChild(this.doneButton.node);
  }

  resize(width: number, height: number): void {
    this.screenWidth = width;
    this.screenHeight = height;
    this.dimmer
      .clear()
      .rect(0, 0, width, height)
      .fill({ color: 0x090611, alpha: 0.76 });
    this.hitArea = new Rectangle(0, 0, width, height);
    const panelWidth = Math.min(520, width - 28);
    const panelHeight = Math.min(330, Math.max(286, height * 0.58));
    const panelX = (width - panelWidth) / 2;
    const panelY = (height - panelHeight) / 2;
    this.panel
      .clear()
      .roundRect(panelX, panelY, panelWidth, panelHeight, 24)
      .fill({ color: 0x21152f, alpha: 0.99 });
    this.panel
      .roundRect(panelX, panelY, panelWidth, panelHeight, 24)
      .stroke({ color: 0xb76ed3, alpha: 0.8, width: 1.5 });

    this.speaker.position.set(panelX + 20, panelY + 18);
    this.body.position.set(panelX + 20, panelY + this.bodyTop);
    this.body.style.wordWrapWidth = panelWidth - 40;

    const buttonWidth = panelWidth - 40;
    const buttonY = panelY + panelHeight - 60;
    for (const button of this.choiceButtons) {
      button.setSize(buttonWidth, 48);
      button.node.position.set(panelX + 20, buttonY);
    }
    this.doneButton.setSize(buttonWidth, 48);
    this.doneButton.node.position.set(panelX + 20, buttonY);
  }

  present(
    content: DialoguePresentation,
    handlers: { onChoice: (index: number) => void; onDone: () => void },
  ): void {
    this.onChoice = handlers.onChoice;
    this.onDone = handlers.onDone;
    this.visible = true;
    this.body.text = content.transcript;
    this.body.style.wordWrapWidth = Math.min(480, this.screenWidth - 68);
    const panelHeight = Math.min(330, Math.max(286, this.screenHeight * 0.58));
    const panelY = (this.screenHeight - panelHeight) / 2;
    const panelX =
      (this.screenWidth - Math.min(520, this.screenWidth - 28)) / 2;
    const buttonWidth = Math.min(480, this.screenWidth - 68);
    const buttonStartY = panelY + panelHeight - 60;
    const choiceCount = Math.min(2, content.choices.length);

    for (let index = 0; index < this.choiceButtons.length; index += 1) {
      const button = this.choiceButtons[index];
      if (!button) continue;
      const choice = content.choices[index];
      button.node.visible = Boolean(choice) && !content.complete;
      if (!choice || content.complete) continue;
      button.setSize(buttonWidth, 48);
      button.setLabel(choice);
      button.node.position.set(
        panelX + 20,
        buttonStartY - (choiceCount - 1 - index) * 54,
      );
    }
    this.doneButton.node.visible = content.complete;
    if (content.complete)
      this.doneButton.node.position.set(panelX + 20, buttonStartY);
  }

  hide(): void {
    this.visible = false;
    this.onChoice = null;
    this.onDone = null;
  }
}
