// world/nature/grass.ts — the open world V6 grass (open-world-3d T8, amendment 3, D-821, PD-1, PD-2, AC48, AC49,
// AC75), port of the V6 mockup (`world.js` GRASS_VERT, GRASS_FRAG, bladeClumpGeometry, buildGrass, cullGrass). A single
// distribution of tufts (seeded, fixed positions in a square of side 2 × radius, wrapped around the disc
// with grassWrap.ts) and two instanced meshes, both ShaderMaterial of class `pasto` with the three fog chunks of
// three and `fog: true`:
//   1. one card per tuft (2 triangles) that faces the camera turning on the vertical axis and tilts back by half
//      the view elevation, with the tuft atlas (two tufts per card, one in the variant with flowers)
//   2. near the player (real-blade radius), 8 to 10 curved, tapered blades per tuft (two segments and the tip, 3
//      triangles), with random turn and lean, which are dithered over 1.5 m at the edge of that radius.
// The height and dirt come from the RG16F texture that world/terrain builds and owns (heightTexture.ts); here it is only read
// (G is dirt: above 0.5 there is no grass). The wind is a uniform, 0 with reduced motion. Only the tufts inside the disc and the frustum
// are uploaded to the GPU; they are re-chosen when the view changed (CullGate from culling.ts: 1 m, 5°,
// and once more on settling) and uploaded only if the choice changed. The ground grass bed (groundMaterial
// `grassBed`) follows the disc and fades out with the zoom (t from 0.45 to 0.65); the disc starts shrinking at t 0.36.
// D-839: atlas and blade colors, patch tint, bed tint and tuft multiplier belong to the look
// (`WorldLook.grass`); D-842: they enter as uniforms and texture, so two looks share the two programs.
// Registered deviation (AC48): V6 tilted the card TOWARD the camera (the tip toward it), which puts it edge-on
// when looking from above (|cos| 0.69 at 30°, 0.35 at 45°). Here it tilts back, as the plan says: |cos| >= 0.79 from
// 6 to 82° of elevation.
import {
  BufferGeometry, CanvasTexture, DataTexture, DoubleSide, DynamicDrawUsage, Float32BufferAttribute, Frustum, Group, InstancedBufferAttribute,
  InstancedMesh, LinearMipmapLinearFilter, Matrix4, RGBAFormat, ShaderMaterial, Sphere, SRGBColorSpace, UniformsLib, UniformsUtils,
  Vector2, Vector3, Vector4, type Camera, type Texture,
} from "three";
import { mulberry32, OPEN_WORLD_DENSITY, RUNTIME_TEXTURE_PX, type GrassLook, type WorldLook, type WorldTier } from "@lg/art";
import { tagMaterial } from "../materials/registry";
import { sampleHeightDirt, type HeightDirtMap } from "../terrain/heightTexture";
import { CullGate, viewAngles } from "./culling";
import { GRASS_WRAP_GLSL, grassWrap } from "./grassWrap";

/** Grass measurements and rules (core; the V6 mockup ones). */
export const GRASS = {
  /** The card: width and height (m). */
  card: { width: 0.95, height: 0.5 },
  /** Card tilt: `factor` × the view elevation, with the elevation clamped to `maxElevation` rad. */
  lean: { factor: 0.55, maxElevation: 1.4 },
  /** The disc center goes `ahead` radii in front of the player, toward where the camera looks. */
  ahead: 0.3,
  /** The disc shrinks with the zoom: from t `from` to `to`, until it loses `amount` of the radius; below `minRadius` m it turns off. */
  shrink: { from: 0.36, to: 0.75, amount: 0.93, minRadius: 4.5 },
  /** The ground grass bed fades out with the zoom from t `from` to `to`. */
  bed: { from: 0.45, to: 0.65 },
  /** The cards are dithered out from `fade` × radius to the radius. */
  fade: 0.7,
  /** Half width (m) of the real-blade dither at the edge of their radius (1.5 m in total). */
  nearDither: 0.75,
  /** With dirt (G channel) from `from` the grass shrinks, and at `cut` there is none (AC48). */
  dirt: { from: 0.3, cut: 0.5 },
  /** Margin (in UV) inside the height texture: outside it there is no grass. */
  inset: 0.02,
  /** The sphere of each tuft for the frustum: center `lift` m above the ground, radius `radius` m. */
  sphere: { lift: 0.2, radius: 0.9 },
  /** Seed of the seeding and the blades (the mockup one). */
  seed: 77,
} as const;

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** The disc radius with the zoom (m): the tier one up to t 0.36, and then it shrinks (mockup `applyView`). */
export const grassRadiusAt = (radius: number, t: number): number =>
  radius * (1 - smoothstep(GRASS.shrink.from, GRASS.shrink.to, t) * GRASS.shrink.amount);

