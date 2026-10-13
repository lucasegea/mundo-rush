// world/budget/renderStats.ts — contadores reales del renderer para la instantánea del modo director (plan estetica-c
// M6): llamadas, triángulos, texturas y geometrías de `renderer.info`, y los FPS medidos, para que el operador midan
// sin navegador automatizado (D-016). SOLO DESARROLLO: GameCanvas lo carga con import() bajo la doble llave del modo
// director (`import.meta.env.DEV && VITE_LG_DIRECTOR === "1"`) y boot/dev.ts lee la última muestra; en `vite build` la
// rama se elimina y este módulo no se emite (check:dev-only falla si su marcador aparece en un dist).
//
// Un cuadro puede tener varias pasadas (sombra de `high`, EffectComposer): con `autoReset` apagado, `info.render` suma
// todas las del cuadro; la sonda lee el cuadro anterior entero al empezar el siguiente y recién ahí pone en cero.
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";

/** Marcador de solo-desarrollo (check:dev-only lo busca en el dist). */
export const RENDER_STATS_MARKER = "__lg_director:render-stats";

/** Ventana de la muestra de FPS. */
export const SAMPLE_WINDOW_MS = 1000;

export interface RenderStatsSample {
  /** Llamadas de dibujo del último cuadro completo (todas sus pasadas). */
  drawCalls: number;
  /** Triángulos del último cuadro completo (todas sus pasadas). */
  triangles: number;
  /** Texturas y geometrías vivas en la GPU. */
  textures: number;
  geometries: number;
  /** Cuadros por segundo dibujados en la última ventana (con el tope de cuadros aplicado). */
  fps: number;
}

/** Lo que se lee de `WebGLRenderer.info` (inyectable en los tests). */
export interface RendererInfoLike {
  render: { calls: number; triangles: number };
  memory: { textures: number; geometries: number };
}

/** Una muestra a partir de lo acumulado en un cuadro y de los cuadros contados en la ventana. */
export function sampleRenderStats(info: RendererInfoLike, frames: number, windowMs: number): RenderStatsSample {
  return {
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
    textures: info.memory.textures,
    geometries: info.memory.geometries,
    fps: windowMs > 0 ? Math.round((frames * 1000 * 10) / windowMs) / 10 : 0,
  };
}

let latest: RenderStatsSample | null = null;

/** La última muestra (null si el canvas no dibujó todavía). La lee el modo director por boot/dev.ts. */
export const readRenderStats = (): RenderStatsSample | null => latest;

/** La sonda: va dentro del <Canvas>; corre antes que todo lo demás de cada cuadro (prioridad muy negativa). */
export default function RenderStatsProbe() {
  const gl = useThree((s) => s.gl);
  const win = useRef({ start: 0, frames: 0, fps: 0 });
  useEffect(() => {
    const prev = gl.info.autoReset;
    gl.info.autoReset = false;
    gl.info.reset();
    // El marcador queda en el DOM del canvas: si este módulo llegara a un build, check:dev-only lo encuentra en el dist.
    gl.domElement.setAttribute("data-lg-render-stats", RENDER_STATS_MARKER);
    return () => {
      gl.info.autoReset = prev;
      gl.domElement.removeAttribute("data-lg-render-stats");
      latest = null;
    };
  }, [gl]);
  useFrame(() => {
    const now = performance.now();
    const w = win.current;
    if (w.start === 0) w.start = now;
    w.frames += 1;
    if (now - w.start >= SAMPLE_WINDOW_MS) {
      w.fps = sampleRenderStats(gl.info, w.frames, now - w.start).fps;
      w.start = now;
      w.frames = 0;
    }
    // Lo acumulado es el cuadro anterior entero (todas sus pasadas): se guarda y se pone en cero para este.
    latest = { ...sampleRenderStats(gl.info, 0, 0), fps: w.fps };
    gl.info.reset();
  }, -1000);
  return null;
}
