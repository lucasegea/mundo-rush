// Registro de presets de CameraRig (R11): exactamente los de R11, y qué hace el rig con cada uno. Aparte del
// componente para poder testearlo sin cargar three ni R3F. Desde D-207 (plan estetica-c M1) el rig dibuja el lente
// largo `perspective3D` y el plano de a dos `dialogueFrame`. Plan estetica-c M7: los ortográficos de HD-2D salieron de
// R11 (revisión de arquitectura 2026-10-12); `xrTabletop` queda declarado (futuro de E-XR, no código muerto).
import type { CameraPresetId } from "@lg/core";

// Open-world-3d T5 (PD-5): `thirdPerson` es la cámara del mapa; `perspective3D` sigue registrado y lo dibuja la misma
// tercera persona con el mapa entero (t = 1).
export const CAMERA_RIG_PRESETS: Readonly<Record<CameraPresetId, "implemented" | "declared">> = {
  thirdPerson: "implemented",
  dialogueFrame: "implemented",
  perspective3D: "implemented",
  xrTabletop: "declared",
};
