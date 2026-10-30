// Open-world-3d T8: el pasto V6, sin GPU. AC48 (conteos y radios por tier, una tarjeta es un quad y una hoja 3
// triángulos, 2 llamadas de clase `pasto` con niebla, la tarjeta nunca de canto de 6 a 82°, viento 0 con movimiento
// reducido, nada fuera de los límites más la falda ni sobre tierra > 0,5, una sola RG16F hecha en world/terrain), AC49
// (subidas del búfer de instancias con un reloj de prueba) y AC75 (la envoltura de la CPU y la del GLSL son la misma).
import { DEFAULT_LOOK, mulberry32, OPEN_WORLD_DENSITY, WORLD_TIERS } from "@lg/art";
import { prepareDiorama, type DioramaLayout, type DioramaRuntime } from "@lg/core";
import { HalfFloatType, LinearFilter, PerspectiveCamera, RGFormat, ShaderMaterial, type Material, type Texture } from "three";
import { describe, expect, test } from "vitest";
import { buildDioramaScene, type DioramaScene } from "../src/world/dioramas/scene";
import { materialKind } from "../src/world/materials/registry";
import { cardUp, GRASS, GRASS_VERTEX_SHADER, grassRadiusAt, type Grass } from "../src/world/nature/grass";
import { GRASS_TILE_SPAN, GRASS_WRAP_GLSL, grassWrap } from "../src/world/nature/grassWrap";
import { sampleHeightDirt } from "../src/world/terrain/heightTexture";
import { compiledUniverseClientContent } from "./helpers";

const layouts = compiledUniverseClientContent("U-GALEANO")["dioramas.json"] as DioramaLayout[];
const muelle = (): DioramaRuntime => prepareDiorama(layouts.find((d) => d.id === "muelle") as DioramaLayout);
const sceneAt = (tier: (typeof WORLD_TIERS)[number]): DioramaScene => buildDioramaScene(muelle(), tier === "low" ? "reduced" : "full", tier, DEFAULT_LOOK);
const grassOf = (s: DioramaScene): Grass => {
  if (!s.grass) throw new Error("el muelle tiene relieve: debe tener pasto");
  return s.grass;
};

/** La cámara de tercera persona del juego: `dist` m detrás del jugador con `pitchDeg` de elevación, mirando al jugador. */
function placeCamera(cam: PerspectiveCamera, px: number, py: number, pz: number, yawDeg: number, pitchDeg = 17, dist = 6): void {
  const y = (yawDeg * Math.PI) / 180;
  const p = (pitchDeg * Math.PI) / 180;
  cam.position.set(px + Math.sin(y) * Math.cos(p) * dist, py + 1.2 + Math.sin(p) * dist, pz + Math.cos(y) * Math.cos(p) * dist);
  cam.lookAt(px, py + 1.2, pz);
  cam.updateMatrixWorld();
}

const camera = (): PerspectiveCamera => new PerspectiveCamera(50, 16 / 9, 0.1, 2000);

