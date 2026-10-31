// CameraRig preset registry (R11): exactly R11's, and what the rig does with each one. Separate from the
// component so it can be tested without loading three or R3F. Since D-207 (plan estetica-c M1) the rig draws the long
// lens `perspective3D` and the two-person shot `dialogueFrame`. Plan estetica-c M7: the HD-2D orthographics left
// R11 (architecture review 2026-10-12); `xrTabletop` stays declared (E-XR future, not dead code).
import type { CameraPresetId } from "@lg/core";

// Open-world-3d T5 (PD-5): `thirdPerson` is the map's camera; `perspective3D` stays registered and the same
// third person draws it with the whole map (t = 1).
export const CAMERA_RIG_PRESETS: Readonly<Record<CameraPresetId, "implemented" | "declared">> = {
  thirdPerson: "implemented",
  dialogueFrame: "implemented",
  perspective3D: "implemented",
  xrTabletop: "declared",
};
