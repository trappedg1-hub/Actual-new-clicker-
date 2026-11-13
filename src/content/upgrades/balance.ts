import type { HeroineTouchZone } from "../../domain/economy/types.ts";

export type UpgradeKind = "tap" | "income" | "charm";

export interface UpgradeDefinition {
  id: string;
  name: string;
  /** Short HUD label that fits a compact buy button. */
  shortName: string;
  description: string;
  baseCost: number;
  costMultiplier: number;
  /**
   * Relationship stage (1-based affection level) that reveals this
   * upgrade: deeper upgrades appear as she warms up to the player.
   */
  unlockStage: number;
}

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
  /** Extra coins every tap earns per level of the tap upgrade. */
  tapPower: {
    perUpgradeLevel: 2,
  },
  /** Extra hearts every tap earns per level of the charm upgrade. */
  charm: {
    perUpgradeLevel: 1,
  },
  upgrades: {
    tap: {
      id: "gentle-hands",
      name: "Нежные руки",
      shortName: "ТАП",
      description: "+2 монеты к каждому тапу",
      baseCost: 15,
      costMultiplier: 1.55,
      unlockStage: 1,
    },
    income: {
      id: "warm-lantern",
      name: "Тёплый фонарь",
      shortName: "ДОХОД",
      description: "+0.75 монет в секунду",
      baseCost: 20,
      costMultiplier: 1.6,
      unlockStage: 2,
    },
    charm: {
      id: "sweet-words",
      name: "Комплименты",
      shortName: "ШАРМ",
      description: "+1 сердечко к каждому тапу",
      baseCost: 40,
      costMultiplier: 1.75,
      unlockStage: 4,
    },
  } satisfies Record<UpgradeKind, UpgradeDefinition>,
  affection: {
    /**
     * Hearts thresholds of the ten relationship stages (stage 1 starts
     * at 0): one entry fewer than the stages in RELATIONSHIP_STAGES.
     */
    thresholds: [15, 40, 90, 180, 340, 620, 1_100, 1_900, 3_200],
    perTapLimit: 25,
  },
  progression: {
    lifetimeCurrencyThresholds: [50, 150, 350],
  },
  unlocks: {
    introLevel: 1,
  },
  offline: {
    maxSeconds: 8 * 60 * 60,
  },
} as const;

export const UPGRADE_KINDS: readonly UpgradeKind[] = [
  "tap",
  "income",
  "charm",
] as const;