/** How much grass bed the ground paints with the zoom (1 close, 0 from t 0.65). */
export const grassBedOn = (t: number): number => 1 - smoothstep(GRASS.bed.from, GRASS.bed.to, t);

/** Card tilt (rad) for a view elevation (rad); the same rule as the shader. */
export const cardLean = (elevation: number): number => Math.min(Math.max(elevation, 0), GRASS.lean.maxElevation) * GRASS.lean.factor;

/**
 * The "up" of a card (unit) for the horizontal direction toward the camera (`hx`, `hz`, unit) and the
 * view elevation: vertical at 0°, with the tip backward (away from the camera) as the view lowers.
 */
export function cardUp(hx: number, hz: number, elevation: number): [number, number, number] {
  const l = cardLean(elevation);
  return [-hx * Math.sin(l), Math.cos(l), -hz * Math.sin(l)];
}

const f = (n: number): string => n.toFixed(4);

const GRASS_VERT = /* glsl */ `
  uniform vec3 uCenter; uniform float uTime; uniform float uRadius; uniform float uWind;
  uniform vec2 uPlayer; uniform float uNearR;
  uniform sampler2D uHm; uniform vec4 uHmBox;
  uniform vec3 uTintDark; uniform vec3 uTintWarm; uniform vec3 uTintGain;
  attribute vec4 aData;
  #ifdef GEO
    attribute vec2 aShade;
    varying vec2 vShade;
  #endif
  varying vec2 vUv; varying vec3 vTint; varying float vFade; varying float vNear;
  #include <fog_pars_vertex>
  ${GRASS_WRAP_GLSL}
  float hash11(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    float R = uRadius;
    vec2 wp = grassWrap(aData.xy, uCenter.xz, R);
    vec2 uvh = (wp - uHmBox.xy) / uHmBox.zw;
    bool inside = uvh.x > ${f(GRASS.inset)} && uvh.y > ${f(GRASS.inset)} && uvh.x < ${f(1 - GRASS.inset)} && uvh.y < ${f(1 - GRASS.inset)};
    vec2 s = texture2D(uHm, uvh).rg;      // RG16F con filtro lineal de hardware: una lectura por vértice
    float d = length(wp - uCenter.xz);
    float h = hash11(aData.xy * 91.7 + aData.z);
    float sc = aData.w * (1.0 - smoothstep(${f(GRASS.dirt.from)}, ${f(GRASS.dirt.cut)}, s.y)) * (inside ? 1.0 : 0.0);
    float c = cos(aData.z), sn = sin(aData.z);
    float arc = uv.y * uv.y;
    vec3 base = vec3(wp.x, s.x, wp.y);
    #ifdef GEO
      vec3 p = position * sc;
      vec3 rp = vec3(p.x * c + p.z * sn, p.y, -p.x * sn + p.z * c);
      vShade = aShade;
      vUv = uv;
      float ph = dot(position.xz, vec2(9.0, 7.0));
    #else
      vec3 toC = cameraPosition - base;
      float hl = max(length(toC.xz), 1e-3);
      vec2 hz = toC.xz / hl;
      float lean = clamp(atan(toC.y, hl), 0.0, ${f(GRASS.lean.maxElevation)}) * ${f(GRASS.lean.factor)};
      vec3 right = vec3(-hz.y, 0.0, hz.x) * (sn > 0.0 ? 1.0 : -1.0);
      vec3 up = vec3(-hz.x * sin(lean), cos(lean), -hz.y * sin(lean));
      vec3 rp = (right * position.x + up * position.y) * sc;
      vUv = vec2((uv.x + floor(hash11(aData.yx + 3.1) * 4.0)) * 0.25, uv.y);
      float ph = 0.0;
    #endif
    float sway = sin(uTime * 1.4 + wp.x * 0.27 + wp.y * 0.19 + ph) * 0.6 + sin(uTime * 2.3 + wp.x * 0.7 + wp.y * 0.4) * 0.25;
    vec3 world = base + rp + vec3(sway, 0.0, sway * 0.5) * 0.14 * arc * sc * uWind;
    float pat = 0.5 + 0.5 * sin(wp.x * 0.07 + sin(wp.y * 0.05) * 2.0) * sin(wp.y * 0.083 + 1.7 + sin(wp.x * 0.04));
    float pat2 = 0.5 + 0.5 * sin(wp.x * 0.23 + 1.0) * sin(wp.y * 0.19);
    vTint = mix(uTintDark, uTintWarm, smoothstep(0.25, 0.75, pat)) * (0.7 + 0.22 * h) * (0.9 + 0.2 * pat2) * uTintGain;
    vFade = 1.0 - smoothstep(${f(GRASS.fade)} * R, R, d);
    vNear = 1.0 - smoothstep(uNearR - ${f(GRASS.nearDither)}, uNearR + ${f(GRASS.nearDither)}, length(wp - uPlayer));
    vec4 mvPosition = viewMatrix * vec4(world, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const GRASS_FRAG = /* glsl */ `
  uniform sampler2D uTex;
  uniform vec3 uBladeBase; uniform vec3 uBladeMidA; uniform vec3 uBladeMidB; uniform vec3 uBladeTipA; uniform vec3 uBladeTipB;
  varying vec2 vUv; varying vec3 vTint; varying float vFade; varying float vNear;
  #ifdef GEO
    varying vec2 vShade;
  #endif
  #include <fog_pars_fragment>
  void main() {
    float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    if (ign > vFade) discard;
    #ifdef GEO
      if (ign >= vNear) discard;
      // los colores del look (sRGB, linealizados acá): pie oscuro, medio verde, punta clara
      vec3 midC = mix(uBladeMidA, uBladeMidB, step(0.66, vShade.x));
      vec3 tipC = mix(uBladeTipA, uBladeTipB, vShade.x);
      vec3 col = vUv.y < 0.45 ? mix(uBladeBase, midC, vUv.y / 0.45) : mix(midC, tipC, (vUv.y - 0.45) / 0.55);
      col = pow(col, vec3(2.2)) * vShade.y * (0.86 + 0.28 * vUv.x);   // un lado del pliegue toma más luz
      gl_FragColor = vec4(col * vTint, 1.0);
    #else
      vec4 t = texture2D(uTex, vUv);
      if (t.a < 0.5) discard;
      gl_FragColor = vec4(t.rgb * vTint, 1.0);
    #endif
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

/** A tuft of real blades: each blade two segments and the tip (5 vertices, 3 triangles), tapered and curved outward. */
export function bladeClumpGeometry(blades: number, seed: number = GRASS.seed): BufferGeometry {
  const rnd = mulberry32(seed);
  const pos: number[] = [];
  const uv: number[] = [];
  const shade: number[] = [];
  const idx: number[] = [];
  for (let b = 0; b < blades; b++) {
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(rnd()) * 0.14;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const yaw = a + (rnd() - 0.5) * 1.2; // where it leans: almost always away from the center
    const dx = Math.cos(yaw);
    const dz = Math.sin(yaw);
    const h = 0.2 + rnd() * 0.26 * (1 - r * 2.5);
    const w = 0.016 + rnd() * 0.014;
    const lean = 0.18 + rnd() * 0.5; // horizontal reach of the tip, as a fraction of the height
    const px = -dz;
    const pz = dx; // across the blade width, horizontal
    const v0 = pos.length / 3;
    for (const [hf, rf, wf] of [[0, 0, 1], [0.55, 0.3, 0.75], [1, 1, 0]] as const) {
      const cx = bx + dx * lean * h * rf;
      const cy = h * hf * (1 - 0.18 * rf * lean);
      const cz = bz + dz * lean * h * rf;
      if (wf > 0) {
        pos.push(cx - px * w * wf, cy, cz - pz * w * wf, cx + px * w * wf, cy, cz + pz * w * wf);
        uv.push(0, hf, 1, hf);
      } else {
        pos.push(cx, cy, cz);
        uv.push(0.5, 1);
      }
    }
    const sh = [rnd(), 0.8 + rnd() * 0.38];
    for (let k = 0; k < 5; k++) shade.push(...sh);
    idx.push(v0, v0 + 1, v0 + 3, v0, v0 + 3, v0 + 2, v0 + 2, v0 + 3, v0 + 4);
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new Float32BufferAttribute(uv, 2));
  g.setAttribute("aShade", new Float32BufferAttribute(shade, 2));
  g.setIndex(idx);
  return g;
}

/** The card: a single quad (4 vertices, 2 triangles), with the foot at y = 0. */
export function grassCardGeometry(): BufferGeometry {
  const { width: w, height: h } = GRASS.card;
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute([-w / 2, 0, 0, w / 2, 0, 0, w / 2, h, 0, -w / 2, h, 0], 3));
  g.setAttribute("uv", new Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  g.setIndex([0, 1, 2, 0, 2, 3]);
  return g;
}

const css = (hex: number): string => `#${hex.toString(16).padStart(6, "0")}`;

/**
 * The tuft atlas (mockup `grassAtlas`): four 256 px variants; two tufts per card with separate feet (one in the
 * last, with flower specks) at staggered base heights, with tapered, curved blades fanning out, dark at
 * the foot and light at the tip. Look colors. Without `document` (Node tests) it is a transparent 1 × 1.
 */
export function grassAtlas(colors: GrassLook["atlas"]): Texture {
  const [W, S] = RUNTIME_TEXTURE_PX.grassAtlas;
  const canvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
  const g = canvas?.getContext("2d") ?? null;
  if (!canvas || !g) {
    const t = new DataTexture(new Uint8Array(4), 1, 1, RGBAFormat);
    t.needsUpdate = true;
    return t;
  }
  canvas.width = W;
  canvas.height = S;
  const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));
  const rnd = mulberry32(2024);
  const variants = W / S;
  for (let v = 0; v < variants; v++) {
    const ox = v * S;
    const nT = v === variants - 1 ? 1 : 2;
    const tufts = Array.from({ length: nT }, (_, j) => ({ cx: S * (0.5 + (j - (nT - 1) / 2) * 0.48 + (rnd() - 0.5) * 0.06), k: 0.65 + rnd() * 0.35, lift: j === 1 ? 0 : 8 + rnd() * 26 }));
    // The tufts at different base heights: on a tilted card, a higher base reads as a tuft farther away.
    tufts.sort((a, b) => b.lift - a.lift);
    for (const [ti, tf] of tufts.entries()) {
      for (let i = 0; i < 34; i++) {
        const off = (rnd() + rnd() - 1) * 0.09;
        const bx = ox + tf.cx + off * S;
        const h = (80 + rnd() * 150) * tf.k * (1 - Math.abs(off) * 2.4);
        const lean = off * 420 + (rnd() - 0.5) * 46;
        const w = 4 + rnd() * 5;
        const by = S - 2 - tf.lift;
        const tx = clamp(bx + lean, ox + 6, ox + S - 6);
        const ty = Math.max(6, by - h);
        const grad = g.createLinearGradient(bx, by, tx, ty);
        grad.addColorStop(0, css(colors.base));
        grad.addColorStop(0.45, css((i + ti) % 3 ? colors.mid[0] : colors.mid[1]));
        grad.addColorStop(1, css(colors.tips[(i + v) % colors.tips.length] as number));
        g.fillStyle = grad;
        g.beginPath();
        g.moveTo(bx - w, by);
        g.quadraticCurveTo(bx - w * 0.5 + lean * 0.15, by - h * 0.55, tx, ty);
        g.quadraticCurveTo(bx + w * 0.5 + lean * 0.35, by - h * 0.5, bx + w, by);
        g.closePath();
        g.fill();
      }
    }
    if (v === variants - 1) {
      for (let k = 0; k < 7; k++) {
        const fx = ox + S / 2 + (rnd() - 0.5) * S * 0.6;
        const fy = 60 + rnd() * 110;
        g.fillStyle = css(colors.flowers[k % colors.flowers.length] as number);
        g.beginPath();
        g.arc(fx, fy, 6 + rnd() * 3, 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = css(colors.flowerStem);
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(fx, fy + 6);
        g.lineTo(ox + S / 2 + (fx - ox - S / 2) * 0.3, S - 2);
        g.stroke();
      }
    }
  }
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  return t;
}

