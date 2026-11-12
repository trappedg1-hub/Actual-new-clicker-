# STAGE: HEROINE-01 — NATURAL BASE IDLE POSE

Date: 2026-11-12 · Branch: `arena/02869c32-actual-new-clicker`
Status: IMPLEMENTED (technical PASS) — awaiting visual acceptance on iPhone.

## Goal

Turn the approved technical rig stance (wide A-pose legs, spread limbs) into
a natural relaxed standing pose, without touching any approved PNG, the
BLOCK 1 materials or the accepted BLOCK 2 animation (breathing, blink,
reactions), and keeping the accepted pose reachable.

## Feasibility analysis (measured on the approved layers)

| Body part | Verdict | Measurement |
| --- | --- | --- |
| Legs (z03/z04) | **REPOSABLE** | Outside both legs' outer contours, every pixel from art row 700 down is fully transparent background (no neighbouring art). A hip-pinned horizontal row displacement cannot open a zero-overlap seam. |
| Leg tops / skirt | SAFE | Rows ≤ 720 are pinned to exactly 0 px; the skirt (z11/z12) covers the leg tops to ~row 690 and nothing moves beside it. |
| Arms (z06/z07) | **BLOCKED** | The approved back-hair masses sit at 0 px clearance along the arms' outer contours (rows 330–540 measured). The 20 slots have zero overlap, so ANY arm displacement exposes arm-shaped transparent holes in the hair — the exact Category-D black-slit defect that retired arm motion in BLOCK 2. |
| Hands / fingers | BLOCKED | The splayed open palms are painted into the single arm cut-outs; no wrist/finger sub-layers exist. |

## What was implemented (`natural` variant, default)

- `src/heroine/poses/naturalBasePose.ts` — new, pure, unit-tested module:
  - Stance field: 0 at/above row 720 (hip anchor, under the skirt),
    smoothstep to **105 px inward per leg** at the ankle row 1210, constant
    below (the shoe translates rigidly, feet stay flat on the ground).
    Ankle separation goes from ~410 px to ~200 px — slightly wider than the
    hips, i.e. "feet slightly apart, relaxed".
  - Relaxed-knee ease: additional 10 px inward on the SAME bounded knee
    weight the accepted dynamic warp uses.
  - Debris cleanup: 38 tiny rects (332 px total, measured over the full
    dynamic warp range −28..+28 px on either leg) of separation debris in
    hair_back_01 / skirt_02 / both legs that would float as orphan specks
    once the legs move. Cleared at RUNTIME only, natural variant only;
    worst residual after cleanup across all dynamic phases: **0 px**.
- `src/heroine/rig/ProductionHeroineRig.ts` — additive extension of the
  existing leg pose mesh: `dx(row) = (dynamicWarp + kneeEase)·kneeWeight +
  stancePx·stanceWeight`. In the classic variant every added term is zero
  and the cleanup list is empty — the accepted build renders byte-identical.
- Breathing, blinking, tap reactions, hit zones, face plates: untouched.

## Return path to the accepted pose

`?pose=classic` on any URL (preview or production) restores the accepted
BLOCK 2 stance exactly. Default (no parameter) shows the natural pose.

## What a full natural arm pose would require (NOT done, needs approval)

Newly approved art: repainted arm slots (lowered, slightly bent, relaxed
hands) plus repainted back-hair regions behind the current arm positions.
No AI/inpainting was used and none of this was generated.

## Verification

- `tsc` 0 errors, `eslint` 0 warnings, 52/52 node tests (47 existing + 5 new
  `tests/naturalBasePose.test.ts`), `vite build` OK.
- Runtime GPU screenshots (390×844 @3x, Chromium/WebGL): natural vs classic,
  no black dots, no slits, stocking tops welded under the skirt, shoes
  intact (local QA evidence: `qa-animation/pose-natural/`, not committed).
- All 1041 protected BLOCK 1 art files byte-unchanged (no PNG touched).
- `verify_block2.py` remains the acceptance gate pinned to BLOCK 2 commit
  `5f180a2` (its diff allow-list is point-in-time by design); this stage
  adds files outside the BLOCK 2 directory and does not modify it.
