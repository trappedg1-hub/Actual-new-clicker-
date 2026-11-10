import type { HeroineTouchZone } from "../../domain/economy/types.ts";

export const GAME_BALANCE = {
  taps: {
    head: { currency: 5, affection: 1 },
    hair: { currency: 4, affection: 1 },
    body: { currency: 5, affection: 1 },
    arms: { currency: 3, affection: 1 },
  } satisfies Record<HeroineTouchZone, { currency: number; affection: number }>,
  passiveIncome: {
    basePerSecond: 0.25,
    perUpgradeLevel: 0.75,
  },
  upgrade: {
    id: "warm-lantern",
    name: "Тёплый фонарь",
    description: "Увеличивает пассивный доход.",
    baseCost: 20,
    costMultiplier: 1.6,
  },
  affection: {
    thresholds: [10, 30, 60],
    perTapLimit: 1,
  },
  progression: {
    lifetimeCurrencyThresholds: [50, 150, 350],
  },
  unlocks: {
    introLevel: 1,
    incomeUpgradeLevel: 1,
  },
  offline: {
    maxSeconds: 8 * 60 * 60,
  },
} as const;
