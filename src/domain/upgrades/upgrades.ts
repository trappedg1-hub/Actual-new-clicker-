import {
  GAME_BALANCE,
  type UpgradeKind,
} from "../../content/upgrades/balance.ts";
import { addCurrency, spendCurrency } from "../economy/economy.ts";
import type { GameState } from "../economy/types.ts";
import { isUpgradeUnlocked } from "../unlocks/unlocks.ts";

export interface UpgradePurchaseResult {
  state: GameState;
  purchased: boolean;
  cost: number;
  newLevel: number;
  reason?: "insufficient-currency" | "locked";
}

export function getUpgradeLevel(
  state: Readonly<GameState>,
  kind: UpgradeKind,
): number {
  return state.upgrades[GAME_BALANCE.upgrades[kind].id] ?? 0;
}

export function getUpgradeCost(
  state: Readonly<GameState>,
  kind: UpgradeKind,
): number {
  const definition = GAME_BALANCE.upgrades[kind];
  const level = getUpgradeLevel(state, kind);
  return Math.ceil(definition.baseCost * definition.costMultiplier ** level);
}

export function purchaseUpgrade(
  state: Readonly<GameState>,
  kind: UpgradeKind,
): UpgradePurchaseResult {
  const definition = GAME_BALANCE.upgrades[kind];
  const cost = getUpgradeCost(state, kind);
  if (!isUpgradeUnlocked(state, kind)) {
    return {
      state: { ...state },
      purchased: false,
      cost,
      newLevel: getUpgradeLevel(state, kind),
      reason: "locked",
    };
  }

  const afterSpend = spendCurrency(state, cost);
  if (!afterSpend) {
    return {
      state: { ...state },
      purchased: false,
      cost,
      newLevel: getUpgradeLevel(state, kind),
      reason: "insufficient-currency",
    };
  }

  const nextLevel = getUpgradeLevel(state, kind) + 1;
  return {
    state: {
      ...afterSpend,
      upgrades: {
        ...afterSpend.upgrades,
        [definition.id]: nextLevel,
      },
    },
    purchased: true,
    cost,
    newLevel: nextLevel,
  };
}

/** Extra coins each tap earns from the tap upgrade. */
export function tapPowerBonus(state: Readonly<GameState>): number {
  return (
    getUpgradeLevel(state, "tap") * GAME_BALANCE.tapPower.perUpgradeLevel
  );
}

/** Extra hearts each tap earns from the charm upgrade. */
export function charmBonus(state: Readonly<GameState>): number {
  return getUpgradeLevel(state, "charm") * GAME_BALANCE.charm.perUpgradeLevel;
}

// ---- Legacy single-upgrade helpers (income), kept for existing callers ----

export function getIncomeUpgradeLevel(state: Readonly<GameState>): number {
  return getUpgradeLevel(state, "income");
}

export function getIncomeUpgradeCost(state: Readonly<GameState>): number {
  return getUpgradeCost(state, "income");
}

export function purchaseIncomeUpgrade(
  state: Readonly<GameState>,
): UpgradePurchaseResult {
  return purchaseUpgrade(state, "income");
}

export function awardCurrency(
  state: Readonly<GameState>,
  amount: number,
): GameState {
  return addCurrency(state, amount);
}
