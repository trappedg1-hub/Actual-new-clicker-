import { Assets, Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import { UI_FONT } from "../../presentation/ui/nikkeKit.ts";
import roomFloorUrl from "../../assets/environment/room-floor.webp?url";
import roomLyingUrl from "../../assets/environment/room-lying.webp?url";
import roomShelfUrl from "../../assets/environment/room-shelf.webp?url";
import roomStandingUrl from "../../assets/environment/room-standing.webp?url";
import iconHeartUrl from "../../assets/ui/icon-heart.png?url";
import iconLockUrl from "../../assets/ui/icon-lock.png?url";
import iconGiftUrl from "../../assets/ui/icon-gift.png?url";
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
import { CARPET_ROOM } from "../../heroine/carpet/carpetScene.ts";
import {
  SHELF_ZONE_ECONOMY,
  ShelfHeroine,
  type ShelfTouchZone,
} from "../../heroine/shelf/ShelfHeroine.ts";
import { SHELF_CAMERA, SHELF_ROOM } from "../../heroine/shelf/shelfScene.ts";
import { resolvePoseVariant } from "../../heroine/poses/naturalBasePose.ts";
import {
  createStyledButton,
  type StyledButton,
} from "../../presentation/ui/button.ts";
import {
  GAME_BALANCE,
  type UpgradeKind,
} from "../../content/upgrades/balance.ts";
import {
  pickIdleLine,
  pickTapLine,
  poseHeatBand,
  relationshipStage,
  RELATIONSHIP_STAGES,
  upgradeRomanticName,
  type HeroinePose,
  type TapZone,
} from "../../content/relationship/relationship.ts";
import type { HeroineTouchZone } from "../../domain/economy/types.ts";
import { passiveIncomePerSecond } from "../../domain/economy/economy.ts";
import { affectionProgress } from "../../domain/progression/progression.ts";
import { isIntroDialogueUnlocked } from "../../domain/unlocks/unlocks.ts";
import type { InkIntroStory as InkIntroStoryType } from "../../narrative/ink/InkIntroStory.ts";
import { GameSession } from "../GameSession.ts";
import { ProductionHeroineRig } from "../../heroine/rig/ProductionHeroineRig.ts";
import { downloadGameBackup } from "../../persistence/backups/exportGameSave.ts";
import { BottomNavigation } from "../../presentation/ui/BottomNavigation.ts";
import { DialogueOverlay } from "../../presentation/ui/DialogueOverlay.ts";
import { FloatingPanel } from "../../presentation/ui/FloatingPanel.ts";
import { SpeechBubble } from "../../presentation/ui/SpeechBubble.ts";
import { StatusHud } from "../../presentation/ui/StatusHud.ts";
import { RomanceShop } from "../../presentation/ui/RomanceShop.ts";
import { RewardFeedback } from "../../presentation/pixi/RewardFeedback.ts";
import {
  HeartBurst,
  tapHaptic,
} from "../../presentation/effects/HeartBurst.ts";
import { LiveRegion } from "../../presentation/dom/LiveRegion.ts";

export interface MainSceneCallbacks {
  save: () => Promise<void>;
}

/**
 * Geometry of room-lying.webp: a tall seamless portrait extension of the
 * 1152px-wide bed art — `artTop` rows of outpainted wall/curtains sit above
 * the exact art window, followed by outpainted bedsheets below it.
 */
const BED_BACKDROP = { artWidth: 1152, artTop: 820 } as const;

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
  private readonly romanceShop: RomanceShop;
  private readonly bottomNavigation: BottomNavigation;
  private readonly floatingPanel: FloatingPanel;
  private readonly dialogue = new DialogueOverlay();
  private readonly speechBubble = new SpeechBubble((speaking) => {
    // Her glass message card sits where the touch hint lives; the hint
    // yields the floor while she is actually speaking.
    this.interactionHint.visible = !speaking;
  });
  /** Wall-clock time of her last spoken tap line (bubble spam guard). */
  private lastSpokenAtMs = 0;
  /** Ms since the player last touched her — drives her idle teases. */
  private idleMs = 0;
  private readonly feedback: RewardFeedback;
  private readonly hearts = new HeartBurst();
  /** Generated kawaii toast icons (heart/lock/gift) — the game renders no emoji glyphs. */
  private readonly toastIcons = new Map<"heart" | "lock" | "gift", Texture>();
  private readonly liveRegion = new LiveRegion();
  private readonly interactionHint = new Text({
    text: "ТАП: ГОЛОВА · ВОЛОСЫ · КОРПУС · РУКИ",
    style: {
      fontFamily: UI_FONT,
      fontSize: 9,
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
      fontSize: 10,
      fill: 0x673b8f,
      stroke: 0xd187e8,
      chamfer: true,
      onPress: () =>
        this.setSceneMode(this.sceneMode === "bed" ? "standing" : "bed"),
    });
    this.bedToggle.node.visible = this.roomEnabled;
    this.shelfToggle = createStyledButton("К ПОЛКЕ", {
      width: 58,
      height: 34,
      fontSize: 10,
      fill: 0x673b8f,
      stroke: 0xd187e8,
      chamfer: true,
      onPress: () =>
        this.setSceneMode(this.sceneMode === "shelf" ? "standing" : "shelf"),
    });
    this.shelfToggle.node.visible = this.roomEnabled;
    this.carpetToggle = createStyledButton("НА ПОЛ", {
      width: 58,
      height: 34,
      fontSize: 10,
      fill: 0x673b8f,
      stroke: 0xd187e8,
      chamfer: true,
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
    this.romanceShop = new RomanceShop(
      (kind) => this.purchaseUpgrade(kind),
      () => this.closeShop(),
    );
    this.bottomNavigation = new BottomNavigation((section) =>
      this.showPlaceholder(section),
    );
    this.feedback = new RewardFeedback(this);
    void this.hearts.load().catch(() => {
      // Hearts are cosmetic; the game keeps running without the texture.
    });
    for (const [key, url] of [
      ["heart", iconHeartUrl],
      ["lock", iconLockUrl],
      ["gift", iconGiftUrl],
    ] as const) {
      void Assets.load<Texture>(url)
        .then((texture) => this.toastIcons.set(key, texture))
        .catch(() => {
          // Toast icons are cosmetic; text alone stays legible.
        });
    }

    this.interactionHint.anchor.set(0.5, 0);
    this.interactionHint.alpha = 0.82;
    this.interactionHint.eventMode = "none";

    this.addChild(
      this.hearts,
      this.floatingPanel,
      this.bedToggle.node,
      this.shelfToggle.node,
      this.carpetToggle.node,
      this.interactionHint,
      this.speechBubble,
      this.statusHud,
      this.bottomNavigation,
      this.romanceShop,
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
    this.updateIdleTease(elapsedMs);
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

    this.statusHud.resize(widthSafe);
    this.bottomNavigation.resize(widthSafe, heightSafe);
    this.romanceShop.resize(widthSafe, heightSafe);

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
    // After the pose layouts: the bed backdrop glues itself to the
    // laid-out BedHeroine rect, so it must run once the rect is final.
    this.layoutBackdrop();
    this.dialogue.resize(widthSafe, heightSafe);
    this.speechBubble.resize(widthSafe, heightSafe);
    this.renderState();
  }

  /** Cover-fit the approved room art and refresh the readability scrim. */
  private layoutBackdrop(): void {
    if (!this.roomEnabled) return;
    this.backdropScrim.clear();
    const texture = this.roomBackdrop.texture;
    if (texture === Texture.EMPTY || texture.width <= 1) return;
    const portrait = this.screenWidth <= this.screenHeight;
    if (this.sceneMode === "shelf") {
      // Cover-fit the WHOLE game screen (no side bars) and zoom in a
      // touch — the old contain-fit camera kept her and the shelf too
      // far away.  The upgrade card is gone from the main screen, so
      // her feet and the raised heels now anchor just above the nav.
      const scale =
        Math.max(
          this.screenWidth / texture.width,
          this.screenHeight / texture.height,
        ) * SHELF_CAMERA.zoom;
      const minX = this.screenWidth - texture.width * scale;
      const focusX = this.screenWidth / 2 - SHELF_CAMERA.focusX * scale;
      const footMargin = portrait
        ? SHELF_CAMERA.footMarginPortrait
        : SHELF_CAMERA.footMarginLandscape;
      const footY = this.screenHeight - footMargin - SHELF_ROOM.footY * scale;
      const minY = this.screenHeight - texture.height * scale;
      this.roomBackdrop.scale.set(scale);
      this.roomBackdrop.position.set(
        Math.min(0, Math.max(minX, focusX)),
        Math.min(0, Math.max(minY, footY)),
      );
    } else if (this.sceneMode === "carpet") {
      // The carpet scene cover-fits the WHOLE game screen — no side
      // bars, the floor boards run edge to edge like the standing room.
      // The horizontal crop window is centered on the lying figure (and
      // clamped to the art bounds), so she always stays fully visible;
      // the figure itself is placed small enough in the backdrop grid
      // to fit the narrowest portrait window.
      const scale = Math.max(
        this.screenWidth / texture.width,
        this.screenHeight / texture.height,
      );
      const minX = this.screenWidth - texture.width * scale;
      const focusX = this.screenWidth / 2 - CARPET_ROOM.centerX * scale;
      this.roomBackdrop.scale.set(scale);
      this.roomBackdrop.position.set(
        Math.min(0, Math.max(minX, focusX)),
        Math.min(0, (this.screenHeight - texture.height * scale) / 2),
      );
    } else if (this.sceneMode === "bed") {
      // room-lying.webp is a tall seamless extension of the bed art:
      // BED_BACKDROP.artTop rows of wall/curtains above the art window
      // and sheet rows below it, at the art's own 1152px width.  Gluing
      // the backdrop to the laid-out BedHeroine rect lets the scene run
      // edge to edge with no tone break — the former "grey bands".
      const scale =
        (BED_BACKDROP.artWidth / texture.width) * this.bedHeroine.scale.x;
      const x = this.bedHeroine.position.x;
      const y = this.bedHeroine.position.y - BED_BACKDROP.artTop * scale;
      const covered =
        x <= 0.5 &&
        y <= 0.5 &&
        x + texture.width * scale >= this.screenWidth - 0.5 &&
        y + texture.height * scale >= this.screenHeight - 0.5;
      if (covered) {
        this.roomBackdrop.scale.set(scale);
        this.roomBackdrop.position.set(x, y);
      } else {
        // Extreme viewport (very wide landscape): plain cover-fit on
        // the art window region keeps the bed centered.
        const cover = Math.max(
          this.screenWidth / texture.width,
          this.screenHeight / texture.height,
        );
        this.roomBackdrop.scale.set(cover);
        this.roomBackdrop.position.set(
          (this.screenWidth - texture.width * cover) / 2,
          (this.screenHeight - texture.height * cover) / 2,
        );
      }
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
    // J5: no dark bands, no global dim — the room runs edge to edge
    // under the transparent Liquid-Glass HUD like a premium build.
    // (backdropScrim stays cleared; drop shadows keep the text legible.)
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
    this.romanceShop.render(state);
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
    // A line spoken in the previous pose must not survive the switch.
    this.speechBubble.hide();
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
        ? "ТАП: ГОЛОВА · ЖИВОТ · НОГИ · СТУПНИ"
        : mode === "shelf"
          ? "ТАП: ГОЛОВА · ВОЛОСЫ · БЁДРА · СТУПНИ"
          : mode === "carpet"
            ? "ТАП: ГОЛОВА · ВОЛОСЫ · БЁДРА · НОЖКИ"
            : "ТАП: ГОЛОВА · ВОЛОСЫ · КОРПУС · РУКИ";
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

  /**
   * She does not like being ignored: after ~22s without a tap she
   * teases the player herself, hotter with every relationship stage.
   * Never interrupts an open line and never fires twice in a row
   * faster than the tap-speech cooldown.
   */
  private updateIdleTease(elapsedMs: number): void {
    this.idleMs += elapsedMs;
    const level = affectionProgress(this.session.state.affection).level;
    // At the hot band she gets impatient faster.
    if (this.idleMs < (poseHeatBand(level) === 2 ? 15_000 : 22_000)) return;
    this.idleMs = 0;
    const now = performance.now();
    if (now - this.lastSpokenAtMs < 12_000) return;
    if (Math.random() > 0.65) return;
    const line = pickIdleLine(level, Math.random);
    this.speechBubble.say(line, level);
    this.lastSpokenAtMs = now;
    this.liveRegion.announce(`Она говорит: ${line}`);
  }

  /**
   * Shared aftermath of every heroine tap: reward toasts, her voice
   * line (hotter with every relationship stage), milestone status and
   * accessibility announcements.
   */
  private afterHeroineTap(
    outcome: ReturnType<GameSession["tap"]>,
    zoneName: TapZone,
    pose: HeroinePose,
    globalX: number,
    globalY: number,
  ): void {
    // No floating "+5/+1" toasts: the heart burst and the counting HUD
    // are the tap feedback (the toasts doubled the heart particles and
    // cluttered the premium look).
    // The burst grows with the heat band: at the hot stages every tap
    // showers noticeably more and bigger hearts.
    const heat = poseHeatBand(outcome.nextLevel);
    this.hearts.burst(globalX, globalY, 1 + heat * 0.22, heat * 2);
    tapHaptic();
    this.idleMs = 0;
    const now = performance.now();
    if (outcome.leveledUp) {
      const stage = relationshipStage(outcome.nextLevel);
      this.showStatus(`НОВАЯ СТАДИЯ: ${stage.name.toUpperCase()}`, "heart");
      this.speechBubble.say(stage.unlockLine, outcome.nextLevel);
      this.lastSpokenAtMs = now;
      this.liveRegion.announce(
        `Новая стадия отношений: ${stage.name}. Она говорит: ${stage.unlockLine}`,
      );
    } else if (
      now - this.lastSpokenAtMs > 6_000 &&
      (this.lastSpokenAtMs === 0 || Math.random() < (heat === 2 ? 0.55 : 0.35))
    ) {
      const line = pickTapLine(outcome.nextLevel, pose, Math.random, zoneName);
      this.speechBubble.say(line, outcome.nextLevel);
      this.lastSpokenAtMs = now;
      this.liveRegion.announce(`Она говорит: ${line}`);
    }
    this.liveRegion.announce(
      `${zoneName}. Получено ${outcome.currencyDelta} монет и ${outcome.affectionDelta} симпатии.`,
    );
    this.renderState();
  }

  private onCarpetTap(
    zone: CarpetTouchZone,
    globalX: number,
    globalY: number,
  ): void {
    const outcome = this.session.tap(CARPET_ZONE_ECONOMY[zone]);
    this.afterHeroineTap(outcome, zone, "carpet", globalX, globalY);
  }

  private onShelfTap(
    zone: ShelfTouchZone,
    globalX: number,
    globalY: number,
  ): void {
    const outcome = this.session.tap(SHELF_ZONE_ECONOMY[zone]);
    this.afterHeroineTap(outcome, zone, "shelf", globalX, globalY);
  }

  private onBedTap(zone: BedTouchZone, globalX: number, globalY: number): void {
    const outcome = this.session.tap(BED_ZONE_ECONOMY[zone]);
    this.afterHeroineTap(outcome, zone, "bed", globalX, globalY);
  }

  private onHeroineTap(
    zone: HeroineTouchZone,
    localX: number,
    localY: number,
  ): void {
    const outcome = this.session.tap(zone);
    const global = this.heroine.toGlobal({ x: localX, y: localY });
    this.afterHeroineTap(outcome, zone, "classic", global.x, global.y);
    void this.saveWithNotice(false);
  }

  private purchaseUpgrade(kind: UpgradeKind): void {
    const result = this.session.buyUpgrade(kind);
    const definition = GAME_BALANCE.upgrades[kind];
    const level = affectionProgress(this.session.state.affection).level;
    const romanticName = upgradeRomanticName(kind, level);
    if (!result.purchased) {
      if (result.reason === "locked") {
        const stage =
          RELATIONSHIP_STAGES[definition.unlockStage - 1]?.name ?? "";
        this.showStatus(`«${romanticName}» · нужна стадия «${stage}»`, "lock");
        this.liveRegion.announce(
          `Улучшение ${romanticName} откроется на стадии ${stage}.`,
        );
      } else {
        this.showStatus(`Не хватает монет · нужно ${result.cost}`);
        this.liveRegion.announce(`Недостаточно монет. Нужно ${result.cost}.`);
      }
      return;
    }
    this.showStatus(`«${romanticName}» · УРОВЕНЬ ${result.newLevel}`, "gift");
    this.renderState();
    void this.saveWithNotice(false);
    this.liveRegion.announce(
      `Куплено улучшение ${romanticName}, уровень ${result.newLevel}.`,
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
    if (section === "ДОМ") {
      this.closeShop();
      this.showStatus("Главная сцена активна.");
      return;
    }
    if (section === "МАГАЗИН") {
      this.openShop();
      return;
    }
    this.showStatus(`«${section}» — скоро!`);
  }

  private openShop(): void {
    this.speechBubble.hide();
    this.romanceShop.open(this.session.state);
    this.liveRegion.announce("Открыт экран улучшений: забота о ней.");
  }

  private closeShop(): void {
    this.romanceShop.close();
  }

  private showStatus(message: string, icon?: "heart" | "lock" | "gift"): void {
    this.feedback.show(
      message,
      this.screenWidth / 2,
      this.statusToastY,
      "milestone",
      icon ? this.toastIcons.get(icon) : undefined,
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
