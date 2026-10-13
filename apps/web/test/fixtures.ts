// Fixture de plan estetica-c M5 (sacado en 43c2b48, antes de migrar test.yaml al formato de la maqueta): la grilla de
// caminata compilada del diorama de prueba en tiles, celda por celda. Plan estetica-c M7: el layout en tiles se retiró
// con las capas `tiles` del schema; la grilla queda como registro de que la migración no cambió qué se camina.
const FILES = import.meta.glob("./fixtures/*.json", { import: "default", eager: true }) as Record<string, unknown>;

const fixture = (name: string): unknown => {
  const v = FILES[`./fixtures/${name}`];
  if (v === undefined) throw new Error(`falta el fixture ${name}`);
  return v;
};

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
