// world/water/waterMaterial.ts — water with its own shader (proposal C §7, plan estetica-c M1 item 9): bands of
// `agua` and `agua-honda` and moving highlights, with fog and tone included (the shader does not use three ones). A single
// instance per look (class `agua` of the registry). With "reduce motion" time does not advance and the highlights stay still.
// Open-world-3d T7b (D-839, D-842): the colors (bands, highlight, own haze) are look tokens in its palette, and the
// starting fog is the look one at t = 0 (Lighting moves it each frame, before the first draw). Different looks
// give different materials of the SAME shader: they differ only in uniforms.
import { Color, ShaderMaterial } from "three";
import type { LookId, WorldLook } from "@lg/art";
import { tagMaterial } from "../materials/registry";
import { fogFor } from "../sky/palette";

const VERT = /* glsl */ `
varying vec2 vW;
varying float vD;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xz;
  vec4 mv = viewMatrix * w;
  vD = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uA;
uniform vec3 uB;
uniform vec3 uH;
uniform vec3 uFog;
uniform float uFogNear;
uniform float uFogFar;
varying vec2 vW;
varying float vD;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float a = n(vW * 0.35 + vec2(uTime * 0.15, uTime * 0.05));
  vec3 c = mix(uB, uA, smoothstep(0.25, 0.75, a));
  float s = n(vW * vec2(3.6, 1.0) + vec2(-uTime * 0.5, uTime * 0.15)) * n(vW * vec2(1.3, 3.0) + vec2(uTime * 0.2, -uTime * 0.3));
  c = mix(c, uH, smoothstep(0.5, 0.56, s) * 0.6);
  float f = smoothstep(uFogNear, uFogFar, vD);
  gl_FragColor = vec4(mix(c, uFog, f), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const waters = new Map<LookId, ShaderMaterial>();

/** The water of a look (one instance per look, created the first time it is requested). */
export function waterMaterial(look: WorldLook): ShaderMaterial {
  let water = waters.get(look.id);
  if (!water) {
    const c = (token: keyof WorldLook["palette"]): Color => new Color(look.palette[token]);
    const fog = fogFor(look.fog.range, 1, 0);
    water = tagMaterial(
      new ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uA: { value: c(look.water.shallow) },
          uB: { value: c(look.water.deep) },
          uH: { value: c(look.water.glint) },
          uFog: { value: c(look.water.fog) },
          uFogNear: { value: fog.near },
          uFogFar: { value: fog.far },
        },
        vertexShader: VERT,
        fragmentShader: FRAG,
      }),
      "agua",
    );
    waters.set(look.id, water);
  }
  return water;
}

/** Advances the water time; with "reduce motion" it does not move. */
export function tickWater(m: ShaderMaterial, dtSec: number, reduceMotion: boolean): void {
  if (reduceMotion) return;
  const u = m.uniforms["uTime"];
  if (u) u.value = (u.value as number) + dtSec;
}

/** The water own fog follows the scene one (D-208: scales with the camera distance). */
export function setWaterFog(m: ShaderMaterial, near: number, far: number): void {
  const n = m.uniforms["uFogNear"];
  const f = m.uniforms["uFogFar"];
  if (n) n.value = near;
  if (f) f.value = far;
}
