// world/sky/sky.ts: el cielo del mundo abierto (open-world-3d T6, D-823, AC38), armado sin GPU como el resto del
// diorama. Una cúpula de degradé (clase `cielo`) con color por vértice de palette.ts (horizonte = niebla), que sigue a la
// cámara, sin escribir profundidad y sin niebla; y una sola malla de nubes (clase `nube`, el atlas del mockup V6: 3
// cúmulos y 2 jirones en un canvas de 512 x 1280), ausente en `low`. Sin canvas 2D (tests), el atlas queda en blanco y
// el resto igual. Las medidas (segmentos, cantidad de nubes) son las de @lg/art sky.ts, que cuenta el estimador.
// Open-world-3d T7b (D-839): los colores de la cúpula y del atlas de nubes son del look (`WorldLook.sky`).
import {
  BackSide, BufferGeometry, CanvasTexture, Color, DataTexture, DoubleSide, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial,
  RGBAFormat, SphereGeometry, SRGBColorSpace, Vector3, type Texture,
} from "three";
import { OPEN_WORLD_DENSITY, RUNTIME_TEXTURE_PX, SKY_CLOUDS, SKY_DOME, type CloudStop, type WorldLook, type WorldTier } from "@lg/art";
import { tagMaterial } from "../materials/registry";
import { rng } from "../materials/rng";

type SkyLook = WorldLook["sky"];

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Color de la cúpula a una altura relativa y (de -1 a 1): horizonte hasta 0,02, bruma a 0,12 (el anillo de 7,5°),
 * cénit desde 0,26 (el de 15°) para arriba. AC39, medido en la vista por defecto (LG_GL=gpu, cámara a -9,4° con FOV
 * 50°: el cielo visible va de 0° a unos 11°): con la bruma a 0,32 la banda de arriba quedaba a 3,5 % de luminancia del
 * horizonte; con anillos cada 15° y el cénit en el de 15°, a 7,6 % (los colores se interpolan entre anillos y la
 * luminancia la manda el verde, que casi no cambia entre celeste y bruma); con anillos cada 7,5° el azul llega antes.
 */
export function domeColor(sky: SkyLook, y: number): Color {
  const h = new Color(sky.horizon);
  const m = new Color(sky.haze);
  const z = new Color(sky.zenith);
  if (y <= 0.02) return h;
  if (y < 0.12) return h.lerp(m, smooth(0.02, 0.12, y));
  return m.lerp(z, smooth(0.12, 0.26, y));
}

function buildDome(sky: SkyLook): Mesh {
  const g = new SphereGeometry(SKY_DOME.radius, SKY_DOME.widthSegments, SKY_DOME.heightSegments);
  const pos = g.getAttribute("position");
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const c = domeColor(sky, pos.getY(i) / SKY_DOME.radius);
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new Float32BufferAttribute(col, 3));
  const m = new Mesh(g, tagMaterial(new MeshBasicMaterial({ vertexColors: true, side: BackSide, depthWrite: false, fog: false }), "cielo"));
  m.name = "cielo";
  m.renderOrder = -10;
  m.frustumCulled = false;
  return m;
}

type Ctx = CanvasRenderingContext2D;

const addStops = (gr: CanvasGradient, stops: readonly CloudStop[]): void => {
  for (const [at, color] of stops) gr.addColorStop(at, color);
};

