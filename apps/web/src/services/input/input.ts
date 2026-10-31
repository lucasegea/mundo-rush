// services/input/ — devices → semantic actions (R10, D-145, D-197). It is the client's ONLY place that
// listens to keyboard, wheel, pointer or gamepad (lint). Nobody else sees a key: the store receives `move`, `interact`, `talk`,
// `cancel`, `openNotebook`, `zoomIn`/`zoomOut` and, since open-world-3d T4 (D-820), `look`, `run` and `toggleOverview`. A
// click on a mesh is resolved by R3F's raycast in world/ and enters through state/bridge.ts with the same translator from the
// core (`pointerAction`); a drag longer than LOOK_DRAG_PX is translated by this service to `look` (Pointer Events, without
// pointer lock) and world/ discards the click R3F fires on release (`event.delta`).
import { dirFromHeld, KEY_LOOK_PX_PER_STEP, LOOK_DRAG_PX, wheelZoom, type HeldDirection, type SemanticAction } from "@lg/core";
import { CHARACTER_KEYMAP, DEFAULT_KEYMAP, type KeyBinding } from "./keymap";

export interface InputDeps {
  /** Where to listen (window in the app; any EventTarget in tests). */
  target: EventTarget;
  dispatch(action: SemanticAction): void;
  /** Is the map being played? Outside of it, keys keep the browser's normal behavior. */
  isActive(): boolean;
  keymap?: Readonly<Record<string, KeyBinding>>;
  /** Clock for held Q and R (injectable in tests). */
  timers?: { every(ms: number, fn: () => void): () => void };
}

/** Selector of the canvas container: the wheel only zooms over the map, not over a panel. */
export const WORLD_SURFACE_ATTR = "data-lg-world";

/** Held Q and R emit `look` at 30 Hz (95°/s, THIRD_PERSON.keyLookDegPerS). */
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
 * Drag translator (D-820), pure: until LOOK_DRAG_PX is exceeded from where it was pressed it emits nothing (it is a click, which
 * is resolved by world/'s raycast); past the threshold, each movement emits `look` with the displacement from the previous one and
 * keeps "looking" until release.
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
    /** The `look` of this movement, or null (no button pressed or still within the threshold). */
    move(x: number, y: number): SemanticAction | null {
      if (!down) return null;
      if (!looking && Math.hypot(x - down.x, y - down.y) <= threshold) return null;
      looking = true;
      const action: SemanticAction = { type: "look", dx: x - last.x, dy: y - last.y };
      last = { x, y };
      return action.dx === 0 && action.dy === 0 ? null : action;
    },
    /** On release: "drag" if it looked, "tap" if it was a click, null if no button was pressed. */
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

/** Starts the service. Returns the function that releases all listeners. */
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

  // ---------- Q and R: look while held ----------
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
    e.preventDefault(); // arrow keys do not scroll the page while walking
    if (binding.kind === "hold") {
      held.add(binding.dir);
      emitDir();
    } else if (binding.kind === "look") {
      if (lookKeys.has(binding.dir)) return; // keyboard repeat: the clock already emits
      lookKeys.add(binding.dir);
      lookTick(); // first step right away, without waiting for the clock
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

  // ---------- pointer: drag = look (D-820) ----------
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

  // When the window loses focus neither keyup nor pointerup arrive: everything is released.
  const onBlur = (): void => {
    held.clear();
    emitDir();
    lookKeys.clear();
    syncLookTimer();
    setRun(false);
    pointerId = null;
    drag.up();
  };

  // Accumulated wheel (D-208): one step per notch, also with the many small events of a trackpad.
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
