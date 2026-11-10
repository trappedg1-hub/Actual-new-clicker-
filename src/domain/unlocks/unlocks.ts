import { GAME_BALANCE } from "../../content/upgrades/balance.ts";
import type { GameState } from "../economy/types.ts";

/** Keep unlock requirements out of Pixi event and rendering handlers. */
export function isIntroDialogueUnlocked(state: Readonly<GameState>): boolean {
  return state.level >= GAME_BALANCE.unlocks.introLevel;
}

export function isIncomeUpgradeUnlocked(state: Readonly<GameState>): boolean {
  return state.level >= GAME_BALANCE.unlocks.incomeUpgradeLevel;
}
