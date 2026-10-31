// Loader for the server's compiled content (03 §4.2.1, §6.5.2): reads apps/server/generated/content/*.json.
// Only with LG_DEV_CONTENT_WATCH=1 (director mode, FD0) does it watch the folder and reread when it changed, and it does so for the
// NEXT scene: a scene in progress keeps the content it started with. Without the variable it watches nothing.
// Read-only (D-108: the server does not write to disk outside src/store/ and src/cost/).
import { readdirSync, readFileSync, watch as fsWatch } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const GENERATED_CONTENT_DIR = fileURLToPath(new URL("../../generated/content/", import.meta.url));

/** Default universe when `session.universeId` is absent (D-806: the curated fallback). */
export const UNIVERSO_DEFECTO = "U-CAMPESINO";

/** Environment variable the boot (dev:play --universe) uses to choose the server session's universe (S4/D-806). */
export const LG_UNIVERSE_VAR = "LG_UNIVERSE";

/** The session's universe according to the environment: empty or absent ⇒ undefined (the loader falls back to U-CAMPESINO, D-806). */
export const universeIdFromEnv = (env: Record<string, string | undefined>): string | undefined =>
  (env[LG_UNIVERSE_VAR] ?? "") === "" ? undefined : env[LG_UNIVERSE_VAR];

/**
 * Compiled directory of a universe (D-806: one selection concept between build and run).
 * unset / U-CAMPESINO → the legacy root (`baseDir`), which is where the flagless build writes (verbatim).
 * Other id → `baseDir/<id>/`, which is where the build with `--universe=<id>` writes.
 */
export const resolverDirUniverso = (baseDir: string, universeId?: string): string => {
  const id = universeId ?? UNIVERSO_DEFECTO;
  return id === UNIVERSO_DEFECTO ? baseDir : join(baseDir, id);
};

/** Compiled file → its JSON. */
export type ServerContent = Readonly<Record<string, unknown>>;

/** The minimum of fs.watch: reports changes in the folder and closes. */
export type WatchDir = (dir: string, onChange: () => void) => { close(): void };

export interface LoaderOptions {
  dir?: string;
  /** Universe to load (D-806). Ignored if an explicit `dir` is passed. unset ⇒ U-CAMPESINO. */
  universeId?: string;
  env?: Record<string, string | undefined>;
  watch?: WatchDir;
}

export interface ContentLoader {
  /** The content for a scene that starts now. */
  forNextScene(): ServerContent;
  /** true if it watches the folder (LG_DEV_CONTENT_WATCH=1). */
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
  // M5 SEAM: the session boot (T5.1) passes `universeId` from `session.universeId` / the `--universe` flag of dev:play.
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
          // Mid-write by the compiler a file may be missing: carry on with the last good one and retry.
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
