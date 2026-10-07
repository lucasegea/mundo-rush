// Tipos del compilador de contenido. Todo es puro: entra texto, sale datos (el IO es de scripts/content/build.ts).

/** Un archivo de content/ con su ruta relativa a la raíz del repo (`content/missions/M0.1.yaml`). */
export interface ArchivoFuente {
  ruta: string;
  texto: string;
}

/** Un error o aviso de validación. Siempre nombra archivo y clave (04 F1.2 A2). */
export interface Hallazgo {
  nivel: "error" | "aviso";
  archivo: string;
  /** Ruta de clave dentro del YAML (`escenas[0].npc`); vacía si es del archivo entero. */
  clave: string;
  regla: string;
  mensaje: string;
}

export const formatearHallazgo = (h: Hallazgo): string =>
  `${h.nivel === "error" ? "ERROR" : "aviso"} ${h.archivo}${h.clave ? ` › ${h.clave}` : ""} [${h.regla}] ${h.mensaje}`;

/** Ruta de clave legible a partir de un path de zod o de un recorrido. */
export const clave = (path: readonly PropertyKey[]): string =>
  path.reduce<string>((acc, p) => (typeof p === "number" ? `${acc}[${p}]` : acc ? `${acc}.${String(p)}` : String(p)), "");

/** Modo de compilación (03 §8.3): dev muestra borradores marcados; release y fv filtran por estado. */
export type Modo = "dev" | "fv" | "release";

export interface Entrada<T> {
  archivo: string;
  /** Prefijo de clave dentro del archivo cuando varios ítems comparten archivo (`plantillas[3]`). */
  base: string;
  data: T;
}
