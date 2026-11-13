/**
 * URL map for the approved BLOCK 1 production assets.  Vite rewrites
 * these `?url` imports; no artwork is copied, regenerated or atlased.
 */
import type { ExpressionName, ExpressionStateName } from "./animationMath.ts";
import layerMapJson from "../../../art-studio/stages/05-independent-layers/layer-map.json";
import switchMatrixJson from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/references/switch-matrix.json";

import layer01Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/layers/01_hair_back_01.png?url";
import layer02Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/layers/02_hair_back_02.png?url";
import layer03Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/layers/03_leg_l.png?url";
import layer04Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/layers/04_leg_r.png?url";
import layer05Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/layers/05_torso.png?url";
import layer06Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/layers/06_arm_l.png?url";
import layer07Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/layers/07_arm_r.png?url";
import layer08Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/layers/08_outfit_blouse.png?url";
import layer09Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/layers/09_outfit_collar.png?url";
import layer10Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/layers/10_outfit_ribbon.png?url";
import layer11Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/layers/11_outfit_skirt_01.png?url";
import layer12Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/layers/12_outfit_skirt_02.png?url";
import layer13Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/layers/13_head.png?url";
import layer14Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/layers/14_eye_l_open.png?url";
import layer15Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/layers/15_eye_r_open.png?url";
import layer16Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/layers/16_mouth_neutral.png?url";
import layer17Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/layers/17_hair_side_l.png?url";
import layer18Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/layers/18_hair_side_r.png?url";
import layer19Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/layers/19_hair_front_01.png?url";
import layer20Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/layers/20_hair_front_02.png?url";
import underlayUnionUrl from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/underlays/UNDERLAY-UNION.png?url";
import originalArtUrl from "../../../art-studio/references/originals/IMG_4038_rig-pose.webp?url";
import state00Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/assembly/state-00-neutral.png?url";
import state01Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/assembly/state-01-eye_l_closed-B.png?url";
import state02Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/assembly/state-02-eye_r_closed-B.png?url";
import state03Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/assembly/state-03-mouth_open-A.png?url";
import state04Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/assembly/state-04-mouth_smile-A.png?url";
import state05Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/assembly/state-05-both-eyes-closed.png?url";
import state06Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/assembly/state-06-both-eyes-closed-smile.png?url";
import state07Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/assembly/state-07-mouth_open-both-eyes-closed.png?url";
import state08Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/assembly/state-08-eye_l_closed-smile.png?url";
import state09Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/assembly/state-09-eye_r_closed-mouth_open.png?url";
import expr0Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/states/state-eye_l_closed-B.png?url";
import expr1Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/states/state-eye_r_closed-B.png?url";
import expr2Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/states/state-mouth_open-A.png?url";
import expr3Url from "../../../art-studio/production/BLOCK-1-FINISH-CHARACTER-ASSETS/BUILD-v01/states/state-mouth_smile-A.png?url";
import naturalHairBackUrl from "../../../art-studio/production/BLOCK-F-NATURAL-EDGE-CLEANUP/natural-hair-back.png?url";
import naturalBlouseUrl from "../../../art-studio/production/BLOCK-F-NATURAL-EDGE-CLEANUP/natural-blouse.png?url";
import naturalArmLUrl from "../../../art-studio/production/BLOCK-F-NATURAL-EDGE-CLEANUP/natural-arm-l.png?url";
import naturalArmRUrl from "../../../art-studio/production/BLOCK-F-NATURAL-EDGE-CLEANUP/natural-arm-r.png?url";
import cleanLeg03Url from "../../../art-studio/production/BLOCK-F-NATURAL-EDGE-CLEANUP/03_leg_l.png?url";
import cleanLeg04Url from "../../../art-studio/production/BLOCK-F-NATURAL-EDGE-CLEANUP/04_leg_r.png?url";
import cleanTorso05Url from "../../../art-studio/production/BLOCK-F-NATURAL-EDGE-CLEANUP/05_torso.png?url";
import cleanCollar09Url from "../../../art-studio/production/BLOCK-F-NATURAL-EDGE-CLEANUP/09_outfit_collar.png?url";
import cleanRibbon10Url from "../../../art-studio/production/BLOCK-F-NATURAL-EDGE-CLEANUP/10_outfit_ribbon.png?url";
import cleanSkirt11Url from "../../../art-studio/production/BLOCK-F-NATURAL-EDGE-CLEANUP/11_outfit_skirt_01.png?url";
import cleanSkirt12Url from "../../../art-studio/production/BLOCK-F-NATURAL-EDGE-CLEANUP/12_outfit_skirt_02.png?url";
import cleanHead13Url from "../../../art-studio/production/BLOCK-F-NATURAL-EDGE-CLEANUP/13_head.png?url";
import cleanHairSide17Url from "../../../art-studio/production/BLOCK-F-NATURAL-EDGE-CLEANUP/17_hair_side_l.png?url";
import cleanHairSide18Url from "../../../art-studio/production/BLOCK-F-NATURAL-EDGE-CLEANUP/18_hair_side_r.png?url";
import cleanHairFront19Url from "../../../art-studio/production/BLOCK-F-NATURAL-EDGE-CLEANUP/19_hair_front_01.png?url";
import cleanHairFront20Url from "../../../art-studio/production/BLOCK-F-NATURAL-EDGE-CLEANUP/20_hair_front_02.png?url";

