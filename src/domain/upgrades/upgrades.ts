import { GAME_BALANCE } from "../../content/upgrades/balance.ts";
import { addCurrency, spendCurrency } from "../economy/economy.ts";
import type { GameState } from "../economy/types.ts";
import { isIncomeUpgradeUnlocked } from "../unlocks/unlocks.ts";

export interface UpgradePurchaseResult {
  state: GameState;
  purchased: boolean;
  cost: number;
  newLevel: number;
  reason?: "insufficient-currency" | "locked";
}

export function getIncomeUpgradeLevel(state: Readonly<GameState>): number {
  return state.upgrades[GAME_BALANCE.upgrade.id] ?? 0;
}

export function getIncomeUpgradeCost(state: Readonly<GameState>): number {
  const level = getIncomeUpgradeLevel(state);
  return Math.ceil(
    GAME_BALANCE.upgrade.baseCost *
      GAME_BALANCE.upgrade.costMultiplier ** level,
  );
}

export function purchaseIncomeUpgrade(
  state: Readonly<GameState>,
): UpgradePurchaseResult {
  const cost = getIncomeUpgradeCost(state);
  if (!isIncomeUpgradeUnlocked(state)) {
    return {
      state: { ...state },
      purchased: false,
      cost,
      newLevel: getIncomeUpgradeLevel(state),
      reason: "locked",
    };
  }

  const afterSpend = spendCurrency(state, cost);
  if (!afterSpend) {
    return {
      state: { ...state },
      purchased: false,
      cost,
      newLevel: getIncomeUpgradeLevel(state),
      reason: "insufficient-currency",
    };
  }

  const nextLevel = getIncomeUpgradeLevel(state) + 1;
  return {
    state: {
      ...afterSpend,
      upgrades: {
        ...afterSpend.upgrades,
        [GAME_BALANCE.upgrade.id]: nextLevel,
      },
    },
    purchased: true,
    cost,
    newLevel: nextLevel,
  };
}

export function awardCurrency(
  state: Readonly<GameState>,
  amount: number,
): GameState {
  return addCurrency(state, amount);
}
