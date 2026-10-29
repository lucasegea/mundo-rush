// Mapa de teclas por defecto (R10). Se mira `KeyboardEvent.code` (la tecla física), así WASD sirve igual en un
// teclado español o inglés. El remapeo desde Ajustes (settings.input.keymap) queda para cuando haya UI.
import type { HeldDirection, SemanticAction } from "@lg/core";

export type KeyBinding =
  | { kind: "hold"; dir: HeldDirection }
  | { kind: "press"; action: SemanticAction }
  /** Open-world-3d T4 (D-820): Q (-1, a la izquierda) y R (+1, a la derecha) miran mientras se mantienen. */
  | { kind: "look"; dir: -1 | 1 }
  /** Shift: correr mientras se mantiene. */
  | { kind: "run" };

export const DEFAULT_KEYMAP: Readonly<Record<string, KeyBinding>> = {
  KeyW: { kind: "hold", dir: "up" },
  ArrowUp: { kind: "hold", dir: "up" },
  KeyS: { kind: "hold", dir: "down" },
  ArrowDown: { kind: "hold", dir: "down" },
  KeyA: { kind: "hold", dir: "left" },
  ArrowLeft: { kind: "hold", dir: "left" },
  KeyD: { kind: "hold", dir: "right" },
  ArrowRight: { kind: "hold", dir: "right" },
  KeyE: { kind: "press", action: { type: "interact", target: null } },
  KeyT: { kind: "press", action: { type: "talk" } },
  Escape: { kind: "press", action: { type: "cancel" } },
  KeyC: { kind: "press", action: { type: "openNotebook" } }, // C de "cuaderno"
  Equal: { kind: "press", action: { type: "zoomIn" } },
  NumpadAdd: { kind: "press", action: { type: "zoomIn" } },
  Minus: { kind: "press", action: { type: "zoomOut" } },
  NumpadSubtract: { kind: "press", action: { type: "zoomOut" } },
  // Open-world-3d T4 (D-820): mirar con Q y R por posición (como WASD), correr con Shift, V para el mapa entero.
  KeyQ: { kind: "look", dir: -1 },
  KeyR: { kind: "look", dir: 1 },
  ShiftLeft: { kind: "run" },
  ShiftRight: { kind: "run" },
  KeyV: { kind: "press", action: { type: "toggleOverview" } },
};

// Zoom por carácter impreso (`KeyboardEvent.key`), solo para acciones de una pulsación. En los teclados español y
// latinoamericano el "+" de la fila principal es BracketRight y el "-" es Slash, así que por `code` no
// coincidirían con lo que dice el HUD ("+ y −"). La V que nombra el HUD también va por carácter (lección F2): en una
// distribución donde la V impresa no está en KeyV igual abre el mapa entero.
export const CHARACTER_KEYMAP: Readonly<Record<string, KeyBinding>> = {
  "+": { kind: "press", action: { type: "zoomIn" } },
  "-": { kind: "press", action: { type: "zoomOut" } },
  v: { kind: "press", action: { type: "toggleOverview" } },
  V: { kind: "press", action: { type: "toggleOverview" } },
};
