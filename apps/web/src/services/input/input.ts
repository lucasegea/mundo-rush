// services/input/ — dispositivos → acciones semánticas (R10, D-145, D-197). Es el ÚNICO lugar del cliente que
// escucha teclado, rueda, puntero o gamepad (lint). Nadie más ve una tecla: el store recibe `move`, `interact`, `talk`,
// `cancel`, `openNotebook`, `zoomIn`/`zoomOut` y, desde open-world-3d T4 (D-820), `look`, `run` y `toggleOverview`. El
// clic sobre una malla lo resuelve el raycast de R3F en world/ y entra por state/bridge.ts con el mismo traductor del
// núcleo (`pointerAction`); un arrastre de más de LOOK_DRAG_PX lo traduce este servicio a `look` (Pointer Events, sin
// pointer lock) y world/ descarta el clic que R3F dispara al soltarlo (`event.delta`).
import { dirFromHeld, KEY_LOOK_PX_PER_STEP, LOOK_DRAG_PX, wheelZoom, type HeldDirection, type SemanticAction } from "@lg/core";
import { CHARACTER_KEYMAP, DEFAULT_KEYMAP, type KeyBinding } from "./keymap";

export interface InputDeps {
  /** Donde se escucha (window en la app; un EventTarget cualquiera en los tests). */
  target: EventTarget;
  dispatch(action: SemanticAction): void;
  /** ¿El mapa está jugándose? Fuera de él, las teclas siguen su comportamiento normal del navegador. */
  isActive(): boolean;
  keymap?: Readonly<Record<string, KeyBinding>>;
  /** Reloj de Q y R mantenidas (inyectable en los tests). */
  timers?: { every(ms: number, fn: () => void): () => void };
}

/** Selector del contenedor del canvas: la rueda solo hace zoom sobre el mapa, no sobre un panel. */
export const WORLD_SURFACE_ATTR = "data-lg-world";

/** Q y R mantenidas emiten `look` a 30 Hz (95°/s, THIRD_PERSON.keyLookDegPerS). */
export const KEY_LOOK_INTERVAL_MS = 1000 / 30;

const browserTimers = { every(ms: number, fn: () => void): () => void { const id = setInterval(fn, ms); return () => clearInterval(id); } };

const isEditable = (t: EventTarget | null): boolean => {
  const el = t as (HTMLElement & { isContentEditable?: boolean }) | null;
  const tag = typeof el?.tagName === "string" ? el.tagName.toLowerCase() : "";
  return tag === "input" || tag === "textarea" || tag === "select" || el?.isContentEditable === true;
};

const overWorld = (t: EventTarget | null): boolean => {
  const el = t as Element | null;
  return typeof el?.closest === "function" && el.closest(`[${WORLD_SURFACE_ATTR}]`) !== null;
};

/**
 * Traductor de arrastre (D-820), puro: hasta pasar LOOK_DRAG_PX desde donde se apretó no emite nada (es un clic, que
 * resuelve el raycast de world/); pasado el umbral, cada movimiento emite `look` con el desplazamiento desde el anterior y
 * sigue "mirando" hasta soltar.
 */
export function createDragLook(threshold: number = LOOK_DRAG_PX) {
  let down: { x: number; y: number } | null = null;
  let last = { x: 0, y: 0 };
  let looking = false;
  return {
    down(x: number, y: number): void {
      down = { x, y };
      last = { x, y };
      looking = false;
    },
    /** El `look` de este movimiento, o null (sin botón apretado o todavía dentro del umbral). */
    move(x: number, y: number): SemanticAction | null {
      if (!down) return null;
      if (!looking && Math.hypot(x - down.x, y - down.y) <= threshold) return null;
      looking = true;
      const action: SemanticAction = { type: "look", dx: x - last.x, dy: y - last.y };
      last = { x, y };
      return action.dx === 0 && action.dy === 0 ? null : action;
    },
    /** Al soltar: "drag" si miró, "tap" si fue un clic, null si no había botón apretado. */
    up(): "drag" | "tap" | null {
      const was = down === null ? null : looking ? "drag" : "tap";
      down = null;
      looking = false;
      return was;
    },
    get looking(): boolean {
      return looking;
    },
  };
}

