import { bootstrapGame } from "./app/bootstrap/bootstrap.ts";

void bootstrapGame().catch((error: unknown) => {
  console.error("Vertical slice startup failed", error);
  const liveRegion = document.getElementById("live-status");
  if (liveRegion) {
    liveRegion.textContent =
      error instanceof Error
        ? `Не удалось запустить прототип: ${error.message}`
        : "Не удалось запустить прототип.";
  }
  const host = document.getElementById("pixi-container");
  if (host) {
    const message = document.createElement("p");
    message.textContent =
      "Не удалось запустить PixiJS. Откройте консоль браузера для диагностики.";
    message.style.cssText =
      "padding:24px;color:#fff;background:#100b20;font:16px Arial,sans-serif";
    host.appendChild(message);
  }
});
