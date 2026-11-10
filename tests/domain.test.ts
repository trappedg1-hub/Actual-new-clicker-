import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGameState } from "../src/domain/economy/initialState.ts";
import { applyHeroineTap } from "../src/domain/affection/affection.ts";
import { advanceActiveTime } from "../src/simulation/idle/idleSimulation.ts";
import { calculateOfflineProgress } from "../src/simulation/offline/offlineSimulation.ts";
import {
  getIncomeUpgradeCost,
  purchaseIncomeUpgrade,
} from "../src/domain/upgrades/upgrades.ts";
import { affectionProgress } from "../src/domain/progression/progression.ts";
import { migrateSave } from "../src/persistence/migrations/migrateSave.ts";

test("tap adds separate currency and affection, and advances lifetime level", () => {
  const initial = createInitialGameState(1_000);
  const result = applyHeroineTap(initial, "head");

  assert.equal(result.state.currency, 5);
  assert.equal(result.state.affection, 1);
  assert.equal(result.state.lifetimeCurrencyEarned, 5);
  assert.equal(result.state.level, 1);
  assert.notEqual(result.state.currency, result.state.affection);
});

test("active idle simulation depends on elapsed time, not the number of frames", () => {
  const initial = createInitialGameState(0);
  let sixtySteps = initial;
  for (let index = 0; index < 60; index += 1) {
    sixtySteps = advanceActiveTime(sixtySteps, 1000 / 60).state;
  }
  const oneStep = advanceActiveTime(initial, 1_000).state;

  assert.ok(Math.abs(sixtySteps.currency - oneStep.currency) < 1e-9);
  assert.ok(
    Math.abs(
      sixtySteps.lifetimeCurrencyEarned - oneStep.lifetimeCurrencyEarned,
    ) < 1e-9,
  );
});

test("offline reward is capped and cannot be claimed twice for the same timestamp", () => {
  const initial = createInitialGameState(1_000);
  const first = calculateOfflineProgress(initial, 1_000 + 20 * 60 * 60 * 1_000);
  assert.equal(first.elapsedSeconds, 8 * 60 * 60);
  assert.equal(first.currencyAwarded, 0.25 * 8 * 60 * 60);

  const second = calculateOfflineProgress(
    first.state,
    1_000 + 20 * 60 * 60 * 1_000,
  );
  assert.equal(second.elapsedSeconds, 0);
  assert.equal(second.currencyAwarded, 0);
});

test("clock rollback grants no income until the wall clock catches up to the saved high-water mark", () => {
  const initial = createInitialGameState(10_000);
  const result = calculateOfflineProgress(initial, 5_000);
  assert.equal(result.clockMovedBackwards, true);
  assert.equal(result.elapsedSeconds, 0);
  assert.equal(result.state.savedAtMs, 10_000);
  assert.equal(result.currencyAwarded, 0);

  const stillBehind = calculateOfflineProgress(result.state, 8_000);
  assert.equal(stillBehind.elapsedSeconds, 0);
  assert.equal(stillBehind.state.savedAtMs, 10_000);

  const caughtUp = calculateOfflineProgress(stillBehind.state, 11_000);
  assert.equal(caughtUp.elapsedSeconds, 1);
});

test("upgrade purchase enforces affordability and increases income level", () => {
  const initial = createInitialGameState(0);
  assert.equal(getIncomeUpgradeCost(initial), 20);
  assert.equal(purchaseIncomeUpgrade(initial).purchased, false);

  const funded = { ...initial, currency: 20, lifetimeCurrencyEarned: 20 };
  const locked = purchaseIncomeUpgrade({ ...funded, level: 0 });
  assert.equal(locked.purchased, false);
  assert.equal(locked.reason, "locked");

  const purchase = purchaseIncomeUpgrade(funded);
  assert.equal(purchase.purchased, true);
  assert.equal(purchase.state.currency, 0);
  assert.equal(purchase.newLevel, 1);
  assert.equal(getIncomeUpgradeCost(purchase.state), 32);
});

test("affection tiers and save migration are derived from persisted source values", () => {
  assert.deepEqual(affectionProgress(10), {
    level: 2,
    progress: 0,
    currentThreshold: 10,
    nextThreshold: 30,
  });

  const migrated = migrateSave(
    {
      schemaVersion: 1,
      savedAtMs: 5,
      currency: 23,
      affection: 11,
      lifetimeCurrencyEarned: 52,
      upgrades: { "warm-lantern": 1 },
      inkStateJson: null,
      storyFlags: { introCompleted: false, introChoice: null },
    },
    100,
  );
  assert.equal(migrated.level, 2);
  assert.equal(migrated.storyFlags.introTranscript, "");
});
