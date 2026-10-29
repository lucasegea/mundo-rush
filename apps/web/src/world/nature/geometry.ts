// world/nature/geometry.ts — el detalle del suelo hecho por código (open-world-3d T7), port del mockup V6 (`world.js`
// crownGeometry, rockGeometry, flowerClumpGeometry, impostor): helechos (tarjetas de hoja del mismo atlas que los
// árboles), piedritas (icosaedro abollado con color por vértice) y matas de flores (cuatro tarjetas cruzadas de la
// textura de lienzo propia). Más la geometría de las tarjetas de impostor (AC44: 3 quads, la copa horizontal al 58 %).
import { BufferGeometry, Color, Float32BufferAttribute, IcosahedronGeometry, Vector3 } from "three";
import { hash2, IMPOSTOR_CROWN_HEIGHT, mulberry32, NATURE_COLORS, TREE_LEAF_GAIN } from "@lg/art";
import type { BakeBox } from "../camera/bakeCamera";
import { impostorFraming } from "../camera/bakeCamera";

const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Un helecho (mockup `crownGeometry` con `far`, una tarjeta por hoja): `count` tarjetas de la hoja del atlas alrededor
 * de un elipsoide bajo. El color va dividido por TREE_LEAF_GAIN: el follaje lo multiplica donde muestrea hoja.
 */