export interface GrassInput {
  tier: WorldTier;
  look: WorldLook;
  /** The height and dirt texture from world/terrain (the scene only RG16F; the grass builds no other). */
  heightDirt: HeightDirtMap;
  /** The ground material grass-bed vector (center x, z, radius, on); null without ground. */
  bed: Vector4 | null;
}

export interface GrassSelection {
  /** Indices of the tufts uploaded with a card and, of those, the ones that also carry real blades. */
  cards: number[];
  blades: number[];
}

export interface Grass {
  group: Group;
  cards: InstancedMesh;
  blades: InstancedMesh;
  /** All the tier tufts: aData = (x, z in [-1, 1], turn, scale), 4 per tuft. */
  base: Float32Array;
  uniforms: GrassUniforms;
  gate: CullGate;
  /** Times the instance buffer was uploaded (AC49). */
  uploads: number;
  /** What is uploaded now (indices into `base`). */
  selection: GrassSelection;
  /** Per frame: wind, bed, and if the view changed, chooses and uploads what changed. Returns whether it uploaded. */
  update(camera: Camera, px: number, pz: number, t: number, dt: number, still: boolean): boolean;
  dispose(): void;
}

export interface GrassUniforms {
  uCenter: { value: Vector3 };
  uTime: { value: number };
  uRadius: { value: number };
  uWind: { value: number };
  uPlayer: { value: Vector2 };
  uNearR: { value: number };
  uHm: { value: Texture };
  uHmBox: { value: Vector4 };
  uTex: { value: Texture };
  uTintDark: { value: Vector3 };
  uTintWarm: { value: Vector3 };
  uTintGain: { value: Vector3 };
  uBladeBase: { value: Vector3 };
  uBladeMidA: { value: Vector3 };
  uBladeMidB: { value: Vector3 };
  uBladeTipA: { value: Vector3 };
  uBladeTipB: { value: Vector3 };
}

