// Dobles y utilidades de los tests de apps/web (F1.3). Sin navegador real (D-016): jsdom donde hace falta DOM.
import { compilarContenido, formatearHallazgo, type ArchivoFuente } from "@lg/content-schema";
import { boot, type BootDeps } from "../src/boot";
import type { FetchJson } from "../src/services/content";
import type { Platform } from "../src/services/platform";
import type { QualityEnv } from "../src/services/quality";
import { actions } from "../src/state/actions";
import { gameStore, initialGameState } from "../src/state/store";

/** Vuelve el store único a su estado inicial (la UI lee el store único, como en la app). */
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

/** Navegador simulado: con o sin WebGL2, con memoria y núcleos dados. */
export const fakeQualityEnv = ({ webgl2, memory = 8, cores = 8 }: { webgl2: boolean; memory?: number; cores?: number }): QualityEnv => ({
  createCanvas: () => ({ getContext: () => (webgl2 ? {} : null) }),
  deviceMemory: memory,
  hardwareConcurrency: cores,
});

// El contenido REAL de content/ compilado en memoria con el compilador de F1.2 (lo mismo que escribe
// validate:content en apps/web/public/content/, que está fuera de git y puede no existir todavía).
const RAW = import.meta.glob("../../../content/**/*.{yaml,txt}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export function compiledClientContent(): Record<string, unknown> {
  const files: ArchivoFuente[] = Object.entries(RAW)
    .map(([path, texto]) => ({ ruta: path.replace(/^(\.\.\/)+/, ""), texto }))
    // Igual que el reader legacy de scripts/content/build.ts (D-805): la campesino NO desciende a content/universes/;
    // esos árboles son otros universos y sus rutas no son canónicas de la campesino (colarlos rompería la compilación).
    .filter((f) => !f.ruta.startsWith("content/universes/"));
  const r = compilarContenido(files, "dev");
  if (!r.salida) throw new Error(`el contenido real no compila:\n${r.errores.map(formatearHallazgo).join("\n")}`);
  return r.salida.cliente;
}

// Universos namespaceados (book-mode slice-1): content/universes/<id>/** compilado en memoria. Cada ruta se normaliza
// a su canónica `content/<subpath>` (igual que el reader de scripts/content/build.ts, D-804) para que el compilador
// —los mismos 23 regexes de RUTAS— la clasifique sin cambios. Es la salida del cliente que escribe build:content
// --universe=<id> en apps/web/public/content/<id>/ (fuera de git, puede no existir aún).
const RAW_UNIVERSES = import.meta.glob("../../../content/universes/**/*.{yaml,txt}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

export function compiledUniverseClientContent(universe: string): Record<string, unknown> {
  const prefijo = `content/universes/${universe}/`;
  const files: ArchivoFuente[] = Object.entries(RAW_UNIVERSES)
    .map(([path, texto]) => ({ path: path.replace(/^(\.\.\/)+/, ""), texto }))
    .filter(({ path }) => path.startsWith(prefijo))
    .map(({ path, texto }) => ({ ruta: `content/${path.slice(prefijo.length)}`, texto }));
  if (files.length === 0) throw new Error(`no hay contenido para el universo ${universe} en content/universes/`);
  const r = compilarContenido(files, "dev");
  if (!r.salida) throw new Error(`el universo ${universe} no compila:\n${r.errores.map(formatearHallazgo).join("\n")}`);
  return r.salida.cliente;
}

/** fetch simulado que sirve la salida compilada del cliente bajo /content/. */
export const fetchFromContent = (files: Record<string, unknown>): FetchJson => (url) => {
  const name = url.slice(url.lastIndexOf("/") + 1);
  return name in files ? Promise.resolve(files[name]) : Promise.reject(new Error(`404 ${url}`));
};

export interface BootOptions {
  webgl2: boolean;
  platform?: Pick<Platform, "storage">;
  fetchJson?: FetchJson;
  prefersReducedMotion?: boolean;
  /** F2: input y lazo de simulación (sin esto, boot no escucha teclas ni corre pasos). */
  world?: NonNullable<BootDeps["world"]>;
  /** F4.2: servidor de escenas (falso en los tests del HUD). */
  scene?: NonNullable<BootDeps["scene"]>;
  /** book-mode slice-1 (S4/D-806): universo a jugar; unset ⇒ U-CAMPESINO (el árbol legacy). */
  universeId?: string;
}

/** Arranca la app con el store y las acciones reales y un navegador simulado. */
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
