import { Container, Graphics, Text } from "pixi.js";
import { GAME_BALANCE } from "../../content/upgrades/balance.ts";
import type { HeroineTouchZone } from "../../domain/economy/types.ts";
import { passiveIncomePerSecond } from "../../domain/economy/economy.ts";
import { isIntroDialogueUnlocked } from "../../domain/unlocks/unlocks.ts";
import type { InkIntroStory as InkIntroStoryType } from "../../narrative/ink/InkIntroStory.ts";
import { GameSession } from "../GameSession.ts";
import { LayeredHeroineRig } from "../../heroine/rig/LayeredHeroineRig.ts";
import { downloadGameBackup } from "../../persistence/backups/exportGameSave.ts";
import { BottomNavigation } from "../../presentation/ui/BottomNavigation.ts";
import { DialogueOverlay } from "../../presentation/ui/DialogueOverlay.ts";
import { FloatingPanel } from "../../presentation/ui/FloatingPanel.ts";
import { StatusHud } from "../../presentation/ui/StatusHud.ts";
import { UpgradePanel } from "../../presentation/ui/UpgradePanel.ts";
import { RewardFeedback } from "../../presentation/pixi/RewardFeedback.ts";
import { LiveRegion } from "../../presentation/dom/LiveRegion.ts";

export interface MainSceneCallbacks {
  save: () => Promise<void>;
}

export class MainScene extends Container {
  private readonly session: GameSession;
  private readonly callbacks: MainSceneCallbacks;
  private readonly background = new Graphics();
  private readonly ambient = new Graphics();
  private readonly heroine: LayeredHeroineRig;
  private readonly statusHud: StatusHud;
  private readonly upgradePanel: UpgradePanel;
  private readonly bottomNavigation: BottomNavigation;
  private readonly floatingPanel: FloatingPanel;
  private readonly dialogue = new DialogueOverlay();
  private readonly feedback: RewardFeedback;
  private readonly liveRegion = new LiveRegion();
  private readonly interactionHint = new Text({
    text: "КАСАНИЕ: ГОЛОВА · ВОЛОСЫ · КОРПУС · РУКИ",
    style: {
      fontFamily: "Arial",
      fontSize: 8,
      fontWeight: "700",
      fill: "#d6bce9",
      align: "center",
      letterSpacing: 0.5,
    },
  });
  private currentStory: InkIntroStoryType | null = null;
  private openingStory = false;
  private screenWidth = 320;
  private screenHeight = 568;
  private uiAccumulatorMs = 0;
  private autosaveAccumulatorMs = 0;
  private paused = false;

  constructor(session: GameSession, callbacks: MainSceneCallbacks) {
    super();
    this.label = "main clicker scene";
    this.session = session;
    this.callbacks = callbacks;
    this.background.eventMode = "none";
    this.ambient.eventMode = "none";
    this.addChild(this.background, this.ambient);

    this.heroine = new LayeredHeroineRig((zone, localX, localY) =>
      this.onHeroineTap(zone, localX, localY),
    );
    this.addChild(this.heroine);

    this.statusHud = new StatusHud(() => void this.exportBackup());
    this.floatingPanel = new FloatingPanel(() => void this.openIntroDialogue());
    this.upgradePanel = new UpgradePanel(() => this.purchaseUpgrade());
    this.bottomNavigation = new BottomNavigation((section) =>
      this.showPlaceholder(section),
    );
    this.feedback = new RewardFeedback(this);

    this.interactionHint.anchor.set(0.5, 0);
    this.interactionHint.alpha = 0.82;
    this.interactionHint.eventMode = "none";

    this.addChild(
      this.floatingPanel,
      this.upgradePanel,
      this.interactionHint,
      this.statusHud,
      this.bottomNavigation,
      this.dialogue,
    );
    this.renderState();
  }

