// Content compiler types. Everything is pure: text goes in, data comes out (IO belongs to scripts/content/build.ts).

/** A content/ file with its path relative to the repo root (`content/missions/M0.1.yaml`). */
export interface ArchivoFuente {
  ruta: string;
  texto: string;
}

/** A validation error or warning. Always names the file and key (04 F1.2 A2). */
export interface Hallazgo {
  nivel: "error" | "aviso";
  archivo: string;
  /** Key path inside the YAML (`escenas[0].npc`); empty if it belongs to the whole file. */
  clave: string;
  regla: string;
  mensaje: string;
}

export const formatearHallazgo = (h: Hallazgo): string =>
  `${h.nivel === "error" ? "ERROR" : "aviso"} ${h.archivo}${h.clave ? ` › ${h.clave}` : ""} [${h.regla}] ${h.mensaje}`;

/** Readable key path from a zod path or a traversal. */
export const clave = (path: readonly PropertyKey[]): string =>
  path.reduce<string>((acc, p) => (typeof p === "number" ? `${acc}[${p}]` : acc ? `${acc}.${String(p)}` : String(p)), "");

/** Compilation mode (03 §8.3): dev shows marked drafts; release and fv filter by state. */
export type Modo = "dev" | "fv" | "release";

export interface Entrada<T> {
  archivo: string;
  /** Key prefix inside the file when several items share a file (`plantillas[3]`). */
  base: string;
  data: T;
}
