// Cargador del contenido compilado del servidor (03 §4.2.1, §6.5.2): lee apps/server/generated/content/*.json.
// Solo con LG_DEV_CONTENT_WATCH=1 (modo director, FD0) observa la carpeta y relee cuando cambió, y lo hace para la
// PRÓXIMA escena: una escena en curso conserva el contenido con el que arrancó. Sin la variable no observa nada.
// Solo lectura (D-108: el servidor no escribe a disco fuera de src/store/ y src/cost/).
import { readdirSync, readFileSync, watch as fsWatch } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const GENERATED_CONTENT_DIR = fileURLToPath(new URL("../../generated/content/", import.meta.url));

/** Archivo compilado → su JSON. */
export type ServerContent = Readonly<Record<string, unknown>>;

/** Lo mínimo de fs.watch: avisa cambios en la carpeta y se cierra. */
export type WatchDir = (dir: string, onChange: () => void) => { close(): void };

export interface LoaderOptions {
  dir?: string;
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
  const dir = options.dir ?? GENERATED_CONTENT_DIR;
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