/** The tier tufts: a jittered grid in [-1, 1]², in shuffled order (the first N are a random subset). */
export function grassBase(count: number, seed: number = GRASS.seed): Float32Array {
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);
  const rnd = mulberry32(seed);
  const order = Array.from({ length: count }, (_, i) => i);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [order[i], order[j]] = [order[j] as number, order[i] as number];
  }
  const data = new Float32Array(count * 4);
  for (let n = 0; n < count; n++) {
    const i = order[n] as number;
    const gx = i % cols;
    const gz = Math.floor(i / cols);
    data[n * 4] = ((gx + rnd()) / cols) * 2 - 1;
    data[n * 4 + 1] = ((gz + rnd()) / rows) * 2 - 1;
    data[n * 4 + 2] = rnd() * Math.PI * 2;
    data[n * 4 + 3] = 0.75 + rnd() * 0.6;
  }
  return data;
}

export interface GrassView {
  /** Center and radius of the disc, player (center of the real blades). */
  cx: number;
  cz: number;
  radius: number;
  px: number;
  pz: number;
  frustum: Frustum;
}

const sphere = new Sphere();

/**
 * Which tufts are uploaded (mockup `cullGrass`): of the first `drawMax`, those the wrap puts inside the disc, inside
 * the height texture, with dirt below the cut and with the sphere in the frustum. Those that also fall inside the
 * real-blade radius plus the dither carry blades.
 */
