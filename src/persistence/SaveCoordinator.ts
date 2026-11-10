import type { GameRepository } from "./indexeddb/GameRepository.ts";
import type { GameState } from "../domain/economy/types.ts";
import type { GameSession } from "../app/GameSession.ts";

/** Serializes save requests so a slow IndexedDB transaction cannot overwrite newer game state. */
export class SaveCoordinator {
  private pending = false;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly repository: GameRepository,
    private readonly session: GameSession,
    private readonly onSaved?: (state: GameState) => void,
  ) {}

  request(): Promise<void> {
    this.pending = true;
    if (!this.inFlight) {
      this.inFlight = this.drain().finally(() => {
        this.inFlight = null;
        if (this.pending) void this.request();
      });
    }
    return this.inFlight;
  }

  private async drain(): Promise<void> {
    while (this.pending) {
      this.pending = false;
      const snapshot = this.session.stampSavedAt(Date.now());
      await this.repository.save(snapshot);
      this.onSaved?.(snapshot);
    }
  }
}
