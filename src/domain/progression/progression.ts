import { GAME_BALANCE } from "../../content/upgrades/balance.ts";

export function progressionLevelForLifetimeCurrency(
  lifetimeCurrencyEarned: number,
): number {
  return (
    1 +
    GAME_BALANCE.progression.lifetimeCurrencyThresholds.filter(
      (threshold) => lifetimeCurrencyEarned >= threshold,
    ).length
  );
}

export interface AffectionProgress {
  level: number;
  progress: number;
  currentThreshold: number;
  nextThreshold: number | null;
}

export function affectionProgress(affection: number): AffectionProgress {
  const thresholds = GAME_BALANCE.affection.thresholds;
  const level =
    1 + thresholds.filter((threshold) => affection >= threshold).length;
  const previousThreshold = level <= 1 ? 0 : (thresholds[level - 2] ?? 0);
  const nextThreshold = thresholds[level - 1] ?? null;

  if (nextThreshold === null) {
    return {
      level,
      progress: 1,
      currentThreshold: previousThreshold,
      nextThreshold: null,
    };
  }

  const interval = Math.max(1, nextThreshold - previousThreshold);
  const progress = Math.max(
    0,
    Math.min(1, (affection - previousThreshold) / interval),
  );
  return {
    level,
    progress,
    currentThreshold: previousThreshold,
    nextThreshold,
  };
}
