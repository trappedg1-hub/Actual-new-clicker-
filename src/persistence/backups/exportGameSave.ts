import type { GameState } from "../../domain/economy/types.ts";

export function serializeGameBackup(
  state: Readonly<GameState>,
  exportedAtMs = Date.now(),
): string {
  return JSON.stringify(
    { format: "anime-fanservice-clicker-save", exportedAtMs, state },
    null,
    2,
  );
}

export function downloadGameBackup(state: Readonly<GameState>): void {
  const blob = new Blob([serializeGameBackup(state)], {
    type: "application/json",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `heroine-01-save-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
