// Registro de presets de CameraRig (R11): exactamente los de R11, y qué hace el rig con cada uno. Aparte del
// componente para poder testearlo sin cargar three ni R3F. Desde D-207 (plan estetica-c M1) el rig dibuja el lente
// largo `perspective3D` y el plano de a dos `dialogueFrame`; los ortográficos de HD-2D quedan declarados hasta que M7
// los saque de R11 (su matemática sigue en rig.ts sin uso).
import type { CameraPresetId } from "@lg/core";

export const CAMERA_RIG_PRESETS: Readonly<Record<CameraPresetId, "implemented" | "declared">> = {
  topdownOrtho: "declared",
  isoOrtho: "declared",
  dialogueFrame: "implemented",
  perspective3D: "implemented",
  xrTabletop: "declared",
};
