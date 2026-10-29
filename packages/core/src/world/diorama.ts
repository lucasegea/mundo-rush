// Diorama listo para jugar (03 §6.4.3): del layout de contenido (YAML compilado a JSON) al suelo de la maqueta,
// volúmenes, NPCs, interactuables y grilla de caminabilidad. Puro: lo llama la acción que carga el diorama.
// Plan estetica-c M5 (D-207): el formato de la maqueta (caminos y ríos por curvas, agua por polígonos, detalle por
// zonas, props con giro, tinte e instancias). El núcleo muestrea las curvas una vez y deja los datos listos; no sabe
// nada del look (alturas y colores los decide world/terrain/). La grilla sale de los props, el agua, los ríos, los
// polígonos `no_caminable` y los NPCs. Plan estetica-c M7 (D-207): las capas `tiles` y `atlas_tiles` de HD-2D se
// retiraron; el schema las rechaza y el núcleo ya no las lee.
import {
  buildWalkGrid, DEFAULT_INTERACT_RADIUS, type Bounds, type Interactable, type Point, type Rect, type WalkGrid,
} from "../movement";
import { sampleCatmullRom } from "./curves";

type Vec3 = readonly [number, number, number];
type Vec2 = readonly [number, number];

/** Forma del layout que consume el juego (la valida el schema de content-schema al compilar). */
export interface DioramaLayout {
  id: string;
  bounds: Bounds;
  /** Punto de aparición del jugador; sin él, el centro de los límites. */
  spawn?: Vec3;
  /**
   * Volúmenes. Con `tam` (ancho, alto, profundidad) su huella bloquea la grilla. `rotY` en grados; `tinte`, token que
   * reemplaza el color principal; `instancias`, los lugares de un prop repetido (en lugar de `pos`).
   */
  props?: readonly LayoutProp[];
  npcs?: readonly { id: string; spawn: Vec3; radio_interaccion?: number }[];
  interactuables?: readonly { id: string; pos: Vec3; radio?: number }[];
  no_caminable?: readonly { poligono: readonly Vec2[] }[];
  // Formato de la maqueta (plan estetica-c M5).
  terreno?: { extension?: number; lomas?: number; semilla?: number; relieve?: boolean };
  paleta?: Readonly<Record<string, string>>;
  caminos?: readonly { puntos: readonly Vec2[]; ancho: number; superficie?: "camino" | "empedrado" }[];
  rio?: readonly { puntos: readonly Vec2[]; ancho: number }[];
  agua?: readonly { poligono: readonly Vec2[] }[];
  detalle?: readonly { tipo: string; centro: Vec2; radio: number; cantidad: number; semilla?: number }[];
}

export interface LayoutProp {
  asset: string;
  pos?: Vec3;
  tam?: Vec3;
  rotY?: number;
  tinte?: string;
  instancias?: readonly { pos: Vec3; rotY?: number; tam?: Vec3 }[];
}

export interface PropBox {
  asset: string;
  x: number;
  y: number;
  z: number;
  w: number;
  h: number;
  d: number;
  /** Giro alrededor del eje vertical, en radianes (el layout lo escribe en grados); null si el layout no lo dio. */
  rotY: number | null;
  /** Token de la paleta que reemplaza el color principal; null = el del constructor. */
  tint: string | null;
}

/** Un camino o un río muestreado: la polilínea de la curva y su ancho. */
export interface PathLine {
  width: number;
  line: Point[];
}

/** Lo que world/terrain/ necesita del formato de la maqueta (plan estetica-c M5). */
export interface DioramaGround {
  /** null = los defaults del look (world/ los toma de @lg/art). */
  terrain: { extension: number | null; hills: number | null; seed: number | null; relief: boolean };
  /**
   * Open-world-3d T6: los llanos del relieve (la aparición y cada NPC), en el orden del layout. Vacío sin relieve: el
   * suelo de adentro es plano.
   */
  pads: Vec2[];
  /** Papel del terreno → token de la paleta. */
  palette: Readonly<Record<string, string>>;
  /** Caminos: la polilínea muestreada y sus puntos de control (las piedras del empedrado se cuentan sobre estos). */
  paths: (PathLine & { surface: "camino" | "empedrado"; points: Vec2[] })[];
  rivers: PathLine[];
  ponds: Vec2[][];
  detail: { kind: string; x: number; z: number; radius: number; count: number; seed: number }[];
}

export interface DioramaRuntime {
  id: string;
  bounds: Bounds;
  spawn: Point;
  /** Formato de la maqueta (plan estetica-c M5). */
  ground: DioramaGround;
  boxes: PropBox[];
  npcs: { id: string; x: number; z: number }[];
  interactables: Interactable[];
  grid: WalkGrid;
}

const DEG = Math.PI / 180;

