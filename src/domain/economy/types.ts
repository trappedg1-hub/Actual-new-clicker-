export const SAVE_SCHEMA_VERSION = 1 as const;

export type HeroineTouchZone = "head" | "hair" | "body" | "arms";

export interface StoryFlags {
  introCompleted: boolean;
  introChoice: string | null;
  introTranscript: string;
}

export interface GameState {
  schemaVersion: typeof SAVE_SCHEMA_VERSION;
  savedAtMs: number;
  currency: number;
  affection: number;
  level: number;
  lifetimeCurrencyEarned: number;
  upgrades: Record<string, number>;
  inkStateJson: string | null;
  storyFlags: StoryFlags;
}

export interface EconomyOutcome {
  state: GameState;
  currencyDelta: number;
  affectionDelta: number;
  leveledUp: boolean;
  previousLevel: number;
  nextLevel: number;
}
