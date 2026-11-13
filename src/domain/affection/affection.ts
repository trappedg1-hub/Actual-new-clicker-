import { GAME_BALANCE } from "../../content/upgrades/balance.ts";
import type {
  EconomyOutcome,
  GameState,
  HeroineTouchZone,
} from "../economy/types.ts";
import { addCurrency } from "../economy/economy.ts";
import { affectionProgress } from "../progression/progression.ts";
import { charmBonus, tapPowerBonus } from "../upgrades/upgrades.ts";

export function applyAffection(
  state: Readonly<GameState>,
  amount: number,
): GameState {
  const safeAmount = Number.isFinite(amount) ? Math.max(0, amount) : 0;
  return { ...state, affection: Math.max(0, state.affection + safeAmount) };
}

export function applyHeroineTap(
  state: Readonly<GameState>,
  zone: HeroineTouchZone,
): EconomyOutcome {
  const reward = GAME_BALANCE.taps[zone];
  const previousLevel = affectionProgress(state.affection).level;
  // Upgrades: "Нежные руки" adds coins to every tap, "Комплименты"
  // adds hearts to every tap.
  const currencyReward = reward.currency + tapPowerBonus(state);
  const affectionReward = Math.min(
    reward.affection + charmBonus(state),
    GAME_BALANCE.affection.perTapLimit,
  );
  const afterCurrency = addCurrency(state, currencyReward);
  const nextState = applyAffection(afterCurrency, affectionReward);
  const nextLevel = affectionProgress(nextState.affection).level;

  return {
    state: nextState,
    currencyDelta: currencyReward,
    affectionDelta: nextState.affection - state.affection,
    leveledUp: nextLevel > previousLevel,
    previousLevel,
    nextLevel,
  };
}