/** Huella de una caja: rectángulo si el giro es múltiplo de 90°, polígono de sus cuatro esquinas si no. */
function footprint(b: PropBox): { rect: Rect } | { polygon: Vec2[] } {
  const deg = b.rotY === null ? 0 : (((Math.round((b.rotY / DEG) * 1e6) / 1e6) % 180) + 180) % 180;
  if (deg === 0 || deg === 90) {
    const [w, d] = deg === 0 ? [b.w, b.d] : [b.d, b.w];
    return { rect: { minX: b.x - w / 2, maxX: b.x + w / 2, minZ: b.z - d / 2, maxZ: b.z + d / 2 } };
  }
  const c = Math.cos(b.rotY as number);
  const s = Math.sin(b.rotY as number);
  // Giro de three alrededor de +y: x' = x cos + z sin, z' = -x sin + z cos.
  const corner = (dx: number, dz: number): Vec2 => [b.x + dx * c + dz * s, b.z - dx * s + dz * c];
  return { polygon: [corner(-b.w / 2, -b.d / 2), corner(b.w / 2, -b.d / 2), corner(b.w / 2, b.d / 2), corner(-b.w / 2, b.d / 2)] };
}

/** Despliega `instancias` (cada una hereda `tam` y `rotY` del prop si no trae los suyos). Sin `tam` no hay caja. */
function propBoxes(props: readonly LayoutProp[]): PropBox[] {
  return props.flatMap((p) => {
    const items: readonly { pos: Vec3; rotY?: number; tam?: Vec3 }[] = p.instancias ?? (p.pos ? [{ pos: p.pos }] : []);
    return items.flatMap((i): PropBox[] => {
      const tam = i.tam ?? p.tam;
      if (!tam) return [];
      const rot = i.rotY ?? p.rotY;
      return [{
        asset: p.asset, x: i.pos[0], y: i.pos[1], z: i.pos[2], w: tam[0], h: tam[1], d: tam[2],
        rotY: rot === undefined ? null : rot * DEG, tint: p.tinte ?? null,
      }];
    });
  });
}

/** La aparición (o el centro de los límites) y cada NPC: los llanos del relieve (open-world-3d T6, D-819). */
function reliefPads(layout: DioramaLayout): Vec2[] {
  const b = layout.bounds;
  const spawn: Vec2 = layout.spawn ? [layout.spawn[0], layout.spawn[2]] : [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2];
  return [spawn, ...(layout.npcs ?? []).map((n): Vec2 => [n.spawn[0], n.spawn[2]])];
}

function groundOf(layout: DioramaLayout): DioramaGround {
  return {
    terrain: {
      extension: layout.terreno?.extension ?? null, hills: layout.terreno?.lomas ?? null, seed: layout.terreno?.semilla ?? null,
      relief: layout.terreno?.relieve === true,
    },
    pads: layout.terreno?.relieve === true ? reliefPads(layout) : [],
    palette: { ...(layout.paleta ?? {}) },
    paths: (layout.caminos ?? []).map((c) => ({
      surface: c.superficie ?? "camino", width: c.ancho, line: sampleCatmullRom(c.puntos), points: c.puntos.map((p): Vec2 => [p[0], p[1]]),
    })),
    rivers: (layout.rio ?? []).map((r) => ({ width: r.ancho, line: sampleCatmullRom(r.puntos) })),
    ponds: (layout.agua ?? []).map((a) => a.poligono.map((p): Vec2 => [p[0], p[1]])),
    detail: (layout.detalle ?? []).map((z, i) => ({ kind: z.tipo, x: z.centro[0], z: z.centro[1], radius: z.radio, count: z.cantidad, seed: z.semilla ?? i + 1 })),
  };
}

export function prepareDiorama(layout: DioramaLayout): DioramaRuntime {
  const { bounds } = layout;
  const boxes = propBoxes(layout.props ?? []);
  const npcs = (layout.npcs ?? []).map((n) => ({ id: n.id, x: n.spawn[0], z: n.spawn[2] }));
  const interactables: Interactable[] = [
    ...(layout.npcs ?? []).map((n): Interactable => ({ id: n.id, kind: "npc", x: n.spawn[0], z: n.spawn[2], radius: n.radio_interaccion ?? DEFAULT_INTERACT_RADIUS })),
    ...(layout.interactuables ?? []).map((o): Interactable => ({ id: o.id, kind: "object", x: o.pos[0], z: o.pos[2], radius: o.radio ?? DEFAULT_INTERACT_RADIUS })),
  ];
  // Los NPCs también ocupan su lugar: un cuadrado de medio metro donde están parados (no se los atraviesa).
  const npcRects: Rect[] = npcs.map((n) => ({ minX: n.x - 0.25, maxX: n.x + 0.25, minZ: n.z - 0.25, maxZ: n.z + 0.25 }));
  const ground = groundOf(layout);
  const prints = boxes.map(footprint);
  const grid = buildWalkGrid({
    bounds,
    polygons: [
      ...(layout.no_caminable ?? []).map((n) => n.poligono),
      ...ground.ponds,
      ...prints.flatMap((f) => ("polygon" in f ? [f.polygon] : [])),
    ],
    rects: [...prints.flatMap((f) => ("rect" in f ? [f.rect] : [])), ...npcRects],
    bands: ground.rivers.map((r) => ({ line: r.line, halfWidth: r.width / 2 })),
  });
  return {
    id: layout.id,
    bounds,
    spawn: layout.spawn ? { x: layout.spawn[0], z: layout.spawn[2] } : { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 },
    ground,
    boxes,
    npcs,
    interactables,
    grid,
  };
}
