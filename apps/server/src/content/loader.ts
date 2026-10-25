// Cargador del contenido compilado del servidor (03 §4.2.1, §6.5.2): lee apps/server/generated/content/*.json.
// Solo con LG_DEV_CONTENT_WATCH=1 (modo director, FD0) observa la carpeta y relee cuando cambió, y lo hace para la
// PRÓXIMA escena: una escena en curso conserva el contenido con el que arrancó. Sin la variable no observa nada.
// Solo lectura (D-108: el servidor no escribe a disco fuera de src/store/ y src/cost/).
import { readdirSync, readFileSync, watch as fsWatch } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const GENERATED_CONTENT_DIR = fileURLToPath(new URL("../../generated/content/", import.meta.url));

/** Universo por defecto cuando `session.universeId` no está (D-806: el fallback curado). */
export const UNIVERSO_DEFECTO = "U-CAMPESINO";

/** Variable de entorno con la que el boot (dev:play --universe) elige el universo de la sesión del servidor (S4/D-806). */
export const LG_UNIVERSE_VAR = "LG_UNIVERSE";

/** El universo de la sesión según el entorno: vacío o ausente ⇒ undefined (el loader cae en U-CAMPESINO, D-806). */
export const universeIdFromEnv = (env: Record<string, string | undefined>): string | undefined =>
  (env[LG_UNIVERSE_VAR] ?? "") === "" ? undefined : env[LG_UNIVERSE_VAR];

/**
 * Directorio compilado de un universo (D-806: un concepto de selección entre build y run).
 * unset / U-CAMPESINO → la raíz legacy (`baseDir`), que es donde el build sin flag escribe (verbatim).
 * Otro id → `baseDir/<id>/`, que es donde el build con `--universe=<id>` escribe.
 */
export const resolverDirUniverso = (baseDir: string, universeId?: string): string => {
  const id = universeId ?? UNIVERSO_DEFECTO;
  return id === UNIVERSO_DEFECTO ? baseDir : join(baseDir, id);
};

/** Archivo compilado → su JSON. */
export type ServerContent = Readonly<Record<string, unknown>>;

/** Lo mínimo de fs.watch: avisa cambios en la carpeta y se cierra. */
export type WatchDir = (dir: string, onChange: () => void) => { close(): void };

export interface LoaderOptions {
  dir?: string;
  /** Universo a cargar (D-806). Ignorado si se pasa `dir` explícito. unset ⇒ U-CAMPESINO. */
  universeId?: string;
  env?: Record<string, string | undefined>;
  watch?: WatchDir;
}

export interface ContentLoader {
  /** El contenido para una escena que arranca ahora. */
  forNextScene(): ServerContent;
  /** true si observa la carpeta (LG_DEV_CONTENT_WATCH=1). */
  readonly watching: boolean;
  close(): void;
}

const nodeWatch: WatchDir = (dir, onChange) => fsWatch(dir, onChange);

export function readGeneratedContent(dir: string): ServerContent {
  const out: Record<string, unknown> = {};
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    out[name] = JSON.parse(readFileSync(join(dir, name), "utf8")) as unknown;
  }
  return Object.freeze(out);
}

export function createContentLoader(options: LoaderOptions = {}): ContentLoader {
  // M5 SEAM: el boot de sesión (T5.1) pasa `universeId` desde `session.universeId` / el flag `--universe` de dev:play.
  const dir = options.dir ?? resolverDirUniverso(GENERATED_CONTENT_DIR, options.universeId);
  const watching = (options.env ?? process.env)["LG_DEV_CONTENT_WATCH"] === "1";
  let current = readGeneratedContent(dir);
  let stale = false;
  const watcher = watching ? (options.watch ?? nodeWatch)(dir, () => { stale = true; }) : null;
  return {
    watching,
    forNextScene(): ServerContent {
      if (stale) {
        stale = false;
        try {
          current = readGeneratedContent(dir);
        } catch (err) {
          // A mitad de una escritura del compilador puede faltar un archivo: se sigue con el último bueno y se reintenta.
          stale = true;
          console.warn("[content] relectura fallida, sigue el contenido anterior:", err instanceof Error ? err.message : err);
        }
      }
      return current;
    },
    close(): void {
      watcher?.close();
    },
  };
}
