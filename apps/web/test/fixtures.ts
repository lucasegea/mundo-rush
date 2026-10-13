// Fixtures de plan estetica-c M5 (sacados en 43c2b48, antes de migrar test.yaml al formato de la maqueta): el diorama
// de prueba en tiles (lo que lee el adaptador de M1 hasta M7) y su grilla de caminata compilada, celda por celda.
const FILES = import.meta.glob("./fixtures/*.json", { import: "default", eager: true }) as Record<string, unknown>;

const fixture = (name: string): unknown => {
  const v = FILES[`./fixtures/${name}`];
  if (v === undefined) throw new Error(`falta el fixture ${name}`);
  return v;
};

/** content/dioramas/test.yaml en 43c2b48 (tiles), parseado tal cual. */
export const TILES_FIXTURE = fixture("test-tiles-43c2b48.json");

export interface GridFixture {
  originX: number;
  originZ: number;
  cols: number;
  rows: number;
  cellSize: number;
  /** Una cadena por fila: `.` caminable, `#` bloqueada. */
  celdas: string[];
}

/** La grilla de caminata de ese test.yaml, compilada por prepareDiorama en 43c2b48. */
export const GRID_FIXTURE = fixture("test-grid-tiles-43c2b48.json") as GridFixture;
