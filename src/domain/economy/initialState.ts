import { GAME_BALANCE } from "../../content/upgrades/balance.ts";
import { SAVE_SCHEMA_VERSION, type GameState } from "./types.ts";
import { progressionLevelForLifetimeCurrency } from "../progression/progression.ts";

export function createInitialGameState(nowMs = Date.now()): GameState {
  const lifetimeCurrencyEarned = 0;
  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAtMs: nowMs,
    currency: 0,
    affection: 0,
    level: progressionLevelForLifetimeCurrency(lifetimeCurrencyEarned),
    lifetimeCurrencyEarned,
    upgrades: { [GAME_BALANCE.upgrade.id]: 0 },
    inkStateJson: null,
    storyFlags: {
      introCompleted: false,
      introChoice: null,
      introTranscript: "",
    },
  };
}
