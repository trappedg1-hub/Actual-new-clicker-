import { GAME_BALANCE } from "../../content/upgrades/balance.ts";
import {
  addCurrency,
  passiveIncomePerSecond,
} from "../../domain/economy/economy.ts";
import type { GameState } from "../../domain/economy/types.ts";

export interface OfflineProgressResult {
  state: GameState;
  elapsedSeconds: number;
  currencyAwarded: number;
  clockMovedBackwards: boolean;
}

export function calculateOfflineProgress(
  state: Readonly<GameState>,
  nowMs: number,
  maxOfflineSeconds = GAME_BALANCE.offline.maxSeconds,
): OfflineProgressResult {
  const safeNow = Number.isFinite(nowMs) ? nowMs : state.savedAtMs;
  const rawElapsedMs = safeNow - state.savedAtMs;
  const clockMovedBackwards = rawElapsedMs < 0;
  const capMs = Math.max(0, maxOfflineSeconds) * 1000;
  const elapsedMs = Math.min(Math.max(0, rawElapsedMs), capMs);
  const elapsedSeconds = elapsedMs / 1000;
  const currencyAwarded = passiveIncomePerSecond(state) * elapsedSeconds;
  const withIncome =
    currencyAwarded > 0 ? addCurrency(state, currencyAwarded) : { ...state };

  return {
    state: { ...withIncome, savedAtMs: Math.max(state.savedAtMs, safeNow) },
    elapsedSeconds,
    currencyAwarded: withIncome.currency - state.currency,
    clockMovedBackwards,
  };
}
