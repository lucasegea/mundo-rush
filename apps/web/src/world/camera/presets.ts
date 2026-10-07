// Registro de presets de CameraRig (R11): exactamente los de R11, y qué hace el rig con cada uno. Aparte del
// componente para poder testearlo sin cargar three ni R3F.
import type { CameraPresetId } from "@lg/core";

export const CAMERA_RIG_PRESETS: Readonly<Record<CameraPresetId, "implemented" | "declared">> = {
  topdownOrtho: "implemented",
  isoOrtho: "implemented",
  dialogueFrame: "implemented",
  perspective3D: "declared",
  xrTabletop: "declared",
};