export function selectGrass(base: Float32Array, drawMax: number, nearRadius: number, map: HeightDirtMap, v: GrassView): GrassSelection {
  const cards: number[] = [];
  const blades: number[] = [];
  const w = map.width * map.metersPerTexel;
  const h = map.height * map.metersPerTexel;
  const r2 = v.radius * v.radius;
  const nearMax = nearRadius + GRASS.nearDither;
  for (let n = 0; n < drawMax; n++) {
    const [wx, wz] = grassWrap(base[n * 4] as number, base[n * 4 + 1] as number, v.cx, v.cz, v.radius);
    if ((wx - v.cx) ** 2 + (wz - v.cz) ** 2 > r2) continue;
    const u = (wx - map.originX) / w;
    const q = (wz - map.originZ) / h;
    if (!(u > GRASS.inset && q > GRASS.inset && u < 1 - GRASS.inset && q < 1 - GRASS.inset)) continue;
    const s = sampleHeightDirt(map, wx, wz);
    if (s.dirt >= GRASS.dirt.cut) continue; // the shader leaves it at scale 0: it is not uploaded
    sphere.center.set(wx, s.height + GRASS.sphere.lift, wz);
    sphere.radius = GRASS.sphere.radius;
    if (!v.frustum.intersectsSphere(sphere)) continue;
    cards.push(n);
    if (Math.hypot(wx - v.px, wz - v.pz) < nearMax) blades.push(n);
  }
  return { cards, blades };
}