export function fernGeometry(variant: number): BufferGeometry {
  const o = { seed: 90 + variant * 7, cy: 0.12, rx: 0.4, ry: 0.16, rz: 0.4, count: 6, size: 0.5 };
  const rnd = mulberry32(o.seed);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [], idx: number[] = [];
  const low = new Color(NATURE_COLORS.fern.low), high = new Color(NATURE_COLORS.fern.high);
  const up = new Vector3(0, 1, 0);
  for (let i = 0; i < o.count; i++) {
    const d = new Vector3();
    do d.set(rnd() * 2 - 1, rnd() * 2 - 0.55, rnd() * 2 - 1); while (d.lengthSq() > 1 || d.lengthSq() < 0.05);
    d.normalize();
    const rr = 0.5 + 0.5 * rnd();
    const c = new Vector3(d.x * o.rx * rr, o.cy + d.y * o.ry * rr, d.z * o.rz * rr);
    const out = new Vector3(c.x / o.rx, (c.y - o.cy) / o.ry, c.z / o.rz).normalize();
    const side = Math.abs(out.y) > 0.92 ? new Vector3(1, 0, 0) : new Vector3().crossVectors(up, out).normalize();
    const vUp = new Vector3().crossVectors(out, side).normalize();
    const roll = rnd() * Math.PI * 2;
    const u = side.clone().multiplyScalar(Math.cos(roll)).addScaledVector(vUp, Math.sin(roll));
    const v = new Vector3().crossVectors(out, u).normalize();
    const s = o.size * (0.7 + 0.6 * rnd());
    const h = clamp(((c.y - o.cy) / o.ry) * 0.5 + 0.5, 0, 1);
    const tint = low.clone().lerp(high, smooth(0.15, 0.95, h) * (0.6 + 0.4 * rnd())).multiplyScalar(((0.85 + 0.3 * rnd()) * 3.2) / TREE_LEAF_GAIN);
    const base = pos.length / 3;
    const nn = out.clone().lerp(up, 0.28).normalize();
    for (const [a, b, tu, tv] of [[-1, -1, 0, 0.25], [1, -1, 1, 0.25], [1, 1, 1, 1], [-1, 1, 0, 1]] as const) {
      const p = c.clone().addScaledVector(u, (a * s) / 2).addScaledVector(v, (b * s) / 2);
      pos.push(p.x, p.y, p.z);
      nor.push(nn.x, nn.y, nn.z);
      uv.push(tu * 0.75, tv);
      col.push(tint.r, tint.g, tint.b);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return withAttributes(pos, nor, uv, col, idx);
}

/** Una piedrita (mockup `rockGeometry(31, 0.55, 0)`): icosaedro abollado, musgo arriba y oscuro abajo. */
export function pebbleGeometry(seed = 31, squash = 0.55): BufferGeometry {
  const src = new IcosahedronGeometry(1, 0);
  // Soldar por posición: las normales quedan suaves.
  const p = src.getAttribute("position");
  const keyOf = new Map<string, number>();
  const verts: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(4)},${p.getY(i).toFixed(4)},${p.getZ(i).toFixed(4)}`;
    let id = keyOf.get(k);
    if (id === undefined) {
      id = verts.length / 3;
      keyOf.set(k, id);
      verts.push(p.getX(i), p.getY(i), p.getZ(i));
    }
    idx.push(id);
  }
  src.dispose();
  for (let i = 0; i < verts.length; i += 3) {
    const x = verts[i] as number, y = verts[i + 1] as number, z = verts[i + 2] as number;
    const f = 0.8 + 0.34 * hash2(Math.round(x * 100), Math.round(y * 90) + Math.round(z * 37), seed);
    verts[i] = x * f * 1.1;
    verts[i + 1] = y * f * squash;
    verts[i + 2] = z * f;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.getAttribute("normal");
  const rock = new Color(NATURE_COLORS.pebble.rock), warm = new Color(NATURE_COLORS.pebble.warm), moss = new Color(NATURE_COLORS.pebble.moss);
  const col = new Float32Array(n.count * 3);
  for (let i = 0; i < n.count; i++) {
    const c = rock.clone().lerp(warm, hash2(i, seed, 9));
    c.lerp(moss, smooth(0.45, 0.9, n.getY(i)) * 0.5);
    c.multiplyScalar(0.62 * (0.65 + 0.35 * smooth(-0.9, 0.1, (verts[i * 3 + 1] as number) / squash)));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  g.setAttribute("uv", new Float32BufferAttribute(new Float32Array(n.count * 2), 2));
  g.computeBoundingSphere();
  return g;
}

/** Una mata de flores (mockup `flowerClumpGeometry`): cuatro tarjetas giradas, cada una una celda del atlas. */
export function flowerClumpGeometry(): BufferGeometry {
  const pos: number[] = [], uv: number[] = [], nor: number[] = [], idx: number[] = [];
  const W = 0.62, H = 0.46;
  for (let i = 0; i < 4; i++) {
    const a = i * 0.79 + 0.3, ca = Math.cos(a), sa = Math.sin(a), ox = Math.cos(i * 2.1) * 0.12, oz = Math.sin(i * 2.1) * 0.12;
    const b = pos.length / 3;
    for (const [u, v] of [[0, 0], [1, 0], [1, 1], [0, 1]] as const) {
      const lx = (u - 0.5) * W;
      // El lienzo se da vuelta al subir (flipY): v = 1 es la fila de arriba (las flores).
      pos.push(ox + lx * ca, v * H, oz + lx * sa);
      uv.push((i + u * 0.98 + 0.01) / 4, v);
      nor.push(0, 1, 0);
    }
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/**
 * Las tarjetas del impostor (AC44): dos verticales cruzadas (la vista de costado, mitad izquierda de la textura) y una
 * horizontal a IMPOSTOR_CROWN_HEIGHT del alto (la copa desde arriba, mitad derecha). 3 quads, 6 triángulos.
 */
export function impostorGeometry(b: BakeBox): BufferGeometry {
  const { E, ymid, Et } = impostorFraming(b);
  const y0 = ymid - E, y1 = ymid + E, yc = b.maxY * IMPOSTOR_CROWN_HEIGHT;
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute([
    -E, y0, 0, E, y0, 0, E, y1, 0, -E, y1, 0,
    0, y0, -E, 0, y0, E, 0, y1, E, 0, y1, -E,
    -Et, yc, Et, Et, yc, Et, Et, yc, -Et, -Et, yc, -Et,
  ], 3));
  g.setAttribute("uv", new Float32BufferAttribute([0, 0, 0.5, 0, 0.5, 1, 0, 1, 0, 0, 0.5, 0, 0.5, 1, 0, 1, 0.5, 0, 1, 0, 1, 1, 0.5, 1], 2));
  g.setAttribute("normal", new Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 8, 10, 11]);
  g.computeBoundingSphere();
  return g;
}

function withAttributes(pos: number[], nor: number[], uv: number[], col: number[], idx: number[]): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}
