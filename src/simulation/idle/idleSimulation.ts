import {
  addCurrency,
  passiveIncomePerSecond,
} from "../../domain/economy/economy.ts";
import type { GameState } from "../../domain/economy/types.ts";

export interface ActiveTickResult {
  state: GameState;
  currencyDelta: number;
  elapsedMs: number;
}

/** Advances the economy by elapsed wall-clock time, never by a frame count. */
export function advanceActiveTime(
  state: Readonly<GameState>,
  elapsedMs: number,
): ActiveTickResult {
  const safeElapsedMs = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const elapsedSeconds = safeElapsedMs / 1000;
  const currencyDelta = passiveIncomePerSecond(state) * elapsedSeconds;
  const nextState =
    currencyDelta > 0 ? addCurrency(state, currencyDelta) : { ...state };
  return {
    state: nextState,
    currencyDelta: nextState.currency - state.currency,
    elapsedMs: safeElapsedMs,
  };
}
