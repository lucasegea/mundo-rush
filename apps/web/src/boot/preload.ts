// boot/preload.ts — precarga del mundo mientras el menú está quieto (open-world-3d T10 (d), D-835, AC63): el chunk 3D
// (GameCanvas y three) y los .glb de los árboles del mundo abierto bajan en un requestIdleCallback antes del clic, así
// la carga medida (lg:world-enter → lg:world-first-frame) no los espera. Sin requestIdleCallback (Safari, jsdom) no se
// precarga nada: el mundo baja con el clic, como antes. Lo de acá es puro; App.tsx lo conecta.
//
// SEAM (T10-measure): los .glb van a la caché HTTP del navegador (fetch completo); GLTFLoader los vuelve a pedir con la
// misma url. Si el servidor estático obliga a revalidar, el siguiente paso es entregar los ArrayBuffer en memoria.
import { lookForRelief, publicUrl, treeFile, type WorldLook } from "@lg/art";
import type { AppPhase } from "@lg/core";

/** Tope de espera del requestIdleCallback: si el menú nunca queda quieto, la precarga arranca igual a los 2 s. */
export const PRELOAD_IDLE_TIMEOUT_MS = 2_000;

/** Lo mínimo del navegador para la precarga (globalThis en la app; un doble en los tests). */
export interface IdleEnv {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
}

export interface PreloadTrigger {
  phase: AppPhase;
  /** El menú principal es el panel de arriba. */
  menuOpen: boolean;
  /** El tier efectivo deja entrar al mapa (sin WebGL o en solo-diálogo, no se baja nada). */
  worldAvailable: boolean;
}

/** ¿Precargar ahora? Con el menú arriba, el mapa disponible y fuera del mundo (adentro ya está cargado). */
export const shouldPreloadWorld = (t: PreloadTrigger): boolean => t.menuOpen && t.worldAvailable && t.phase !== "world";

/**
 * Los .glb de los árboles (completo y liviano por especie) del look del mundo abierto, con la misma url que pide
 * buildNature (`base` sin la barra final + la ruta pública). Por defecto el look con relieve (DEFAULT_LOOK).
 */
export function treePreloadUrls(baseUrl: string, look: WorldLook = lookForRelief(true)): string[] {
  const base = baseUrl.replace(/\/$/, "");
  return [...new Set(look.vegetation.species.flatMap((s) => [treeFile(s, false), treeFile(s, true)]))].map((f) => `${base}${publicUrl(f)}`);
}

/**
 * Un precargador de una sola vez: `schedule(env)` pide un momento quieto y corre las tareas (cada una con su error
 * tragado: precargar es un atajo, nunca un fallo). Devuelve con qué cancelar si todavía no corrió.
 */
export function idlePreloader(tasks: readonly (() => Promise<unknown>)[], timeoutMs = PRELOAD_IDLE_TIMEOUT_MS): { schedule(env: IdleEnv): () => void; started(): boolean } {
  let started = false;
  return {
    started: () => started,
    schedule(env) {
      const ric = env.requestIdleCallback;
      if (started || typeof ric !== "function") return () => {};
      let ran = false;
      const id = ric.call(env, () => {
        if (started) return;
        ran = started = true;
        for (const task of tasks) {
          try {
            void task().catch(() => {});
          } catch {
            // una tarea que tira al arrancar no frena a las demás
          }
        }
      }, { timeout: timeoutMs });
      return () => {
        if (!ran) env.cancelIdleCallback?.call(env, id);
      };
    },
  };
}
