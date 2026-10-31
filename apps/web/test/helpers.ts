// Doubles and utilities for the apps/web tests (F1.3). No real browser (D-016): jsdom where a DOM is needed.
import { parseApariencia, type CharacterLook } from "@lg/art";
import { compilarContenido, formatearHallazgo, type ArchivoFuente } from "@lg/content-schema";
import { boot, type BootDeps } from "../src/boot";
import type { FetchJson } from "../src/services/content";
import type { Platform } from "../src/services/platform";
import type { QualityEnv } from "../src/services/quality";
import { actions } from "../src/state/actions";
import { fallbackLook, PLAYER_LOOK, PLAYER_LOOK_ID } from "../src/world/actors/looks";
import { gameStore, initialGameState } from "../src/state/store";

/** Resets the single store to its initial state (the UI reads the single store, as in the app). */
export const resetStore = (): void => gameStore.setState(initialGameState(), true);

export const memoryPlatform = (initial: Record<string, string> = {}): Pick<Platform, "storage"> & { data: Map<string, string> } => {
  const data = new Map(Object.entries(initial));
  return {
    data,
    storage: {
      get: (k) => Promise.resolve(data.get(k) ?? null),
      set: (k, v) => { data.set(k, v); return Promise.resolve(); },
      remove: (k) => { data.delete(k); return Promise.resolve(); },
    },
  };
};

/** Simulated browser: with or without WebGL2, with given memory and cores. */
export const fakeQualityEnv = ({ webgl2, memory = 8, cores = 8 }: { webgl2: boolean; memory?: number; cores?: number }): QualityEnv => ({
  createCanvas: () => ({ getContext: () => (webgl2 ? {} : null) }),
  deviceMemory: memory,
  hardwareConcurrency: cores,
});

// The REAL content/ compiled in memory with F1.2's compiler (the same that validate:content writes
// to apps/web/public/content/, which is outside git and may not exist yet).
const RAW = import.meta.glob("../../../content/**/*.{yaml,txt}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/**
 * The compiler's whole result over the farmer's real content (validated set included), in dev mode.
 * Same as the legacy reader of scripts/content/build.ts (D-805): the farmer does NOT descend into content/universes/;
 * those trees are other universes and their paths are not canonical for the farmer (letting them in would break compilation).
 */
export function compiledContent(): ReturnType<typeof compilarContenido> {
  const files: ArchivoFuente[] = Object.entries(RAW)
    .map(([path, texto]) => ({ ruta: path.replace(/^(\.\.\/)+/, ""), texto }))
    .filter((f) => !f.ruta.startsWith("content/universes/"));
  return compilarContenido(files, "dev");
}

export function compiledClientContent(): Record<string, unknown> {
  const r = compiledContent();
  if (!r.salida) throw new Error(`el contenido real no compila:\n${r.errores.map(formatearHallazgo).join("\n")}`);
  return r.salida.cliente;
}

// Namespaced universes (book-mode slice-1): content/universes/<id>/** compiled in memory. Each path is normalized
// to its canonical `content/<subpath>` (same as the reader of scripts/content/build.ts, D-804) so the compiler
// —the same 23 RUTAS regexes— classifies it unchanged. It is the client output that build:content --universe=<id>
// writes to apps/web/public/content/<id>/ (outside git, may not exist yet).
const RAW_UNIVERSES = import.meta.glob("../../../content/universes/**/*.{yaml,txt}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

// open-world-3d T3: like build.ts's reader, a universe compiles together with the global assets and credits registry
// (its NPCs use the bodies of content/assets-registry.yaml).
const RAW_GLOBAL_REGISTRY = import.meta.glob(["../../../content/assets-registry.yaml", "../../../content/creditos.yaml"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export function compiledUniverseClientContent(universe: string): Record<string, unknown> {
  const prefijo = `content/universes/${universe}/`;
  const files: ArchivoFuente[] = Object.entries(RAW_UNIVERSES)
    .map(([path, texto]) => ({ path: path.replace(/^(\.\.\/)+/, ""), texto }))
    .filter(({ path }) => path.startsWith(prefijo))
    .map(({ path, texto }) => ({ ruta: `content/${path.slice(prefijo.length)}`, texto }));
  if (files.length === 0) throw new Error(`no hay contenido para el universo ${universe} en content/universes/`);
  const globales = Object.entries(RAW_GLOBAL_REGISTRY).map(([path, texto]) => ({ ruta: path.replace(/^(\.\.\/)+/, ""), texto }));
  const r = compilarContenido([...files, ...globales], "dev");
  if (!r.salida) throw new Error(`el universo ${universe} no compila:\n${r.errores.map(formatearHallazgo).join("\n")}`);
  return r.salida.cliente;
}

/** Simulated fetch that serves the client's compiled output under /content/. */
export const fetchFromContent = (files: Record<string, unknown>): FetchJson => (url) => {
  const name = url.slice(url.lastIndexOf("/") + 1);
  return name in files ? Promise.resolve(files[name]) : Promise.reject(new Error(`404 ${url}`));
};

export interface BootOptions {
  webgl2: boolean;
  platform?: Pick<Platform, "storage">;
  fetchJson?: FetchJson;
  prefersReducedMotion?: boolean;
  /** F2: input and simulation loop (without this, boot neither listens to keys nor runs steps). */
  world?: NonNullable<BootDeps["world"]>;
  /** F4.2: scene server (fake in the HUD tests). */
  scene?: NonNullable<BootDeps["scene"]>;
  /** book-mode slice-1 (S4/D-806): universe to play; unset ⇒ U-CAMPESINO (the legacy tree). */
  universeId?: string;
}

/** Starts the app with the real store and actions and a simulated browser. */
export const bootApp = (o: BootOptions) =>
  boot({
    store: gameStore,
    actions,
    platform: o.platform ?? memoryPlatform(),
    qualityEnv: fakeQualityEnv({ webgl2: o.webgl2 }),
    prefersReducedMotion: o.prefersReducedMotion ?? false,
    baseUrl: "/",
    fetchJson: o.fetchJson ?? fetchFromContent(compiledClientContent()),
    ...(o.universeId ? { universeId: o.universeId } : {}),
    ...(o.world ? { world: o.world } : {}),
    ...(o.scene ? { scene: o.scene } : {}),
  });

let looksCache: Readonly<Record<string, CharacterLook>> | null = null;
/**
 * Plan estetica-c M5: the real content's appearances (each sheet's `apariencia` block, via compiled npcs.json)
 * plus the player's (PLAYER_LOOK, in code until there is a player content file).
 */
export function contentLooks(): Readonly<Record<string, CharacterLook>> {
  if (looksCache) return looksCache;
  const out: Record<string, CharacterLook> = { [PLAYER_LOOK_ID]: PLAYER_LOOK };
  for (const n of compiledClientContent()["npcs.json"] as { id: string; apariencia: unknown }[]) {
    if (n.apariencia === null) continue;
    const r = parseApariencia(n.apariencia);
    if (!r.ok) throw new Error(`${n.id}: ${r.error}`);
    out[n.id] = r.look;
  }
  looksCache = out;
  return out;
}

/** The appearance of `id` as the game draws it: the content's, or the fallback one. */
export const lookOf = (id: string): CharacterLook => contentLooks()[id] ?? fallbackLook(id);
