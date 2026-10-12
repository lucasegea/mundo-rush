// world/water/waterMaterial.ts — el agua con shader propio (propuesta C §7, plan estetica-c M1 ítem 9): bandas de
// `agua` y `agua-honda` y brillos que corren, con la niebla y el tono incluidos (el shader no usa los de three). Una sola
// instancia (clase `agua` del registro). Con "reducir movimiento" el tiempo no avanza y los brillos quedan quietos.
import { Color, ShaderMaterial } from "three";
import { PALETTE } from "../materials/palette";
import { tagMaterial } from "../materials/registry";
import { FOG } from "../lighting/params";

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

let water: ShaderMaterial | null = null;

export function waterMaterial(): ShaderMaterial {
  water ??= tagMaterial(
    new ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uA: { value: new Color(PALETTE.agua) },
        uB: { value: new Color(PALETTE["agua-honda"]) },
        uH: { value: new Color(PALETTE.brillo) },
        uFog: { value: new Color(PALETTE.bruma) },
        uFogNear: { value: FOG.near },
        uFogFar: { value: FOG.far },
      },
      vertexShader: VERT,
      fragmentShader: FRAG,
    }),
    "agua",
  );
  return water;
}

/** Avanza el tiempo del agua; con "reducir movimiento" no se mueve. */
export function tickWater(m: ShaderMaterial, dtSec: number, reduceMotion: boolean): void {
  if (reduceMotion) return;
  const u = m.uniforms["uTime"];
  if (u) u.value = (u.value as number) + dtSec;
}