/** Arranca el servicio. Devuelve la función que suelta todos los listeners. */
export function startInput(deps: InputDeps): () => void {
  const keymap = deps.keymap ?? DEFAULT_KEYMAP;
  const timers = deps.timers ?? browserTimers;
  const held = new Set<HeldDirection>();
  let lastDir = { x: 0, y: 0 };

  const emitDir = (): void => {
    const dir = dirFromHeld(held);
    if (dir.x === lastDir.x && dir.y === lastDir.y) return;
    lastDir = dir;
    deps.dispatch({ type: "move", dir });
  };

  // ---------- Q y R: mirar mientras se mantienen ----------
  const lookKeys = new Set<-1 | 1>();
  let stopLookTimer: (() => void) | null = null;
  const lookTick = (): void => {
    const dir = (lookKeys.has(1) ? 1 : 0) - (lookKeys.has(-1) ? 1 : 0);
    if (dir !== 0 && deps.isActive()) deps.dispatch({ type: "look", dx: dir * KEY_LOOK_PX_PER_STEP, dy: 0 });
  };
  const syncLookTimer = (): void => {
    if (lookKeys.size > 0 && !stopLookTimer) stopLookTimer = timers.every(KEY_LOOK_INTERVAL_MS, lookTick);
    if (lookKeys.size === 0 && stopLookTimer) {
      stopLookTimer();
      stopLookTimer = null;
    }
  };

  let running = false;
  const setRun = (on: boolean): void => {
    if (on === running) return;
    running = on;
    deps.dispatch({ type: "run", on });
  };

  const onKeyDown = (event: Event): void => {
    const e = event as KeyboardEvent;
    const binding = keymap[e.code] ?? CHARACTER_KEYMAP[e.key];
    if (!binding || e.altKey || e.ctrlKey || e.metaKey || isEditable(e.target) || !deps.isActive()) return;
    e.preventDefault(); // las flechas no desplazan la página mientras se camina
    if (binding.kind === "hold") {
      held.add(binding.dir);
      emitDir();
    } else if (binding.kind === "look") {
      if (lookKeys.has(binding.dir)) return; // repetición del teclado: el reloj ya emite
      lookKeys.add(binding.dir);
      lookTick(); // el primer paso enseguida, sin esperar al reloj
      syncLookTimer();
    } else if (binding.kind === "run") {
      setRun(true);
    } else if (!e.repeat) {
      deps.dispatch(binding.action);
    }
  };

  const onKeyUp = (event: Event): void => {
    const binding = keymap[(event as KeyboardEvent).code];
    if (binding?.kind === "hold") {
      held.delete(binding.dir);
      emitDir();
    } else if (binding?.kind === "look") {
      lookKeys.delete(binding.dir);
      syncLookTimer();
    } else if (binding?.kind === "run") {
      setRun(false);
    }
  };

  // ---------- puntero: arrastre = mirar (D-820) ----------
  const drag = createDragLook();
  let pointerId: number | null = null;
  const onPointerDown = (event: Event): void => {
    const e = event as PointerEvent;
    if ((e.button ?? 0) !== 0 || e.isPrimary === false || !overWorld(e.target) || !deps.isActive()) return;
    pointerId = e.pointerId ?? 0;
    drag.down(e.clientX, e.clientY);
  };
  const onPointerMove = (event: Event): void => {
    const e = event as PointerEvent;
    if (pointerId === null || (e.pointerId ?? 0) !== pointerId) return;
    const action = drag.move(e.clientX, e.clientY);
    if (action && deps.isActive()) deps.dispatch(action);
  };
  const onPointerUp = (event: Event): void => {
    const e = event as PointerEvent;
    if (pointerId === null || (e.pointerId ?? 0) !== pointerId) return;
    pointerId = null;
    drag.up();
  };

  // Al perder el foco la ventana no llegan los keyup ni el pointerup: se suelta todo.
  const onBlur = (): void => {
    held.clear();
    emitDir();
    lookKeys.clear();
    syncLookTimer();
    setRun(false);
    pointerId = null;
    drag.up();
  };

  // Rueda acumulada (D-208): un paso por muesca, también con los muchos eventos chicos de un trackpad.
  let wheelAcc = 0;
  const onWheel = (event: Event): void => {
    const e = event as WheelEvent;
    if (!overWorld(e.target) || !deps.isActive()) return;
    if (!Number.isFinite(e.deltaY) || e.deltaY === 0) return;
    e.preventDefault();
    const { acc, action } = wheelZoom(wheelAcc, e.deltaY, e.deltaMode);
    wheelAcc = acc;
    if (action) deps.dispatch(action);
  };

  const { target } = deps;
  target.addEventListener("keydown", onKeyDown);
  target.addEventListener("keyup", onKeyUp);
  target.addEventListener("blur", onBlur);
  target.addEventListener("wheel", onWheel, { passive: false });
  target.addEventListener("pointerdown", onPointerDown);
  target.addEventListener("pointermove", onPointerMove);
  target.addEventListener("pointerup", onPointerUp);
  target.addEventListener("pointercancel", onPointerUp);
  return () => {
    target.removeEventListener("keydown", onKeyDown);
    target.removeEventListener("keyup", onKeyUp);
    target.removeEventListener("blur", onBlur);
    target.removeEventListener("wheel", onWheel);
    target.removeEventListener("pointerdown", onPointerDown);
    target.removeEventListener("pointermove", onPointerMove);
    target.removeEventListener("pointerup", onPointerUp);
    target.removeEventListener("pointercancel", onPointerUp);
    lookKeys.clear();
    syncLookTimer();
  };
}
