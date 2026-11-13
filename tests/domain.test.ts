import assert from "node:assert/strict";
import test from "node:test";
import { createInitialGameState } from "../src/domain/economy/initialState.ts";
import { applyHeroineTap } from "../src/domain/affection/affection.ts";
import { advanceActiveTime } from "../src/simulation/idle/idleSimulation.ts";
import { calculateOfflineProgress } from "../src/simulation/offline/offlineSimulation.ts";
import {
  getIncomeUpgradeCost,
  purchaseIncomeUpgrade,
  purchaseUpgrade,
} from "../src/domain/upgrades/upgrades.ts";
import { affectionProgress } from "../src/domain/progression/progression.ts";
import { migrateSave } from "../src/persistence/migrations/migrateSave.ts";
import { GAME_BALANCE } from "../src/content/upgrades/balance.ts";
import {
  pickTapLine,
  POSE_TAP_LINES,
  RELATIONSHIP_STAGES,
  relationshipLadderIsConsistent,
  upgradeRomanticName,
  relationshipStage,
} from "../src/content/relationship/relationship.ts";

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

test("upgrade purchase enforces affordability and relationship unlock stages", () => {
  const initial = createInitialGameState(0);
  assert.equal(getIncomeUpgradeCost(initial), 20);
  assert.equal(purchaseIncomeUpgrade(initial).purchased, false);

  // The income upgrade appears at relationship stage 2 — with zero
  // hearts it stays locked even with money in hand.
  const funded = { ...initial, currency: 20, lifetimeCurrencyEarned: 20 };
  const locked = purchaseIncomeUpgrade(funded);
  assert.equal(locked.purchased, false);
  assert.equal(locked.reason, "locked");

  const warmed = { ...funded, affection: 15 };
  const purchase = purchaseIncomeUpgrade(warmed);
  assert.equal(purchase.purchased, true);
  assert.equal(purchase.state.currency, 0);
  assert.equal(purchase.newLevel, 1);
  assert.equal(getIncomeUpgradeCost(purchase.state), 32);
});

test("tap and charm upgrades boost every tap once bought", () => {
  const initial = createInitialGameState(0);
  // Tap upgrade is available from stage 1; charm needs stage 4 (90💗).
  const rich = { ...initial, currency: 10_000, affection: 90 };
  const withTap = purchaseUpgrade(rich, "tap");
  assert.equal(withTap.purchased, true);
  const withBoth = purchaseUpgrade(withTap.state, "charm");
  assert.equal(withBoth.purchased, true);

  const tapped = applyHeroineTap(withBoth.state, "head");
  assert.equal(
    tapped.currencyDelta,
    GAME_BALANCE.taps.head.currency + GAME_BALANCE.tapPower.perUpgradeLevel,
  );
  assert.equal(
    tapped.affectionDelta,
    GAME_BALANCE.taps.head.affection + GAME_BALANCE.charm.perUpgradeLevel,
  );
});

test("the relationship ladder has ten fan-service stages with hotter lines", () => {
  assert.equal(RELATIONSHIP_STAGES.length, 10);
  assert.equal(relationshipLadderIsConsistent(), true);
  assert.equal(relationshipStage(1).name, "Незнакомец");
  assert.equal(relationshipStage(10).name, "Её парень");
  assert.equal(relationshipStage(99).name, "Её парень");
  for (const stage of RELATIONSHIP_STAGES) {
    assert.ok(stage.tapLines.length >= 3, `${stage.name} needs lines`);
    assert.ok(stage.unlockLine.length > 0);
  }
  // Every pose has its own line bank for all three heat bands.
  for (const pose of ["classic", "shelf", "carpet", "bed"] as const) {
    assert.equal(POSE_TAP_LINES[pose].length, 3);
    for (const band of POSE_TAP_LINES[pose]) {
      assert.ok(band.length >= 3, `${pose} band needs lines`);
    }
    // pickTapLine always lands inside a real bank.
    const poseLine = pickTapLine(8, pose, () => 0.1);
    const stageLine = pickTapLine(8, pose, () => 0.9);
    assert.ok(POSE_TAP_LINES[pose][2]?.includes(poseLine));
    assert.ok(relationshipStage(8).tapLines.includes(stageLine));
  }
});

test("stocking lines live only in poses where a stocking actually slips", () => {
  const stocking = /чулок|чулоч/i;
  // Stage banks are pose-agnostic — no prop lines allowed there.
  for (const stage of RELATIONSHIP_STAGES) {
    for (const line of [stage.unlockLine, ...stage.tapLines]) {
      assert.ok(
        !stocking.test(line),
        `stage «${stage.name}» mentions a stocking in a pose-agnostic line`,
      );
    }
  }
  // Classic and bed poses have no slipping stocking.
  for (const pose of ["classic", "bed"] as const) {
    for (const band of POSE_TAP_LINES[pose]) {
      for (const line of band) {
        assert.ok(!stocking.test(line), `${pose} must not mention stockings`);
      }
    }
  }
  // Carpet (slipped ring) and shelf (tiptoe stretch) keep theirs.
  const carpetAll = POSE_TAP_LINES.carpet.flat().join(" ");
  const shelfAll = POSE_TAP_LINES.shelf.flat().join(" ");
  assert.ok(stocking.test(carpetAll));
  assert.ok(stocking.test(shelfAll));
});

test("upgrades carry romantic stage-aware display names", () => {
  for (const kind of ["tap", "income", "charm"] as const) {
    const names = new Set([
      upgradeRomanticName(kind, 1),
      upgradeRomanticName(kind, 5),
      upgradeRomanticName(kind, 10),
    ]);
    assert.equal(names.size, 3, `${kind} needs three heat-band names`);
    for (const name of names) assert.ok(name.length > 3);
  }
  assert.equal(upgradeRomanticName("income", 1), "Мысли о тебе");
});

test("affection tiers and save migration are derived from persisted source values", () => {
  assert.deepEqual(affectionProgress(15), {
    level: 2,
    progress: 0,
    currentThreshold: 15,
    nextThreshold: 40,
  });
  assert.equal(affectionProgress(3_200).level, 10);
  assert.equal(affectionProgress(999_999).level, 10);

  const migrated = migrateSave(
    {
      schemaVersion: 1,
      savedAtMs: 5,
      currency: 23,
      affection: 16,
      lifetimeCurrencyEarned: 52,
      upgrades: { "warm-lantern": 1, "gentle-hands": 2, "sweet-words": 1 },
      inkStateJson: null,
      storyFlags: { introCompleted: false, introChoice: null },
    },
    100,
  );
  assert.equal(migrated.level, 2);
  assert.equal(migrated.upgrades["warm-lantern"], 1);
  assert.equal(migrated.upgrades["gentle-hands"], 2);
  assert.equal(migrated.upgrades["sweet-words"], 1);
  assert.equal(migrated.storyFlags.introTranscript, "");
});
