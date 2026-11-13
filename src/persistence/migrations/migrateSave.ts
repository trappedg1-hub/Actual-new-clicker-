import { GAME_BALANCE } from "../../content/upgrades/balance.ts";
import { progressionLevelForLifetimeCurrency } from "../../domain/progression/progression.ts";
import {
  SAVE_SCHEMA_VERSION,
  type GameState,
} from "../../domain/economy/types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNonNegative(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, value)
    : fallback;
}

function safeInteger(value: unknown, fallback = 0): number {
  return Math.max(0, Math.floor(finiteNonNegative(value, fallback)));
}

/** Central save-schema boundary. Add version-to-version migrations here before changing SAVE_SCHEMA_VERSION. */
export function migrateSave(raw: unknown, nowMs = Date.now()): GameState {
  if (!isRecord(raw)) {
    throw new Error("Save record is not an object.");
  }
  if (raw.schemaVersion !== SAVE_SCHEMA_VERSION) {
    throw new Error(
      `Unsupported save schema version: ${String(raw.schemaVersion)}.`,
    );
  }

  const currency = finiteNonNegative(raw.currency);
  const affection = finiteNonNegative(raw.affection);
  const lifetimeCurrencyEarned = finiteNonNegative(raw.lifetimeCurrencyEarned);
  const rawUpgrades = isRecord(raw.upgrades) ? raw.upgrades : {};
  const rawFlags = isRecord(raw.storyFlags) ? raw.storyFlags : {};
  const rawChoice = rawFlags.introChoice;

  return {
    schemaVersion: SAVE_SCHEMA_VERSION,
    savedAtMs: finiteNonNegative(raw.savedAtMs, nowMs),
    currency,
    affection,
    level: progressionLevelForLifetimeCurrency(lifetimeCurrencyEarned),
    lifetimeCurrencyEarned,
    upgrades: {
      [GAME_BALANCE.upgrades.tap.id]: safeInteger(
        rawUpgrades[GAME_BALANCE.upgrades.tap.id],
      ),
      [GAME_BALANCE.upgrades.income.id]: safeInteger(
        rawUpgrades[GAME_BALANCE.upgrades.income.id],
      ),
      [GAME_BALANCE.upgrades.charm.id]: safeInteger(
        rawUpgrades[GAME_BALANCE.upgrades.charm.id],
      ),
    },
    inkStateJson:
      typeof raw.inkStateJson === "string" ? raw.inkStateJson : null,
    storyFlags: {
      introCompleted: rawFlags.introCompleted === true,
      introChoice: typeof rawChoice === "string" ? rawChoice : null,
      introTranscript:
        typeof rawFlags.introTranscript === "string"
          ? rawFlags.introTranscript
          : "",
    },
  };
}