export interface SlotDefinition {
  z: number;
  slot: string;
  group: string;
  pivotAbsolute: { x: number; y: number };
  states: string[];
}

interface LayerMapJson {
  slots: SlotDefinition[];
}

interface SwitchMatrixJson {
  states: Record<string, { expressions: string[] }>;
}

export const SLOT_DEFINITIONS: readonly SlotDefinition[] = (
  layerMapJson as unknown as LayerMapJson
).slots;

export const SWITCH_MATRIX = (switchMatrixJson as unknown as SwitchMatrixJson)
  .states;

export const LAYER_URLS: Readonly<Record<number, string>> = {
  1: layer01Url,
  2: layer02Url,
  3: layer03Url,
  4: layer04Url,
  5: layer05Url,
  6: layer06Url,
  7: layer07Url,
  8: layer08Url,
  9: layer09Url,
  10: layer10Url,
  11: layer11Url,
  12: layer12Url,
  13: layer13Url,
  14: layer14Url,
  15: layer15Url,
  16: layer16Url,
  17: layer17Url,
  18: layer18Url,
  19: layer19Url,
  20: layer20Url,
};

export const UNDERLAY_UNION_URL: string = underlayUnionUrl;

/**
 * Approved pre-separation original (848x1264, same canvas as the slots).
 * Used READ-ONLY at runtime as the restoration source for interior pixels
 * the BLOCK 1 layer-separation cut erroneously punched out of the slots.
 */
export const ORIGINAL_ART_URL: string = originalArtUrl;

export const STATE_PLATE_URLS: Readonly<Record<ExpressionStateName, string>> = {
  "00-neutral": state00Url,
  "01-eye_l_closed-B": state01Url,
  "02-eye_r_closed-B": state02Url,
  "03-mouth_open-A": state03Url,
  "04-mouth_smile-A": state04Url,
  "05-both-eyes-closed": state05Url,
  "06-both-eyes-closed-smile": state06Url,
  "07-mouth_open-both-eyes-closed": state07Url,
  "08-eye_l_closed-smile": state08Url,
  "09-eye_r_closed-mouth_open": state09Url,
};

export const EXPRESSION_OVERLAY_URLS: Readonly<Record<ExpressionName, string>> =
  {
    "eye_l_closed-B": expr0Url,
    "eye_r_closed-B": expr1Url,
    "mouth_open-A": expr2Url,
    "mouth_smile-A": expr3Url,
  };

/**
 * All approved visual-state textures loaded at startup: 20 RGBA slots,
 * 10 flattened E2-V2 state references, 4 transparent expression overlays and
 * one coverage-gated technical underlay.  The 4 overlays are preserved in the
 * runtime cache even though the 10 state plates directly encode their B/B/A/A
 * decisions and the approved right-eye +9 px registration.
 */
/**
 * BLOCK C natural-pose overlays (user-approved variant B, 2026-11-12):
 * relaxed arms with hanging sleeves cut from the approved-identity variant-B
 * render, the full repainted back hair behind the new arm positions and a
 * blouse copy with the old outward sleeves cleared.  Loaded ONLY in the
 * natural pose; `?pose=classic` never requests these URLs and keeps the
 * accepted BLOCK 2 build byte-identical.
 */
export const NATURAL_POSE_URLS = {
  hairBack: naturalHairBackUrl,
  blouse: naturalBlouseUrl,
  armL: naturalArmLUrl,
  armR: naturalArmRUrl,
} as const;

/**
 * BLOCK F: outer-silhouette edge cleanup, NATURAL pose only.  Copies of the
 * approved slots with the baked background halo trimmed, matte speckles
 * despeckled and the outer alpha edge smoothed — ONLY within 6px of the
 * union silhouette, so every interior junction contour stays bit-identical
 * and no seams can open.  `?pose=classic` never requests these URLs.
 */
export const NATURAL_CLEAN_LAYER_URLS: Readonly<Record<number, string>> = {
  3: cleanLeg03Url,
  4: cleanLeg04Url,
  5: cleanTorso05Url,
  9: cleanCollar09Url,
  10: cleanRibbon10Url,
  11: cleanSkirt11Url,
  12: cleanSkirt12Url,
  13: cleanHead13Url,
  17: cleanHairSide17Url,
  18: cleanHairSide18Url,
  19: cleanHairFront19Url,
  20: cleanHairFront20Url,
};

export const ALL_RUNTIME_TEXTURE_URLS: readonly string[] = [
  UNDERLAY_UNION_URL,
  ...Object.values(LAYER_URLS),
  ...Object.values(STATE_PLATE_URLS),
  ...Object.values(EXPRESSION_OVERLAY_URLS),
];
