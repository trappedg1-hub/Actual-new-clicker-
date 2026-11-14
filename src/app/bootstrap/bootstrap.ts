import "@fontsource/nunito/600.css";
import "@fontsource/nunito/700.css";
import "@fontsource/nunito/800.css";
import "@pixi/layout";
import { Action, registerPixiJSActionsMixin } from "pixijs-actions";
import { Application, Container } from "pixi.js";
import { createInitialGameState } from "../../domain/economy/initialState.ts";
import { GameRepository } from "../../persistence/indexeddb/GameRepository.ts";
import { SaveCoordinator } from "../../persistence/SaveCoordinator.ts";
import { GameSession } from "../GameSession.ts";
import { advanceFrame, resizeRendererAndScene } from "../frameLoop.ts";
import { MainScene } from "../scenes/MainScene.ts";

function announceBootError(message: string): void {
  const liveRegion = document.getElementById("live-status");
  if (liveRegion) liveRegion.textContent = message;
  console.error(message);
}

export async function bootstrapGame(): Promise<void> {
  // PIXI rasterizes Text into canvas textures at construction time, so
  // the UI font must be resident BEFORE the first scene builds.  The
  // race keeps startup fast if the font cache is cold or offline.
  try {
    await Promise.race([
      Promise.all([
        document.fonts.load("600 14px Nunito"),
        document.fonts.load("700 14px Nunito"),
        document.fonts.load("800 14px Nunito"),
      ]),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch {
    // Arial fallback still renders every label.
  }
  const host = document.getElementById("pixi-container");
  if (!host) throw new Error("Missing #pixi-container mount point.");
  const qaWindow = window as unknown as {
    __pixiApp?: Application;
    __heroineRig?: unknown;
    __qaScene?: unknown;
    __qaFreezeTicker?: boolean;
  };

  registerPixiJSActionsMixin(Container);
  const app = new Application();
  await app.init({
    background: "#100b20",
    antialias: true,
    autoDensity: true,
    // iPhone renders at devicePixelRatio 3. Capping the backing store below 3
    // forced the browser to stretch the canvas, which broke the thin
    // dark line-art into visible black dots. Render at native density instead.
    resolution: Math.min(window.devicePixelRatio || 1, 3),
    // Do not snap rotated/mesh-warped vertices to whole physical pixels.  The
    // old global snap made the approved one-pixel cut-out contours jump between
    // sampling grids on iPhone DPR3, breaking them into dots and duplicate
    // edges.  Native resolution + straight-alpha padded textures + subpixel
    // transforms keep one continuous contour while the limbs actually move.
    roundPixels: false,
    resizeTo: host,
    preference: "webgl",
  });
  host.appendChild(app.canvas);
  app.canvas.setAttribute("role", "application");
  app.canvas.setAttribute(
    "aria-label",
    "Anime Fanservice Clicker — HEROINE-01 vertical slice",
  );
  app.canvas.tabIndex = 0;

  // Pixi Actions is advanced on this application ticker; it pauses with the renderer when hidden.
  //
  // Animations keep using the clamped `deltaMS` (a huge jump must not teleport the rig),
  // while the economy gets the raw `elapsedMS` further down. Both callbacks share the same
  // ticker so a slow frame cannot be counted twice.
  app.ticker.add((ticker) => Action.tick(ticker.deltaMS));

  const repository = new GameRepository();
  const initialNow = Date.now();
  let loadIssue: string | null = null;
  let recoveredInvalidSave = false;
  let loadedState = null;

  try {
    const result = await repository.load(initialNow);
    loadedState = result.state;
    recoveredInvalidSave = result.recoveredFromInvalidSave;
  } catch (error) {
    loadIssue =
      error instanceof Error ? error.message : "IndexedDB could not be opened.";
  }

  const session = new GameSession(
    loadedState ?? createInitialGameState(initialNow),
  );
  const offlineResult = session.resumeOffline(initialNow);
  const saver = new SaveCoordinator(repository, session);
  const scene = new MainScene(session, { save: () => saver.request() });
  app.stage.addChild(scene);

  // `ResizeObserver` reports the host's CSS size, but `app.screen` only follows it once the
  // renderer itself has been resized. Resizing the scene alone left the canvas at the old
  // height on devices with a safe area, pushing the bottom UI under the home indicator.
  const resizeScene = (): void => {
    resizeRendererAndScene(app, scene);
  };
  resizeScene();
  const resizeObserver = new ResizeObserver(resizeScene);
  resizeObserver.observe(host);

  // The economy is advanced by real elapsed time, not by frame count. `ticker.deltaMS` is
  // clamped to 100 ms (minFPS 10), so at 4 FPS ~64% of the passive income was lost.
  let frameNowMs = Date.now();
  app.ticker.add((ticker) => {
    const frame = advanceFrame(ticker, frameNowMs, false);
    frameNowMs = frame.nowMs;
    if (!frame.skipped) scene.update(frame.elapsedMs);
  });

  if (loadIssue) {
    scene.applyOfflineProgress(0, 0, false);
    announceBootError(
      `IndexedDB недоступна: ${loadIssue}. Игра работает только в памяти; сохранение не гарантируется.`,
    );
  } else {
    if (recoveredInvalidSave) {
      scene.applyOfflineProgress(0, 0, false);
      announceBootError(
        "Повреждённая или несовместимая запись сохранена в резервной копии IndexedDB; начат новый слот.",
      );
    } else {
      scene.applyOfflineProgress(
        loadedState ? offlineResult.currencyAwarded : 0,
        offlineResult.elapsedSeconds,
        offlineResult.clockMovedBackwards,
      );
    }
    void saver.request().catch((error: unknown) => {
      console.error("Initial IndexedDB save failed", error);
      announceBootError(
        "Не удалось записать начальное сохранение в IndexedDB.",
      );
    });
  }

  // Safari/WebKit can fire pagehide or a WebKit visibility event without a
  // subsequent standard visibilitychange.  The old one-way pause left both the
  // scene and the PixiJS ticker stopped after a bfcache return, which made the
  // heroine look frozen on a real iPhone.  All wake-up paths now converge on
  // one idempotent resume; offline progress is applied at most once per
  // actual background interval.
  let backgroundedAtMs: number | null = null;

  const saveInBackground = (): void => {
    void saver
      .request()
      .catch((error: unknown) =>
        console.error("Background save failed", error),
      );
  };

  const pauseForBackground = (): void => {
    backgroundedAtMs ??= Date.now();
    scene.setPaused(true);
    app.ticker.stop();
    saveInBackground();
  };

  const resumeFromBackground = (): void => {
    if (document.visibilityState === "hidden") return;
    if (backgroundedAtMs !== null) {
      const result = session.resumeOffline(Date.now());
      scene.applyOfflineProgress(
        result.currencyAwarded,
        result.elapsedSeconds,
        result.clockMovedBackwards,
      );
      backgroundedAtMs = null;
      void saver
        .request()
        .catch((error: unknown) => console.error("Resume save failed", error));
    }
    scene.setPaused(false);
    if (!app.ticker.started) app.ticker.start();
  };

  const handleVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") pauseForBackground();
    else resumeFromBackground();
  };
  document.addEventListener("visibilitychange", handleVisibilityChange);
  document.addEventListener(
    "webkitvisibilitychange",
    handleVisibilityChange as EventListener,
  );
  window.addEventListener("pagehide", pauseForBackground);
  window.addEventListener("pageshow", resumeFromBackground);
  window.addEventListener("focus", resumeFromBackground);
  window.addEventListener("pointerdown", resumeFromBackground, {
    passive: true,
  });

  // Last-resort watchdog: if a WebKit lifecycle quirk stops the ticker while
  // the page is visible, restart it on the next animation frame.  It never
  // advances the economy or the pose itself, so no frame is double-counted.
  const checkTickerLiveness = (): void => {
    if (
      document.visibilityState !== "hidden" &&
      !qaWindow.__qaFreezeTicker &&
      !app.ticker.started
    ) {
      scene.setPaused(false);
      app.ticker.start();
    }
    window.requestAnimationFrame(checkTickerLiveness);
  };
  window.requestAnimationFrame(checkTickerLiveness);

  // A bfcache `pagehide` is not an unload; disconnecting the observer there
  // would leave the restored page with stale layout on iPhone Safari.
  window.addEventListener("pagehide", (event) => {
    if (!(event as PageTransitionEvent).persisted) {
      resizeObserver.disconnect();
    }
  });

  // Dev-only QA bridge. Vite tree-shakes this block from the Preview build;
  // it exposes no runtime handle in production and changes no game behaviour.
  if (import.meta.env.DEV && new URLSearchParams(location.search).has("qa")) {
    qaWindow.__pixiApp = app;
    qaWindow.__heroineRig = (scene as unknown as { heroine: unknown }).heroine;
    qaWindow.__qaScene = scene;
    qaWindow.__qaFreezeTicker = false;
  }
}
