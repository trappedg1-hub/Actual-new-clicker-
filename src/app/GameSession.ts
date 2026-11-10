import {
  applyAffection,
  applyHeroineTap,
} from "../domain/affection/affection.ts";
import type {
  EconomyOutcome,
  GameState,
  HeroineTouchZone,
} from "../domain/economy/types.ts";
import {
  affectionProgress,
  progressionLevelForLifetimeCurrency,
} from "../domain/progression/progression.ts";
import {
  purchaseIncomeUpgrade,
  type UpgradePurchaseResult,
} from "../domain/upgrades/upgrades.ts";
import {
  advanceActiveTime,
  type ActiveTickResult,
} from "../simulation/idle/idleSimulation.ts";
import {
  calculateOfflineProgress,
  type OfflineProgressResult,
} from "../simulation/offline/offlineSimulation.ts";

export class GameSession {
  private currentState: GameState;

  constructor(initialState: GameState) {
    this.currentState = initialState;
  }

  get state(): Readonly<GameState> {
    return this.currentState;
  }

  tap(zone: HeroineTouchZone): EconomyOutcome {
    const outcome = applyHeroineTap(this.currentState, zone);
    this.currentState = outcome.state;
    return outcome;
  }

  tick(elapsedMs: number): ActiveTickResult {
    const result = advanceActiveTime(this.currentState, elapsedMs);
    this.currentState = result.state;
    return result;
  }

  buyIncomeUpgrade(): UpgradePurchaseResult {
    const result = purchaseIncomeUpgrade(this.currentState);
    if (result.purchased) this.currentState = result.state;
    return result;
  }

  resumeOffline(nowMs: number): OfflineProgressResult {
    const result = calculateOfflineProgress(this.currentState, nowMs);
    this.currentState = result.state;
    return result;
  }

  saveInkCheckpoint(stateJson: string, transcript: string): void {
    this.currentState = {
      ...this.currentState,
      inkStateJson: stateJson,
      storyFlags: {
        ...this.currentState.storyFlags,
        introTranscript: transcript,
      },
    };
  }

  completeIntroChoice(
    stateJson: string,
    transcript: string,
    responseId: string,
    affectionDelta: number,
  ): {
    leveledUp: boolean;
    previousAffectionLevel: number;
    nextAffectionLevel: number;
  } {
    const previousAffectionLevel = affectionProgress(
      this.currentState.affection,
    ).level;
    if (this.currentState.storyFlags.introCompleted) {
      this.saveInkCheckpoint(stateJson, transcript);
      return {
        leveledUp: false,
        previousAffectionLevel,
        nextAffectionLevel: previousAffectionLevel,
      };
    }

    const nextAffection = applyAffection(this.currentState, affectionDelta);
    const nextAffectionLevel = affectionProgress(nextAffection.affection).level;
    this.currentState = {
      ...nextAffection,
      level: progressionLevelForLifetimeCurrency(
        nextAffection.lifetimeCurrencyEarned,
      ),
      inkStateJson: stateJson,
      storyFlags: {
        introCompleted: true,
        introChoice: responseId,
        introTranscript: transcript,
      },
    };
    return {
      leveledUp: nextAffectionLevel > previousAffectionLevel,
      previousAffectionLevel,
      nextAffectionLevel,
    };
  }

  stampSavedAt(nowMs: number): GameState {
    const safeNow = Number.isFinite(nowMs) ? nowMs : Date.now();
    this.currentState = {
      ...this.currentState,
      // Preserve a future timestamp if the device clock moved backwards.
      savedAtMs: Math.max(this.currentState.savedAtMs, safeNow),
    };
    return this.currentState;
  }

  replaceState(state: GameState): void {
    this.currentState = state;
  }
}