function cumulus(g: Ctx, oy: number, seed: number, stops: readonly CloudStop[]): void {
  const r = rng(seed);
  for (let k = 0; k < 26; k++) {
    const x = 70 + r() * 372;
    const y = oy + 120 + (r() - 0.5) * 60 - Math.sin(((x - 70) / 372) * Math.PI) * 50;
    const rad = 26 + r() * 46;
    const gr = g.createRadialGradient(x, y, 1, x, y, rad);
    addStops(gr, stops);
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}

function wisp(g: Ctx, oy: number, seed: number, stops: readonly CloudStop[]): void {
  const r = rng(seed);
  for (let k = 0; k < 5; k++) {
    const y = oy + 90 + r() * 80;
    const x0 = 20 + r() * 120;
    const len = 220 + r() * 250;
    const th = 5 + r() * 10;
    const gr = g.createLinearGradient(x0, 0, x0 + len, 0);
    addStops(gr, stops);
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(x0, y);
    g.quadraticCurveTo(x0 + len * 0.5, y - th * 3 - r() * 14, x0 + len, y + (r() - 0.5) * 20);
    g.quadraticCurveTo(x0 + len * 0.5, y + th, x0, y);
    g.fill();
  }
}

/** El atlas de nubes: 5 filas de 256 px (3 cúmulos, 2 jirones), dibujado una vez. */
export function cloudAtlas(clouds: SkyLook["clouds"]): Texture {
  const [w, h] = RUNTIME_TEXTURE_PX.cloudAtlas;
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  const g = canvas?.getContext("2d") ?? null;
  if (!canvas || !g) {
    const t = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat);
    t.needsUpdate = true;
    return t;
  }
  canvas.width = w;
  canvas.height = h;
  [3, 8, 13].forEach((s, k) => cumulus(g, k * 256, s, clouds.cumulus));
  [5, 9].forEach((s, k) => wisp(g, (3 + k) * 256, s, clouds.wisp));
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** Las nubes: un quad por nube, a SKY_CLOUDS.distance m, mirando al centro; una sola malla y un solo material. */
function buildClouds(clouds: SkyLook["clouds"]): Mesh {
  const r = rng(99);
  const items: { row: number; w: number; el: number }[] = [];
  for (let i = 0; i < SKY_CLOUDS.cumulus; i++) items.push({ row: i % 3, w: 150 + r() * 120, el: 9 + r() * 36 });
  for (let i = 0; i < SKY_CLOUDS.wisps; i++) items.push({ row: 3 + (i % 2), w: 260 + r() * 160, el: 14 + r() * 40 });
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const up = new Vector3(0, 1, 0);
  items.forEach((it, i) => {
    const az = (i / items.length) * Math.PI * 2 + r() * 0.25;
    const el = (it.el * Math.PI) / 180;
    const dir = new Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
    const ctr = dir.clone().multiplyScalar(SKY_CLOUDS.distance);
    const nrm = dir.clone().negate();
    const right = new Vector3().crossVectors(up, nrm).normalize();
    const vUp = new Vector3().crossVectors(nrm, right).normalize();
    const v0 = 1 - (it.row + 1) / 5;
    const v1 = 1 - it.row / 5;
    const base = pos.length / 3;
    for (const [sx, sy, u, v] of [[-1, -1, 0, v0], [1, -1, 1, v0], [1, 1, 1, v1], [-1, 1, 0, v1]] as const) {
      const p = ctr.clone().addScaledVector(right, (sx * it.w) / 2).addScaledVector(vUp, (sy * it.w * 0.5) / 2);
      pos.push(p.x, p.y, p.z);
      uv.push(u, v);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  const mat = tagMaterial(new MeshBasicMaterial({ map: cloudAtlas(clouds), transparent: true, depthWrite: false, fog: false, side: DoubleSide, opacity: clouds.opacity }), "nube");
  const m = new Mesh(g, mat);
  m.name = "nubes";
  m.renderOrder = -5;
  m.frustumCulled = false;
  return m;
}

export interface Sky {
  group: Group;
  dome: Mesh;
  clouds: Mesh | null;
  /** Cada cuadro: la cúpula y las nubes van con la cámara; las nubes giran despacio (quietas con reducir movimiento). */
  follow(x: number, y: number, z: number, dtSec: number, still: boolean): void;
  dispose(): void;
}

export function buildSky(tier: WorldTier, look: WorldLook): Sky {
  const group = new Group();
  group.name = "cielo";
  const dome = buildDome(look.sky);
  group.add(dome);
  const clouds = OPEN_WORLD_DENSITY[tier].clouds ? buildClouds(look.sky.clouds) : null;
  if (clouds) group.add(clouds);
  return {
    group,
    dome,
    clouds,
    follow(x, y, z, dtSec, still) {
      dome.position.set(x, y, z);
      if (clouds) {
        clouds.position.set(x, y, z);
        if (!still) clouds.rotation.y += dtSec * 0.004;
      }
    },
    dispose() {
      for (const m of [dome, clouds]) {
        if (!m) continue;
        m.geometry.dispose();
        const mat = m.material as MeshBasicMaterial;
        mat.map?.dispose();
        mat.dispose();
      }
    },
  };
}
