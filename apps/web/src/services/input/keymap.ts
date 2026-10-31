// Default key map (R10). `KeyboardEvent.code` is used (the physical key), so WASD works the same on a
// Spanish or English keyboard. Remapping from Settings (settings.input.keymap) is left for when there is UI.
import type { HeldDirection, SemanticAction } from "@lg/core";

export type KeyBinding =
  | { kind: "hold"; dir: HeldDirection }
  | { kind: "press"; action: SemanticAction }
  /** Open-world-3d T4 (D-820): Q (-1, left) and R (+1, right) look while held. */
  | { kind: "look"; dir: -1 | 1 }
  /** Shift: run while held. */
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
  KeyC: { kind: "press", action: { type: "openNotebook" } }, // C for "cuaderno" (notebook)
  Equal: { kind: "press", action: { type: "zoomIn" } },
  NumpadAdd: { kind: "press", action: { type: "zoomIn" } },
  Minus: { kind: "press", action: { type: "zoomOut" } },
  NumpadSubtract: { kind: "press", action: { type: "zoomOut" } },
  // Open-world-3d T4 (D-820): look with Q and R by position (like WASD), run with Shift, V for the whole map.
  KeyQ: { kind: "look", dir: -1 },
  KeyR: { kind: "look", dir: 1 },
  ShiftLeft: { kind: "run" },
  ShiftRight: { kind: "run" },
  KeyV: { kind: "press", action: { type: "toggleOverview" } },
};

// Zoom by printed character (`KeyboardEvent.key`), only for single-press actions. On Spanish and
// Latin American keyboards the "+" on the main row is BracketRight and the "-" is Slash, so by `code` they would not
// match what the HUD says ("+ and −"). The V that the HUD names also goes by character (F2 lesson): on a
// layout where the printed V is not on KeyV it still opens the whole map.
export const CHARACTER_KEYMAP: Readonly<Record<string, KeyBinding>> = {
  "+": { kind: "press", action: { type: "zoomIn" } },
  "-": { kind: "press", action: { type: "zoomOut" } },
  v: { kind: "press", action: { type: "toggleOverview" } },
  V: { kind: "press", action: { type: "toggleOverview" } },
};