const sameList = (a: readonly number[], b: readonly number[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

export function buildGrass(input: GrassInput): Grass {
  const { tier, look, heightDirt } = input;
  const spec = OPEN_WORLD_DENSITY[tier].grass;
  const gl = look.grass;
  const count = Math.max(1, Math.round(spec.clumps * Math.min(1, gl.density)));
  const base = grassBase(count);
  const atlas = grassAtlas(gl.atlas);
  const v3 = (c: readonly [number, number, number]): { value: Vector3 } => ({ value: new Vector3(...c) });
  const uniforms: GrassUniforms = {
    uCenter: { value: new Vector3() },
    uTime: { value: 0 },
    uRadius: { value: spec.radius },
    uWind: { value: 1 },
    uPlayer: { value: new Vector2() },
    uNearR: { value: spec.nearRadius },
    uHm: { value: heightDirt.texture },
    uHmBox: { value: new Vector4(heightDirt.originX, heightDirt.originZ, heightDirt.width * heightDirt.metersPerTexel, heightDirt.height * heightDirt.metersPerTexel) },
    uTex: { value: atlas },
    uTintDark: v3(gl.tint.dark),
    uTintWarm: v3(gl.tint.warm),
    uTintGain: v3(gl.tint.gain),
    uBladeBase: v3(gl.blade.base),
    uBladeMidA: v3(gl.blade.mid[0]),
    uBladeMidB: v3(gl.blade.mid[1]),
    uBladeTipA: v3(gl.blade.tip[0]),
    uBladeTipB: v3(gl.blade.tip[1]),
  };
  const material = (geo: boolean): ShaderMaterial => {
    const m = tagMaterial(new ShaderMaterial({
      vertexShader: GRASS_VERT,
      fragmentShader: GRASS_FRAG,
      side: DoubleSide,
      fog: true,
      defines: geo ? { GEO: "" } : {},
      uniforms: UniformsUtils.merge([UniformsLib.fog, uniforms as unknown as Record<string, { value: unknown }>]),
    }), "pasto");
    // The two materials share the same uniform objects (merge clones them): if one moves, both move.
    for (const [k, u] of Object.entries(uniforms)) m.uniforms[k] = u;
    m.customProgramCacheKey = () => `pasto-${geo ? "hojas" : "tarjeta"}`;
    return m;
  };
  const mesh = (geo: BufferGeometry, mat: ShaderMaterial, name: string): InstancedMesh => {
    geo.setAttribute("aData", new InstancedBufferAttribute(new Float32Array(count * 4), 4).setUsage(DynamicDrawUsage));
    const im = new InstancedMesh(geo, mat, count);
    im.frustumCulled = false; // selectGrass already chose what is seen
    im.count = 0;
    im.name = name;
    return im;
  };
  const cardMat = material(false);
  const bladeMat = material(true);
  const cards = mesh(grassCardGeometry(), cardMat, "pasto:tarjetas");
  const blades = mesh(bladeClumpGeometry(spec.blades), bladeMat, "pasto:hojas");
  const group = new Group();
  group.name = "pasto";
  group.add(cards, blades);

  const gate = new CullGate();
  const frustum = new Frustum();
  const pv = new Matrix4();
  const camPos = new Vector3();
  const target = new Vector3();
  let selection: GrassSelection = { cards: [], blades: [] };

  const upload = (im: InstancedMesh, list: readonly number[]): void => {
    const attr = im.geometry.getAttribute("aData") as InstancedBufferAttribute;
    const out = attr.array as Float32Array;
    list.forEach((n, k) => out.set(base.subarray(n * 4, n * 4 + 4), k * 4));
    im.count = list.length;
    attr.needsUpdate = true;
  };

  const grass: Grass = {
    group,
    cards,
    blades,
    base,
    uniforms,
    gate,
    uploads: 0,
    get selection() {
      return selection;
    },
    update(camera, px, pz, t, dt, still) {
      uniforms.uWind.value = still ? 0 : 1;
      if (!still) uniforms.uTime.value += dt;
      const radius = grassRadiusAt(spec.radius, t);
      const visible = radius >= GRASS.shrink.minRadius;
      cards.visible = blades.visible = visible;
      camera.updateMatrixWorld();
      camera.getWorldPosition(camPos);
      const { yawDeg, pitchDeg } = viewAngles(camera.matrixWorld);
      const distance = camPos.distanceTo(target.set(px, 0, pz).setY(sampleHeightDirt(heightDirt, px, pz).height));
      let uploaded = false;
      if (gate.shouldUpdate({ x: px, z: pz, yawDeg, pitchDeg, distance })) {
        // The center, the radius and the player are fixed at the walk: what was chosen and what is drawn use the same ones.
        const e = camera.matrixWorld.elements;
        const fl = Math.hypot(e[8] as number, e[10] as number) || 1;
        const cx = px - ((e[8] as number) / fl) * radius * GRASS.ahead;
        const cz = pz - ((e[10] as number) / fl) * radius * GRASS.ahead;
        uniforms.uCenter.value.set(cx, 0, cz);
        uniforms.uRadius.value = radius;
        uniforms.uPlayer.value.set(px, pz);
        frustum.setFromProjectionMatrix(pv.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        const drawMax = Math.max(1, Math.floor(count * (radius / spec.radius) ** 2));
        const next = visible ? selectGrass(base, drawMax, spec.nearRadius, heightDirt, { cx, cz, radius, px, pz, frustum }) : { cards: [], blades: [] };
        if (!sameList(next.cards, selection.cards) || !sameList(next.blades, selection.blades)) {
          upload(cards, next.cards);
          upload(blades, next.blades);
          selection = next;
          grass.uploads += 1;
          uploaded = true;
        }
      }
      const c = uniforms.uCenter.value;
      input.bed?.set(c.x, c.z, uniforms.uRadius.value, visible ? grassBedOn(t) : 0);
      return uploaded;
    },
    dispose() {
      for (const im of [cards, blades]) {
        im.geometry.dispose();
        im.dispose();
      }
      cardMat.dispose();
      bladeMat.dispose();
      atlas.dispose();
    },
  };
  return grass;
}

/** The GLSL of the grass vertices (the AC75 tests inspect it). */
export const GRASS_VERTEX_SHADER = GRASS_VERT;
