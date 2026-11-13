import { Assets, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import roomFloorUrl from "../../assets/environment/room-floor.webp?url";
import roomLyingUrl from "../../assets/environment/room-lying.webp?url";
import roomShelfUrl from "../../assets/environment/room-shelf.webp?url";
import roomStandingUrl from "../../assets/environment/room-standing.webp?url";
import {
  BED_ZONE_ECONOMY,
  BedHeroine,
  type BedTouchZone,
} from "../../heroine/bed/BedHeroine.ts";
import {
  CARPET_ZONE_ECONOMY,
  CarpetHeroine,
  type CarpetTouchZone,
} from "../../heroine/carpet/CarpetHeroine.ts";
import {
  SHELF_ZONE_ECONOMY,
  ShelfHeroine,
  type ShelfTouchZone,
} from "../../heroine/shelf/ShelfHeroine.ts";
import { resolvePoseVariant } from "../../heroine/poses/naturalBasePose.ts";
import {
  createStyledButton,
  type StyledButton,
} from "../../presentation/ui/button.ts";
import { GAME_BALANCE } from "../../content/upgrades/balance.ts";
import type { HeroineTouchZone } from "../../domain/economy/types.ts";
import { passiveIncomePerSecond } from "../../domain/economy/economy.ts";
import { isIntroDialogueUnlocked } from "../../domain/unlocks/unlocks.ts";
import type { InkIntroStory as InkIntroStoryType } from "../../narrative/ink/InkIntroStory.ts";
import { GameSession } from "../GameSession.ts";
import { ProductionHeroineRig } from "../../heroine/rig/ProductionHeroineRig.ts";
import { downloadGameBackup } from "../../persistence/backups/exportGameSave.ts";
import { BottomNavigation } from "../../presentation/ui/BottomNavigation.ts";
import { DialogueOverlay } from "../../presentation/ui/DialogueOverlay.ts";
import { FloatingPanel } from "../../presentation/ui/FloatingPanel.ts";
import { StatusHud } from "../../presentation/ui/StatusHud.ts";
import { UpgradePanel } from "../../presentation/ui/UpgradePanel.ts";
import { RewardFeedback } from "../../presentation/pixi/RewardFeedback.ts";
import {
  HeartBurst,
  tapHaptic,
} from "../../presentation/effects/HeartBurst.ts";
import { LiveRegion } from "../../presentation/dom/LiveRegion.ts";

export interface MainSceneCallbacks {
  save: () => Promise<void>;
}

export class MainScene extends Container {
  private readonly session: GameSession;
  private readonly callbacks: MainSceneCallbacks;
  private readonly background = new Graphics();
  /**
   * Approved student-room art (BLOCK D) behind the natural pose.  The classic
   * `?pose=classic` variant keeps the original dark backdrop untouched.
   */
  private readonly roomBackdrop = new Sprite(Texture.EMPTY);
  /** Dark scrim over the room art so HUD text and toasts stay readable. */
  private readonly backdropScrim = new Graphics();
  private readonly roomEnabled =
    resolvePoseVariant(window.location.search) === "natural";
  /** BLOCK D bed scene (lying pose); reachable through the ЛЕЧЬ toggle. */
  private readonly bedHeroine: BedHeroine;
  private readonly bedToggle: StyledButton;
  /** BLOCK H shelf scene (reaching the top shelf); К ПОЛКЕ toggle. */
  private readonly shelfHeroine: ShelfHeroine;
  private readonly shelfToggle: StyledButton;
  /** BLOCK I carpet scene (reading on the floor); НА ПОЛ toggle. */
  private readonly carpetHeroine: CarpetHeroine;
  private readonly carpetToggle: StyledButton;
  private sceneMode: "standing" | "bed" | "shelf" | "carpet" = "standing";
  private roomStandingTexture: Texture | null = null;
  private roomLyingTexture: Texture | null = null;
  private roomShelfTexture: Texture | null = null;
  private roomFloorTexture: Texture | null = null;
  private readonly ambient = new Graphics();
  private readonly heroine: ProductionHeroineRig;
  private readonly statusHud: StatusHud;
  private readonly upgradePanel: UpgradePanel;
  private readonly bottomNavigation: BottomNavigation;
  private readonly floatingPanel: FloatingPanel;
  private readonly dialogue = new DialogueOverlay();
  private readonly feedback: RewardFeedback;
  private readonly hearts = new HeartBurst();
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
  /** Empty dark band above the heroine's head, used for reward toasts. */
  private rewardToastY = 118;
  /** Empty dark band below the approved artwork, used for long status messages. */
  private statusToastY = 628;
  private uiAccumulatorMs = 0;
  private autosaveAccumulatorMs = 0;
  private paused = false;

  constructor(session: GameSession, callbacks: MainSceneCallbacks) {
    super();
    this.label = "main clicker scene";
    this.session = session;
    this.callbacks = callbacks;
    this.background.eventMode = "none";
    this.roomBackdrop.eventMode = "none";
    this.backdropScrim.eventMode = "none";
    this.ambient.eventMode = "none";
    this.addChild(
      this.background,
      this.roomBackdrop,
      this.backdropScrim,
      this.ambient,
    );
    if (this.roomEnabled) {
      void Promise.all([
        Assets.load<Texture>(roomStandingUrl),
        Assets.load<Texture>(roomLyingUrl),
        Assets.load<Texture>(roomShelfUrl),
        Assets.load<Texture>(roomFloorUrl),
      ])
        .then(([standing, lying, shelf, floor]) => {
          this.roomStandingTexture = standing;
          this.roomLyingTexture = lying;
          this.roomShelfTexture = shelf;
          this.roomFloorTexture = floor;
          this.roomBackdrop.texture = this.roomTextureForMode() ?? standing;
          this.layoutBackdrop();
        })
        .catch(() => {
          // Keep the plain dark backdrop if the room art fails to load.
        });
    }

    this.heroine = new ProductionHeroineRig((zone, localX, localY) =>
      this.onHeroineTap(zone, localX, localY),
    );
    this.addChild(this.heroine);

    this.bedHeroine = new BedHeroine((zone, globalX, globalY) =>
      this.onBedTap(zone, globalX, globalY),
    );
    this.bedHeroine.visible = false;
    this.addChild(this.bedHeroine);
    this.shelfHeroine = new ShelfHeroine((zone, globalX, globalY) =>
      this.onShelfTap(zone, globalX, globalY),
    );
    this.shelfHeroine.visible = false;
    this.addChild(this.shelfHeroine);
    this.carpetHeroine = new CarpetHeroine((zone, globalX, globalY) =>
      this.onCarpetTap(zone, globalX, globalY),
    );
    this.carpetHeroine.visible = false;
    this.addChild(this.carpetHeroine);
    this.bedToggle = createStyledButton("ЛЕЧЬ", {
      width: 58,
      height: 34,
      fontSize: 8,
      fill: 0x673b8f,
      stroke: 0xd187e8,
      radius: 12,
      onPress: () =>
        this.setSceneMode(this.sceneMode === "bed" ? "standing" : "bed"),
    });
    this.bedToggle.node.visible = this.roomEnabled;
    this.shelfToggle = createStyledButton("К ПОЛКЕ", {
      width: 58,
      height: 34,
      fontSize: 8,
      fill: 0x673b8f,
      stroke: 0xd187e8,
      radius: 12,
      onPress: () =>
        this.setSceneMode(this.sceneMode === "shelf" ? "standing" : "shelf"),
    });
    this.shelfToggle.node.visible = this.roomEnabled;
    this.carpetToggle = createStyledButton("НА ПОЛ", {
      width: 58,
      height: 34,
      fontSize: 8,
      fill: 0x673b8f,
      stroke: 0xd187e8,
      radius: 12,
      onPress: () =>
        this.setSceneMode(this.sceneMode === "carpet" ? "standing" : "carpet"),
    });
    this.carpetToggle.node.visible = this.roomEnabled;
    if (this.roomEnabled) {
      void this.bedHeroine.load().catch(() => {
        this.bedToggle.setEnabled(false);
      });
      void this.shelfHeroine.load().catch(() => {
        this.shelfToggle.setEnabled(false);
      });
      void this.carpetHeroine.load().catch(() => {
        this.carpetToggle.setEnabled(false);
      });
    }

    this.statusHud = new StatusHud(() => void this.exportBackup());
    this.floatingPanel = new FloatingPanel(() => void this.openIntroDialogue());
    this.upgradePanel = new UpgradePanel(() => this.purchaseUpgrade());
    this.bottomNavigation = new BottomNavigation((section) =>
      this.showPlaceholder(section),
    );
    this.feedback = new RewardFeedback(this);
    void this.hearts.load().catch(() => {
      // Hearts are cosmetic; the game keeps running without the texture.
    });

    this.interactionHint.anchor.set(0.5, 0);
    this.interactionHint.alpha = 0.82;
    this.interactionHint.eventMode = "none";

    this.addChild(
      this.hearts,
      this.floatingPanel,
      this.bedToggle.node,
      this.shelfToggle.node,
      this.carpetToggle.node,
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
    if (this.sceneMode === "bed") {
      this.bedHeroine.update(elapsedMs);
    } else if (this.sceneMode === "shelf") {
      this.shelfHeroine.update(elapsedMs);
    } else if (this.sceneMode === "carpet") {
      this.carpetHeroine.update(elapsedMs);
    } else {
      this.heroine.update(elapsedMs);
    }
    this.hearts.update(elapsedMs);
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
    if (!this.roomEnabled) {
      // The purple glow and star specks belong to the abstract dark backdrop
      // of the classic variant; over the approved room art they read as dirt.
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
    }
    this.layoutBackdrop();

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
      // Over the room art the heroine stands close to the player, framed
      // from just above her head (art row ~36) down to mid-thigh (art row
      // ~880): the scale fits that 844px span into the available height and
      // the pose is TOP-anchored, so her legs below the thighs continue
      // behind the upgrade card instead of shrinking the whole figure.
      // Width still caps the zoom on narrow phones (628px figure core +
      // hair; outer hair tips may touch the screen edge).  The classic dark
      // variant keeps the original distant full-body framing.
      const frameTopArt = 36;
      const frameSpanArt = 844;
      heroineScale = this.roomEnabled
        ? Math.min(1.04, availableHeight / frameSpanArt, (widthSafe + 40) / 660)
        : Math.min(1.04, availableHeight / 1264, (widthSafe - 88) / 848);
      heroineCenterX = widthSafe / 2;
      heroineCenterY = this.roomEnabled
        ? areaTop + heroineScale * (1264 / 2 - frameTopArt)
        : areaTop + availableHeight / 2;
      const panelY = this.roomEnabled
        ? Math.max(112, Math.min(heroineCenterY - 35, heightSafe * 0.42))
        : Math.max(112, heroineCenterY - 35);
      this.floatingPanel.resize(10, panelY);
      this.bedToggle.node.position.set(10, panelY + 104);
      this.shelfToggle.node.position.set(10, panelY + 104 + 42);
      this.carpetToggle.node.position.set(10, panelY + 104 + 84);
      this.bedHeroine.layoutScene(widthSafe, areaTop, cardTop - 10);
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
        availableHeight / 1264,
        availableWidth / 848,
      );
      heroineCenterX = areaLeft + availableWidth / 2;
      heroineCenterY = areaTop + availableHeight / 2;
      this.floatingPanel.resize(8, Math.max(90, heroineCenterY - 44));
      this.bedToggle.node.position.set(
        8,
        Math.max(90, heroineCenterY - 44) + 104,
      );
      this.shelfToggle.node.position.set(
        8,
        Math.max(90, heroineCenterY - 44) + 104 + 42,
      );
      this.carpetToggle.node.position.set(
        8,
        Math.max(90, heroineCenterY - 44) + 104 + 84,
      );
      this.bedHeroine.layoutScene(
        Math.min(widthSafe, (availableHeight * 1152) / 1330),
        areaTop,
        areaBottom,
      );
      this.interactionHint.position.set(heroineCenterX, areaBottom - 12);
    }
    // Reward toasts used to spawn exactly at the touch point, on top of the
    // light hair/skin, with a thick dark outline. On a 3x iPhone that read as
    // black dots and lines on tap. Keep every toast in the empty dark band
    // above the approved artwork instead.
    this.rewardToastY = Math.max(
      96,
      heroineCenterY - heroineScale * (1264 / 2) - 34,
    );
    this.statusToastY = Math.min(
      heightSafe - 96,
      heroineCenterY + heroineScale * (1264 / 2) + 26,
    );
    this.heroine.position.set(heroineCenterX, heroineCenterY);
    this.heroine.setScaleForViewport(heroineScale);
    // The production rig has no placeholder caption; the method is retained as
    // a no-op for the existing scene layout contract.
    this.heroine.setTagBottomLimit(null);
    this.dialogue.resize(widthSafe, heightSafe);
    this.renderState();
  }

  /** Cover-fit the approved room art and refresh the readability scrim. */
  private layoutBackdrop(): void {
    if (!this.roomEnabled) return;
    this.backdropScrim.clear();
    const texture = this.roomBackdrop.texture;
    if (texture === Texture.EMPTY || texture.width <= 1) return;
    const portrait = this.screenWidth <= this.screenHeight;
    if (this.sceneMode === "shelf" || this.sceneMode === "carpet") {
      // The shelf and carpet scenes show the WHOLE room above the bottom
      // UI band (contain-fit, bottom-anchored): with the cover crop her
      // feet (shelf) or the raised crossed shins (carpet) — the point of
      // each pose — would sit behind the upgrade card.  The camera
      // "steps back" instead.
      const bottomLimit = portrait
        ? this.screenHeight - 66 - 82 - 8 + 6
        : this.screenHeight - 62;
      const scale = Math.min(
        this.screenWidth / texture.width,
        Math.max(120, bottomLimit) / texture.height,
      );
      this.roomBackdrop.scale.set(scale);
      this.roomBackdrop.position.set(
        (this.screenWidth - texture.width * scale) / 2,
        bottomLimit - texture.height * scale,
      );
    } else {
      const scale = Math.max(
        this.screenWidth / texture.width,
        this.screenHeight / texture.height,
      );
      this.roomBackdrop.scale.set(scale);
      this.roomBackdrop.position.set(
        (this.screenWidth - texture.width * scale) / 2,
        (this.screenHeight - texture.height * scale) / 2,
      );
    }
    // The shelf and carpet heroines live in backdrop coordinates: glue
    // them to the baked-in room for the current backdrop transform.
    this.shelfHeroine.alignToBackdrop(
      this.roomBackdrop.position.x,
      this.roomBackdrop.position.y,
      this.roomBackdrop.scale.x,
    );
    this.carpetHeroine.alignToBackdrop(
      this.roomBackdrop.position.x,
      this.roomBackdrop.position.y,
      this.roomBackdrop.scale.x,
    );
    const bottomBandTop = portrait
      ? this.screenHeight - 66 - 82 - 8 - 30
      : this.screenHeight - 68 - 24;
    this.backdropScrim
      .rect(0, 0, this.screenWidth, this.screenHeight)
      .fill({ color: 0x100b20, alpha: 0.2 });
    this.backdropScrim
      .rect(0, 0, this.screenWidth, 96)
      .fill({ color: 0x100b20, alpha: 0.34 });
    this.backdropScrim
      .rect(
        0,
        bottomBandTop,
        this.screenWidth,
        this.screenHeight - bottomBandTop,
      )
      .fill({ color: 0x100b20, alpha: 0.34 });
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

  /** Room backdrop matching the current scene mode (null until loaded). */
  private roomTextureForMode(): Texture | null {
    if (this.sceneMode === "bed") return this.roomLyingTexture;
    if (this.sceneMode === "shelf") return this.roomShelfTexture;
    if (this.sceneMode === "carpet") return this.roomFloorTexture;
    return this.roomStandingTexture;
  }

  /**
   * Switches between the standing room scene, the BLOCK D bed scene,
   * the BLOCK H shelf scene and the BLOCK I carpet scene.
   */
  private setSceneMode(mode: "standing" | "bed" | "shelf" | "carpet"): void {
    if (mode === "bed" && !this.bedHeroine.ready) return;
    if (mode === "shelf" && !this.shelfHeroine.ready) return;
    if (mode === "carpet" && !this.carpetHeroine.ready) return;
    if (mode === this.sceneMode) return;
    this.sceneMode = mode;
    this.heroine.visible = mode === "standing";
    this.bedHeroine.visible = mode === "bed";
    this.shelfHeroine.visible = mode === "shelf";
    this.carpetHeroine.visible = mode === "carpet";
    this.bedToggle.setLabel(mode === "bed" ? "ВСТАТЬ" : "ЛЕЧЬ");
    this.shelfToggle.setLabel(mode === "shelf" ? "ОТОЙТИ" : "К ПОЛКЕ");
    this.carpetToggle.setLabel(mode === "carpet" ? "ПОДНЯТЬСЯ" : "НА ПОЛ");
    this.interactionHint.text =
      mode === "bed"
        ? "КАСАНИЕ: ГОЛОВА · ЖИВОТ · НОГИ · СТУПНИ"
        : mode === "shelf"
          ? "КАСАНИЕ: ГОЛОВА · ВОЛОСЫ · БЁДРА · СТУПНИ"
          : mode === "carpet"
            ? "КАСАНИЕ: ГОЛОВА · ВОЛОСЫ · БЁДРА · НОЖКИ"
            : "КАСАНИЕ: ГОЛОВА · ВОЛОСЫ · КОРПУС · РУКИ";
    const room = this.roomTextureForMode();
    if (room) {
      this.roomBackdrop.texture = room;
      this.layoutBackdrop();
    }
    this.liveRegion.announce(
      mode === "bed"
        ? "Героиня легла на кровать."
        : mode === "shelf"
          ? "Героиня подошла к книжному шкафу и тянется к верхней полке."
          : mode === "carpet"
            ? "Героиня устроилась на полу с книжкой."
            : "Героиня вернулась на середину комнаты.",
    );
  }

  private onCarpetTap(
    zone: CarpetTouchZone,
    globalX: number,
    globalY: number,
  ): void {
    const outcome = this.session.tap(CARPET_ZONE_ECONOMY[zone]);
    const toastX = Math.max(110, Math.min(this.screenWidth - 110, globalX));
    this.hearts.burst(globalX, globalY);
    tapHaptic();
    this.feedback.show(
      `+${outcome.currencyDelta} credits`,
      toastX,
      this.rewardToastY,
    );
    this.feedback.show(
      `+${outcome.affectionDelta} affection`,
      toastX,
      this.rewardToastY,
    );
    if (outcome.leveledUp) {
      this.showStatus(`AFFECTION TIER ${outcome.nextLevel} · NEW MILESTONE`);
    }
    this.liveRegion.announce(
      `${zone}. Получено ${outcome.currencyDelta} кредитов и ${outcome.affectionDelta} affection.`,
    );
    if (outcome.nextLevel > outcome.previousLevel) {
      this.liveRegion.announce(
        `Новый уровень отношений: ${outcome.nextLevel}.`,
      );
    }
    this.renderState();
  }

  private onShelfTap(
    zone: ShelfTouchZone,
    globalX: number,
    globalY: number,
  ): void {
    const outcome = this.session.tap(SHELF_ZONE_ECONOMY[zone]);
    const toastX = Math.max(110, Math.min(this.screenWidth - 110, globalX));
    this.hearts.burst(globalX, globalY);
    tapHaptic();
    this.feedback.show(
      `+${outcome.currencyDelta} credits`,
      toastX,
      this.rewardToastY,
    );
    this.feedback.show(
      `+${outcome.affectionDelta} affection`,
      toastX,
      this.rewardToastY,
    );
    if (outcome.leveledUp) {
      this.showStatus(`AFFECTION TIER ${outcome.nextLevel} · NEW MILESTONE`);
    }
    this.liveRegion.announce(
      `${zone}. Получено ${outcome.currencyDelta} кредитов и ${outcome.affectionDelta} affection.`,
    );
    if (outcome.nextLevel > outcome.previousLevel) {
      this.liveRegion.announce(
        `Новый уровень отношений: ${outcome.nextLevel}.`,
      );
    }
    this.renderState();
  }

  private onBedTap(zone: BedTouchZone, globalX: number, globalY: number): void {
    const outcome = this.session.tap(BED_ZONE_ECONOMY[zone]);
    const toastX = Math.max(110, Math.min(this.screenWidth - 110, globalX));
    this.hearts.burst(globalX, globalY);
    tapHaptic();
    this.feedback.show(
      `+${outcome.currencyDelta} credits`,
      toastX,
      this.rewardToastY,
    );
    this.feedback.show(
      `+${outcome.affectionDelta} affection`,
      toastX,
      this.rewardToastY,
    );
    if (outcome.leveledUp) {
      this.showStatus(`AFFECTION TIER ${outcome.nextLevel} · NEW MILESTONE`);
    }
    this.liveRegion.announce(
      `${zone}. Получено ${outcome.currencyDelta} кредитов и ${outcome.affectionDelta} affection.`,
    );
    if (outcome.nextLevel > outcome.previousLevel) {
      this.liveRegion.announce(
        `Новый уровень отношений: ${outcome.nextLevel}.`,
      );
    }
    this.renderState();
  }

  private onHeroineTap(
    zone: HeroineTouchZone,
    localX: number,
    localY: number,
  ): void {
    const outcome = this.session.tap(zone);
    const global = this.heroine.toGlobal({ x: localX, y: localY });
    const previousLevel = outcome.previousLevel;
    const toastX = Math.max(110, Math.min(this.screenWidth - 110, global.x));
    this.hearts.burst(global.x, global.y);
    tapHaptic();
    this.feedback.show(
      `+${outcome.currencyDelta} credits`,
      toastX,
      this.rewardToastY,
    );
    this.feedback.show(
      `+${outcome.affectionDelta} affection`,
      toastX,
      this.rewardToastY,
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
      this.rewardToastY + 14,
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
            this.rewardToastY + 14,
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
      this.statusToastY,
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
