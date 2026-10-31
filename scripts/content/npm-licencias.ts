// npm licenses of the client (open-world-3d T2(c), AC9, D-831): every package in the PRODUCTION closure of apps/web
// (dependencies and optionalDependencies, transitive, resolved like Node from package-lock.json) has a lockfile `license` in the
// D1 list, or a row in content/npm-licence-overrides.yaml with a D1 license and the sha256 of its LICENSE.
import { licenciaPermitida } from "@lg/content-schema";

interface EntradaLock {
  version?: string;
  license?: string;
  link?: boolean;
  resolved?: string;
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}
export interface Lock {
  packages: Record<string, EntradaLock>;
}
export interface Override {
  license: string;
  license_file_sha256: string;
}

/** Resolves `nombre` from the entry `desde` the way Node does: nested node_modules, upward. */
const resolver = (lock: Lock, nombre: string, desde: string): string | null => {
  let base = desde;
  for (;;) {
    const clave = `${base === "" ? "" : `${base}/`}node_modules/${nombre}`;
    if (clave in lock.packages) return clave;
    if (base === "") return null;
    const i = base.lastIndexOf("node_modules/");
    base = i < 0 ? "" : base.slice(0, i).replace(/\/$/, "");
  }
};

/** Lockfile keys of a workspace's production closure (linked workspaces are followed by their folder). */
export const cierreProduccion = (lock: Lock, workspace = "apps/web"): string[] => {
  const vistos = new Set<string>();
  const pila = [workspace];
  while (pila.length > 0) {
    const desde = pila.pop() as string;
    const e = lock.packages[desde];
    if (!e) continue;
    for (const nombre of Object.keys({ ...(e.dependencies ?? {}), ...(e.optionalDependencies ?? {}) })) {
      let clave = resolver(lock, nombre, desde);
      if (clave === null) continue; // optional for another platform, pruned from the lockfile
      const enlace = lock.packages[clave];
      if (enlace?.link && enlace.resolved) clave = enlace.resolved;
      if (!vistos.has(clave)) {
        vistos.add(clave);
        pila.push(clave);
      }
    }
  }
  return [...vistos].sort();
};

const nombreDe = (clave: string): string => clave.slice(clave.lastIndexOf("node_modules/") + "node_modules/".length);

/**
 * License problems of the closure (empty = fine). `hashLicencia(clave)` gives the sha256 of the package's LICENSE in
 * node_modules (or null if there is no file); it is injected to test with fake lockfiles.
 */
export const problemasNpm = (lock: Lock, overrides: Record<string, Override>, hashLicencia: (clave: string) => string | null, workspace = "apps/web"): string[] =>
  cierreProduccion(lock, workspace).flatMap((clave) => {
    const e = lock.packages[clave];
    if (!e || !clave.includes("node_modules/")) return []; // one of our own workspaces (packages/*), not third-party
    const id = `${nombreDe(clave)}@${e.version ?? "?"}`;
    if (e.license !== undefined) return licenciaPermitida(e.license) ? [] : [`${id}: licencia "${e.license}" fuera de la lista D1`];
    const o = overrides[id];
    if (!o) return [`${id}: sin license en el lockfile y sin fila en content/npm-licence-overrides.yaml`];
    if (!licenciaPermitida(o.license)) return [`${id}: el override dice "${o.license}", fuera de la lista D1`];
    const real = hashLicencia(clave);
    return real === o.license_file_sha256 ? [] : [`${id}: el LICENSE en node_modules (${real ?? "no existe"}) no coincide con el override (${o.license_file_sha256})`];
  });