describe("AC48: el pasto por tier", () => {
  test("conteos, radios y hojas de DENSITY; tarjeta de un quad, hoja de 3 triángulos; 2 llamadas `pasto` con niebla", () => {
    expect(OPEN_WORLD_DENSITY.low.grass).toEqual({ clumps: 1000, radius: 15, nearRadius: 4.5, blades: 8 });
    expect(OPEN_WORLD_DENSITY.medium.grass).toEqual({ clumps: 2300, radius: 24, nearRadius: 6, blades: 8 });
    expect(OPEN_WORLD_DENSITY.high.grass).toEqual({ clumps: 7000, radius: 34, nearRadius: 8, blades: 10 });
    for (const tier of WORLD_TIERS) {
      const s = sceneAt(tier);
      const g = grassOf(s);
      const spec = OPEN_WORLD_DENSITY[tier].grass;
      expect(g.base.length / 4, tier).toBe(spec.clumps); // DEFAULT_LOOK: multiplicador 1
      expect(g.uniforms.uRadius.value).toBe(spec.radius);
      expect(g.uniforms.uNearR.value).toBe(spec.nearRadius);
      expect(g.cards.geometry.getAttribute("position").count).toBe(4);
      expect(g.cards.geometry.index?.count).toBe(6);
      expect(g.blades.geometry.getAttribute("position").count).toBe(spec.blades * 5);
      expect(g.blades.geometry.index?.count).toBe(spec.blades * 3 * 3);
      const meshes: { material: Material }[] = [];
      g.group.traverse((o) => { if ((o as { material?: Material }).material) meshes.push(o as never); });
      expect(meshes.length).toBe(2);
      for (const m of meshes) {
        expect(m.material).toBeInstanceOf(ShaderMaterial);
        expect(materialKind(m.material)).toBe("pasto");
        expect((m.material as ShaderMaterial).fog).toBe(true);
        expect((m.material as ShaderMaterial).fragmentShader).toContain("#include <fog_fragment>");
        expect((m.material as ShaderMaterial).vertexShader).toContain("#include <fog_vertex>");
      }
      s.dispose();
    }
  });

  test("la tarjeta mira a la cámara: |cos(normal, rayo de vista)| >= 0,7 de 6 a 82° de elevación", () => {
    let worst = 1;
    for (let e = 6; e <= 82; e += 0.5) {
      const el = (e * Math.PI) / 180;
      for (const az of [0, 37, 128, 251]) {
        const hx = Math.sin((az * Math.PI) / 180);
        const hz = Math.cos((az * Math.PI) / 180);
        const up = cardUp(hx, hz, el);
        const right: [number, number, number] = [-hz, 0, hx];
        const n = [right[1] * up[2] - right[2] * up[1], right[2] * up[0] - right[0] * up[2], right[0] * up[1] - right[1] * up[0]];
        const ray = [-hx * Math.cos(el), -Math.sin(el), -hz * Math.cos(el)]; // de la cámara a la mata
        const len = Math.hypot(n[0] as number, n[1] as number, n[2] as number);
        worst = Math.min(worst, Math.abs(((n[0] as number) * (ray[0] as number) + (n[1] as number) * (ray[1] as number) + (n[2] as number) * (ray[2] as number)) / len));
      }
    }
    expect(worst).toBeGreaterThanOrEqual(0.7);
    // El sombreador usa la misma regla: la punta hacia atrás (signo menos) y los mismos factores.
    expect(GRASS_VERTEX_SHADER).toContain(`clamp(atan(toC.y, hl), 0.0, ${GRASS.lean.maxElevation.toFixed(4)}) * ${GRASS.lean.factor.toFixed(4)}`);
    expect(GRASS_VERTEX_SHADER).toContain("vec3 up = vec3(-hz.x * sin(lean), cos(lean), -hz.y * sin(lean));");
  });

  test("viento: 1 en movimiento, 0 con movimiento reducido (still)", () => {
    const s = sceneAt("medium");
    const g = grassOf(s);
    const cam = camera();
    const sp = s.terrain.heightAt(-48, 30);
    placeCamera(cam, -48, sp, 30, 0);
    g.update(cam, -48, 30, 0, 1 / 60, false);
    expect(g.uniforms.uWind.value).toBe(1);
    const t0 = g.uniforms.uTime.value;
    g.update(cam, -48, 30, 0, 1 / 60, true);
    expect(g.uniforms.uWind.value).toBe(0);
    expect(g.uniforms.uTime.value).toBe(t0);
    s.dispose();
  });

  test("ninguna mata subida cae fuera de los límites más la falda ni donde la tierra pasa 0,5 (y el corte no es vacuo)", () => {
    const d = muelle();
    for (const tier of WORLD_TIERS) {
      const s = buildDioramaScene(d, tier === "low" ? "reduced" : "full", tier, DEFAULT_LOOK);
      const g = grassOf(s);
      const map = s.heightDirt;
      expect(map).not.toBeNull();
      const cam = camera();
      const ext = s.terrain.extent;
      let rejectedForDirt = 0;
      let uploaded = 0;
      // La aparición, el camino del muelle, cada NPC y dos esquinas (el disco toca el borde de la textura).
      const spots = [[d.spawn.x, d.spawn.z], ...d.npcs.map((n) => [n.x, n.z]), [d.bounds.minX, d.bounds.minZ], [d.bounds.maxX, d.bounds.maxZ]] as [number, number][];
      for (const [px, pz] of spots) {
        for (const yaw of [0, 90, 180, 270]) {
          placeCamera(cam, px, s.terrain.heightAt(px, pz), pz, yaw);
          g.gate.reset();
          g.update(cam, px, pz, 0, 1 / 60, true);
          const c = g.uniforms.uCenter.value;
          const r = g.uniforms.uRadius.value;
          for (const n of [...g.selection.cards, ...g.selection.blades]) {
            const [x, z] = grassWrap(g.base[n * 4] as number, g.base[n * 4 + 1] as number, c.x, c.z, r);
            expect(x >= ext.minX && x <= ext.maxX && z >= ext.minZ && z <= ext.maxZ, `${tier} ${x},${z}`).toBe(true);
            expect(sampleHeightDirt(map as never, x, z).dirt, `${tier} tierra en ${x},${z}`).toBeLessThan(0.5); // AC48: el literal del plan
            uploaded += 1;
          }
          for (let n = 0; n < g.base.length / 4; n++) {
            const [x, z] = grassWrap(g.base[n * 4] as number, g.base[n * 4 + 1] as number, c.x, c.z, r);
            if ((x - c.x) ** 2 + (z - c.z) ** 2 <= r * r && sampleHeightDirt(map as never, x, z).dirt >= GRASS.dirt.cut) rejectedForDirt += 1;
          }
        }
      }
      expect(uploaded, tier).toBeGreaterThan(100);
      expect(rejectedForDirt, `${tier}: hay matas en el disco sobre el camino (el corte de tierra hace algo)`).toBeGreaterThan(0);
      // El sombreador también las deja en escala 0 desde la tierra 0,5.
      expect(GRASS.dirt.cut).toBe(0.5);
      expect(GRASS_VERTEX_SHADER).toContain(`smoothstep(${GRASS.dirt.from.toFixed(4)}, 0.5000, s.y)`);
      s.dispose();
    }
  });

  test("la textura de altura es RG16F con filtro lineal, la única de la escena, hecha en world/terrain", () => {
    const s = sceneAt("high");
    const rg = new Set<Texture>();
    s.root.traverse((o) => {
      const m = (o as { material?: Material | Material[] }).material;
      for (const x of Array.isArray(m) ? m : m ? [m] : []) {
        for (const u of Object.values((x as ShaderMaterial).uniforms ?? {})) {
          const t = (u as { value?: Texture }).value;
          if (t?.isTexture && t.format === RGFormat && t.type === HalfFloatType) rg.add(t);
        }
      }
    });
    expect([...rg]).toEqual([s.heightDirt?.texture]);
    const t = s.heightDirt?.texture as Texture;
    expect([t.minFilter, t.magFilter]).toEqual([LinearFilter, LinearFilter]);
    expect(t.name).toBe("pasto/altura");
    const sources = import.meta.glob("../src/world/**/*.{ts,tsx}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const makers = Object.entries(sources).filter(([, src]) => /\bHalfFloatType\b/.test(src.replace(/\/\/.*$/gm, ""))).map(([p]) => p.replace("../src/world/", ""));
    expect(makers).toEqual(["terrain/heightTexture.ts"]);
    s.dispose();
  });
});

describe("AC49: subidas del búfer de instancias del pasto con un reloj de prueba", () => {
  const setup = () => {
    const s = sceneAt("medium");
    const g = grassOf(s);
    const cam = camera();
    const d = muelle();
    const at = { x: d.spawn.x, z: d.spawn.z, yaw: 20 };
    const frame = (x: number, z: number, yaw: number): boolean => {
      placeCamera(cam, x, s.terrain.heightAt(x, z), z, yaw);
      return g.update(cam, x, z, 0, 1 / 60, true);
    };
    frame(at.x, at.z, at.yaw); // la primera elección
    return { s, g, frame, at };
  };

  test("quieto 60 cuadros 0; giro de 4° 0; giro de 6° 1; paso de 1,2 m 1", () => {
    const { s, g, frame, at } = setup();
    const u0 = g.uploads;
    expect(u0).toBe(1);
    for (let i = 0; i < 60; i++) frame(at.x, at.z, at.yaw);
    expect(g.uploads - u0).toBe(0);
    frame(at.x, at.z, at.yaw + 4); // cuadro del giro de 4°: bajo CULL_TURN_DEG
    expect(g.uploads - u0).toBe(0);
    frame(at.x, at.z, at.yaw + 4 + 6); // 6° más: 10° desde lo subido
    expect(g.uploads - u0).toBe(1);
    for (let i = 0; i < 30; i++) frame(at.x, at.z, at.yaw + 10); // quieto donde subió: nada
    expect(g.uploads - u0).toBe(1);
    frame(at.x + 1.2, at.z, at.yaw + 10);
    expect(g.uploads - u0).toBe(2);
    for (let i = 0; i < 30; i++) frame(at.x + 1.2, at.z, at.yaw + 10);
    expect(g.uploads - u0).toBe(2);
    s.dispose();
  });

  test("un giro de 6° desde el reposo sube una vez", () => {
    const { s, g, frame, at } = setup();
    const u0 = g.uploads;
    frame(at.x, at.z, at.yaw + 6);
    for (let i = 0; i < 10; i++) frame(at.x, at.z, at.yaw + 6);
    expect(g.uploads - u0).toBe(1);
    s.dispose();
  });

  test("un giro de 4° sostenido: el portón recorre una vez al asentarse (T7) y sube solo si la elección cambió", () => {
    // Las dos conductas, explícitas (manager T8): el cuadro del giro no recorre ni sube; el segundo cuadro quieto recorre
    // (el reposo de CullGate, para que una pose fija dé siempre los mismos triángulos) y sube si y solo si las matas
    // elegidas en el reposo no son las subidas. Después, quieto, nunca más.
    const { s, g, frame, at } = setup();
    const before = g.selection;
    const r0 = g.gate.runs;
    const u0 = g.uploads;
    expect(frame(at.x, at.z, at.yaw + 4)).toBe(false);
    expect(g.gate.runs - r0).toBe(0);
    frame(at.x, at.z, at.yaw + 4);
    expect(g.gate.runs - r0).toBe(1);
    const changed = before.cards.join() !== g.selection.cards.join() || before.blades.join() !== g.selection.blades.join();
    expect(g.uploads - u0).toBe(changed ? 1 : 0);
    for (let i = 0; i < 60; i++) frame(at.x, at.z, at.yaw + 4);
    expect(g.gate.runs - r0).toBe(1);
    expect(g.uploads - u0).toBe(changed ? 1 : 0);
    s.dispose();
  });

  test("al asentarse en la misma pose el recorrido no sube nada (recorrer no es subir)", () => {
    const { s, g, frame, at } = setup();
    const u0 = g.uploads;
    g.gate.reset(); // fuerza un recorrido en la misma pose: la elección es la misma
    frame(at.x, at.z, at.yaw);
    expect(g.uploads - u0).toBe(0);
    s.dispose();
  });

  test("el disco se achica con el zoom desde t 0,36 y se apaga por debajo de 4,5 m", () => {
    expect(grassRadiusAt(24, 0)).toBe(24);
    expect(grassRadiusAt(24, 0.36)).toBe(24);
    expect(grassRadiusAt(24, 0.5)).toBeLessThan(24);
    expect(grassRadiusAt(24, 1)).toBeCloseTo(24 * 0.07, 6);
    const s = sceneAt("medium");
    const g = grassOf(s);
    const cam = camera();
    placeCamera(cam, -48, s.terrain.heightAt(-48, 30), 30, 0, 80, 300);
    g.update(cam, -48, 30, 1, 1 / 60, true);
    expect(g.cards.visible).toBe(false);
    expect(g.cards.count).toBe(0);
    s.dispose();
  });
});

/** Intérprete del subconjunto GLSL del fragmento de envoltura: números, a, c, r, vec2, mod, + - * / y paréntesis. */
type Val = number | [number, number];
function evalWrapGlsl(src: string, env: { a: [number, number]; c: [number, number]; r: number }): [number, number] {
  const body = /\{\s*return\s+([^;]+);\s*\}/.exec(src)?.[1];
  if (!body) throw new Error("el fragmento no es `{ return <expr>; }`");
  const tokens: string[] = [];
  const re = /\s*(\d+\.\d+|\d+|[A-Za-z_]\w*|[-+*/(),])/y;
  let i = 0;
  while (i < body.length) {
    re.lastIndex = i;
    const m = re.exec(body);
    if (!m) throw new Error(`token no permitido en "${body.slice(i)}"`);
    tokens.push(m[1] as string);
    i = re.lastIndex;
    if (/^\s*$/.test(body.slice(i))) break;
  }
  const allowed = new Set(["a", "c", "r", "vec2", "mod", "+", "-", "*", "/", "(", ")", ","]);
  for (const t of tokens) if (!allowed.has(t) && !/^\d+(\.\d+)?$/.test(t)) throw new Error(`token no permitido: ${t}`);
  const fr = Math.fround;
  const op = (x: Val, y: Val, fn: (p: number, q: number) => number): Val => {
    if (typeof x === "number" && typeof y === "number") return fr(fn(x, y));
    const xv: [number, number] = typeof x === "number" ? [x, x] : x;
    const yv: [number, number] = typeof y === "number" ? [y, y] : y;
    return [fr(fn(xv[0], yv[0])), fr(fn(xv[1], yv[1]))];
  };
  let k = 0;
  const peek = (): string | undefined => tokens[k];
  const eat = (t?: string): string => {
    const x = tokens[k++];
    if (x === undefined || (t !== undefined && x !== t)) throw new Error(`se esperaba ${t ?? "algo"} y vino ${String(x)}`);
    return x;
  };
  const args = (): Val[] => {
    eat("(");
    const out = [expr()];
    while (peek() === ",") { eat(","); out.push(expr()); }
    eat(")");
    return out;
  };
  function factor(): Val {
    const t = eat();
    if (t === "-") return op(0, factor(), (p, q) => p - q);
    if (t === "(") { const v = expr(); eat(")"); return v; }
    if (/^\d/.test(t)) return fr(Number(t));
    if (t === "a") return env.a;
    if (t === "c") return env.c;
    if (t === "r") return fr(env.r);
    if (t === "vec2") {
      const a = args().map((v) => (typeof v === "number" ? v : NaN));
      return a.length === 1 ? [a[0] as number, a[0] as number] : [a[0] as number, a[1] as number];
    }
    if (t === "mod") {
      const [x, y] = args() as [Val, Val];
      return op(x, y, (p, q) => fr(p - fr(q * Math.floor(fr(p / q)))));
    }
    throw new Error(`token inesperado ${t}`);
  }
  function term(): Val {
    let v = factor();
    while (peek() === "*" || peek() === "/") v = eat() === "*" ? op(v, factor(), (p, q) => p * q) : op(v, factor(), (p, q) => p / q);
    return v;
  }
  function expr(): Val {
    let v = term();
    while (peek() === "+" || peek() === "-") v = eat() === "+" ? op(v, term(), (p, q) => p + q) : op(v, term(), (p, q) => p - q);
    return v;
  }
  const out = expr();
  if (k !== tokens.length || typeof out === "number") throw new Error("el fragmento no da un vec2");
  return out;
}

describe("AC75: la envoltura de la CPU y la del GLSL son la misma fórmula", () => {
  test("1.000 matas sembradas por 20 posiciones (también a varias baldosas): iguales a 1e-4 m", () => {
    const rnd = mulberry32(4242);
    const pts = Array.from({ length: 1000 }, () => [Math.fround(rnd() * 2 - 1), Math.fround(rnd() * 2 - 1)] as [number, number]);
    const centres: [number, number][] = [[0, 0], [-48, 30], [12.3, -7.7], [69.9, 49.9], [-70, -50]];
    for (let i = 0; i < 15; i++) centres.push([(rnd() - 0.5) * 2 * 6 * GRASS_TILE_SPAN * 34, (rnd() - 0.5) * 2 * 6 * GRASS_TILE_SPAN * 34]);
    expect(centres.length).toBe(20);
    expect(Math.max(...centres.map(([x, z]) => Math.max(Math.abs(x), Math.abs(z))))).toBeGreaterThan(3 * GRASS_TILE_SPAN * 34);
    let worst = 0;
    for (const [cx, cz] of centres) {
      for (const r of [34, 24, 15, 4.7]) {
        for (const [ax, az] of pts) {
          const [x, z] = grassWrap(ax, az, cx, cz, r);
          const [gx, gz] = evalWrapGlsl(GRASS_WRAP_GLSL, { a: [ax, az], c: [Math.fround(cx), Math.fround(cz)], r });
          worst = Math.max(worst, Math.abs(x - gx), Math.abs(z - gz));
          // Siempre dentro del cuadrado centrado en el disco.
          expect(Math.abs(x - cx) <= r + 1e-9 && Math.abs(z - cz) <= r + 1e-9).toBe(true);
        }
      }
    }
    expect(worst).toBeLessThanOrEqual(1e-4);
  });

  test("el intérprete falla con cualquier token fuera del subconjunto", () => {
    const env = { a: [0.5, 0.5] as [number, number], c: [0, 0] as [number, number], r: 10 };
    expect(() => evalWrapGlsl("vec2 f() { return c + floor(a); }", env)).toThrow(/token no permitido: floor/);
    expect(() => evalWrapGlsl("vec2 f() { return c + fract(a); }", env)).toThrow(/token no permitido/);
    expect(() => evalWrapGlsl("vec2 f() { return c + a.x; }", env)).toThrow(/token no permitido/);
    expect(evalWrapGlsl("vec2 f() { return c + a * r; }", env)).toEqual([5, 5]);
  });

  test("el sombreador incluye el fragmento y no tiene otra aritmética de envoltura", () => {
    expect(GRASS_VERTEX_SHADER).toContain(GRASS_WRAP_GLSL);
    const rest = GRASS_VERTEX_SHADER.replace(GRASS_WRAP_GLSL, "");
    expect(rest).not.toMatch(/\bmod\s*\(/);
    expect(rest.match(/grassWrap\(/g)?.length).toBe(1);
    const sources = import.meta.glob("../src/world/nature/grass.ts", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    const src = Object.values(sources)[0] as string;
    expect(src).not.toMatch(/glslMod|Math\.floor\([^)]*\/\s*\(?\s*(span|2\s*\*)/);
    expect(src).toMatch(/import \{ GRASS_WRAP_GLSL, grassWrap \} from "\.\/grassWrap"/);
  });
});