  update(elapsedMs: number): void {
    if (this.paused || !Number.isFinite(elapsedMs) || elapsedMs <= 0) return;
    this.session.tick(elapsedMs);
    this.uiAccumulatorMs += elapsedMs;
    this.autosaveAccumulatorMs += elapsedMs;

    if (this.uiAccumulatorMs >= 200) {
      this.uiAccumulatorMs %= 200;
      this.renderState();
    }
    if (this.autosaveAccumulatorMs >= 15_000) {
      this.autosaveAccumulatorMs %= 15_000;
      void this.saveWithNotice(false);
    }
  }

  resize(width: number, height: number): void {
    this.screenWidth = Math.max(280, width);
    this.screenHeight = Math.max(240, height);
    const portrait = this.screenWidth <= this.screenHeight;
    const widthSafe = this.screenWidth;
    const heightSafe = this.screenHeight;

    this.background
      .clear()
      .rect(0, 0, widthSafe, heightSafe)
      .fill({ color: 0x100b20 });
    this.ambient.clear();
    this.ambient
      .circle(
        widthSafe * 0.5,
        heightSafe * 0.43,
        Math.min(widthSafe, heightSafe) * 0.37,
      )
      .fill({ color: 0x63388c, alpha: 0.12 });
    this.ambient
      .circle(
        widthSafe * 0.5,
        heightSafe * 0.43,
        Math.min(widthSafe, heightSafe) * 0.31,
      )
      .stroke({ color: 0x9564b2, alpha: 0.12, width: 1 });
    for (let index = 0; index < 14; index += 1) {
      const x = ((index * 83 + 23) % Math.max(1, widthSafe - 20)) + 10;
      const y = ((index * 127 + 41) % Math.max(1, heightSafe - 110)) + 64;
      this.ambient
        .circle(x, y, index % 3 === 0 ? 1.5 : 1)
        .fill({ color: index % 2 === 0 ? 0xd8a1ff : 0x8fe7ff, alpha: 0.42 });
    }

    this.statusHud.resize(widthSafe);
    this.bottomNavigation.resize(widthSafe, heightSafe);
    this.upgradePanel.resize(widthSafe, heightSafe, portrait);

    let heroineCenterX: number;
    let heroineCenterY: number;
    let heroineScale: number;
    if (portrait) {
      const cardTop = heightSafe - 66 - 82 - 8;
      const areaTop = 88;
      const availableHeight = Math.max(150, cardTop - areaTop - 22);
      heroineScale = Math.min(
        1.04,
        availableHeight / 376,
        (widthSafe - 88) / 150,
      );
      heroineCenterX = widthSafe / 2;
      heroineCenterY = areaTop + availableHeight / 2;
      this.floatingPanel.resize(10, Math.max(112, heroineCenterY - 35));
      this.interactionHint.position.set(widthSafe / 2, cardTop - 18);
    } else {
      const sidePanelWidth = 204;
      const areaLeft = 64;
      const areaRight = widthSafe - sidePanelWidth - 18;
      const availableWidth = Math.max(150, areaRight - areaLeft);
      const areaTop = 78;
      const areaBottom = heightSafe - 68;
      const availableHeight = Math.max(150, areaBottom - areaTop);
      heroineScale = Math.min(
        0.92,
        availableHeight / 376,
        availableWidth / 198,
      );
      heroineCenterX = areaLeft + availableWidth / 2;
      heroineCenterY = areaTop + availableHeight / 2;
      this.floatingPanel.resize(8, Math.max(90, heroineCenterY - 44));
      this.interactionHint.position.set(heroineCenterX, areaBottom - 12);
    }
    this.heroine.position.set(heroineCenterX, heroineCenterY);
    this.heroine.setScaleForViewport(heroineScale);
    // The "TECHNICAL LAYER PLACEHOLDER" caption sits 188 px below the rig origin at scale 1.
    // On short/narrow viewports that row overlaps the touch-zone hint, so constrain it to the
    // free space above the hint and convert the pixel limit back into rig-local units.
    const hintTop = portrait
      ? heightSafe - 66 - 82 - 8 - 18
      : heightSafe - 68 - 12;
    // A 22 px gap keeps the caption legible next to the hint on a 280 px screen.
    const tagLimitLocal = (hintTop - 22 - heroineCenterY) / heroineScale;
    this.heroine.setTagBottomLimit(
      Number.isFinite(tagLimitLocal) ? tagLimitLocal : null,
    );
    this.dialogue.resize(widthSafe, heightSafe);
    this.renderState();
  }

