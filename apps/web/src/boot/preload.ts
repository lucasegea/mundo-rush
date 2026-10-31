// boot/preload.ts — world preload while the menu is idle (open-world-3d T10 (d), D-835, AC63): the 3D chunk
// (GameCanvas and three) and the open-world tree .glb files download in a requestIdleCallback before the click, so
// the measured load (lg:world-enter → lg:world-first-frame) does not wait for them. Without requestIdleCallback (Safari, jsdom) nothing is
// preloaded: the world downloads on click, as before. What is here is pure; App.tsx wires it up.
// T10-integrate: ONE list of targets (`WORLD_PRELOAD`), one per line: 3D chunk, post-processing chunk (only if
// the tier draws it), the tree and rock .glb files, the map data and the decoders. Adding one is one line.
//
// SEAM (T10-measure): the files go to the browser's HTTP cache (full fetch); GLTFLoader, the KTX2Loader and the
// diorama loader request them again with the same url. If the static server forces revalidation, the next
// step is to hand over the ArrayBuffers in memory.
import { lookForRelief, natureModelFiles, publicUrl, type WorldLook } from "@lg/art";
import type { AppPhase } from "@lg/core";
import { DIORAMAS_FILE, universeContentBase } from "../services/content";

/** Wait cap for requestIdleCallback: if the menu never goes idle, the preload starts anyway at 2 s. */
export const PRELOAD_IDLE_TIMEOUT_MS = 2_000;

/** The minimum of the browser for the preload (globalThis in the app; a double in tests). */
export interface IdleEnv {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
}

export interface PreloadTrigger {
  phase: AppPhase;
  /** The main menu is the top panel. */
  menuOpen: boolean;
  /** The effective tier lets the map in (without WebGL or in dialog-only mode, nothing is downloaded). */
  worldAvailable: boolean;
}

/** Preload now? With the menu up, the map available and outside the world (inside, it is already loaded). */
export const shouldPreloadWorld = (t: PreloadTrigger): boolean => t.menuOpen && t.worldAvailable && t.phase !== "world";

const withBase = (baseUrl: string, files: readonly string[]): string[] => {
  const base = baseUrl.replace(/\/$/, "");
  return [...new Set(files)].map((f) => `${base}${publicUrl(f)}`);
};

/**
 * The .glb files of trees (full and light per species) and rocks (full and distant per scan) of the open-world
 * look: `natureModelFiles`, with the same url that buildNature requests (`base` without the trailing slash + the public path). By
 * default the relief look (DEFAULT_LOOK).
 */
export function naturePreloadUrls(baseUrl: string, look: WorldLook = lookForRelief(true)): string[] {
  return withBase(baseUrl, natureModelFiles(look));
}

/** The self-hosted decoders in apps/web/public/decoders/ (meshopt for the .glb files, basis for the .ktx2). */
export const DECODER_FILES = ["meshopt_decoder.module.js", "basis_transcoder.js", "basis_transcoder.wasm"] as const;

/** What the preload targets need (App.tsx builds it; tests, by hand). */
export interface PreloadContext {
  baseUrl: string;
  /** Universe to play (S4/D-806): the map data path comes from it. */
  universeId?: string | undefined;
  /** The tier draws post-processing (`low`, dialog-only and "reduce motion" never download its chunk, D-160). */
  post: boolean;
  /** The same import() calls the lazy() ones use (Vite deduplicates them: the click finds the chunk already downloaded). */
  loadCanvas: () => Promise<unknown>;
  loadPost: () => Promise<unknown>;
  /** Downloads a whole url (fetch + arrayBuffer in the app). */
  fetchUrl: (url: string) => Promise<unknown>;
}

type PreloadTask = () => Promise<unknown>;
const fetchAll = (c: PreloadContext, urls: readonly string[]): PreloadTask[] => urls.map((u) => () => c.fetchUrl(u));

/** THE list of preload targets, one per line and named (adding one is adding a line). */
export const WORLD_PRELOAD: readonly { id: string; tasks: (c: PreloadContext) => PreloadTask[] }[] = [
  { id: "chunk-3d", tasks: (c) => [c.loadCanvas] },
  { id: "chunk-post", tasks: (c) => (c.post ? [c.loadPost] : []) },
  { id: "naturaleza", tasks: (c) => fetchAll(c, naturePreloadUrls(c.baseUrl)) },
  { id: "mapa", tasks: (c) => fetchAll(c, [`${universeContentBase(c.baseUrl, c.universeId)}${DIORAMAS_FILE}`]) },
  { id: "decodificadores", tasks: (c) => fetchAll(c, DECODER_FILES.map((f) => `${c.baseUrl}decoders/${f}`)) },
];

/** The tasks of all the targets, in the order of the list. */
export const worldPreloadTasks = (c: PreloadContext): PreloadTask[] => WORLD_PRELOAD.flatMap((t) => t.tasks(c));

/**
 * A one-shot preloader: `schedule(env)` asks for an idle moment and runs the tasks (each with its error
 * swallowed: preloading is a shortcut, never a failure). Returns what cancels it if it has not run yet. `tasks` can be
 * a function: the list is built at the idle moment (so it reads the tier of that moment).
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
          // building the list must not bring the menu down; without a list nothing is preloaded
        }
        for (const task of list) {
          try {
            void task().catch(() => {});
          } catch {
            // a task that throws on startup does not stop the others
          }
        }
      }, { timeout: timeoutMs });
      return () => {
        if (!ran) env.cancelIdleCallback?.call(env, id);
      };
    },
  };
}
