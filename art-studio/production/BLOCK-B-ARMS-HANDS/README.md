# BLOCK B — Natural arm/hand art package (HEROINE-01)

Status: **AWAITING USER APPROVAL** — do NOT integrate until the user issues an
explicit APPROVE for variant A or variant B.

## What this is
Two candidate arm poses replacing the approved splayed-arms/open-palms pose.
Generated from the approved full composite
`BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/assembly/state-00-neutral.png`
as the identity/style reference. No approved PNG was modified.

- `variant-A/` — arms almost straight down along the body, maximally relaxed
  hands at mid-thigh, palms toward the thighs, fingers softly curled.
- `variant-B/` — soft elbow bend, hands resting higher, near the hips at the
  skirt hem, fingers curled inward.
- Each variant: `full-character.png`, `closeup-hands.png`,
  `closeup-shoulders-hair.png`, `comparison-vs-approved.png`.
- `choice-sheet-A-vs-B.png` — approved | A | B side by side.

Both variants repaint the back-hair regions that the old outstretched arms
used to cover: the hair silhouette is complete behind and beside the new arm
positions, with no leftover fragments of the old pose and no exposed gaps
(verified in the shoulder/hair closeups).

## QA notes
- Hands: palms inward, fingers softly curled, no splayed fingers, no
  viewer-facing palms, no broken wrists; 5 digits per hand in both variants.
- Identity: face, uniform, skirt, stockings, shoes, palette and line weight
  match the approved art; hair volume differs slightly (noted for the user's
  judgement in the comparisons).
- Native sizes: A 832x1248, B 1280x1920 — both must be rescaled/registered to
  the 848x1264 rig canvas during BLOCK C integration.

## BLOCK C (forbidden until APPROVE)
After the user picks a variant: cut arm + back-hair runtime layers from the
chosen image, register them to the rig canvas, integrate into the natural
pose only (classic `?pose=classic` keeps the approved arms), verify seams
during breathing/reactions, keep hit zones working.