  applyOfflineProgress(
    currencyAwarded: number,
    elapsedSeconds: number,
    clockMovedBackwards: boolean,
  ): void {
    if (clockMovedBackwards) {
      this.showStatus(
        "Системные часы изменились назад: доход за этот период не начислен.",
      );
      this.liveRegion.announce(
        "Время на устройстве было переведено назад. Offline-награда не начислена.",
      );
    } else if (currencyAwarded > 0) {
      const hours = Math.floor(elapsedSeconds / 3600);
      const minutes = Math.floor((elapsedSeconds % 3600) / 60);
      this.showStatus(
        `С возвращением · +${currencyAwarded.toFixed(1)} за ${hours}ч ${minutes}м`,
      );
      this.liveRegion.announce(
        `Offline-награда: ${currencyAwarded.toFixed(1)} кредитов.`,
      );
    }
    this.renderState();
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  renderState(): void {
    const state = this.session.state;
    this.statusHud.render(state);
    this.upgradePanel.render(state);
    this.floatingPanel.setRate(passiveIncomePerSecond(state));
  }

  private onHeroineTap(
    zone: HeroineTouchZone,
    localX: number,
    localY: number,
  ): void {
    const outcome = this.session.tap(zone);
    const global = this.heroine.toGlobal({ x: localX, y: localY });
    const previousLevel = outcome.previousLevel;
    this.feedback.show(
      `+${outcome.currencyDelta} credits`,
      global.x,
      global.y - 8,
    );
    this.feedback.show(
      `+${outcome.affectionDelta} affection`,
      global.x,
      global.y + 18,
    );
    if (outcome.leveledUp)
      this.showStatus(`AFFECTION TIER ${outcome.nextLevel} · NEW MILESTONE`);
    this.renderState();
    void this.saveWithNotice(false);
    this.liveRegion.announce(
      `${zone}. Получено ${outcome.currencyDelta} кредитов и ${outcome.affectionDelta} affection.`,
    );
    if (outcome.nextLevel > previousLevel)
      this.liveRegion.announce(
        `Новый уровень отношений: ${outcome.nextLevel}.`,
      );
  }

  private purchaseUpgrade(): void {
    const result = this.session.buyIncomeUpgrade();
    if (!result.purchased) {
      this.showStatus(`Не хватает кредитов · нужно ${result.cost}`);
      this.liveRegion.announce(`Недостаточно кредитов. Нужно ${result.cost}.`);
      return;
    }
    const rate = passiveIncomePerSecond(this.session.state);
    this.showStatus(
      `УЛУЧШЕНИЕ КУПЛЕНО · +${GAME_BALANCE.passiveIncome.perUpgradeLevel.toFixed(2)} / сек`,
    );
    this.feedback.show(
      `PASSIVE ${rate.toFixed(2)} / SEC`,
      this.screenWidth / 2,
      this.screenHeight * 0.42,
      "milestone",
    );
    this.renderState();
    void this.saveWithNotice(false);
    this.liveRegion.announce(
      `Улучшение куплено. Пассивный доход ${rate.toFixed(2)} в секунду.`,
    );
  }

  private async openIntroDialogue(): Promise<void> {
    if (!isIntroDialogueUnlocked(this.session.state) || this.openingStory)
      return;
    if (this.session.state.storyFlags.introCompleted) {
      this.showStatus("Демонстрационная сцена уже пройдена.");
      return;
    }

    this.openingStory = true;
    try {
      const { InkIntroStory } =
        await import("../../narrative/ink/InkIntroStory.ts");
      this.currentStory = new InkIntroStory(this.session.state.inkStateJson);
      const step = this.currentStory.beginOrResume();
      const transcript =
        this.session.state.storyFlags.introTranscript || step.text;
      this.session.saveInkCheckpoint(step.stateJson, transcript);
      void this.saveWithNotice(false);
      this.dialogue.present(
        { transcript, choices: step.choices, complete: step.isComplete },
        {
          onChoice: (index) => this.chooseDialogue(index),
          onDone: () => this.closeDialogue(),
        },
      );
      this.liveRegion.announce(
        `Начат диалог. Вариантов ответа: ${step.choices.length}.`,
      );
    } catch (error) {
      this.currentStory = null;
      console.error("Could not resume InkJS dialogue", error);
      this.showStatus("Не удалось открыть сохранённый диалог.");
    } finally {
      this.openingStory = false;
    }
  }

  private chooseDialogue(index: number): void {
    if (!this.currentStory) return;
    try {
      const result = this.currentStory.choose(index);
      const previousTranscript = this.session.state.storyFlags.introTranscript;
      const transcript = [previousTranscript, result.text]
        .filter(Boolean)
        .join("\n\n");

      if (result.isComplete) {
        const completion = this.session.completeIntroChoice(
          result.stateJson,
          transcript,
          result.responseId,
          result.affectionDelta,
        );
        if (result.affectionDelta > 0) {
          this.feedback.show(
            `+${result.affectionDelta} AFFECTION`,
            this.screenWidth / 2,
            this.screenHeight * 0.36,
            "milestone",
          );
        }
        if (completion.leveledUp)
          this.showStatus(
            `AFFECTION TIER ${completion.nextAffectionLevel} · NEW MILESTONE`,
          );
      } else {
        this.session.saveInkCheckpoint(result.stateJson, transcript);
      }

      this.dialogue.present(
        { transcript, choices: result.choices, complete: result.isComplete },
        {
          onChoice: (choiceIndex) => this.chooseDialogue(choiceIndex),
          onDone: () => this.closeDialogue(),
        },
      );
      this.renderState();
      void this.saveWithNotice(false);
      this.liveRegion.announce(result.text || "Выбор сохранён.");
    } catch (error) {
      console.error("InkJS choice failed", error);
      this.showStatus("Не удалось сохранить выбор диалога.");
    }
  }

  private closeDialogue(): void {
    this.dialogue.hide();
    this.currentStory = null;
    void this.saveWithNotice(false);
    this.liveRegion.announce("Диалог завершён. Возврат на главную сцену.");
  }

  private showPlaceholder(section: string): void {
    if (section === "HOME") {
      this.showStatus("Главная сцена активна.");
      return;
    }
    this.showStatus(`${section}: placeholder раздела v0.1`);
  }

  private showStatus(message: string): void {
    this.feedback.show(
      message,
      this.screenWidth / 2,
      Math.max(95, this.screenHeight * 0.28),
      "milestone",
    );
  }

  private async exportBackup(): Promise<void> {
    try {
      await this.callbacks.save();
      downloadGameBackup(this.session.state);
      this.showStatus("JSON-КОПИЯ СОХРАНЕНИЯ СКАЧАНА");
      this.liveRegion.announce("Резервная копия сохранения скачана.");
    } catch (error) {
      console.error("Could not export save", error);
      this.showStatus("Не удалось сохранить копию. Проверьте IndexedDB.");
    }
  }

  private async saveWithNotice(showSuccess: boolean): Promise<void> {
    try {
      await this.callbacks.save();
      if (showSuccess) this.showStatus("Прогресс сохранён.");
    } catch (error) {
      console.error("Autosave failed", error);
      this.showStatus("Сохранение недоступно · проверьте настройки браузера.");
    }
  }
}
