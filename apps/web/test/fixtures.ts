// Plan estetica-c M5 fixture (taken at 43c2b48, before migrating test.yaml to the diorama format): the compiled
// walk grid of the tile-based test diorama, cell by cell. Plan estetica-c M7: the tile layout was retired
// with the schema's `tiles` layers; the grid remains as a record that the migration did not change what is walkable.
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
  /** One string per row: `.` walkable, `#` blocked. */
  celdas: string[];
}

/** That test.yaml's walk grid, compiled by prepareDiorama at 43c2b48. */
export const GRID_FIXTURE = fixture("test-grid-tiles-43c2b48.json") as GridFixture;
