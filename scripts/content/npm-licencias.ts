// Licencias de npm del cliente (open-world-3d T2(c), AC9, D-831): todo paquete del cierre de PRODUCCIÓN de apps/web
// (dependencies y optionalDependencies, transitivas, resueltas como Node desde package-lock.json) tiene una `license` del
// lockfile en la lista D1, o una fila en content/npm-licence-overrides.yaml con licencia D1 y el sha256 de su LICENSE.
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

/** Resuelve `nombre` desde la entrada `desde` como lo hace Node: node_modules anidados, hacia arriba. */
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

/** Claves del lockfile del cierre de producción de un workspace (los workspaces enlazados se siguen por su carpeta). */
export const cierreProduccion = (lock: Lock, workspace = "apps/web"): string[] => {
  const vistos = new Set<string>();
  const pila = [workspace];
  while (pila.length > 0) {
    const desde = pila.pop() as string;
    const e = lock.packages[desde];
    if (!e) continue;
    for (const nombre of Object.keys({ ...(e.dependencies ?? {}), ...(e.optionalDependencies ?? {}) })) {
      let clave = resolver(lock, nombre, desde);
      if (clave === null) continue; // opcional de otra plataforma, podada del lockfile
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
 * Problemas de licencia del cierre (vacío = bien). `hashLicencia(clave)` da el sha256 del LICENSE del paquete en
 * node_modules (o null si no hay archivo); se inyecta para probar con lockfiles de mentira.
 */
export const problemasNpm = (lock: Lock, overrides: Record<string, Override>, hashLicencia: (clave: string) => string | null, workspace = "apps/web"): string[] =>
  cierreProduccion(lock, workspace).flatMap((clave) => {
    const e = lock.packages[clave];
    if (!e || !clave.includes("node_modules/")) return []; // un workspace propio (packages/*), no es de terceros
    const id = `${nombreDe(clave)}@${e.version ?? "?"}`;
    if (e.license !== undefined) return licenciaPermitida(e.license) ? [] : [`${id}: licencia "${e.license}" fuera de la lista D1`];
    const o = overrides[id];
    if (!o) return [`${id}: sin license en el lockfile y sin fila en content/npm-licence-overrides.yaml`];
    if (!licenciaPermitida(o.license)) return [`${id}: el override dice "${o.license}", fuera de la lista D1`];
    const real = hashLicencia(clave);
    return real === o.license_file_sha256 ? [] : [`${id}: el LICENSE en node_modules (${real ?? "no existe"}) no coincide con el override (${o.license_file_sha256})`];
  });
