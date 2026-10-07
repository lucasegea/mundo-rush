// Rutas y escrituras del modo director (03 §6.5.1-§6.5.2). Todo vive en `.director/` (gitignored): nada sale de la máquina.
import { mkdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Raíz del repo (tooling/director/src → ../../..). */
export const REPO_ROOT = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

export const directorDir = (root: string): string => join(root, ".director");
export const statePath = (root: string): string => join(directorDir(root), "state.json");
export const journalDir = (root: string): string => join(directorDir(root), "journal");
export const journalPath = (root: string, sessionId: string): string => join(journalDir(root), `${sessionId}.jsonl`);

/** Las operaciones de disco de la escritura atómica (inyectables para probar el orden). */
export interface AtomicFs {
  writeFileSync(path: string, data: string): void;
  renameSync(from: string, to: string): void;
  rmSync(path: string): void;
}

const nodeFs: AtomicFs = {
  writeFileSync: (p, d) => writeFileSync(p, d),
  renameSync: (a, b) => renameSync(a, b),
  rmSync: (p) => rmSync(p, { force: true }),
};

let counter = 0;
const pause = (ms: number): void => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

/**
 * Escritura atómica: temporal en la MISMA carpeta (el rename no cruza discos) + rename. Quien lee (CLI, MCP) nunca ve
 * un JSON a medias. En Windows el rename falla con EPERM/EBUSY si alguien tiene el archivo abierto: reintenta.
 */
export function writeJsonAtomic(path: string, data: unknown, fs: AtomicFs = nodeFs): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${++counter}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  for (let attempt = 1; ; attempt++) {
    try {
      fs.renameSync(tmp, path);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= 5 || (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES")) {
        fs.rmSync(tmp);
        throw err;
      }
      pause(10 * attempt);
    }
  }
}
