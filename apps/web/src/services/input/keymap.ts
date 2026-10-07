// Mapa de teclas por defecto (R10). Se mira `KeyboardEvent.code` (la tecla física), así WASD sirve igual en un
// teclado español o inglés. El remapeo desde Ajustes (settings.input.keymap) queda para cuando haya UI.
import type { HeldDirection, SemanticAction } from "@lg/core";

export type KeyBinding = { kind: "hold"; dir: HeldDirection } | { kind: "press"; action: SemanticAction };

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
};

// Zoom por carácter impreso (`KeyboardEvent.key`), solo para acciones de una pulsación. En los teclados español y
// latinoamericano el "+" de la fila principal es BracketRight y el "-" es Slash, así que por `code` no
// coincidirían con lo que dice el HUD ("+ y −").
export const CHARACTER_KEYMAP: Readonly<Record<string, KeyBinding>> = {
  "+": { kind: "press", action: { type: "zoomIn" } },
  "-": { kind: "press", action: { type: "zoomOut" } },
};
