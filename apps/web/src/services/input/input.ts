// services/input/ — dispositivos → acciones semánticas (R10, D-145, D-197). Es el ÚNICO lugar del cliente que
// escucha teclado, rueda o gamepad (lint). Nadie más ve una tecla: el store recibe `move`, `interact`, `talk`,
// `cancel`, `openNotebook`, `zoomIn`/`zoomOut`. El clic sobre una malla lo resuelve el raycast de R3F en world/ y
// entra por state/bridge.ts con el mismo traductor del núcleo (`pointerAction`).
import { dirFromHeld, wheelAction, type HeldDirection, type SemanticAction } from "@lg/core";
import { CHARACTER_KEYMAP, DEFAULT_KEYMAP, type KeyBinding } from "./keymap";

export interface InputDeps {
  /** Donde se escucha (window en la app; un EventTarget cualquiera en los tests). */
  target: EventTarget;
  dispatch(action: SemanticAction): void;
  /** ¿El mapa está jugándose? Fuera de él, las teclas siguen su comportamiento normal del navegador. */
  isActive(): boolean;
  keymap?: Readonly<Record<string, KeyBinding>>;
}

/** Selector del contenedor del canvas: la rueda solo hace zoom sobre el mapa, no sobre un panel. */
export const WORLD_SURFACE_ATTR = "data-lg-world";

const isEditable = (t: EventTarget | null): boolean => {
  const el = t as (HTMLElement & { isContentEditable?: boolean }) | null;
  const tag = typeof el?.tagName === "string" ? el.tagName.toLowerCase() : "";
  return tag === "input" || tag === "textarea" || tag === "select" || el?.isContentEditable === true;
};

const overWorld = (t: EventTarget | null): boolean => {
  const el = t as Element | null;
  return typeof el?.closest === "function" && el.closest(`[${WORLD_SURFACE_ATTR}]`) !== null;
};

/** Arranca el servicio. Devuelve la función que suelta todos los listeners. */
export function startInput(deps: InputDeps): () => void {
  const keymap = deps.keymap ?? DEFAULT_KEYMAP;
  const held = new Set<HeldDirection>();
  let lastDir = { x: 0, y: 0 };

  const emitDir = (): void => {
    const dir = dirFromHeld(held);
    if (dir.x === lastDir.x && dir.y === lastDir.y) return;
    lastDir = dir;
    deps.dispatch({ type: "move", dir });
  };

  const onKeyDown = (event: Event): void => {
    const e = event as KeyboardEvent;
    const binding = keymap[e.code] ?? CHARACTER_KEYMAP[e.key];
    if (!binding || e.altKey || e.ctrlKey || e.metaKey || isEditable(e.target) || !deps.isActive()) return;
    e.preventDefault(); // las flechas no desplazan la página mientras se camina
    if (binding.kind === "hold") {
      held.add(binding.dir);
      emitDir();
    } else if (!e.repeat) {
      deps.dispatch(binding.action);
    }
  };

  const onKeyUp = (event: Event): void => {
    const binding = keymap[(event as KeyboardEvent).code];
    if (binding?.kind !== "hold") return;
    held.delete(binding.dir);
    emitDir();
  };

  // Al perder el foco la ventana no llegan los keyup: se sueltan todas las direcciones.
  const onBlur = (): void => {
    held.clear();
    emitDir();
  };

  const onWheel = (event: Event): void => {
    const e = event as WheelEvent;
    if (!overWorld(e.target) || !deps.isActive()) return;
    const action = wheelAction(e.deltaY);
    if (!action) return;
    e.preventDefault();
    deps.dispatch(action);
  };

  const { target } = deps;
  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);
  target.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    target.removeEventListener("keydown", onKeyDown);
    target.removeEventListener("keyup", onKeyUp);
    target.removeEventListener("blur", onBlur);
    target.removeEventListener("wheel", onWheel);
  };
}
