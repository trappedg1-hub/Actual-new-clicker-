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
  const host = document.getElementById("pixi-container");
  if (!host) throw new Error("Missing #pixi-container mount point.");

  registerPixiJSActionsMixin(Container);
  const app = new Application();
  await app.init({
    background: "#100b20",
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
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

  const handleVisibilityChange = (): void => {
    if (document.visibilityState === "hidden") {
      scene.setPaused(true);
      app.ticker.stop();
      void saver
        .request()
        .catch((error: unknown) =>
          console.error("Background save failed", error),
        );
      return;
    }

    if (!scene || !app.ticker) return;
    const result = session.resumeOffline(Date.now());
    scene.applyOfflineProgress(
      result.currencyAwarded,
      result.elapsedSeconds,
      result.clockMovedBackwards,
    );
    scene.setPaused(false);
    app.ticker.start();
    void saver
      .request()
      .catch((error: unknown) => console.error("Resume save failed", error));
  };
  document.addEventListener("visibilitychange", handleVisibilityChange);
  window.addEventListener("pagehide", () => {
    scene.setPaused(true);
    void saver
      .request()
      .catch((error: unknown) => console.error("Pagehide save failed", error));
  });

  // Keep references alive for the current page lifetime and make resize cleanup explicit on unload.
  window.addEventListener("pagehide", () => resizeObserver.disconnect(), {
    once: true,
  });
}
