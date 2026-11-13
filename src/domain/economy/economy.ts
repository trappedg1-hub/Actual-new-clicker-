import { GAME_BALANCE } from "../../content/upgrades/balance.ts";
import type { GameState } from "./types.ts";
import { progressionLevelForLifetimeCurrency } from "../progression/progression.ts";

export function passiveIncomePerSecond(state: Readonly<GameState>): number {
  const upgradeLevel = state.upgrades[GAME_BALANCE.upgrades.income.id] ?? 0;
  return (
    GAME_BALANCE.passiveIncome.basePerSecond +
    upgradeLevel * GAME_BALANCE.passiveIncome.perUpgradeLevel
  );
}

export function addCurrency(
  state: Readonly<GameState>,
  amount: number,
): GameState {
  const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  if (safeAmount === 0) return { ...state };

  // Keep full precision here; rounding every frame would make passive income depend on FPS.
  const currency = state.currency + safeAmount;
  const lifetimeCurrencyEarned = state.lifetimeCurrencyEarned + safeAmount;
  return {
    ...state,
    currency,
    lifetimeCurrencyEarned,
    level: progressionLevelForLifetimeCurrency(lifetimeCurrencyEarned),
  };
}

export function spendCurrency(
  state: Readonly<GameState>,
  amount: number,
): GameState | null {
  if (
    !Number.isFinite(amount) ||
    amount < 0 ||
    state.currency + Number.EPSILON < amount
  ) {
    return null;
  }
  return {
    ...state,
    currency: roundCurrency(Math.max(0, state.currency - amount)),
  };
}

export function roundCurrency(value: number): number {
  return Math.round(value * 1000) / 1000;
}
