// boot/preload.ts — precarga del mundo mientras el menú está quieto (open-world-3d T10 (d), D-835, AC63): el chunk 3D
// (GameCanvas y three) y los .glb de los árboles del mundo abierto bajan en un requestIdleCallback antes del clic, así
// la carga medida (lg:world-enter → lg:world-first-frame) no los espera. Sin requestIdleCallback (Safari, jsdom) no se
// precarga nada: el mundo baja con el clic, como antes. Lo de acá es puro; App.tsx lo conecta.
// T10-integrate: UNA lista de objetivos (`WORLD_PRELOAD`), uno por renglón: chunk 3D, chunk del postprocesado (solo si
// el tier lo dibuja), los .glb de árboles y rocas, los datos del mapa y los decodificadores. Sumar uno es un renglón.
//
// SEAM (T10-measure): los archivos van a la caché HTTP del navegador (fetch completo); GLTFLoader, el KTX2Loader y el
// cargador del diorama los vuelven a pedir con la misma url. Si el servidor estático obliga a revalidar, el siguiente
// paso es entregar los ArrayBuffer en memoria.
import { lookForRelief, natureModelFiles, publicUrl, type WorldLook } from "@lg/art";
import type { AppPhase } from "@lg/core";
import { DIORAMAS_FILE, universeContentBase } from "../services/content";

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

const withBase = (baseUrl: string, files: readonly string[]): string[] => {
  const base = baseUrl.replace(/\/$/, "");
  return [...new Set(files)].map((f) => `${base}${publicUrl(f)}`);
};

/**
 * Los .glb de árboles (completo y liviano por especie) y rocas (completo y lejano por escaneo) del look del mundo
 * abierto: `natureModelFiles`, con la misma url que pide buildNature (`base` sin la barra final + la ruta pública). Por
 * defecto el look con relieve (DEFAULT_LOOK).
 */
export function naturePreloadUrls(baseUrl: string, look: WorldLook = lookForRelief(true)): string[] {
  return withBase(baseUrl, natureModelFiles(look));
}

/** Los decodificadores autoalojados de apps/web/public/decoders/ (meshopt para los .glb, basis para los .ktx2). */
export const DECODER_FILES = ["meshopt_decoder.module.js", "basis_transcoder.js", "basis_transcoder.wasm"] as const;

/** Lo que necesitan los objetivos de la precarga (App.tsx lo arma; los tests, a mano). */
export interface PreloadContext {
  baseUrl: string;
  /** Universo a jugar (S4/D-806): de él sale la ruta de los datos del mapa. */
  universeId?: string | undefined;
  /** El tier dibuja postprocesado (`low`, solo-diálogo y "reducir movimiento" nunca bajan su chunk, D-160). */
  post: boolean;
  /** Los mismos import() que usan los lazy() (Vite los deduplica: el clic encuentra el chunk ya bajado). */
  loadCanvas: () => Promise<unknown>;
  loadPost: () => Promise<unknown>;
  /** Baja una url entera (fetch + arrayBuffer en la app). */
  fetchUrl: (url: string) => Promise<unknown>;
}

type PreloadTask = () => Promise<unknown>;
const fetchAll = (c: PreloadContext, urls: readonly string[]): PreloadTask[] => urls.map((u) => () => c.fetchUrl(u));

/** LA lista de objetivos de la precarga, uno por renglón y con nombre (sumar uno es sumar un renglón). */
export const WORLD_PRELOAD: readonly { id: string; tasks: (c: PreloadContext) => PreloadTask[] }[] = [
  { id: "chunk-3d", tasks: (c) => [c.loadCanvas] },
  { id: "chunk-post", tasks: (c) => (c.post ? [c.loadPost] : []) },
  { id: "naturaleza", tasks: (c) => fetchAll(c, naturePreloadUrls(c.baseUrl)) },
  { id: "mapa", tasks: (c) => fetchAll(c, [`${universeContentBase(c.baseUrl, c.universeId)}${DIORAMAS_FILE}`]) },
  { id: "decodificadores", tasks: (c) => fetchAll(c, DECODER_FILES.map((f) => `${c.baseUrl}decoders/${f}`)) },
];

/** Las tareas de todos los objetivos, en el orden de la lista. */
export const worldPreloadTasks = (c: PreloadContext): PreloadTask[] => WORLD_PRELOAD.flatMap((t) => t.tasks(c));

/**
 * Un precargador de una sola vez: `schedule(env)` pide un momento quieto y corre las tareas (cada una con su error
 * tragado: precargar es un atajo, nunca un fallo). Devuelve con qué cancelar si todavía no corrió. `tasks` puede ser
 * una función: la lista se arma en el momento quieto (así lee el tier de ese momento).
 */
export function idlePreloader(tasks: readonly PreloadTask[] | (() => readonly PreloadTask[]), timeoutMs = PRELOAD_IDLE_TIMEOUT_MS): { schedule(env: IdleEnv): () => void; started(): boolean } {
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
        let list: readonly PreloadTask[] = [];
        try {
          list = typeof tasks === "function" ? tasks() : tasks;
        } catch {
          // armar la lista no puede tirar abajo el menú; sin lista no se precarga
        }
        for (const task of list) {
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
