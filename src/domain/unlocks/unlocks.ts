import {
  GAME_BALANCE,
  type UpgradeKind,
} from "../../content/upgrades/balance.ts";
import type { GameState } from "../economy/types.ts";
import { affectionProgress } from "../progression/progression.ts";

/** Keep unlock requirements out of Pixi event and rendering handlers. */
export function isIntroDialogueUnlocked(state: Readonly<GameState>): boolean {
  return state.level >= GAME_BALANCE.unlocks.introLevel;
}

/**
 * Upgrades are gated by the relationship ladder, not by money: deeper
 * upgrades appear only once she has warmed up to the player.
 */
export function isUpgradeUnlocked(
  state: Readonly<GameState>,
  kind: UpgradeKind,
): boolean {
  return (
    affectionProgress(state.affection).level >=
    GAME_BALANCE.upgrades[kind].unlockStage
  );
}
